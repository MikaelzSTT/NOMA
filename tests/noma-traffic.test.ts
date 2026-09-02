import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    nomaTrafficVisit: {
      create: vi.fn(async () => ({ id: "visit-1" })),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  normalizeMaintenanceVisit,
  recordMaintenanceVisit,
  summarizeTrafficSources,
  summarizeUtmCampaigns,
  trafficSourceLabel,
} from "@/lib/noma-traffic";

describe("tracking proprio NOMA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normaliza visita sem armazenar query sensivel nem user-agent bruto", () => {
    const visit = normalizeMaintenanceVisit({
      market: "BR",
      pathname: "/br/produto/sofa?email=x@y.com",
      referrer: "https://www.google.com/search?q=noma&email=x@y.com",
      searchParams: new URLSearchParams("utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123&email=x@y.com"),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      sessionId: "session-123",
      visitedAt: new Date("2026-09-01T12:00:00.000Z"),
    });

    expect(visit).toMatchObject({
      market: "BR",
      pathname: "/br/produto/sofa",
      referrer: "https://www.google.com/search",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "trafego",
      utmContent: "criativo-a",
      utmTerm: "sofa",
      gclid: "abc123",
    });
    expect(visit.userAgentSummary).toBe("Chrome / Mac OS / desktop");
    expect(visit.sessionHash).toHaveLength(64);
    expect(visit.dedupeKey).toHaveLength(64);
    expect(JSON.stringify(visit)).not.toContain("x@y.com");
    expect(JSON.stringify(visit)).not.toContain("Mozilla/5.0");
  });

  it("deduplica refresh proximo da mesma sessao e muda apos a janela", () => {
    const base = {
      market: "US" as const,
      pathname: "/us",
      searchParams: new URLSearchParams("utm_source=google"),
      sessionId: "same-session",
      userAgent: "Mozilla/5.0 Chrome/126 Safari/537.36",
    };

    const first = normalizeMaintenanceVisit({ ...base, visitedAt: new Date("2026-09-01T12:00:00.000Z") });
    const refresh = normalizeMaintenanceVisit({ ...base, visitedAt: new Date("2026-09-01T12:03:00.000Z") });
    const later = normalizeMaintenanceVisit({ ...base, visitedAt: new Date("2026-09-01T12:06:00.000Z") });

    expect(refresh.dedupeKey).toBe(first.dedupeKey);
    expect(later.dedupeKey).not.toBe(first.dedupeKey);
  });

  it("trata violacao unica de dedupe como visita ja registrada", async () => {
    mocks.db.nomaTrafficVisit.create.mockRejectedValueOnce({ code: "P2002" });
    const visit = normalizeMaintenanceVisit({ market: "BR", pathname: "/br", visitedAt: new Date("2026-09-01T12:00:00.000Z") });

    await expect(recordMaintenanceVisit(visit)).resolves.toEqual({ recorded: false, deduped: true });
  });

  it("agrupa origens e campanhas para o painel", () => {
    const rows = [
      { visitedAt: new Date(), utmSource: "google", utmCampaign: "black-friday", referrer: "https://www.google.com/" },
      { visitedAt: new Date(), utmSource: "google", utmCampaign: "black-friday", referrer: null },
      { visitedAt: new Date(), utmSource: null, utmCampaign: null, referrer: "https://instagram.com/p/1?x=1" },
      { visitedAt: new Date(), utmSource: null, utmCampaign: null, referrer: null },
    ];

    expect(trafficSourceLabel(rows[2]!)).toBe("instagram.com");
    expect(summarizeTrafficSources(rows)).toEqual([
      { label: "google", count: 2 },
      { label: "Direto", count: 1 },
      { label: "instagram.com", count: 1 },
    ]);
    expect(summarizeUtmCampaigns(rows)).toEqual([
      { label: "black-friday", count: 2 },
      { label: "Sem UTM", count: 2 },
    ]);
  });
});
