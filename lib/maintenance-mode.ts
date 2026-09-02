import type { Market } from "@/lib/market";
import { fallbackMarket, marketFromCountry, marketFromPath } from "@/lib/market";

export const MAINTENANCE_MODE_ENV = "PUBLIC_MAINTENANCE_MODE";
export const MAINTENANCE_PATH_PREFIX = "/traffic-test";

const BYPASS_PREFIXES = [
  "/admin",
  "/api",
  "/_next",
  "/images",
  "/models",
  MAINTENANCE_PATH_PREFIX,
];

const BYPASS_EXACT_PATHS = new Set([
  "/favicon.ico",
  "/icon.svg",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

export function isPublicMaintenanceModeEnabled(value = process.env.PUBLIC_MAINTENANCE_MODE) {
  return value?.trim().toLowerCase() === "true";
}

export function shouldBypassPublicMaintenance(pathname: string) {
  if (BYPASS_EXACT_PATHS.has(pathname)) return true;
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return BYPASS_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function resolveMaintenanceMarket({
  pathname,
  country,
}: {
  pathname: string;
  country?: string | null;
}): Market {
  return marketFromPath(pathname) ?? marketFromCountry(country) ?? fallbackMarket();
}

export function maintenancePath(market: Market) {
  return `${MAINTENANCE_PATH_PREFIX}/${market.toLowerCase()}`;
}
