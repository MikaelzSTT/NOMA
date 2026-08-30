import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MARKET_COOKIE, fallbackMarket, marketFromCookie, marketFromCountry, marketHomePath } from "@/lib/market";

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
  const url = request.nextUrl.clone();
  url.pathname = resolveMarketRedirect(request);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/",
};
