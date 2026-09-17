import { describe, expect, it } from "vitest";
import {
  colorMaterialVisualSource,
  isDisplayableColorMaterialOption,
  resolveColorMaterialSelection,
} from "@/lib/product-color-material-options";

const hex = { id: "hex", name: null, colorHex: "#C49A6C", textureImageUrl: null };
const texture = { id: "texture", name: null, colorHex: null, textureImageUrl: "https://cdn.example.com/textura.jpg" };
const namedTexture = { id: "named", name: "Bouclé 2286", colorHex: "#FFFFFF", textureImageUrl: "https://cdn.example.com/boucle.jpg" };
const empty = { id: "empty", name: null, colorHex: null, textureImageUrl: null };

describe("opções visuais globais do produto", () => {
  it("aceita HEX ou textura e descarta uma opção vazia", () => {
    expect(isDisplayableColorMaterialOption(hex)).toBe(true);
    expect(isDisplayableColorMaterialOption(texture)).toBe(true);
    expect(isDisplayableColorMaterialOption(empty)).toBe(false);
  });

  it("prioriza textura real quando também existe HEX", () => {
    expect(colorMaterialVisualSource(hex)).toEqual({ kind: "color", value: "#C49A6C" });
    expect(colorMaterialVisualSource(texture)).toEqual({ kind: "texture", value: "https://cdn.example.com/textura.jpg" });
    expect(colorMaterialVisualSource(namedTexture)).toEqual({ kind: "texture", value: "https://cdn.example.com/boucle.jpg" });
  });

  it("fixa a opção selecionada e permite preview temporária sem dados comerciais", () => {
    const options = [hex, texture, namedTexture];
    expect(resolveColorMaterialSelection(options, "texture", null)).toEqual({ selected: texture, preview: texture });
    expect(resolveColorMaterialSelection(options, "texture", "named")).toEqual({ selected: texture, preview: namedTexture });
    expect(resolveColorMaterialSelection(options, "named", null)).toEqual({ selected: namedTexture, preview: namedTexture });
  });
});
