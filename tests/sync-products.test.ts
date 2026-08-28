import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockSupplierAdapter } from "@/suppliers/adapters/mock-supplier-adapter";

const mocks = vi.hoisted(() => {
  const transaction = {
    category: { upsert: vi.fn(async () => ({ id: "category-1" })) },
    brand: { upsert: vi.fn(async () => ({ id: "brand-1" })) },
    pricingRule: { findFirst: vi.fn(async () => null) },
    product: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "product-1", slug: "sofa-arco" })),
      update: vi.fn(async () => ({ id: "product-1", slug: "sofa-arco" })),
    },
    priceHistory: { create: vi.fn(async () => ({ id: "price-1" })) },
  };
  const db = {
    syncLog: { create: vi.fn(async () => ({ id: "log-1" })), update: vi.fn(async () => ({ id: "log-1" })) },
    supplier: { upsert: vi.fn(async () => ({ id: "supplier-1", name: "Teste", adapterKey: "mock-catalog", syncCursor: null })), update: vi.fn(async () => ({ id: "supplier-1" })) },
    product: { updateMany: vi.fn(async () => ({ count: 0 })) },
    syncLock: { updateMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({ provider: "mock-catalog" })) },
    $transaction: vi.fn(async (input: unknown) => typeof input === "function" ? input(transaction) : Promise.all(input as Promise<unknown>[])),
  };
  return { db, transaction };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { syncProducts } from "@/services/sync-products";

describe("sincronização multi-fornecedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.product.findUnique.mockResolvedValue(null);
  });

  it("normaliza, salva e registra histórico de venda", async () => {
    const result = await syncProducts({ adapter: new MockSupplierAdapter(), batchSize: 10 });
    expect(result).toMatchObject({ processed: 6, succeeded: 6, failed: 0 });
    expect(mocks.transaction.product.create).toHaveBeenCalledTimes(6);
    expect(mocks.transaction.priceHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sellingPrice: 8940, costPrice: expect.any(Number) }) }));
  });
});
