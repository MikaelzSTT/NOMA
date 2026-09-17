"use client";

import { useMemo, useState } from "react";
import { Link2, LoaderCircle, Save, Search } from "lucide-react";
import { createManualProductAction } from "@/app/admin/actions";
import { OfferVariantFields, type AdminOfferVariant } from "@/components/admin/offer-variant-fields";
import { ProductColorMaterialFields } from "@/components/admin/product-color-material-fields";
import { ProductImageManager } from "@/components/admin/product-image-manager";
import { MANUAL_SUPPLIER_OPTION_PREFIX } from "@/lib/admin/manual-product-constants";
import { previewToOfferVariants } from "@/lib/admin/url-preview-to-variants";
import { MARKET_CONFIG, MARKETS, type Market } from "@/lib/market";
import type { ProductUrlImportPreview } from "@/lib/product-import/types";
import type { ShippingStrategyCode } from "@/lib/shipping/types";
import { PRODUCT_CATEGORIES, resolveProductCategory, type ProductCategorySlug } from "@/lib/product-categories";
import { slugify } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
  supportedMarkets: Market[];
  shippingStrategy: ShippingStrategyCode;
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
  const [category, setCategory] = useState<ProductCategorySlug | "">("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [variants, setVariants] = useState(defaultVariants);
  const [selectedSupplierId, setSelectedSupplierId] = useState(`${MANUAL_SUPPLIER_OPTION_PREFIX}BR`);
  const [variantRevision, setVariantRevision] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const currency = MARKET_CONFIG[market].currency;
  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.supportedMarkets.includes(market)),
    [market, suppliers],
  );
  const manualSupplierId = `${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`;

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function updateMarket(value: string) {
    const nextMarket = MARKETS.includes(value as Market) ? value as Market : "BR";
    setMarket(nextMarket);
    setSelectedSupplierId(`${MANUAL_SUPPLIER_OPTION_PREFIX}${nextMarket}`);
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
    setCategory(resolveProductCategory({ title: product.title ?? title, category: product.category }) ?? "");
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
          <label className="admin-field">Fornecedor<select name="supplierId" value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}><option value={manualSupplierId}>Manual {market}</option>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        </div>
        <label className="admin-field">URL original do produto<input name="sourceUrl" type="url" required placeholder="https://..." value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
      </section>

      <section className="admin-panel space-y-4">
        <h2>Conteúdo</h2>
        <label className="admin-field">Nome<input name="title" value={title} onChange={(event) => updateTitle(event.target.value)} required maxLength={300} /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="admin-field">Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} required maxLength={180} /></label>
          <label className="admin-field">Categoria<select name="category" value={category} onChange={(event) => setCategory(event.target.value as ProductCategorySlug | "")} required><option value="">Selecione</option>{PRODUCT_CATEGORIES.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
          <label className="admin-field">Marca<input name="brand" value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={120} /></label>
        </div>
        <label className="admin-field">Descrição<textarea name="description" rows={6} maxLength={30000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <ProductImageManager key={images.join("\n")} initialImages={images} required />
      </section>

      <ProductColorMaterialFields />

      <OfferVariantFields key={variantRevision} currency={currency} initialVariants={variants} />

      <section className="admin-panel space-y-4">
        <h2>Entrega</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Prazo mínimo de entrega<input name="estimatedDeliveryMinDays" type="number" min="0" step="1" /></label>
          <label className="admin-field">Prazo máximo de entrega<input name="estimatedDeliveryMaxDays" type="number" min="0" step="1" /></label>
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
