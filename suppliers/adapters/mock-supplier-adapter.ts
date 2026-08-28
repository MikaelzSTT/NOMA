import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";
import { MOCK_CATALOG } from "@/suppliers/mock-catalog";
import type { NormalizedSupplierProduct, SupplierAdapter, SupplierFetchQuery, SupplierProductBatch } from "@/lib/catalog/supplier-types";

export class MockSupplierAdapter implements SupplierAdapter {
  readonly key = "mock-catalog";
  readonly name = "Catálogo demonstrativo Noma";
  readonly supportedDomains: readonly string[] = ["example.com"];
  readonly capabilities = new Set(["catalog", "product", "url-import", "category-discovery", "price", "stock"] as const);

  normalizeProduct(raw: unknown) {
    return normalizedSupplierProductSchema.parse(raw);
  }

  async fetchProduct(supplierProductId: string) {
    return MOCK_CATALOG.find((product) => product.supplierProductId === supplierProductId) ?? null;
  }

  async *fetchProducts(query: SupplierFetchQuery = {}): AsyncGenerator<SupplierProductBatch> {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    let offset = Number(query.cursor ?? 0);
    while (offset < MOCK_CATALOG.length) {
      const products = MOCK_CATALOG.slice(offset, offset + limit);
      offset += products.length;
      yield { products, nextCursor: offset < MOCK_CATALOG.length ? String(offset) : undefined, isLastPage: offset >= MOCK_CATALOG.length };
    }
  }

  supportsUrl(url: URL) {
    return url.protocol === "https:" && this.supportedDomains.includes(url.hostname) && (url.pathname === "/noma-demo" || url.pathname.startsWith("/noma-demo/"));
  }

  async fetchProductByUrl(url: URL): Promise<NormalizedSupplierProduct> {
    if (!this.supportsUrl(url)) throw new Error("Esta URL não pertence ao domínio demonstrativo autorizado.");
    if (this.isCategoryUrl(url)) throw new Error("Use a descoberta de categoria para URLs de listagem.");
    const supplierProductId = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
    const product = await this.fetchProduct(supplierProductId);
    if (!product) throw new Error("Produto não encontrado no catálogo demonstrativo.");
    return product;
  }

  async discoverProducts(categoryUrl: URL) {
    if (!this.supportsUrl(categoryUrl) || !this.isCategoryUrl(categoryUrl)) {
      throw new Error("Esta URL não é uma listagem demonstrativa suportada.");
    }
    const page = Math.max(1, Number(categoryUrl.searchParams.get("page") ?? "1") || 1);
    const perPage = 4;
    const start = (page - 1) * perPage;
    const products = MOCK_CATALOG.slice(start, start + perPage);
    const hasNext = start + perPage < MOCK_CATALOG.length;
    const nextPageUrl = hasNext ? new URL(categoryUrl) : undefined;
    if (nextPageUrl) nextPageUrl.searchParams.set("page", String(page + 1));
    return {
      products: products.map((product) => ({
        supplierProductId: product.supplierProductId,
        sku: product.sku,
        title: product.title,
        productUrl: product.sourceUrl ?? `https://example.com/noma-demo/${product.supplierProductId}`,
        imageUrl: product.images[0]?.url,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        stock: product.stock,
        availability: product.availability,
      })),
      nextPageUrl: nextPageUrl?.toString(),
      isLastPage: !hasNext,
    };
  }

  async getStock(supplierProductId: string) {
    return (await this.fetchProduct(supplierProductId))?.stock ?? null;
  }

  async getPrice(supplierProductId: string) {
    const product = await this.fetchProduct(supplierProductId);
    return product ? { costPrice: product.costPrice, currency: product.currency } : null;
  }

  private isCategoryUrl(url: URL) {
    return url.pathname === "/noma-demo" || url.pathname === "/noma-demo/";
  }
}
