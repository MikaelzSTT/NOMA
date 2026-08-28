import Link from "next/link";
import { BadgePercent, CircleHelp, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { SearchBox } from "@/components/search-box";

const quickLinks = [
  { href: "/categoria/eletronicos", label: "Eletronicos" },
  { href: "/categoria/casa-e-cozinha", label: "Casa e cozinha" },
  { href: "/categoria/moda", label: "Moda" },
  { href: "/categoria/esportes", label: "Esportes" },
  { href: "/categoria/beleza", label: "Beleza" },
];

export function Header() {
  return (
    <header data-store-header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="bg-ink text-white">
        <div className="container flex h-8 items-center justify-between text-[11px] font-semibold sm:text-xs">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Ofertas de fontes identificadas</span>
          <div className="hidden items-center gap-5 sm:flex">
            <Link href="/buscar?sort=discount" className="inline-flex items-center gap-1.5 hover:text-mint"><BadgePercent size={14} /> Ofertas</Link>
            <Link href="/sobre" className="inline-flex items-center gap-1.5 hover:text-mint"><CircleHelp size={14} /> Como funciona</Link>
          </div>
        </div>
      </div>
      <div className="container flex min-h-20 items-center gap-4 py-3 lg:gap-8">
        <div className="hidden sm:block"><Logo /></div>
        <div className="sm:hidden"><Logo compact /></div>
        <SearchBox />
        <Link href="/admin" className="hidden text-sm font-bold text-ink hover:text-brand lg:block">Admin</Link>
      </div>
      <nav className="container flex h-10 items-center gap-6 overflow-x-auto border-t border-border text-sm font-semibold scrollbar-none" aria-label="Categorias principais">
        <Link href="/buscar" className="whitespace-nowrap font-extrabold text-brand">Todos os produtos</Link>
        {quickLinks.map((link) => <Link key={link.href} href={link.href} className="whitespace-nowrap text-ink hover:text-brand">{link.label}</Link>)}
      </nav>
    </header>
  );
}
