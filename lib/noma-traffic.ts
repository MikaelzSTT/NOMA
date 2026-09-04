import "server-only";

import { createHash } from "node:crypto";
import { after, userAgentFromString } from "next/server";
import { db } from "@/lib/db";
import { isMarket, type Market } from "@/lib/market";
import { NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

export { NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE };
export const NOMA_TRAFFIC_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
export const NOMA_PRODUCT_VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const NOMA_CLICK_DEDUPE_WINDOW_MS = 2 * 1000;

type TrackedQueryParam = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "gclid";
export const NOMA_PURCHASE_INTENT_EVENT_TYPES = [
  "product_view",
  "buy_click",
  "add_to_cart",
  "checkout_start",
  "assisted_purchase_click",
  "shipping_quote_requested",
  "shipping_quote_succeeded",
  "shipping_quote_failed",
] as const;
export type NomaPurchaseIntentEventType = typeof NOMA_PURCHASE_INTENT_EVENT_TYPES[number];

export type TrafficVisitInput = {
  market: Market;
  pathname: string;
  referrer?: string | null;
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined>;
  userAgent?: string | null;
  sessionId?: string | null;
  visitedAt?: Date;
};

export type NormalizedTrafficVisit = {
  visitedAt: Date;
  market: Market;
  pathname: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  userAgentSummary: string | null;
  sessionHash: string | null;
  dedupeKey: string;
};

export type PurchaseIntentEventInput = {
  eventType: NomaPurchaseIntentEventType | string;
  market: Market | string;
  productId: string;
  productSlug: string;
  variantId?: string | null;
  pathname: string;
  referrer?: string | null;
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined>;
  attributionCookie?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  occurredAt?: Date;
};

export type NormalizedPurchaseIntentEvent = {
  occurredAt: Date;
  eventType: NomaPurchaseIntentEventType;
  market: Market;
  productId: string;
  productOfferId: string;
  productSlug: string;
  productTitle: string;
  variantId: string | null;
  variantLabel: string | null;
  displayedPrice: number | null;
  currency: string | null;
  pathname: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  userAgentSummary: string | null;
  sessionHash: string | null;
  dedupeKey: string;
};

export type MaintenanceVisitInput = TrafficVisitInput;
export type NormalizedMaintenanceVisit = NormalizedTrafficVisit;

type TrafficVisitRow = {
  visitedAt: Date;
  referrer: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
};

export function scheduleTrafficVisitTracking(input: TrafficVisitInput) {
  const visit = normalizeTrafficVisit(input);
  after(async () => {
    await recordTrafficVisit(visit).catch((error: unknown) => {
      console.error("[NOMA traffic] failed to record visit", error);
    });
  });
}

export const scheduleMaintenanceVisitTracking = scheduleTrafficVisitTracking;

export async function recordTrafficVisit(visit: NormalizedTrafficVisit) {
  try {
    await db.nomaTrafficVisit.create({ data: visit });
    return { recorded: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) return { recorded: false, deduped: true };
    throw error;
  }
}

export const recordMaintenanceVisit = recordTrafficVisit;

export async function normalizePurchaseIntentEvent(input: PurchaseIntentEventInput): Promise<NormalizedPurchaseIntentEvent | null> {
  if (!isPurchaseIntentEventType(input.eventType) || !isMarket(input.market)) return null;

  const offer = await db.productMarketOffer.findFirst({
    where: {
      market: input.market,
      slug: sanitizeSlug(input.productSlug),
      productId: sanitizeString(input.productId, 120) ?? "",
      active: true,
      availability: { not: "REMOVED" },
      product: { active: true, archivedAt: null },
    },
    select: {
      id: true,
      productId: true,
      slug: true,
      title: true,
      sellingPrice: true,
      currency: true,
      product: { select: { title: true } },
      variants: {
        where: { active: true },
        select: { id: true, label: true, salePrice: true },
      },
    },
  });
  if (!offer) return null;

  const occurredAt = input.occurredAt ?? new Date();
  const selectedVariant = input.variantId
    ? offer.variants.find((variant) => variant.id === sanitizeString(input.variantId, 120))
    : null;
  if (input.variantId && !selectedVariant) return null;

  const attribution = attributionFromInput(input);
  const pathname = sanitizePathname(input.pathname);
  const referrer = attribution.referrer ?? sanitizeReferrer(input.referrer);
  const userAgentSummary = summarizeUserAgent(input.userAgent);
  const sessionHash = hashSession(input.sessionId);
  const displayedPrice = selectedVariant?.salePrice == null
    ? offer.sellingPrice == null ? null : Number(offer.sellingPrice)
    : Number(selectedVariant.salePrice);
  const normalized = {
    occurredAt,
    eventType: input.eventType,
    market: input.market,
    productId: offer.productId,
    productOfferId: offer.id,
    productSlug: offer.slug,
    productTitle: sanitizeString(offer.title ?? offer.product.title, 255) ?? offer.slug,
    variantId: selectedVariant?.id ?? null,
    variantLabel: sanitizeString(selectedVariant?.label, 255),
    displayedPrice,
    currency: sanitizeString(offer.currency, 3),
    pathname,
    referrer,
    utmSource: attribution.utmSource,
    utmMedium: attribution.utmMedium,
    utmCampaign: attribution.utmCampaign,
    utmContent: attribution.utmContent,
    utmTerm: attribution.utmTerm,
    gclid: attribution.gclid,
    userAgentSummary,
    sessionHash,
  } satisfies Omit<NormalizedPurchaseIntentEvent, "dedupeKey">;

  return {
    ...normalized,
    dedupeKey: buildPurchaseIntentDedupeKey(normalized),
  };
}

export async function recordPurchaseIntentEvent(event: NormalizedPurchaseIntentEvent) {
  try {
    await db.nomaPurchaseIntentEvent.create({ data: event });
    return { recorded: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) return { recorded: false, deduped: true };
    throw error;
  }
}

export function normalizeTrafficVisit(input: TrafficVisitInput): NormalizedTrafficVisit {
  const visitedAt = input.visitedAt ?? new Date();
  const searchParams = normalizeSearchParams(input.searchParams);
  const market = isMarket(input.market) ? input.market : "BR";
  const pathname = sanitizePathname(input.pathname);
  const referrer = sanitizeReferrer(input.referrer);
  const userAgentSummary = summarizeUserAgent(input.userAgent);
  const sessionHash = hashSession(input.sessionId);
  const dedupeKey = buildDedupeKey({
    visitedAt,
    market,
    pathname,
    referrer,
    userAgentSummary,
    sessionHash,
    utmSource: getTrackedParam(searchParams, "utm_source"),
    utmMedium: getTrackedParam(searchParams, "utm_medium"),
    utmCampaign: getTrackedParam(searchParams, "utm_campaign"),
    utmContent: getTrackedParam(searchParams, "utm_content"),
    utmTerm: getTrackedParam(searchParams, "utm_term"),
    gclid: getTrackedParam(searchParams, "gclid"),
  });

  return {
    visitedAt,
    market,
    pathname,
    referrer,
    utmSource: getTrackedParam(searchParams, "utm_source"),
    utmMedium: getTrackedParam(searchParams, "utm_medium"),
    utmCampaign: getTrackedParam(searchParams, "utm_campaign"),
    utmContent: getTrackedParam(searchParams, "utm_content"),
    utmTerm: getTrackedParam(searchParams, "utm_term"),
    gclid: getTrackedParam(searchParams, "gclid"),
    userAgentSummary,
    sessionHash,
    dedupeKey,
  };
}

export const normalizeMaintenanceVisit = normalizeTrafficVisit;

export function isPurchaseIntentEventType(value: unknown): value is NomaPurchaseIntentEventType {
  return typeof value === "string" && NOMA_PURCHASE_INTENT_EVENT_TYPES.includes(value as NomaPurchaseIntentEventType);
}

export function summarizeTrafficSources(visits: TrafficVisitRow[], limit = 8) {
  return topCounts(visits.map((visit) => trafficSourceLabel(visit)), limit);
}

export function summarizeUtmCampaigns(visits: Pick<TrafficVisitRow, "utmCampaign">[], limit = 8) {
  return topCounts(visits.map((visit) => visit.utmCampaign || "Sem UTM"), limit);
}

export function trafficSourceLabel(visit: Pick<TrafficVisitRow, "utmSource" | "referrer">) {
  if (visit.utmSource) return visit.utmSource;
  if (!visit.referrer) return "Direto";
  try {
    return new URL(visit.referrer).hostname.replace(/^www\./, "");
  } catch {
    return "Referrer informado";
  }
}

export function attributionCookieValue(input: Pick<NormalizedTrafficVisit, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm" | "gclid" | "referrer">) {
  const params = new URLSearchParams();
  if (input.utmSource) params.set("utm_source", input.utmSource);
  if (input.utmMedium) params.set("utm_medium", input.utmMedium);
  if (input.utmCampaign) params.set("utm_campaign", input.utmCampaign);
  if (input.utmContent) params.set("utm_content", input.utmContent);
  if (input.utmTerm) params.set("utm_term", input.utmTerm);
  if (input.gclid) params.set("gclid", input.gclid);
  if (input.referrer) params.set("referrer", input.referrer);
  return params.size > 0 ? params.toString() : null;
}

export function purchaseAttributionFromCookie(value: string | null | undefined) {
  return parseAttributionCookie(value);
}

export function purchaseIntentSourceLabel(event: Pick<NormalizedPurchaseIntentEvent, "utmSource" | "referrer">) {
  return trafficSourceLabel(event);
}

export function buildTrafficFunnel(input: {
  visits: number;
  events: Array<{ eventType: string }>;
}) {
  const productViews = countEvents(input.events, "product_view");
  const buyClicks = countEvents(input.events, "buy_click");
  const addToCart = countEvents(input.events, "add_to_cart");
  const checkoutStart = countEvents(input.events, "checkout_start");
  const assistedPurchaseClicks = countEvents(input.events, "assisted_purchase_click");
  return {
    visits: input.visits,
    productViews,
    buyClicks,
    addToCart,
    checkoutStart,
    assistedPurchaseClicks,
    visitToProductRate: rate(productViews, input.visits),
    productToBuyClickRate: rate(buyClicks, productViews),
    buyClickToCheckoutRate: rate(checkoutStart, buyClicks),
  };
}

export function aggregateProductIntentEvents(events: Array<{
  market: Market | string;
  productOfferId: string;
  productTitle: string;
  eventType: string;
}>) {
  const rows = new Map<string, {
    key: string;
    market: string;
    product: string;
    productViews: number;
    buyClicks: number;
    checkoutStart: number;
    purchaseIntentRate: number;
  }>();

  for (const event of events) {
    const key = `${event.market}:${event.productOfferId}`;
    const row = rows.get(key) ?? {
      key,
      market: event.market,
      product: event.productTitle,
      productViews: 0,
      buyClicks: 0,
      checkoutStart: 0,
      purchaseIntentRate: 0,
    };
    if (event.eventType === "product_view") row.productViews += 1;
    if (event.eventType === "buy_click") row.buyClicks += 1;
    if (event.eventType === "checkout_start") row.checkoutStart += 1;
    row.purchaseIntentRate = rate(row.buyClicks, row.productViews);
    rows.set(key, row);
  }

  return [...rows.values()].sort((a, b) =>
    b.buyClicks - a.buyClicks
    || b.productViews - a.productViews
    || a.product.localeCompare(b.product),
  );
}

function normalizeSearchParams(input: TrafficVisitInput["searchParams"]) {
  if (input instanceof URLSearchParams) return input;
  const params = new URLSearchParams();
  if (!input) return params;
  for (const [key, value] of Object.entries(input)) {
    const item = Array.isArray(value) ? value[0] : value;
    if (item) params.set(key, item);
  }
  return params;
}

function attributionFromInput(input: Pick<PurchaseIntentEventInput, "attributionCookie" | "searchParams" | "referrer">) {
  const firstTouch = parseAttributionCookie(input.attributionCookie);
  const currentSearch = normalizeSearchParams(input.searchParams);
  return {
    referrer: firstTouch.referrer ?? null,
    utmSource: firstTouch.utmSource ?? getTrackedParam(currentSearch, "utm_source"),
    utmMedium: firstTouch.utmMedium ?? getTrackedParam(currentSearch, "utm_medium"),
    utmCampaign: firstTouch.utmCampaign ?? getTrackedParam(currentSearch, "utm_campaign"),
    utmContent: firstTouch.utmContent ?? getTrackedParam(currentSearch, "utm_content"),
    utmTerm: firstTouch.utmTerm ?? getTrackedParam(currentSearch, "utm_term"),
    gclid: firstTouch.gclid ?? getTrackedParam(currentSearch, "gclid"),
  };
}

function parseAttributionCookie(value: string | null | undefined) {
  const params = new URLSearchParams(value ?? "");
  return {
    referrer: sanitizeReferrer(params.get("referrer")),
    utmSource: getTrackedParam(params, "utm_source"),
    utmMedium: getTrackedParam(params, "utm_medium"),
    utmCampaign: getTrackedParam(params, "utm_campaign"),
    utmContent: getTrackedParam(params, "utm_content"),
    utmTerm: getTrackedParam(params, "utm_term"),
    gclid: getTrackedParam(params, "gclid"),
  };
}

function getTrackedParam(searchParams: URLSearchParams, key: TrackedQueryParam) {
  return sanitizeString(searchParams.get(key), 255);
}

function sanitizePathname(value: string) {
  const cleaned = `/${value.trim().replace(/^\/+/, "")}`.split("?")[0] || "/";
  return sanitizeString(cleaned, 600) ?? "/";
}

function sanitizeSlug(value: string) {
  return sanitizeString(value, 255) ?? "";
}

function sanitizeReferrer(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return sanitizeString(`${url.origin}${url.pathname}`, 600);
  } catch {
    return null;
  }
}

function sanitizeString(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function summarizeUserAgent(value: string | null | undefined) {
  const cleaned = sanitizeString(value, 600);
  if (!cleaned) return null;
  const parsed = userAgentFromString(cleaned);
  const browser = parsed.browser.name || "Browser";
  const os = parsed.os.name || "OS";
  const device = parsed.device.type || "desktop";
  return sanitizeString(`${browser} / ${os} / ${device}${parsed.isBot ? " / bot" : ""}`, 255);
}

function hashSession(value: string | null | undefined) {
  const cleaned = sanitizeString(value, 120);
  return cleaned ? sha256(cleaned) : null;
}

function buildDedupeKey(input: Omit<NormalizedTrafficVisit, "dedupeKey">) {
  const bucket = Math.floor(input.visitedAt.getTime() / NOMA_TRAFFIC_DEDUPE_WINDOW_MS);
  const visitorKey = input.sessionHash ?? [
    input.userAgentSummary ?? "unknown-ua",
    input.referrer ?? "direct",
  ].join("|");
  return sha256([
    bucket,
    visitorKey,
    input.market,
    input.pathname,
    input.utmSource ?? "",
    input.utmMedium ?? "",
    input.utmCampaign ?? "",
    input.utmContent ?? "",
    input.utmTerm ?? "",
    input.gclid ?? "",
  ].join("\n"));
}

function buildPurchaseIntentDedupeKey(input: Omit<NormalizedPurchaseIntentEvent, "dedupeKey">) {
  const windowMs = input.eventType === "product_view" ? NOMA_PRODUCT_VIEW_DEDUPE_WINDOW_MS : NOMA_CLICK_DEDUPE_WINDOW_MS;
  const bucket = Math.floor(input.occurredAt.getTime() / windowMs);
  const visitorKey = input.sessionHash ?? [
    input.userAgentSummary ?? "unknown-ua",
    input.referrer ?? "direct",
  ].join("|");
  const variantKey = input.eventType === "product_view" ? "" : input.variantId ?? "";
  return sha256([
    bucket,
    visitorKey,
    input.market,
    input.eventType,
    input.productOfferId,
    variantKey,
    input.pathname,
  ].join("\n"));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function countEvents(events: Array<{ eventType: string }>, eventType: NomaPurchaseIntentEventType) {
  return events.filter((event) => event.eventType === eventType).length;
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
