"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, PackageCheck } from "lucide-react";
import type { CatalogProductVariant } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import { MARKET_CONFIG } from "@/lib/market";
import { formatMoney } from "@/lib/utils";

export function ProductVariantSelector({
  variants,
  fallback,
  market,
}: {
  variants: CatalogProductVariant[];
  fallback: {
    sellingPrice: number | null;
    compareAtPrice: number | null;
    discountPercent: number | null;
    currency: string;
    stock: number;
    availability: string;
  };
  market: Market;
}) {
  const options = useMemo(() => variants, [variants]);
  const [selectedId, setSelectedId] = useState(options.find((variant) => variant.isDefault)?.id ?? options[0]?.id ?? "");
  const selected = options.find((variant) => variant.id === selectedId);
  const sellingPrice = selected?.salePrice ?? fallback.sellingPrice;
  const compareAtPrice = selected?.compareAtPrice ?? fallback.compareAtPrice;
  const discount = calculateDiscount(sellingPrice, compareAtPrice) ?? fallback.discountPercent;
  const stock = selected?.stock ?? fallback.stock;
  const availability = selected?.availability ?? fallback.availability;
  const isUS = market === "US";
  const locale = MARKET_CONFIG[market].locale;

  return (
    <>
      <div className="my-6 border-y border-border py-5">
        {compareAtPrice && sellingPrice && compareAtPrice > sellingPrice && (
          <p className="text-sm text-muted"><span className="line-through">{formatMoney(compareAtPrice, fallback.currency, locale)}</span>{discount && discount > 0 && <strong className="ml-2 text-coral">{isUS ? `Save ${Math.round(discount)}%` : `Economize ${Math.round(discount)}%`}</strong>}</p>
        )}
        {sellingPrice ? <p className="mt-1 text-4xl font-black text-ink">{formatMoney(sellingPrice, fallback.currency, locale)}</p> : <p className="text-xl font-bold text-muted">{isUS ? "Price unavailable" : "Preco indisponivel"}</p>}
      </div>

      {options.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase text-muted">{isUS ? "Options" : "Opções"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`variant-choice ${variant.id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(variant.id)}
              >
                <span>{variant.label}</span>
                {Object.keys(variant.attributes).length > 0 && <small>{variantSubtitle(variant.attributes)}</small>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-brand" /><span>{availabilityLabel(availability, market)}</span></p>
        <p className="flex items-center gap-2"><PackageCheck size={17} className="text-brand" /><span>{isUS ? `${stock} unit(s) in stock` : `${stock} unidade(s) em estoque`}</span></p>
      </div>
    </>
  );
}

function variantSubtitle(attributes: Record<string, string | number | boolean>) {
  return Object.values(attributes).slice(0, 3).map(String).join(" · ");
}

function calculateDiscount(sellingPrice: number | null, compareAtPrice: number | null) {
  if (!sellingPrice || !compareAtPrice || compareAtPrice <= sellingPrice) return null;
  return ((compareAtPrice - sellingPrice) / compareAtPrice) * 100;
}

function availabilityLabel(value: string, market: Market) {
  const labels = {
    BR: { AVAILABLE: "Disponível", OUT_OF_STOCK: "Indisponível no momento", PREORDER: "Disponível em pré-venda", UNKNOWN: "Disponibilidade não informada", REMOVED: "Produto removido" },
    US: { AVAILABLE: "Available", OUT_OF_STOCK: "Currently out of stock", PREORDER: "Available for preorder", UNKNOWN: "Availability not provided", REMOVED: "Product removed" },
  } as const;
  return labels[market][value as keyof typeof labels.BR] ?? labels[market].UNKNOWN;
}
