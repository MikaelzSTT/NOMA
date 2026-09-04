import type { Market, Prisma } from "@/generated/prisma/client";

export const SHIPPING_STRATEGIES = ["SUPPLIER_API", "CARRIER_API", "TABLE", "FIXED", "MANUAL", "DISABLED"] as const;
export type ShippingStrategyCode = typeof SHIPPING_STRATEGIES[number];

export type ShippingQuoteRequest = {
  market?: Market;
  supplierId?: string;
  offerId: string;
  variantId?: string | null;
  destinationPostalCode: string;
  quantity: number;
};

export type NormalizedShippingQuote = {
  quoteId: string;
  supplierId: string;
  serviceCode: string;
  serviceName: string;
  price: number;
  currency: string;
  estimatedMinDays: number | null;
  estimatedMaxDays: number | null;
  destinationPostalCode: string;
  expiresAt: Date;
};

export type ShippingQuoteResult =
  | { type: "quotes"; quotes: NormalizedShippingQuote[] }
  | { type: "manual"; reason: "manual_shipping" | "shipping_disabled" | "adapter_unavailable" | "supplier_unavailable" | "shipping_not_configured"; message: string };

export type AdapterShippingQuote = {
  serviceCode: string;
  serviceName: string;
  price: number;
  currency: string;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  rawResponse?: Prisma.InputJsonValue;
};

export type ShippingAdapterInput = {
  market: Market;
  supplier: {
    id: string;
    name: string;
    adapterKey: string;
    shippingStrategy: ShippingStrategyCode;
    shippingOriginPostalCode: string | null;
    shippingConfig: Prisma.JsonValue | null;
  };
  offer: {
    id: string;
    supplierId: string;
    supplierProductId: string;
    sku: string;
    currency: string;
    shippingCost: unknown;
    estimatedDeliveryMinDays: number | null;
    estimatedDeliveryMaxDays: number | null;
    sourceUrl: string | null;
  };
  variant: {
    id: string;
    sku: string | null;
    label: string;
    sourceUrl: string | null;
  } | null;
  destinationPostalCode: string;
  quantity: number;
  timeoutMs: number;
};

export interface ShippingAdapter {
  quote(input: ShippingAdapterInput): Promise<AdapterShippingQuote[]>;
}

export class ShippingQuoteError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
