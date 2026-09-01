import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { calculateDiscount, slugify } from "@/lib/utils";
import { MANUAL_SUPPLIER_KEY, MANUAL_SUPPLIER_OPTION_PREFIX } from "@/lib/admin/manual-product-constants";

export interface ManualProductInput {
  market: Market;
  supplierId: string;
  sourceUrl: string;
  title: string;
  slug: string;
  description?: string;
  brand?: string;
  category: string;
  images: string[];
  costPrice: number;
  sellingPrice: number;
  compareAtPrice?: number;
  stock: number;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";
  estimatedDeliveryMinDays: number;
  estimatedDeliveryMaxDays: number;
  featured: boolean;
  active: boolean;
  variants?: ManualOfferVariantInput[];
}

export interface ManualOfferVariantInput {
  label: string;
  sku?: string;
  attributes: Record<string, string | number | boolean>;
  costPrice: number;
  salePrice: number;
  compareAtPrice?: number;
  stock: number;
  active: boolean;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";
  sourceUrl?: string;
  imageUrl?: string;
  isDefault?: boolean;
}

export class ManualProductError extends Error {
  constructor(readonly code: "invalid-supplier" | "slug-in-use" | "sale-price-required") {
    super(code);
  }
}

export async function createManualProduct(input: ManualProductInput) {
  return db.$transaction(async (transaction) => {
    const supplier = await resolveSupplier(transaction, input.supplierId, input.market);
    const publicSlug = slugify(input.slug);
    const existingOffer = await transaction.productMarketOffer.findUnique({
      where: { market_slug: { market: input.market, slug: publicSlug } },
      select: { id: true },
    });
    if (existingOffer) throw new ManualProductError("slug-in-use");

    const now = new Date();
    const currency = MARKET_CONFIG[input.market].currency;
    const sourceUrl = normalizeSourceUrl(input.sourceUrl);
    const category = await transaction.category.upsert({
      where: { slug: slugify(input.category) },
      update: { name: input.category },
      create: { name: input.category, slug: slugify(input.category) },
    });
    const brand = input.brand
      ? await transaction.brand.upsert({
        where: { slug: slugify(input.brand) },
        update: { name: input.brand },
        create: { name: input.brand, slug: slugify(input.brand) },
      })
      : null;
    const productSlug = await availableProductSlug(transaction, input.market === "BR" ? publicSlug : `${publicSlug}-${input.market.toLowerCase()}`);
    const supplierProductId = `manual-${input.market.toLowerCase()}-${publicSlug}`.slice(0, 255);
    const sku = `MANUAL-${input.market}-${publicSlug}`.toUpperCase().slice(0, 255);
    const estimatedDelivery = deliveryLabel(input.market, input.estimatedDeliveryMinDays, input.estimatedDeliveryMaxDays);
    const variants = normalizeManualOfferVariants(input);
    if (hasActiveVariantWithoutSalePrice(variants)) throw new ManualProductError("sale-price-required");
    const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
    const discountPercent = calculateDiscount(defaultVariant.salePrice, defaultVariant.compareAtPrice);
    const images = input.images.map((url, position) => ({
      url,
      sourceUrl: url,
      storageKey: url.startsWith("/") ? url : null,
      storageStatus: url.startsWith("/") ? "STORED" as const : "EXTERNAL" as const,
      alt: input.title,
      position,
      isPrimary: position === 0,
    }));
    const offerImages = images.map(({ url, alt, position, isPrimary }) => ({ url, alt, position, isPrimary })) as Prisma.InputJsonValue;
    const product = await transaction.product.create({
      data: {
        supplierProductId,
        supplierName: supplier.name,
        sku,
        canonicalHash: `manual:${input.market}:${publicSlug}`,
        slug: productSlug,
        title: input.title,
        description: input.description ?? null,
        costPrice: defaultVariant.costPrice,
        sellingPrice: defaultVariant.salePrice,
        compareAtPrice: defaultVariant.compareAtPrice ?? null,
        discountPercent,
        currency,
        stock: defaultVariant.stock,
        availability: defaultVariant.availability,
        estimatedDelivery,
        sourceUrl,
        attributes: { manual: true } as Prisma.InputJsonValue,
        source: supplier.adapterKey,
        active: input.active,
        featured: input.featured,
        manualPriceOverride: true,
        popularityScore: input.featured ? 100 : 0,
        syncStatus: "SYNCED",
        lastPriceSyncAt: now,
        lastStockSyncAt: now,
        lastSyncedAt: now,
        supplierId: supplier.id,
        categoryId: category.id,
        brandId: brand?.id ?? null,
        images: { create: images },
      },
    });
    const offer = await transaction.productMarketOffer.create({
      data: {
        productId: product.id,
        market: input.market,
        supplierId: supplier.id,
        supplierProductId,
        sku,
        slug: publicSlug,
        title: input.market === "US" ? input.title : null,
        description: input.market === "US" ? input.description ?? null : null,
        images: input.market === "US" ? offerImages : undefined,
        currency,
        costPrice: defaultVariant.costPrice,
        sellingPrice: defaultVariant.salePrice,
        compareAtPrice: defaultVariant.compareAtPrice ?? null,
        discountPercent,
        stockQuantity: defaultVariant.stock,
        availability: defaultVariant.availability,
        estimatedDelivery,
        estimatedDeliveryMinDays: input.estimatedDeliveryMinDays,
        estimatedDeliveryMaxDays: input.estimatedDeliveryMaxDays,
        sourceUrl,
        active: input.active,
        featured: input.featured,
        popularityScore: input.featured ? 100 : 0,
        manualPriceOverride: true,
        syncStatus: "SYNCED",
        lastPriceSyncAt: now,
        lastStockSyncAt: now,
        lastSyncedAt: now,
        variants: {
          create: variants.map((variant, position) => ({
            label: variant.label,
            sku: variant.sku ?? null,
            attributes: variant.attributes as Prisma.InputJsonValue,
            costPrice: variant.costPrice,
            salePrice: variant.salePrice,
            compareAtPrice: variant.compareAtPrice ?? null,
            stock: variant.stock,
            active: variant.active,
            availability: variant.availability,
            sourceUrl: variant.sourceUrl ?? null,
            imageUrl: variant.imageUrl ?? null,
            isDefault: variant.isDefault,
            position,
          })),
        },
      },
    });
    await transaction.priceHistory.create({
      data: {
        productId: product.id,
        productOfferId: offer.id,
        market: input.market,
        sellingPrice: defaultVariant.salePrice,
        compareAtPrice: defaultVariant.compareAtPrice,
        costPrice: defaultVariant.costPrice,
        currency,
        recordedAt: now,
      },
    });
    return { productId: product.id, offerId: offer.id, market: input.market, slug: publicSlug };
  });
}

function hasActiveVariantWithoutSalePrice(variants: Array<ManualOfferVariantInput & { isDefault: boolean }>) {
  return variants.some((variant) => variant.active && variant.costPrice > 0 && variant.salePrice <= 0);
}

async function resolveSupplier(
  transaction: Prisma.TransactionClient,
  supplierId: string,
  market: Market,
) {
  if (supplierId === `${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`) {
    const adapterKey = MANUAL_SUPPLIER_KEY[market];
    return transaction.supplier.upsert({
      where: { adapterKey },
      update: {
        name: `Manual ${market}`,
        active: true,
        authorized: true,
        capabilities: [],
        supportedMarkets: [market],
        settings: { manual: true },
      },
      create: {
        name: `Manual ${market}`,
        slug: adapterKey,
        adapterKey,
        active: true,
        authorized: true,
        capabilities: [],
        supportedMarkets: [market],
        settings: { manual: true },
      },
    });
  }

  const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier || !supplier.active || !supplier.supportedMarkets.includes(market)) {
    throw new ManualProductError("invalid-supplier");
  }
  return supplier;
}

async function availableProductSlug(transaction: Prisma.TransactionClient, preferred: string) {
  const base = slugify(preferred).slice(0, 150) || "produto";
  const existing = await transaction.product.findUnique({ where: { slug: base }, select: { id: true } });
  if (!existing) return base;
  return `${base}-${Date.now().toString(36)}`;
}

function deliveryLabel(market: Market, minDays: number, maxDays: number) {
  if (market === "US") return `${minDays}-${maxDays} business days`;
  return `${minDays} a ${maxDays} dias úteis`;
}

function normalizeManualOfferVariants(input: ManualProductInput): Array<ManualOfferVariantInput & { isDefault: boolean }> {
  const sourceVariants = input.variants?.length ? input.variants : [{
    label: "Padrão",
    sku: undefined,
    attributes: {},
    costPrice: input.costPrice,
    salePrice: input.sellingPrice,
    compareAtPrice: input.compareAtPrice,
    stock: input.stock,
    active: true,
    availability: input.availability,
    sourceUrl: undefined,
    imageUrl: undefined,
    isDefault: true,
  }];
  const defaultIndex = Math.max(0, sourceVariants.findIndex((variant) => variant.isDefault));
  return sourceVariants.map((variant, index) => ({
    label: variant.label,
    sku: variant.sku,
    attributes: variant.attributes,
    costPrice: variant.costPrice,
    salePrice: variant.salePrice,
    compareAtPrice: variant.compareAtPrice,
    stock: variant.stock,
    active: variant.active,
    availability: variant.availability,
    sourceUrl: variant.sourceUrl ? normalizeSourceUrl(variant.sourceUrl) : undefined,
    imageUrl: variant.imageUrl,
    isDefault: index === defaultIndex,
  }));
}
