import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createMercadoPagoPreference, getMercadoPagoPayment, type MercadoPagoPayment } from "@/lib/mercado-pago";
import { NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE, purchaseAttributionFromCookie } from "@/lib/noma-traffic";
import { absoluteUrl } from "@/lib/utils";

const ASSISTED_PURCHASE_THRESHOLD = 10_000;
const MAX_CHECKOUT_QUANTITY = 5;

type CheckoutInput = {
  productId: string;
  offerId: string;
  variantId?: string | null;
  quantity: number;
  idempotencyKey: string;
  attributionCookie?: string | null;
  sessionId?: string | null;
};

type CheckoutContext = {
  createPreference?: typeof createMercadoPagoPreference;
  now?: Date;
};

type WebhookContext = {
  getPayment?: typeof getMercadoPagoPayment;
  now?: Date;
};

export type CheckoutResult =
  | { type: "checkout"; orderNumber: string; redirectUrl: string }
  | { type: "assisted_purchase"; reason: "high_value" | "shipping_required"; message: string }
  | { type: "error"; code: string; status: number; message: string };

type OfferForCheckout = Prisma.ProductMarketOfferGetPayload<{
  include: {
    product: true;
    variants: true;
  };
}>;

export async function createMercadoPagoCheckout(input: CheckoutInput, context: CheckoutContext = {}): Promise<CheckoutResult> {
  const quantity = normalizeQuantity(input.quantity);
  if (!quantity) return publicError("invalid_quantity", 400, "Quantidade invalida.");
  const idempotencyKey = sanitizeText(input.idempotencyKey, 120);
  if (!idempotencyKey || idempotencyKey.length < 12) return publicError("invalid_idempotency_key", 400, "Requisicao invalida.");

  const offer = await db.productMarketOffer.findFirst({
    where: { id: sanitizeText(input.offerId, 120) ?? "", productId: sanitizeText(input.productId, 120) ?? "" },
    include: { product: true, variants: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
  });
  const validation = validateOfferForCheckout(offer, input.variantId);
  if (validation.type !== "valid") return validation.result;

  const { variant, unitPrice, stock } = validation;
  const subtotal = roundMoney(unitPrice * quantity);
  const shippingAmount = offer!.shippingCost == null ? null : roundMoney(Number(offer!.shippingCost));
  if (subtotal >= ASSISTED_PURCHASE_THRESHOLD) {
    return assisted("high_value", "Esta compra precisa de atendimento personalizado.");
  }
  if (shippingAmount == null) {
    return assisted("shipping_required", "Esta compra precisa de atendimento para confirmar o frete.");
  }
  const total = roundMoney(subtotal + shippingAmount);
  if (total >= ASSISTED_PURCHASE_THRESHOLD) {
    return assisted("high_value", "Esta compra precisa de atendimento personalizado.");
  }
  if (stock != null && quantity > stock) return publicError("insufficient_stock", 409, "Estoque indisponivel para a quantidade solicitada.");

  const existing = await db.order.findUnique({ where: { checkoutIdempotencyKey: idempotencyKey } });
  if (existing) {
    if (!matchesExistingOrder(existing, { offer: offer!, variantId: variant?.id ?? null, quantity, total })) {
      return publicError("idempotency_conflict", 409, "Esta tentativa de compra ja foi usada em outra selecao.");
    }
    if (existing.mercadoPagoCheckoutUrl) {
      return { type: "checkout", orderNumber: existing.publicOrderNumber, redirectUrl: existing.mercadoPagoCheckoutUrl };
    }
  }

  const order = existing ?? await createPendingOrder({
    offer: offer!,
    variant,
    unitPrice,
    quantity,
    subtotal,
    shippingAmount,
    total,
    idempotencyKey,
    attributionCookie: input.attributionCookie,
    sessionId: input.sessionId,
  });

  const preference = await (context.createPreference ?? createMercadoPagoPreference)({
    idempotencyKey,
    body: buildPreferenceBody(order, offer!, variant, unitPrice, quantity, shippingAmount),
  });

  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      mercadoPagoPreferenceId: preference.id,
      mercadoPagoCheckoutUrl: preference.init_point,
    },
  });

  return { type: "checkout", orderNumber: updated.publicOrderNumber, redirectUrl: preference.init_point };
}

export async function getPublicOrder(publicOrderNumber: string) {
  const orderNumber = sanitizeText(publicOrderNumber, 32);
  if (!orderNumber) return null;
  return db.order.findUnique({
    where: { publicOrderNumber: orderNumber },
    select: {
      publicOrderNumber: true,
      market: true,
      currency: true,
      status: true,
      paymentStatus: true,
      paymentProvider: true,
      productNameSnapshot: true,
      variantNameSnapshot: true,
      quantity: true,
      subtotal: true,
      shippingAmount: true,
      total: true,
      mercadoPagoPaymentId: true,
      createdAt: true,
      paidAt: true,
      cancelledAt: true,
      refundedAt: true,
    },
  });
}

export async function applyMercadoPagoPaymentUpdate(paymentId: string, context: WebhookContext = {}) {
  const payment = await (context.getPayment ?? getMercadoPagoPayment)(paymentId);
  const externalReference = sanitizeText(payment.external_reference ?? "", 80);
  if (!externalReference) return { updated: false, reason: "missing_external_reference" as const };

  const order = await db.order.findUnique({ where: { externalReference } });
  if (!order) return { updated: false, reason: "order_not_found" as const };
  if (order.currency !== payment.currency_id) return { updated: false, reason: "currency_mismatch" as const };
  if (roundMoney(Number(payment.transaction_amount)) !== roundMoney(Number(order.total))) {
    return { updated: false, reason: "amount_mismatch" as const };
  }

  const next = statusFromMercadoPago(payment);
  const now = context.now ?? new Date();
  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      mercadoPagoPaymentId: String(payment.id),
      paymentStatus: next.paymentStatus,
      status: next.orderStatus,
      paidAt: next.paymentStatus === "APPROVED" ? order.paidAt ?? approvedDate(payment) ?? now : order.paidAt,
      cancelledAt: next.orderStatus === "CANCELLED" ? order.cancelledAt ?? now : order.cancelledAt,
      refundedAt: next.orderStatus === "REFUNDED" ? order.refundedAt ?? now : order.refundedAt,
    },
  });

  if (next.paymentStatus === "APPROVED" && order.paymentStatus !== "APPROVED") {
    await recordPurchaseConfirmed(updated);
  }

  return { updated: true, orderNumber: updated.publicOrderNumber, paymentStatus: updated.paymentStatus, orderStatus: updated.status };
}

function validateOfferForCheckout(offer: OfferForCheckout | null, variantId: string | null | undefined):
  | { type: "valid"; variant: OfferForCheckout["variants"][number] | null; unitPrice: number; stock: number | null }
  | { type: "invalid"; result: CheckoutResult } {
  if (!offer || !offer.product.active || offer.product.archivedAt || !offer.active) {
    return invalid("product_unavailable", 404, "Produto indisponivel.");
  }
  if (offer.market !== "BR" || offer.currency !== "BRL") {
    return invalid("market_not_supported", 400, "Checkout Mercado Pago disponivel apenas para o Brasil.");
  }
  if (!["AVAILABLE", "PREORDER"].includes(offer.availability)) {
    return invalid("product_unavailable", 409, "Produto indisponivel.");
  }

  const activeVariants = offer.variants.filter((variant) => variant.active);
  if (activeVariants.length > 0) {
    const variant = activeVariants.find((item) => item.id === sanitizeText(variantId ?? "", 120));
    if (!variant) return invalid("variant_unavailable", 400, "Selecione uma variante disponivel.");
    if (variant.offerId !== offer.id) return invalid("variant_unavailable", 400, "Selecione uma variante disponivel.");
    if (!["AVAILABLE", "PREORDER"].includes(variant.availability)) return invalid("variant_unavailable", 409, "Variante indisponivel.");
    const unitPrice = roundMoney(Number(variant.salePrice));
    if (unitPrice <= 0) return invalid("invalid_price", 409, "Preco indisponivel.");
    return { type: "valid", variant, unitPrice, stock: variant.availability === "AVAILABLE" ? variant.stock : null };
  }

  if (variantId) return invalid("variant_unavailable", 400, "Selecione uma variante disponivel.");
  const unitPrice = offer.sellingPrice == null ? 0 : roundMoney(Number(offer.sellingPrice));
  if (unitPrice <= 0) return invalid("invalid_price", 409, "Preco indisponivel.");
  return { type: "valid", variant: null, unitPrice, stock: offer.availability === "AVAILABLE" ? offer.stockQuantity : null };
}

async function createPendingOrder(input: {
  offer: OfferForCheckout;
  variant: OfferForCheckout["variants"][number] | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  shippingAmount: number;
  total: number;
  idempotencyKey: string;
  attributionCookie?: string | null;
  sessionId?: string | null;
}) {
  const publicOrderNumber = generatePublicOrderNumber();
  const attribution = purchaseAttributionFromCookie(input.attributionCookie);
  const sessionHash = hashSession(input.sessionId);
  return db.order.create({
    data: {
      publicOrderNumber,
      market: "BR",
      currency: "BRL",
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      paymentProvider: "MERCADO_PAGO",
      productId: input.offer.productId,
      offerId: input.offer.id,
      variantId: input.variant?.id ?? null,
      productNameSnapshot: input.offer.title ?? input.offer.product.title,
      productSlugSnapshot: input.offer.slug,
      variantNameSnapshot: input.variant?.label ?? null,
      unitPriceSnapshot: input.unitPrice,
      quantity: input.quantity,
      subtotal: input.subtotal,
      shippingAmount: input.shippingAmount,
      total: input.total,
      externalReference: `NOMA-${publicOrderNumber}`,
      checkoutIdempotencyKey: input.idempotencyKey,
      sessionHash,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      gclid: attribution.gclid,
      referrer: attribution.referrer,
    },
  });
}

function buildPreferenceBody(
  order: Awaited<ReturnType<typeof createPendingOrder>>,
  offer: OfferForCheckout,
  variant: OfferForCheckout["variants"][number] | null,
  unitPrice: number,
  quantity: number,
  shippingAmount: number,
) {
  const orderPath = `/br/pedido/${order.publicOrderNumber}`;
  return {
    items: [{
      id: variant?.sku ?? offer.sku,
      title: order.variantNameSnapshot ? `${order.productNameSnapshot} - ${order.variantNameSnapshot}` : order.productNameSnapshot,
      quantity,
      unit_price: unitPrice,
      currency_id: "BRL" as const,
    }],
    ...(shippingAmount > 0 ? { shipments: { cost: shippingAmount, mode: "not_specified" as const } } : {}),
    external_reference: order.externalReference,
    notification_url: absoluteUrl("/api/webhooks/mercado-pago"),
    back_urls: {
      success: absoluteUrl(`${orderPath}/sucesso`),
      pending: absoluteUrl(`${orderPath}/pendente`),
      failure: absoluteUrl(`${orderPath}/falha`),
    },
    auto_return: "approved" as const,
    metadata: {
      noma_order_number: order.publicOrderNumber,
      noma_order_id: order.id,
      product_id: offer.productId,
      offer_id: offer.id,
      variant_id: variant?.id ?? null,
      market: "BR",
    },
  };
}

function matchesExistingOrder(order: {
  offerId: string;
  variantId: string | null;
  quantity: number;
  total: unknown;
}, input: { offer: OfferForCheckout; variantId: string | null; quantity: number; total: number }) {
  return order.offerId === input.offer.id
    && (order.variantId ?? null) === input.variantId
    && order.quantity === input.quantity
    && roundMoney(Number(order.total)) === input.total;
}

function statusFromMercadoPago(payment: MercadoPagoPayment) {
  switch (payment.status) {
    case "approved":
      return { paymentStatus: "APPROVED" as const, orderStatus: "PAID" as const };
    case "rejected":
      return { paymentStatus: "REJECTED" as const, orderStatus: "PENDING_PAYMENT" as const };
    case "cancelled":
      return { paymentStatus: "CANCELLED" as const, orderStatus: "CANCELLED" as const };
    case "refunded":
    case "charged_back":
      return { paymentStatus: "REFUNDED" as const, orderStatus: "REFUNDED" as const };
    case "in_process":
    case "in_mediation":
    case "authorized":
      return { paymentStatus: "IN_PROCESS" as const, orderStatus: "PENDING_PAYMENT" as const };
    default:
      return { paymentStatus: "PENDING" as const, orderStatus: "PENDING_PAYMENT" as const };
  }
}

async function recordPurchaseConfirmed(order: {
  id: string;
  market: "BR" | "US";
  productId: string;
  offerId: string;
  variantId: string | null;
  productNameSnapshot: string;
  productSlugSnapshot: string;
  variantNameSnapshot: string | null;
  unitPriceSnapshot: unknown;
  currency: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  sessionHash: string | null;
}) {
  await db.nomaPurchaseIntentEvent.create({
    data: {
      eventType: "purchase_confirmed",
      market: order.market,
      productId: order.productId,
      productOfferId: order.offerId,
      productSlug: order.productSlugSnapshot,
      productTitle: order.productNameSnapshot,
      variantId: order.variantId,
      variantLabel: order.variantNameSnapshot,
      displayedPrice: Number(order.unitPriceSnapshot),
      currency: order.currency,
      pathname: "/api/webhooks/mercado-pago",
      referrer: order.referrer,
      utmSource: order.utmSource,
      utmMedium: order.utmMedium,
      utmCampaign: order.utmCampaign,
      utmContent: order.utmContent,
      utmTerm: order.utmTerm,
      gclid: order.gclid,
      userAgentSummary: "Mercado Pago webhook",
      sessionHash: order.sessionHash,
      orderId: order.id,
      dedupeKey: createHash("sha256").update(`purchase_confirmed:${order.id}`).digest("hex"),
    },
  }).catch((error: unknown) => {
    if (!isUniqueConstraintError(error)) throw error;
  });
}

function approvedDate(payment: MercadoPagoPayment) {
  if (!payment.date_approved) return null;
  const date = new Date(payment.date_approved);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeQuantity(value: number) {
  return Number.isInteger(value) && value > 0 && value <= MAX_CHECKOUT_QUANTITY ? value : null;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function generatePublicOrderNumber() {
  return `BR${randomBytes(8).toString("hex").toUpperCase()}`;
}

function hashSession(value: string | null | undefined) {
  const cleaned = sanitizeText(value ?? "", 120);
  return cleaned ? createHash("sha256").update(cleaned).digest("hex") : null;
}

function sanitizeText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function assisted(reason: "high_value" | "shipping_required", message: string): CheckoutResult {
  return { type: "assisted_purchase", reason, message };
}

function invalid(code: string, status: number, message: string) {
  return { type: "invalid" as const, result: publicError(code, status, message) };
}

function publicError(code: string, status: number, message: string): CheckoutResult {
  return { type: "error", code, status, message };
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export { ASSISTED_PURCHASE_THRESHOLD, MAX_CHECKOUT_QUANTITY, NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE };
