import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { calculateNomaBrSalePrice } from "@/lib/catalog/pricing";
import { MARKET_CONFIG, type Market } from "@/lib/market";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { productImageStorageFields } from "@/lib/product-image-storage";
import { calculateDiscount, slugify } from "@/lib/utils";
import { MANUAL_SUPPLIER_KEY, MANUAL_SUPPLIER_OPTION_PREFIX } from "@/lib/admin/manual-product-constants";
import { getProductCategory, type ProductCategorySlug } from "@/lib/product-categories";

export interface ManualProductInput {
  market: Market;
  supplierId: string;
  sourceUrl: string;
  title: string;
  slug: string;
  description?: string;
  brand?: string;
  category: ProductCategorySlug;
  images: string[];
  costPrice: number;
  sellingPrice: number;
  compareAtPrice?: number;
  stock: number;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";
  estimatedDeliveryMinDays?: number | null;
  estimatedDeliveryMaxDays?: number | null;
  featured: boolean;
  active: boolean;
  manualPriceOverride?: boolean;
  variants?: ManualOfferVariantInput[];
}

export interface ManualOfferVariantInput {
  label: string;
  sku?: string;
  attributes: Record<string, string | number | boolean>;
  costPrice: number;
  salePrice: number;
  compareAtPrice?: number;
  manualPriceOverride?: boolean;
  stock: number;
  active: boolean;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";
  sourceUrl?: string;
  imageUrl?: string;
  hasColorMaterial?: boolean;
  colorMaterialName?: string;
  materialType?: string;
  colorHex?: string;
  textureImageUrl?: string;
  isDefault?: boolean;
}

export class ManualProductError extends Error {
  constructor(readonly code: "invalid-supplier" | "slug-in-use" | "sale-price-required" | "delivery-window-invalid" | "color-material-invalid") {
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
    const categoryDefinition = getProductCategory(input.category);
    const category = await transaction.category.upsert({
      where: { slug: categoryDefinition.slug },
      update: { name: categoryDefinition.label },
      create: { name: categoryDefinition.label, slug: categoryDefinition.slug },
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
    const estimatedDeliveryMinDays = input.estimatedDeliveryMinDays ?? null;
    const estimatedDeliveryMaxDays = input.estimatedDeliveryMaxDays ?? null;
    if (estimatedDeliveryMinDays != null && estimatedDeliveryMaxDays != null && estimatedDeliveryMaxDays < estimatedDeliveryMinDays) {
      throw new ManualProductError("delivery-window-invalid");
    }
    const estimatedDelivery = deliveryLabel(input.market, estimatedDeliveryMinDays, estimatedDeliveryMaxDays);
    const variants = normalizeManualOfferVariants(input);
    if (hasActiveVariantWithoutSalePrice(variants)) throw new ManualProductError("sale-price-required");
    if (hasInvalidColorMaterial(variants)) throw new ManualProductError("color-material-invalid");
    const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
    const manualPriceOverride = variants.some((variant) => variant.manualPriceOverride);
    const discountPercent = calculateDiscount(defaultVariant.salePrice, defaultVariant.compareAtPrice);
    const images = input.images.map((url, position) => ({
      url,
      sourceUrl: url,
      ...productImageStorageFields(url),
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
        manualPriceOverride,
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
        estimatedDeliveryMinDays,
        estimatedDeliveryMaxDays,
        sourceUrl,
        active: input.active,
        featured: input.featured,
        popularityScore: input.featured ? 100 : 0,
        manualPriceOverride,
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
            manualPriceOverride: variant.manualPriceOverride ?? true,
            manualActiveOverride: !variant.active,
            stock: variant.stock,
            active: variant.active,
            availability: variant.availability,
            sourceUrl: variant.sourceUrl ?? null,
            imageUrl: variant.imageUrl ?? null,
            hasColorMaterial: variant.hasColorMaterial,
            colorMaterialName: variant.hasColorMaterial ? variant.colorMaterialName ?? null : null,
            materialType: variant.hasColorMaterial ? variant.materialType ?? null : null,
            colorHex: variant.hasColorMaterial ? variant.colorHex ?? null : null,
            textureImageUrl: variant.hasColorMaterial ? variant.textureImageUrl ?? null : null,
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

function hasInvalidColorMaterial(variants: Array<ManualOfferVariantInput & { isDefault: boolean }>) {
  return variants.some((variant) => variant.hasColorMaterial && (
    !variant.colorMaterialName
    || (!variant.colorHex && !variant.textureImageUrl)
    || Boolean(variant.colorHex && !/^#[0-9A-F]{6}$/.test(variant.colorHex))
  ));
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

function deliveryLabel(market: Market, minDays: number | null, maxDays: number | null) {
  if (minDays == null || maxDays == null) return null;
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
    manualPriceOverride: input.manualPriceOverride ?? true,
    stock: input.stock,
    active: true,
    availability: input.availability,
    sourceUrl: undefined,
    imageUrl: undefined,
    hasColorMaterial: false,
    colorMaterialName: undefined,
    materialType: undefined,
    colorHex: undefined,
    textureImageUrl: undefined,
    isDefault: true,
  }];
  const defaultIndex = Math.max(0, sourceVariants.findIndex((variant) => variant.isDefault));
  return sourceVariants.map((variant, index) => {
    const manualPriceOverride = variant.manualPriceOverride ?? true;
    const salePrice = !manualPriceOverride && input.market === "BR" && variant.costPrice > 0
      ? calculateNomaBrSalePrice({ costPrice: variant.costPrice, compareAtPrice: variant.compareAtPrice }).salePrice
      : variant.salePrice;
    const hasColorMaterial = variant.hasColorMaterial ?? false;
    const colorMaterialName = optionalText(variant.colorMaterialName);
    const materialType = optionalText(variant.materialType);
    const colorHex = optionalText(variant.colorHex)?.toUpperCase();
    const textureImageUrl = optionalText(variant.textureImageUrl);
    return {
      label: variant.label,
      sku: variant.sku,
      attributes: variant.attributes,
      costPrice: variant.costPrice,
      salePrice,
      compareAtPrice: variant.compareAtPrice,
      manualPriceOverride,
      stock: variant.stock,
      active: variant.active,
      availability: variant.availability,
      sourceUrl: variant.sourceUrl ? normalizeSourceUrl(variant.sourceUrl) : undefined,
      imageUrl: variant.imageUrl,
      hasColorMaterial,
      colorMaterialName: hasColorMaterial ? colorMaterialName : undefined,
      materialType: hasColorMaterial ? materialType : undefined,
      colorHex: hasColorMaterial ? colorHex : undefined,
      textureImageUrl: hasColorMaterial ? textureImageUrl : undefined,
      isDefault: index === defaultIndex,
    };
  });
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
