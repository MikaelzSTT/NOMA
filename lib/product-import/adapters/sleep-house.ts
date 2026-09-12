import { absoluteUrl, compactText, extractTags, jsonFromScriptAssignments } from "@/lib/product-import/html";
import type { ImportedAvailability, ImportedProductImage, ImportedProductVariant, ProductImportAdapter, ProductUrlImportPreview } from "@/lib/product-import/types";

const SLEEP_HOUSE_DOMAINS = ["www.sleephouse.com.br", "sleephouse.com.br"];
const SLEEP_HOUSE_PUBLIC_API_ORIGIN = "https://sleephouse.vtexcommercestable.com.br";

export const sleepHouseAdapter: ProductImportAdapter = {
  id: "sleep-house",
  domains: SLEEP_HOUSE_DOMAINS,
  enhance({ html, url, sourceUrl, preview }) {
    const skuJson = sleepHouseSkuJsonFromHtml(html);
    if (!skuJson) return preview;
    const requestedUrl = sourceUrl ?? url;
    return previewFromSkuJson(skuJson, requestedUrl, preview, {
      description: descriptionFromHtml(html) ?? preview.description,
      category: categoryFromVtexEvents(html) ?? preview.category,
      canonicalUrl: preview.canonicalUrl ?? requestedUrl.toString(),
    });
  },
  async fetchPreview({ url, fetchJson }) {
    const idSku = selectedSkuFromUrl(url);
    if (!idSku) return null;
    const apiUrl = sleepHouseSkuApiUrl(idSku);
    const { json } = await fetchJson(apiUrl);
    return previewFromVtexSearch(json, url);
  },
  async enhanceRemote({ url, sourceUrl, preview, fetchJson }) {
    const requestedUrl = sourceUrl ?? url;
    const idSku = selectedSkuFromUrl(requestedUrl);
    if (!idSku) return preview;
    const apiUrl = sleepHouseSkuApiUrl(idSku);
    const { json } = await fetchJson(apiUrl);
    return previewFromVtexSearch(json, requestedUrl);
  },
};

function sleepHouseSkuJsonFromHtml(html: string) {
  return jsonFromScriptAssignments(html, ["skuJson_0"])
    .find((value) => isRecord(value) && Array.isArray(value.skus)) as Record<string, unknown> | undefined;
}

function previewFromSkuJson(
  skuJson: Record<string, unknown>,
  url: URL,
  base: ProductUrlImportPreview,
  options: { description?: string; category?: string; canonicalUrl?: string },
): ProductUrlImportPreview {
  const selectedSku = selectedSkuFromUrl(url);
  const rows = asArray(readValue(skuJson, ["skus"])).filter(isRecord);
  const selected = rows.find((row) => text(readValue(row, ["sku"])) === selectedSku) ?? rows.find((row) => readValue(row, ["available"]) === true) ?? rows[0];
  const variants = reorderSelected(rows, selectedSku).map((row) => variantFromSkuJson(row, url));
  const selectedVariant = selected ? variantFromSkuJson(selected, url) : variants[0];
  const images = variants.flatMap((variant) => imageValues([variant.imageUrl], url, variant.label));
  return {
    ...base,
    canonicalUrl: options.canonicalUrl ?? base.canonicalUrl,
    title: text(readValue(skuJson, ["name"])) ?? base.title,
    description: options.description ?? base.description,
    category: options.category ?? base.category,
    sku: text(readValue(skuJson, ["productId"])) ?? base.sku,
    sourcePrice: selectedVariant?.sourcePrice ?? base.sourcePrice,
    compareAtPrice: selectedVariant?.compareAtPrice ?? base.compareAtPrice,
    currency: "BRL",
    availability: selectedVariant?.availability ?? base.availability,
    images: images.length ? images : base.images,
    variants: variants.length ? variants : base.variants,
    extraction: { ...base.extraction, sources: [...new Set([...base.extraction.sources, "adapter"])] },
  };
}

function variantFromSkuJson(row: Record<string, unknown>, url: URL): ImportedProductVariant {
  const sku = text(readValue(row, ["sku"]));
  const label = text(readValue(row, ["skuname"])) ?? sku ?? "Variante";
  const sourceUrl = skuSourceUrl(url, sku);
  const imageUrl = normalizeVtexImageUrl(text(readValue(row, ["image"])), url);
  return {
    label,
    sku,
    attributes: attributesFromDimensions(readValue(row, ["dimensions"])),
    sourcePrice: cents(readValue(row, ["bestPrice", "spotPrice"])),
    compareAtPrice: cents(readValue(row, ["listPrice"])),
    currency: "BRL",
    availability: readValue(row, ["available"]) === true ? "AVAILABLE" : "OUT_OF_STOCK",
    sourceUrl,
    imageUrl,
  };
}

function previewFromVtexSearch(value: unknown, sourceUrl: URL): ProductUrlImportPreview | null {
  const product = asArray(value).find(isVtexProduct);
  if (!product) return null;
  const selectedSku = selectedSkuFromUrl(sourceUrl);
  const items = reorderSelected(asArray(readValue(product, ["items"])).filter(isRecord), selectedSku);
  const selected = items.find((item) => text(readValue(item, ["itemId"])) === selectedSku) ?? items.find((item) => bestOffer(item)?.IsAvailable === true) ?? items[0];
  const selectedVariant = selected ? variantFromVtexItem(product, selected, sourceUrl) : undefined;
  const canonicalUrl = productUrlWithSku(text(readValue(product, ["link"])) ?? sourceUrl.toString(), selectedSku);
  const images = dedupeImages([
    ...imageValues(vtexItemImages(selected), sourceUrl, text(readValue(selected, ["name"]))),
    ...items.flatMap((item) => imageValues(vtexItemImages(item), sourceUrl, text(readValue(item, ["name"])))),
  ]);
  return {
    sourceUrl: sourceUrl.toString(),
    canonicalUrl,
    title: text(readValue(product, ["productName", "productTitle"])),
    description: compactText(text(readValue(product, ["description"]))),
    brand: text(readValue(product, ["brand"])),
    category: categoryFromVtexProduct(product),
    sku: text(readValue(product, ["productReference", "productReferenceCode", "productId"])),
    sourcePrice: selectedVariant?.sourcePrice,
    compareAtPrice: selectedVariant?.compareAtPrice,
    currency: "BRL",
    availability: selectedVariant?.availability ?? "UNKNOWN",
    images,
    variants: items.map((item) => variantFromVtexItem(product, item, sourceUrl)),
    warnings: [],
    extraction: { domain: sourceUrl.hostname, adapter: "sleep-house", sources: ["adapter"] },
  };
}

function variantFromVtexItem(product: Record<string, unknown>, item: Record<string, unknown>, sourceUrl: URL): ImportedProductVariant {
  const itemId = text(readValue(item, ["itemId"]));
  const offer = bestOffer(item);
  const price = money(offer?.Price);
  const listPrice = money(offer?.ListPrice);
  const label = text(readValue(item, ["name", "nameComplete"])) ?? itemId ?? "Variante";
  return {
    label,
    sku: itemId,
    attributes: attributesFromVtexItem(item),
    sourcePrice: price,
    compareAtPrice: listPrice,
    currency: "BRL",
    stock: offerStock(offer),
    availability: offerAvailability(offer),
    sourceUrl: productUrlWithSku(text(readValue(product, ["link"])) ?? sourceUrl.toString(), itemId),
    imageUrl: imageValues(vtexItemImages(item), sourceUrl, label)[0]?.url,
  };
}

function sleepHouseSkuApiUrl(sku: string) {
  const url = new URL("/api/catalog_system/pub/products/search", SLEEP_HOUSE_PUBLIC_API_ORIGIN);
  url.searchParams.set("fq", `skuId:${sku}`);
  return url;
}

function selectedSkuFromUrl(url: URL) {
  return url.searchParams.get("idSku")?.trim() || undefined;
}

function skuSourceUrl(sourceUrl: URL, sku?: string) {
  if (!sku) return sourceUrl.toString();
  const url = new URL(sourceUrl);
  url.searchParams.set("idSku", sku);
  return url.toString();
}

function productUrlWithSku(rawUrl: string, sku?: string) {
  try {
    const url = new URL(rawUrl);
    if (sku) url.searchParams.set("idSku", sku);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function reorderSelected<T extends Record<string, unknown>>(items: T[], selectedSku?: string) {
  if (!selectedSku) return items;
  const selectedIndex = items.findIndex((item) => text(readValue(item, ["itemId", "sku"])) === selectedSku);
  if (selectedIndex <= 0) return items;
  return [items[selectedIndex], ...items.slice(0, selectedIndex), ...items.slice(selectedIndex + 1)];
}

function isVtexProduct(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && text(readValue(value, ["productName"])) != null && Array.isArray(readValue(value, ["items"]));
}

function bestOffer(item?: Record<string, unknown>) {
  const sellers = asArray(readValue(item, ["sellers"])).filter(isRecord);
  const seller = sellers.find((row) => readValue(row, ["sellerDefault"]) === true) ?? sellers[0];
  const offer = readValue(seller, ["commertialOffer"]);
  return isRecord(offer) ? offer : undefined;
}

function offerAvailability(offer?: Record<string, unknown>): ImportedAvailability {
  if (!offer) return "UNKNOWN";
  if (offer.IsAvailable === true || offerStock(offer) > 0) return "AVAILABLE";
  return "OUT_OF_STOCK";
}

function offerStock(offer?: Record<string, unknown>) {
  return Math.max(0, Math.floor(money(offer?.AvailableQuantity) ?? 0));
}

function vtexItemImages(item?: Record<string, unknown>) {
  return asArray(readValue(item, ["images"]))
    .filter(isRecord)
    .map((image) => text(readValue(image, ["imageUrl"])))
    .filter(Boolean) as string[];
}

function normalizeVtexImageUrl(raw: string | undefined, baseUrl: URL) {
  const url = absoluteUrl(raw, baseUrl);
  if (!url) return undefined;
  return url.replace(/\/ids\/(\d+)-\d+-\d+\//, "/ids/$1/");
}

function imageValues(values: Array<string | undefined>, url: URL, alt?: string): ImportedProductImage[] {
  return values.flatMap((value) => {
    const imageUrl = normalizeVtexImageUrl(value, url);
    return imageUrl ? [{ url: imageUrl, source: "adapter" as const, alt }] : [];
  });
}

function dedupeImages(images: ImportedProductImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.url.split("#")[0].replace(/([?&])v=\d+$/i, "$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function attributesFromVtexItem(item: Record<string, unknown>) {
  const attributes: Record<string, string | number | boolean> = {};
  for (const name of asArray(readValue(item, ["variations"]))) {
    const key = text(name);
    const value = key ? asArray(readValue(item, [key])).map((itemValue) => text(itemValue)).filter(Boolean).join(", ") : "";
    if (key && value) attributes[normalizeAttributeName(key)] = value;
  }
  return attributes;
}

function attributesFromDimensions(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([key, entry]) => [normalizeAttributeName(key), text(entry)] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function categoryFromVtexProduct(product: Record<string, unknown>) {
  const category = asArray(readValue(product, ["categories"]))
    .map((value) => text(value)?.split("/").filter(Boolean)[0])
    .find(Boolean);
  return category;
}

function categoryFromVtexEvents(html: string) {
  for (const tag of extractTags(html, "script")) {
    const match = /vtex\.events\.addData\((\{[\s\S]*?\})\);/.exec(tag.inner ?? "");
    if (!match) continue;
    try {
      const value = JSON.parse(match[1]) as Record<string, unknown>;
      return text(readValue(value, ["productCategoryName", "pageCategory", "pageDepartment"]));
    } catch {
      continue;
    }
  }
  return undefined;
}

function descriptionFromHtml(html: string) {
  return compactText(extractTags(html, "div")
    .find((tag) => tag.attrs.class?.split(/\s+/).includes("productDescription"))?.inner);
}

function normalizeAttributeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "opcao";
}

function readValue(node: unknown, keys: string[]) {
  if (!isRecord(node)) return undefined;
  for (const key of keys) {
    if (node[key] != null) return node[key];
    const found = Object.entries(node).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found?.[1] != null) return found[1];
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return compactText(String(value));
  return undefined;
}

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : undefined;
}

function cents(value: unknown) {
  const parsed = money(value);
  return parsed == null ? undefined : Math.round(parsed) / 100;
}
