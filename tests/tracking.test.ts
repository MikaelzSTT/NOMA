import { describe, expect, it } from "vitest";
import {
  buildTrafficParams,
  googleAdsConversionTarget,
  hasGoogleAdsConversionConfig,
  hasGoogleTrackingConfig,
} from "@/lib/tracking";

describe("tracking Google", () => {
  it("so inicializa quando GA4 ou Google Ads estao configurados", () => {
    expect(hasGoogleTrackingConfig({})).toBe(false);
    expect(hasGoogleTrackingConfig({ googleAdsConversionLabel: "label" })).toBe(false);
    expect(hasGoogleTrackingConfig({ gaMeasurementId: "G-TEST" })).toBe(true);
    expect(hasGoogleTrackingConfig({ googleAdsId: "AW-TEST" })).toBe(true);
  });

  it("so dispara conversao quando Ads ID e label existem", () => {
    expect(hasGoogleAdsConversionConfig({ googleAdsId: "AW-TEST" })).toBe(false);
    expect(hasGoogleAdsConversionConfig({ googleAdsId: "AW-TEST", googleAdsConversionLabel: "abc" })).toBe(true);
    expect(googleAdsConversionTarget({ googleAdsId: "AW-TEST", googleAdsConversionLabel: "abc" })).toBe("AW-TEST/abc");
  });

  it("monta payload sem dados pessoais e com parametros de campanha", () => {
    expect(buildTrafficParams({
      pathname: "/br",
      search: "?utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123&email=x@y.com",
      href: "https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123&email=x@y.com",
      referrer: "https://www.google.com/",
      market: "BR",
    })).toEqual({
      page_path: "/br?utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123",
      page_location: "https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123",
      page_referrer: "https://www.google.com/",
      market: "BR",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "trafego",
      utm_content: "criativo-a",
      utm_term: "sofa",
      gclid: "abc123",
    });
  });
});
