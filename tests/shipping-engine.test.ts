import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShippingQuoteError, type ShippingAdapter } from "@/lib/shipping/types";

let quoteCounter = 0;

const mocks = vi.hoisted(() => ({
  db: {
    productMarketOffer: { findUnique: vi.fn() },
    shippingQuote: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { quoteShipping, revalidateShippingQuote } from "@/lib/shipping/engine";

describe("Shipping Engine NOMA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteCounter = 0;
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture());
    mocks.db.shippingQuote.create.mockImplementation(async ({ data }) => ({
      id: `quote-${++quoteCounter}`,
      ...data,
      createdAt: new Date("2026-09-03T12:00:00.000Z"),
      updatedAt: new Date("2026-09-03T12:00:00.000Z"),
      revalidatedAt: null,
    }));
    mocks.db.shippingQuote.findUnique.mockResolvedValue(shippingQuoteFixture());
    mocks.db.shippingQuote.update.mockResolvedValue(shippingQuoteFixture());
  });

  it("rejeita CEP brasileiro invalido", async () => {
    await expect(quoteShipping(baseQuoteInput({ destinationPostalCode: "11111-111" })))
      .rejects.toMatchObject({ code: "invalid_postal_code" });
  });

  it("rejeita oferta inexistente", async () => {
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(null);

    await expect(quoteShipping(baseQuoteInput()))
      .rejects.toMatchObject({ code: "offer_not_found" });
  });

  it("rejeita produto indisponivel", async () => {
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({ product: { active: false, archivedAt: null, title: "Sofa Arco" } }));

    await expect(quoteShipping(baseQuoteInput()))
      .rejects.toMatchObject({ code: "product_unavailable" });
  });

  it("rejeita variante invalida", async () => {
    await expect(quoteShipping(baseQuoteInput({ variantId: "missing-variant" })))
      .rejects.toMatchObject({ code: "variant_unavailable" });
  });

  it("supplier MANUAL retorna compra assistida", async () => {
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({ supplier: supplierFixture({ shippingStrategy: "MANUAL", shippingActive: false, shippingCheckoutEnabled: false }) }));

    const result = await quoteShipping(baseQuoteInput());

    expect(result).toMatchObject({ type: "manual", reason: "manual_shipping" });
    expect(mocks.db.shippingQuote.create).not.toHaveBeenCalled();
  });

  it("FIXED explicito persiste quote com valor do banco", async () => {
    const result = await quoteShipping(baseQuoteInput(), { now: new Date("2026-09-03T12:00:00.000Z") });

    expect(result).toEqual({
      type: "quotes",
      quotes: [expect.objectContaining({
        quoteId: "quote-1",
        supplierId: "supplier-1",
        serviceCode: "fixed",
        serviceName: "Entrega",
        price: 120,
        currency: "BRL",
        estimatedMinDays: 8,
        estimatedMaxDays: 12,
        destinationPostalCode: "01310100",
      })],
    });
    expect(mocks.db.shippingQuote.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      strategy: "FIXED",
      price: 120,
      destinationPostalCode: "01310100",
      expiresAt: new Date("2026-09-03T12:30:00.000Z"),
    }) });
  });

  it("rejeita fornecedor indisponivel", async () => {
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({ supplier: supplierFixture({ active: false }) }));

    await expect(quoteShipping(baseQuoteInput()))
      .rejects.toMatchObject({ code: "supplier_unavailable" });
  });

  it("propaga timeout de API externa", async () => {
    const timeoutAdapter: ShippingAdapter = {
      async quote() {
        throw new ShippingQuoteError("shipping_adapter_timeout", 504, "Fornecedor indisponivel.");
      },
    };
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({
      supplier: supplierFixture({ shippingStrategy: "SUPPLIER_API", shippingActive: true, shippingCheckoutEnabled: true }),
    }));

    await expect(quoteShipping(baseQuoteInput(), { adapters: { SUPPLIER_API: timeoutAdapter } }))
      .rejects.toMatchObject({ code: "shipping_adapter_timeout" });
  });

  it("suporta multiplas opcoes de frete de adapter TABLE", async () => {
    const tableAdapter: ShippingAdapter = {
      async quote(input) {
        return [
          { serviceCode: "economy", serviceName: "Economica", price: 80, currency: input.offer.currency, estimatedMinDays: 10, estimatedMaxDays: 15 },
          { serviceCode: "express", serviceName: "Expressa", price: 160, currency: input.offer.currency, estimatedMinDays: 3, estimatedMaxDays: 5 },
        ];
      },
    };
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({
      supplier: supplierFixture({ shippingStrategy: "TABLE", shippingActive: true, shippingCheckoutEnabled: true }),
    }));

    const result = await quoteShipping(baseQuoteInput(), { adapters: { TABLE: tableAdapter } });

    expect(result).toMatchObject({ type: "quotes", quotes: [{ serviceCode: "economy" }, { serviceCode: "express" }] });
    expect(mocks.db.shippingQuote.create).toHaveBeenCalledTimes(2);
  });

  it("nao ativa US acidentalmente", async () => {
    mocks.db.productMarketOffer.findUnique.mockResolvedValue(offerFixture({ market: "US", currency: "USD" }));

    await expect(quoteShipping(baseQuoteInput()))
      .rejects.toMatchObject({ code: "market_not_enabled" });
  });

  it("revalida quote e detecta preco alterado", async () => {
    const offer = offerFixture({ shippingCost: 130 }) as unknown as Parameters<typeof revalidateShippingQuote>[0]["offer"];

    await expect(revalidateShippingQuote({
      quoteId: "quote-1",
      offer,
      variant: offer.variants[0],
      destinationPostalCode: "01310-100",
      quantity: 1,
    }, { now: new Date("2026-09-03T12:00:00.000Z") })).rejects.toMatchObject({ code: "shipping_quote_changed" });
  });
});

function baseQuoteInput(overrides: Record<string, unknown> = {}) {
  return {
    offerId: "offer-1",
    variantId: "variant-1",
    destinationPostalCode: "01310-100",
    quantity: 1,
    ...overrides,
  };
}

function offerFixture(overrides: Record<string, unknown> & { supplier?: Record<string, unknown>; product?: Record<string, unknown>; variants?: Array<Record<string, unknown>> } = {}) {
  return {
    id: "offer-1",
    productId: "product-1",
    market: "BR",
    supplierId: "supplier-1",
    supplierProductId: "supplier-product-1",
    sku: "SOFA-1",
    title: "Sofa Arco",
    slug: "sofa-arco",
    currency: "BRL",
    sellingPrice: 1300,
    stockQuantity: 3,
    availability: "AVAILABLE",
    shippingCost: 120,
    estimatedDeliveryMinDays: 8,
    estimatedDeliveryMaxDays: 12,
    sourceUrl: null,
    active: true,
    ...overrides,
    product: overrides.product ?? { active: true, archivedAt: null, title: "Sofa Arco" },
    supplier: supplierFixture(overrides.supplier),
    variants: overrides.variants?.map((variant) => ({ ...variantFixture(), ...variant })) ?? [variantFixture()],
  };
}

function supplierFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "supplier-1",
    name: "Fornecedor",
    adapterKey: "mock-catalog",
    active: true,
    shippingStrategy: "FIXED",
    shippingActive: true,
    shippingCheckoutEnabled: true,
    shippingOriginPostalCode: "04309011",
    shippingConfig: {},
    ...overrides,
  };
}

function variantFixture(overrides: Record<string, unknown> = {}) {
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
    sourceUrl: null,
    imageUrl: null,
    isDefault: true,
    position: 0,
    active: true,
    availability: "AVAILABLE",
    offerId: "offer-1",
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    updatedAt: new Date("2026-09-03T12:00:00.000Z"),
    ...overrides,
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
