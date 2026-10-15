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
    expect(open).not.toHaveBeenCalled();
    expect(gtag.mock.calls.some(([command]) => command === "consent")).toBe(false);
  });

  it("abre WhatsApp no proprio clique antes das tags e envia exatamente uma conversao por conta", () => {
    renderProduct();
    const button = attendanceButton();
    act(() => {
      button.click();
      // Assert before yielding to promises, timers or tag callbacks.
      expect(open).toHaveBeenCalledTimes(1);
      expect(conversions()).toHaveLength(2);
    });

    expect(open).toHaveBeenCalledWith(
      "https://wa.me/5511993595887?text=Ol%C3%A1%2C%20vim%20pelo%20site%20da%20NOMA%20e%20gostaria%20de%20atendimento.",
      "_blank",
      "noopener,noreferrer",
    );
    const transactionId = conversions()[0][2].transaction_id;
    expect(transactionId).toMatch(/^whatsapp-.+/);
    expect(conversions()).toEqual([
      ["event", "conversion", { send_to: "AW-17990986153/8MvVCLnLjIEdEKnT4oJD", transaction_id: transactionId }],
      ["event", "conversion", { send_to: "AW-415422628/_2feCLKWzP4cEKSxi8YB", transaction_id: transactionId }],
    ]);
    const firstConversionIndex = gtag.mock.calls.findIndex(([command, event]) => command === "event" && event === "conversion");
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(gtag.mock.invocationCallOrder[firstConversionIndex]);
    expect(mocks.trackIntent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "assisted_purchase_click" }));

    act(() => button.click());
    expect(open).toHaveBeenCalledTimes(2);
    expect(conversions()).toHaveLength(4);
    expect(conversions()[2][2].transaction_id).not.toBe(transactionId);
    expect(conversions()[2][2].transaction_id).toBe(conversions()[3][2].transaction_id);
  });

  it("mantem WhatsApp e tracking interno quando as tags falham", () => {
    renderProduct();
    gtag.mockImplementation(() => { throw new Error("Tag unavailable"); });
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(conversions()).toHaveLength(2);
    expect(mocks.trackIntent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "assisted_purchase_click" }));
  });

  it("enfileira as conversoes se o script ainda nao carregou", () => {
    delete window.gtag;
    renderProduct();
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    const commands = window.dataLayer!.map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(commands.filter(([command, event]) => command === "event" && event === "conversion")).toHaveLength(2);
  });

  it("nao converte ao exibir um produto de checkout ou clicar em seu botao desabilitado", () => {
    renderProduct({ fallback: { ...productProps.fallback, sellingPrice: 1_000 } });
    const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === "Calcule o frete para comprar")!;
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(conversions()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });

  it("tambem envia as duas conversoes no atendimento oferecido apos a cotacao de frete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ type: "assisted_purchase", message: "Solicite atendimento para esta entrega." }),
    }));
    renderProduct({ fallback: { ...productProps.fallback, sellingPrice: 1_000 } });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(conversions()).toHaveLength(0);
    act(() => attendanceButton().click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(conversions()).toHaveLength(2);
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
