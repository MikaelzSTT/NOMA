import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    productMarketOffer: { findFirst: vi.fn() },
    order: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    shippingQuote: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    nomaPurchaseIntentEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  applyMercadoPagoPaymentUpdate,
  createMercadoPagoCheckout,
  getPublicOrder,
} from "@/lib/orders";
import { verifyMercadoPagoWebhookSignature } from "@/lib/mercado-pago";
import type { MercadoPagoPreferenceInput } from "@/lib/mercado-pago";

describe("Mercado Pago Checkout Pro NOMA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture());
    mocks.db.order.findUnique.mockResolvedValue(null);
    mocks.db.order.create.mockImplementation(async ({ data }) => ({ id: "order-1", ...data }));
    mocks.db.order.update.mockImplementation(async ({ data }) => ({ ...orderFixture(), ...data }));
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture());
    mocks.db.shippingQuote.update.mockResolvedValue(shippingQuoteFixture());
    mocks.db.nomaPurchaseIntentEvent.create.mockResolvedValue({ id: "event-1" });
  });

  it("produto BR valido cria Order e preferencia com preco do banco", async () => {
    const createPreference = vi.fn(async (_input: MercadoPagoPreferenceInput) => {
      void _input;
      return { id: "pref-1", init_point: "https://mp.test/checkout", sandbox_init_point: undefined };
    });

    const result = await createMercadoPagoCheckout({
      productId: "product-1",
      offerId: "offer-1",
      variantId: "variant-1",
      quantity: 1,
      quoteId: "quote-1",
      destinationPostalCode: "01310-100",
      shippingAddress: shippingAddressFixture(),
      idempotencyKey: "idem-valid-0001",
      attributionCookie: "utm_source=google&gclid=abc123",
      sessionId: "session-1",
    }, { createPreference, now: new Date("2026-09-03T12:00:00.000Z") });

    expect(result).toEqual({ type: "checkout", orderNumber: expect.stringMatching(/^BR/), redirectUrl: "https://mp.test/checkout" });
    expect(mocks.db.order.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      market: "BR",
      currency: "BRL",
      productId: "product-1",
      offerId: "offer-1",
      variantId: "variant-1",
      unitPriceSnapshot: 1234.56,
      subtotal: 1234.56,
      shippingAmount: 120,
      shippingQuoteId: "quote-1",
      shippingServiceCode: "fixed",
      shippingServiceName: "Entrega",
      shippingEstimatedMinDays: 8,
      shippingEstimatedMaxDays: 12,
      destinationPostalCode: "01310100",
      buyerName: "Maria Silva",
      shippingAddress: shippingAddressFixture({ postalCode: "01310100" }),
      total: 1354.56,
      paymentProvider: "MERCADO_PAGO",
      paymentStatus: "PENDING",
      utmSource: "google",
      gclid: "abc123",
    }) });
    expect(createPreference).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({
        items: [expect.objectContaining({ unit_price: 1234.56, currency_id: "BRL", quantity: 1 })],
        shipments: { cost: 120, mode: "not_specified" },
        external_reference: expect.stringMatching(/^NOMA-BR/),
        notification_url: expect.stringContaining("/api/webhooks/mercado-pago"),
        back_urls: expect.objectContaining({
          success: expect.stringContaining("/br/pedido/"),
          pending: expect.stringContaining("/pendente"),
          failure: expect.stringContaining("/falha"),
        }),
      }),
    }));
  });

  it("rejeita oferta US nesse endpoint de dominio", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({ market: "US", currency: "USD" }));

    await expectCheckoutError("market_not_supported");
  });

  it("rejeita produto inexistente", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(null);

    await expectCheckoutError("product_unavailable");
  });

  it("rejeita variante inexistente", async () => {
    await expectCheckoutError("variant_unavailable", { variantId: "missing-variant" });
  });

  it("rejeita variante de outra oferta", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({
      variants: [{ ...variantFixture(), id: "variant-1", offerId: "other-offer" }],
    }));

    await expectCheckoutError("variant_unavailable");
  });

  it("rejeita produto inativo", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({ product: { ...productFixture(), active: false } }));

    await expectCheckoutError("product_unavailable");
  });

  it("ignora preco adulterado pelo navegador porque o input nao participa do calculo", async () => {
    const createPreference = vi.fn(async (_input: MercadoPagoPreferenceInput) => {
      void _input;
      return { id: "pref-1", init_point: "https://mp.test/checkout", sandbox_init_point: undefined };
    });
    const tamperedInput = {
      productId: "product-1",
      offerId: "offer-1",
      variantId: "variant-1",
      quantity: 1,
      quoteId: "quote-1",
      destinationPostalCode: "01310-100",
      shippingAddress: shippingAddressFixture(),
      idempotencyKey: "idem-price-0001",
      amount: 1,
      shippingPrice: 1,
    } as unknown as Parameters<typeof createMercadoPagoCheckout>[0];

    await createMercadoPagoCheckout(tamperedInput, { createPreference, now: new Date("2026-09-03T12:00:00.000Z") });

    const preferenceInput = createPreference.mock.calls[0]?.[0];
    expect(preferenceInput?.body.items[0]?.unit_price).toBe(1234.56);
    expect(preferenceInput?.body.shipments?.cost).toBe(120);
  });

  it(">= R$ 10.000 entra em compra assistida", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({
      variants: [{ ...variantFixture(), salePrice: 10_000 }],
    }));

    const result = await baseCheckout();

    expect(result).toMatchObject({ type: "assisted_purchase", reason: "high_value" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia checkout automatico quando frete nao esta cadastrado", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({ shippingCost: null }));

    const result = await baseCheckout();

    expect(result).toMatchObject({ type: "assisted_purchase", reason: "shipping_required" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("exige endereco completo antes do Mercado Pago", async () => {
    const result = await baseCheckout({ shippingAddress: null, idempotencyKey: "idem-address-required-0001" });

    expect(result).toMatchObject({ type: "error", code: "shipping_address_required" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia quote expirada no checkout", async () => {
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture({ expiresAt: new Date("2026-09-03T11:59:59.000Z") }));

    const result = await baseCheckout({ idempotencyKey: "idem-expired-0001" }, { now: new Date("2026-09-03T12:00:00.000Z") });

    expect(result).toMatchObject({ type: "error", code: "shipping_quote_expired" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia quote de outro produto", async () => {
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture({ offerId: "other-offer" }));

    const result = await baseCheckout({ idempotencyKey: "idem-other-offer-0001" });

    expect(result).toMatchObject({ type: "error", code: "shipping_quote_mismatch" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia quote de outra variante", async () => {
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture({ variantId: "other-variant" }));

    const result = await baseCheckout({ idempotencyKey: "idem-other-variant-0001" });

    expect(result).toMatchObject({ type: "error", code: "shipping_quote_variant_mismatch" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia quote de quantidade diferente", async () => {
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture({ quantity: 2 }));

    const result = await baseCheckout({ idempotencyKey: "idem-other-quantity-0001" });

    expect(result).toMatchObject({ type: "error", code: "shipping_quote_quantity_mismatch" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("bloqueia checkout quando recotacao muda o preco", async () => {
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture({ shippingCost: 130 }));

    const result = await baseCheckout({ idempotencyKey: "idem-shipping-changed-0001" });

    expect(result).toMatchObject({ type: "error", code: "shipping_quote_changed" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("double click com mesma chave reaproveita pedido e URL existente", async () => {
    mocks.db.order.findUnique.mockResolvedValue(orderFixture({ mercadoPagoCheckoutUrl: "https://mp.test/existing" }));

    const result = await baseCheckout({ idempotencyKey: "idem-double-0001" });

    expect(result).toEqual({ type: "checkout", orderNumber: "BRORDER0001", redirectUrl: "https://mp.test/existing" });
    expect(mocks.db.order.create).not.toHaveBeenCalled();
  });

  it("webhook duplicado nao duplica evento de compra confirmada", async () => {
    mocks.db.order.findUnique.mockResolvedValueOnce(orderFixture({ paymentStatus: "PENDING" })).mockResolvedValueOnce(orderFixture({ paymentStatus: "APPROVED" }));
    mocks.db.order.update.mockImplementation(async ({ data }) => ({ ...orderFixture(), ...data }));
    const getPayment = vi.fn(async () => paymentFixture());

    await applyMercadoPagoPaymentUpdate("123", { getPayment });
    await applyMercadoPagoPaymentUpdate("123", { getPayment });

    expect(mocks.db.order.update).toHaveBeenCalledTimes(2);
    expect(mocks.db.nomaPurchaseIntentEvent.create).toHaveBeenCalledTimes(1);
  });

  it("valida assinatura oficial do webhook com data.id, x-request-id e ts", () => {
    const secret = "webhook-secret-123";
    const manifest = "id:123;request-id:req-1;ts:1704908010;";
    const signature = createHmac("sha256", secret).update(manifest).digest("hex");

    expect(verifyMercadoPagoWebhookSignature({
      xSignature: `ts=1704908010,v1=${signature}`,
      xRequestId: "req-1",
      dataId: "123",
      secret,
    })).toEqual({ verified: true, reason: undefined });
    expect(verifyMercadoPagoWebhookSignature({
      xSignature: "ts=1704908010,v1=0000000000000000000000000000000000000000000000000000000000000000",
      xRequestId: "req-1",
      dataId: "123",
      secret,
    })).toMatchObject({ verified: false, reason: "signature_mismatch" });
  });

  it("webhook com amount diferente nao aprova Order", async () => {
    mocks.db.order.findUnique.mockResolvedValue(orderFixture());

    const result = await applyMercadoPagoPaymentUpdate("123", { getPayment: async () => paymentFixture({ transaction_amount: 1 }) });

    expect(result).toEqual({ updated: false, reason: "amount_mismatch" });
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });

  it("webhook com currency diferente nao aprova Order", async () => {
    mocks.db.order.findUnique.mockResolvedValue(orderFixture());

    const result = await applyMercadoPagoPaymentUpdate("123", { getPayment: async () => paymentFixture({ currency_id: "USD" }) });

    expect(result).toEqual({ updated: false, reason: "currency_mismatch" });
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });

  it("webhook com external_reference invalida nao aprova Order", async () => {
    mocks.db.order.findUnique.mockResolvedValue(null);

    const result = await applyMercadoPagoPaymentUpdate("123", { getPayment: async () => paymentFixture({ external_reference: "NOMA-INVALID" }) });

    expect(result).toEqual({ updated: false, reason: "order_not_found" });
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });

  it("success URL falsa nao marca pedido como pago", async () => {
    mocks.db.order.findUnique.mockResolvedValue(orderFixture({ paymentStatus: "PENDING", status: "PENDING_PAYMENT" }));

    const order = await getPublicOrder("BRORDER0001");

    expect(order?.paymentStatus).toBe("PENDING");
    expect(mocks.db.order.update).not.toHaveBeenCalled();
  });

  it("pagamento aprovado corretamente atualiza Order", async () => {
    mocks.db.order.findUnique.mockResolvedValue(orderFixture({ paymentStatus: "PENDING" }));
    mocks.db.order.update.mockImplementation(async ({ data }) => ({ ...orderFixture(), ...data }));

    const result = await applyMercadoPagoPaymentUpdate("123", { getPayment: async () => paymentFixture() });

    expect(result).toMatchObject({ updated: true, paymentStatus: "APPROVED", orderStatus: "PAID" });
    expect(mocks.db.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mercadoPagoPaymentId: "123", paymentStatus: "APPROVED", status: "PAID", paidAt: expect.any(Date) }),
    }));
  });
});

async function expectCheckoutError(code: string, overrides: Partial<Parameters<typeof createMercadoPagoCheckout>[0]> = {}) {
  const result = await baseCheckout(overrides);
  expect(result).toMatchObject({ type: "error", code });
  expect(mocks.db.order.create).not.toHaveBeenCalled();
}

function baseCheckout(
  overrides: Partial<Parameters<typeof createMercadoPagoCheckout>[0]> = {},
  context: Parameters<typeof createMercadoPagoCheckout>[1] = {},
) {
  return createMercadoPagoCheckout({
    productId: "product-1",
    offerId: "offer-1",
    variantId: "variant-1",
    quantity: 1,
    quoteId: "quote-1",
    destinationPostalCode: "01310-100",
    shippingAddress: shippingAddressFixture(),
    idempotencyKey: "idem-base-0001",
    ...overrides,
  }, { now: new Date("2026-09-03T12:00:00.000Z"), createPreference: async () => ({ id: "pref-1", init_point: "https://mp.test/checkout", sandbox_init_point: undefined }), ...context });
}

function offerFixture(overrides: Record<string, unknown> & { product?: Record<string, unknown>; supplier?: Record<string, unknown>; shippingCost?: number | null; variants?: Array<Record<string, unknown>> } = {}) {
  return {
    ...baseOffer(),
    ...overrides,
    product: overrides.product ?? productFixture(),
    variants: overrides.variants?.map((variant) => ({ ...variantFixture(), ...variant })) ?? [variantFixture()],
  };
}

function baseOffer() {
  return {
    id: "offer-1",
    productId: "product-1",
    market: "BR",
    supplierId: "supplier-1",
    supplierProductId: "supplier-product-1",
    sku: "SOFA-1",
    title: "Sofa Arco",
    slug: "sofa-arco",
    shortDescription: null,
    description: null,
    images: null,
    seoTitle: null,
    seoDescription: null,
    currency: "BRL",
    costPrice: 900,
    sellingPrice: 1300,
    compareAtPrice: null,
    discountPercent: null,
    stockQuantity: 3,
    availability: "AVAILABLE",
    shippingCost: 120,
    estimatedDelivery: null,
    estimatedDeliveryMinDays: 8,
    estimatedDeliveryMaxDays: 12,
    sourceUrl: null,
    active: true,
    featured: false,
    popularityScore: 0,
    manualPriceOverride: false,
    pricingRuleType: null,
    pricingRuleValue: null,
    internalNotes: null,
    syncStatus: "SYNCED",
    syncError: null,
    syncErrorAt: null,
    lastPriceSyncAt: null,
    lastStockSyncAt: null,
    lastSyncedAt: new Date("2026-09-03T12:00:00.000Z"),
    firstSeenAt: new Date("2026-09-03T12:00:00.000Z"),
    removedAt: null,
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    product: productFixture(),
    supplier: supplierFixture(),
    variants: [variantFixture()],
  };
}

function supplierFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "supplier-1",
    name: "Fornecedor",
    slug: "fornecedor",
    adapterKey: "mock-catalog",
    baseUrl: null,
    active: true,
    authorized: true,
    settings: {},
    credentialsEncrypted: null,
    shippingStrategy: "FIXED",
    shippingActive: true,
    shippingCheckoutEnabled: true,
    shippingOriginPostalCode: "04309011",
    shippingConfig: {},
    capabilities: [],
    supportedMarkets: ["BR"],
    syncCursor: null,
    lastSyncedAt: null,
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    ...overrides,
  };
}

function productFixture() {
  return {
    id: "product-1",
    supplierProductId: "supplier-product-1",
    supplierName: "Fornecedor",
    sku: "SOFA-1",
    canonicalHash: null,
    slug: "sofa-arco",
    title: "Sofa Arco",
    shortDescription: null,
    description: null,
    subcategory: null,
    costPrice: 900,
    sellingPrice: 1300,
    compareAtPrice: null,
    discountPercent: null,
    currency: "BRL",
    stock: 3,
    availability: "AVAILABLE",
    shippingCost: 120,
    estimatedDelivery: null,
    sourceUrl: null,
    attributes: {},
    source: "manual",
    active: true,
    featured: false,
    archivedAt: null,
    manualPriceOverride: false,
    pricingRuleType: null,
    pricingRuleValue: null,
    rating: null,
    reviewCount: null,
    installmentText: null,
    popularityScore: 0,
    internalNotes: null,
    syncStatus: "SYNCED",
    syncError: null,
    syncErrorAt: null,
    lastPriceSyncAt: null,
    lastStockSyncAt: null,
    lastSyncedAt: new Date("2026-09-03T12:00:00.000Z"),
    firstSeenAt: new Date("2026-09-03T12:00:00.000Z"),
    removedAt: null,
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    supplierId: "supplier-1",
    categoryId: "category-1",
    brandId: null,
  };
}

function variantFixture() {
  return {
    id: "variant-1",
    label: "Linho natural",
    sku: "SOFA-1-LINHO",
    attributes: { tecido: "Linho" },
    costPrice: 900,
    salePrice: 1234.56,
    compareAtPrice: null,
    manualPriceOverride: false,
    stock: 2,
    active: true,
    availability: "AVAILABLE",
    sourceUrl: null,
    imageUrl: null,
    isDefault: true,
    position: 0,
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    offerId: "offer-1",
  };
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return { ...baseOrder(), ...overrides };
}

function baseOrder() {
  return {
    id: "order-1",
    publicOrderNumber: "BRORDER0001",
    market: "BR",
    currency: "BRL",
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    paymentProvider: "MERCADO_PAGO",
    productId: "product-1",
    offerId: "offer-1",
    variantId: "variant-1",
    productNameSnapshot: "Sofa Arco",
    productSlugSnapshot: "sofa-arco",
    variantNameSnapshot: "Linho natural",
    unitPriceSnapshot: 1234.56,
    quantity: 1,
    subtotal: 1234.56,
    shippingAmount: 120,
    shippingQuoteId: "quote-1",
    shippingServiceCode: "fixed",
    shippingServiceName: "Entrega",
    shippingEstimatedMinDays: 8,
    shippingEstimatedMaxDays: 12,
    destinationPostalCode: "01310100",
    total: 1354.56,
    buyerEmail: null,
    buyerName: null,
    buyerPhone: null,
    shippingAddress: null,
    mercadoPagoPreferenceId: "pref-1",
    mercadoPagoPaymentId: null,
    mercadoPagoCheckoutUrl: null,
    externalReference: "NOMA-BRORDER0001",
    checkoutIdempotencyKey: "idem-base-0001",
    sessionHash: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    gclid: null,
    referrer: null,
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    paidAt: null,
    cancelledAt: null,
    refundedAt: null,
  };
}

function shippingQuoteFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1",
    market: "BR",
    supplierId: "supplier-1",
    offerId: "offer-1",
    variantId: "variant-1",
    destinationPostalCode: "01310100",
    quantity: 1,
    serviceCode: "fixed",
    serviceName: "Entrega",
    price: 120,
    currency: "BRL",
    estimatedMinDays: 8,
    estimatedMaxDays: 12,
    strategy: "FIXED",
    adapterKey: "mock-catalog",
    rawResponse: {},
    expiresAt: new Date("2026-09-03T12:30:00.000Z"),
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    revalidatedAt: null,
    ...overrides,
  };
}

function shippingAddressFixture(overrides: Record<string, unknown> = {}) {
  return {
    recipientName: "Maria Silva",
    postalCode: "01310-100",
    street: "Avenida Paulista",
    number: "1000",
    complement: "Apto 101",
    neighborhood: "Bela Vista",
    city: "Sao Paulo",
    state: "SP",
    ...overrides,
  };
}

function paymentFixture(overrides: Partial<{
  id: number;
  status: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string;
  date_approved: string;
}> = {}) {
  return {
    id: 123,
    status: "approved",
    transaction_amount: 1354.56,
    currency_id: "BRL",
    external_reference: "NOMA-BRORDER0001",
    date_approved: "2026-09-03T12:00:00.000Z",
    ...overrides,
  };
}
