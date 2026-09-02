"use client";

import { useEffect, useMemo } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildTrafficParams,
  googleAdsConversionTarget,
  hasGoogleTrackingConfig,
  type GoogleTrackingConfig,
  type TrafficParams,
} from "@/lib/tracking";
import { marketFromPath, type Market } from "@/lib/market";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __NOMA_GTAG_CONFIGURED__?: boolean;
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
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.gaMeasurementId ?? config.googleAdsId ?? "")}`}
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

  if (window.__NOMA_GTAG_CONFIGURED__) return;

  window.gtag("js", new Date());
  if (config.gaMeasurementId) {
    window.gtag("config", config.gaMeasurementId, { send_page_view: false });
  }
  if (config.googleAdsId) {
    window.gtag("config", config.googleAdsId);
  }
  window.__NOMA_GTAG_CONFIGURED__ = true;
}
