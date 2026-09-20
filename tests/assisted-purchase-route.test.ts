import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createAssistedPurchaseRequest: vi.fn(),
  safeParse: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/assisted-purchase", () => ({
  AssistedPurchaseError: class AssistedPurchaseError extends Error {},
  assistedPurchaseRequestSchema: { safeParse: mocks.safeParse },
  createAssistedPurchaseRequest: mocks.createAssistedPurchaseRequest,
}));

import { POST } from "@/app/api/assisted-purchase/route";

describe("POST /api/assisted-purchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
    mocks.safeParse.mockReturnValue({ success: true, data: { productId: "product-1" } });
    mocks.createAssistedPurchaseRequest.mockResolvedValue({ type: "success", conversionId: "request-1" });
  });

  it("retorna o ID de conversao somente depois da persistencia bem-sucedida", async () => {
    const request = new NextRequest(new Request("https://noma.test/api/assisted-purchase", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "submission-key-http-0001",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ productId: "product-1" }),
    }));

    const response = await POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ type: "success", conversionId: "request-1" });
    expect(mocks.createAssistedPurchaseRequest).toHaveBeenCalledOnce();
  });

  it("aplica rate limit antes de processar dados pessoais", async () => {
    mocks.checkRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });
    const request = new NextRequest(new Request("https://noma.test/api/assisted-purchase", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ customerName: "Maria Silva", phone: "11999999999" }),
    }));

    const response = await POST(request);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ type: "error", error: "rate_limited" });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("assisted-purchase:203.0.113.10", 10);
    expect(mocks.safeParse).not.toHaveBeenCalled();
    expect(mocks.createAssistedPurchaseRequest).not.toHaveBeenCalled();
  });
});
