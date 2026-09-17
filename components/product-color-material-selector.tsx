"use client";

import Image from "next/image";
import { useState } from "react";
import type { CatalogProductColorMaterialOption } from "@/lib/catalog";
import type { Market } from "@/lib/market";
import { publicTextureImageUrl, resolveColorMaterialSelection } from "@/lib/product-color-material-options";
import styles from "./product-detail.module.css";

type MaterialVisualState =
  | { kind: "color"; value: string }
  | { kind: "texture"; value: string; fallbackColor: string | null; loaded: boolean };

type TextureLoadStatus = "loaded" | "failed";

export function ProductColorMaterialSelector({
  options,
  market,
}: {
  options: CatalogProductColorMaterialOption[];
  market: Market;
}) {
  const [selectedId, setSelectedId] = useState(options[0]?.id ?? null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [textureLoadStatus, setTextureLoadStatus] = useState<Record<string, TextureLoadStatus>>({});
  const visibleOptions = options.filter((option) => optionVisualState(option, textureLoadStatus));
  if (!visibleOptions.length) return null;

  const { selected, preview } = resolveColorMaterialSelection(visibleOptions, selectedId, previewId);
  if (!selected || !preview) return null;
  const previewVisual = optionVisualState(preview, textureLoadStatus);
  const canShowPreview = Boolean(
    previewVisual
    && (previewVisual.kind === "color" || previewVisual.loaded || previewVisual.fallbackColor),
  );
  const markTextureLoaded = (url: string) => setTextureLoadStatus((current) => current[url] === "loaded" ? current : { ...current, [url]: "loaded" });
  const markTextureFailed = (url: string) => setTextureLoadStatus((current) => current[url] === "failed" ? current : { ...current, [url]: "failed" });

  return (
    <fieldset className={styles.colorMaterialBlock} onMouseLeave={() => setPreviewId(null)}>
      <legend>{market === "US" ? "Color / fabric" : "Cor / tecido"}</legend>
      <div className={styles.materialSwatches}>
        {visibleOptions.map((option, index) => {
          const visual = optionVisualState(option, textureLoadStatus);
          if (!visual) return null;
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
              <MaterialVisual
                visual={visual}
                sizes="3rem"
                onTextureLoad={markTextureLoaded}
                onTextureError={markTextureFailed}
              />
            </button>
          );
        })}
      </div>
      {previewVisual && canShowPreview && (
        <div className={styles.materialPreview} aria-live="polite">
          <div className={styles.materialPreviewVisual}>
            <MaterialVisual
              visual={previewVisual}
              sizes="18rem"
              onTextureLoad={markTextureLoaded}
              onTextureError={markTextureFailed}
            />
          </div>
          {preview.name && <strong>{preview.name}</strong>}
        </div>
      )}
    </fieldset>
  );
}

function MaterialVisual({
  visual,
  sizes,
  onTextureLoad,
  onTextureError,
}: {
  visual: MaterialVisualState;
  sizes: string;
  onTextureLoad: (url: string) => void;
  onTextureError: (url: string) => void;
}) {
  return (
    <span
      className={styles.materialVisual}
      style={{ backgroundColor: visual.kind === "color" ? visual.value : visual.fallbackColor ?? undefined }}
    >
      {visual.kind === "texture" && (
        <Image
          src={visual.value}
          alt=""
          fill
          sizes={sizes}
          className={styles.materialTexture}
          style={{ opacity: visual.loaded ? 1 : 0 }}
          onLoad={() => onTextureLoad(visual.value)}
          onError={() => onTextureError(visual.value)}
        />
      )}
    </span>
  );
}

function optionVisualState(
  option: CatalogProductColorMaterialOption,
  textureLoadStatus: Record<string, TextureLoadStatus>,
): MaterialVisualState | null {
  const textureImageUrl = publicTextureImageUrl(option.textureImageUrl);
  const colorHex = option.colorHex?.trim() || null;
  if (textureImageUrl && textureLoadStatus[textureImageUrl] !== "failed") {
    return {
      kind: "texture",
      value: textureImageUrl,
      fallbackColor: colorHex,
      loaded: textureLoadStatus[textureImageUrl] === "loaded",
    };
  }
  if (colorHex) return { kind: "color", value: colorHex };
  return null;
}
