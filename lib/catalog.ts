import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ProductFilters } from "@/lib/validation/product";

const publicProductSelect = {
  id: true,
  supplierName: true,
  sku: true,
  slug: true,
  title: true,
  shortDescription: true,
  description: true,
  subcategory: true,
  sellingPrice: true,
  compareAtPrice: true,
  discountPercent: true,
  currency: true,
  stock: true,
  availability: true,
  shippingCost: true,
  estimatedDelivery: true,
  attributes: true,
  featured: true,
  rating: true,
  reviewCount: true,
  installmentText: true,
  updatedAt: true,
  categoryId: true,
  brandId: true,
  supplier: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: "asc" as const } },
  variants: {
    where: { active: true },
    select: { id: true, sku: true, title: true, options: true, sellingPrice: true, stock: true },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ProductSelect;

type PublicProductRow = Prisma.ProductGetPayload<{ select: typeof publicProductSelect }>;

export interface CatalogProduct {
  id: string;
  supplierName: string;
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
  variants: Array<{ id: string; sku: string; title: string; options: Record<string, string>; sellingPrice: number | null; stock: number }>;
}

function publicWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const query = filters.q?.trim();
  return {
    active: true,
    archivedAt: null,
    availability: { not: "REMOVED" },
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.brand.length ? { brand: { slug: { in: filters.brand } } } : {}),
    ...(filters.supplier.length ? { supplier: { slug: { in: filters.supplier } } } : {}),
    ...(filters.minPrice != null || filters.maxPrice != null ? {
      sellingPrice: {
        ...(filters.minPrice != null ? { gte: filters.minPrice } : {}),
        ...(filters.maxPrice != null ? { lte: filters.maxPrice } : {}),
      },
    } : {}),
    ...(filters.minRating != null ? { rating: { gte: filters.minRating } } : {}),
    ...(filters.minDiscount != null ? { discountPercent: { gte: filters.minDiscount } } : {}),
    ...(filters.available ? { availability: "AVAILABLE", stock: { gt: 0 } } : {}),
    ...(query ? { OR: [
      { title: { contains: query, mode: "insensitive" } },
      { shortDescription: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { brand: { name: { contains: query, mode: "insensitive" } } },
      { category: { name: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
}

function productOrder(sort: ProductFilters["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc": return [{ sellingPrice: "asc" }, { popularityScore: "desc" }];
    case "price-desc": return [{ sellingPrice: "desc" }, { popularityScore: "desc" }];
    case "discount": return [{ discountPercent: "desc" }, { popularityScore: "desc" }];
    case "rating": return [{ rating: "desc" }, { reviewCount: "desc" }];
    case "newest": return [{ createdAt: "desc" }];
    default: return [{ featured: "desc" }, { popularityScore: "desc" }];
  }
}

export async function getHomeData() {
  const products = await db.product.findMany({
    where: { active: true, archivedAt: null, sellingPrice: { not: null }, availability: { not: "REMOVED" } },
    select: publicProductSelect,
    orderBy: [{ featured: "desc" }, { popularityScore: "desc" }, { createdAt: "desc" }],
    take: 6,
  });
  return { products: products.map(toPublicProduct) };
}

export async function listProducts(filters: ProductFilters) {
  const where = publicWhere(filters);
  const skip = (filters.page - 1) * filters.pageSize;
  const [products, total, brands, suppliers] = await Promise.all([
    db.product.findMany({ where, select: publicProductSelect, orderBy: productOrder(filters.sort), skip, take: filters.pageSize }),
    db.product.count({ where }),
    db.brand.findMany({
      where: { products: { some: { active: true, archivedAt: null, ...(filters.category ? { category: { slug: filters.category } } : {}) } } },
      select: { name: true, slug: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { products: { some: { active: true, archivedAt: null } } },
      select: { name: true, slug: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { products: products.map(toPublicProduct), total, brands, suppliers, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) };
}

export async function getCategory(slug: string) {
  return db.category.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, description: true, updatedAt: true } });
}

export async function getProductBySlug(slug: string) {
  const product = await db.product.findFirst({
    where: { slug, active: true, archivedAt: null, availability: { not: "REMOVED" } },
    select: publicProductSelect,
  });
  return product ? toPublicProduct(product) : null;
}

export async function getRelatedProducts(product: CatalogProduct, take = 6) {
  const products = await db.product.findMany({
    where: {
      id: { not: product.id },
      active: true,
      archivedAt: null,
      availability: { not: "REMOVED" },
      OR: [
        { categoryId: product.categoryId },
        ...(product.brandId ? [{ brandId: product.brandId }] : []),
        ...(product.sellingPrice ? [{ sellingPrice: { gte: product.sellingPrice * 0.7, lte: product.sellingPrice * 1.3 } }] : []),
      ],
    },
    select: publicProductSelect,
    orderBy: [{ popularityScore: "desc" }],
    take,
  });
  return products.map(toPublicProduct);
}

export async function getSearchSuggestions(query: string) {
  const value = query.trim();
  if (value.length < 2) return [];
  const products = await db.product.findMany({
    where: {
      active: true,
      archivedAt: null,
      OR: [
        { title: { contains: value, mode: "insensitive" } },
        { brand: { name: { contains: value, mode: "insensitive" } } },
        { category: { name: { contains: value, mode: "insensitive" } } },
      ],
    },
    select: { title: true, slug: true, sellingPrice: true, currency: true, images: { select: { url: true }, orderBy: { position: "asc" }, take: 1 } },
    orderBy: { popularityScore: "desc" },
    take: 6,
  });
  return products.map((product) => ({ title: product.title, slug: product.slug, sellingPrice: product.sellingPrice ? Number(product.sellingPrice) : null, images: product.images }));
}

export async function getSitemapProducts() {
  return db.product.findMany({ where: { active: true, archivedAt: null }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
}

export async function getSitemapCategories() {
  return db.category.findMany({ where: { products: { some: { active: true, archivedAt: null } } }, select: { slug: true, updatedAt: true } });
}

function toPublicProduct(product: PublicProductRow): CatalogProduct {
  return {
    ...product,
    sellingPrice: product.sellingPrice == null ? null : Number(product.sellingPrice),
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice),
    discountPercent: product.discountPercent == null ? null : Number(product.discountPercent),
    shippingCost: product.shippingCost == null ? null : Number(product.shippingCost),
    rating: product.rating == null ? null : Number(product.rating),
    attributes: publicAttributes(product.attributes),
    variants: product.variants.map((variant) => ({
      ...variant,
      options: publicAttributes(variant.options) as Record<string, string>,
      sellingPrice: variant.sellingPrice == null ? null : Number(variant.sellingPrice),
    })),
  };
}

function publicAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    !/(cost|custo|wholesale|atacado|supplier.*price)/i.test(key)
    && ["string", "number", "boolean"].includes(typeof item),
  )) as Record<string, string | number | boolean>;
}
