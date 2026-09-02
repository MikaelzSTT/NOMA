import { HomeFooter } from "@/components/home/home-footer";
import type { Market } from "@/lib/market";

export function Footer({ market = "BR" }: { market?: Market }) {
  return (
    <div data-store-footer>
      <HomeFooter market={market} embedded={false} />
    </div>
  );
}
