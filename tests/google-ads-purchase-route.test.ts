import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicOrder: vi.fn(),
}));

vi.mock("@/lib/orders", () => ({ getPublicOrder: mocks.getPublicOrder }));

import { GET } from "@/app/api/orders/[order]/google-ads-conversion/route";

describe("GET /api/orders/[order]/google-ads-conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("so libera a conversao depois da aprovacao persistida do Mercado Pago", async () => {
    mocks.getPublicOrder.mockResolvedValue(approvedOrder());

    const response = await GET(
      new Request("https://noma.test/api/orders/BRORDER0001/google-ads-conversion"),
      { params: Promise.resolve({ order: "BRORDER0001" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      status: "approved",
      conversion: {
        transactionId: "BRORDER0001",
        value: 1_354.56,
        currency: "BRL",
      },
    });
  });

  it("nao expoe payload de conversao enquanto o pagamento esta pendente", async () => {
    mocks.getPublicOrder.mockResolvedValue(approvedOrder({
      paymentStatus: "PENDING",
      mercadoPagoPaymentId: null,
      paidAt: null,
    }));

    const response = await GET(
      new Request("https://noma.test/api/orders/BRORDER0001/google-ads-conversion"),
      { params: Promise.resolve({ order: "BRORDER0001" }) },
    );

    await expect(response.json()).resolves.toEqual({ status: "pending" });
  });
});

function approvedOrder(overrides: Record<string, unknown> = {}) {
  return {
    publicOrderNumber: "BRORDER0001",
    market: "BR",
    currency: "BRL",
    paymentStatus: "APPROVED",
    mercadoPagoPaymentId: "123",
    paidAt: new Date("2026-09-20T12:00:00.000Z"),
    total: 1_354.56,
    ...overrides,
  };
}
