import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

const mocks = vi.hoisted(() => ({
  db: {
    nomaTrafficVisit: {
      create: vi.fn(async () => ({ id: "visit-1" })),
    },
  },
  requestHeaders: new Headers(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => mocks.requestHeaders),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    }),
  };
});
vi.mock("@/components/analytics/google-tracking", () => ({
  GoogleLandingView: () => null,
}));
vi.mock("@/components/maintenance/maintenance-landing.module.css", () => ({
  default: new Proxy({}, { get: (_target, property) => String(property) }),
}));

import TemporaryMaintenancePage from "@/app/(store)/traffic-test/[market]/page";
import { proxy } from "@/proxy";

describe("registro server-side da landing de maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks = [];
    mocks.requestHeaders = new Headers();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("GET /br com UTM e maintenance ativo cria 1 NomaTrafficVisit", async () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "true");

    const request = new NextRequest(
      new Request("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste_noma", {
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/126 Safari/537.36",
          "x-vercel-ip-country": "BR",
        },
      }),
    );

    const response = proxy(request);
    expect(response?.headers.get("x-middleware-rewrite")).toBe(
      "https://noma.test/traffic-test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste_noma",
    );
    expect(response?.headers.get("set-cookie")).toContain(`${NOMA_TRAFFIC_SESSION_COOKIE}=`);

    mocks.requestHeaders = forwardedHeadersFromRewrite(response!.headers);
    await TemporaryMaintenancePage({
      params: Promise.resolve({ market: "br" }),
      searchParams: Promise.resolve({
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "teste_noma",
      }),
    });

    await Promise.all(mocks.afterCallbacks.map(async (callback) => callback()));

    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        market: "BR",
        pathname: "/br",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "teste_noma",
        sessionHash: expect.any(String),
      }),
    });
  });
});

function forwardedHeadersFromRewrite(headers: Headers) {
  const forwarded = new Headers();
  for (const key of headers.get("x-middleware-override-headers")?.split(",") ?? []) {
    const value = headers.get(`x-middleware-request-${key}`);
    if (value) forwarded.set(key, value);
  }
  return forwarded;
}
