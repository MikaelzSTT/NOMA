import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { upsertCatalogProduct } from "@/lib/catalog/catalog-products";
import { db } from "@/lib/db";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";
import { previewProductFromUrl, safeProductUrlImportError } from "@/lib/product-import/url-importer";

export class ProductSupplierSyncError extends Error {
  constructor(
    readonly code: "product-not-found" | "offer-not-found" | "missing-source-url" | "import-failed",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProductSupplierSyncError";
  }
}

export function safeProductSupplierSyncMessage(error: unknown) {
  if (error instanceof ProductSupplierSyncError) return error.message;
  return "Nao foi possivel sincronizar este produto com o fornecedor.";
}

export function safeProductSupplierSyncLog(error: unknown) {
  if (error instanceof ProductSupplierSyncError) {
    return {
      error: error.name,
      code: error.code,
      message: error.message,
      cause: safeProductUrlImportError(error.cause),
    };
  }
  return safeProductUrlImportError(error);
}

const productSyncSelect = {
  id: true,
  supplierProductId: true,
  sku: true,
  title: true,
  shortDescription: true,
  description: true,
  subcategory: true,
  currency: true,
  active: true,
  featured: true,
  sourceUrl: true,
  attributes: true,
  category: { select: { name: true, slug: true } },
  brand: { select: { name: true } },
  images: { select: { url: true, alt: true, isPrimary: true }, orderBy: { position: "asc" as const } },
  supplier: { select: { id: true, name: true, adapterKey: true, supportedMarkets: true } },
  offers: {
    select: {
      id: true,
      market: true,
      supplierProductId: true,
      sku: true,
      currency: true,
      sourceUrl: true,
      active: true,
      featured: true,
      variants: {
        select: {
          sku: true,
          label: true,
          attributes: true,
          costPrice: true,
          stock: true,
          availability: true,
          sourceUrl: true,
          imageUrl: true,
        },
        orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
  },
} satisfies Prisma.ProductSelect;

type ProductForSupplierSync = Prisma.ProductGetPayload<{ select: typeof productSyncSelect }>;
type OfferForSupplierSync = ProductForSupplierSync["offers"][number];

export async function syncExistingProductFromSupplier(productId: string, market: Market = "BR") {
  const product = await db.product.findUnique({ where: { id: productId }, select: productSyncSelect });
  if (!product) throw new ProductSupplierSyncError("product-not-found", "Produto nao encontrado.");

  const offer = product.offers.find((item) => item.market === market);
  if (!offer) throw new ProductSupplierSyncError("offer-not-found", "Este produto nao possui oferta para o mercado selecionado.");

  const sourceUrl = normalizeSourceUrl(offer.sourceUrl ?? product.sourceUrl ?? undefined);
  if (!sourceUrl) {
    throw new ProductSupplierSyncError("missing-source-url", "Este produto nao possui URL original do fornecedor salva.");
  }

  let preview: ProductUrlImportPreview;
  try {
    preview = await previewProductFromUrl(sourceUrl);
  } catch (error) {
    throw new ProductSupplierSyncError("import-failed", "Nao foi possivel importar dados desta URL do fornecedor.", error);
  }

  const candidate = previewToSupplierProduct(product, offer, preview, sourceUrl);
  const saved = await upsertCatalogProduct(product.supplier, candidate, {
    market,
    existingProductId: product.id,
    preserveManualPrice: true,
    preserveProductImages: true,
    preservePublicationState: true,
    preserveSupplierDataWhenMissing: true,
  });

  return {
    productId: saved.id,
    offerId: saved.offerId,
    syncedAt: candidate.sourceUpdatedAt ?? new Date(),
    variants: candidate.variants.length,
  };
}

function previewToSupplierProduct(
  product: ProductForSupplierSync,
  offer: OfferForSupplierSync,
  preview: ProductUrlImportPreview,
  sourceUrl: string,
): NormalizedSupplierProduct {
  const existingVariants = new Map(offer.variants.map((variant) => [variantKey(variant.sku, variant.label, variant.attributes), variant]));
  const variants = previewVariants(preview).map((variant, index) => {
    const existing = existingVariants.get(variantKey(variant.sku, variant.label, variant.attributes));
    const availability = variant.availability === "UNKNOWN"
      ? existing?.availability ?? "UNKNOWN"
      : variant.availability;
    return {
      supplierVariantId: variant.sku,
      sku: variant.sku ?? existing?.sku ?? `${offer.sku || product.sku}-${index + 1}`,
      title: variant.label,
      options: stringAttributes(variant.attributes),
      costPrice: variant.sourcePrice ?? (existing?.costPrice == null ? undefined : Number(existing.costPrice)),
      compareAtPrice: variant.compareAtPrice,
      stock: variant.stock ?? stockFromAvailability(availability, existing?.stock),
      active: availability === "OUT_OF_STOCK" || availability === "AVAILABLE" || availability === "PREORDER",
      availability,
      sourceUrl: normalizeSourceUrl(variant.sourceUrl) ?? sourceUrl,
      imageUrl: normalizeSourceUrl(variant.imageUrl) ?? existing?.imageUrl ?? undefined,
    };
  });
  const defaultVariant = variants[0];
  const availability = defaultVariant?.availability ?? preview.availability;
  const fallbackCost = preview.sourcePrice ?? firstDefined(variants.map((variant) => variant.costPrice));

  return {
    supplierProductId: offer.supplierProductId || product.supplierProductId,
    sku: preview.sku ?? offer.sku ?? product.sku,
    title: product.title,
    shortDescription: product.shortDescription ?? undefined,
    description: product.description ?? undefined,
    category: product.category.name,
    categorySlug: product.category.slug,
    subcategory: product.subcategory ?? undefined,
    brand: product.brand?.name,
    images: product.images.map((image, index) => ({
      url: image.url,
      alt: image.alt ?? product.title,
      isPrimary: image.isPrimary ?? index === 0,
    })),
    costPrice: fallbackCost,
    compareAtPrice: preview.compareAtPrice,
    currency: preview.currency ?? offer.currency ?? product.currency ?? MARKET_CONFIG.BR.currency,
    stock: defaultVariant ? defaultVariant.stock : stockFromAvailability(availability),
    availability,
    sourceUrl,
    variants,
    attributes: publicAttributes(product.attributes),
    active: product.active && offer.active,
    featured: product.featured || offer.featured,
    sourceUpdatedAt: new Date(),
  };
}

function previewVariants(preview: ProductUrlImportPreview) {
  if (preview.variants.length) return preview.variants;
  return [{
    label: "Padrao",
    sku: preview.sku,
    attributes: {},
    sourcePrice: preview.sourcePrice,
    compareAtPrice: preview.compareAtPrice,
    currency: preview.currency,
    availability: preview.availability,
    sourceUrl: preview.canonicalUrl ?? preview.sourceUrl,
    imageUrl: preview.images[0]?.url,
  }];
}

function stockFromAvailability(availability: NormalizedSupplierProduct["availability"], existingStock = 1) {
  if (availability === "OUT_OF_STOCK" || availability === "REMOVED") return 0;
  if (availability === "UNKNOWN") return existingStock;
  return Math.max(1, existingStock);
}

function stringAttributes(attributes: Record<string, string | number | boolean>) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
}

function publicAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean>;
}

function variantKey(sku?: string | null, label?: string | null, attributes?: unknown) {
  if (sku) return `sku:${sku}`;
  const sourceId = sourceVariantId(attributes);
  if (sourceId) return `source:${sourceId}`;
  return `label:${label ?? ""}`;
}

function sourceVariantId(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return undefined;
  const value = (attributes as Record<string, unknown>).supplierVariantId;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function firstDefined(values: Array<number | undefined>) {
  return values.find((value): value is number => value != null);
}
