import { MarketCollectionsPage, collectionsMetadata } from "@/app/(store)/market-pages";

export const metadata = collectionsMetadata("US");

export default function UsCollectionsPage() {
  return <MarketCollectionsPage market="US" />;
}
