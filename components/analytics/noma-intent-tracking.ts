import type { Market } from "@/lib/market";

type NomaPurchaseIntentEventType =
  | "product_view"
  | "buy_click"
  | "add_to_cart"
  | "checkout_start"
  | "assisted_purchase_click"
  | "shipping_quote_requested"
  | "shipping_quote_succeeded"
  | "shipping_quote_failed";

type NomaIntentPayload = {
  eventType: NomaPurchaseIntentEventType;
  market: Market;
  productId: string;
  productSlug: string;
  variantId?: string | null;
};

const CLIENT_DEDUPE_MS: Record<NomaPurchaseIntentEventType, number> = {
  product_view: 30 * 60 * 1000,
  buy_click: 1_500,
  add_to_cart: 1_500,
  checkout_start: 1_500,
  assisted_purchase_click: 1_500,
  shipping_quote_requested: 1_500,
  shipping_quote_succeeded: 1_500,
  shipping_quote_failed: 1_500,
};

const recentEvents = new Map<string, number>();

export function trackNomaPurchaseIntent(payload: NomaIntentPayload) {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  const key = [
    payload.eventType,
    payload.market,
    payload.productId,
    payload.productSlug,
    payload.eventType === "product_view" ? "" : payload.variantId ?? "",
    window.location.pathname,
  ].join("|");
  const previous = recentEvents.get(key);
  if (previous && now - previous < CLIENT_DEDUPE_MS[payload.eventType]) return false;
  recentEvents.set(key, now);

  const body = JSON.stringify({
    ...payload,
    pathname: window.location.pathname,
    search: window.location.search,
    referrer: document.referrer,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/noma/events", blob)) return true;
  }

  void fetch("/api/noma/events", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
  return true;
}
