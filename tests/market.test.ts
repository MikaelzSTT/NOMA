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
import { getCollectionProducts, getHomeData, getProductBySlug, getSofaProducts } from "@/lib/catalog";
import { MARKET_COOKIE, offerIdentityKey, productPath } from "@/lib/market";
import { upsertCatalogProduct } from "@/services/catalog-products";
import { resolveMarketRedirect } from "@/proxy";

describe("mercados públicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.brOffer, offerRow("BR", "sofa-arco", "BRL", 8940));
    Object.assign(mocks.usOffer, offerRow("US", "sofa-arch", "USD", 1890, "Arch Sofa"));
    mocks.brOffer.supplier.shippingStrategy = "FIXED";
  });

  it("BR nunca consulta oferta US e usa BRL", async () => {
    const { products } = await getHomeData({ market: "BR" });
    expect(mocks.db.productMarketOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ market: "BR" }) }));
    expect(products[0]).toMatchObject({ market: "BR", currency: "BRL", sellingPrice: 8940 });
  });

  it("home retorna todos os produtos publicos do mercado sem limite ou duplicacao", async () => {
    const offers = Array.from({ length: 20 }, (_, index) => {
      const offer = offerRow("BR", `produto-${index + 1}`, "BRL", 1000 + index);
      return {
        ...offer,
        id: `offer-BR-${index + 1}`,
        productId: `product-${index + 1}`,
        product: {
          ...offer.product,
          id: `product-${index + 1}`,
          slug: `produto-${index + 1}`,
        },
      };
    });
    mocks.db.productMarketOffer.findMany.mockResolvedValueOnce(offers);

    const { products } = await getHomeData({ market: "BR" });
    const query = mocks.db.productMarketOffer.findMany.mock.calls.at(-1)?.[0];

    expect(query).not.toHaveProperty("take");
    expect(query).toMatchObject({
      where: {
        market: "BR",
        active: true,
        sellingPrice: { not: null },
        availability: { not: "REMOVED" },
        product: { active: true, archivedAt: null },
      },
      orderBy: [{ featured: "desc" }, { popularityScore: "desc" }, { createdAt: "desc" }],
    });
    expect(products).toHaveLength(20);
    expect(new Set(products.map((product) => product.id)).size).toBe(20);
  });

  it("US nunca consulta oferta BR e usa USD", async () => {
    const { products } = await getHomeData({ market: "US" });
    expect(mocks.db.productMarketOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ market: "US" }) }));
    expect(products[0]).toMatchObject({ market: "US", currency: "USD", sellingPrice: 1890 });
  });

  it("lista sofás publicados do mercado BR por título, subcategoria ou categoria", async () => {
    mocks.db.productMarketOffer.findMany.mockResolvedValueOnce([mocks.brOffer]);

    const products = await getSofaProducts({ market: "BR" });
    const query = mocks.db.productMarketOffer.findMany.mock.calls.at(-1)?.[0];

    expect(query).toMatchObject({
      where: {
        market: "BR",
        active: true,
        sellingPrice: { not: null },
        availability: { not: "REMOVED" },
        product: { active: true, archivedAt: null },
        OR: expect.arrayContaining([
          { product: { title: { contains: "sofa", mode: "insensitive" } } },
          { product: { subcategory: { contains: "sofá", mode: "insensitive" } } },
          { product: { category: { slug: { contains: "sofa", mode: "insensitive" } } } },
        ]),
      },
    });
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ market: "BR", slug: "sofa-arco", sellingPrice: 8940 });
  });

  it("prioriza sofás e completa a seleção editorial com outros produtos publicados", async () => {
    const sofa = offerRow("BR", "sofa-arco", "BRL", 8940);
    const chair = offerRow("BR", "poltrona-lume", "BRL", 4200);
    chair.id = "offer-chair";
    chair.productId = "product-chair";
    chair.product.id = "product-chair";
    chair.product.slug = "poltrona-lume";
    chair.product.title = "Poltrona Lume";
    chair.product.category = { id: "cat-1", name: "Móveis", slug: "moveis" };
    mocks.db.productMarketOffer.findMany
      .mockResolvedValueOnce([sofa])
      .mockResolvedValueOnce([chair]);

    const products = await getCollectionProducts({ market: "BR", take: 2 });

    expect(products.map((product) => product.title)).toEqual(["Sofá Arco", "Poltrona Lume"]);
    expect(mocks.db.productMarketOffer.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        market: "BR",
        id: { notIn: [sofa.id] },
      }),
      take: 1,
    }));
  });

  it("não retorna produto sem oferta no mercado e não expõe costPrice", async () => {
    await expect(getProductBySlug({ slug: "missing", market: "US" })).resolves.toBeNull();
    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });
    expect(product).not.toHaveProperty("costPrice");
    expect(product?.variants[0]).not.toHaveProperty("costPrice");
  });

  it("expõe somente opções visuais válidas do produto sem alterar dados comerciais", async () => {
    const withoutOptions = await getProductBySlug({ slug: "sofa-arco", market: "BR" });
    expect(withoutOptions?.colorMaterialOptions).toEqual([]);

    Object.assign(mocks.brOffer.product, {
      colorMaterialOptions: [
        { id: "hex", name: null, colorHex: "#F1EBDD", textureImageUrl: null },
        { id: "texture", name: null, colorHex: null, textureImageUrl: "https://cdn.example.com/textura.jpg" },
        { id: "named", name: "Bouclé 2286", colorHex: "#FFFFFF", textureImageUrl: "https://cdn.example.com/boucle.jpg" },
        { id: "empty", name: null, colorHex: null, textureImageUrl: null },
        { id: "name-only", name: "Sem amostra", colorHex: null, textureImageUrl: null },
      ],
    });
    const disabledOptions = await getProductBySlug({ slug: "sofa-arco", market: "BR" });
    expect(disabledOptions?.colorMaterialOptions).toEqual([]);

    Object.assign(mocks.brOffer.product, { hasColorMaterialOptions: true });
    const withOptions = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(withOptions?.colorMaterialOptions).toEqual([
      { id: "hex", name: null, colorHex: "#F1EBDD", textureImageUrl: null },
      { id: "texture", name: null, colorHex: null, textureImageUrl: "https://cdn.example.com/textura.jpg" },
      { id: "named", name: "Bouclé 2286", colorHex: "#FFFFFF", textureImageUrl: "https://cdn.example.com/boucle.jpg" },
    ]);
    expect(withOptions?.variants[0]).toMatchObject({ id: "variant-BR", sku: "SKU-1-A", salePrice: 8940, stock: 3 });
    expect(withOptions?.variants[0]).not.toHaveProperty("colorHex");
    expect(withOptions?.variants[0]).not.toHaveProperty("textureImageUrl");
  });

  it("usa prazo cadastrado como fallback mesmo quando fornecedor usa cotacao dinamica", async () => {
    mocks.brOffer.supplier.shippingStrategy = "SUPPLIER_API";

    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(product?.estimatedDelivery).toBe("5 a 7 dias úteis");
  });

  it("não expõe prazo legado quando min/max não estão cadastrados", async () => {
    Object.assign(mocks.brOffer, {
      estimatedDelivery: "Entrega em 5 a 7 dias úteis",
      estimatedDeliveryMinDays: null,
      estimatedDeliveryMaxDays: null,
    });

    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(product?.estimatedDelivery).toBeNull();
  });

  it("prioriza imagens próprias e não injeta imagem antiga da variante na galeria pública", async () => {
    Object.assign(mocks.brOffer.product, { images: [
      { id: "own-1", url: "https://blob.vercel-storage.com/produto-1.jpg", alt: "Produto 1", position: 0, isPrimary: true },
      { id: "own-2", url: "https://blob.vercel-storage.com/produto-2.jpg", alt: "Produto 2", position: 1, isPrimary: false },
    ] });
    Object.assign(mocks.brOffer.variants[0]!, { imageUrl: "https://fornecedor.example.com/imagem-antiga.jpg" });

    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(product?.images.map((image) => image.url)).toEqual([
      "https://blob.vercel-storage.com/produto-1.jpg",
      "https://blob.vercel-storage.com/produto-2.jpg",
    ]);
  });

  it("usa imagem de variante como fallback quando não há galeria própria", async () => {
    Object.assign(mocks.brOffer.product, { images: [] });
    mocks.brOffer.images = null;
    Object.assign(mocks.brOffer.variants[0]!, { imageUrl: "https://fornecedor.example.com/fallback-variante.jpg" });

    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(product?.images.map((image) => image.url)).toEqual(["https://fornecedor.example.com/fallback-variante.jpg"]);
  });

  it("remove URLs duplicadas ao compor imagens públicas", async () => {
    Object.assign(mocks.brOffer, { images: [
      { url: "https://cdn.example.com/produto.jpg", alt: "Produto", position: 0, isPrimary: true },
      { url: "https://cdn.example.com/produto.jpg", alt: "Duplicada", position: 1, isPrimary: false },
    ] });

    const product = await getProductBySlug({ slug: "sofa-arco", market: "BR" });

    expect(product?.images.map((image) => image.url)).toEqual(["https://cdn.example.com/produto.jpg"]);
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
    estimatedDeliveryMinDays: 5,
    estimatedDeliveryMaxDays: 7,
    active: true,
    featured: true,
    popularityScore: 10,
    updatedAt: new Date("2026-01-01"),
    productId: "product-1",
    supplier: { id: "supplier-1", name: "Supplier", slug: "supplier", shippingStrategy: "FIXED" },
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
      hasColorMaterialOptions: false,
      updatedAt: new Date("2026-01-01"),
      categoryId: "cat-1",
      brandId: null,
      category: { id: "cat-1", name: "Sofas", slug: "sofas" },
      brand: null,
      images: [{ id: "image-1", url: "/images/noma/products.webp", alt: "Sofa", position: 0 }],
      colorMaterialOptions: [],
      variants: [],
    },
    variants: [{
      id: `variant-${market}`,
      label: "Padrão",
      sku: "SKU-1-A",
      attributes: { tamanho: "Casal" },
      costPrice: market === "US" ? 900 : 4000,
      salePrice: sellingPrice,
      compareAtPrice: null,
      stock: 3,
      availability: "AVAILABLE",
      imageUrl: null,
      isDefault: true,
      position: 0,
    }],
  };
}

function fakeRequest(country: string, cookieMarket?: string) {
  return {
    headers: { get: (key: string) => key === "x-vercel-ip-country" ? country : null },
    cookies: { get: (key: string) => key === MARKET_COOKIE && cookieMarket ? { value: cookieMarket } : undefined },
  };
}
