import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { calculateNomaBrSalePrice, calculateSellingPrice } from "@/lib/catalog/pricing";
import type { NormalizedSupplierProduct } from "@/lib/catalog/supplier-types";
import { canonicalProductHash } from "@/lib/catalog/product-hash";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import { productImageStorageFields } from "@/lib/product-image-storage";
import { calculateDiscount, slugify } from "@/lib/utils";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";

interface SupplierIdentity {
  id: string;
  name: string;
  adapterKey: string;
  supportedMarkets?: Market[];
}

interface UpsertOptions {
  market?: Market;
  manualPriceOverride?: boolean;
  preserveManualPrice?: boolean;
  existingProductId?: string;
  preserveProductImages?: boolean;
  preservePublicationState?: boolean;
  preserveSupplierDataWhenMissing?: boolean;
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
  const market = options.market ?? "BR";
  if (supplier.supportedMarkets?.length && !supplier.supportedMarkets.includes(market)) {
    throw new Error(`Fornecedor ${supplier.name} não opera no mercado ${market}.`);
  }
  const parsed = normalizedSupplierProductSchema.parse({
    ...product,
    sourceUrl: normalizeSourceUrl(product.sourceUrl),
    currency: product.currency || MARKET_CONFIG[market].currency,
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

  const existingOffer = await transaction.productMarketOffer.findUnique({
    where: {
      supplierId_market_supplierProductId: {
        supplierId: supplier.id,
        market,
        supplierProductId: parsed.supplierProductId,
      },
    },
    select: {
      id: true,
      productId: true,
      slug: true,
      sellingPrice: true,
      manualPriceOverride: true,
      pricingRuleType: true,
      pricingRuleValue: true,
      variants: {
        select: {
          sku: true,
          attributes: true,
          salePrice: true,
          stock: true,
          active: true,
          availability: true,
          costPrice: true,
          compareAtPrice: true,
          sourceUrl: true,
          imageUrl: true,
          isDefault: true,
          manualPriceOverride: true,
          manualActiveOverride: true,
        },
      },
      active: true,
      featured: true,
      popularityScore: true,
      removedAt: true,
      product: { select: { id: true, slug: true, archivedAt: true, active: true, featured: true, popularityScore: true } },
    },
  });
  const canonicalHash = canonicalProductHash(parsed.title, parsed.brand);
  if (options.existingProductId && existingOffer && existingOffer.productId !== options.existingProductId) {
    throw new Error("Oferta encontrada pertence a outro produto.");
  }
  const existingByForcedProductId = options.existingProductId && !existingOffer ? await transaction.product.findUnique({
    where: { id: options.existingProductId },
    select: {
      id: true,
      slug: true,
      archivedAt: true,
      active: true,
      featured: true,
      popularityScore: true,
    },
  }) : null;
  if (options.existingProductId && !existingOffer && !existingByForcedProductId) throw new Error("Produto existente não encontrado para sincronização.");
  const existingBySupplierProductId = existingOffer?.product ?? existingByForcedProductId ?? await transaction.product.findUnique({
    where: {
      supplierId_supplierProductId: {
        supplierId: supplier.id,
        supplierProductId: parsed.supplierProductId,
      },
    },
    select: {
      id: true,
      slug: true,
      archivedAt: true,
      active: true,
      featured: true,
      popularityScore: true,
    },
  });
  const existing = existingBySupplierProductId ?? (options.existingProductId
    ? null
    : await transaction.product.findFirst({
        where: {
          OR: [
            { canonicalHash },
            { sku: parsed.sku },
            ...(parsed.sourceUrl ? [{ sourceUrl: parsed.sourceUrl }] : []),
          ],
        },
        select: {
          id: true,
          slug: true,
          archivedAt: true,
          active: true,
          featured: true,
          popularityScore: true,
        },
      }));

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
    ?? (options.preserveManualPrice !== false && existingOffer?.manualPriceOverride)
    ?? false;
  const inlineRule = existingOffer?.pricingRuleType && existingOffer.pricingRuleValue
    ? { type: existingOffer.pricingRuleType, value: Number(existingOffer.pricingRuleValue), roundingIncrement: 0.01 }
    : null;
  const automaticRule = inlineRule ?? (catalogRule
    ? {
        type: catalogRule.type,
        value: Number(catalogRule.value),
        roundingIncrement: catalogRule.roundingIncrement ? Number(catalogRule.roundingIncrement) : null,
      }
    : null);
  const nomaBrAutomaticPrice = market === "BR" && parsed.costPrice != null
    ? calculateNomaBrSalePrice({ costPrice: parsed.costPrice, compareAtPrice: parsed.compareAtPrice }).salePrice
    : undefined;
  const sellingPrice = manualPriceOverride
    ? hasExplicitManualPrice
      ? parsed.sellingPrice ?? (existingOffer?.sellingPrice == null ? undefined : Number(existingOffer.sellingPrice))
      : existingOffer?.sellingPrice == null ? parsed.sellingPrice : Number(existingOffer.sellingPrice)
    : nomaBrAutomaticPrice ?? (parsed.costPrice != null && automaticRule
      ? calculateSellingPrice(parsed.costPrice, automaticRule)
      : parsed.sellingPrice);
  const compareAtPrice = parsed.compareAtPrice;
  const priceChanged = sellingPrice != null
    && (existingOffer?.sellingPrice == null || Number(existingOffer.sellingPrice) !== sellingPrice);
  const now = parsed.sourceUpdatedAt ?? new Date();
  const productSlug = existing?.slug ?? await availableSlug(
    transaction,
    parsed.slug ?? slugify(parsed.title),
    parsed.supplierProductId,
  );
  const offerSlug = existingOffer?.slug ?? await availableOfferSlug(transaction, parsed.slug ?? slugify(parsed.title), parsed.supplierProductId, market);
  const images = parsed.images.map((image, position) => ({
    url: image.url,
    sourceUrl: image.url,
    ...productImageStorageFields(image.url),
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
    active: importedVariantIsActive(variant, undefined),
  }));
  const offerVariants = parsed.variants.map((variant, index) => {
    const existingVariant = existingOffer?.variants.find((item) => variantMatchesExistingOfferVariant(item, variant));
    const costPrice = variant.costPrice
      ?? (options.preserveSupplierDataWhenMissing && existingVariant?.costPrice != null ? Number(existingVariant.costPrice) : undefined)
      ?? parsed.costPrice
      ?? 0;
    const variantCompareAtPrice = variant.compareAtPrice
      ?? (options.preserveSupplierDataWhenMissing && existingVariant?.compareAtPrice != null ? Number(existingVariant.compareAtPrice) : undefined)
      ?? compareAtPrice;
    const variantManualOverride = manualPriceOverride || Boolean(existingVariant?.manualPriceOverride);
    const salePrice = variantManualOverride
      ? hasExplicitManualPrice
        ? variant.sellingPrice ?? parsed.sellingPrice ?? sellingPrice ?? Number(existingVariant?.salePrice ?? 0)
        : existingVariant?.salePrice == null ? variant.sellingPrice ?? parsed.sellingPrice ?? sellingPrice ?? 0 : Number(existingVariant.salePrice)
      : market === "BR" && costPrice > 0
        ? calculateNomaBrSalePrice({ costPrice, compareAtPrice: variantCompareAtPrice }).salePrice
        : variant.sellingPrice ?? sellingPrice ?? 0;
    const availability = variant.availability ?? (variant.stock > 0 ? "AVAILABLE" as const : "OUT_OF_STOCK" as const);
    return {
      label: variant.title,
      sku: variant.sku,
      attributes: {
        ...variant.options,
        ...(variant.supplierVariantId ? { supplierVariantId: variant.supplierVariantId } : {}),
      } as Prisma.InputJsonValue,
      costPrice,
      salePrice,
      compareAtPrice: variantCompareAtPrice,
      stock: variant.stock,
      active: importedVariantIsActive(variant, existingVariant),
      availability,
      sourceUrl: variant.sourceUrl ?? parsed.sourceUrl,
      imageUrl: variant.imageUrl ?? (options.preserveSupplierDataWhenMissing ? existingVariant?.imageUrl ?? null : null),
      isDefault: existingVariant?.isDefault ?? index === 0,
      position: index,
      manualPriceOverride: variantManualOverride,
    };
  });

  const productCommon = {
    supplierName: supplier.name,
    sku: parsed.sku,
    slug: productSlug,
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
    active: options.preservePublicationState && existing ? existing.active : existing?.archivedAt ? false : parsed.active,
    featured: options.preservePublicationState && existing ? existing.featured : parsed.featured,
    manualPriceOverride,
    canonicalHash,
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

  const savedProduct = existing
    ? await transaction.product.update({
        where: { id: existing.id },
        data: {
          ...(market === "BR" ? productCommon : {
            categoryId: category.id,
            syncError: null,
            syncErrorAt: null,
            lastSyncedAt: now,
          }),
          ...(market === "BR" ? { supplierProductId: parsed.supplierProductId, supplierId: supplier.id } : {}),
          ...(market === "BR" && !options.preserveProductImages && images.length > 0 ? { images: { deleteMany: {}, create: images } } : {}),
          ...(market === "BR" ? { variants: { deleteMany: {}, create: variants } } : {}),
        },
      })
    : await transaction.product.create({
        data: {
          ...productCommon,
          supplierProductId: parsed.supplierProductId,
          supplierId: supplier.id,
          popularityScore: parsed.featured ? 100 : 0,
          images: { create: images },
          variants: { create: variants },
        },
      });

  const offerCommon = {
    productId: savedProduct.id,
    market,
    supplierId: supplier.id,
    supplierProductId: parsed.supplierProductId,
    sku: parsed.sku,
    slug: offerSlug,
    title: market === "US" ? parsed.title : null,
    shortDescription: market === "US" ? parsed.shortDescription : null,
    description: market === "US" ? parsed.description : null,
    images: market === "US" && images.length > 0 ? images.map(({ url, alt, position, isPrimary }) => ({ url, alt, position, isPrimary })) as Prisma.InputJsonValue : undefined,
    currency: parsed.currency || MARKET_CONFIG[market].currency,
    costPrice: parsed.costPrice,
    sellingPrice,
    compareAtPrice,
    discountPercent: calculateDiscount(sellingPrice, compareAtPrice),
    stockQuantity: parsed.stock,
    availability: parsed.availability,
    shippingCost: parsed.shippingCost,
    estimatedDelivery: parsed.estimatedDelivery,
    sourceUrl: parsed.sourceUrl,
    active: options.preservePublicationState && existingOffer ? existingOffer.active : existing?.archivedAt ? false : parsed.active,
    featured: options.preservePublicationState && existingOffer ? existingOffer.featured : parsed.featured,
    popularityScore: options.preservePublicationState && existingOffer ? existingOffer.popularityScore : parsed.featured ? Math.max(100, existingOffer?.productId ? 0 : 100) : 0,
    manualPriceOverride,
    pricingRuleType: existingOffer?.pricingRuleType ?? null,
    pricingRuleValue: existingOffer?.pricingRuleValue ?? null,
    internalNotes: market === "US" ? null : parsed.attributes.internalNotes ? String(parsed.attributes.internalNotes) : null,
    syncStatus: "SYNCED" as const,
    syncError: null,
    syncErrorAt: null,
    lastPriceSyncAt: parsed.costPrice != null || sellingPrice != null ? now : undefined,
    lastStockSyncAt: now,
    lastSyncedAt: now,
    removedAt: parsed.availability === "REMOVED" ? now : null,
    ...(offerVariants.length > 0 ? { variants: { deleteMany: {}, create: offerVariants } } : {}),
  };

  const savedOffer = existingOffer
    ? await transaction.productMarketOffer.update({
        where: { id: existingOffer.id },
        data: offerCommon,
      })
    : await transaction.productMarketOffer.create({
        data: offerCommon,
      });

  if (priceChanged && sellingPrice != null) {
    await transaction.priceHistory.create({
      data: {
        productId: savedProduct.id,
        productOfferId: savedOffer.id,
        market,
        sellingPrice,
        compareAtPrice: existingOffer?.sellingPrice,
        costPrice: parsed.costPrice,
        currency: parsed.currency,
        recordedAt: now,
      },
    });
  }
  return { ...savedProduct, slug: savedOffer.slug, offerId: savedOffer.id };
}

type ExistingOfferVariant = {
  sku: string | null;
  attributes: Prisma.JsonValue;
  salePrice: Prisma.Decimal | number;
  costPrice?: Prisma.Decimal | number | null;
  compareAtPrice?: Prisma.Decimal | number | null;
  stock: number;
  active: boolean;
  availability: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  isDefault?: boolean | null;
  manualPriceOverride: boolean;
  manualActiveOverride?: boolean | null;
};

function importedVariantIsActive(
  variant: NormalizedSupplierProduct["variants"][number],
  existingVariant: ExistingOfferVariant | undefined,
) {
  if (variant.availability === "REMOVED") return false;
  if (existingVariant?.manualActiveOverride === true) return false;
  if (existingVariant?.active === false && !isLegacyOutOfStockAutoDisabledVariant(variant, existingVariant)) return false;
  if (variant.active === false && variant.availability !== "OUT_OF_STOCK" && variant.stock > 0) return false;
  return true;
}

function isLegacyOutOfStockAutoDisabledVariant(
  variant: NormalizedSupplierProduct["variants"][number],
  existingVariant: ExistingOfferVariant,
) {
  const incomingAvailability = variant.availability ?? (variant.stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK");
  return existingVariant.availability === "OUT_OF_STOCK"
    && existingVariant.stock === 0
    && variant.stock === 0
    && incomingAvailability === "OUT_OF_STOCK";
}

function variantMatchesExistingOfferVariant(
  existing: ExistingOfferVariant,
  incoming: NormalizedSupplierProduct["variants"][number],
) {
  if (existing.sku && incoming.sku && existing.sku === incoming.sku) return true;
  if (!incoming.supplierVariantId) return false;
  const attributes = publicJsonRecord(existing.attributes);
  return attributes.supplierVariantId === incoming.supplierVariantId;
}

function publicJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

async function availableOfferSlug(
  transaction: Prisma.TransactionClient,
  preferred: string,
  supplierProductId: string,
  market: Market,
) {
  const base = slugify(preferred).slice(0, 150) || "produto";
  const exists = await transaction.productMarketOffer.findUnique({ where: { market_slug: { market, slug: base } }, select: { id: true } });
  if (!exists) return base;
  return `${base}-${slugify(supplierProductId).slice(-20)}`;
}
