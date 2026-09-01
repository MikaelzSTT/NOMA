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
  beforeEach(() => vi.clearAllMocks());

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
});
