import type { AdminOfferVariant } from "@/components/admin/offer-variant-fields";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";

export function previewToOfferVariants(product: ProductUrlImportPreview, fallbackCurrency: string): AdminOfferVariant[] {
  const hasSourceVariants = product.variants.length > 0;
  const source = hasSourceVariants ? product.variants : [{
    label: "Padrão",
    attributes: {},
    sourcePrice: product.sourcePrice,
    compareAtPrice: product.compareAtPrice,
    currency: product.currency,
    availability: product.availability,
    sourceUrl: product.canonicalUrl ?? product.sourceUrl,
    imageUrl: product.images[0]?.url,
  }];

  return source.map((variant, index) => {
    const sourcePrice = variant.sourcePrice ?? (hasSourceVariants ? 0 : product.sourcePrice ?? 0);
    const availability = variant.availability === "UNKNOWN" ? "AVAILABLE" : variant.availability;
    return {
      label: variant.label,
      sku: variant.sku ?? product.sku ?? "",
      attributes: variant.attributes,
      costPrice: sourcePrice,
      salePrice: 0,
      compareAtPrice: variant.sourcePrice == null && hasSourceVariants ? undefined : variant.compareAtPrice ?? product.compareAtPrice,
      manualPriceOverride: true,
      sourcePriceReference: variant.sourcePrice ?? (hasSourceVariants ? undefined : product.sourcePrice),
      sourceCompareAtReference: variant.sourcePrice == null && hasSourceVariants ? undefined : variant.compareAtPrice ?? product.compareAtPrice,
      sourceCurrency: variant.currency ?? product.currency ?? fallbackCurrency,
      stock: availability === "OUT_OF_STOCK" ? 0 : 1,
      active: availability !== "OUT_OF_STOCK",
      availability,
      sourceUrl: variant.sourceUrl ?? product.canonicalUrl ?? product.sourceUrl,
      imageUrl: variant.imageUrl ?? (hasSourceVariants ? undefined : product.images[0]?.url),
      sourcePriceMissing: hasSourceVariants && variant.sourcePrice == null,
      salePricePending: sourcePrice > 0,
      isDefault: index === 0,
    };
  });
}
