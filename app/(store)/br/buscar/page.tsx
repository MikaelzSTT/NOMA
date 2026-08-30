import { MarketSearchPage, searchMetadata } from "@/app/(store)/market-pages";
import type { RawSearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";
export const metadata = searchMetadata("BR");

export default function BrSearchPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <MarketSearchPage searchParams={searchParams} market="BR" />;
}
