export interface ColorMaterialVisualOption {
  id: string;
  name: string | null;
  colorHex: string | null;
  textureImageUrl: string | null;
}

export function isDisplayableColorMaterialOption(option: ColorMaterialVisualOption) {
  return Boolean(option.textureImageUrl?.trim() || option.colorHex?.trim());
}

export function colorMaterialVisualSource(option: ColorMaterialVisualOption) {
  const textureImageUrl = option.textureImageUrl?.trim();
  if (textureImageUrl) return { kind: "texture" as const, value: textureImageUrl };
  const colorHex = option.colorHex?.trim();
  if (colorHex) return { kind: "color" as const, value: colorHex };
  return null;
}

export function resolveColorMaterialSelection<T extends ColorMaterialVisualOption>(
  options: T[],
  selectedId: string | null,
  previewId: string | null,
) {
  const selected = options.find((option) => option.id === selectedId) ?? options[0] ?? null;
  const preview = options.find((option) => option.id === previewId) ?? selected;
  return { selected, preview };
}
