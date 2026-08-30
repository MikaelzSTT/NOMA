import { MarketCategoryPage, categoryMetadata } from "@/app/(store)/market-pages";
import type { RawSearchParams } from "@/lib/search-params";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export function generateMetadata(props: Props) {
  return categoryMetadata({ ...props, market: "US" });
}

export default function UsCategoryPage(props: Props) {
  return <MarketCategoryPage {...props} market="US" />;
}
