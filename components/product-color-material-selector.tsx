"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { CatalogProductVariant } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import {
  colorMaterialOptionKey,
  deriveColorMaterialOptions,
  deriveVariantGroups,
  findVariantForColorMaterial,
  variantIsSelectable,
} from "@/lib/product-variants";
import styles from "./product-detail.module.css";

export function ProductColorMaterialSelector({
  variants,
  selected,
  market,
  onSelectVariant,
}: {
  variants: CatalogProductVariant[];
  selected: CatalogProductVariant | undefined;
  market: Market;
  onSelectVariant: (variant: CatalogProductVariant) => void;
}) {
  const options = useMemo(() => deriveColorMaterialOptions(variants), [variants]);
  const groups = useMemo(() => deriveVariantGroups(variants, market), [market, variants]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  if (!options.length) return null;

  const selectedKey = selected?.hasColorMaterial ? colorMaterialOptionKey(selected) : null;
  const activeKey = previewKey ?? selectedKey;
  const activeOption = options.find((option) => option.key === activeKey);
  const activeVariant = activeOption
    ? findVariantForColorMaterial(variants, groups, selected, activeOption.key)
    : undefined;
  const preview = activeOption ? {
    name: activeVariant?.colorMaterialName ?? activeOption.name,
    materialType: activeVariant?.materialType ?? activeOption.materialType,
    colorHex: activeVariant?.colorHex ?? activeOption.colorHex,
    textureImageUrl: activeVariant?.textureImageUrl ?? activeOption.textureImageUrl,
  } : null;

  return (
    <fieldset className={styles.colorMaterialBlock} onMouseLeave={() => setPreviewKey(null)}>
      <legend>{market === "US" ? "Color / fabric" : "Cor / tecido"}</legend>
      <div className={styles.materialSwatches}>
        {options.map((option) => {
          const candidate = findVariantForColorMaterial(variants, groups, selected, option.key);
          const isSelected = option.key === selectedKey;
          const disabled = !candidate || !variantIsSelectable(candidate);
          const visual = candidate?.hasColorMaterial ? candidate : option;
          return (
            <button
              key={option.key}
              type="button"
              className={styles.materialSwatch}
              data-selected={isSelected}
              disabled={disabled}
              aria-label={option.name}
              aria-pressed={isSelected}
              title={option.name}
              onMouseEnter={() => setPreviewKey(option.key)}
              onFocus={() => setPreviewKey(option.key)}
              onBlur={() => setPreviewKey(null)}
              onClick={() => candidate && onSelectVariant(candidate)}
            >
              <MaterialVisual
                name={option.name}
                textureImageUrl={visual.textureImageUrl}
                colorHex={visual.colorHex}
                sizes="3rem"
              />
            </button>
          );
        })}
      </div>
      {preview && (
        <div className={styles.materialPreview} aria-live="polite">
          <div className={styles.materialPreviewVisual}>
            <MaterialVisual
              name={preview.name}
              textureImageUrl={preview.textureImageUrl}
              colorHex={preview.colorHex}
              sizes="8rem"
            />
          </div>
          <div>
            <strong>{preview.name}</strong>
            {preview.materialType && <span>{preview.materialType}</span>}
          </div>
        </div>
      )}
    </fieldset>
  );
}

function MaterialVisual({
  name,
  textureImageUrl,
  colorHex,
  sizes,
}: {
  name: string;
  textureImageUrl?: string | null;
  colorHex?: string | null;
  sizes: string;
}) {
  return (
    <span className={styles.materialVisual} style={{ backgroundColor: colorHex ?? "#E9E4DA" }}>
      {textureImageUrl && <Image src={textureImageUrl} alt="" fill sizes={sizes} className={styles.materialTexture} />}
      <span className="sr-only">{name}</span>
    </span>
  );
}
