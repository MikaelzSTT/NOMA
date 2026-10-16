// @vitest-environment jsdom

import { act, createElement, Fragment, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleTracking } from "@/components/analytics/google-tracking";
import { ProductDetailPurchase } from "@/components/product-detail-purchase";
import { getGoogleTrackingConfig } from "@/lib/tracking";

const mocks = vi.hoisted(() => ({
  pathname: "/br/produto/sofa-teste",
  trackIntent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/script", () => ({
  default: ({ id, src }: { id: string; src: string }) => createElement("script", { id, src }),
}));
vi.mock("@/components/analytics/noma-intent-tracking", () => ({
  trackNomaPurchaseIntent: mocks.trackIntent,
}));

describe("clique de atendimento na pagina de produto", () => {
  let root: Root;
  let container: HTMLDivElement;
  const gtag = vi.fn();
  const open = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    gtag.mockReset();
    open.mockReset();
    mocks.trackIntent.mockReset();
    mocks.pathname = "/br/produto/sofa-teste";
    window.gtag = gtag;
    window.dataLayer = [];
    window.localStorage.clear();
    vi.spyOn(window, "open").mockImplementation(open);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete window.gtag;
    delete window.dataLayer;
    delete window.__NOMA_GTAG_INITIALIZED__;
    delete window.__NOMA_GTAG_CONFIGURED_IDS__;
    delete window.__NOMA_GOOGLE_ADS_CONVERSIONS__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("usa um loader, configura ambas as contas uma vez e nao converte ao montar ou navegar", () => {
    renderProduct();
    mocks.pathname = "/br/produto/outro-sofa";
    renderProduct({ productSlug: "outro-sofa" });

    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.querySelector("script")?.src).toBe("https://www.googletagmanager.com/gtag/js?id=AW-17990986153");
    expect(gtag.mock.calls.filter(([command]) => command === "config")).toEqual([
      ["config", "G-TEST", { send_page_view: false }],
      ["config", "AW-17990986153"],
      ["config", "AW-415422628"],
    ]);
    expect(conversions()).toHaveLength(0);
    expect(whatsappEvents()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
    expect(gtag.mock.calls.some(([command]) => command === "consent")).toBe(false);
  });

  it("abre WhatsApp antes do evento GTM e emite um evento por clique sem conversoes diretas", () => {
    renderProduct();
    const push = vi.spyOn(window.dataLayer!, "push");
    const button = attendanceButton();
    act(() => {
      button.click();
      // Assert before yielding to promises, timers or tag callbacks.
      expect(open).toHaveBeenCalledTimes(1);
      expect(whatsappEvents()).toHaveLength(1);
      expect(conversions()).toHaveLength(0);
    });

    expect(open).toHaveBeenCalledWith(
      "https://wa.me/5511993595887?text=Ol%C3%A1%2C%20vim%20pelo%20site%20da%20NOMA%20e%20gostaria%20de%20atendimento.",
      "_blank",
      "noopener,noreferrer",
    );
    const transactionId = whatsappEvents()[0].transaction_id;
    expect(transactionId).toMatch(/^whatsapp-.+/);
    expect(whatsappEvents()).toEqual([{ event: "noma_whatsapp_click", transaction_id: transactionId }]);
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
    expect(mocks.trackIntent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "assisted_purchase_click" }));

    act(() => button.click());
    expect(open).toHaveBeenCalledTimes(2);
    expect(conversions()).toHaveLength(0);
    expect(whatsappEvents()).toHaveLength(2);
    expect(whatsappEvents()[1].transaction_id).not.toBe(transactionId);
  });

  it("mantem WhatsApp e tracking interno quando o dataLayer falha", () => {
    renderProduct();
    vi.spyOn(window.dataLayer!, "push").mockImplementation(() => { throw new Error("Tag unavailable"); });
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(conversions()).toHaveLength(0);
    expect(mocks.trackIntent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "assisted_purchase_click" }));
  });

  it("enfileira o evento preservando consentimento sem depender de gtag ou GTM carregados", () => {
    renderProduct();
    delete window.gtag;
    const consent = { event: "consent_initialized" };
    window.dataLayer!.push(consent);
    const queue = window.dataLayer;
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(window.dataLayer).toBe(queue);
    expect(window.dataLayer![0]).toBe(consent);
    expect(whatsappEvents()).toHaveLength(1);
    expect(window.gtag).toBeUndefined();
    expect(conversions()).toHaveLength(0);
  });

  it("cria a fila se o clique acontecer antes da inicializacao das tags", () => {
    renderProduct();
    delete window.gtag;
    delete window.dataLayer;
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(whatsappEvents()).toHaveLength(1);
    expect(conversions()).toHaveLength(0);
  });

  it("nao converte ao exibir um produto de checkout ou clicar em seu botao desabilitado", () => {
    renderProduct({ fallback: { ...productProps.fallback, sellingPrice: 1_000 } });
    const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === "Calcule o frete para comprar")!;
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(conversions()).toHaveLength(0);
    expect(whatsappEvents()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });

  it("tambem emite apenas o evento GTM no atendimento oferecido apos a cotacao de frete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ type: "assisted_purchase", message: "Solicite atendimento para esta entrega." }),
    }));
    renderProduct({ fallback: { ...productProps.fallback, sellingPrice: 1_000 } });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(conversions()).toHaveLength(0);
    expect(whatsappEvents()).toHaveLength(0);
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(conversions()).toHaveLength(0);
    expect(whatsappEvents()).toHaveLength(1);
  });

  function renderProduct(overrides: Partial<ComponentProps<typeof ProductDetailPurchase>> = {}) {
    act(() => root.render(createElement(StrictMode, null, createElement(Fragment, null,
      createElement(GoogleTracking, { config: { ...getGoogleTrackingConfig(), gaMeasurementId: "G-TEST" } }),
      createElement(ProductDetailPurchase, { ...productProps, ...overrides }),
    ))));
  }

  function attendanceButton() {
    return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Solicitar atendimento de compra")!;
  }

  function conversions() {
    return gtag.mock.calls.filter(([command, event]) => command === "event" && event === "conversion");
  }

  function whatsappEvents() {
    return (window.dataLayer ?? []).filter((entry) => (
      (entry as { event?: string })?.event === "noma_whatsapp_click"
    )) as Array<{ event: "noma_whatsapp_click"; transaction_id: string }>;
  }
});

const productProps: ComponentProps<typeof ProductDetailPurchase> = {
  productId: "product-1",
  offerId: "offer-1",
  productSlug: "sofa-teste",
  categorySlug: "moveis",
  images: [],
  name: "Sofa teste",
  brandLabel: "NOMA",
  shortDescription: null,
  rating: null,
  reviewCount: null,
  estimatedDelivery: null,
  installmentText: null,
  variants: [],
  colorMaterialOptions: [],
  fallback: {
    sellingPrice: 12_000,
    compareAtPrice: null,
    discountPercent: null,
    currency: "BRL",
    stock: 1,
    availability: "AVAILABLE",
  },
  market: "BR",
};
