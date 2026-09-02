import { HomeHeader } from "@/components/home/home-header";
import type { Market } from "@/lib/market";

export function Header({ market }: { market: Market }) {
  return <HomeHeader market={market} surface="solid" storeHeader />;
}
