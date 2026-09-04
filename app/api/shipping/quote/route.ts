import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { quoteShipping } from "@/lib/shipping/engine";
import { ShippingQuoteError } from "@/lib/shipping/types";

const quoteSchema = z.object({
  offerId: z.string().min(1).max(120),
  variantId: z.string().min(1).max(120).nullable().optional(),
  destinationPostalCode: z.string().min(8).max(16),
  quantity: z.coerce.number().int().positive().max(5).default(1),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limit = checkRateLimit(`shipping-quote:${ip}`, Math.min(env.PUBLIC_RATE_LIMIT_PER_MINUTE, 30));
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

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ type: "error", error: "invalid_request", message: "Revise o CEP e a selecao do produto." }, { status: 400 });
  }

  try {
    const result = await quoteShipping(parsed.data);
    if (result.type === "manual") {
      return NextResponse.json({ type: "assisted_purchase", reason: result.reason, message: result.message }, { status: 409 });
    }
    return NextResponse.json({
      type: "quotes",
      quotes: result.quotes.map((quote) => ({
        quoteId: quote.quoteId,
        serviceCode: quote.serviceCode,
        serviceName: quote.serviceName,
        price: quote.price,
        currency: quote.currency,
        estimatedMinDays: quote.estimatedMinDays,
        estimatedMaxDays: quote.estimatedMaxDays,
        expiresAt: quote.expiresAt,
      })),
    });
  } catch (error) {
    if (error instanceof ShippingQuoteError) {
      return NextResponse.json({ type: "error", error: error.code, message: error.message }, { status: error.status });
    }
    console.error("[Shipping quote] failed", publicErrorCode(error));
    return NextResponse.json({ type: "error", error: "shipping_quote_failed", message: "Nao foi possivel calcular o frete agora." }, { status: 500 });
  }
}

function publicErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
}
