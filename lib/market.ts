export const MARKETS = ["BR", "US"] as const;

export type Market = typeof MARKETS[number];

export const MARKET_COOKIE = "noma_market";

export const MARKET_CONFIG = {
  BR: {
    market: "BR",
    path: "/br",
    locale: "pt-BR",
    hreflang: "pt-BR",
    currency: "BRL",
    label: "Brasil",
    shortLabel: "BR",
    productSegment: "produto",
    categorySegment: "categoria",
    searchSegment: "buscar",
    collectionsSegment: "colecoes",
  },
  US: {
    market: "US",
    path: "/us",
    locale: "en-US",
    hreflang: "en-US",
    currency: "USD",
    label: "United States",
    shortLabel: "US",
    productSegment: "product",
    categorySegment: "category",
    searchSegment: "search",
    collectionsSegment: "collections",
  },
} as const satisfies Record<Market, {
  market: Market;
  path: string;
  locale: string;
  hreflang: string;
  currency: string;
  label: string;
  shortLabel: string;
  productSegment: string;
  categorySegment: string;
  searchSegment: string;
  collectionsSegment: string;
}>;

export function isMarket(value: unknown): value is Market {
  return typeof value === "string" && MARKETS.includes(value as Market);
}

export function marketFromPath(pathname: string): Market | null {
  if (pathname === "/br" || pathname.startsWith("/br/")) return "BR";
  if (pathname === "/us" || pathname.startsWith("/us/")) return "US";
  return null;
}

export function marketFromCountry(country: string | null | undefined): Market | null {
  const normalized = country?.trim().toUpperCase();
  if (normalized === "BR") return "BR";
  if (normalized === "US" || normalized === "USA") return "US";
  return null;
}

export function marketFromCookie(value: string | null | undefined): Market | null {
  const normalized = value?.trim().toUpperCase();
  return isMarket(normalized) ? normalized : null;
}

export function fallbackMarket(): Market {
  return "BR";
}

export function marketHomePath(market: Market) {
  return MARKET_CONFIG[market].path;
}

export function productPath(market: Market, slug: string) {
  return `${MARKET_CONFIG[market].path}/${MARKET_CONFIG[market].productSegment}/${slug}`;
}

export function categoryPath(market: Market, slug: string) {
  return `${MARKET_CONFIG[market].path}/${MARKET_CONFIG[market].categorySegment}/${slug}`;
}

export function searchPath(market: Market) {
  return `${MARKET_CONFIG[market].path}/${MARKET_CONFIG[market].searchSegment}`;
}

export function collectionsPath(market: Market) {
  return `${MARKET_CONFIG[market].path}/${MARKET_CONFIG[market].collectionsSegment}`;
}

export function equivalentStaticPath(pathname: string, target: Market) {
  const source = marketFromPath(pathname);
  if (!source) return marketHomePath(target);
  const sourceConfig = MARKET_CONFIG[source];
  const targetConfig = MARKET_CONFIG[target];
  const rest = pathname.slice(sourceConfig.path.length).replace(/^\/+/, "");
  const [segment, ...parts] = rest.split("/");
  if (!segment) return targetConfig.path;
  if (segment === sourceConfig.searchSegment) return `${targetConfig.path}/${targetConfig.searchSegment}`;
  if (segment === sourceConfig.categorySegment && parts[0]) return `${targetConfig.path}/${targetConfig.categorySegment}/${parts[0]}`;
  if (segment === sourceConfig.collectionsSegment) return `${targetConfig.path}/${targetConfig.collectionsSegment}`;
  if (segment === "sobre") return targetConfig.path;
  if (segment === "about") return targetConfig.path;
  return targetConfig.path;
}

export function parseMarketParam(value: string): Market | null {
  const upper = value.toUpperCase();
  return isMarket(upper) ? upper : null;
}

export function offerIdentityKey(supplierId: string, market: Market, supplierProductId: string) {
  return `${supplierId}:${market}:${supplierProductId}`;
}
