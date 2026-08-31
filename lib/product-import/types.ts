export type ImportedAvailability = "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";

export interface ImportedProductImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  source?: "json-ld" | "meta" | "html" | "adapter" | "script";
}

export interface ImportedProductVariant {
  label: string;
  sku?: string;
  attributes: Record<string, string | number | boolean>;
  sourcePrice?: number;
  compareAtPrice?: number;
  currency?: string;
  availability: ImportedAvailability;
  sourceUrl?: string;
  imageUrl?: string;
}

export interface ProductUrlImportPreview {
  sourceUrl: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  brand?: string;
  category?: string;
  sku?: string;
  sourcePrice?: number;
  compareAtPrice?: number;
  currency?: string;
  availability: ImportedAvailability;
  images: ImportedProductImage[];
  variants: ImportedProductVariant[];
  warnings: string[];
  extraction: {
    domain: string;
    adapter?: string;
    sources: string[];
  };
}

export interface ProductImportAdapterContext {
  html: string;
  url: URL;
  preview: ProductUrlImportPreview;
}

export interface ProductImportAdapter {
  id: string;
  domains: string[];
  enhance(context: ProductImportAdapterContext): ProductUrlImportPreview;
}
