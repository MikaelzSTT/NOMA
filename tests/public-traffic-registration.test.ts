import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

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

import { NomaTrafficRecorder } from "@/components/traffic/noma-traffic-recorder";
import { proxy } from "@/proxy";

describe("registro server-side da loja publica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    mocks.afterCallbacks = [];
    mocks.requestHeaders = new Headers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("GET /br com UTM e maintenance OFF cria 1 NomaTrafficVisit", async () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste1");

    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledTimes(1);
    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        market: "BR",
        pathname: "/br",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "teste1",
        gclid: null,
        sessionHash: expect.any(String),
      }),
    });
  });

  it("GET /br com gclid registra o gclid recebido na URL", async () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste2&gclid=abc123");

    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        market: "BR",
        pathname: "/br",
        utmCampaign: "teste2",
        gclid: "abc123",
      }),
    });
  });

  it("cria atribuicao first-touch com UTM/gclid e nao sobrescreve na mesma sessao", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    const first = proxy(nextRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste2&gclid=abc123", "same-session"));
    const firstCookie = first?.headers.get("set-cookie") ?? "";

    expect(firstCookie).toContain(`${NOMA_TRAFFIC_ATTRIBUTION_COOKIE}=`);
    expect(decodeURIComponent(firstCookie)).toContain("utm_source=google");
    expect(decodeURIComponent(firstCookie)).toContain("gclid=abc123");

    const second = proxy(nextRequest(
      "https://noma.test/br/produto/sofa?utm_source=facebook&utm_campaign=outra",
      "same-session",
      { cookie: `${NOMA_TRAFFIC_SESSION_COOKIE}=same-session; ${NOMA_TRAFFIC_ATTRIBUTION_COOKIE}=utm_source=google&utm_campaign=teste2&gclid=abc123` },
    ));

    expect(second?.headers.get("set-cookie")).toBeNull();
  });

  it("duas sessoes tecnicas diferentes na mesma URL geram duas visitas distintas", async () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste1", "session-a");
    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste1", "session-b");

    const first = createdVisitData(0);
    const second = createdVisitData(1);
    expect(mocks.db.nomaTrafficVisit.create).toHaveBeenCalledTimes(2);
    expect(first.sessionHash).not.toBe(second.sessionHash);
    expect(first.dedupeKey).not.toBe(second.dedupeKey);
  });

  it("refresh imediato da mesma sessao cai na mesma chave de dedupe", async () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste1", "same-session");
    await recordPublicRequest("https://noma.test/br?utm_source=google&utm_medium=cpc&utm_campaign=teste1", "same-session");

    const first = createdVisitData(0);
    const refresh = createdVisitData(1);
    expect(first.dedupeKey).toBe(refresh.dedupeKey);
  });

  it("nao registra admin, APIs, assets, RSC ou prefetch", () => {
    vi.stubEnv("PUBLIC_MAINTENANCE_MODE", "false");

    for (const request of [
      nextRequest("https://noma.test/admin?utm_source=google"),
      nextRequest("https://noma.test/api/search/suggestions?q=sofa"),
      nextRequest("https://noma.test/images/noma/living-room.webp?utm_source=google"),
      nextRequest("https://noma.test/br?utm_source=google", undefined, { rsc: "1" }),
      nextRequest("https://noma.test/br?utm_source=google", undefined, { "next-router-prefetch": "1" }),
    ]) {
      const response = proxy(request);
      expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response?.headers.get("set-cookie")).toBeNull();
      expect(forwardedHeaders(response!.headers).get("x-noma-traffic-session")).toBeNull();
    }
  });
});

async function recordPublicRequest(url: string, sessionId?: string) {
  const response = proxy(nextRequest(url, sessionId));
  expect(response?.headers.get("x-middleware-next")).toBe("1");

  mocks.requestHeaders = forwardedHeaders(response!.headers);
  await NomaTrafficRecorder();
  await Promise.all(mocks.afterCallbacks.map(async (callback) => callback()));
  mocks.afterCallbacks = [];
}

function nextRequest(url: string, sessionId?: string, extraHeaders?: Record<string, string>) {
  const headers = new Headers({
    "user-agent": "Mozilla/5.0 Chrome/126 Safari/537.36",
    "x-vercel-ip-country": "BR",
    ...extraHeaders,
  });
  if (sessionId && !extraHeaders?.cookie) headers.set("cookie", `${NOMA_TRAFFIC_SESSION_COOKIE}=${sessionId}`);
  return new NextRequest(new Request(url, { headers }));
}

function forwardedHeaders(headers: Headers) {
  const forwarded = new Headers();
  for (const key of headers.get("x-middleware-override-headers")?.split(",") ?? []) {
    const value = headers.get(`x-middleware-request-${key}`);
    if (value) forwarded.set(key, value);
  }
  return forwarded;
}

function createdVisitData(index: number) {
  const call = mocks.db.nomaTrafficVisit.create.mock.calls[index] as unknown as [{ data: {
    sessionHash: string | null;
    dedupeKey: string;
  } }];
  return call[0].data;
}
