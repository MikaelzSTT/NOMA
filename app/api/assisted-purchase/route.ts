import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  AssistedPurchaseError,
  assistedPurchaseRequestSchema,
  createAssistedPurchaseRequest,
} from "@/lib/assisted-purchase";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local";
  const limit = checkRateLimit(
    `assisted-purchase:${ip}`,
    Math.min(env.PUBLIC_RATE_LIMIT_PER_MINUTE, 10),
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { type: "error", error: "rate_limited", message: "Muitas tentativas. Aguarde um instante." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000))) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { type: "error", error: "invalid_json", message: "Requisição inválida." },
      { status: 400 },
    );
  }

  const parsed = assistedPurchaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { type: "error", error: "invalid_request", message: "Revise os dados informados." },
      { status: 400 },
    );
  }

  try {
    await createAssistedPurchaseRequest(
      parsed.data,
      request.headers.get("idempotency-key") ?? randomUUID(),
    );
    return NextResponse.json({ type: "success" }, { status: 201 });
  } catch (error) {
    if (error instanceof AssistedPurchaseError) {
      return NextResponse.json(
        { type: "error", error: error.code, message: error.publicMessage },
        { status: error.status },
      );
    }

    console.error("[Assisted purchase] failed", publicErrorCode(error));
    return NextResponse.json(
      { type: "error", error: "request_failed", message: "Não foi possível enviar sua solicitação agora." },
      { status: 500 },
    );
  }
}

function publicErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
}
