import Link from "next/link";
import { ArrowLeft, ExternalLink, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { updateInternalProductAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKET_CONFIG, MARKETS, isMarket, type Market } from "@/lib/market";
import { formatDate, formatMoney } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminProductEditPage({ params, searchParams }: Props) {
  await requireAdmin();
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const product = await db.product.findUnique({ where: { id }, include: { supplier: true, category: true, brand: true, images: { orderBy: { position: "asc" } }, variants: { orderBy: { createdAt: "asc" } }, offers: { include: { supplier: true }, orderBy: { market: "asc" } } } });
  if (!product) notFound();
  const selectedMarket = typeof raw.market === "string" && isMarket(raw.market.toUpperCase()) ? raw.market.toUpperCase() as Market : "BR";
  const selectedOffer = product.offers.find((offer) => offer.market === selectedMarket);
  const cost = selectedOffer?.costPrice == null ? null : Number(selectedOffer.costPrice);
  const selling = selectedOffer?.sellingPrice == null ? null : Number(selectedOffer.sellingPrice);
  const margin = cost != null && selling != null ? selling - cost : null;
  const offerImages = selectedOffer && Array.isArray(selectedOffer.images)
    ? selectedOffer.images.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && "url" in item ? [String(item.url)] : [])
    : product.images.map((image) => image.url);
  const editTitle = selectedOffer?.title ?? product.title;
  const editShortDescription = selectedOffer?.shortDescription ?? product.shortDescription ?? "";
  const editDescription = selectedOffer?.description ?? product.description ?? "";

  return (
    <div className="admin-page max-w-5xl">
      <Link href="/admin/produtos" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"><ArrowLeft size={16} /> Voltar para produtos</Link>
      <div className="admin-heading"><div><p className="eyebrow">Edição interna</p><h1>{product.title}</h1><p>Dados comerciais e editoriais do catálogo interno.</p></div></div>
      {raw.saved === "ok" && <div className="admin-alert success">Alterações salvas.</div>}
      {raw.saved === "created" && <div className="admin-alert success">Produto manual criado.</div>}
      {raw.saved === "error" && <div className="admin-alert error">Não foi possível validar as alterações.</div>}
      <section className="admin-panel mb-6">
        <h2>Ofertas por mercado</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {MARKETS.map((market) => <MarketOfferSummary key={market} market={market} offer={product.offers.find((offer) => offer.market === market)} />)}
        </div>
      </section>
      <form action={updateInternalProductAction} className="space-y-6">
        <input type="hidden" name="id" value={product.id} />
        <section className="admin-panel">
          <h2>Mercado em edição</h2>
          <label className="admin-field mt-4 max-w-sm">Mercado<select name="market" defaultValue={selectedMarket}>{MARKETS.map((market) => <option key={market} value={market}>{MARKET_CONFIG[market].label}</option>)}</select></label>
          {!selectedOffer && <p className="mt-3 text-sm text-muted">Este produto ainda não tem oferta em {MARKET_CONFIG[selectedMarket].label}. Salvar este formulário cria a oferta neste mercado.</p>}
        </section>
        <section className="admin-panel">
          <h2>Identificação</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><ReadOnly label="ID no fornecedor" value={product.supplierProductId} /><ReadOnly label="SKU" value={product.sku} /><ReadOnly label="Fornecedor" value={product.supplier.name} /><ReadOnly label="Adapter" value={product.supplier.adapterKey} /><ReadOnly label="Última sincronização" value={formatDate(product.lastSyncedAt)} /><ReadOnly label="Status da sincronização" value={product.syncStatus} /></div>
        </section>

        <section className="admin-panel space-y-4">
          <h2>Conteúdo</h2>
          <label className="admin-field">Título<input name="title" defaultValue={editTitle} required maxLength={300} /></label>
          <div className="grid gap-4 sm:grid-cols-3"><label className="admin-field">Categoria<input name="category" defaultValue={product.category.name} required /></label><label className="admin-field">Subcategoria<input name="subcategory" defaultValue={product.subcategory ?? ""} /></label><label className="admin-field">Marca<input name="brand" defaultValue={product.brand?.name ?? ""} /></label></div>
          <label className="admin-field">URL original do produto<input name="sourceUrl" type="url" defaultValue={selectedOffer?.sourceUrl ?? product.sourceUrl ?? ""} /></label>
          <label className="admin-field">Descrição curta<textarea name="shortDescription" rows={2} defaultValue={editShortDescription} maxLength={800} /></label>
          <label className="admin-field">Descrição completa<textarea name="description" rows={6} defaultValue={editDescription} maxLength={30000} /></label>
          <label className="admin-field">Imagens — uma URL ou caminho local por linha<textarea name="images" rows={5} defaultValue={offerImages.join("\n")} placeholder="https://cdn.../imagem.jpg" /></label>
        </section>

        <section className="admin-panel space-y-4">
          <div><h2>Preço e margem</h2><p className="mt-1 text-sm text-muted">O custo é visível somente no admin. Marque override para preservar manualmente o preço de venda.</p></div>
          <div className="grid gap-4 sm:grid-cols-4"><MoneyField name="costPrice" label="Custo do fornecedor" value={cost} /><MoneyField name="sellingPrice" label="Preço de venda" value={selling} /><MoneyField name="compareAtPrice" label="Preço comparativo" value={selectedOffer?.compareAtPrice == null ? null : Number(selectedOffer.compareAtPrice)} /><label className="admin-field">Moeda<input value={MARKET_CONFIG[selectedMarket].currency} disabled /></label></div>
          <div className="grid gap-4 sm:grid-cols-3"><label className="admin-field">Tipo de regra<select name="pricingRuleType" defaultValue={selectedOffer?.pricingRuleType ?? ""}><option value="">Sem regra por produto</option><option value="FIXED_MARGIN">Custo + margem fixa</option><option value="MARKUP">Custo × markup</option></select></label><label className="admin-field">Valor da margem/markup<input name="pricingRuleValue" type="number" min="0" step="0.0001" defaultValue={selectedOffer?.pricingRuleValue?.toString() ?? ""} /></label><ReadOnly label="Margem atual" value={margin == null ? "Não calculável" : formatMoney(margin, selectedOffer?.currency ?? product.currency)} /></div>
          <label className="check-row"><input name="manualPriceOverride" type="checkbox" value="true" defaultChecked={selectedOffer?.manualPriceOverride ?? product.manualPriceOverride} />Preservar preço de venda como override manual</label>
        </section>

        <section className="admin-panel space-y-4">
          <h2>Estoque e entrega</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><label className="admin-field">Estoque<input name="stock" type="number" min="0" step="1" defaultValue={selectedOffer?.stockQuantity ?? product.stock} /></label><label className="admin-field">Disponibilidade<select name="availability" defaultValue={selectedOffer?.availability ?? product.availability}><option value="AVAILABLE">Disponível</option><option value="OUT_OF_STOCK">Sem estoque</option><option value="PREORDER">Pré-venda</option><option value="UNKNOWN">Não informada</option></select></label><MoneyField name="shippingCost" label="Custo de frete" value={selectedOffer?.shippingCost == null ? null : Number(selectedOffer.shippingCost)} /><label className="admin-field">Prazo mínimo<input name="estimatedDeliveryMinDays" type="number" min="0" step="1" defaultValue={selectedOffer?.estimatedDeliveryMinDays ?? ""} /></label><label className="admin-field">Prazo máximo<input name="estimatedDeliveryMaxDays" type="number" min="0" step="1" defaultValue={selectedOffer?.estimatedDeliveryMaxDays ?? ""} /></label></div>
          <label className="admin-field">Prazo estimado<input name="estimatedDelivery" defaultValue={selectedOffer?.estimatedDelivery ?? product.estimatedDelivery ?? ""} /></label>
          {product.variants.length > 0 && <div><p className="text-xs font-bold uppercase text-muted">Variantes atuais</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{product.variants.map((variant) => <div key={variant.id} className="rounded-sm border border-border p-3 text-sm"><strong>{variant.title}</strong><p className="text-muted">{variant.sku} · estoque {variant.stock}</p></div>)}</div></div>}
        </section>

        <section className="admin-panel space-y-4">
          <h2>Publicação</h2>
          <label className="admin-field">Notas internas<textarea name="internalNotes" rows={4} maxLength={2000} defaultValue={product.internalNotes ?? ""} placeholder="Visível apenas para administradores" /></label>
          <label className="admin-field max-w-xs">Pontuação de popularidade<input name="popularityScore" type="number" min="0" max="1000000" defaultValue={selectedOffer?.popularityScore ?? product.popularityScore} /></label>
          <div className="flex flex-wrap gap-6"><label className="check-row"><input name="active" type="checkbox" value="true" defaultChecked={selectedOffer?.active ?? product.active} />Oferta ativa na vitrine</label><label className="check-row"><input name="featured" type="checkbox" value="true" defaultChecked={selectedOffer?.featured ?? product.featured} />Exibir como destaque</label></div>
        </section>

        <div className="flex flex-wrap gap-3"><button className="button-primary"><Save size={17} /> Salvar alterações</button>{selectedOffer?.sourceUrl && <a href={selectedOffer.sourceUrl} target="_blank" rel="noopener noreferrer" className="button-secondary">Abrir URL de origem <ExternalLink size={16} /></a>}</div>
      </form>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>; }
function MoneyField({ name, label, value }: { name: string; label: string; value: number | null }) { return <label className="admin-field">{label}<input name={name} type="number" min="0" step="0.01" defaultValue={value ?? ""} /></label>; }

function MarketOfferSummary({ market, offer }: { market: Market; offer?: { supplier: { name: string }; currency: string; costPrice: unknown; sellingPrice: unknown; stockQuantity: number; availability: string; active: boolean; featured: boolean } }) {
  return <div className="rounded-sm border border-border p-4 text-sm"><div className="flex items-start justify-between gap-3"><h3 className="font-extrabold text-ink">{MARKET_CONFIG[market].label}</h3><span className={`status-pill ${offer?.active ? "active" : "inactive"}`}>{offer ? offer.active ? "Ativa" : "Inativa" : "Sem oferta"}</span></div>{offer ? <div className="mt-3 grid gap-2"><p>Fornecedor: <strong>{offer.supplier.name}</strong></p><p>Custo: <strong>{offer.costPrice == null ? "—" : formatMoney(Number(offer.costPrice), offer.currency)}</strong></p><p>Preço: <strong>{offer.sellingPrice == null ? "Sem preço" : formatMoney(Number(offer.sellingPrice), offer.currency)}</strong></p><p>Estoque: <strong>{offer.stockQuantity}</strong></p><p>Disponibilidade: <strong>{offer.availability}</strong></p><p>Destaque: <strong>{offer.featured ? "Sim" : "Não"}</strong></p></div> : <p className="mt-3 text-muted">Produto não disponível neste mercado.</p>}</div>;
}
