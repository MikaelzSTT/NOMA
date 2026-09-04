import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const MERCADO_PAGO_API_BASE = "https://api.mercadopago.com";

export type MercadoPagoPreferenceInput = {
  idempotencyKey: string;
  body: {
    items: Array<{
      id: string;
      title: string;
      quantity: number;
      unit_price: number;
      currency_id: "BRL";
    }>;
    shipments?: { cost: number; mode: "not_specified" };
    external_reference: string;
    notification_url: string;
    back_urls: { success: string; pending: string; failure: string };
    auto_return: "approved";
    metadata: Record<string, string | number | null>;
  };
};

export type MercadoPagoPreferenceResponse = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

export type MercadoPagoPayment = {
  id: number | string;
  status: string;
  status_detail?: string | null;
  transaction_amount: number;
  currency_id: string;
  external_reference?: string | null;
  date_approved?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function createMercadoPagoPreference(input: MercadoPagoPreferenceInput) {
  const token = requireMercadoPagoAccessToken();
  const response = await fetch(`${MERCADO_PAGO_API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify(input.body),
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new MercadoPagoApiError("preference_create_failed", response.status);
  }

  const id = stringField(payload, "id");
  const initPoint = stringField(payload, "init_point");
  if (!id || !initPoint) throw new MercadoPagoApiError("preference_invalid_response", response.status);
  return { id, init_point: initPoint, sandbox_init_point: stringField(payload, "sandbox_init_point") } satisfies MercadoPagoPreferenceResponse;
}

export async function getMercadoPagoPayment(paymentId: string) {
  if (!/^\d{1,32}$/.test(paymentId)) throw new MercadoPagoApiError("invalid_payment_id", 400);
  const token = requireMercadoPagoAccessToken();
  const response = await fetch(`${MERCADO_PAGO_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  const payload = await safeJson(response);
  if (!response.ok) throw new MercadoPagoApiError("payment_fetch_failed", response.status);
  if (!payload || typeof payload !== "object") throw new MercadoPagoApiError("payment_invalid_response", response.status);
  return payload as MercadoPagoPayment;
}

export function verifyMercadoPagoWebhookSignature(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret?: string | null;
}) {
  const secret = input.secret ?? env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return { verified: false, reason: "missing_secret" as const };
  const parsed = parseSignatureHeader(input.xSignature);
  if (!parsed.ts || !parsed.v1 || !input.xRequestId || !input.dataId) {
    return { verified: false, reason: "missing_signature_parts" as const };
  }
  const manifest = [
    `id:${input.dataId.toLowerCase()}`,
    `request-id:${input.xRequestId}`,
    `ts:${parsed.ts}`,
    "",
  ].join(";");
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return {
    verified: safeEqualHex(expected, parsed.v1),
    reason: safeEqualHex(expected, parsed.v1) ? undefined : "signature_mismatch" as const,
  };
}

export class MercadoPagoApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

function requireMercadoPagoAccessToken() {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    throw new MercadoPagoApiError("missing_access_token", 500);
  }
  return env.MERCADO_PAGO_ACCESS_TOKEN;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function stringField(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

function parseSignatureHeader(value: string | null) {
  const entries = new Map<string, string>();
  for (const part of value?.split(",") ?? []) {
    const [key, item] = part.split("=", 2);
    if (key && item) entries.set(key.trim(), item.trim());
  }
  return { ts: entries.get("ts"), v1: entries.get("v1") };
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
