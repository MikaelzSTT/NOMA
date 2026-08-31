"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { createManualProductAction } from "@/app/admin/actions";
import { OfferVariantFields } from "@/components/admin/offer-variant-fields";
import { MANUAL_SUPPLIER_OPTION_PREFIX } from "@/lib/admin/manual-product-constants";
import { MARKET_CONFIG, MARKETS, type Market } from "@/lib/market";
import { slugify } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
  supportedMarkets: Market[];
}

export function ManualProductForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const [market, setMarket] = useState<Market>("BR");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const currency = MARKET_CONFIG[market].currency;
  const supplierOptions = useMemo(
    () => suppliers.filter((supplier) => supplier.supportedMarkets.includes(market)),
    [market, suppliers],
  );

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function updateMarket(value: string) {
    const nextMarket = MARKETS.includes(value as Market) ? value as Market : "BR";
    setMarket(nextMarket);
  }

  return (
    <form action={createManualProductAction} className="space-y-6">
      <section className="admin-panel space-y-4">
        <h2>Origem</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Mercado<select name="market" value={market} onChange={(event) => updateMarket(event.target.value)}>{MARKETS.map((item) => <option key={item} value={item}>{MARKET_CONFIG[item].label}</option>)}</select></label>
          <label className="admin-field">Fornecedor<select name="supplierId" defaultValue={`${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`} key={market}><option value={`${MANUAL_SUPPLIER_OPTION_PREFIX}${market}`}>Manual {market}</option>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        </div>
        <label className="admin-field">URL original do produto<input name="sourceUrl" type="url" required placeholder="https://..." /></label>
      </section>

      <section className="admin-panel space-y-4">
        <h2>Conteúdo</h2>
        <label className="admin-field">Nome<input name="title" value={title} onChange={(event) => updateTitle(event.target.value)} required maxLength={300} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Slug<input name="slug" value={slug} onChange={(event) => { setSlugTouched(true); setSlug(slugify(event.target.value)); }} required maxLength={180} /></label>
          <label className="admin-field">Categoria<input name="category" required maxLength={120} /></label>
        </div>
        <label className="admin-field">Descrição<textarea name="description" rows={6} maxLength={30000} /></label>
        <label className="admin-field">Imagens por URL<textarea name="images" rows={6} required placeholder="https://cdn.../imagem-1.jpg&#10;https://cdn.../imagem-2.jpg" /></label>
      </section>

      <OfferVariantFields currency={currency} initialVariants={[{
        label: "Padrão",
        attributes: {},
        costPrice: 0,
        salePrice: 0,
        stock: 1,
        active: true,
        availability: "AVAILABLE",
        isDefault: true,
      }]} />

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

      <button className="button-primary"><Save size={17} /> Salvar produto</button>
    </form>
  );
}
