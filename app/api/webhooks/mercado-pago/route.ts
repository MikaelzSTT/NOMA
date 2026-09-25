import { NextRequest, NextResponse } from "next/server";
import { applyMercadoPagoPaymentUpdate } from "@/lib/orders";
import { safeMercadoPagoErrorLog, verifyMercadoPagoWebhookSignature } from "@/lib/mercado-pago";

type MercadoPagoWebhookBody = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  id?: string | number;
  payment_id?: string | number;
  resource?: string;
};

export async function POST(request: NextRequest) {
  let body: MercadoPagoWebhookBody = {};
  try {
    body = await request.json();
  } catch {
    // IPN legado pode enviar apenas query string, sem corpo JSON.
  }

  const notification = extractMercadoPagoNotification(request, body);
  if (!notification.isPayment) {
    logNotification(notification, { updated: false, reason: "non_payment_notification" });
    return NextResponse.json({ received: true, ignored: true });
  }
  if (!notification.paymentId) {
    logNotification(notification, { updated: false, reason: "missing_payment_id" });
    return NextResponse.json({ received: false, reason: "missing_payment_id" }, { status: 400 });
  }
  if (!/^\d{1,32}$/.test(notification.paymentId)) {
    logNotification(notification, { updated: false, reason: "invalid_payment_id" });
    return NextResponse.json({ received: false, reason: "invalid_payment_id" }, { status: 400 });
  }

  if (notification.hasCompleteSignatureHeaders) {
    const signature = verifyMercadoPagoWebhookSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: notification.paymentId,
    });

    if (!signature.verified) {
      logNotification(notification, { updated: false, reason: signature.reason ?? "invalid_signature" });
      return NextResponse.json({ received: false, reason: signature.reason }, { status: 401 });
    }
    notification.signature = "verified";
  }

  try {
    // Mesmo sem assinatura, nenhum status do payload e confiado. O ID serve
    // somente para buscar e validar o pagamento na API autenticada do MP.
    const result = await applyMercadoPagoPaymentUpdate(notification.paymentId);
    logNotification(notification, result);
    const status = result.reason === "invalid_payment_id" ? 400 : 200;
    return NextResponse.json({ received: true, ...result }, { status });
  } catch (error) {
    console.error("[Mercado Pago webhook] processing failed", JSON.stringify({
      format: notification.format,
      paymentId: notification.paymentId,
      signature: notification.signature,
      error: safeMercadoPagoErrorLog(error),
    }));
    return NextResponse.json({ received: false }, { status: 500 });
  }
}

type Notification = {
  format: "modern" | "legacy" | "unknown";
  topic: string | null;
  isPayment: boolean;
  paymentId: string | null;
  hasAnySignatureHeader: boolean;
  hasCompleteSignatureHeaders: boolean;
  signature: "absent" | "incomplete" | "present" | "verified";
};

function extractMercadoPagoNotification(request: NextRequest, body: MercadoPagoWebhookBody): Notification {
  const search = request.nextUrl.searchParams;
  const topic = firstText(body.type, body.topic, search.get("type"), search.get("topic"))?.toLowerCase() ?? null;
  const action = firstText(body.action)?.toLowerCase() ?? null;
  const modernId = firstText(search.get("data.id"), search.get("data_id"), body.data?.id);
  const legacyId = firstText(
    search.get("payment_id"),
    search.get("id"),
    body.payment_id,
    body.id,
    paymentIdFromResource(search.get("resource") ?? body.resource ?? null),
  );
  const paymentId = modernId ?? legacyId ?? null;
  const hasSignature = Boolean(request.headers.get("x-signature"));
  const hasRequestId = Boolean(request.headers.get("x-request-id"));
  const hasAnySignatureHeader = hasSignature || hasRequestId;
  const hasCompleteSignatureHeaders = hasSignature && hasRequestId;
  const format = modernId ? "modern" : legacyId ? "legacy" : "unknown";

  return {
    format,
    topic,
    isPayment: topic === "payment" || Boolean(action?.startsWith("payment.")),
    paymentId,
    hasAnySignatureHeader,
    hasCompleteSignatureHeaders,
    signature: hasCompleteSignatureHeaders ? "present" : hasAnySignatureHeader ? "incomplete" : "absent",
  };
}

function firstText(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function paymentIdFromResource(resource: string | null) {
  if (!resource) return null;
  const match = resource.match(/(?:^|\/)(\d{1,32})(?:\/?(?:\?.*)?)$/);
  return match?.[1] ?? null;
}

function logNotification(notification: Notification, result: { updated: boolean; reason?: string }) {
  console.info("[Mercado Pago webhook] processed notification", JSON.stringify({
    format: notification.format,
    topic: notification.topic,
    paymentId: notification.paymentId,
    signature: notification.signature,
    updated: result.updated,
    reason: result.reason ?? null,
  }));
}
