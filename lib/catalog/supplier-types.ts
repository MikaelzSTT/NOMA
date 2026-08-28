export type SupplierCapability =
  | "catalog"
  | "product"
  | "url-import"
  | "category-discovery"
  | "price"
  | "stock"
  | "orders";

export type NormalizedAvailability =
  | "AVAILABLE"
  | "OUT_OF_STOCK"
  | "PREORDER"
  | "UNKNOWN"
  | "REMOVED";

export interface NormalizedVariant {
  supplierVariantId?: string;
  sku: string;
  title: string;
  options: Record<string, string>;
  costPrice?: number;
  sellingPrice?: number;
  stock: number;
  active?: boolean;
}

/** Formato unico aceito pelo catalogo, independentemente da fonte. */
export interface NormalizedSupplierProduct {
  supplierProductId: string;
  sku: string;
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  category: string;
  categorySlug?: string;
  subcategory?: string;
  brand?: string;
  images: Array<{ url: string; alt?: string; isPrimary?: boolean }>;
  costPrice?: number;
  sellingPrice?: number;
  compareAtPrice?: number;
  currency: string;
  stock: number;
  availability: NormalizedAvailability;
  shippingCost?: number;
  estimatedDelivery?: string;
  sourceUrl?: string;
  variants: NormalizedVariant[];
  attributes: Record<string, string | number | boolean>;
  active: boolean;
  featured: boolean;
  sourceUpdatedAt?: Date;
}

export interface SupplierFetchQuery {
  cursor?: string;
  limit?: number;
  updatedAfter?: Date;
}

export interface SupplierProductBatch {
  products: NormalizedSupplierProduct[];
  nextCursor?: string;
  isLastPage: boolean;
}

export interface DiscoveredSupplierProduct {
  supplierProductId?: string;
  sku?: string;
  title: string;
  productUrl: string;
  imageUrl?: string;
  costPrice?: number;
  sellingPrice?: number;
  stock?: number;
  availability?: NormalizedAvailability;
}

export interface SupplierProductDiscovery {
  products: DiscoveredSupplierProduct[];
  nextPageUrl?: string;
  isLastPage: boolean;
  warnings?: string[];
}

export interface SupplierRuntimeConfig {
  id: string;
  name: string;
  adapterKey: string;
  baseUrl?: string;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string>;
}

/**
 * Conector de fornecedor. Todos os recursos operacionais sao opcionais: um
 * adapter de URL nao precisa fingir que oferece catalogo ou pedidos.
 */
export interface SupplierAdapter {
  readonly key: string;
  readonly name: string;
  readonly capabilities: ReadonlySet<SupplierCapability>;
  readonly supportedDomains: readonly string[];

  normalizeProduct(raw: unknown): Promise<NormalizedSupplierProduct> | NormalizedSupplierProduct;
  fetchProduct?(supplierProductId: string): Promise<NormalizedSupplierProduct | null>;
  fetchProducts?(query?: SupplierFetchQuery): AsyncGenerator<SupplierProductBatch>;
  supportsUrl?(url: URL): boolean;
  fetchProductByUrl?(url: URL): Promise<NormalizedSupplierProduct>;
  discoverProducts?(categoryUrl: URL): Promise<SupplierProductDiscovery>;
  getStock?(supplierProductId: string): Promise<number | null>;
  getPrice?(supplierProductId: string): Promise<{ costPrice?: number; currency: string } | null>;
  createOrder?(order: unknown): Promise<unknown>;
}
