import type { Market } from "@/lib/market";

export const ASSISTED_PURCHASE_MINIMUM_BRL = 10_000;

export function requiresAssistedPurchase(market: Market, displayedPrice: number) {
  return market === "BR"
    && Number.isFinite(displayedPrice)
    && displayedPrice >= ASSISTED_PURCHASE_MINIMUM_BRL;
}
