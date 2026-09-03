import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  attributionCookieValue,
  NOMA_TRAFFIC_ATTRIBUTION_COOKIE,
  NOMA_TRAFFIC_SESSION_COOKIE,
  normalizePurchaseIntentEvent,
  recordPurchaseIntentEvent,
} from "@/lib/noma-traffic";

const TRAFFIC_COOKIE_MAX_AGE_SECONDS = 60 * 30;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ recorded: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const sessionId = request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value || randomUUID();
  const attributionCookie = request.cookies.get(NOMA_TRAFFIC_ATTRIBUTION_COOKIE)?.value ?? null;

  try {
    const event = await normalizePurchaseIntentEvent({
      eventType: stringValue(payload.eventType),
      market: stringValue(payload.market),
      productId: stringValue(payload.productId),
      productSlug: stringValue(payload.productSlug),
      variantId: stringValue(payload.variantId),
      pathname: stringValue(payload.pathname) || new URL(request.url).pathname,
      referrer: stringValue(payload.referrer) || request.headers.get("referer"),
      searchParams: new URLSearchParams(stringValue(payload.search)),
      attributionCookie,
      userAgent: request.headers.get("user-agent"),
      sessionId,
    });

    if (!event) {
      return NextResponse.json({ recorded: false, error: "invalid_event" }, { status: 400 });
    }

    const result = await recordPurchaseIntentEvent(event);
    const response = NextResponse.json(result, { status: 202 });
    setCookieIfMissing(request, response, NOMA_TRAFFIC_SESSION_COOKIE, sessionId);
    if (!attributionCookie) {
      const nextAttribution = attributionCookieValue(event);
      if (nextAttribution) setCookieIfMissing(request, response, NOMA_TRAFFIC_ATTRIBUTION_COOKIE, nextAttribution);
    }
    return response;
  } catch (error) {
    console.error("[NOMA traffic] failed to record purchase intent event", error);
    return NextResponse.json({ recorded: false, error: "server_error" }, { status: 500 });
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function setCookieIfMissing(request: NextRequest, response: NextResponse, name: string, value: string) {
  if (request.cookies.get(name)?.value) return;
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: TRAFFIC_COOKIE_MAX_AGE_SECONDS,
  });
}
