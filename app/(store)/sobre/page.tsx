import type { Metadata } from "next";
import { BadgeCheck, ExternalLink, RefreshCw, SearchCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { absoluteUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Como funciona",
  description: "Entenda como a Vitrineo organiza ofertas e redireciona cada compra para a loja responsavel.",
  alternates: { canonical: absoluteUrl("/sobre") },
};

export default function AboutPage() {
  return (
    <div className="container max-w-5xl pb-16">
      <Breadcrumbs items={[{ label: "Como funciona" }]} />
      <section className="py-8">
        <p className="eyebrow">Transparencia desde o inicio</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-black text-ink">Uma vitrine que leva voce ate a loja responsavel</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">A Vitrineo organiza produtos recebidos por fontes publicas e autorizadas. Nao processamos pagamentos, nao criamos pedidos e nao representamos as lojas exibidas.</p>
      </section>
      <div className="grid gap-8 border-y border-border py-10 md:grid-cols-3">
        <InfoItem icon={SearchCheck} title="Encontre" text="Use busca, categorias e filtros para comparar os itens disponiveis." />
        <InfoItem icon={RefreshCw} title="Confira" text="Veja a fonte, a data de atualizacao e as informacoes realmente recebidas." />
        <InfoItem icon={ExternalLink} title="Compre na origem" text="O botao abre a pagina da loja ou um link de afiliado identificado." />
      </div>
      <div className="mt-10 flex items-start gap-3 rounded-md border border-brand/20 bg-mint p-5 text-sm leading-6 text-ink">
        <BadgeCheck className="mt-0.5 shrink-0 text-brand" />
        <p>Quando uma fonte nao oferece API ou feed autorizado, nenhuma protecao tecnica e contornada. A integracao permanece desativada ate que exista acesso oficial.</p>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, title, text }: { icon: typeof BadgeCheck; title: string; text: string }) {
  return <div><Icon className="text-coral" size={25} /><h2 className="mt-4 text-lg font-extrabold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{text}</p></div>;
}
