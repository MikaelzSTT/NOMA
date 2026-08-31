import { absoluteUrl, extractTags, firstMeta, jsonFromScriptAssignments, jsonLdBlocks, readMeta } from "@/lib/product-import/html";
import type { ImportedAvailability, ImportedProductImage, ImportedProductVariant, ProductImportAdapter, ProductUrlImportPreview } from "@/lib/product-import/types";

const MAX_REMOTE_VARIANTS = 12;
const REMOTE_VARIANT_DELAY_MS = 120;
const PRICE_WARNING = "Acorde Bem não expôs preço individual seguro para uma ou mais variantes; revise preço de venda antes de salvar.";

export const colchoesAcordeBemAdapter: ProductImportAdapter = {
  id: "colchoes-acorde-bem",
  domains: ["www.colchoesacordebem.com.br", "colchoesacordebem.com.br"],
  enhance({ html, url, preview }) {
    const trayProduct = trayProductFromHtml(html);
    if (!trayProduct || typeof trayProduct !== "object") return preview;
    const product = trayProduct as Record<string, unknown>;
    const variants = variantsFromListSku(product.listSku, url, product);
    const enhanced: ProductUrlImportPreview = {
      ...preview,
      title: asText(product.nameProduct) ?? preview.title,
      brand: asText(product.brand) ?? preview.brand,
      category: categoryFromTray(product) ?? preview.category,
      sku: asText(product.reference) || asText(product.EAN) || asText(product.idProduct) || preview.sku,
      sourcePrice: asMoney(product.priceSell) ?? preview.sourcePrice,
      compareAtPrice: asMoney(product.price) ?? preview.compareAtPrice,
      currency: "BRL",
      availability: availability(product.availability) ?? preview.availability,
      canonicalUrl: preview.canonicalUrl ?? url.toString(),
      images: productImages(html, url, product, variants),
      variants: variants.length ? variants : preview.variants,
      warnings: withPriceWarning(preview.warnings, variants),
      extraction: { ...preview.extraction, sources: [...preview.extraction.sources, "adapter"] },
    };
    if (variants.length === 0) enhanced.warnings.push("Acorde Bem não expôs lista de SKUs confiável no HTML inicial.");
    return enhanced;
  },
  async enhanceRemote({ html, url, preview, fetchHtml }) {
    const product = trayProductFromHtml(html);
    if (!product) return preview;
    const baseVariants = variantsFromListSku(product.listSku, url, product);
    if (baseVariants.length === 0 || baseVariants.length > MAX_REMOTE_VARIANTS) return withUpdatedWarnings(preview, withPriceWarning(preview.warnings, baseVariants));

    const bySku = new Map(preview.variants.map((variant) => [variant.sku, { ...variant }]));
    for (const variant of baseVariants) {
      if (variant.sourcePrice != null || !variant.sourceUrl) continue;
      await delay(REMOTE_VARIANT_DELAY_MS);
      try {
        const fetched = await fetchHtml(new URL(variant.sourceUrl));
        const variantProduct = trayProductFromHtml(fetched.html);
        const variantId = variantIdFromUrl(new URL(variant.sourceUrl));
        if (!variantProduct || selectedVariantId(fetched.html, fetched.url) !== variantId) continue;
        const current = bySku.get(variant.sku) ?? { ...variant };
        bySku.set(variant.sku, {
          ...current,
          sourcePrice: asMoney(variantProduct.priceSell),
          compareAtPrice: asMoney(variantProduct.price),
          sourceUrl: fetched.url.toString(),
        });
      } catch {
        continue;
      }
    }

    const variants = preview.variants.map((variant) => bySku.get(variant.sku) ?? variant);
    return withUpdatedWarnings({ ...preview, variants }, withPriceWarning(preview.warnings, variants));
  },
};

function trayProductFromHtml(html: string) {
  return jsonFromScriptAssignments(html, ["dataLayer"])
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value) => isTrayProduct(value)) as Record<string, unknown> | undefined;
}

function isTrayProduct(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return object.pageCategory === "Produto" || object.nameProduct != null || Array.isArray(object.listSku);
}

function variantsFromListSku(value: unknown, sourceUrl: URL, product: Record<string, unknown>): ImportedProductVariant[] {
  if (!Array.isArray(value)) return [];
  const rows = value.flatMap((item): Array<ImportedProductVariant & { variantId?: string }> => {
    if (!item || typeof item !== "object") return [];
    const sku = item as Record<string, unknown>;
    const label = asText(sku.nameSku) ?? asText(sku.idSku) ?? "Variante";
    const imageUrl = asText(sku.urlImage);
    const idSku = asText(sku.idSku);
    const variantId = variantIdFromSku(idSku);
    return [{
      label,
      sku: asText(sku.reference) || asText(sku.EAN) || idSku,
      attributes: attributesFromSkuLabel(label),
      sourcePrice: asMoney(sku.sellPrice),
      compareAtPrice: asMoney(sku.price),
      currency: "BRL",
      availability: availability(sku.availability) ?? "UNKNOWN" as ImportedAvailability,
      sourceUrl: variantSourceUrl(sourceUrl, variantId),
      imageUrl: imageUrl || undefined,
      variantId,
    }];
  });
  const salePrices = new Set(rows.map((row) => row.sourcePrice).filter((price): price is number => price != null));
  const repeatedGlobalSalePrice = rows.length > 1 && salePrices.size === 1 && salePrices.has(asMoney(product.priceSell) ?? Number.NaN);
  const selectedId = selectedVariantId("", sourceUrl);
  return rows.map(({ variantId, ...variant }) => ({
    ...variant,
    sourcePrice: repeatedGlobalSalePrice && variantId !== selectedId ? undefined : variant.sourcePrice,
  }));
}

function productImages(html: string, url: URL, product: Record<string, unknown>, variants: ImportedProductVariant[]) {
  return dedupeAdapterImages([
    ...imageValues([asText(product.urlImage)], url, "adapter", asText(product.nameProduct)),
    ...variants.flatMap((variant) => imageValues([variant.imageUrl], url, "adapter", variant.label)),
    ...galleryImages(html, url),
    ...jsonLdProductImages(html, url),
    ...ogImages(html, url),
  ]).slice(0, 10);
}

function galleryImages(html: string, url: URL) {
  const productImagesStart = indexOfPattern(html, /<div\b[^>]*class=["'][^"']*\bproduct-images\b[^"']*["'][^>]*>/i);
  const galleryStart = indexOfPattern(html, /<div\b[^>]*class=["'][^"']*\bproduct-gallery\b[^"']*["'][^>]*>/i);
  const block = tagBlock(html, productImagesStart >= 0 ? productImagesStart : galleryStart);
  return extractTags(block, "img").flatMap((tag) => (
    imageValues([tag.attrs["data-src"] || tag.attrs["data-zoom"] || tag.attrs.src], url, "adapter", tag.attrs.alt)
  ));
}

function indexOfPattern(value: string, pattern: RegExp) {
  return pattern.exec(value)?.index ?? -1;
}

function tagBlock(html: string, start: number) {
  if (start < 0) return "";
  const divPattern = /<\/?div\b[^>]*>/gi;
  divPattern.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = divPattern.exec(html))) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, divPattern.lastIndex);
  }
  return html.slice(start, start + 10_000);
}

function jsonLdProductImages(html: string, url: URL) {
  return jsonLdBlocks(html)
    .flatMap((block) => walkObjects(block))
    .filter((node) => String(readValue(node, ["@type"]) ?? "").toLowerCase().includes("product"))
    .flatMap((node) => imageValues(asArray(readValue(node, ["image", "images"])).map((value) => asText(value)), url, "json-ld", asText(readValue(node, ["name"]))));
}

function ogImages(html: string, url: URL) {
  const meta = readMeta(html);
  return imageValues([firstMeta(meta, ["og:image", "og:image:url", "twitter:image"])], url, "meta");
}

function imageValues(values: Array<string | undefined>, url: URL, source: ImportedProductImage["source"], alt?: string) {
  return values.flatMap((value) => {
    const imageUrl = absoluteUrl(value, url);
    return imageUrl ? [{ url: imageUrl, source, alt }] : [];
  });
}

function dedupeAdapterImages(images: ImportedProductImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url.startsWith("https://")) return false;
    const key = image.url.split("#")[0].replace(/\/(?:90|180|300|600)_([^/]+)$/i, "/$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attributesFromSkuLabel(label: string) {
  const attributes: Record<string, string> = {};
  const prefixed = /^([^:]{2,40}):\s*(.+)$/.exec(label);
  if (prefixed) attributes[normalizeAttributeName(prefixed[1])] = prefixed[2].trim();
  const dimension = /(\d{2,3})\s*x\s*(\d{2,3})(?:\s*x\s*(\d{1,3}))?/i.exec(label);
  if (dimension) {
    attributes.dimensoes = dimension[0].replace(/\s+/g, "");
    if (!attributes.tamanho) attributes.tamanho = dimension[0].replace(/\s+/g, "");
  }
  const color = /\b(cor|tecido)\s+([a-zà-ÿ\s-]{3,40})/i.exec(label);
  if (color) attributes.cor = color[2].trim();
  return attributes;
}

function categoryFromTray(product: Record<string, unknown>) {
  const breadcrumb = product.breadcrumbDetails;
  if (Array.isArray(breadcrumb)) {
    const last = [...breadcrumb].reverse().find((item) => item && typeof item === "object" && "name" in item) as { name?: unknown } | undefined;
    const value = asText(last?.name);
    if (value) return value;
  }
  return asText(product.category);
}

function availability(value: unknown) {
  const text = asText(value)?.toLowerCase();
  if (!text) return undefined;
  if (["yes", "sim", "true", "available"].includes(text)) return "AVAILABLE" as const;
  if (["no", "nao", "não", "false", "unavailable"].includes(text)) return "OUT_OF_STOCK" as const;
  return undefined;
}

function asText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || undefined;
  return undefined;
}

function asMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
  const text = asText(value);
  if (!text) return undefined;
  const normalized = text.includes(",") ? text.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".") : text.replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : undefined;
}

function normalizeAttributeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "opcao";
}

function variantIdFromSku(sku?: string) {
  const match = /(?:^|-)(\d+)$/.exec(sku ?? "");
  return match?.[1];
}

function variantIdFromUrl(url: URL) {
  return url.searchParams.get("variant_id") ?? undefined;
}

function variantSourceUrl(sourceUrl: URL, variantId?: string) {
  if (!variantId) return sourceUrl.toString();
  const url = new URL(sourceUrl);
  url.searchParams.set("variant_id", variantId);
  return url.toString();
}

function selectedVariantId(html: string, url: URL) {
  const fromInput = /<input\b[^>]*id=["']selectedVariant["'][^>]*value=["']?(\d+)/i.exec(html)?.[1];
  return fromInput ?? variantIdFromUrl(url);
}

function readValue(node: unknown, keys: string[]) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return undefined;
  const object = node as Record<string, unknown>;
  for (const key of keys) {
    if (object[key] != null) return object[key];
    const found = Object.entries(object).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found?.[1] != null) return found[1];
  }
  return undefined;
}

function walkObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => walkObjects(item, depth + 1));
  const node = value as Record<string, unknown>;
  return [node, ...Object.values(node).flatMap((item) => walkObjects(item, depth + 1))];
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function withPriceWarning(warnings: string[], variants: ImportedProductVariant[]) {
  const next = warnings.filter((warning) => warning !== PRICE_WARNING);
  return variants.some((variant) => variant.sourcePrice == null) ? [...next, PRICE_WARNING] : next;
}

function withUpdatedWarnings(preview: ProductUrlImportPreview, warnings: string[]) {
  return { ...preview, warnings };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
