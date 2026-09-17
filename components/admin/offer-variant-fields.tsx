"use client";

import { useMemo, useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { calculateGrossMargin, calculateNomaBrSalePrice, type NomaBrPriceResult } from "@/lib/catalog/pricing";

type Availability = "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN";

export interface AdminOfferVariant {
  label: string;
  sku?: string;
  attributes: Record<string, string | number | boolean>;
  costPrice: number;
  salePrice: number;
  compareAtPrice?: number;
  manualPriceOverride?: boolean;
  sourcePriceReference?: number;
  sourceCompareAtReference?: number;
  sourceCurrency?: string;
  sourcePriceMissing?: boolean;
  salePricePending?: boolean;
  stock: number;
  active: boolean;
  availability: Availability;
  sourceUrl?: string;
  imageUrl?: string;
  isDefault: boolean;
}

type EditableVariant = AdminOfferVariant & { attributesText: string };

const availabilityOptions: Array<{ value: Availability; label: string }> = [
  { value: "AVAILABLE", label: "Disponível" },
  { value: "OUT_OF_STOCK", label: "Sem estoque" },
  { value: "PREORDER", label: "Pré-venda" },
  { value: "UNKNOWN", label: "Não informada" },
];

export function OfferVariantFields({
  currency,
  initialVariants,
}: {
  currency: string;
  initialVariants: AdminOfferVariant[];
}) {
  const [variants, setVariants] = useState<EditableVariant[]>(() => ensureEditableDefaults(initialVariants));
  const serialized = useMemo(() => JSON.stringify(variants.map(toSerializedVariant)), [variants]);
  const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
  const hasInvalidAttributes = variants.some((variant) => parseAttributes(variant.attributesText) == null);
  const supportsNomaPricing = currency === "BRL";
  const offerManualPriceOverride = variants.some((variant) => variant.manualPriceOverride);

  function patchVariant(index: number, patch: Partial<EditableVariant>) {
    setVariants((current) => current.map((variant, currentIndex) => currentIndex === index ? { ...variant, ...patch } : variant));
  }

  function patchVariantPricing(index: number, patch: Partial<EditableVariant>) {
    setVariants((current) => current.map((variant, currentIndex) => {
      if (currentIndex !== index) return variant;
      const next = { ...variant, ...patch };
      if (supportsNomaPricing && !next.manualPriceOverride && next.costPrice > 0) {
        const calculated = calculateNomaBrSalePrice({ costPrice: next.costPrice, compareAtPrice: next.compareAtPrice });
        return { ...next, salePrice: calculated.salePrice, salePricePending: false };
      }
      return next;
    }));
  }

  function calculateAllNomaPrices() {
    setVariants((current) => current.map((variant) => {
      if (variant.costPrice <= 0) return variant;
      const calculated = calculateNomaBrSalePrice({ costPrice: variant.costPrice, compareAtPrice: variant.compareAtPrice });
      return { ...variant, salePrice: calculated.salePrice, salePricePending: false, manualPriceOverride: false };
    }));
  }

  function setPricingMode(index: number, manualPriceOverride: boolean) {
    patchVariantPricing(index, { manualPriceOverride });
  }

  function addVariant() {
    setVariants((current) => [...current, blankVariant(current.length)]);
  }

  function removeVariant(index: number) {
    setVariants((current) => {
      const next = current.filter((_, currentIndex) => currentIndex !== index);
      if (!next.length) return current;
      if (!next.some((variant) => variant.isDefault)) next[0] = { ...next[0], isDefault: true };
      return next;
    });
  }

  function setDefault(index: number) {
    setVariants((current) => current.map((variant, currentIndex) => ({ ...variant, isDefault: currentIndex === index })));
  }

  return (
    <section className="admin-panel space-y-4">
      <input type="hidden" name="variantsJson" value={serialized} />
      <input type="hidden" name="manualPriceOverride" value={String(offerManualPriceOverride)} />
      <input type="hidden" name="costPrice" value={defaultVariant?.costPrice ?? 0} />
      <input type="hidden" name="sellingPrice" value={defaultVariant?.salePrice ?? 0} />
      <input type="hidden" name="compareAtPrice" value={defaultVariant?.compareAtPrice ?? ""} />
      <input type="hidden" name="stock" value={defaultVariant?.stock ?? 0} />
      <input type="hidden" name="availability" value={defaultVariant?.availability ?? "UNKNOWN"} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Variantes</h2>
          <p className="mt-1 text-sm text-muted">Cada opção tem preço, custo, estoque e disponibilidade próprios.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {supportsNomaPricing && <button type="button" className="button-secondary" onClick={calculateAllNomaPrices}><Calculator size={17} /> Calcular preços NOMA</button>}
          <button type="button" className="button-secondary" onClick={addVariant}><Plus size={17} /> Adicionar variante</button>
        </div>
      </div>
      {hasInvalidAttributes && <div className="admin-alert error">Revise o JSON de atributos das variantes.</div>}
      <div className="space-y-4">
        {variants.map((variant, index) => (
          <VariantCard
            key={index}
            variant={variant}
            index={index}
            currency={currency}
            supportsNomaPricing={supportsNomaPricing}
            variantsLength={variants.length}
            setDefault={setDefault}
            removeVariant={removeVariant}
            patchVariant={patchVariant}
            patchVariantPricing={patchVariantPricing}
            setPricingMode={setPricingMode}
          />
        ))}
      </div>
    </section>
  );
}

function VariantCard({
  variant,
  index,
  currency,
  supportsNomaPricing,
  variantsLength,
  setDefault,
  removeVariant,
  patchVariant,
  patchVariantPricing,
  setPricingMode,
}: {
  variant: EditableVariant;
  index: number;
  currency: string;
  supportsNomaPricing: boolean;
  variantsLength: number;
  setDefault: (index: number) => void;
  removeVariant: (index: number) => void;
  patchVariant: (index: number, patch: Partial<EditableVariant>) => void;
  patchVariantPricing: (index: number, patch: Partial<EditableVariant>) => void;
  setPricingMode: (index: number, manualPriceOverride: boolean) => void;
}) {
  const calculated = supportsNomaPricing ? safeNomaPrice(variant) : null;
  const selectedMargin = variant.salePrice > 0 ? calculateGrossMargin(variant.costPrice, variant.salePrice) : null;
  const manualBelowExpected = Boolean(variant.manualPriceOverride && calculated && variant.salePrice > 0 && variant.salePrice < calculated.basePrice);

  return (
    <div className="rounded-sm border border-border p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <label className="check-row text-ink">
                <input type="radio" name="defaultVariantIndex" checked={variant.isDefault} onChange={() => setDefault(index)} />
                Variante padrão
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {supportsNomaPricing && (
                  <div className="flex overflow-hidden rounded-sm border border-border text-xs font-bold">
                    <label className={`cursor-pointer px-3 py-2 ${!variant.manualPriceOverride ? "bg-ink text-white" : "bg-white text-muted"}`}>
                      <input className="sr-only" type="radio" checked={!variant.manualPriceOverride} onChange={() => setPricingMode(index, false)} />
                      Preço automático
                    </label>
                    <label className={`cursor-pointer border-l border-border px-3 py-2 ${variant.manualPriceOverride ? "bg-ink text-white" : "bg-white text-muted"}`}>
                      <input className="sr-only" type="radio" checked={Boolean(variant.manualPriceOverride)} onChange={() => setPricingMode(index, true)} />
                      Preço manual
                    </label>
                  </div>
                )}
              <button type="button" className="button-secondary min-h-0 px-3 py-2" disabled={variantsLength === 1} onClick={() => removeVariant(index)}>
                <Trash2 size={16} /> Remover
              </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Nome/label" value={variant.label} required onChange={(value) => patchVariant(index, { label: value })} />
              <TextField label="SKU opcional" value={variant.sku ?? ""} onChange={(value) => patchVariant(index, { sku: value })} />
              <MoneyField label={`Custo (${currency})`} value={variant.costPrice} required onChange={(value) => patchVariantPricing(index, { costPrice: value ?? 0 })} />
              <MoneyField label={`Preço de venda (${currency})`} value={variant.salePrice} required disabled={supportsNomaPricing && !variant.manualPriceOverride} pending={isSalePricePending(variant)} onChange={(value) => patchVariant(index, { salePrice: value ?? 0, salePricePending: false, manualPriceOverride: true })} />
              <MoneyField label={`Preço comparativo (${currency})`} value={variant.compareAtPrice} onChange={(value) => patchVariantPricing(index, { compareAtPrice: value })} />
              <NumberField label="Estoque" value={variant.stock} required integer onChange={(value) => patchVariant(index, { stock: value ?? 0 })} />
              <label className="admin-field">Disponibilidade<select value={variant.availability} onChange={(event) => patchVariant(index, { availability: event.target.value as Availability })}>{availabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="check-row self-end pb-3"><input type="checkbox" checked={variant.active} onChange={(event) => patchVariant(index, { active: event.target.checked })} />Ativa</label>
            </div>
            {calculated && (
              <div className="mt-3 grid gap-3 rounded-sm border border-border bg-surface p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Custo" value={formatReferenceMoney(variant.costPrice, currency)} />
                <Metric label="Preço calculado" value={formatReferenceMoney(calculated.salePrice, currency)} />
                <Metric label="Diferença bruta" value={selectedMargin ? formatReferenceMoney(selectedMargin.grossProfit, currency) : "Sem preço"} />
                <Metric label="Margem bruta aprox." value={selectedMargin ? formatPercent(selectedMargin.grossMarginPercent) : "Sem preço"} />
              </div>
            )}
            {variant.sourcePriceReference != null && (
              <p className="mt-3 rounded-sm border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted">
                Custo encontrado na fonte: {formatReferenceMoney(variant.sourcePriceReference, variant.sourceCurrency ?? currency)}
                {variant.sourceCompareAtReference != null ? ` (comparativo ${formatReferenceMoney(variant.sourceCompareAtReference, variant.sourceCurrency ?? currency)})` : ""}. O custo permanece separado.
              </p>
            )}
            {isSalePricePending(variant) && (
              <p className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                Defina o preço de venda da NOMA antes de publicar. O preço do fornecedor foi preenchido apenas como custo.
              </p>
            )}
            {variant.sourcePriceMissing && (
              <p className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Preço não determinado com segurança na fonte. Revise antes de salvar.
              </p>
            )}
            {(calculated?.needsManualReview || manualBelowExpected) && (
              <p className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Margem abaixo da regra esperada. Revise manualmente esta variante antes de publicar.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="URL da variante opcional" value={variant.sourceUrl ?? ""} onChange={(value) => patchVariant(index, { sourceUrl: value })} />
              <TextField label="Imagem específica opcional" value={variant.imageUrl ?? ""} onChange={(value) => patchVariant(index, { imageUrl: value })} />
            </div>
            <label className="admin-field mt-4">Atributos JSON<textarea rows={4} value={variant.attributesText} onChange={(event) => patchVariant(index, { attributesText: event.target.value })} placeholder={'{"tamanho":"Solteiro","configuracao":"Sem Box"}'} /></label>
          </div>
  );
}

function ensureEditableDefaults(initialVariants: AdminOfferVariant[]) {
  const source = initialVariants.length ? initialVariants : [blankVariant(0)];
  const defaultIndex = Math.max(0, source.findIndex((variant) => variant.isDefault));
  return source.map((variant, index) => ({
    ...variant,
    manualPriceOverride: variant.manualPriceOverride ?? true,
    isDefault: index === defaultIndex,
    attributesText: JSON.stringify(variant.attributes, null, 2),
  }));
}

function blankVariant(index: number): EditableVariant {
  return {
    label: index === 0 ? "Padrão" : `Variante ${index + 1}`,
    sku: "",
    attributes: {},
    attributesText: "{}",
    costPrice: 0,
    salePrice: 0,
    compareAtPrice: undefined,
    manualPriceOverride: true,
    sourcePriceReference: undefined,
    sourceCompareAtReference: undefined,
    sourceCurrency: undefined,
    salePricePending: false,
    stock: 1,
    active: true,
    availability: "AVAILABLE",
    sourceUrl: "",
    imageUrl: "",
    isDefault: index === 0,
  };
}

function toSerializedVariant(variant: EditableVariant) {
  return {
    label: variant.label,
    sku: optionalText(variant.sku),
    attributes: parseAttributes(variant.attributesText) ?? "__INVALID_JSON__",
    costPrice: variant.costPrice,
    salePrice: variant.salePrice,
    compareAtPrice: variant.compareAtPrice,
    manualPriceOverride: Boolean(variant.manualPriceOverride),
    stock: variant.stock,
    active: variant.active,
    availability: variant.availability,
    sourceUrl: optionalText(variant.sourceUrl),
    imageUrl: optionalText(variant.imageUrl),
    isDefault: variant.isDefault,
  };
}

function isSalePricePending(variant: EditableVariant) {
  return variant.active && variant.costPrice > 0 && variant.salePrice <= 0;
}

function parseAttributes(value: string) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(Object.entries(parsed).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean>;
  } catch {
    return null;
  }
}

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function TextField({ label, value, required, onChange }: { label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return <label className="admin-field">{label}<input value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MoneyField({ label, value, required, pending, disabled, onChange }: { label: string; value?: number; required?: boolean; pending?: boolean; disabled?: boolean; onChange: (value?: number) => void }) {
  return <NumberField label={label} value={value} required={required} pending={pending} disabled={disabled} onChange={onChange} />;
}

function NumberField({ label, value, integer, required, pending, disabled, onChange }: { label: string; value?: number; integer?: boolean; required?: boolean; pending?: boolean; disabled?: boolean; onChange: (value?: number) => void }) {
  return <label className="admin-field">{label}<input className={pending ? "border-red-400 bg-red-50" : undefined} type="number" min="0" step={integer ? "1" : "0.01"} required={required} disabled={disabled} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></label>;
}

function formatReferenceMoney(value: number, currency: string) {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", { style: "currency", currency }).format(value);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="font-bold uppercase text-muted">{label}</p><p className="mt-1 text-sm font-extrabold text-ink">{value}</p></div>;
}

function safeNomaPrice(variant: EditableVariant): NomaBrPriceResult | null {
  if (variant.costPrice <= 0) return null;
  try {
    return calculateNomaBrSalePrice({ costPrice: variant.costPrice, compareAtPrice: variant.compareAtPrice });
  } catch {
    return null;
  }
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)}%`;
}
