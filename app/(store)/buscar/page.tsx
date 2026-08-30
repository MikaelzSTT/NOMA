import { redirect } from "next/navigation";
import { searchPath } from "@/lib/market";
import type { RawSearchParams } from "@/lib/search-params";
import { buildPageUrl } from "@/lib/search-params";

export default async function LegacySearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  redirect(buildPageUrl(searchPath("BR"), raw, typeof raw.page === "string" ? Number(raw.page) || 1 : 1));
}
