import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { MARKET_COOKIE, fallbackMarket, marketFromCookie, marketFromCountry, marketHomePath } from "@/lib/market";
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

  if (request.nextUrl.pathname !== "/") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = resolveMarketRedirect(request);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/((?!_next/static|_next/image).*)",
};
