import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { ArrowLeft, ExternalLink, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { updateInternalProductAction } from "@/app/admin/actions";
import { OfferVariantFields, type AdminOfferVariant } from "@/components/admin/offer-variant-fields";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKET_CONFIG, MARKETS, isMarket, type Market } from "@/lib/market";
import { formatDate, formatMoney } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminProductEditPage({ params, searchParams }: Props) {
  await requireAdmin();
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const product = await db.product.findUnique({ where: { id }, include: { supplier: true, category: true, brand: true, images: { orderBy: { position: "asc" } }, offers: { include: { supplier: true, variants: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } }, orderBy: { market: "asc" } } } });
  if (!product) notFound();
  const selectedMarket = typeof raw.market === "string" && isMarket(raw.market.toUpperCase()) ? raw.market.toUpperCase() as Market : "BR";
  const selectedOffer = product.offers.find((offer) => offer.market === selectedMarket);
  const offerImages = selectedOffer && Array.isArray(selectedOffer.images)
    ? selectedOffer.images.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && "url" in item ? [String(item.url)] : [])
    : product.images.map((image) => image.url);
  const editTitle = selectedOffer?.title ?? product.title;
  const editShortDescription = selectedOffer?.shortDescription ?? product.shortDescription ?? "";
  const editDescription = selectedOffer?.description ?? product.description ?? "";
  const initialVariants = toAdminOfferVariants(selectedOffer, product);

  return (
    <div className="admin-page max-w-5xl">
      <Link href="/admin/produtos" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-brand"><ArrowLeft size={16} /> Voltar para produtos</Link>
      <div className="admin-heading"><div><p className="eyebrow">Edição interna</p><h1>{product.title}</h1><p>Dados comerciais e editoriais do catálogo interno.</p></div></div>
      {raw.saved === "ok" && <div className="admin-alert success">Alterações salvas.</div>}
      {raw.saved === "created" && <div className="admin-alert success">Produto manual criado.</div>}
      {raw.saved === "error" && <div className="admin-alert error">Não foi possível validar as alterações.</div>}
      {raw.saved === "sale-price-required" && <div className="admin-alert error">Defina o preço de venda da NOMA para todas as variantes ativas com custo antes de publicar.</div>}
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

        <OfferVariantFields currency={MARKET_CONFIG[selectedMarket].currency} initialVariants={initialVariants} />

        <section className="admin-panel space-y-4">
          <h2>Entrega</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><MoneyField name="shippingCost" label="Custo de frete" value={selectedOffer?.shippingCost == null ? null : Number(selectedOffer.shippingCost)} /><label className="admin-field">Prazo mínimo<input name="estimatedDeliveryMinDays" type="number" min="0" step="1" defaultValue={selectedOffer?.estimatedDeliveryMinDays ?? ""} /></label><label className="admin-field">Prazo máximo<input name="estimatedDeliveryMaxDays" type="number" min="0" step="1" defaultValue={selectedOffer?.estimatedDeliveryMaxDays ?? ""} /></label></div>
          <label className="admin-field">Prazo estimado<input name="estimatedDelivery" defaultValue={selectedOffer?.estimatedDelivery ?? product.estimatedDelivery ?? ""} /></label>
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

function MarketOfferSummary({ market, offer }: { market: Market; offer?: { supplier: { name: string }; currency: string; costPrice: unknown; sellingPrice: unknown; stockQuantity: number; availability: string; active: boolean; featured: boolean; variants: unknown[] } }) {
  return <div className="rounded-sm border border-border p-4 text-sm"><div className="flex items-start justify-between gap-3"><h3 className="font-extrabold text-ink">{MARKET_CONFIG[market].label}</h3><span className={`status-pill ${offer?.active ? "active" : "inactive"}`}>{offer ? offer.active ? "Ativa" : "Inativa" : "Sem oferta"}</span></div>{offer ? <div className="mt-3 grid gap-2"><p>Fornecedor: <strong>{offer.supplier.name}</strong></p><p>Custo: <strong>{offer.costPrice == null ? "—" : formatMoney(Number(offer.costPrice), offer.currency)}</strong></p><p>Preço: <strong>{offer.sellingPrice == null ? "Sem preço" : formatMoney(Number(offer.sellingPrice), offer.currency)}</strong></p><p>Estoque: <strong>{offer.stockQuantity}</strong></p><p>Disponibilidade: <strong>{offer.availability}</strong></p><p>Variantes: <strong>{offer.variants.length}</strong></p><p>Destaque: <strong>{offer.featured ? "Sim" : "Não"}</strong></p></div> : <p className="mt-3 text-muted">Produto não disponível neste mercado.</p>}</div>;
}

function toAdminOfferVariants(
  offer: Prisma.ProductMarketOfferGetPayload<{ include: { variants: true } }> | undefined,
  product: { title: string; sku: string; costPrice: unknown; sellingPrice: unknown; compareAtPrice: unknown; stock: number; availability: string },
): AdminOfferVariant[] {
  if (offer?.variants.length) {
    return offer.variants.map((variant) => ({
      label: variant.label,
      sku: variant.sku ?? "",
      attributes: publicVariantAttributes(variant.attributes),
      costPrice: Number(variant.costPrice),
      salePrice: Number(variant.salePrice),
      compareAtPrice: variant.compareAtPrice == null ? undefined : Number(variant.compareAtPrice),
      manualPriceOverride: variant.manualPriceOverride || offer.manualPriceOverride,
      stock: variant.stock,
      active: variant.active,
      availability: variant.availability as AdminOfferVariant["availability"],
      sourceUrl: variant.sourceUrl ?? "",
      imageUrl: variant.imageUrl ?? "",
      isDefault: variant.isDefault,
    }));
  }
  return [{
    label: "Padrão",
    sku: offer?.sku ?? product.sku,
    attributes: {},
    costPrice: Number(offer?.costPrice ?? product.costPrice ?? 0),
    salePrice: Number(offer?.sellingPrice ?? product.sellingPrice ?? 0),
    compareAtPrice: offer?.compareAtPrice == null && product.compareAtPrice == null ? undefined : Number(offer?.compareAtPrice ?? product.compareAtPrice),
    manualPriceOverride: offer?.manualPriceOverride ?? true,
    stock: offer?.stockQuantity ?? product.stock,
    active: offer?.active ?? true,
    availability: (offer?.availability ?? product.availability) as AdminOfferVariant["availability"],
    sourceUrl: offer?.sourceUrl ?? "",
    imageUrl: "",
    isDefault: true,
  }];
}

function publicVariantAttributes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean>;
}
