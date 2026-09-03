import { headers } from "next/headers";
import { marketFromPath } from "@/lib/market";
import { scheduleTrafficVisitTracking } from "@/lib/noma-traffic";

export async function NomaTrafficRecorder() {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-noma-original-pathname") ?? "";
  const market = marketFromPath(pathname);
  const sessionId = requestHeaders.get("x-noma-traffic-session");

  if (!market || !sessionId) return null;

  scheduleTrafficVisitTracking({
    market,
    pathname,
    referrer: requestHeaders.get("referer"),
    searchParams: new URLSearchParams(requestHeaders.get("x-noma-original-search") ?? ""),
    userAgent: requestHeaders.get("user-agent"),
    sessionId,
  });

  return null;
}
