"use client";

import { useMemo, useState } from "react";
import { Check, PackageCheck } from "lucide-react";
import type { CatalogProductVariant } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import { MARKET_CONFIG } from "@/lib/market";
import { deriveVariantGroups, findVariantForAttribute, variantIsSelectable } from "@/lib/product-variants";
import { formatMoney } from "@/lib/utils";
import styles from "./product-detail.module.css";

export function ProductVariantSelector({
  variants,
  fallback,
  market,
  selectedId,
  onSelectVariant,
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
  selectedId?: string;
  onSelectVariant?: (variant: CatalogProductVariant) => void;
}) {
  const options = useMemo(() => variants, [variants]);
  const [internalSelectedId, setInternalSelectedId] = useState(options.find((variant) => variant.isDefault)?.id ?? options[0]?.id ?? "");
  const activeSelectedId = selectedId ?? internalSelectedId;
  const selected = options.find((variant) => variant.id === activeSelectedId);
  const groups = useMemo(() => deriveVariantGroups(options, market), [market, options]);
  const sellingPrice = selected?.salePrice ?? fallback.sellingPrice;
  const compareAtPrice = selected?.compareAtPrice ?? fallback.compareAtPrice;
  const discount = calculateDiscount(sellingPrice, compareAtPrice) ?? fallback.discountPercent;
  const stock = selected?.stock ?? fallback.stock;
  const availability = selected?.availability ?? fallback.availability;
  const isUS = market === "US";
  const locale = MARKET_CONFIG[market].locale;

  return (
    <>
      <div className={styles.priceBlock}>
        {compareAtPrice && sellingPrice && compareAtPrice > sellingPrice && (
          <p className={styles.comparePrice}><span>{formatMoney(compareAtPrice, fallback.currency, locale)}</span>{discount && discount > 0 && <strong>{isUS ? `Save ${Math.round(discount)}%` : `Economize ${Math.round(discount)}%`}</strong>}</p>
        )}
        {sellingPrice ? <p className={styles.currentPrice}>{formatMoney(sellingPrice, fallback.currency, locale)}</p> : <p className={styles.unavailablePrice}>{isUS ? "Price unavailable" : "Preço indisponível"}</p>}
      </div>

      {options.length > 1 && (
        <div className={styles.variantSelector}>
          {groups.length > 0 ? groups.map((group) => (
            <fieldset className={styles.variantGroup} key={group.key}>
              <legend>{group.label}</legend>
              <div className={styles.variantOptions}>
                {group.values.map((value) => {
                  const candidate = findVariantForAttribute(options, groups, selected, group.key, value);
                  const isSelected = selected ? String(selected.attributes[group.key]) === value : false;
                  const disabled = !candidate || !variantIsSelectable(candidate);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={styles.variantChip}
                      data-selected={isSelected}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      onClick={() => candidate && selectVariant(candidate)}
                    >
                      {isSelected && <Check size={13} aria-hidden="true" />}
                      <span>{value}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )) : (
            <fieldset className={styles.variantGroup}>
              <legend>{isUS ? "Option" : "Opção"}</legend>
              <div className={styles.variantOptions}>
                {options.map((variant) => {
                  const isSelected = variant.id === activeSelectedId;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      className={styles.variantChip}
                      data-selected={isSelected}
                      disabled={!variantIsSelectable(variant)}
                      aria-pressed={isSelected}
                      onClick={() => selectVariant(variant)}
                    >
                      {isSelected && <Check size={13} aria-hidden="true" />}
                      <span>{variant.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      )}

      <div className={styles.stockDetails}>
        <p><span className={styles.statusDot} data-available={availability === "AVAILABLE" || availability === "PREORDER"} /><span>{availabilityLabel(availability, market)}</span></p>
        {stock > 0 && <p><PackageCheck size={16} /><span>{isUS ? `${stock} unit(s) in stock` : `${stock} unidade(s) em estoque`}</span></p>}
      </div>
    </>
  );

  function selectVariant(variant: CatalogProductVariant) {
    setInternalSelectedId(variant.id);
    onSelectVariant?.(variant);
  }
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
