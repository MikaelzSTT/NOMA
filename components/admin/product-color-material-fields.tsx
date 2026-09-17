"use client";

import { upload } from "@vercel/blob/client";
import { LoaderCircle, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRODUCT_IMAGE_ACCEPT_ATTRIBUTE,
  PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES,
  PRODUCT_IMAGE_MULTIPART_THRESHOLD_BYTES,
  PRODUCT_IMAGE_UPLOAD_ENDPOINT,
  formatProductImageBytes,
  isAcceptedProductImageType,
  productImageBlobPathname,
} from "@/lib/product-image-upload";

export interface AdminColorMaterialOption {
  name?: string | null;
  colorHex?: string | null;
  textureImageUrl?: string | null;
}

type EditableOption = {
  key: number;
  name: string;
  colorHex: string;
  textureImageUrl: string;
  textureStatus: "ready" | "uploading" | "error";
  textureError?: string;
  textureLocalPreviewUrl?: string;
  textureUploadId?: string;
  textureUploadedThisSession?: boolean;
};

export function ProductColorMaterialFields({
  initialEnabled = false,
  initialOptions = [],
}: {
  initialEnabled?: boolean;
  initialOptions?: AdminColorMaterialOption[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [nextKey, setNextKey] = useState(initialOptions.length);
  const [options, setOptions] = useState<EditableOption[]>(() => initialOptions.map((option, index) => ({
    key: index,
    name: option.name ?? "",
    colorHex: option.colorHex ?? "",
    textureImageUrl: option.textureImageUrl ?? "",
    textureStatus: "ready",
  })));
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const optionsRef = useRef(options);
  const serialized = useMemo(() => JSON.stringify(options.map((option) => ({
    name: optionalText(option.name),
    colorHex: optionalText(option.colorHex)?.toUpperCase(),
    textureImageUrl: optionalText(option.textureImageUrl),
  }))), [options]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    return () => revokeTexturePreviews(optionsRef.current);
  }, []);

  function addOption() {
    setOptions((current) => [...current, { key: nextKey, name: "", colorHex: "", textureImageUrl: "", textureStatus: "ready" }]);
    setNextKey((current) => current + 1);
  }

  function toggleEnabled(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    if (nextEnabled && options.length === 0) addOption();
  }

  function patchOption(key: number, patch: Partial<EditableOption>) {
    setOptions((current) => current.map((option) => option.key === key ? { ...option, ...patch } : option));
  }

  function removeOption(key: number) {
    setOptions((current) => {
      const removed = current.find((option) => option.key === key);
      if (removed?.textureLocalPreviewUrl) URL.revokeObjectURL(removed.textureLocalPreviewUrl);
      if (removed?.textureUploadedThisSession && removed.textureImageUrl) void deleteUploadedBlob(removed.textureImageUrl);
      return current.filter((option) => option.key !== key);
    });
  }

  function updateTextureUrl(key: number, value: string) {
    const nextUrl = value.trim();
    setOptions((current) => current.map((option) => {
      if (option.key !== key) return option;
      if (option.textureLocalPreviewUrl) URL.revokeObjectURL(option.textureLocalPreviewUrl);
      if (option.textureUploadedThisSession && option.textureImageUrl && option.textureImageUrl !== nextUrl) {
        void deleteUploadedBlob(option.textureImageUrl);
      }
      return {
        ...option,
        textureImageUrl: value,
        textureStatus: "ready",
        textureError: undefined,
        textureLocalPreviewUrl: undefined,
        textureUploadId: undefined,
        textureUploadedThisSession: false,
      };
    }));
  }

  function removeTexture(key: number) {
    updateTextureUrl(key, "");
    if (fileInputRefs.current[key]) fileInputRefs.current[key]!.value = "";
  }

  async function uploadTextureFile(key: number, file: File | null) {
    if (!file) return;
    if (fileInputRefs.current[key]) fileInputRefs.current[key]!.value = "";

    if (!isAcceptedProductImageType(file.type)) {
      patchOption(key, { textureStatus: "error", textureError: `${file.name}: use JPG, JPEG, PNG ou WebP.` });
      return;
    }
    if (file.size > PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES) {
      patchOption(key, { textureStatus: "error", textureError: `${file.name}: tamanho máximo de ${formatProductImageBytes(PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES)}.` });
      return;
    }

    const uploadId = crypto.randomUUID();
    const localPreviewUrl = URL.createObjectURL(file);
    setOptions((current) => current.map((option) => {
      if (option.key !== key) return option;
      if (option.textureLocalPreviewUrl) URL.revokeObjectURL(option.textureLocalPreviewUrl);
      return {
        ...option,
        textureStatus: "uploading",
        textureError: undefined,
        textureLocalPreviewUrl: localPreviewUrl,
        textureUploadId: uploadId,
      };
    }));

    try {
      const blob = await upload(productImageBlobPathname(file.name), file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: PRODUCT_IMAGE_UPLOAD_ENDPOINT,
        multipart: file.size > PRODUCT_IMAGE_MULTIPART_THRESHOLD_BYTES,
      });
      let replacedSessionUrl: string | undefined;
      setOptions((current) => current.map((option) => {
        if (option.key !== key || option.textureUploadId !== uploadId) return option;
        if (option.textureUploadedThisSession && option.textureImageUrl && option.textureImageUrl !== blob.url) {
          replacedSessionUrl = option.textureImageUrl;
        }
        return {
          ...option,
          textureImageUrl: blob.url,
          textureStatus: "ready",
          textureError: undefined,
          textureLocalPreviewUrl: undefined,
          textureUploadId: undefined,
          textureUploadedThisSession: true,
        };
      }));
      URL.revokeObjectURL(localPreviewUrl);
      if (replacedSessionUrl) void deleteUploadedBlob(replacedSessionUrl);
    } catch {
      setOptions((current) => current.map((option) => option.key === key && option.textureUploadId === uploadId
        ? { ...option, textureStatus: "error", textureError: "Não foi possível enviar esta textura. Verifique o storage e tente novamente." }
        : option));
    }
  }

  return (
    <section className="admin-panel space-y-4">
      <input type="hidden" name="hasColorMaterialOptions" value={String(enabled)} />
      <input type="hidden" name="colorMaterialOptionsJson" value={serialized} />
      <div>
        <h2>Cores / tecidos disponíveis</h2>
        <p className="mt-1 text-sm text-muted">Opções visuais globais do produto. Não alteram variante, SKU, preço ou estoque.</p>
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-sm border border-border bg-surface p-4 text-sm font-bold text-ink">
        <span>
          Este produto possui opções de cor/tecido?
          <small className="mt-1 block text-xs font-normal text-muted">Ative para exibir amostras na página do produto.</small>
        </span>
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand" : "bg-stone-300"}`}>
          <input
            className="sr-only"
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            checked={enabled}
            onChange={(event) => toggleEnabled(event.target.checked)}
          />
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </span>
      </label>
      {enabled && (
        <div className="space-y-4">
          {options.map((option, index) => {
            const texturePreviewUrl = option.textureLocalPreviewUrl ?? option.textureImageUrl.trim();
            const hasVisual = Boolean(texturePreviewUrl || option.colorHex.trim());
            return (
              <div key={option.key} className="rounded-sm border border-border p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-bold text-ink">Cor/tecido {index + 1}</h3>
                  <button type="button" className="button-secondary min-h-0 px-3 py-2" onClick={() => removeOption(option.key)}>
                    <Trash2 size={16} /> Remover
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="admin-field">Nome<input value={option.name} maxLength={160} onChange={(event) => patchOption(option.key, { name: event.target.value })} /></label>
                  <label className="admin-field">Cor HEX<input value={option.colorHex} maxLength={7} pattern="#[0-9A-Fa-f]{6}" placeholder="#C49A6C" onChange={(event) => patchOption(option.key, { colorHex: event.target.value.toUpperCase() })} /></label>
                  <div className="admin-field">
                    <label htmlFor={`texture-url-${option.key}`}>Imagem/textura</label>
                    <input id={`texture-url-${option.key}`} value={option.textureImageUrl} placeholder="https://..." onChange={(event) => updateTextureUrl(option.key, event.target.value)} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    ref={(element) => { fileInputRefs.current[option.key] = element; }}
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT_ATTRIBUTE}
                    className="hidden"
                    onChange={(event) => void uploadTextureFile(option.key, event.target.files?.[0] ?? null)}
                  />
                  <button type="button" className="button-secondary min-h-0 px-3 py-2" disabled={option.textureStatus === "uploading"} onClick={() => fileInputRefs.current[option.key]?.click()}>
                    {option.textureStatus === "uploading" ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
                    {texturePreviewUrl ? "Trocar" : "Adicionar imagem do dispositivo"}
                  </button>
                  {texturePreviewUrl && (
                    <button type="button" className="button-secondary min-h-0 px-3 py-2" disabled={option.textureStatus === "uploading"} onClick={() => removeTexture(option.key)}>
                      <X size={16} /> Remover
                    </button>
                  )}
                  <p className="text-xs text-muted">JPG, JPEG, PNG ou WebP até {formatProductImageBytes(PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES)}.</p>
                </div>
                {option.textureStatus === "error" && option.textureError && <div className="admin-alert error mb-0 mt-3">{option.textureError}</div>}
                {hasVisual && (
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted">
                    <span aria-hidden="true" className="relative h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-cover bg-center" style={{ backgroundColor: option.colorHex || undefined }}>
                      {texturePreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={texturePreviewUrl} alt="" className="h-full w-full object-cover" />
                      )}
                      {option.textureStatus === "uploading" && <span className="absolute inset-0 grid place-items-center bg-white/70"><LoaderCircle className="animate-spin text-ink" size={16} /></span>}
                    </span>
                    Prévia da amostra
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="button-secondary" onClick={addOption}><Plus size={17} /> Adicionar cor/tecido</button>
        </div>
      )}
    </section>
  );
}

function optionalText(value: string) {
  return value.trim() || undefined;
}

function revokeTexturePreviews(options: EditableOption[]) {
  for (const option of options) {
    if (option.textureLocalPreviewUrl) URL.revokeObjectURL(option.textureLocalPreviewUrl);
  }
}

async function deleteUploadedBlob(url: string) {
  try {
    await fetch("/api/admin/product-images/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // The form state is still correct if storage cleanup fails.
  }
}
