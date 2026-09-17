import { describe, expect, it } from "vitest";
import {
  colorMaterialVisualSource,
  isDisplayableColorMaterialOption,
  publicTextureImageUrl,
  resolveColorMaterialSelection,
} from "@/lib/product-color-material-options";

const hex = { id: "hex", name: null, colorHex: "#C49A6C", textureImageUrl: null };
const texture = { id: "texture", name: null, colorHex: null, textureImageUrl: "https://cdn.example.com/textura.jpg" };
const namedTexture = { id: "named", name: "Bouclé 2286", colorHex: "#FFFFFF", textureImageUrl: "https://cdn.example.com/boucle.jpg" };
const empty = { id: "empty", name: null, colorHex: null, textureImageUrl: null };
const temporaryTexture = { id: "temporary", name: null, colorHex: "#D8D0C4", textureImageUrl: "blob:http://localhost:3000/preview" };
const localTexture = { id: "local", name: null, colorHex: null, textureImageUrl: "/tmp/texture.png" };

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

  it("não usa URL temporária ou local como textura pública", () => {
    expect(publicTextureImageUrl("https://cdn.example.com/textura.jpg")).toBe("https://cdn.example.com/textura.jpg");
    expect(publicTextureImageUrl("blob:http://localhost:3000/preview")).toBeNull();
    expect(publicTextureImageUrl("file:///tmp/texture.png")).toBeNull();
    expect(publicTextureImageUrl("http://localhost:3000/texture.png")).toBeNull();
    expect(publicTextureImageUrl("/tmp/texture.png")).toBeNull();
    expect(isDisplayableColorMaterialOption(temporaryTexture)).toBe(true);
    expect(colorMaterialVisualSource(temporaryTexture)).toEqual({ kind: "color", value: "#D8D0C4" });
    expect(isDisplayableColorMaterialOption(localTexture)).toBe(false);
  });

  it("fixa a opção selecionada e permite preview temporária sem dados comerciais", () => {
    const options = [hex, texture, namedTexture];
    expect(resolveColorMaterialSelection(options, "texture", null)).toEqual({ selected: texture, preview: texture });
    expect(resolveColorMaterialSelection(options, "texture", "named")).toEqual({ selected: texture, preview: namedTexture });
    expect(resolveColorMaterialSelection(options, "named", null)).toEqual({ selected: namedTexture, preview: namedTexture });
  });
});
