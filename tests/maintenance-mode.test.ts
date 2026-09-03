import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  isPublicMaintenanceModeEnabled,
  maintenancePath,
  resolveMaintenanceMarket,
  shouldBypassPublicMaintenance,
} from "@/lib/maintenance-mode";
import { NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";
import { proxy } from "@/proxy";

describe("modo temporario de trafego", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("maintenance ON reescreve visitantes publicos para a landing e preserva query params", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "true");
    const response = proxy(nextRequest("https://noma.test/br/produto/sofa?utm_source=google&utm_campaign=teste&gclid=abc123"));

    expect(response?.headers.get("x-middleware-rewrite")).toBe(
      "https://noma.test/traffic-test/br?utm_source=google&utm_campaign=teste&gclid=abc123",
    );
    expect(response?.headers.get("set-cookie")).toContain(`${NOMA_TRAFFIC_SESSION_COOKIE}=`);
  });

  it("maintenance OFF mantem o comportamento normal da loja", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");
    const response = proxy(nextRequest("https://noma.test/br/produto/sofa?utm_source=google"));

    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response?.headers.get("set-cookie")).toContain(`${NOMA_TRAFFIC_SESSION_COOKIE}=`);
    expect(forwardedHeaders(response!.headers).get("x-noma-original-pathname")).toBe("/br/produto/sofa");
    expect(forwardedHeaders(response!.headers).get("x-noma-original-search")).toBe("?utm_source=google");
  });

  it("/admin e APIs nao sao interceptados", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "true");

    for (const path of ["/admin", "/admin/produtos", "/admin/fornecedores", "/api/admin/import/url/preview"]) {
      const response = proxy(nextRequest(`https://noma.test${path}`));
      expect(response?.headers.get("x-middleware-next")).toBe("1");
      expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it("mantem redirect de / para o mercado quando maintenance esta desligado", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");
    const response = proxy(nextRequest("https://noma.test/?utm_source=google&utm_medium=cpc&gclid=abc123", "US"));

    expect(response?.headers.get("location")).toBe("https://noma.test/us?utm_source=google&utm_medium=cpc&gclid=abc123");
    expect(response?.headers.get("set-cookie")).toContain(`${NOMA_TRAFFIC_SESSION_COOKIE}=`);
  });

  it("helpers reconhecem flag, bypasses e mercado da landing", () => {
    expect(isPublicMaintenanceModeEnabled("true")).toBe(true);
    expect(isPublicMaintenanceModeEnabled("TRUE")).toBe(true);
    expect(isPublicMaintenanceModeEnabled("false")).toBe(false);
    expect(shouldBypassPublicMaintenance("/_next/static/app.js")).toBe(true);
    expect(shouldBypassPublicMaintenance("/images/noma/living-room.webp")).toBe(true);
    expect(shouldBypassPublicMaintenance("/br/categoria/sofas")).toBe(false);
    expect(resolveMaintenanceMarket({ pathname: "/us/search" })).toBe("US");
    expect(resolveMaintenanceMarket({ pathname: "/", country: "BR" })).toBe("BR");
    expect(maintenancePath("BR")).toBe("/traffic-test/br");
  });
});

function nextRequest(url: string, country = "BR") {
  return new NextRequest(new Request(url, { headers: { "x-vercel-ip-country": country } }));
}

function forwardedHeaders(headers: Headers) {
  const forwarded = new Headers();
  for (const key of headers.get("x-middleware-override-headers")?.split(",") ?? []) {
    const value = headers.get(`x-middleware-request-${key}`);
    if (value) forwarded.set(key, value);
  }
  return forwarded;
}
