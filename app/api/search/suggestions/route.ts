import { NextRequest, NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/catalog";
import { env } from "@/lib/env";
import { fallbackMarket, isMarket } from "@/lib/market";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limit = checkRateLimit(`suggest:${ip}`, env.PUBLIC_RATE_LIMIT_PER_MINUTE);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Muitas requisicoes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1_000)) } },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.slice(0, 120) ?? "";
  const marketParam = request.nextUrl.searchParams.get("market")?.toUpperCase();
  const market = isMarket(marketParam) ? marketParam : fallbackMarket();
  const suggestions = await getSearchSuggestions(query, market);
  return NextResponse.json(suggestions, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
