import { NextRequest, NextResponse } from "next/server";
import { getEquivalentProductSlug, getProductBySlug } from "@/lib/catalog";
import {
  MARKET_COOKIE,
  MARKET_CONFIG,
  equivalentStaticPath,
  isMarket,
  marketFromPath,
  marketHomePath,
  productPath,
} from "@/lib/market";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("to")?.toUpperCase();
  const pathname = request.nextUrl.searchParams.get("path") ?? "/";
  if (!isMarket(target)) return NextResponse.json({ error: "Mercado inválido." }, { status: 400 });

  let href = equivalentStaticPath(pathname, target);
  const source = marketFromPath(pathname);
  if (source) {
    const sourceConfig = MARKET_CONFIG[source];
    const parts = pathname.slice(sourceConfig.path.length).replace(/^\/+/, "").split("/");
    if (parts[0] === sourceConfig.productSegment && parts[1]) {
      const sourceProduct = await getProductBySlug({ slug: parts[1], market: source });
      const productId = request.nextUrl.searchParams.get("productId") ?? sourceProduct?.productId;
      const slug = productId ? await getEquivalentProductSlug({ productId, market: target }) : null;
      href = slug ? productPath(target, slug) : marketHomePath(target);
    }
  }

  const response = NextResponse.json({ href });
  response.cookies.set(MARKET_COOKIE, target, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}
