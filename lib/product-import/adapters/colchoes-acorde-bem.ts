import { absoluteUrl, extractTags, firstMeta, jsonFromScriptAssignments, jsonLdBlocks, readMeta } from "@/lib/product-import/html";
import type { ImportedAvailability, ImportedProductImage, ImportedProductVariant, ProductImportAdapter, ProductUrlImportPreview } from "@/lib/product-import/types";

const MAX_REMOTE_VARIANTS = 12;
const REMOTE_VARIANT_DELAY_MS = 120;
const PRICE_WARNING = "Acorde Bem não expôs preço individual seguro para uma ou mais variantes; revise preço de venda antes de salvar.";
const TECHNICAL_VARIANT_LABEL_PREFIX = /^(?:quantidade)\s*:\s*/i;
const MOJIBAKE_MARKERS = /[ÃÂâ]/;
const REPLACEMENT_CHAR_CORRECTIONS: Array<[RegExp, string]> = [
  [/colch�es/gi, "colchões"],
  [/colch�o/gi, "colchão"],
  [/descri��es/gi, "descrições"],
  [/descri��o/gi, "descrição"],
  [/varia��es/gi, "variações"],
  [/varia��o/gi, "variação"],
  [/op��es/gi, "opções"],
  [/op��o/gi, "opção"],
  [/informa��es/gi, "informações"],
  [/n�o/gi, "não"],
  [/sof�/gi, "sofá"],
  [/m�veis/gi, "móveis"],
  [/��es/gi, "ções"],
  [/��o/gi, "ção"],
  [/�es/gi, "ões"],
  [/�o/gi, "ão"],
  [/�a/gi, "ça"],
];

export const colchoesAcordeBemAdapter: ProductImportAdapter = {
  id: "colchoes-acorde-bem",
  domains: ["www.colchoesacordebem.com.br", "colchoesacordebem.com.br"],
  enhance({ html, url, preview }) {
    const trayProduct = trayProductFromHtml(html);
    if (!trayProduct || typeof trayProduct !== "object") return preview;
    const product = trayProduct as Record<string, unknown>;
    const variants = variantsFromListSku(product.listSku, url, product);
    const enhanced: ProductUrlImportPreview = normalizeAcordeBemPreview({
      ...preview,
      title: acordeText(product.nameProduct) ?? preview.title,
      brand: acordeText(product.brand) ?? preview.brand,
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
    });
    if (variants.length === 0) enhanced.warnings.push("Acorde Bem não expôs lista de SKUs confiável no HTML inicial.");
    return enhanced;
  },
  async enhanceRemote({ html, url, preview, fetchHtml }) {
    const product = trayProductFromHtml(html);
    if (!product) return preview;
    const baseVariants = variantsFromListSku(product.listSku, url, product);
    if (baseVariants.length === 0 || baseVariants.length > MAX_REMOTE_VARIANTS) return withUpdatedWarnings(preview, withPriceWarning(preview.warnings, baseVariants));

    const generalImageKeys = new Set(preview.images.map((image) => imageDedupeKey(image.url)));
    const bySku = new Map(preview.variants.map((variant) => [variant.sku, { ...variant }]));
    for (const variant of baseVariants) {
      if ((variant.sourcePrice != null && variant.imageUrl) || !variant.sourceUrl) continue;
      await delay(REMOTE_VARIANT_DELAY_MS);
      try {
        const fetched = await fetchHtml(new URL(variant.sourceUrl));
        const variantProduct = trayProductFromHtml(fetched.html);
        const variantId = variantIdFromUrl(new URL(variant.sourceUrl));
        if (!variantProduct || selectedVariantId(fetched.html, fetched.url) !== variantId) continue;
        const current = bySku.get(variant.sku) ?? { ...variant };
        const imageUrl = variantImageFromHtml(fetched.html, fetched.url, variantProduct, current, generalImageKeys);
        bySku.set(variant.sku, {
          ...current,
          sourcePrice: current.sourcePrice ?? asMoney(variantProduct.priceSell),
          compareAtPrice: current.compareAtPrice ?? asMoney(variantProduct.price),
          sourceUrl: fetched.url.toString(),
          imageUrl: current.imageUrl ?? imageUrl,
        });
      } catch {
        continue;
      }
    }

    const variants = preview.variants.map((variant) => bySku.get(variant.sku) ?? variant);
    const images = dedupeAdapterImages([
      ...preview.images,
      ...variants.flatMap((variant) => imageValues([variant.imageUrl], url, "adapter", variant.label)),
    ]).slice(0, 10);
    return normalizeAcordeBemPreview(withUpdatedWarnings({ ...preview, images, variants }, withPriceWarning(preview.warnings, variants)));
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
    const rawLabel = acordeText(sku.nameSku) ?? acordeText(sku.idSku) ?? "Variante";
    const label = variantLabel(rawLabel);
    const imageUrl = asText(sku.urlImage);
    const idSku = asText(sku.idSku);
    const variantId = variantIdFromSku(idSku);
    return [{
      label,
      sku: asText(sku.reference) || asText(sku.EAN) || idSku,
      attributes: attributesFromSkuLabel(rawLabel),
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

function variantImageFromHtml(
  html: string,
  url: URL,
  product: Record<string, unknown>,
  variant: ImportedProductVariant,
  generalImageKeys: Set<string>,
) {
  return pickSpecificImage([
    ...imageValues([asText(product.urlImage)], url, "adapter", asText(product.nameProduct)),
    ...galleryImages(html, url),
  ], generalImageKeys)
    ?? structuredVariantImage(product, variant, url)
    ?? trustedOgImage(html, url, product, variant.label);
}

function pickSpecificImage(images: ImportedProductImage[], generalImageKeys: Set<string>) {
  const candidates = dedupeAdapterImages(images);
  return (candidates.find((image) => !generalImageKeys.has(imageDedupeKey(image.url))) ?? candidates[0])?.url;
}

function structuredVariantImage(product: Record<string, unknown>, variant: ImportedProductVariant, url: URL) {
  const variantId = variant.sourceUrl ? variantIdFromUrl(new URL(variant.sourceUrl)) : undefined;
  const sku = asText(variant.sku);
  const rows = Array.isArray(product.listSku) ? product.listSku : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const object = row as Record<string, unknown>;
    const idSku = asText(object.idSku);
    const matchesVariant = Boolean(
      (variantId && variantIdFromSku(idSku) === variantId)
      || (sku && [idSku, asText(object.reference), asText(object.EAN)].includes(sku)),
    );
    if (!matchesVariant) continue;
    const imageUrl = imageValues([asText(object.urlImage)], url, "adapter", variant.label)[0]?.url;
    if (imageUrl) return imageUrl;
  }
  return undefined;
}

function trustedOgImage(html: string, url: URL, product: Record<string, unknown>, label: string) {
  return ogImages(html, url).find((image) => isTrustedProductImage(image, product, label))?.url;
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
    const key = imageDedupeKey(image.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function imageDedupeKey(url: string) {
  return url.split("#")[0].replace(/\/(?:90|180|300|600)_([^/]+)$/i, "/$1");
}

function isTrustedProductImage(image: ImportedProductImage, product: Record<string, unknown>, label: string) {
  const idProduct = asText(product.idProduct);
  if (idProduct && new RegExp(`(?:^|[/_-])${escapeRegExp(idProduct)}(?:[/_.-]|$)`).test(new URL(image.url).pathname)) return true;
  return sharesRelevantWords(new URL(image.url).pathname, label) || Boolean(image.alt && sharesRelevantWords(image.alt, label));
}

function sharesRelevantWords(left: string, right: string) {
  const words = new Set(right.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3));
  return left.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((word) => words.has(word));
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
    const value = acordeText(last?.name);
    if (value) return value;
  }
  return acordeText(product.category);
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

function acordeText(value: unknown) {
  const text = asText(value);
  return text ? fixMojibake(text) : undefined;
}

function variantLabel(label: string) {
  return label.replace(TECHNICAL_VARIANT_LABEL_PREFIX, "").trim() || label;
}

function normalizeAcordeBemPreview(preview: ProductUrlImportPreview): ProductUrlImportPreview {
  return {
    ...preview,
    title: fixOptionalText(preview.title),
    description: fixOptionalText(preview.description),
    brand: fixOptionalText(preview.brand),
    category: fixOptionalText(preview.category),
    images: preview.images.map((image) => ({ ...image, alt: fixOptionalText(image.alt) })),
    variants: preview.variants.map((variant) => ({
      ...variant,
      label: variantLabel(fixMojibake(variant.label)),
      attributes: normalizeAttributes(variant.attributes),
    })),
  };
}

function normalizeAttributes(attributes: ImportedProductVariant["attributes"]) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [
    fixMojibake(key),
    typeof value === "string" ? fixMojibake(value) : value,
  ]));
}

function fixOptionalText(value?: string) {
  return value ? fixMojibake(value) : undefined;
}

function fixMojibake(value: string) {
  const repaired = repairLatin1DecodedAsUtf8(value);
  return REPLACEMENT_CHAR_CORRECTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, (match) => applyCase(match, replacement)),
    repaired,
  ).replace(/\uFFFD/g, "");
}

function repairLatin1DecodedAsUtf8(value: string) {
  if (!MOJIBAKE_MARKERS.test(value)) return value;
  const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
  const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return mojibakeScore(repaired) < mojibakeScore(value) ? repaired : value;
}

function mojibakeScore(value: string) {
  return (value.match(/\uFFFD/g)?.length ?? 0) * 3 + (value.match(MOJIBAKE_MARKERS)?.length ?? 0);
}

function applyCase(source: string, replacement: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
