import { productFilterSchema, type ProductFilters } from "@/lib/validation/product";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function list(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseProductFilters(
  raw: RawSearchParams,
  defaults: Partial<ProductFilters> = {},
): ProductFilters {
  return productFilterSchema.parse({
    ...defaults,
    ...raw,
    brand: list(raw.brand),
    supplier: list(raw.supplier ?? raw.store),
    available: raw.available ? true : undefined,
  });
}

export function buildPageUrl(pathname: string, raw: RawSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "page" || value == null) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  params.set("page", String(page));
  return `${pathname}?${params.toString()}`;
}
