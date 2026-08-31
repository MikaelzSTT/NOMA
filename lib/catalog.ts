import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { Market } from "@/lib/market";
import type { ProductFilters } from "@/lib/validation/product";

const offerSelect = {
  id: true,
  market: true,
  supplierProductId: true,
  sku: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  images: true,
  sellingPrice: true,
  compareAtPrice: true,
  discountPercent: true,
  currency: true,
  stockQuantity: true,
  availability: true,
  shippingCost: true,
  estimatedDelivery: true,
  active: true,
  featured: true,
  popularityScore: true,
  updatedAt: true,
  productId: true,
  variants: {
    where: { active: true },
    select: { id: true, label: true, sku: true, attributes: true, salePrice: true, compareAtPrice: true, stock: true, availability: true, imageUrl: true, isDefault: true, position: true },
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
  },
  supplier: { select: { id: true, name: true, slug: true } },
  product: {
    select: {
      id: true,
      supplierName: true,
      sku: true,
      slug: true,
      title: true,
      shortDescription: true,
      description: true,
      subcategory: true,
      attributes: true,
      rating: true,
      reviewCount: true,
      installmentText: true,
      updatedAt: true,
      categoryId: true,
      brandId: true,
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true } },
      images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: "asc" as const } },
      variants: {
        where: { active: true },
        select: { id: true, sku: true, title: true, options: true, sellingPrice: true, stock: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
} satisfies Prisma.ProductMarketOfferSelect;

type PublicOfferRow = Prisma.ProductMarketOfferGetPayload<{ select: typeof offerSelect }>;

export interface CatalogProduct {
  id: string;
  productId: string;
  market: Market;
  supplierName: string;
  supplierProductId: string;
  sku: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  subcategory: string | null;
  sellingPrice: number | null;
  compareAtPrice: number | null;
  discountPercent: number | null;
  currency: string;
  stock: number;
  availability: string;
  shippingCost: number | null;
  estimatedDelivery: string | null;
  attributes: Record<string, string | number | boolean>;
  featured: boolean;
  rating: number | null;
  reviewCount: number | null;
  installmentText: string | null;
  updatedAt: Date;
  categoryId: string;
  brandId: string | null;
  supplier: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string } | null;
  images: Array<{ id: string; url: string; alt: string | null; position: number }>;
  variants: CatalogProductVariant[];
}

export interface CatalogProductVariant {
  id: string;
  label: string;
  sku: string | null;
  attributes: Record<string, string | number | boolean>;
  salePrice: number;
  compareAtPrice: number | null;
  stock: number;
  availability: string;
  imageUrl: string | null;
  isDefault: boolean;
}

function publicWhere(filters: ProductFilters, market: Market): Prisma.ProductMarketOfferWhereInput {
  const query = filters.q?.trim();
  return {
    market,
    active: true,
    sellingPrice: { not: null },
    availability: { not: "REMOVED" },
    product: {
      active: true,
      archivedAt: null,
      ...(filters.category ? { category: { slug: filters.category } } : {}),
      ...(filters.brand.length ? { brand: { slug: { in: filters.brand } } } : {}),
      ...(filters.minRating != null ? { rating: { gte: filters.minRating } } : {}),
      ...(filters.minDiscount != null ? { discountPercent: { gte: filters.minDiscount } } : {}),
    },
    ...(filters.supplier.length ? { supplier: { slug: { in: filters.supplier } } } : {}),
    ...(filters.minPrice != null || filters.maxPrice != null ? {
      sellingPrice: {
        not: null,
        ...(filters.minPrice != null ? { gte: filters.minPrice } : {}),
        ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}),
      },
    } : {}),
    ...(filters.available ? { availability: "AVAILABLE", stockQuantity: { gt: 0 } } : {}),
    ...(query ? {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { shortDescription: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { product: { title: { contains: query, mode: "insensitive" } } },
        { product: { shortDescription: { contains: query, mode: "insensitive" } } },
        { product: { description: { contains: query, mode: "insensitive" } } },
        { product: { brand: { name: { contains: query, mode: "insensitive" } } } },
        { product: { category: { name: { contains: query, mode: "insensitive" } } } },
      ],
    } : {}),
  };
}

function productOrder(sort: ProductFilters["sort"]): Prisma.ProductMarketOfferOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc": return [{ sellingPrice: "asc" }, { popularityScore: "desc" }];
    case "price-desc": return [{ sellingPrice: "desc" }, { popularityScore: "desc" }];
    case "discount": return [{ discountPercent: "desc" }, { popularityScore: "desc" }];
    case "rating": return [{ product: { rating: "desc" } }, { product: { reviewCount: "desc" } }];
    case "newest": return [{ createdAt: "desc" }];
    default: return [{ featured: "desc" }, { popularityScore: "desc" }];
  }
}

export async function getHomeData({ market }: { market: Market }) {
  const products = await db.productMarketOffer.findMany({
    where: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" }, product: { active: true, archivedAt: null } },
    select: offerSelect,
    orderBy: [{ featured: "desc" }, { popularityScore: "desc" }, { createdAt: "desc" }],
    take: 6,
  });
  return { products: products.map(toPublicProduct) };
}

export async function listProducts(filters: ProductFilters, market: Market) {
  const where = publicWhere(filters, market);
  const skip = (filters.page - 1) * filters.pageSize;
  const [products, total, brands, suppliers] = await Promise.all([
    db.productMarketOffer.findMany({ where, select: offerSelect, orderBy: productOrder(filters.sort), skip, take: filters.pageSize }),
    db.productMarketOffer.count({ where }),
    db.brand.findMany({
      where: { products: { some: { active: true, archivedAt: null, offers: { some: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" } } }, ...(filters.category ? { category: { slug: filters.category } } : {}) } } },
      select: { name: true, slug: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { offers: { some: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" }, product: { active: true, archivedAt: null } } } },
      select: { name: true, slug: true, _count: { select: { offers: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    products: products.map(toPublicProduct),
    total,
    brands: brands.map((brand) => ({ ...brand, _count: { products: brand._count.products } })),
    suppliers: suppliers.map((supplier) => ({ ...supplier, _count: { products: supplier._count.offers } })),
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getCategory(slug: string, market?: Market) {
  return db.category.findFirst({
    where: { slug, ...(market ? { products: { some: { offers: { some: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" } } } } } } : {}) },
    select: { id: true, name: true, slug: true, description: true, updatedAt: true },
  });
}

export async function getProductBySlug({ slug, market }: { slug: string; market: Market }) {
  const product = await db.productMarketOffer.findFirst({
    where: { slug, market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" }, product: { active: true, archivedAt: null } },
    select: offerSelect,
  });
  return product ? toPublicProduct(product) : null;
}

export async function getEquivalentProductSlug({ productId, market }: { productId: string; market: Market }) {
  const offer = await db.productMarketOffer.findFirst({
    where: { productId, market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" } },
    select: { slug: true },
  });
  return offer?.slug ?? null;
}

export async function getRelatedProducts(product: CatalogProduct, market: Market, take = 6) {
  const products = await db.productMarketOffer.findMany({
    where: {
      id: { not: product.id },
      market,
      active: true,
      sellingPrice: { not: null },
      availability: { not: "REMOVED" },
      product: {
        active: true,
        archivedAt: null,
        OR: [
          { categoryId: product.categoryId },
          ...(product.brandId ? [{ brandId: product.brandId }] : []),
        ],
      },
      ...(product.sellingPrice ? { sellingPrice: { gte: product.sellingPrice * 0.7, lte: product.sellingPrice * 1.3 } } : {}),
    },
    select: offerSelect,
    orderBy: [{ popularityScore: "desc" }],
    take,
  });
  return products.map(toPublicProduct);
}

export async function getSearchSuggestions(query: string, market: Market) {
  const value = query.trim();
  if (value.length < 2) return [];
  const products = await db.productMarketOffer.findMany({
    where: {
      market,
      active: true,
      sellingPrice: { not: null },
      availability: { not: "REMOVED" },
      product: { active: true, archivedAt: null },
      OR: [
        { title: { contains: value, mode: "insensitive" } },
        { product: { title: { contains: value, mode: "insensitive" } } },
        { product: { brand: { name: { contains: value, mode: "insensitive" } } } },
        { product: { category: { name: { contains: value, mode: "insensitive" } } } },
      ],
    },
    select: {
      title: true,
      slug: true,
      sellingPrice: true,
      currency: true,
      images: true,
      product: { select: { title: true, images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 } } },
    },
    orderBy: { popularityScore: "desc" },
    take: 6,
  });
  return products.map((offer) => ({
    title: offer.title ?? offer.product.title,
    slug: offer.slug,
    sellingPrice: offer.sellingPrice ? Number(offer.sellingPrice) : null,
    currency: offer.currency,
    images: offerImages(offer.images, offer.product.images),
  }));
}

export async function getSitemapProducts(market: Market) {
  return db.productMarketOffer.findMany({
    where: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" }, product: { active: true, archivedAt: null } },
    select: { slug: true, updatedAt: true, productId: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSitemapCategories(market: Market) {
  return db.category.findMany({
    where: { products: { some: { offers: { some: { market, active: true, sellingPrice: { not: null }, availability: { not: "REMOVED" } } } } } },
    select: { slug: true, updatedAt: true },
  });
}

function toPublicProduct(offer: PublicOfferRow): CatalogProduct {
  const product = offer.product;
  const rawOfferVariants = Array.isArray(offer.variants) ? offer.variants : [];
  const offerVariants = rawOfferVariants.map((variant) => ({
    id: variant.id,
    label: variant.label,
    sku: variant.sku,
    attributes: publicAttributes(variant.attributes),
    salePrice: Number(variant.salePrice),
    compareAtPrice: variant.compareAtPrice == null ? null : Number(variant.compareAtPrice),
    stock: variant.stock,
    availability: variant.availability,
    imageUrl: variant.imageUrl,
    isDefault: variant.isDefault,
  }));
  const defaultOfferVariant = offerVariants.find((variant) => variant.isDefault) ?? offerVariants[0];
  const images = offerImages(offer.images, product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, position: image.position })));
  const sellingPrice = defaultOfferVariant?.salePrice ?? (offer.sellingPrice == null ? null : Number(offer.sellingPrice));
  const compareAtPrice = defaultOfferVariant ? defaultOfferVariant.compareAtPrice : offer.compareAtPrice == null ? null : Number(offer.compareAtPrice);
  return {
    id: offer.id,
    productId: offer.productId,
    market: offer.market as Market,
    supplierName: offer.supplier.name,
    supplierProductId: offer.supplierProductId,
    sku: offer.sku || product.sku,
    slug: offer.slug,
    title: offer.title ?? product.title,
    shortDescription: offer.shortDescription ?? product.shortDescription,
    description: offer.description ?? product.description,
    subcategory: product.subcategory,
    sellingPrice,
    compareAtPrice,
    discountPercent: calculatePublicDiscount(sellingPrice, compareAtPrice) ?? (offer.discountPercent == null ? null : Number(offer.discountPercent)),
    currency: offer.currency,
    stock: defaultOfferVariant?.stock ?? offer.stockQuantity,
    availability: defaultOfferVariant?.availability ?? offer.availability,
    shippingCost: offer.shippingCost == null ? null : Number(offer.shippingCost),
    estimatedDelivery: offer.estimatedDelivery,
    attributes: publicAttributes(product.attributes),
    featured: offer.featured,
    rating: product.rating == null ? null : Number(product.rating),
    reviewCount: product.reviewCount,
    installmentText: product.installmentText,
    updatedAt: offer.updatedAt,
    categoryId: product.categoryId,
    brandId: product.brandId,
    supplier: offer.supplier,
    category: product.category,
    brand: product.brand,
    images,
    variants: offerVariants.length ? offerVariants : (product.variants ?? []).map((variant, index) => ({
      id: variant.id,
      label: variant.title,
      sku: variant.sku,
      attributes: publicAttributes(variant.options),
      salePrice: variant.sellingPrice == null ? sellingPrice ?? 0 : Number(variant.sellingPrice),
      compareAtPrice: null,
      stock: variant.stock,
      availability: variant.stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK",
      imageUrl: null,
      isDefault: index === 0,
    })),
  };
}

function offerImages(value: unknown, fallback: Array<{ id?: string; url: string; alt?: string | null; position?: number }>) {
  if (Array.isArray(value)) {
    const images = value.flatMap((item, position) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const url = "url" in item ? String(item.url ?? "") : "";
      if (!url) return [];
      return [{ id: `offer-image-${position}`, url, alt: "alt" in item ? String(item.alt ?? "") || null : null, position }];
    });
    if (images.length) return images;
  }
  return fallback.map((image, position) => ({ id: image.id ?? `image-${position}`, url: image.url, alt: image.alt ?? null, position: image.position ?? position }));
}

function publicAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    !/(cost|custo|wholesale|atacado|supplier.*price)/i.test(key)
    && ["string", "number", "boolean"].includes(typeof item),
  )) as Record<string, string | number | boolean>;
}

function calculatePublicDiscount(sellingPrice: number | null, compareAtPrice: number | null) {
  if (!sellingPrice || !compareAtPrice || compareAtPrice <= sellingPrice) return null;
  return Math.round(((compareAtPrice - sellingPrice) / compareAtPrice) * 100);
}
