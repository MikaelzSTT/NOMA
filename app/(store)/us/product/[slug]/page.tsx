import { MarketProductPage, productMetadata } from "@/app/(store)/market-pages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateMetadata(props: Props) {
  return productMetadata({ ...props, market: "US" });
}

export default function UsProductPage(props: Props) {
  return <MarketProductPage {...props} market="US" />;
}
