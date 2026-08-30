import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { marketHomePath, type Market } from "@/lib/market";

export function Breadcrumbs({ items, market = "BR" }: { items: Array<{ label: string; href?: string }>; market?: Market }) {
  return (
    <nav aria-label="Navegacao estrutural" className="flex flex-wrap items-center gap-1 py-5 text-xs text-muted">
      <Link href={marketHomePath(market)} className="hover:text-brand">{market === "US" ? "Home" : "Inicio"}</Link>
      {items.map((item) => (
        <span key={`${item.label}-${item.href}`} className="inline-flex items-center gap-1">
          <ChevronRight size={13} aria-hidden="true" />
          {item.href ? <Link href={item.href} className="hover:text-brand">{item.label}</Link> : <span className="text-ink">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
