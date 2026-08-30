"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe2 } from "lucide-react";
import { MARKET_CONFIG, MARKETS, type Market } from "@/lib/market";

export function MarketSwitcher({
  market,
  productId,
  className = "",
}: {
  market: Market;
  productId?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchMarket(nextMarket: Market) {
    if (nextMarket === market) return;
    startTransition(async () => {
      const params = new URLSearchParams({ to: nextMarket, path: pathname || "/" });
      if (productId) params.set("productId", productId);
      const response = await fetch(`/api/market/switch?${params.toString()}`, { cache: "no-store" });
      const body = response.ok ? await response.json() as { href?: string } : {};
      router.push(body.href ?? MARKET_CONFIG[nextMarket].path);
      router.refresh();
    });
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-xs font-semibold ${className}`}>
      <Globe2 size={14} aria-hidden="true" />
      <span className="sr-only">Market</span>
      <select
        value={market}
        disabled={pending}
        onChange={(event) => switchMarket(event.target.value as Market)}
        aria-label="Selecionar mercado"
        className="bg-transparent font-semibold outline-none"
      >
        {MARKETS.map((item) => (
          <option key={item} value={item}>{MARKET_CONFIG[item].label}</option>
        ))}
      </select>
    </label>
  );
}
