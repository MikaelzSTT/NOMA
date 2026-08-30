import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { searchPath, type Market } from "@/lib/market";

export function Footer({ market = "BR" }: { market?: Market }) {
  return (
    <footer data-store-footer className="mt-16 border-t border-border bg-white">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-6 text-muted">
            {market === "US" ? "Independent product showcase. Prices and availability belong to source stores and may change without notice." : "Vitrine independente de produtos. Precos e disponibilidade pertencem as lojas de origem e podem mudar sem aviso."}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand">
            <ShieldCheck size={16} /> {market === "US" ? "No checkout or direct sales" : "Sem checkout ou venda direta"}
          </p>
        </div>
        <div>
          <h2 className="footer-title">{market === "US" ? "Browse" : "Navegue"}</h2>
          <div className="footer-links">
            <Link href={searchPath(market)}>{market === "US" ? "Catalog" : "Catalogo"}</Link>
            <Link href={`${searchPath(market)}?sort=discount`}>{market === "US" ? "Deals" : "Ofertas"}</Link>
            <Link href={market === "US" ? "/us" : "/br"}>{market === "US" ? "How it works" : "Como funciona"}</Link>
          </div>
        </div>
        <div>
          <h2 className="footer-title">{market === "US" ? "Transparency" : "Transparencia"}</h2>
          <div className="footer-links">
            <span>{market === "US" ? "Links may generate commission" : "Links podem gerar comissao"}</span>
            <span>{market === "US" ? "Purchases are completed at the partner store" : "Compra concluida na loja parceira"}</span>
            <a href="https://example.com" rel="nofollow noopener" target="_blank" className="inline-flex items-center gap-1">{market === "US" ? "Partner policy" : "Politica de parceiros"} <ExternalLink size={13} /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} Vitrineo. {market === "US" ? "Independent demo project." : "Projeto demonstrativo independente."}
      </div>
    </footer>
  );
}
