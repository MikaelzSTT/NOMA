import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { colchoesAcordeBemAdapter } from "@/lib/product-import/adapters/colchoes-acorde-bem";
import {
  absoluteUrl,
  compactText,
  extractCanonicalUrl,
  findFirstTextByPattern,
  firstMeta,
  htmlImages,
  jsonFromScriptAssignments,
  jsonLdBlocks,
  readMeta,
  truncateText,
} from "@/lib/product-import/html";
import type {
  ImportedAvailability,
  ImportedProductImage,
  ImportedProductVariant,
  ProductImportAdapter,
  ProductUrlImportPreview,
} from "@/lib/product-import/types";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const adapters: ProductImportAdapter[] = [colchoesAcordeBemAdapter];

export class ProductUrlImportError extends Error {
  constructor(readonly code: "invalid-url" | "blocked-url" | "fetch-failed" | "invalid-response") {
    super(code);
  }
}

export async function previewProductFromUrl(rawUrl: string): Promise<ProductUrlImportPreview> {
  const initialUrl = await validatePublicProductUrl(rawUrl);
  const fetched = await fetchHtml(initialUrl);
  const preview = parseProductHtmlWithAdapters(fetched.html, fetched.url);
  return applyRemoteAdapter(preview, fetched.html, fetched.url);
}

export function parseProductHtmlWithAdapters(html: string, url: URL) {
  return applyAdapter(parseProductHtml(html, url), html, url);
}

export async function validatePublicProductUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProductUrlImportError("invalid-url");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new ProductUrlImportError("invalid-url");
  if (!url.hostname || isBlockedHostname(url.hostname)) throw new ProductUrlImportError("blocked-url");
  await assertPublicHost(url.hostname);
  return url;
}

export function parseProductHtml(html: string, url: URL): ProductUrlImportPreview {
  const meta = readMeta(html);
  const canonicalUrl = extractCanonicalUrl(html, url) ?? firstMeta(meta, ["og:url"]);
  const fromJsonLd = extractJsonLdProduct(html, url);
  const fromMeta = extractMetaProduct(html, url, meta);
  const fromScripts = extractScriptStructuredProduct(html, url);
  const fromFallback = extractFallbackProduct(html, url);
  const merged = mergePreview(
    emptyPreview(url, canonicalUrl),
    fromJsonLd,
    fromMeta,
    fromScripts,
    fromFallback,
  );
  merged.images = dedupeImages(merged.images, merged.title);
  merged.variants = dedupeVariants(merged.variants, merged.sourcePrice, merged.compareAtPrice, merged.currency, merged.availability, merged.sourceUrl);
  if (merged.variants.length === 0 && merged.sourcePrice != null) {
    merged.variants = [{
      label: "Padrão",
      attributes: {},
      sourcePrice: merged.sourcePrice,
      compareAtPrice: merged.compareAtPrice,
      currency: merged.currency,
      availability: merged.availability,
      sourceUrl: merged.canonicalUrl ?? merged.sourceUrl,
      imageUrl: merged.images[0]?.url,
    }];
  }
  if (merged.variants.length === 0) merged.warnings.push("Nenhuma variante confiável foi encontrada; preencha manualmente.");
  if (merged.images.length === 0) merged.warnings.push("Nenhuma imagem real de produto foi encontrada; adicione imagens manualmente.");
  return sanitizePreview(merged);
}

function extractJsonLdProduct(html: string, url: URL): Partial<ProductUrlImportPreview> {
  const products = jsonLdBlocks(html).flatMap((block) => findProductNodes(block));
  if (products.length === 0) return {};
  const product = products[0];
  const offer = firstOffer(product);
  const variants = asArray(readValue(product, ["hasVariant"])).flatMap((node) => productNodeToVariant(node, url));
  return {
    title: text(readValue(product, ["name"])),
    description: text(readValue(product, ["description"])),
    brand: brandName(readValue(product, ["brand", "manufacturer"])),
    category: text(readValue(product, ["category"])),
    sku: text(readValue(product, ["sku", "mpn", "gtin", "gtin13"])),
    sourcePrice: money(readValue(offer, ["price", "lowPrice"])),
    compareAtPrice: money(readValue(offer, ["highPrice"])),
    currency: currency(readValue(offer, ["priceCurrency"])),
    availability: availability(readValue(offer, ["availability", "inventoryLevel"])),
    images: imagesFromUnknown(readValue(product, ["image", "images"]), url, "json-ld"),
    variants,
    extraction: { domain: url.hostname, sources: ["json-ld"] },
  };
}

function extractMetaProduct(html: string, url: URL, meta: Record<string, string[]>): Partial<ProductUrlImportPreview> {
  void html;
  const images = [
    ...imageValues(meta["og:image"], url, "meta"),
    ...imageValues(meta["og:image:url"], url, "meta"),
    ...imageValues(meta["twitter:image"], url, "meta"),
  ];
  return {
    title: cleanupTitle(firstMeta(meta, ["og:title", "twitter:title"])),
    description: firstMeta(meta, ["og:description", "twitter:description", "description"]),
    sourcePrice: money(firstMeta(meta, ["product:price:amount", "og:price:amount"])),
    currency: currency(firstMeta(meta, ["product:price:currency", "og:price:currency"])),
    availability: availability(firstMeta(meta, ["product:availability", "og:availability"])),
    images,
    extraction: { domain: url.hostname, sources: images.length ? ["meta"] : [] },
  };
}

function extractScriptStructuredProduct(html: string, url: URL): Partial<ProductUrlImportPreview> {
  const data = jsonFromScriptAssignments(html, ["dataLayer", "window.dataLayer", "__NEXT_DATA__"]);
  const candidates = data.flatMap((item) => findProductLikeNodes(item));
  const node = candidates[0];
  if (!node) return {};
  const offer = firstOffer(node);
  return {
    title: text(readValue(node, ["name", "title", "item_name", "nameProduct"])),
    description: text(readValue(node, ["description"])),
    brand: text(readValue(node, ["brand", "item_brand"])),
    category: text(readValue(node, ["category", "item_category"])),
    sku: text(readValue(node, ["sku", "id", "item_id", "idProduct"])),
    sourcePrice: money(readValue(node, ["priceSell", "sellPrice", "price", "value"]) ?? readValue(offer, ["price"])),
    compareAtPrice: money(readValue(node, ["compareAtPrice", "price"]) ?? readValue(offer, ["highPrice"])),
    currency: currency(readValue(node, ["currency"]) ?? readValue(offer, ["priceCurrency"])),
    availability: availability(readValue(node, ["availability"])),
    images: imagesFromUnknown(readValue(node, ["image", "images", "urlImage"]), url, "script"),
    variants: variantsFromUnknown(readValue(node, ["variants", "listSku", "skus"]), url),
    extraction: { domain: url.hostname, sources: ["script"] },
  };
}

function extractFallbackProduct(html: string, url: URL): Partial<ProductUrlImportPreview> {
  const h1 = findFirstTextByPattern(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1 ?? cleanupTitle(findFirstTextByPattern(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
  const priceMatches = [...html.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:\.\d{2}))/g)]
    .map((match) => money(match[1]))
    .filter((value): value is number => value != null && value > 0);
  return {
    title,
    sourcePrice: priceMatches[0],
    compareAtPrice: priceMatches.length > 1 ? Math.max(...priceMatches) : undefined,
    currency: html.includes("R$") ? "BRL" : undefined,
    images: htmlImages(html, url),
    extraction: { domain: url.hostname, sources: ["html"] },
  };
}

function applyAdapter(preview: ProductUrlImportPreview, html: string, url: URL) {
  const adapter = adapters.find((item) => item.domains.includes(url.hostname.toLowerCase()));
  if (!adapter) return preview;
  const enhanced = adapter.enhance({ html, url, preview });
  return sanitizePreview({
    ...enhanced,
    extraction: {
      ...enhanced.extraction,
      adapter: adapter.id,
      sources: [...new Set([...preview.extraction.sources, ...enhanced.extraction.sources, adapter.id])],
    },
    images: dedupeImages(enhanced.images, enhanced.title),
    variants: dedupeVariants(enhanced.variants, enhanced.sourcePrice, enhanced.compareAtPrice, enhanced.currency, enhanced.availability, enhanced.canonicalUrl ?? enhanced.sourceUrl),
  });
}

async function applyRemoteAdapter(preview: ProductUrlImportPreview, html: string, url: URL) {
  const adapter = adapters.find((item) => item.domains.includes(url.hostname.toLowerCase()));
  if (!adapter?.enhanceRemote) return preview;
  const enhanced = await adapter.enhanceRemote({ html, url, preview, fetchHtml });
  return sanitizePreview({
    ...enhanced,
    extraction: {
      ...enhanced.extraction,
      adapter: adapter.id,
      sources: [...new Set([...preview.extraction.sources, ...enhanced.extraction.sources, adapter.id])],
    },
    images: dedupeImages(enhanced.images, enhanced.title),
    variants: dedupeVariants(enhanced.variants, enhanced.sourcePrice, enhanced.compareAtPrice, enhanced.currency, enhanced.availability, enhanced.canonicalUrl ?? enhanced.sourceUrl),
  });
}

function mergePreview(base: ProductUrlImportPreview, ...parts: Array<Partial<ProductUrlImportPreview>>) {
  const next = { ...base, extraction: { ...base.extraction }, images: [...base.images], variants: [...base.variants], warnings: [...base.warnings] };
  for (const part of parts) {
    next.title ??= part.title;
    next.description ??= part.description;
    next.brand ??= part.brand;
    next.category ??= part.category;
    next.sku ??= part.sku;
    next.sourcePrice ??= part.sourcePrice;
    next.compareAtPrice ??= part.compareAtPrice;
    next.currency ??= part.currency;
    if (next.availability === "UNKNOWN" && part.availability) next.availability = part.availability;
    next.images.push(...(part.images ?? []));
    next.variants.push(...(part.variants ?? []));
    next.warnings.push(...(part.warnings ?? []));
    next.extraction.sources = [...new Set([...next.extraction.sources, ...(part.extraction?.sources ?? [])])];
  }
  return next;
}

function emptyPreview(url: URL, canonicalUrl?: string): ProductUrlImportPreview {
  return {
    sourceUrl: url.toString(),
    canonicalUrl,
    availability: "UNKNOWN",
    images: [],
    variants: [],
    warnings: [],
    extraction: { domain: url.hostname, sources: [] },
  };
}

async function fetchHtml(initialUrl: URL) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await validatePublicProductUrl(url.toString());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "NOMA product URL preview/1.0",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new ProductUrlImportError("invalid-response");
        url = await validatePublicProductUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new ProductUrlImportError("fetch-failed");
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
        throw new ProductUrlImportError("invalid-response");
      }
      return { url, html: await readLimitedText(response) };
    } catch (error) {
      if (error instanceof ProductUrlImportError) throw error;
      throw new ProductUrlImportError("fetch-failed");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ProductUrlImportError("blocked-url");
}

async function readLimitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) throw new ProductUrlImportError("invalid-response");
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number) {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function assertPublicHost(hostname: string) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new ProductUrlImportError("blocked-url");
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ProductUrlImportError("invalid-url");
  }
  if (addresses.length === 0 || addresses.some((item) => isPrivateIp(item.address))) {
    throw new ProductUrlImportError("blocked-url");
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "metadata.google.internal";
}

function isPrivateIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.replace("::ffff:", ""));
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function findProductNodes(value: unknown): Record<string, unknown>[] {
  const nodes = walkObjects(value);
  return nodes.filter((node) => {
    const type = readValue(node, ["@type"]);
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
    return types.some((item) => /product|productgroup/i.test(item));
  });
}

function findProductLikeNodes(value: unknown): Record<string, unknown>[] {
  return walkObjects(value).filter((node) => (
    readValue(node, ["nameProduct", "item_name", "name", "title"]) != null
    && (readValue(node, ["price", "priceSell", "sellPrice", "offers", "listSku", "variants"]) != null)
  ));
}

function walkObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => walkObjects(item, depth + 1));
  const node = value as Record<string, unknown>;
  return [node, ...Object.values(node).flatMap((item) => walkObjects(item, depth + 1))];
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

function firstOffer(product: unknown) {
  const offers = readValue(product, ["offers", "offer"]);
  return Array.isArray(offers) ? offers[0] : offers;
}

function productNodeToVariant(node: unknown, url: URL): ImportedProductVariant[] {
  if (!node || typeof node !== "object") return [];
  const offer = firstOffer(node);
  const label = text(readValue(node, ["name", "title"]));
  if (!label) return [];
  return [{
    label,
    sku: text(readValue(node, ["sku", "mpn"])),
    attributes: additionalProperties(node),
    sourcePrice: money(readValue(offer, ["price", "lowPrice"])),
    compareAtPrice: money(readValue(offer, ["highPrice"])),
    currency: currency(readValue(offer, ["priceCurrency"])),
    availability: availability(readValue(offer, ["availability"])),
    sourceUrl: text(readValue(node, ["url"])) ? absoluteUrl(text(readValue(node, ["url"])), url) : url.toString(),
    imageUrl: imagesFromUnknown(readValue(node, ["image"]), url, "json-ld")[0]?.url,
  }];
}

function variantsFromUnknown(value: unknown, url: URL): ImportedProductVariant[] {
  return asArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    const label = text(readValue(object, ["nameSku", "name", "title", "label", "optionName"])) ?? "Variante";
    return [{
      label,
      sku: text(readValue(object, ["idSku", "sku", "id", "reference", "EAN"])),
      attributes: variantAttributes(label, object),
      sourcePrice: money(readValue(object, ["sellPrice", "priceSell", "price", "salePrice"])),
      compareAtPrice: money(readValue(object, ["compareAtPrice", "oldPrice", "price"])),
      currency: currency(readValue(object, ["currency"])) ?? "BRL",
      availability: availability(readValue(object, ["availability", "available"])),
      sourceUrl: url.toString(),
      imageUrl: imagesFromUnknown(readValue(object, ["urlImage", "image", "imageUrl"]), url, "script")[0]?.url,
    }];
  });
}

function additionalProperties(node: unknown) {
  const attributes: Record<string, string | number | boolean> = {};
  for (const item of asArray(readValue(node, ["additionalProperty", "additionalProperties"]))) {
    if (!item || typeof item !== "object") continue;
    const name = text(readValue(item, ["name"]));
    const value = readValue(item, ["value"]);
    if (name && ["string", "number", "boolean"].includes(typeof value)) attributes[name] = value as string | number | boolean;
  }
  return attributes;
}

function variantAttributes(label: string, object: Record<string, unknown>) {
  const attributes: Record<string, string | number | boolean> = {};
  const prefixed = /^([^:]{2,40}):\s*(.+)$/.exec(label);
  if (prefixed) attributes[normalizeAttributeName(prefixed[1])] = prefixed[2].trim();
  const dimension = /(\d{2,3})\s*x\s*(\d{2,3})(?:\s*x\s*(\d{1,3}))?/i.exec(label);
  if (dimension) attributes.dimensoes = dimension[0].replace(/\s+/g, "");
  for (const key of ["size", "tamanho", "medida", "color", "cor", "configuration", "configuracao"]) {
    const value = readValue(object, [key]);
    if (["string", "number", "boolean"].includes(typeof value)) attributes[normalizeAttributeName(key)] = value as string | number | boolean;
  }
  return attributes;
}

function normalizeAttributeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "opcao";
}

function imagesFromUnknown(value: unknown, url: URL, source: ImportedProductImage["source"]) {
  return asArray(value).flatMap((item) => {
    if (typeof item === "string") return imageValues([item], url, source);
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    return imageValues([text(readValue(object, ["url", "contentUrl", "src"]))].filter(Boolean) as string[], url, source);
  });
}

function imageValues(values: string[] | undefined, url: URL, source: ImportedProductImage["source"]) {
  return (values ?? []).flatMap((value) => {
    const imageUrl = absoluteUrl(value, url);
    return imageUrl ? [{ url: imageUrl, source }] : [];
  });
}

function dedupeImages(images: ImportedProductImage[], title?: string) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.url.startsWith("https://")) return false;
    if (isClearlyNonProductImage(image, title)) return false;
    const key = image.url.split("#")[0].replace(/([?&])(width|height|w|h|resize)=\d+/gi, "$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function isClearlyNonProductImage(image: ImportedProductImage, title?: string) {
  const url = image.url.toLowerCase();
  if (/\.(svg|ico)(?:[?#]|$)/.test(url)) return true;
  if (/(logo|logotipo|favicon|icon|sprite|placeholder|empty|banner|payment|whatsapp|facebook|instagram)/i.test(url)) return true;
  if (image.width != null && image.height != null && (image.width < 180 || image.height < 180)) return true;
  const alt = image.alt?.toLowerCase();
  if (alt && title && !sharesRelevantWords(alt, title) && /(logo|banner|menu|telefone|pagamento)/i.test(alt)) return true;
  return false;
}

function sharesRelevantWords(left: string, right: string) {
  const words = new Set(right.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3));
  return left.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((word) => words.has(word));
}

function dedupeVariants(
  variants: ImportedProductVariant[],
  fallbackPrice?: number,
  fallbackCompareAt?: number,
  fallbackCurrency?: string,
  fallbackAvailability: ImportedAvailability = "UNKNOWN",
  fallbackUrl?: string,
) {
  const seen = new Set<string>();
  const canUsePriceFallback = variants.length === 1;
  return variants.filter((variant) => {
    const key = `${variant.sku ?? ""}:${variant.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(variant.label.trim());
  }).map((variant, index) => ({
    ...variant,
    sourcePrice: variant.sourcePrice ?? (canUsePriceFallback ? fallbackPrice : undefined),
    compareAtPrice: variant.compareAtPrice === variant.sourcePrice ? fallbackCompareAt : variant.compareAtPrice ?? (canUsePriceFallback ? fallbackCompareAt : undefined),
    currency: variant.currency ?? fallbackCurrency,
    availability: variant.availability ?? fallbackAvailability,
    sourceUrl: variant.sourceUrl ?? fallbackUrl,
    isDefault: index === 0,
  })).slice(0, 200);
}

function sanitizePreview(preview: ProductUrlImportPreview): ProductUrlImportPreview {
  return {
    ...preview,
    title: truncateText(compactText(preview.title), 300),
    description: truncateText(compactText(preview.description), 30_000),
    brand: truncateText(compactText(preview.brand), 120),
    category: truncateText(compactText(preview.category), 120),
    sku: truncateText(compactText(preview.sku), 255),
    currency: currency(preview.currency),
    compareAtPrice: normalizeCompareAt(preview.compareAtPrice, preview.sourcePrice),
    warnings: [...new Set(preview.warnings.map((warning) => truncateText(compactText(warning), 300)).filter(Boolean) as string[])],
    images: preview.images.map((image) => ({ ...image, alt: truncateText(compactText(image.alt), 300) })),
    variants: preview.variants.map((variant) => ({
      ...variant,
      label: truncateText(compactText(variant.label), 300) ?? "Variante",
      sku: truncateText(compactText(variant.sku), 255),
      currency: currency(variant.currency),
      compareAtPrice: normalizeCompareAt(variant.compareAtPrice, variant.sourcePrice),
      attributes: Object.fromEntries(Object.entries(variant.attributes).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value)).slice(0, 20)),
    })),
  };
}

function normalizeCompareAt(compareAtPrice?: number, sourcePrice?: number) {
  return compareAtPrice != null && (sourcePrice == null || compareAtPrice > sourcePrice) ? compareAtPrice : undefined;
}

function text(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return compactText(String(value));
  return undefined;
}

function brandName(value: unknown) {
  if (typeof value === "string") return compactText(value);
  return text(readValue(value, ["name"]));
}

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return roundMoney(value);
  const raw = text(value);
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : undefined;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function currency(value: unknown) {
  const raw = text(value)?.toUpperCase();
  return raw && /^[A-Z]{3}$/.test(raw) ? raw : undefined;
}

function availability(value: unknown): ImportedAvailability {
  const raw = text(value)?.toLowerCase() ?? "";
  if (/out\s*of\s*stock|out_of_stock|indispon[ií]vel|sem estoque|no|false|esgotado/.test(raw)) return "OUT_OF_STOCK";
  if (/preorder|pre-order|pré-venda|pre venda/.test(raw)) return "PREORDER";
  if (/instock|in_stock|dispon[ií]vel|yes|true|available/.test(raw)) return "AVAILABLE";
  return "UNKNOWN";
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanupTitle(value?: string) {
  return value?.replace(/\s[-|]\s[^-|]{2,80}$/g, "").trim() || undefined;
}

export const productImportTestUtils = {
  isPrivateIp,
};
