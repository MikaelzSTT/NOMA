import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendGoogleAdsLeadConversion,
  sendGoogleAdsPurchaseConversion,
} from "@/components/analytics/google-tracking";

describe("conversoes Google Ads", () => {
  const storage = new Map<string, string>();
  const gtag = vi.fn();

  beforeEach(() => {
    storage.clear();
    gtag.mockClear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        gtag,
        dataLayer: [],
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("envia a compra uma unica vez no navegador com transaction_id", () => {
    const conversion = {
      transactionId: "BRORDER0001",
      value: 1_354.56,
      currency: "BRL" as const,
    };

    expect(sendGoogleAdsPurchaseConversion(conversion)).toBe(true);
    expect(sendGoogleAdsPurchaseConversion(conversion)).toBe(false);

    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-17990986153/BslfCL7KjIEdEKnT4oJD",
      value: 1_354.56,
      currency: "BRL",
      transaction_id: "BRORDER0001",
    });
    expect(gtag.mock.calls.filter((call) => call[0] === "event" && call[1] === "conversion")).toHaveLength(1);
  });

  it("envia o lead somente com o ID interno, sem dados pessoais", () => {
    expect(sendGoogleAdsLeadConversion("request-1")).toBe(true);

    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD",
      transaction_id: "request-1",
    });
  });
});
