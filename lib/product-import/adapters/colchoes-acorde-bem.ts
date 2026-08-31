import { jsonFromScriptAssignments } from "@/lib/product-import/html";
import type { ImportedProductVariant, ProductImportAdapter, ProductUrlImportPreview } from "@/lib/product-import/types";

export const colchoesAcordeBemAdapter: ProductImportAdapter = {
  id: "colchoes-acorde-bem",
  domains: ["www.colchoesacordebem.com.br", "colchoesacordebem.com.br"],
  enhance({ html, url, preview }) {
    const trayProduct = jsonFromScriptAssignments(html, ["dataLayer"])
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .find((value) => isTrayProduct(value));
    if (!trayProduct || typeof trayProduct !== "object") return preview;
    const product = trayProduct as Record<string, unknown>;
    const variants = variantsFromListSku(product.listSku, url.toString());
    const imageUrl = asText(product.urlImage);
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
      images: [
        ...preview.images,
        ...(imageUrl ? [{ url: imageUrl, source: "adapter" as const, alt: asText(product.nameProduct) }] : []),
        ...variants.flatMap((variant) => variant.imageUrl ? [{ url: variant.imageUrl, source: "adapter" as const, alt: variant.label }] : []),
      ],
      variants: variants.length ? variants : preview.variants,
      warnings: [...preview.warnings],
      extraction: { ...preview.extraction, sources: [...preview.extraction.sources, "adapter"] },
    };
    if (variants.length === 0) enhanced.warnings.push("Acorde Bem não expôs lista de SKUs confiável no HTML inicial.");
    return enhanced;
  },
};

function isTrayProduct(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return object.pageCategory === "Produto" || object.nameProduct != null || Array.isArray(object.listSku);
}

function variantsFromListSku(value: unknown, sourceUrl: string): ImportedProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const sku = item as Record<string, unknown>;
    const label = asText(sku.nameSku) ?? asText(sku.idSku) ?? "Variante";
    const imageUrl = asText(sku.urlImage);
    return [{
      label,
      sku: asText(sku.reference) || asText(sku.EAN) || asText(sku.idSku),
      attributes: attributesFromSkuLabel(label),
      sourcePrice: asMoney(sku.sellPrice) ?? asMoney(sku.price),
      compareAtPrice: asMoney(sku.price),
      currency: "BRL",
      availability: availability(sku.availability) ?? "UNKNOWN",
      sourceUrl,
      imageUrl: imageUrl || undefined,
    }];
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
