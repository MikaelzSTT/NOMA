import "server-only";

import type { Market, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fixedShippingAdapter } from "@/lib/shipping/adapters/fixed";
import { manualShippingAdapter } from "@/lib/shipping/adapters/manual";
import {
  ShippingQuoteError,
  type AdapterShippingQuote,
  type NormalizedShippingQuote,
  type ShippingAdapter,
  type ShippingQuoteRequest,
  type ShippingQuoteResult,
  type ShippingStrategyCode,
} from "@/lib/shipping/types";

const SHIPPING_QUOTE_TTL_MS = 30 * 60 * 1000;
const SHIPPING_ADAPTER_TIMEOUT_MS = 6_000;
const DEFAULT_ADAPTERS: Partial<Record<ShippingStrategyCode, ShippingAdapter>> = {
  FIXED: fixedShippingAdapter,
  MANUAL: manualShippingAdapter,
};

type ShippingEngineContext = {
  now?: Date;
  quoteTtlMs?: number;
  timeoutMs?: number;
  adapters?: Partial<Record<ShippingStrategyCode, ShippingAdapter>>;
};

const offerInclude = {
  supplier: true,
  product: { select: { active: true, archivedAt: true, title: true } },
  variants: { where: { active: true }, orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.ProductMarketOfferInclude;

type OfferForShipping = Prisma.ProductMarketOfferGetPayload<{ include: typeof offerInclude }>;
type ShippingQuoteRow = Prisma.ShippingQuoteGetPayload<Record<string, never>>;

export async function quoteShipping(input: ShippingQuoteRequest, context: ShippingEngineContext = {}): Promise<ShippingQuoteResult> {
  const quantity = normalizeQuantity(input.quantity);
  if (!quantity) throw new ShippingQuoteError("invalid_quantity", 400, "Quantidade invalida.");

  const offerId = sanitizeText(input.offerId, 120);
  if (!offerId) throw new ShippingQuoteError("invalid_offer", 400, "Oferta invalida.");

  const offer = await db.productMarketOffer.findUnique({ where: { id: offerId }, include: offerInclude });
  const validation = validateOfferForShipping(offer, input);
  if (validation.type !== "valid") throw validation.error;

  const postalCode = normalizePostalCode(validation.offer.market, input.destinationPostalCode);
  const strategy = validation.offer.supplier.shippingStrategy as ShippingStrategyCode;
  const manual = manualReason(validation.offer);
  if (manual) return manual;

  const adapter = getAdapter(strategy, context.adapters);
  if (!adapter) {
    return { type: "manual", reason: "adapter_unavailable", message: "Frete automatico indisponivel para este fornecedor." };
  }

  let adapterQuotes: AdapterShippingQuote[];
  try {
    adapterQuotes = await adapter.quote(buildAdapterInput(validation.offer, validation.variant, postalCode, quantity, context));
  } catch (error) {
    if (error instanceof ShippingQuoteError && error.code === "manual_shipping") {
      return { type: "manual", reason: "manual_shipping", message: "Esta compra precisa de atendimento para confirmar o frete." };
    }
    throw error;
  }

  const normalized = normalizeAdapterQuotes(adapterQuotes, validation.offer);
  if (!normalized.length) {
    return { type: "manual", reason: "shipping_not_configured", message: "Esta compra precisa de atendimento para confirmar o frete." };
  }

  const now = context.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (context.quoteTtlMs ?? SHIPPING_QUOTE_TTL_MS));
  const rows = await Promise.all(normalized.map((quote) => db.shippingQuote.create({
    data: {
      market: validation.offer.market,
      supplierId: validation.offer.supplierId,
      offerId: validation.offer.id,
      variantId: validation.variant?.id ?? null,
      destinationPostalCode: postalCode,
      quantity,
      serviceCode: quote.serviceCode,
      serviceName: quote.serviceName,
      price: quote.price,
      currency: quote.currency,
      estimatedMinDays: quote.estimatedMinDays ?? null,
      estimatedMaxDays: quote.estimatedMaxDays ?? null,
      strategy,
      adapterKey: validation.offer.supplier.adapterKey,
      rawResponse: quote.rawResponse,
      expiresAt,
    },
  })));

  return { type: "quotes", quotes: rows.map(toPublicQuote) };
}

export async function revalidateShippingQuote(input: {
  quoteId: string;
  offer: OfferForShipping;
  variant: OfferForShipping["variants"][number] | null;
  destinationPostalCode: string;
  quantity: number;
}, context: ShippingEngineContext = {}) {
  const quoteId = sanitizeText(input.quoteId, 120);
  if (!quoteId) throw new ShippingQuoteError("shipping_quote_required", 400, "Calcule o frete antes de comprar.");
  const quote = await db.shippingQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new ShippingQuoteError("shipping_quote_not_found", 404, "Cotacao de frete nao encontrada.");

  const now = context.now ?? new Date();
  const postalCode = normalizePostalCode(input.offer.market, input.destinationPostalCode);
  validateQuoteOwnership(quote, {
    offerId: input.offer.id,
    supplierId: input.offer.supplierId,
    variantId: input.variant?.id ?? null,
    postalCode,
    quantity: input.quantity,
    now,
  });

  const strategy = input.offer.supplier.shippingStrategy as ShippingStrategyCode;
  const manual = manualReason(input.offer);
  if (manual) throw new ShippingQuoteError("shipping_quote_unavailable", 409, manual.message);

  const adapter = getAdapter(strategy, context.adapters);
  if (!adapter) throw new ShippingQuoteError("shipping_adapter_unavailable", 409, "Frete automatico indisponivel para este fornecedor.");

  const currentQuotes = normalizeAdapterQuotes(
    await adapter.quote(buildAdapterInput(input.offer, input.variant, postalCode, input.quantity, context)),
    input.offer,
  );
  const current = currentQuotes.find((item) => item.serviceCode === quote.serviceCode);
  if (!current) throw new ShippingQuoteError("shipping_quote_changed", 409, "A opcao de frete selecionada nao esta mais disponivel.");
  if (roundMoney(current.price) !== roundMoney(Number(quote.price))) {
    throw new ShippingQuoteError("shipping_quote_changed", 409, "O frete mudou. Calcule novamente antes de comprar.");
  }

  await db.shippingQuote.update({ where: { id: quote.id }, data: { revalidatedAt: now } });
  return {
    quoteId: quote.id,
    supplierId: quote.supplierId,
    serviceCode: quote.serviceCode,
    serviceName: quote.serviceName,
    price: roundMoney(Number(quote.price)),
    currency: quote.currency,
    estimatedMinDays: quote.estimatedMinDays,
    estimatedMaxDays: quote.estimatedMaxDays,
    destinationPostalCode: quote.destinationPostalCode,
    expiresAt: quote.expiresAt,
  } satisfies NormalizedShippingQuote;
}

export { offerInclude as shippingOfferInclude };

export function normalizeBrazilianPostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits) || /^(\d)\1{7}$/.test(digits)) {
    throw new ShippingQuoteError("invalid_postal_code", 400, "CEP invalido.");
  }
  return digits;
}

function validateOfferForShipping(offer: OfferForShipping | null, input: ShippingQuoteRequest):
  | { type: "valid"; offer: OfferForShipping; variant: OfferForShipping["variants"][number] | null }
  | { type: "invalid"; error: ShippingQuoteError } {
  if (!offer) return invalid("offer_not_found", 404, "Oferta nao encontrada.");
  if (!offer.product.active || offer.product.archivedAt || !offer.active || offer.availability === "REMOVED") {
    return invalid("product_unavailable", 404, "Produto indisponivel.");
  }
  if (input.market && offer.market !== input.market) return invalid("market_mismatch", 400, "Mercado invalido para a oferta.");
  if (input.supplierId && offer.supplierId !== input.supplierId) return invalid("supplier_mismatch", 400, "Fornecedor invalido para a oferta.");
  if (offer.market !== "BR") return invalid("market_not_enabled", 400, "Cotacao automatica disponivel apenas para o Brasil nesta fase.");
  if (!offer.supplier.active) return invalid("supplier_unavailable", 409, "Fornecedor indisponivel.");

  const variant = resolveVariant(offer, input.variantId);
  if (variant instanceof ShippingQuoteError) return { type: "invalid", error: variant };
  return { type: "valid", offer, variant };
}

function resolveVariant(offer: OfferForShipping, variantId: string | null | undefined) {
  if (offer.variants.length > 0) {
    const id = sanitizeText(variantId ?? "", 120);
    if (!id) return new ShippingQuoteError("variant_required", 400, "Selecione uma variante disponivel.");
    const variant = offer.variants.find((item) => item.id === id);
    if (!variant || variant.offerId !== offer.id || variant.availability === "REMOVED") {
      return new ShippingQuoteError("variant_unavailable", 400, "Selecione uma variante disponivel.");
    }
    return variant;
  }
  if (variantId) return new ShippingQuoteError("variant_unavailable", 400, "Selecione uma variante disponivel.");
  return null;
}

function manualReason(offer: OfferForShipping): Extract<ShippingQuoteResult, { type: "manual" }> | null {
  const strategy = offer.supplier.shippingStrategy as ShippingStrategyCode;
  if (strategy === "MANUAL") {
    return { type: "manual", reason: "manual_shipping", message: "Esta compra precisa de atendimento para confirmar o frete." };
  }
  if (strategy === "DISABLED" || !offer.supplier.shippingActive) {
    return { type: "manual", reason: "shipping_disabled", message: "Frete automatico indisponivel para este fornecedor." };
  }
  if (!offer.supplier.shippingCheckoutEnabled) {
    return { type: "manual", reason: "shipping_not_configured", message: "Checkout automatico indisponivel para este fornecedor." };
  }
  if (strategy === "FIXED" && offer.shippingCost == null) {
    return { type: "manual", reason: "shipping_not_configured", message: "Esta compra precisa de atendimento para confirmar o frete." };
  }
  return null;
}

function buildAdapterInput(
  offer: OfferForShipping,
  variant: OfferForShipping["variants"][number] | null,
  destinationPostalCode: string,
  quantity: number,
  context: ShippingEngineContext,
) {
  return {
    market: offer.market,
    supplier: {
      id: offer.supplier.id,
      name: offer.supplier.name,
      adapterKey: offer.supplier.adapterKey,
      shippingStrategy: offer.supplier.shippingStrategy as ShippingStrategyCode,
      shippingOriginPostalCode: offer.supplier.shippingOriginPostalCode,
      shippingConfig: offer.supplier.shippingConfig,
    },
    offer: {
      id: offer.id,
      supplierId: offer.supplierId,
      supplierProductId: offer.supplierProductId,
      sku: offer.sku,
      currency: offer.currency,
      shippingCost: offer.shippingCost,
      estimatedDeliveryMinDays: offer.estimatedDeliveryMinDays,
      estimatedDeliveryMaxDays: offer.estimatedDeliveryMaxDays,
      sourceUrl: offer.sourceUrl,
    },
    variant: variant ? { id: variant.id, sku: variant.sku, label: variant.label, sourceUrl: variant.sourceUrl } : null,
    destinationPostalCode,
    quantity,
    timeoutMs: context.timeoutMs ?? SHIPPING_ADAPTER_TIMEOUT_MS,
  };
}

function normalizeAdapterQuotes(quotes: AdapterShippingQuote[], offer: OfferForShipping) {
  return quotes.flatMap((quote) => {
    const serviceCode = sanitizeText(quote.serviceCode, 80);
    const serviceName = sanitizeText(quote.serviceName, 160);
    const price = roundMoney(quote.price);
    const currency = sanitizeText(quote.currency, 3);
    if (!serviceCode || !serviceName || !currency || currency !== offer.currency || !Number.isFinite(price) || price < 0) return [];
    return [{
      ...quote,
      serviceCode,
      serviceName,
      price,
      currency,
      estimatedMinDays: normalizeDays(quote.estimatedMinDays),
      estimatedMaxDays: normalizeDays(quote.estimatedMaxDays),
    }];
  });
}

function validateQuoteOwnership(quote: ShippingQuoteRow, input: {
  offerId: string;
  supplierId: string;
  variantId: string | null;
  postalCode: string;
  quantity: number;
  now: Date;
}) {
  if (quote.offerId !== input.offerId || quote.supplierId !== input.supplierId) {
    throw new ShippingQuoteError("shipping_quote_mismatch", 409, "Cotacao de frete invalida para esta oferta.");
  }
  if ((quote.variantId ?? null) !== input.variantId) {
    throw new ShippingQuoteError("shipping_quote_variant_mismatch", 409, "Cotacao de frete invalida para esta variante.");
  }
  if (quote.destinationPostalCode !== input.postalCode) {
    throw new ShippingQuoteError("shipping_quote_postal_code_mismatch", 409, "Cotacao de frete invalida para este CEP.");
  }
  if (quote.quantity !== input.quantity) {
    throw new ShippingQuoteError("shipping_quote_quantity_mismatch", 409, "Cotacao de frete invalida para esta quantidade.");
  }
  if (quote.expiresAt <= input.now) {
    throw new ShippingQuoteError("shipping_quote_expired", 409, "Cotacao de frete expirada. Calcule novamente.");
  }
}

function getAdapter(strategy: ShippingStrategyCode, overrides?: Partial<Record<ShippingStrategyCode, ShippingAdapter>>) {
  return overrides?.[strategy] ?? DEFAULT_ADAPTERS[strategy] ?? null;
}

function normalizePostalCode(market: Market, value: string) {
  if (market === "BR") return normalizeBrazilianPostalCode(value);
  const cleaned = sanitizeText(value, 16);
  if (!cleaned) throw new ShippingQuoteError("invalid_postal_code", 400, "CEP invalido.");
  return cleaned.toUpperCase();
}

function toPublicQuote(row: ShippingQuoteRow): NormalizedShippingQuote {
  return {
    quoteId: row.id,
    supplierId: row.supplierId,
    serviceCode: row.serviceCode,
    serviceName: row.serviceName,
    price: roundMoney(Number(row.price)),
    currency: row.currency,
    estimatedMinDays: row.estimatedMinDays,
    estimatedMaxDays: row.estimatedMaxDays,
    destinationPostalCode: row.destinationPostalCode,
    expiresAt: row.expiresAt,
  };
}

function normalizeQuantity(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 5 ? value : null;
}

function normalizeDays(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function sanitizeText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function invalid(code: string, status: number, message: string) {
  return { type: "invalid" as const, error: new ShippingQuoteError(code, status, message) };
}
