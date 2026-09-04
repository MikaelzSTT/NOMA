import { NextRequest, NextResponse } from "next/server";
import { applyMercadoPagoPaymentUpdate } from "@/lib/orders";
import { verifyMercadoPagoWebhookSignature } from "@/lib/mercado-pago";

type MercadoPagoWebhookBody = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  id?: string | number;
};

export async function POST(request: NextRequest) {
  let body: MercadoPagoWebhookBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const dataId = extractDataId(request, body);
  const topic = body.type ?? body.topic ?? request.nextUrl.searchParams.get("type") ?? request.nextUrl.searchParams.get("topic");
  const signature = verifyMercadoPagoWebhookSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
  });

  if (!signature.verified) {
    console.warn("[Mercado Pago webhook] rejected notification", signature.reason);
    return NextResponse.json({ received: false }, { status: 401 });
  }

  if (topic !== "payment") {
    return NextResponse.json({ received: true, ignored: true });
  }
  if (!dataId) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    const result = await applyMercadoPagoPaymentUpdate(dataId);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("[Mercado Pago webhook] processing failed", publicErrorCode(error));
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

function extractDataId(request: NextRequest, body: MercadoPagoWebhookBody) {
  const fromQuery = request.nextUrl.searchParams.get("data.id") ?? request.nextUrl.searchParams.get("data_id");
  const fromBody = body.data?.id ?? body.id;
  const value = fromQuery ?? (fromBody == null ? null : String(fromBody));
  return value?.trim() || null;
}

function publicErrorCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
}
