import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { calculateSellingPrice } from "@/lib/catalog/pricing";
import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";
import { canonicalProductHash } from "@/lib/catalog/product-hash";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { calculateDiscount, slugify } from "@/lib/utils";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";

interface SupplierIdentity {
  id: string;
  name: string;
  adapterKey: string;
}

interface UpsertOptions {
  manualPriceOverride?: boolean;
  preserveManualPrice?: boolean;
}

export async function upsertCatalogProduct(
  supplier: SupplierIdentity,
  candidate: NormalizedSupplierProduct,
  options: UpsertOptions = {},
) {
  const product = normalizedSupplierProductSchema.parse(candidate);
  return db.$transaction((transaction) =>
    upsertCatalogProductInTransaction(transaction, supplier, product, options),
  );
}

export async function upsertCatalogProductInTransaction(
  transaction: Prisma.TransactionClient,
  supplier: SupplierIdentity,
  product: NormalizedSupplierProduct,
  options: UpsertOptions = {},
) {
  const parsed = normalizedSupplierProductSchema.parse({
    ...product,
    sourceUrl: normalizeSourceUrl(product.sourceUrl),
  });
  const categorySlug = parsed.categorySlug ?? slugify(parsed.category);
  const category = await transaction.category.upsert({
    where: { slug: categorySlug },
    update: { name: parsed.category },
    create: { name: parsed.category, slug: categorySlug },
  });
  const brand = parsed.brand
    ? await transaction.brand.upsert({
        where: { slug: slugify(parsed.brand) },
        update: { name: parsed.brand },
        create: { name: parsed.brand, slug: slugify(parsed.brand) },
      })
    : null;

  const existingBySupplierProductId = await transaction.product.findUnique({
    where: {
      supplierId_supplierProductId: {
        supplierId: supplier.id,
        supplierProductId: parsed.supplierProductId,
      },
    },
    select: {
      id: true,
      slug: true,
      sellingPrice: true,
      manualPriceOverride: true,
      pricingRuleType: true,
      pricingRuleValue: true,
      archivedAt: true,
    },
  });
  const existing = existingBySupplierProductId ?? await transaction.product.findFirst({
    where: {
      OR: [
        { sku: parsed.sku },
        ...(parsed.sourceUrl ? [{ sourceUrl: parsed.sourceUrl }] : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      sellingPrice: true,
      manualPriceOverride: true,
      pricingRuleType: true,
      pricingRuleValue: true,
      archivedAt: true,
    },
  });

  const catalogRule = await transaction.pricingRule.findFirst({
    where: {
      active: true,
      OR: [
        { supplierId: supplier.id, categoryId: category.id },
        { supplierId: supplier.id, categoryId: null },
        { supplierId: null, categoryId: category.id },
        { supplierId: null, categoryId: null },
      ],
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  const hasExplicitManualPrice = options.manualPriceOverride !== undefined;
  const manualPriceOverride = options.manualPriceOverride
    ?? (options.preserveManualPrice !== false && existing?.manualPriceOverride)
    ?? false;
  const inlineRule = existing?.pricingRuleType && existing.pricingRuleValue
    ? { type: existing.pricingRuleType, value: Number(existing.pricingRuleValue), roundingIncrement: 0.01 }
    : null;
  const automaticRule = inlineRule ?? (catalogRule
    ? {
        type: catalogRule.type,
        value: Number(catalogRule.value),
        roundingIncrement: catalogRule.roundingIncrement ? Number(catalogRule.roundingIncrement) : null,
      }
    : null);
  const sellingPrice = manualPriceOverride
    ? hasExplicitManualPrice
      ? parsed.sellingPrice ?? (existing?.sellingPrice == null ? undefined : Number(existing.sellingPrice))
      : existing?.sellingPrice == null ? parsed.sellingPrice : Number(existing.sellingPrice)
    : parsed.costPrice != null && automaticRule
      ? calculateSellingPrice(parsed.costPrice, automaticRule)
      : parsed.sellingPrice;
  const compareAtPrice = parsed.compareAtPrice;
  const priceChanged = sellingPrice != null
    && (existing?.sellingPrice == null || Number(existing.sellingPrice) !== sellingPrice);
  const now = parsed.sourceUpdatedAt ?? new Date();
  const slug = existing?.slug ?? await availableSlug(
    transaction,
    parsed.slug ?? slugify(parsed.title),
    parsed.supplierProductId,
  );
  const images = parsed.images.map((image, position) => ({
    url: image.url,
    sourceUrl: image.url,
    storageKey: image.url.startsWith("/") ? image.url : null,
    storageStatus: image.url.startsWith("/") ? "STORED" as const : "EXTERNAL" as const,
    alt: image.alt ?? parsed.title,
    position,
    isPrimary: image.isPrimary ?? position === 0,
  }));
  const variants = parsed.variants.map((variant) => ({
    supplierVariantId: variant.supplierVariantId,
    sku: variant.sku,
    title: variant.title,
    options: variant.options as Prisma.InputJsonValue,
    costPrice: variant.costPrice,
    sellingPrice: variant.sellingPrice,
    stock: variant.stock,
    active: variant.active,
  }));

  const common = {
    supplierName: supplier.name,
    sku: parsed.sku,
    slug,
    title: parsed.title,
    shortDescription: parsed.shortDescription,
    description: parsed.description,
    subcategory: parsed.subcategory,
    costPrice: parsed.costPrice,
    sellingPrice,
    compareAtPrice,
    discountPercent: calculateDiscount(sellingPrice, compareAtPrice),
    currency: parsed.currency,
    stock: parsed.stock,
    availability: parsed.availability,
    shippingCost: parsed.shippingCost,
    estimatedDelivery: parsed.estimatedDelivery,
    sourceUrl: parsed.sourceUrl,
    attributes: parsed.attributes as Prisma.InputJsonValue,
    source: supplier.adapterKey,
    active: existing?.archivedAt ? false : parsed.active,
    featured: parsed.featured,
    manualPriceOverride,
    canonicalHash: canonicalProductHash(parsed.title, parsed.brand),
    categoryId: category.id,
    brandId: brand?.id,
    syncStatus: "SYNCED" as const,
    syncError: null,
    syncErrorAt: null,
    lastPriceSyncAt: parsed.costPrice != null || sellingPrice != null ? now : undefined,
    lastStockSyncAt: now,
    lastSyncedAt: now,
    removedAt: parsed.availability === "REMOVED" ? now : null,
  };

  const saved = existing
    ? await transaction.product.update({
        where: { id: existing.id },
        data: {
          ...common,
          supplierProductId: parsed.supplierProductId,
          supplierId: supplier.id,
          ...(images.length > 0 ? { images: { deleteMany: {}, create: images } } : {}),
          variants: { deleteMany: {}, create: variants },
        },
      })
    : await transaction.product.create({
        data: {
          ...common,
          supplierProductId: parsed.supplierProductId,
          supplierId: supplier.id,
          popularityScore: parsed.featured ? 100 : 0,
          images: { create: images },
          variants: { create: variants },
        },
      });

  if (priceChanged && sellingPrice != null) {
    await transaction.priceHistory.create({
      data: {
        productId: saved.id,
        sellingPrice,
        compareAtPrice: existing?.sellingPrice,
        costPrice: parsed.costPrice,
        currency: parsed.currency,
        recordedAt: now,
      },
    });
  }
  return saved;
}

async function availableSlug(
  transaction: Prisma.TransactionClient,
  preferred: string,
  supplierProductId: string,
) {
  const base = slugify(preferred).slice(0, 150) || "produto";
  const exists = await transaction.product.findUnique({ where: { slug: base }, select: { id: true } });
  if (!exists) return base;
  return `${base}-${slugify(supplierProductId).slice(-20)}`;
}
