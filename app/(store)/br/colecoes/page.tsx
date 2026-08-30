import { MarketCollectionsPage, collectionsMetadata } from "@/app/(store)/market-pages";

export const metadata = collectionsMetadata("BR");

export default function BrCollectionsPage() {
  return <MarketCollectionsPage market="BR" />;
}
