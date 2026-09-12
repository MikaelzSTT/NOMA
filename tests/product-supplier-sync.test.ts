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
    db: {
      product: {
        findUnique: vi.fn(async () => product),
        update: vi.fn(async () => ({})),
      },
      productMarketOffer: {
        update: vi.fn(async () => ({})),
      },
      supplier: {
        findFirst: vi.fn(async (): Promise<unknown> => null),
        upsert: vi.fn(async () => ({ id: "sleep-house-supplier", name: "Sleep House", adapterKey: "sleep-house", supportedMarkets: ["BR"] })),
      },
    },
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
    mocks.db.supplier.findFirst.mockResolvedValue(null);
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

  it("produto existente com 5 variantes e remoto com 5 reconcilia sem duplicar", async () => {
    mocks.db.product.findUnique.mockResolvedValue(productWithOfferVariants([
      { label: "Casal", sku: "94181" },
      { label: "Solteiro", sku: "94180" },
      { label: "Solteiro Americano", sku: "94182" },
      { label: "Queen Size", sku: "94183" },
      { label: "King Size", sku: "94184" },
    ]) as never);
    mocks.previewProductFromUrl.mockResolvedValue({
      sourceUrl: "https://sleephouse.vtexcommercestable.com.br/georgia/p?idSku=94181",
      canonicalUrl: "https://www.sleephouse.com.br/georgia/p?idSku=94181",
      title: "Titulo fornecedor",
      category: "Colchoes",
      sku: "AM0615_1071",
      currency: "BRL",
      availability: "AVAILABLE",
      images: [{ url: "https://cdn.example/fornecedor.jpg" }],
      variants: [
        previewVariant("Casal", "94181", 0, "OUT_OF_STOCK"),
        previewVariant("Solteiro", "94180", 3),
        previewVariant("Solteiro Americano", "94182", 0, "OUT_OF_STOCK"),
        previewVariant("Queen Size", "94183", 2),
        previewVariant("King Size", "94184", 1),
      ],
      warnings: [],
      extraction: { domain: "sleephouse.vtexcommercestable.com.br", adapter: "sleep-house", sources: ["adapter"] },
    });

    const result = await syncExistingProductFromSupplier("product-1", "BR");

    expect(result).toMatchObject({ productId: "product-1", offerId: "offer-1", variants: 5 });
    expect(mocks.upsertCatalogProduct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      variants: [
        expect.objectContaining({ sku: "94181", supplierVariantId: "94181", stock: 0, active: true, availability: "OUT_OF_STOCK" }),
        expect.objectContaining({ sku: "94180", supplierVariantId: "94180", stock: 3, active: true, availability: "AVAILABLE" }),
        expect.objectContaining({ sku: "94182", supplierVariantId: "94182" }),
        expect.objectContaining({ sku: "94183", supplierVariantId: "94183" }),
        expect.objectContaining({ sku: "94184", supplierVariantId: "94184" }),
      ],
    }), expect.objectContaining({ existingProductId: "product-1" }));
  });

  it("produto existente com 5 variantes e remoto acidental com 1 Padrao aborta e mantem intacto", async () => {
    mocks.db.product.findUnique.mockResolvedValue(productWithOfferVariants([
      { label: "Casal", sku: "94181" },
      { label: "Solteiro", sku: "94180" },
      { label: "Solteiro Americano", sku: "94182" },
      { label: "Queen Size", sku: "94183" },
      { label: "King Size", sku: "94184" },
    ]) as never);
    mocks.previewProductFromUrl.mockResolvedValue({
      sourceUrl: "https://sleephouse.vtexcommercestable.com.br/georgia/p?idSku=94181",
      title: "Login",
      sourcePrice: 100,
      currency: "BRL",
      availability: "UNKNOWN",
      images: [],
      variants: [{
        label: "Padrão",
        attributes: {},
        sourcePrice: 100,
        currency: "BRL",
        availability: "UNKNOWN",
      }],
      warnings: [],
      extraction: { domain: "sleephouse.vtexcommercestable.com.br", sources: ["html"] },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(syncExistingProductFromSupplier("product-1", "BR")).rejects.toMatchObject({ code: "variant-discrepancy" });
    expect(mocks.upsertCatalogProduct).not.toHaveBeenCalled();
    expect(mocks.db.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "product-1" },
      data: expect.objectContaining({ syncStatus: "ERROR" }),
    }));
    expect(mocks.db.productMarketOffer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "offer-1" },
      data: expect.objectContaining({ syncStatus: "ERROR" }),
    }));
    warn.mockRestore();
  });

  it("usa fornecedor identificado pelo adapter da URL quando o produto ainda esta em Manual BR", async () => {
    mocks.db.product.findUnique.mockResolvedValue({
      ...(mocks.product as Record<string, unknown>),
      supplierProductId: "manual-br-colchao-georgia",
      sku: "MANUAL-BR-COLCHAO-GEORGIA",
      supplier: { id: "manual-br", name: "Manual BR", adapterKey: "manual-br", supportedMarkets: ["BR"] },
      offers: [{
        ...(mocks.product.offers[0] as Record<string, unknown>),
        supplierProductId: "manual-br-colchao-georgia",
        sku: "MANUAL-BR-COLCHAO-GEORGIA",
      }],
    } as never);
    mocks.db.supplier.findFirst.mockResolvedValue({ id: "sleep-house", name: "Sleep House", adapterKey: "sleep-house", supportedMarkets: ["BR"] });

    await syncExistingProductFromSupplier("product-1", "BR");

    expect(mocks.upsertCatalogProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sleep-house", adapterKey: "sleep-house" }),
      expect.objectContaining({
        supplierProductId: "SKU-FORNECEDOR",
        sku: "SKU-FORNECEDOR",
      }),
      expect.objectContaining({ existingProductId: "product-1" }),
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

function productWithOfferVariants(variants: Array<{ label: string; sku: string }>) {
  return {
    ...mocks.product,
    offers: [{
      ...mocks.product.offers[0],
      variants: variants.map((variant) => ({
        ...mocks.product.offers[0].variants[0],
        label: variant.label,
        sku: variant.sku,
        attributes: { supplierVariantId: variant.sku, tamanho: variant.label },
      })),
    }],
  };
}

function previewVariant(label: string, sku: string, stock: number, availability: "AVAILABLE" | "OUT_OF_STOCK" = "AVAILABLE") {
  return {
    label,
    sku,
    attributes: { tamanho: label },
    sourcePrice: 1000,
    compareAtPrice: 1200,
    currency: "BRL",
    stock,
    availability,
    sourceUrl: `https://www.sleephouse.com.br/georgia/p?idSku=${sku}`,
    imageUrl: "https://cdn.example/variante.jpg",
  };
}
