"use client";

import { useMemo, useState } from "react";
import { ImageOff, Link2, LoaderCircle, Save, Search, X } from "lucide-react";
import { createManualProductAction } from "@/app/admin/actions";
import { OfferVariantFields, type AdminOfferVariant } from "@/components/admin/offer-variant-fields";
import { MANUAL_SUPPLIER_OPTION_PREFIX } from "@/lib/admin/manual-product-constants";
import { previewToOfferVariants } from "@/lib/admin/url-preview-to-variants";
import { MARKET_CONFIG, MARKETS, type Market } from "@/lib/market";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";
import { slugify } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
  supportedMarkets: Market[];
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string; warnings: string[] }
  | { status: "error"; message: string };

const defaultVariants: AdminOfferVariant[] = [{
  label: "Padrão",
  attributes: {},
  costPrice: 0,
  salePrice: 0,
  manualPriceOverride: true,
  stock: 1,
  active: true,
  availability: "AVAILABLE",
  isDefault: true,
}];

export function ManualProductForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const [market, setMarket] = useState<Market>("BR");
  const [productUrl, setProductUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState(defaultVariants);
  const [variantRevision, setVariantRevision] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const currency = MARKET_CONFIG[market].currency;
  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.supportedMarkets.includes(market)),
    [market, suppliers],
  );
  const imagesText = images.join("\n");

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function updateMarket(value: string) {
    const nextMarket = MARKETS.includes(value as Market) ? value as Market : "BR";
    setMarket(nextMarket);
  }

  function updateImagesText(value: string) {
    setImages(value.split(/\r?\n/).map((imageUrl) => imageUrl.trim()).filter(Boolean));
  }

  function removeImage(url: string) {
    setImages((current) => current.filter((imageUrl) => imageUrl !== url));
  }

  async function fetchPreview() {
    const url = productUrl.trim();
    if (!url) return;
    setPreview({ status: "loading" });
    try {
      const response = await fetch("/api/admin/product-url-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json() as ProductUrlImportPreview | { error?: string };
      if (!response.ok || isPreviewError(body)) {
        setPreview({ status: "error", message: isPreviewError(body) ? body.error ?? "Não foi possível buscar dados desta URL." : "Não foi possível buscar dados desta URL." });
        return;
      }
      applyPreview(body);
    } catch {
      setPreview({ status: "error", message: "Não foi possível buscar dados desta URL." });
    }
  }

  function applyPreview(product: ProductUrlImportPreview) {
    const nextSourceUrl = product.canonicalUrl ?? product.sourceUrl;
    setSourceUrl(nextSourceUrl);
    setProductUrl(nextSourceUrl);
    if (product.title) updateTitle(product.title);
    if (product.category) setCategory(product.category);
    if (product.brand) setBrand(product.brand);
    if (product.description) setDescription(product.description);
    if (product.images.length) setImages(product.images.map((image) => image.url));
    const nextVariants = previewToOfferVariants(product, currency);
    if (nextVariants.length) {
      setVariants(nextVariants);
      setVariantRevision((current) => current + 1);
    }
    const priceText = product.sourcePrice != null ? formatMoney(product.sourcePrice, product.currency ?? currency) : "sem custo inicial";
    setPreview({
      status: "success",
      message: `Encontramos ${nextVariants.length || product.variants.length} variante(s), ${product.images.length} imagem(ns) e custo inicial de ${priceText}. Defina o preço de venda antes de publicar.`,
      warnings: product.warnings,
    });
  }

  return (
    <form action={createManualProductAction} className="space-y-6">
      <section className="admin-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>Importar por URL</h2>
            <p className="mt-1 text-sm text-muted">A prévia preenche o formulário, mas nada é salvo sem revisão e clique em Criar produto.</p>
          </div>
          <Link2 className="text-brand" size={20} />
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <label className="admin-field">URL do produto<input type="url" value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://loja.example/produto..." /></label>
          <button type="button" className="button-secondary" disabled={preview.status === "loading" || !productUrl.trim()} onClick={fetchPreview}>
            {preview.status === "loading" ? <LoaderCircle className="animate-spin" size={17} /> : <Search size={17} />} Buscar dados
          </button>
        </div>
        {preview.status === "success" && (
          <div className="rounded-sm border border-border bg-surface p-3 text-sm">
            <p className="font-bold text-ink">{preview.message}</p>
            {preview.warnings.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </div>
        )}
        {preview.status === "error" && <div className="admin-alert error mb-0">{preview.message}</div>}
      </section>

      <section className="admin-panel space-y-4">
        <h2>Origem</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Mercado<select name="market" value={market} onChange={(event) => updateMarket(event.target.value)}>{MARKETS.map((item) => <option key={item} value={item}>{MARKET_CONFIG[item].label}</option>)}</select></label>
          <label className="admin-field">Fornecedor<select name="supplierId" defaultValue={`${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`} key={market}><option value={`${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`}>Manual {market}</option>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        </div>
        <label className="admin-field">URL original do produto<input name="sourceUrl" type="url" required placeholder="https://..." value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
      </section>

      <section className="admin-panel space-y-4">
        <h2>Conteúdo</h2>
        <label className="admin-field">Nome<input name="title" value={title} onChange={(event) => updateTitle(event.target.value)} required maxLength={300} /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="admin-field">Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} required maxLength={180} /></label>
          <label className="admin-field">Categoria<input name="category" value={category} onChange={(event) => setCategory(event.target.value)} required maxLength={120} /></label>
          <label className="admin-field">Marca<input name="brand" value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} /></label>
        </div>
        <label className="admin-field">Descrição<textarea name="description" rows={6} maxLength={30000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="admin-field">Imagens por URL<textarea name="images" rows={6} required placeholder="https://cdn.../imagem-1.jpg&#10;https://cdn.../imagem-2.jpg" value={imagesText} onChange={(event) => updateImagesText(event.target.value)} /></label>
        {images.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((imageUrl) => (
              <div key={imageUrl} className="overflow-hidden rounded-sm border border-border bg-white">
                <div className="aspect-square bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <button type="button" className="flex w-full items-center justify-center gap-1 px-2 py-2 text-xs font-bold text-muted hover:text-ink" onClick={() => removeImage(imageUrl)}>
                  <X size={14} /> Remover
                </button>
              </div>
            ))}
          </div>
        )}
        {images.length === 0 && <p className="flex items-center gap-2 text-sm text-muted"><ImageOff size={16} /> Nenhuma imagem selecionada.</p>}
      </section>

      <OfferVariantFields key={variantRevision} currency={currency} initialVariants={variants} />

      <section className="admin-panel space-y-4">
        <h2>Entrega</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Prazo mínimo de entrega<input name="estimatedDeliveryMinDays" type="number" min="0" step="1" required /></label>
          <label className="admin-field">Prazo máximo de entrega<input name="estimatedDeliveryMaxDays" type="number" min="0" step="1" required /></label>
        </div>
      </section>

      <section className="admin-panel space-y-4">
        <h2>Publicação</h2>
        <div className="flex flex-wrap gap-6">
          <label className="check-row"><input name="featured" type="checkbox" value="true" />Featured</label>
          <label className="check-row"><input name="active" type="checkbox" value="true" />Ativo</label>
        </div>
      </section>

      <button className="button-primary"><Save size={17} /> Criar produto</button>
    </form>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", { style: "currency", currency }).format(value);
}

function isPreviewError(value: ProductUrlImportPreview | { error?: string }): value is { error?: string } {
  return !("sourceUrl" in value);
}
