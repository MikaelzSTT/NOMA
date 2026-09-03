import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

const mocks = vi.hoisted(() => ({
  db: {
    productMarketOffer: {
      findFirst: vi.fn(),
    },
    nomaPurchaseIntentEvent: {
      create: vi.fn(async () => ({ id: "event-1" })),
    },
    nomaTrafficVisit: {
      create: vi.fn(async () => ({ id: "visit-1" })),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { POST } from "@/app/api/noma/events/route";
import {
  aggregateProductIntentEvents,
  buildTrafficFunnel,
  normalizePurchaseIntentEvent,
  recordPurchaseIntentEvent,
} from "@/lib/noma-traffic";

describe("tracking de intencao de compra NOMA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T12:00:00.000Z"));
    mocks.db.productMarketOffer.findFirst.mockResolvedValue(offerFixture());
    mocks.db.nomaPurchaseIntentEvent.create.mockResolvedValue({ id: "event-1" });
  });

  it("visita Google -> navega -> buy_click mantem UTM/gclid da sessao", async () => {
    await postEvent({
      eventType: "buy_click",
      market: "BR",
      productId: "product-1",
      productSlug: "sofa-arco",
      variantId: "variant-1",
      pathname: "/br/produto/sofa-arco",
    }, `${NOMA_TRAFFIC_SESSION_COOKIE}=session-123; ${NOMA_TRAFFIC_ATTRIBUTION_COOKIE}=utm_source=google&utm_medium=cpc&utm_campaign=trafego&utm_content=criativo-a&utm_term=sofa&gclid=abc123`);

    expect(mocks.db.nomaPurchaseIntentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "buy_click",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "trafego",
        utmContent: "criativo-a",
        utmTerm: "sofa",
        gclid: "abc123",
      }),
    });
  });

  it("clique em comprar cria 1 evento validado", async () => {
    const response = await postEvent({
      eventType: "buy_click",
      market: "BR",
      productId: "product-1",
      productSlug: "sofa-arco",
      variantId: "variant-1",
      pathname: "/br/produto/sofa-arco",
    });

    expect(response.status).toBe(202);
    expect(mocks.db.productMarketOffer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ market: "BR", slug: "sofa-arco", productId: "product-1" }),
    }));
    expect(mocks.db.nomaPurchaseIntentEvent.create).toHaveBeenCalledTimes(1);
    expect(createdEvent()).toMatchObject({
      eventType: "buy_click",
      market: "BR",
      productId: "product-1",
      productOfferId: "offer-1",
      productSlug: "sofa-arco",
      productTitle: "Sofa Arco",
      variantId: "variant-1",
      variantLabel: "Linho natural",
      displayedPrice: 1234.56,
      currency: "BRL",
    });
  });

  it("double click rapido nao duplica no banco", async () => {
    mocks.db.nomaPurchaseIntentEvent.create
      .mockResolvedValueOnce({ id: "event-1" })
      .mockRejectedValueOnce({ code: "P2002" });

    const first = await normalizePurchaseIntentEvent(baseInput());
    const second = await normalizePurchaseIntentEvent(baseInput());

    expect(first?.dedupeKey).toBe(second?.dedupeKey);
    await expect(recordPurchaseIntentEvent(first!)).resolves.toEqual({ recorded: true });
    await expect(recordPurchaseIntentEvent(second!)).resolves.toEqual({ recorded: false, deduped: true });
  });

  it("eventos BR/US ficam separados", async () => {
    mocks.db.productMarketOffer.findFirst
      .mockResolvedValueOnce(offerFixture({ id: "offer-br", marketTitle: "Sofa BR", currency: "BRL" }))
      .mockResolvedValueOnce(offerFixture({ id: "offer-us", marketTitle: "Sofa US", currency: "USD" }));

    const br = await normalizePurchaseIntentEvent(baseInput({ market: "BR", pathname: "/br/produto/sofa-arco" }));
    const us = await normalizePurchaseIntentEvent(baseInput({ market: "US", pathname: "/us/product/sofa-arco" }));

    expect(br?.market).toBe("BR");
    expect(us?.market).toBe("US");
    expect(br?.dedupeKey).not.toBe(us?.dedupeKey);
  });

  it("produto e variante corretos sao associados", async () => {
    await postEvent({
      eventType: "checkout_start",
      market: "BR",
      productId: "product-1",
      productSlug: "sofa-arco",
      variantId: "variant-2",
      pathname: "/br/produto/sofa-arco",
    });

    expect(createdEvent()).toMatchObject({
      eventType: "checkout_start",
      variantId: "variant-2",
      variantLabel: "Boucle areia",
      displayedPrice: 1444.9,
    });
  });

  it("admin agrega o funil corretamente", () => {
    const events = [
      productEvent("product_view"),
      productEvent("product_view"),
      productEvent("buy_click"),
      productEvent("checkout_start"),
      productEvent("add_to_cart"),
      productEvent("assisted_purchase_click", "offer-2", "Mesa Lina"),
    ];

    expect(buildTrafficFunnel({ visits: 10, events })).toEqual({
      visits: 10,
      productViews: 2,
      buyClicks: 1,
      addToCart: 1,
      checkoutStart: 1,
      assistedPurchaseClicks: 1,
      visitToProductRate: 20,
      productToBuyClickRate: 50,
      buyClickToCheckoutRate: 100,
    });
    expect(aggregateProductIntentEvents(events)).toEqual([
      expect.objectContaining({ product: "Sofa Arco", productViews: 2, buyClicks: 1, checkoutStart: 1, purchaseIntentRate: 50 }),
      expect.objectContaining({ product: "Mesa Lina", productViews: 0, buyClicks: 0, checkoutStart: 0, purchaseIntentRate: 0 }),
    ]);
  });
});

function baseInput(overrides: Partial<Parameters<typeof normalizePurchaseIntentEvent>[0]> = {}) {
  return {
    eventType: "buy_click",
    market: "BR",
    productId: "product-1",
    productSlug: "sofa-arco",
    variantId: "variant-1",
    pathname: "/br/produto/sofa-arco",
    sessionId: "session-123",
    occurredAt: new Date("2026-09-03T12:00:00.000Z"),
    ...overrides,
  };
}

function offerFixture(overrides: { id?: string; marketTitle?: string; currency?: string } = {}) {
  return {
    id: overrides.id ?? "offer-1",
    productId: "product-1",
    slug: "sofa-arco",
    title: overrides.marketTitle ?? "Sofa Arco",
    sellingPrice: 1550,
    currency: overrides.currency ?? "BRL",
    product: { title: "Sofa base" },
    variants: [
      { id: "variant-1", label: "Linho natural", salePrice: 1234.56 },
      { id: "variant-2", label: "Boucle areia", salePrice: 1444.9 },
    ],
  };
}

function productEvent(eventType: string, productOfferId = "offer-1", productTitle = "Sofa Arco") {
  return { eventType, market: "BR", productOfferId, productTitle };
}

async function postEvent(payload: Record<string, string>, cookie?: string) {
  return POST(new NextRequest(new Request("https://noma.test/api/noma/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 Chrome/126 Safari/537.36",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(payload),
  })));
}

function createdEvent() {
  const call = mocks.db.nomaPurchaseIntentEvent.create.mock.calls.at(-1) as unknown as [{ data: unknown }];
  return call[0].data;
}
