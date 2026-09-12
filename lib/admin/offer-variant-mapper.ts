import type { AdminOfferVariant } from "@/components/admin/offer-variant-fields";

type Availability = AdminOfferVariant["availability"];

type AdminOfferVariantRow = {
  label?: string | null;
  sku?: string | null;
  attributes?: unknown;
  costPrice?: unknown;
  salePrice?: unknown;
  compareAtPrice?: unknown;
  manualPriceOverride?: boolean | null;
  manualActiveOverride?: boolean | null;
  stock?: number | null;
  active?: boolean | null;
  availability?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  isDefault?: boolean | null;
};

type AdminOfferForVariants = {
  sku?: string | null;
  costPrice?: unknown;
  sellingPrice?: unknown;
  compareAtPrice?: unknown;
  manualPriceOverride?: boolean | null;
  stockQuantity?: number | null;
  active?: boolean | null;
  availability?: string | null;
  sourceUrl?: string | null;
  variants?: AdminOfferVariantRow[] | null;
};

type AdminProductForVariants = {
  title?: string | null;
  sku?: string | null;
  costPrice?: unknown;
  sellingPrice?: unknown;
  compareAtPrice?: unknown;
  stock?: number | null;
  availability?: string | null;
};

const AVAILABILITY_VALUES = new Set<Availability>(["AVAILABLE", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"]);

export function toAdminOfferVariants(
  offer: AdminOfferForVariants | undefined,
  product: AdminProductForVariants,
): AdminOfferVariant[] {
  const variants = Array.isArray(offer?.variants) ? offer.variants : [];
  if (variants.length) {
    return variants.map((variant, index) => {
      const stock = safeInt(variant.stock, 0);
      const manualActiveOverride = variant.manualActiveOverride === true;
      return {
        label: safeText(variant.label, product.title || `Variante ${index + 1}`),
        sku: safeText(variant.sku, ""),
        attributes: publicVariantAttributes(variant.attributes),
        costPrice: safeNumber(variant.costPrice, 0),
        salePrice: safeNumber(variant.salePrice, 0),
        compareAtPrice: variant.compareAtPrice == null ? undefined : safeNumber(variant.compareAtPrice, 0),
        manualPriceOverride: safeBoolean(variant.manualPriceOverride, safeBoolean(offer?.manualPriceOverride, true)),
        stock,
        active: safeBoolean(variant.active, manualActiveOverride ? false : true),
        availability: safeAvailability(variant.availability, stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK"),
        sourceUrl: safeText(variant.sourceUrl, ""),
        imageUrl: safeText(variant.imageUrl, ""),
        isDefault: safeBoolean(variant.isDefault, index === 0),
      };
    });
  }

  const stock = safeInt(offer?.stockQuantity, safeInt(product.stock, 0));
  return [{
    label: "Padrão",
    sku: safeText(offer?.sku, safeText(product.sku, "")),
    attributes: {},
    costPrice: safeNumber(offer?.costPrice ?? product.costPrice, 0),
    salePrice: safeNumber(offer?.sellingPrice ?? product.sellingPrice, 0),
    compareAtPrice: offer?.compareAtPrice == null && product.compareAtPrice == null
      ? undefined
      : safeNumber(offer?.compareAtPrice ?? product.compareAtPrice, 0),
    manualPriceOverride: safeBoolean(offer?.manualPriceOverride, true),
    stock,
    active: safeBoolean(offer?.active, true),
    availability: safeAvailability(offer?.availability ?? product.availability, stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK"),
    sourceUrl: safeText(offer?.sourceUrl, ""),
    imageUrl: "",
    isDefault: true,
  }];
}

export function publicVariantAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item)),
  ) as Record<string, string | number | boolean>;
}

function safeText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function safeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function safeInt(value: unknown, fallback: number) {
  const number = safeNumber(value, fallback);
  return Number.isInteger(number) ? number : Math.trunc(number);
}

function safeNumber(value: unknown, fallback: number) {
  if (value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeAvailability(value: unknown, fallback: Availability): Availability {
  return typeof value === "string" && AVAILABILITY_VALUES.has(value as Availability) ? value as Availability : fallback;
}
