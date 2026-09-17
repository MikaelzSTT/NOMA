"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

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
  })));
  const serialized = useMemo(() => JSON.stringify(options.map((option) => ({
    name: optionalText(option.name),
    colorHex: optionalText(option.colorHex)?.toUpperCase(),
    textureImageUrl: optionalText(option.textureImageUrl),
  }))), [options]);

  function addOption() {
    setOptions((current) => [...current, { key: nextKey, name: "", colorHex: "", textureImageUrl: "" }]);
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
    setOptions((current) => current.filter((option) => option.key !== key));
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
            const hasVisual = Boolean(option.textureImageUrl.trim() || option.colorHex.trim());
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
                  <label className="admin-field">Imagem/textura<input value={option.textureImageUrl} placeholder="https://..." onChange={(event) => patchOption(option.key, { textureImageUrl: event.target.value })} /></label>
                </div>
                {hasVisual && (
                  <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted">
                    <span
                      aria-hidden="true"
                      className="h-12 w-12 shrink-0 rounded-sm border border-border bg-cover bg-center"
                      style={option.textureImageUrl.trim()
                        ? { backgroundImage: `url(${JSON.stringify(option.textureImageUrl.trim())})`, backgroundColor: option.colorHex || undefined }
                        : { backgroundColor: option.colorHex }}
                    />
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
