import Link from "next/link";
import { BadgePercent, CircleHelp, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { MarketSwitcher } from "@/components/market-switcher";
import { SearchBox } from "@/components/search-box";
import { MARKET_CONFIG, searchPath, type Market } from "@/lib/market";

const quickLinks = ["eletronicos", "casa-e-cozinha", "moda", "esportes", "beleza"];

export function Header({ market }: { market: Market }) {
  const config = MARKET_CONFIG[market];
  return (
    <header data-store-header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="bg-ink text-white">
        <div className="container flex h-8 items-center justify-between text-[11px] font-semibold sm:text-xs">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> {market === "US" ? "Offers from identified sources" : "Ofertas de fontes identificadas"}</span>
          <div className="hidden items-center gap-5 sm:flex">
            <Link href={`${searchPath(market)}?sort=discount`} className="inline-flex items-center gap-1.5 hover:text-mint"><BadgePercent size={14} /> {market === "US" ? "Deals" : "Ofertas"}</Link>
            <Link href={config.path} className="inline-flex items-center gap-1.5 hover:text-mint"><CircleHelp size={14} /> {market === "US" ? "About" : "Como funciona"}</Link>
          </div>
        </div>
      </div>
      <div className="container flex min-h-20 items-center gap-4 py-3 lg:gap-8">
        <div className="hidden sm:block"><Logo /></div>
        <div className="sm:hidden"><Logo compact /></div>
        <SearchBox market={market} />
        <MarketSwitcher market={market} className="hidden text-ink lg:inline-flex" />
        <Link href="/admin" className="hidden text-sm font-bold text-ink hover:text-brand lg:block">Admin</Link>
      </div>
      <nav className="container flex h-10 items-center gap-6 overflow-x-auto border-t border-border text-sm font-semibold scrollbar-none" aria-label="Categorias principais">
        <Link href={searchPath(market)} className="whitespace-nowrap font-extrabold text-brand">{market === "US" ? "All products" : "Todos os produtos"}</Link>
        {quickLinks.map((slug) => <Link key={slug} href={`${config.path}/${config.categorySegment}/${slug}`} className="whitespace-nowrap text-ink hover:text-brand">{categoryLabel(slug, market)}</Link>)}
      </nav>
    </header>
  );
}

function categoryLabel(slug: string, market: Market) {
  const labels: Record<string, [string, string]> = {
    eletronicos: ["Eletronicos", "Electronics"],
    "casa-e-cozinha": ["Casa e cozinha", "Home and kitchen"],
    moda: ["Moda", "Fashion"],
    esportes: ["Esportes", "Sports"],
    beleza: ["Beleza", "Beauty"],
  };
  const item = labels[slug];
  return item ? item[market === "US" ? 1 : 0] : slug;
}
