import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";

const mocks = vi.hoisted(() => {
  const transaction = {
    category: { upsert: vi.fn(async () => ({ id: "category-1" })) },
    brand: { upsert: vi.fn(async () => null) },
    pricingRule: { findFirst: vi.fn(async () => ({ type: "MARKUP", value: 2, roundingIncrement: 0.01 })) },
    productMarketOffer: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "offer-1", slug: "mesa-url" })),
      update: vi.fn(async () => ({ id: "offer-1", slug: "mesa-url" })),
    },
    product: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "product-1", slug: "mesa-url", archivedAt: null })),
      update: vi.fn(async () => ({ id: "product-1", slug: "mesa-url", archivedAt: null })),
    },
    priceHistory: { create: vi.fn(async () => ({ id: "price-1" })) },
  };
  const db = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  return { db, transaction };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { upsertCatalogProduct } from "@/services/catalog-products";

const product = {
  supplierProductId: "supplier-url-1",
  sku: "SUP-URL-1",
  title: "Mesa URL",
  category: "Mesas",
  images: [{ url: "https://cdn.example/mesa.jpg" }],
  costPrice: 500,
  currency: "BRL",
  stock: 2,
  availability: "AVAILABLE",
  sourceUrl: "https://supplier.example/mesa-url",
  variants: [],
  attributes: {},
  active: true,
  featured: false,
} satisfies NormalizedSupplierProduct;

describe("upsertCatalogProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.productMarketOffer.findUnique.mockResolvedValue(null);
    mocks.transaction.product.findUnique.mockResolvedValue(null);
    mocks.transaction.product.findFirst.mockResolvedValue(null);
  });

  it("não transforma costPrice em sellingPrice quando importação por URL preserva preço manual pendente", async () => {
    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      product,
      { market: "BR", manualPriceOverride: true },
    );

    expect(mocks.transaction.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        costPrice: 500,
        sellingPrice: undefined,
        manualPriceOverride: true,
      }),
    }));
    expect(mocks.transaction.productMarketOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        costPrice: 500,
        sellingPrice: undefined,
        manualPriceOverride: true,
      }),
    }));
    expect(mocks.transaction.priceHistory.create).not.toHaveBeenCalled();
  });

  it("importa variante existente com stock zero como ativa e indisponível", async () => {
    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 0, active: false, availability: "OUT_OF_STOCK" }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(createdOfferVariants()[0]).toMatchObject({
      sku: "SUP-URL-1-P",
      stock: 0,
      active: true,
      availability: "OUT_OF_STOCK",
    });
  });

  it("importa variante existente disponível como ativa e clicável", async () => {
    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 4 }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(createdOfferVariants()[0]).toMatchObject({
      sku: "SUP-URL-1-P",
      stock: 4,
      active: true,
      availability: "AVAILABLE",
    });
  });

  it("preserva variante explicitamente desativada pelo admin no reimport", async () => {
    mockExistingOffer({
      variants: [{ sku: "SUP-URL-1-P", active: false, availability: "OUT_OF_STOCK", salePrice: 900, manualPriceOverride: false }],
    });

    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 5 }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(updatedOfferVariants()[0]).toMatchObject({
      sku: "SUP-URL-1-P",
      stock: 5,
      active: false,
      availability: "AVAILABLE",
    });
  });

  it("recupera variante legada desativada automaticamente por falta de estoque quando ela ainda existe no fornecedor", async () => {
    mockExistingOffer({
      variants: [{ sku: "SUP-URL-1-P", stock: 0, active: false, availability: "OUT_OF_STOCK", salePrice: 900, manualPriceOverride: false }],
    });

    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 0, availability: "OUT_OF_STOCK" }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(updatedOfferVariants()[0]).toMatchObject({
      sku: "SUP-URL-1-P",
      stock: 0,
      active: true,
      availability: "OUT_OF_STOCK",
    });
  });

  it("não recupera variante sem estoque quando há desativação manual registrada", async () => {
    mockExistingOffer({
      variants: [{ sku: "SUP-URL-1-P", stock: 0, active: false, availability: "OUT_OF_STOCK", salePrice: 900, manualPriceOverride: false, manualActiveOverride: true }],
    });

    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 0, availability: "OUT_OF_STOCK" }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(updatedOfferVariants()[0]).toMatchObject({
      stock: 0,
      active: false,
      availability: "OUT_OF_STOCK",
    });
  });

  it("reimport de zero para estoque positivo volta a deixar a variante comprável", async () => {
    mockExistingOffer({
      variants: [{ sku: "SUP-URL-1-P", active: true, availability: "OUT_OF_STOCK", salePrice: 900, manualPriceOverride: false }],
    });

    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 3 }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(updatedOfferVariants()[0]).toMatchObject({
      stock: 3,
      active: true,
      availability: "AVAILABLE",
    });
  });

  it("reimport de estoque positivo para zero mantém visível e indisponível sem mexer no preço manual", async () => {
    mockExistingOffer({
      manualPriceOverride: true,
      sellingPrice: 1234,
      variants: [{ sku: "SUP-URL-1-P", active: true, availability: "AVAILABLE", salePrice: 1234, manualPriceOverride: true }],
    });

    await upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor", adapterKey: "supplier", supportedMarkets: ["BR"] },
      productWithVariants([{ sku: "SUP-URL-1-P", stock: 0 }]),
      { market: "BR", preserveManualPrice: true },
    );

    expect(updatedOfferVariants()[0]).toMatchObject({
      stock: 0,
      active: true,
      availability: "OUT_OF_STOCK",
      salePrice: 1234,
      manualPriceOverride: true,
    });
  });
});

function productWithVariants(variants: Array<{ sku: string; stock: number; active?: boolean; availability?: NormalizedSupplierProduct["availability"] }>) {
  return {
    ...product,
    variants: variants.map((variant) => ({
      sku: variant.sku,
      title: "Padrão",
      options: { tamanho: "Padrão" },
      costPrice: 500,
      sellingPrice: 900,
      stock: variant.stock,
      active: variant.active,
      availability: variant.availability,
    })),
  } satisfies NormalizedSupplierProduct;
}

function mockExistingOffer(overrides: {
  manualPriceOverride?: boolean;
  sellingPrice?: number;
  variants: Array<{ sku: string; stock?: number; active: boolean; availability: string; salePrice: number; manualPriceOverride: boolean; manualActiveOverride?: boolean }>;
}) {
  mocks.transaction.productMarketOffer.findUnique.mockResolvedValue({
    id: "offer-1",
    productId: "product-1",
    slug: "mesa-url",
    sellingPrice: overrides.sellingPrice ?? 900,
    manualPriceOverride: overrides.manualPriceOverride ?? false,
    pricingRuleType: null,
    pricingRuleValue: null,
    variants: overrides.variants.map((variant) => ({
      ...variant,
      stock: variant.stock ?? 0,
      manualActiveOverride: variant.manualActiveOverride ?? false,
      attributes: {},
    })),
    removedAt: null,
    product: { id: "product-1", slug: "mesa-url", archivedAt: null },
  } as never);
}

function createdOfferVariants() {
  const call = mocks.transaction.productMarketOffer.create.mock.calls.at(-1) as MockOfferWriteCall | undefined;
  return call?.[0]?.data?.variants?.create ?? [];
}

function updatedOfferVariants() {
  const call = mocks.transaction.productMarketOffer.update.mock.calls.at(-1) as MockOfferWriteCall | undefined;
  return call?.[0]?.data?.variants?.create ?? [];
}

type MockOfferWriteCall = [{
  data?: {
    variants?: {
      create?: Array<Record<string, unknown>>;
    };
  };
}];
