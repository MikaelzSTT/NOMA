import "server-only";

import { createHash } from "node:crypto";
import { after, userAgentFromString } from "next/server";
import { db } from "@/lib/db";
import { isMarket, type Market } from "@/lib/market";
import { NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

export { NOMA_TRAFFIC_SESSION_COOKIE };
export const NOMA_TRAFFIC_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type TrackedQueryParam = "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "gclid";

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

function getTrackedParam(searchParams: URLSearchParams, key: TrackedQueryParam) {
  return sanitizeString(searchParams.get(key), 255);
}

function sanitizePathname(value: string) {
  const cleaned = `/${value.trim().replace(/^\/+/, "")}`.split("?")[0] || "/";
  return sanitizeString(cleaned, 600) ?? "/";
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

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
