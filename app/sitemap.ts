import type { MetadataRoute } from "next";
import { getSitemapCategories, getSitemapProducts } from "@/lib/catalog";
import { MARKETS, categoryPath, productPath, searchPath } from "@/lib/market";
import { absoluteUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketEntries = await Promise.all(MARKETS.map(async (market) => {
    const [products, categories] = await Promise.all([getSitemapProducts(market), getSitemapCategories(market)]);
    return [
      { url: absoluteUrl(market === "BR" ? "/br" : "/us"), lastModified: new Date(), changeFrequency: "hourly" as const, priority: 1 },
      { url: absoluteUrl(searchPath(market)), lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.8 },
      ...categories.map((category) => ({ url: absoluteUrl(categoryPath(market, category.slug)), lastModified: category.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
      ...products.map((product) => ({ url: absoluteUrl(productPath(market, product.slug)), lastModified: product.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ];
  }));
  return [
    { url: absoluteUrl("/"), lastModified: new Date(), changeFrequency: "hourly", priority: 1 },
    ...marketEntries.flat(),
  ];
}
