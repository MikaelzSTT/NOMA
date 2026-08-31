import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    supplier: {
      upsert: vi.fn(async () => ({ id: "manual-br", name: "Manual BR", adapterKey: "manual-br", active: true, supportedMarkets: ["BR"] })),
      findUnique: vi.fn(async (): Promise<unknown> => null),
    },
    productMarketOffer: {
      findUnique: vi.fn(async (): Promise<unknown> => null),
      create: vi.fn(async () => ({ id: "offer-1" })),
    },
    category: { upsert: vi.fn(async () => ({ id: "category-1" })) },
    product: {
      findUnique: vi.fn(async (): Promise<unknown> => null),
      create: vi.fn(async () => ({ id: "product-1" })),
    },
    priceHistory: { create: vi.fn(async () => ({ id: "price-1" })) },
  };
  const db = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  return { db, transaction };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { createManualProduct, ManualProductError } from "@/lib/admin/manual-products";

const baseInput = {
  market: "BR" as const,
  supplierId: "manual:BR",
  sourceUrl: "https://example.com/produto?utm_source=test&id=10",
  title: "Cadeira Lina",
  slug: "cadeira-lina",
  description: "Cadeira em madeira natural.",
  category: "Cadeiras",
  images: ["https://cdn.example.com/cadeira.jpg"],
  costPrice: 1200,
  sellingPrice: 2200,
  compareAtPrice: 2500,
  stock: 4,
  availability: "AVAILABLE" as const,
  estimatedDeliveryMinDays: 7,
  estimatedDeliveryMaxDays: 15,
  featured: true,
  active: true,
};

describe("createManualProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.supplier.upsert.mockResolvedValue({ id: "manual-br", name: "Manual BR", adapterKey: "manual-br", active: true, supportedMarkets: ["BR"] });
    mocks.transaction.supplier.findUnique.mockResolvedValue(null);
    mocks.transaction.productMarketOffer.findUnique.mockResolvedValue(null);
    mocks.transaction.product.findUnique.mockResolvedValue(null);
  });

  it("cria fornecedor manual sem capacidades de sincronização e oferta BRL", async () => {
    const created = await createManualProduct(baseInput);

    expect(created).toMatchObject({ productId: "product-1", offerId: "offer-1", market: "BR", slug: "cadeira-lina" });
    expect(mocks.transaction.supplier.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { adapterKey: "manual-br" },
      create: expect.objectContaining({ capabilities: [], supportedMarkets: ["BR"] }),
      update: expect.objectContaining({ capabilities: [], supportedMarkets: ["BR"] }),
    }));
    expect(mocks.transaction.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        currency: "BRL",
        costPrice: 1200,
        sellingPrice: 2200,
        sourceUrl: "https://example.com/produto?id=10",
        active: true,
      }),
    }));
    expect(mocks.transaction.productMarketOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        market: "BR",
        currency: "BRL",
        estimatedDeliveryMinDays: 7,
        estimatedDeliveryMaxDays: 15,
        active: true,
      }),
    }));
  });

  it("usa fornecedor existente compatível e grava oferta US em USD", async () => {
    mocks.transaction.supplier.findUnique.mockResolvedValue({ id: "supplier-us", name: "Fornecedor US", adapterKey: "supplier-us", active: true, supportedMarkets: ["US"] });

    await createManualProduct({ ...baseInput, market: "US", supplierId: "supplier-us" });

    expect(mocks.transaction.supplier.upsert).not.toHaveBeenCalled();
    expect(mocks.transaction.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currency: "USD", supplierId: "supplier-us" }),
    }));
    expect(mocks.transaction.productMarketOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        market: "US",
        currency: "USD",
        title: "Cadeira Lina",
        images: [{ url: "https://cdn.example.com/cadeira.jpg", alt: "Cadeira Lina", position: 0, isPrimary: true }],
      }),
    }));
  });

  it("rejeita fornecedor que não opera no mercado escolhido", async () => {
    mocks.transaction.supplier.findUnique.mockResolvedValue({ id: "supplier-br", name: "Fornecedor BR", adapterKey: "supplier-br", active: true, supportedMarkets: ["BR"] });

    await expect(createManualProduct({ ...baseInput, market: "US", supplierId: "supplier-br" })).rejects.toEqual(new ManualProductError("invalid-supplier"));
    expect(mocks.transaction.product.create).not.toHaveBeenCalled();
  });

  it("rejeita slug público duplicado no mesmo mercado", async () => {
    mocks.transaction.productMarketOffer.findUnique.mockResolvedValue({ id: "offer-existing" });

    await expect(createManualProduct(baseInput)).rejects.toEqual(new ManualProductError("slug-in-use"));
    expect(mocks.transaction.product.create).not.toHaveBeenCalled();
  });
});
