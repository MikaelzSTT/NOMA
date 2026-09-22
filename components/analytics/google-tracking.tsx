"use client";

import { useEffect, useMemo } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildGoogleAdsLeadConversionParams,
  buildGoogleAdsPurchaseConversionParams,
  buildTrafficParams,
  GOOGLE_ADS_ID,
  googleAdsConversionTarget,
  googleTagLoaderId,
  hasGoogleTrackingConfig,
  type GoogleAdsLeadConversionParams,
  type GoogleAdsPurchaseConversionParams,
  type GoogleTrackingConfig,
  type TrafficParams,
} from "@/lib/tracking";
import { marketFromPath, type Market } from "@/lib/market";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __NOMA_GTAG_INITIALIZED__?: boolean;
    __NOMA_GTAG_CONFIGURED_IDS__?: string[];
    __NOMA_GOOGLE_ADS_CONVERSIONS__?: Record<string, true>;
    __NOMA_TRACKING_DEBUG__?: {
      configured: {
        ga: boolean;
        ads: boolean;
        adsConversion: boolean;
      };
      events: Array<{ name: string; params: TrafficParams }>;
    };
  }
}

type GoogleAdsPurchase = {
  transactionId: string;
  value: number;
  currency: "BRL";
};

type PurchaseConversionStatus =
  | { status: "approved"; conversion: GoogleAdsPurchase }
  | { status: "pending" | "terminal" };

const PURCHASE_STATUS_POLL_INTERVAL_MS = 3_000;
const PURCHASE_STATUS_MAX_ATTEMPTS = 100;

export function GoogleTracking({
  config,
}: {
  config: GoogleTrackingConfig;
}) {
  if (!hasGoogleTrackingConfig(config)) return null;

  return (
    <>
      <Script
        id="noma-gtag"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagLoaderId(config) ?? "")}`}
        strategy="afterInteractive"
      />
      <GooglePageView config={config} />
    </>
  );
}

export function GoogleLandingView({
  config,
  market,
}: {
  config: GoogleTrackingConfig;
  market: Market;
}) {
  if (!hasGoogleTrackingConfig(config)) return null;

  return <GoogleEvent name="landing_view" config={config} market={market} includeAdsConversion />;
}

export function GoogleAdsPurchaseConversion({
  initialConversion,
  statusEndpoint,
}: {
  initialConversion?: GoogleAdsPurchase;
  statusEndpoint?: string;
}) {
  const transactionId = initialConversion?.transactionId;
  const value = initialConversion?.value;

  useEffect(() => {
    if (transactionId && value != null) {
      sendGoogleAdsPurchaseConversion({ transactionId, value, currency: "BRL" });
      return;
    }
    if (!statusEndpoint) return;

    let cancelled = false;
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function checkStatus() {
      attempts += 1;
      try {
        const response = await fetch(statusEndpoint!, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (response.status === 404) return;

        if (response.ok) {
          const payload = await response.json() as PurchaseConversionStatus;
          if (cancelled) return;
          if (payload.status === "approved") {
            sendGoogleAdsPurchaseConversion(payload.conversion);
            return;
          }
          if (payload.status === "terminal") return;
        }
      } catch {
        // A falha de rede nao deve transformar um status desconhecido em conversao.
      }

      if (!cancelled && attempts < PURCHASE_STATUS_MAX_ATTEMPTS) {
        timeout = setTimeout(checkStatus, PURCHASE_STATUS_POLL_INTERVAL_MS);
      }
    }

    void checkStatus();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [statusEndpoint, transactionId, value]);

  return null;
}

export function sendGoogleAdsPurchaseConversion(conversion: GoogleAdsPurchase) {
  if (conversion.currency !== "BRL") return false;
  return sendGoogleAdsConversion(buildGoogleAdsPurchaseConversionParams(conversion));
}

export function sendGoogleAdsLeadConversion(transactionId: string) {
  return sendGoogleAdsConversion(buildGoogleAdsLeadConversionParams(transactionId));
}

function GooglePageView({ config }: { config: GoogleTrackingConfig }) {
  return <GoogleEvent name="page_view" config={config} />;
}

function GoogleEvent({
  name,
  config,
  market,
  includeAdsConversion = false,
}: {
  name: "page_view" | "landing_view";
  config: GoogleTrackingConfig;
  market?: Market;
  includeAdsConversion?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = useMemo(() => {
    const value = searchParams.toString();
    return value ? `?${value}` : "";
  }, [searchParams]);

  useEffect(() => {
    configureGoogleTags(config);
    if (!window.gtag) return;

    const resolvedMarket = market ?? marketFromPath(pathname) ?? undefined;
    const payload = buildTrafficParams({
      pathname,
      search,
      href: window.location.href,
      referrer: document.referrer,
      market: resolvedMarket,
    });

    window.gtag("event", name, payload);

    const conversionTarget = includeAdsConversion ? googleAdsConversionTarget(config) : undefined;
    if (conversionTarget) {
      window.gtag("event", "conversion", {
        send_to: conversionTarget,
        ...payload,
      });
    }

    const debugEnabled = new URLSearchParams(window.location.search).get("tracking_debug") === "1";
    if (debugEnabled) {
      window.__NOMA_TRACKING_DEBUG__ ??= {
        configured: {
          ga: Boolean(config.gaMeasurementId),
          ads: Boolean(config.googleAdsId),
          adsConversion: Boolean(config.googleAdsId && config.googleAdsConversionLabel),
        },
        events: [],
      };
      window.__NOMA_TRACKING_DEBUG__.events.push({ name, params: payload });
      console.info("[NOMA tracking]", name, window.__NOMA_TRACKING_DEBUG__.configured, payload);
    }
  }, [config, includeAdsConversion, market, name, pathname, search]);

  return null;
}

function configureGoogleTags(config: GoogleTrackingConfig) {
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };

  if (!window.__NOMA_GTAG_INITIALIZED__) {
    window.gtag("js", new Date());
    window.__NOMA_GTAG_INITIALIZED__ = true;
  }

  window.__NOMA_GTAG_CONFIGURED_IDS__ ??= [];
  const configuredIds = window.__NOMA_GTAG_CONFIGURED_IDS__;
  if (config.gaMeasurementId && !configuredIds.includes(config.gaMeasurementId)) {
    window.gtag("config", config.gaMeasurementId, { send_page_view: false });
    configuredIds.push(config.gaMeasurementId);
  }
  if (config.googleAdsId && !configuredIds.includes(config.googleAdsId)) {
    window.gtag("config", config.googleAdsId);
    configuredIds.push(config.googleAdsId);
  }
}

function sendGoogleAdsConversion(
  params: GoogleAdsPurchaseConversionParams | GoogleAdsLeadConversionParams,
) {
  if (typeof window === "undefined") return false;

  configureGoogleTags({ googleAdsId: GOOGLE_ADS_ID });
  if (!window.gtag) return false;

  const dedupeKey = `${params.send_to}:${params.transaction_id}`;
  window.__NOMA_GOOGLE_ADS_CONVERSIONS__ ??= {};
  if (window.__NOMA_GOOGLE_ADS_CONVERSIONS__[dedupeKey] || wasGoogleAdsConversionSent(dedupeKey)) {
    return false;
  }

  window.gtag("event", "conversion", params);
  window.__NOMA_GOOGLE_ADS_CONVERSIONS__[dedupeKey] = true;
  rememberGoogleAdsConversion(dedupeKey);
  return true;
}

function wasGoogleAdsConversionSent(dedupeKey: string) {
  try {
    return window.localStorage.getItem(localStorageKey(dedupeKey)) === "1";
  } catch {
    return false;
  }
}

function rememberGoogleAdsConversion(dedupeKey: string) {
  try {
    window.localStorage.setItem(localStorageKey(dedupeKey), "1");
  } catch {
    // transaction_id continua garantindo a deduplicacao no Google Ads.
  }
}

function localStorageKey(dedupeKey: string) {
  return `noma:google-ads:conversion:${dedupeKey}`;
}
