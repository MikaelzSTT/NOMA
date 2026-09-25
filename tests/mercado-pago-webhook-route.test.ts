import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyPaymentUpdate: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock("@/lib/orders", () => ({
  applyMercadoPagoPaymentUpdate: mocks.applyPaymentUpdate,
}));

vi.mock("@/lib/mercado-pago", () => ({
  safeMercadoPagoErrorLog: (error: unknown) => ({
    code: error && typeof error === "object" && "code" in error ? String(error.code) : "unknown",
  }),
  verifyMercadoPagoWebhookSignature: mocks.verifySignature,
}));

import { POST } from "@/app/api/webhooks/mercado-pago/route";

describe("Mercado Pago webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.verifySignature.mockReturnValue({ verified: true, reason: undefined });
    mocks.applyPaymentUpdate.mockResolvedValue({
      updated: true,
      orderNumber: "BRORDER0001",
      paymentStatus: "APPROVED",
      orderStatus: "PAID",
    });
  });

  it("processa webhook moderno assinado", async () => {
    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago",
      { type: "payment", action: "payment.updated", data: { id: "123" } },
      { "x-signature": "ts=1,v1=abc", "x-request-id": "req-1" },
    ));

    expect(response.status).toBe(200);
    expect(mocks.verifySignature).toHaveBeenCalledWith({
      xSignature: "ts=1,v1=abc",
      xRequestId: "req-1",
      dataId: "123",
    });
    expect(mocks.applyPaymentUpdate).toHaveBeenCalledWith("123");
    await expect(response.json()).resolves.toMatchObject({ received: true, updated: true });
  });

  it("processa webhook legado id + topic sem confiar em status do payload", async () => {
    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago?id=456&topic=payment&status=approved",
      undefined,
    ));

    expect(response.status).toBe(200);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.applyPaymentUpdate).toHaveBeenCalledWith("456");
    await expect(response.json()).resolves.toMatchObject({ received: true, updated: true });
  });

  it("sem assinatura usa payment_id apenas para reconciliacao autenticada", async () => {
    mocks.applyPaymentUpdate.mockResolvedValue({ updated: false, reason: "amount_mismatch" });

    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago?payment_id=789&topic=payment",
      { status: "approved" },
    ));

    expect(response.status).toBe(200);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.applyPaymentUpdate).toHaveBeenCalledWith("789");
    await expect(response.json()).resolves.toEqual({
      received: true,
      updated: false,
      reason: "amount_mismatch",
    });
  });

  it("com headers de assinatura incompletos ainda usa a consulta autenticada", async () => {
    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago?id=790&topic=payment",
      {},
      { "x-request-id": "req-without-signature" },
    ));

    expect(response.status).toBe(200);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.applyPaymentUpdate).toHaveBeenCalledWith("790");
  });

  it("rejeita payment_id invalido antes de consultar o Mercado Pago", async () => {
    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago?id=not-a-payment&topic=payment",
      {},
    ));

    expect(response.status).toBe(400);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
    expect(mocks.applyPaymentUpdate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ received: false, reason: "invalid_payment_id" });
  });

  it("nao faz fallback quando headers de assinatura estao presentes mas invalidos", async () => {
    mocks.verifySignature.mockReturnValue({ verified: false, reason: "signature_mismatch" });

    const response = await POST(webhookRequest(
      "https://noma.test/api/webhooks/mercado-pago",
      { type: "payment", data: { id: "123" } },
      { "x-signature": "ts=1,v1=invalid", "x-request-id": "req-1" },
    ));

    expect(response.status).toBe(401);
    expect(mocks.applyPaymentUpdate).not.toHaveBeenCalled();
  });
});

function webhookRequest(url: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }));
}
