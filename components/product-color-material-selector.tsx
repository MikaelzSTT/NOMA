"use client";

import Image from "next/image";
import { useState } from "react";
import type { CatalogProductColorMaterialOption } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import { colorMaterialVisualSource, resolveColorMaterialSelection } from "@/lib/product-color-material-options";
import styles from "./product-detail.module.css";

export function ProductColorMaterialSelector({
  options,
  market,
}: {
  options: CatalogProductColorMaterialOption[];
  market: Market;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  if (!options.length) return null;

  const { selected, preview } = resolveColorMaterialSelection(options, selectedId, previewId);
  if (!selected || !preview) return null;

  return (
    <fieldset className={styles.colorMaterialBlock} onMouseLeave={() => setPreviewId(null)}>
      <legend>{market === "US" ? "Color / fabric" : "Cor / tecido"}</legend>
      <div className={styles.materialSwatches}>
        {options.map((option, index) => {
          const isSelected = option.id === selected.id;
          const accessibleName = option.name ?? (market === "US" ? `Color or fabric option ${index + 1}` : `Opção de cor ou tecido ${index + 1}`);
          return (
            <button
              key={option.id}
              type="button"
              className={styles.materialSwatch}
              data-selected={isSelected}
              aria-label={accessibleName}
              aria-pressed={isSelected}
              title={option.name ?? undefined}
              onMouseEnter={() => setPreviewId(option.id)}
              onFocus={() => setPreviewId(option.id)}
              onBlur={() => setPreviewId(null)}
              onClick={() => setSelectedId(option.id)}
            >
              <MaterialVisual option={option} sizes="3rem" />
            </button>
          );
        })}
      </div>
      <div className={styles.materialPreview} aria-live="polite">
        <div className={styles.materialPreviewVisual}>
          <MaterialVisual option={preview} sizes="18rem" />
        </div>
        {preview.name && <strong>{preview.name}</strong>}
      </div>
    </fieldset>
  );
}

function MaterialVisual({ option, sizes }: { option: CatalogProductColorMaterialOption; sizes: string }) {
  const visual = colorMaterialVisualSource(option);
  return (
    <span className={styles.materialVisual} style={{ backgroundColor: visual?.kind === "color" ? visual.value : option.colorHex ?? undefined }}>
      {visual?.kind === "texture" && <Image src={visual.value} alt="" fill sizes={sizes} className={styles.materialTexture} />}
    </span>
  );
}
