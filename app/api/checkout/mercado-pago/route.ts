import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createMercadoPagoCheckout, NOMA_TRAFFIC_ATTRIBUTION_COOKIE, NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/orders";
import { checkRateLimit } from "@/lib/rate-limit";

const checkoutSchema = z.object({
  productId: z.string().min(1).max(120),
  offerId: z.string().min(1).max(120),
  variantId: z.string().min(1).max(120).nullable().optional(),
  quantity: z.coerce.number().int().positive().max(5).default(1),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limit = checkRateLimit(`checkout-mp:${ip}`, Math.min(env.PUBLIC_RATE_LIMIT_PER_MINUTE, 20));
  if (!limit.allowed) {
    return NextResponse.json(
      { type: "error", error: "rate_limited", message: "Muitas tentativas. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1_000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ type: "error", error: "invalid_json", message: "Requisicao invalida." }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ type: "error", error: "invalid_request", message: "Revise a selecao do produto." }, { status: 400 });
  }

  const idempotencyKey = request.headers.get("idempotency-key") || randomUUID();
  try {
    const result = await createMercadoPagoCheckout({
      ...parsed.data,
      idempotencyKey,
      attributionCookie: request.cookies.get(NOMA_TRAFFIC_ATTRIBUTION_COOKIE)?.value ?? null,
      sessionId: request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value ?? null,
    });

    if (result.type === "error") {
      return NextResponse.json({ type: "error", error: result.code, message: result.message }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Mercado Pago checkout] failed", publicErrorCode(error));
    return NextResponse.json({ type: "error", error: "checkout_failed", message: "Nao foi possivel iniciar o checkout agora." }, { status: 500 });
  }
}

function publicErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
}
