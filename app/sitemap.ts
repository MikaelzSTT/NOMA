import type { MetadataRoute } from "next";
import { getSitemapCategories, getSitemapProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getSitemapProducts(), getSitemapCategories()]);
  return [
    { url: absoluteUrl("/"), lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/buscar"), lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    ...categories.map((category) => ({ url: absoluteUrl(`/categoria/${category.slug}`), lastModified: category.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((product) => ({ url: absoluteUrl(`/produto/${product.slug}`), lastModified: product.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
