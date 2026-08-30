import { describe, expect, it, vi, beforeEach } from "vitest";
import { MOCK_CATALOG } from "@/suppliers/mock-catalog";

const mocks = vi.hoisted(() => {
  const brOffer = offerRow("BR", "sofa-arco", "BRL", 8940);
  const usOffer = offerRow("US", "sofa-arch", "USD", 1890, "Arch Sofa");
  return {
    brOffer,
    usOffer,
    db: {
      productMarketOffer: {
        findMany: vi.fn(async (args) => args.where.market === "US" ? [usOffer] : [brOffer]),
        findFirst: vi.fn(async (args) => {
          if (args.where.slug === "missing") return null;
          if (args.where.productId && args.where.market === "US") return { slug: "sofa-arch" };
          if (args.where.market === "US") return usOffer;
          return brOffer;
        }),
        count: vi.fn(async () => 1),
      },
      brand: { findMany: vi.fn(async () => []) },
      supplier: { findMany: vi.fn(async () => []) },
      category: { findFirst: vi.fn(async () => ({ id: "cat-1", name: "Sofas", slug: "sofas", description: null, updatedAt: new Date("2026-01-01") })) },
      $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => callback({})),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { productMetadata } from "@/app/(store)/market-pages";
import { getHomeData, getProductBySlug } from "@/lib/catalog";
import { MARKET_COOKIE, offerIdentityKey, productPath } from "@/lib/market";
import { upsertCatalogProduct } from "@/services/catalog-products";
import { resolveMarketRedirect } from "@/proxy";

describe("mercados públicos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("BR nunca consulta oferta US e usa BRL", async () => {
    const { products } = await getHomeData({ market: "BR" });
    expect(mocks.db.productMarketOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ market: "BR" }) }));
    expect(products[0]).toMatchObject({ market: "BR", currency: "BRL", sellingPrice: 8940 });
  });

  it("US nunca consulta oferta BR e usa USD", async () => {
    const { products } = await getHomeData({ market: "US" });
    expect(mocks.db.productMarketOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ market: "US" }) }));
    expect(products[0]).toMatchObject({ market: "US", currency: "USD", sellingPrice: 1890 });
  });

  it("não retorna produto sem oferta no mercado e não expõe costPrice", async () => {
    await expect(getProductBySlug({ slug: "missing", market: "US" })).resolves.toBeNull();
    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });
    expect(product).not.toHaveProperty("costPrice");
  });

  it("preferência manual em cookie vence detecção automática", () => {
    const request = fakeRequest("US", "BR");
    expect(resolveMarketRedirect(request as never)).toBe("/br");
  });

  it("rejeita fornecedor incompatível com mercado", async () => {
    await expect(upsertCatalogProduct(
      { id: "supplier-1", name: "Fornecedor BR", adapterKey: "mock-catalog", supportedMarkets: ["BR"] },
      MOCK_CATALOG[0]!,
      { market: "US" },
    )).rejects.toThrow(/não opera no mercado US/);
  });

  it("deduplicação comercial considera market", () => {
    expect(offerIdentityKey("supplier-1", "BR", "A-1")).not.toBe(offerIdentityKey("supplier-1", "US", "A-1"));
  });

  it("gera URLs e hreflang de produtos equivalentes", async () => {
    expect(productPath("BR", "sofa-arco")).toBe("/br/produto/sofa-arco");
    expect(productPath("US", "sofa-arch")).toBe("/us/product/sofa-arch");
    const metadata = await productMetadata({ params: Promise.resolve({ slug: "sofa-arco" }), market: "BR" });
    expect(metadata.alternates).toMatchObject({
      canonical: "http://localhost:3000/br/produto/sofa-arco",
      languages: {
        "pt-BR": "http://localhost:3000/br/produto/sofa-arco",
        "en-US": "http://localhost:3000/us/product/sofa-arch",
      },
    });
  });
});

function offerRow(market: "BR" | "US", slug: string, currency: "BRL" | "USD", sellingPrice: number, title?: string) {
  return {
    id: `offer-${market}`,
    market,
    supplierProductId: "supplier-product-1",
    sku: "SKU-1",
    title,
    slug,
    shortDescription: null,
    description: null,
    images: null,
    sellingPrice,
    compareAtPrice: null,
    discountPercent: null,
    currency,
    stockQuantity: 3,
    availability: "AVAILABLE",
    shippingCost: null,
    estimatedDelivery: market === "US" ? "Ships in 5-7 business days" : "Entrega em 5 a 7 dias úteis",
    active: true,
    featured: true,
    popularityScore: 10,
    updatedAt: new Date("2026-01-01"),
    productId: "product-1",
    supplier: { id: "supplier-1", name: "Supplier", slug: "supplier" },
    costPrice: market === "US" ? 900 : 4000,
    product: {
      id: "product-1",
      supplierName: "Supplier",
      sku: "SKU-1",
      slug: "sofa-arco",
      title: "Sofá Arco",
      shortDescription: "Base",
      description: "Base description",
      subcategory: null,
      attributes: {},
      rating: null,
      reviewCount: null,
      installmentText: null,
      updatedAt: new Date("2026-01-01"),
      categoryId: "cat-1",
      brandId: null,
      category: { id: "cat-1", name: "Sofas", slug: "sofas" },
      brand: null,
      images: [{ id: "image-1", url: "/images/noma/products.webp", alt: "Sofa", position: 0 }],
      variants: [],
    },
  };
}

function fakeRequest(country: string, cookieMarket?: string) {
  return {
    headers: { get: (key: string) => key === "x-vercel-ip-country" ? country : null },
    cookies: { get: (key: string) => key === MARKET_COOKIE && cookieMarket ? { value: cookieMarket } : undefined },
  };
}
