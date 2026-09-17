import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
  const revalidatePath = vi.fn();
  const transaction = {
    category: { upsert: vi.fn(async () => ({ id: "category-1" })) },
    brand: { upsert: vi.fn(async () => null) },
    product: {
      findUnique: vi.fn(async () => ({
        id: "product-1",
        slug: "cadeira-lina",
        sku: "SKU-1",
        supplierId: "supplier-1",
        supplierProductId: "supplier-product-1",
        supplier: {
          id: "supplier-1",
          name: "Acorde Bem",
          supportedMarkets: ["BR"],
          shippingStrategy: "MANUAL",
        },
      })),
      update: vi.fn(async () => ({ id: "product-1" })),
    },
    productMarketOffer: {
      findFirst: vi.fn(async () => ({ id: "offer-1", sellingPrice: 2200, slug: "cadeira-lina" })),
      update: vi.fn(async () => ({ id: "offer-1" })),
      create: vi.fn(async () => ({ id: "offer-1" })),
    },
    productMarketOfferVariant: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    priceHistory: { create: vi.fn(async () => ({ id: "price-1" })) },
  };
  const db = {
    category: { upsert: vi.fn(async () => ({ id: "category-1" })) },
    brand: { upsert: vi.fn(async () => null) },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  return { db, redirect, revalidatePath, transaction };
});

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => ({ email: "admin@example.com" })),
  clearAdminSession: vi.fn(),
  createAdminSession: vi.fn(),
  validateAdminCredentials: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { updateInternalProductAction } from "@/app/admin/actions";

describe("updateInternalProductAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite edição de produto manual com prazo vazio e persiste null", async () => {
    const formData = new FormData();
    formData.set("id", "product-1");
    formData.set("market", "BR");
    formData.set("title", "Cadeira Lina");
    formData.set("sourceUrl", "https://example.com/cadeira");
    formData.set("shortDescription", "");
    formData.set("description", "");
    formData.set("category", "moveis");
    formData.set("subcategory", "");
    formData.set("brand", "");
    formData.set("stock", "4");
    formData.set("availability", "AVAILABLE");
    formData.set("shippingCost", "");
    formData.set("estimatedDelivery", "");
    formData.set("estimatedDeliveryMinDays", "");
    formData.set("estimatedDeliveryMaxDays", "");
    formData.set("pricingRuleType", "");
    formData.set("pricingRuleValue", "");
    formData.set("images", "https://cdn.example.com/cadeira.jpg");
    formData.set("hasColorMaterialOptions", "true");
    formData.set("colorMaterialOptionsJson", JSON.stringify([
      { colorHex: "#B56E3D" },
      { name: "Bouclé 2286", textureImageUrl: "https://cdn.example.com/boucle.jpg" },
      {},
    ]));
    formData.set("variantsJson", JSON.stringify([{
      label: "Padrão",
      sku: "SKU-1-A",
      attributes: {},
      costPrice: 1200,
      salePrice: 2200,
      stock: 4,
      active: true,
      availability: "AVAILABLE",
      isDefault: true,
      manualPriceOverride: true,
    }]));
    formData.set("internalNotes", "");
    formData.set("popularityScore", "0");

    await expect(updateInternalProductAction(formData)).rejects.toThrow("NEXT_REDIRECT:/admin/produtos/product-1?saved=ok&market=BR");

    expect(mocks.transaction.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        estimatedDelivery: null,
        hasColorMaterialOptions: true,
        colorMaterialOptions: {
          deleteMany: {},
          create: [
            { colorHex: "#B56E3D", sortOrder: 0 },
            { name: "Bouclé 2286", textureImageUrl: "https://cdn.example.com/boucle.jpg", sortOrder: 1 },
            { sortOrder: 2 },
          ],
        },
      }),
    }));
    expect(mocks.transaction.productMarketOffer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        estimatedDelivery: null,
        estimatedDeliveryMinDays: null,
        estimatedDeliveryMaxDays: null,
      }),
    }));
    const createManyCall = mocks.transaction.productMarketOfferVariant.createMany.mock.calls.at(-1) as unknown as [{ data: Array<Record<string, unknown>> }] | undefined;
    const variantWrite = createManyCall?.[0].data[0];
    expect(variantWrite).toMatchObject({ sku: "SKU-1-A", salePrice: 2200, stock: 4 });
    expect(variantWrite).not.toHaveProperty("colorHex");
    expect(variantWrite).not.toHaveProperty("textureImageUrl");
  });
});
