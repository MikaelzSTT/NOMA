import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { MARKET_COOKIE, fallbackMarket, marketFromCookie, marketFromCountry, marketFromPath, marketHomePath } from "@/lib/market";
import {
  isPublicMaintenanceModeEnabled,
  maintenancePath,
  resolveMaintenanceMarket,
  shouldBypassPublicMaintenance,
} from "@/lib/maintenance-mode";
import { NOMA_TRAFFIC_SESSION_COOKIE } from "@/lib/noma-traffic-constants";

export function resolveMarketRedirect(request: Pick<NextRequest, "cookies" | "headers">) {
  const manualMarket = marketFromCookie(request.cookies.get(MARKET_COOKIE)?.value);
  if (manualMarket) return marketHomePath(manualMarket);

  const detectedMarket = marketFromCountry(
    request.headers.get("x-vercel-ip-country")
      ?? request.headers.get("cf-ipcountry")
      ?? request.headers.get("x-country-code"),
  );
  return marketHomePath(detectedMarket ?? fallbackMarket());
}

export function proxy(request: NextRequest) {
  if (isPublicMaintenanceModeEnabled() && !shouldBypassPublicMaintenance(request.nextUrl.pathname)) {
    const sessionId = request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value || randomUUID();
    const market = resolveMaintenanceMarket({
      pathname: request.nextUrl.pathname,
      country:
        request.headers.get("x-vercel-ip-country")
        ?? request.headers.get("cf-ipcountry")
        ?? request.headers.get("x-country-code"),
    });
    const url = request.nextUrl.clone();
    url.pathname = maintenancePath(market);
    url.search = request.nextUrl.search;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-noma-original-pathname", request.nextUrl.pathname);
    requestHeaders.set("x-noma-traffic-session", sessionId);

    const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    if (!request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value) {
      response.cookies.set(NOMA_TRAFFIC_SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 30,
      });
    }

    return response;
  }

  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = resolveMarketRedirect(request);
    url.search = request.nextUrl.search;
    const response = NextResponse.redirect(url);
    setTrafficSessionCookie(request, response, getOrCreateTrafficSessionId(request));
    return response;
  }

  if (request.nextUrl.pathname !== "/") {
    if (!shouldTrackPublicStoreRequest(request)) return NextResponse.next();

    const sessionId = getOrCreateTrafficSessionId(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-noma-original-pathname", request.nextUrl.pathname);
    requestHeaders.set("x-noma-original-search", request.nextUrl.search);
    requestHeaders.set("x-noma-traffic-session", sessionId);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    setTrafficSessionCookie(request, response, sessionId);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};

function shouldTrackPublicStoreRequest(request: NextRequest) {
  if (request.method !== "GET") return false;
  if (!marketFromPath(request.nextUrl.pathname)) return false;
  if (shouldBypassPublicMaintenance(request.nextUrl.pathname)) return false;
  if (request.headers.get("rsc")) return false;
  if (request.headers.get("next-router-prefetch")) return false;
  const purpose = request.headers.get("purpose") ?? request.headers.get("sec-purpose");
  if (purpose?.toLowerCase().includes("prefetch")) return false;
  const accept = request.headers.get("accept");
  return !accept || accept.includes("text/html") || accept.includes("*/*");
}

function getOrCreateTrafficSessionId(request: NextRequest) {
  return request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value || randomUUID();
}

function setTrafficSessionCookie(request: NextRequest, response: NextResponse, sessionId: string) {
  if (request.cookies.get(NOMA_TRAFFIC_SESSION_COOKIE)?.value) return;
  response.cookies.set(NOMA_TRAFFIC_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 30,
  });
}
