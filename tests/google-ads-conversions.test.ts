import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendGoogleAdsAssistedPurchaseConversions,
  sendGoogleAdsLeadConversion,
  sendGoogleAdsPurchaseConversion,
} from "@/components/analytics/google-tracking";

describe("conversoes Google Ads", () => {
  const storage = new Map<string, string>();
  const gtag = vi.fn();

  beforeEach(() => {
    storage.clear();
    gtag.mockReset();
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

    expect(gtag).toHaveBeenCalledWith("config", "AW-17990986153");
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
    expect(conversionCalls()).toHaveLength(1);
  });

  it("envia uma conversao por conta para o mesmo clique e configura cada destino uma vez", () => {
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(true);
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(false);

    expect(gtag.mock.calls.filter(([command]) => command === "config")).toEqual([
      ["config", "AW-17990986153"],
      ["config", "AW-415422628"],
    ]);
    expect(conversionCalls()).toEqual([
      ["event", "conversion", { send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD", transaction_id: "whatsapp-1" }],
      ["event", "conversion", { send_to: "AW-415422628/_2feCLKWzP4cEKSxi8YB", transaction_id: "whatsapp-1" }],
    ]);
  });

  it("deduplica por destino mesmo se a conversao antiga ja foi enviada", () => {
    sendGoogleAdsLeadConversion("whatsapp-1");
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(true);
    expect(conversionCalls()).toHaveLength(2);
  });

  it("preserva a deduplicacao apos recarregar a pagina", () => {
    sendGoogleAdsAssistedPurchaseConversions("whatsapp-1");
    delete window.__NOMA_GOOGLE_ADS_CONVERSIONS__;
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(false);
    expect(conversionCalls()).toHaveLength(2);
  });

  it("deduplica em memoria quando o armazenamento esta bloqueado", () => {
    window.localStorage.getItem = () => { throw new Error("Storage denied"); };
    window.localStorage.setItem = () => { throw new Error("Storage denied"); };
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(true);
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(false);
    expect(conversionCalls()).toHaveLength(2);
  });

  it("tenta o segundo destino se o primeiro falhar e permite repetir apenas o que falhou", () => {
    gtag.mockImplementation((command, event, params) => {
      if (command === "event" && event === "conversion" && params.send_to.startsWith("AW-17990986153/")) {
        throw new Error("Tag failed");
      }
    });
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(true);
    expect(conversionCalls()).toHaveLength(2);
    gtag.mockReset();
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(true);
    expect(conversionCalls()).toEqual([
      ["event", "conversion", { send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD", transaction_id: "whatsapp-1" }],
    ]);
  });

  it("preserva a fila de consentimento e enfileira os dois destinos antes do carregamento do script", () => {
    delete window.gtag;
    const consent = ["consent", "default", { ad_storage: "denied", analytics_storage: "denied" }];
    window.dataLayer!.push(consent);
    sendGoogleAdsAssistedPurchaseConversions("whatsapp-1");

    expect(window.dataLayer![0]).toBe(consent);
    const commands = window.dataLayer!.slice(1).map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands.map(([command, event]) => [command, event])).toEqual([
      ["js", expect.any(Date)],
      ["config", "AW-17990986153"],
      ["event", "conversion"],
      ["config", "AW-415422628"],
      ["event", "conversion"],
    ]);
    expect(window.dataLayer!.slice(1).every((entry) => Object.prototype.toString.call(entry) === "[object Arguments]")).toBe(true);
  });

  it("nao envia conversoes no servidor", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(sendGoogleAdsAssistedPurchaseConversions("whatsapp-1")).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("cria o gtag com o formato arguments esperado pelo script do Google", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dataLayer: [],
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
      },
    });

    expect(sendGoogleAdsLeadConversion("request-arguments")).toBe(true);

    const dataLayer = window.dataLayer!;
    expect(dataLayer).toHaveLength(3);
    expect(Array.isArray(dataLayer[0])).toBe(false);
    expect(Array.from(dataLayer[0] as ArrayLike<unknown>)).toEqual(["js", expect.any(Date)]);
    expect(Array.from(dataLayer[1] as ArrayLike<unknown>)).toEqual(["config", "AW-17990986153"]);
    expect(Array.from(dataLayer[2] as ArrayLike<unknown>)).toEqual([
      "event",
      "conversion",
      {
        send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD",
        transaction_id: "request-arguments",
      },
    ]);
  });

  function conversionCalls() {
    return gtag.mock.calls.filter(([command, event]) => command === "event" && event === "conversion");
  }
});
