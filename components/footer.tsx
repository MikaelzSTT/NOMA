import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer data-store-footer className="mt-16 border-t border-border bg-white">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-6 text-muted">
            Vitrine independente de produtos. Precos e disponibilidade pertencem as lojas de origem e podem mudar sem aviso.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand">
            <ShieldCheck size={16} /> Sem checkout ou venda direta
          </p>
        </div>
        <div>
          <h2 className="footer-title">Navegue</h2>
          <div className="footer-links">
            <Link href="/buscar">Catalogo</Link>
            <Link href="/buscar?sort=discount">Ofertas</Link>
            <Link href="/sobre">Como funciona</Link>
          </div>
        </div>
        <div>
          <h2 className="footer-title">Transparencia</h2>
          <div className="footer-links">
            <span>Links podem gerar comissao</span>
            <span>Compra concluida na loja parceira</span>
            <a href="https://example.com" rel="nofollow noopener" target="_blank" className="inline-flex items-center gap-1">Politica de parceiros <ExternalLink size={13} /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} Vitrineo. Projeto demonstrativo independente.
      </div>
    </footer>
  );
}
