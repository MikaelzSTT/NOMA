export interface ColorMaterialVisualOption {
  id: string;
  name: string | null;
  colorHex: string | null;
  textureImageUrl: string | null;
}

export function isDisplayableColorMaterialOption(option: ColorMaterialVisualOption) {
  return Boolean(publicTextureImageUrl(option.textureImageUrl) || option.colorHex?.trim());
}

export function colorMaterialVisualSource(option: ColorMaterialVisualOption) {
  const textureImageUrl = publicTextureImageUrl(option.textureImageUrl);
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

export function publicTextureImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1") return null;
    return url.toString();
  } catch {
    return null;
  }
}
