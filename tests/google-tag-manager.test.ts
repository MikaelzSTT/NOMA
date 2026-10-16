// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import StoreLayout from "@/app/(store)/layout";

const navigation = vi.hoisted(() => ({ pathname: "/br" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/traffic/noma-traffic-recorder", () => ({
  NomaTrafficRecorder: () => null,
}));

afterEach(() => {
  delete window.dataLayer;
  delete window.gtag;
  delete window.__NOMA_GTAG_INITIALIZED__;
  delete window.__NOMA_GTAG_CONFIGURED_IDS__;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Google Tag Manager da loja", () => {
  it("renderiza o fallback oficial antes do conteudo da loja, sem depender de JavaScript", () => {
    const markup = renderToStaticMarkup(createElement(StoreLayout, null, createElement("main", null, "NOMA")));

    expect(markup).toMatch(/^<noscript><iframe /);
    expect(markup).toContain('src="https://www.googletagmanager.com/ns.html?id=GTM-T8ZDJ45R"');
    expect(markup).toContain('height="0" width="0" style="display:none;visibility:hidden"');
    expect(markup.match(/<noscript>/g)).toHaveLength(1);
    expect(markup.indexOf("</noscript>")).toBeLessThan(markup.indexOf("<main>"));
  });

  it("carrega uma vez no head, preserva dataLayer e Ads e nao converte ao navegar ou remontar", () => {
    // jsdom executes our inline bootstrap, but does not fetch external scripts:
    // no GTM/Ads requests or real conversion hits are made by this test.
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    const anchor = document.createElement("script");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queued = { event: "existing_event" };
    const dataLayer = [queued];
    window.dataLayer = dataLayer;
    // Seed the inline-script realm too (Vitest runs modules in a separate VM).
    Object.defineProperty(document, "__nomaTestDataLayer", { value: dataLayer, configurable: true });
    anchor.textContent = "window.dataLayer = document.__nomaTestDataLayer;";
    document.head.append(anchor);
    const gtag = vi.fn();
    window.gtag = gtag;

    try {
      for (const pathname of ["/br", "/br/produto/sofa", "/us", "/traffic-test/br"]) {
        navigation.pathname = pathname;
        act(() => root.render(createElement(StrictMode, null,
          createElement(StoreLayout, null, createElement("main", null, pathname)),
        )));
      }
      act(() => root.render(null));
      act(() => root.render(createElement(StoreLayout, null, createElement("main", null, "NOMA"))));

      const loaders = document.querySelectorAll<HTMLScriptElement>('script[src*="/gtm.js?id=GTM-T8ZDJ45R"]');
      expect(loaders).toHaveLength(1);
      expect(loaders[0].parentNode).toBe(document.head);
      expect(loaders[0].async).toBe(true);
      expect(document.querySelectorAll("#noma-google-tag-manager")).toHaveLength(1);
      expect(document.querySelectorAll('script[src*="/gtag/js?id="]')).toHaveLength(1);
      expect(window.dataLayer).toBe(dataLayer);
      expect(window.dataLayer[0]).toBe(queued);
      expect(window.dataLayer.filter((entry) => (entry as { event?: string }).event === "gtm.js")).toHaveLength(1);
      expect(window.gtag).toBe(gtag);
      expect(gtag.mock.calls.filter(([command]) => command === "config")).toEqual([
        ["config", "AW-17990986153"],
        ["config", "AW-415422628"],
      ]);
      expect(gtag.mock.calls.filter(([command, event]) => command === "event" && event === "conversion")).toEqual([]);
    } finally {
      act(() => root.unmount());
      container.remove();
      anchor.remove();
      document.querySelectorAll('script[src*="googletagmanager.com"], #noma-google-tag-manager').forEach((node) => node.remove());
      Reflect.deleteProperty(document, "__nomaTestDataLayer");
    }
  });
});
