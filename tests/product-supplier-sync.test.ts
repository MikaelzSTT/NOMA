import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const product = {
    id: "product-1",
    supplierProductId: "supplier-product-1",
    sku: "OLD-SKU",
    title: "Titulo editado NOMA",
    shortDescription: "Curta NOMA",
    description: "Descricao NOMA",
    subcategory: "Linha NOMA",
    currency: "BRL",
    active: false,
    featured: true,
    sourceUrl: "https://www.sleephouse.com.br/produto/p?idSku=93926",
    attributes: { conforto: "medio" },
    category: { name: "Colchoes NOMA", slug: "colchoes-noma" },
    brand: { name: "Marca NOMA" },
    images: [
      { url: "https://blob.vercel-storage.com/products/propria-1.webp", alt: "Propria 1", isPrimary: true },
      { url: "https://blob.vercel-storage.com/products/propria-2.webp", alt: "Propria 2", isPrimary: false },
    ],
    supplier: { id: "supplier-1", name: "Sleep House", adapterKey: "sleep-house", supportedMarkets: ["BR"] },
    offers: [{
      id: "offer-1",
      market: "BR",
      supplierProductId: "supplier-product-1",
      sku: "OLD-SKU",
      currency: "BRL",
      sourceUrl: "https://www.sleephouse.com.br/produto/p?idSku=93926",
      active: true,
      featured: false,
      variants: [{
        sku: "93926",
        label: "Solteiro Americano",
        attributes: { supplierVariantId: "93926" },
        costPrice: 800,
        stock: 0,
        availability: "OUT_OF_STOCK",
        sourceUrl: "https://www.sleephouse.com.br/produto/p?idSku=93926",
        imageUrl: null,
      }],
    }],
  };
  return {
    db: { product: { findUnique: vi.fn(async () => product) } },
    previewProductFromUrl: vi.fn(),
    upsertCatalogProduct: vi.fn(async () => ({ id: "product-1", slug: "produto", offerId: "offer-1" })),
    product,
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/product-import/url-importer", () => ({
  previewProductFromUrl: mocks.previewProductFromUrl,
  safeProductUrlImportError: vi.fn(() => ({ error: "MockError" })),
}));
vi.mock("@/lib/catalog/catalog-products", () => ({
  upsertCatalogProduct: mocks.upsertCatalogProduct,
}));

import {
  ProductSupplierSyncError,
  safeProductSupplierSyncMessage,
  syncExistingProductFromSupplier,
} from "@/lib/admin/product-supplier-sync";

describe("syncExistingProductFromSupplier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.product.findUnique.mockResolvedValue(mocks.product);
    mocks.previewProductFromUrl.mockResolvedValue({
      sourceUrl: "https://www.sleephouse.com.br/produto/p?idSku=93926",
      canonicalUrl: "https://www.sleephouse.com.br/canonico/p?idSku=93926",
      title: "Titulo fornecedor",
      description: "Descricao fornecedor",
      brand: "Marca fornecedor",
      category: "Colchoes",
      sku: "SKU-FORNECEDOR",
      sourcePrice: 9026.1,
      compareAtPrice: 11571.93,
      currency: "BRL",
      availability: "OUT_OF_STOCK",
      images: [{ url: "https://cdn.example/fornecedor.jpg" }],
      variants: [{
        label: "Solteiro Americano",
        sku: "93926",
        attributes: { tamanho: "Solteiro Americano" },
        sourcePrice: 9026.1,
        compareAtPrice: 11571.93,
        currency: "BRL",
        availability: "OUT_OF_STOCK",
        sourceUrl: "https://www.sleephouse.com.br/canonico/p?idSku=93926",
        imageUrl: "https://cdn.example/variante.jpg",
      }],
      warnings: [],
      extraction: { domain: "www.sleephouse.com.br", adapter: "sleep-house", sources: ["adapter"] },
    });
  });

  it("sincroniza produto existente sem criar duplicata e preserva campos manuais", async () => {
    const result = await syncExistingProductFromSupplier("product-1", "BR");

    expect(result).toMatchObject({ productId: "product-1", offerId: "offer-1", variants: 1 });
    expect(mocks.previewProductFromUrl).toHaveBeenCalledWith("https://www.sleephouse.com.br/produto/p?idSku=93926");
    expect(mocks.upsertCatalogProduct).toHaveBeenCalledWith(
      mocks.product.supplier,
      expect.objectContaining({
        supplierProductId: "supplier-product-1",
        sku: "SKU-FORNECEDOR",
        title: "Titulo editado NOMA",
        description: "Descricao NOMA",
        category: "Colchoes NOMA",
        images: [
          expect.objectContaining({ url: "https://blob.vercel-storage.com/products/propria-1.webp" }),
          expect.objectContaining({ url: "https://blob.vercel-storage.com/products/propria-2.webp" }),
        ],
        variants: [expect.objectContaining({
          sku: "93926",
          stock: 0,
          active: true,
          availability: "OUT_OF_STOCK",
          costPrice: 9026.1,
          compareAtPrice: 11571.93,
          imageUrl: "https://cdn.example/variante.jpg",
          options: { tamanho: "Solteiro Americano" },
        })],
      }),
      expect.objectContaining({
        existingProductId: "product-1",
        preserveManualPrice: true,
        preserveProductImages: true,
        preservePublicationState: true,
        preserveSupplierDataWhenMissing: true,
      }),
    );
  });

  it("falha de forma segura quando a URL original nao puder ser extraida", async () => {
    mocks.db.product.findUnique.mockResolvedValue({
      ...(mocks.product as Record<string, unknown>),
      sourceUrl: null,
      offers: [{ ...(mocks.product.offers[0] as Record<string, unknown>), sourceUrl: null }],
    } as never);

    await expect(syncExistingProductFromSupplier("product-1", "BR")).rejects.toBeInstanceOf(ProductSupplierSyncError);
    await expect(syncExistingProductFromSupplier("product-1", "BR")).rejects.toMatchObject({
      code: "missing-source-url",
      message: "Este produto nao possui URL original do fornecedor salva.",
    });
    expect(safeProductSupplierSyncMessage(new ProductSupplierSyncError("missing-source-url", "Este produto nao possui URL original do fornecedor salva."))).toBe("Este produto nao possui URL original do fornecedor salva.");
    expect(mocks.previewProductFromUrl).not.toHaveBeenCalled();
    expect(mocks.upsertCatalogProduct).not.toHaveBeenCalled();
  });
});
