import type { Market } from "@/lib/market";

export type GoogleTrackingConfig = {
  gaMeasurementId?: string;
  googleAdsId?: string;
  googleAdsConversionLabel?: string;
};

export type TrafficParams = {
  page_path: string;
  page_location: string;
  page_referrer: string;
  market?: Market;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
};

const TRACKED_QUERY_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
] as const;

export function getGoogleTrackingConfig(): GoogleTrackingConfig {
  return {
    gaMeasurementId: cleanEnvValue(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID),
    googleAdsId: cleanEnvValue(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
    googleAdsConversionLabel: cleanEnvValue(process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL),
  };
}

export function hasGoogleTrackingConfig(config: GoogleTrackingConfig) {
  return Boolean(config.gaMeasurementId || config.googleAdsId);
}

export function hasGoogleAdsConversionConfig(config: GoogleTrackingConfig) {
  return Boolean(config.googleAdsId && config.googleAdsConversionLabel);
}

export function googleAdsConversionTarget(config: GoogleTrackingConfig) {
  return hasGoogleAdsConversionConfig(config)
    ? `${config.googleAdsId}/${config.googleAdsConversionLabel}`
    : undefined;
}

export function buildTrafficParams({
  pathname,
  search,
  href,
  referrer,
  market,
}: {
  pathname: string;
  search: string;
  href: string;
  referrer?: string;
  market?: Market | null;
}): TrafficParams {
  const searchParams = new URLSearchParams(search);
  const trackedSearch = trackedSearchString(searchParams);
  const payload: TrafficParams = {
    page_path: `${pathname}${trackedSearch}`,
    page_location: sanitizedCurrentUrl(href, pathname, trackedSearch),
    page_referrer: sanitizedReferrer(referrer),
  };

  if (market) payload.market = market;

  for (const key of TRACKED_QUERY_PARAMS) {
    const value = searchParams.get(key);
    if (value) payload[key] = value;
  }

  return payload;
}

function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trackedSearchString(searchParams: URLSearchParams) {
  const tracked = new URLSearchParams();
  for (const key of TRACKED_QUERY_PARAMS) {
    const value = searchParams.get(key);
    if (value) tracked.set(key, value);
  }
  const value = tracked.toString();
  return value ? `?${value}` : "";
}

function sanitizedCurrentUrl(href: string, pathname: string, trackedSearch: string) {
  try {
    const url = new URL(href);
    return `${url.origin}${pathname}${trackedSearch}`;
  } catch {
    return `${pathname}${trackedSearch}`;
  }
}

function sanitizedReferrer(referrer: string | undefined) {
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
