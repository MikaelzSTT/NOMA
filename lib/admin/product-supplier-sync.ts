import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { CatalogVariantReconciliationError, upsertCatalogProduct } from "@/lib/catalog/catalog-products";
import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { db } from "@/lib/db";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";
import { previewProductFromUrl, safeProductUrlImportError } from "@/lib/product-import/url-importer";

export class ProductSupplierSyncError extends Error {
  constructor(
    readonly code: "product-not-found" | "offer-not-found" | "missing-source-url" | "import-failed" | "variant-discrepancy",
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
type SupplierForSupplierSync = ProductForSupplierSync["supplier"];

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
    await recordSyncFailure(product.id, offer.id, "Nao foi possivel importar dados desta URL do fornecedor.");
    throw new ProductSupplierSyncError("import-failed", "Nao foi possivel importar dados desta URL do fornecedor.", error);
  }

  const discrepancy = previewVariantDiscrepancy(offer, preview);
  if (discrepancy) {
    await recordSyncFailure(product.id, offer.id, discrepancy.message);
    console.warn("[Admin product supplier sync] variant discrepancy", {
      productId: product.id,
      offerId: offer.id,
      market,
      sourceUrl,
      existingVariantCount: discrepancy.existingVariantCount,
      incomingVariantCount: discrepancy.incomingVariantCount,
      incomingVariantLabels: discrepancy.incomingVariantLabels,
      incomingVariantSkus: discrepancy.incomingVariantSkus,
    });
    throw new ProductSupplierSyncError("variant-discrepancy", discrepancy.message);
  }

  const supplier = await resolveSupplierForPreview(product.supplier, preview, market);
  const candidate = previewToSupplierProduct(product, offer, preview, sourceUrl, supplier);
  let saved: Awaited<ReturnType<typeof upsertCatalogProduct>>;
  try {
    saved = await upsertCatalogProduct(supplier, candidate, {
      market,
      existingProductId: product.id,
      preserveManualPrice: true,
      preserveProductImages: true,
      preservePublicationState: true,
      preserveSupplierDataWhenMissing: true,
    });
  } catch (error) {
    if (error instanceof CatalogVariantReconciliationError) {
      await recordSyncFailure(product.id, offer.id, error.message);
      console.warn("[Admin product supplier sync] variant discrepancy", {
        productId: product.id,
        offerId: offer.id,
        market,
        sourceUrl,
        ...error.details,
      });
      throw new ProductSupplierSyncError("variant-discrepancy", error.message, error);
    }
    throw error;
  }

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
  supplier: SupplierForSupplierSync,
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
      hasColorMaterial: variant.hasColorMaterial,
      colorMaterialName: variant.colorMaterialName,
      materialType: variant.materialType,
      colorHex: variant.colorHex,
      textureImageUrl: normalizeSourceUrl(variant.textureImageUrl),
    };
  });
  const defaultVariant = variants[0];
  const availability = defaultVariant?.availability ?? preview.availability;
  const fallbackCost = preview.sourcePrice ?? firstDefined(variants.map((variant) => variant.costPrice));
  const supplierChanged = supplier.id !== product.supplier.id || supplier.adapterKey !== product.supplier.adapterKey;
  const supplierProductId = supplierChanged && preview.sku ? preview.sku : offer.supplierProductId || product.supplierProductId;

  return {
    supplierProductId,
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

async function resolveSupplierForPreview(
  currentSupplier: SupplierForSupplierSync,
  preview: ProductUrlImportPreview,
  market: Market,
): Promise<SupplierForSupplierSync> {
  const adapterKey = preview.extraction.adapter;
  if (!adapterKey || adapterKey === currentSupplier.adapterKey) return currentSupplier;
  const existing = await db.supplier.findFirst({
    where: { adapterKey, active: true, authorized: true, supportedMarkets: { has: market } },
    select: { id: true, name: true, adapterKey: true, supportedMarkets: true },
  });
  if (existing) return existing;
  if (adapterKey !== "sleep-house") return currentSupplier;
  return db.supplier.upsert({
    where: { adapterKey },
    update: {
      name: "Sleep House",
      baseUrl: "https://www.sleephouse.com.br",
      active: true,
      authorized: true,
      capabilities: { set: ["url-import"] },
      supportedMarkets: { set: [market] },
    },
    create: {
      name: "Sleep House",
      slug: "sleep-house",
      adapterKey,
      baseUrl: "https://www.sleephouse.com.br",
      active: true,
      authorized: true,
      capabilities: ["url-import"],
      supportedMarkets: [market],
    },
    select: { id: true, name: true, adapterKey: true, supportedMarkets: true },
  });
}

function previewVariantDiscrepancy(offer: OfferForSupplierSync, preview: ProductUrlImportPreview) {
  const existingVariantCount = offer.variants.length;
  const incomingVariantCount = preview.variants.length;
  if (existingVariantCount < 2 || incomingVariantCount >= existingVariantCount) return null;
  const incomingVariantLabels = preview.variants.map((variant) => variant.label);
  const incomingVariantSkus = preview.variants.map((variant) => variant.sku ?? "").filter(Boolean);
  const drasticReduction = incomingVariantCount <= Math.floor(existingVariantCount / 2);
  const genericSingleVariant = incomingVariantCount === 1 && isGenericDefaultVariant(preview.variants[0]);
  if (!drasticReduction && !genericSingleVariant) return null;
  return {
    existingVariantCount,
    incomingVariantCount,
    incomingVariantLabels,
    incomingVariantSkus,
    message: `Sincronizacao abortada: fornecedor retornou ${incomingVariantCount} variante(s), mas a oferta existente possui ${existingVariantCount}.`,
  };
}

function isGenericDefaultVariant(variant: ProductUrlImportPreview["variants"][number] | undefined) {
  if (!variant) return false;
  const label = variant.label.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return ["padrao", "default"].includes(label) && Object.keys(variant.attributes).length === 0;
}

async function recordSyncFailure(productId: string, offerId: string, message: string) {
  const data = { syncStatus: "ERROR" as const, syncError: message, syncErrorAt: new Date() };
  await Promise.all([
    db.product.update({ where: { id: productId }, data }),
    db.productMarketOffer.update({ where: { id: offerId }, data }),
  ]).catch((error) => {
    console.warn("[Admin product supplier sync] failed to record sync error", safeProductUrlImportError(error));
  });
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
