import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsLeadConversionParams,
  buildGoogleAdsPurchaseConversionParams,
  buildTrafficParams,
  GOOGLE_ADS_ID,
  getGoogleTrackingConfig,
  googleAdsConversionTarget,
  hasGoogleAdsConversionConfig,
  hasGoogleTrackingConfig,
} from "@/lib/tracking";

describe("tracking Google", () => {
  it("configura a Google tag da conta de Ads usada pelas conversoes", () => {
    const configuredId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    try {
      expect(GOOGLE_ADS_ID).toBe("AW-17990986153");
      expect(getGoogleTrackingConfig().googleAdsId).toBe(GOOGLE_ADS_ID);
    } finally {
      if (configuredId === undefined) {
        delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
      } else {
        process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = configuredId;
      }
    }
  });

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

  it("monta a conversao de compra com valor real, BRL e pedido unico", () => {
    expect(buildGoogleAdsPurchaseConversionParams({
      value: 1_354.56,
      transactionId: "BRORDER0001",
    })).toEqual({
      send_to: "AW-17990986153/BslfCL7KjIEdEKnT4oJD",
      value: 1_354.56,
      currency: "BRL",
      transaction_id: "BRORDER0001",
    });
  });

  it("monta a conversao de lead sem dados pessoais", () => {
    expect(buildGoogleAdsLeadConversionParams("request-1")).toEqual({
      send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD",
      transaction_id: "request-1",
    });
  });
});
