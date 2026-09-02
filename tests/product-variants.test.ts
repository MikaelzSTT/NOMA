import { describe, expect, it } from "vitest";
import { deriveVariantGroups, findVariantForAttribute, variantIsSelectable } from "@/lib/product-variants";

const variants = [
  { id: "sol-bege", label: "Solteiro bege", attributes: { tamanho: "Solteiro", cor: "Bege" }, stock: 3, availability: "AVAILABLE" },
  { id: "sol-preto", label: "Solteiro preto", attributes: { tamanho: "Solteiro", cor: "Preto" }, stock: 0, availability: "OUT_OF_STOCK" },
  { id: "queen-bege", label: "Queen bege", attributes: { tamanho: "Queen", cor: "Bege" }, stock: 2, availability: "AVAILABLE" },
  { id: "queen-preto", label: "Queen preto", attributes: { tamanho: "Queen", cor: "Preto" }, stock: 1, availability: "AVAILABLE" },
];

describe("seletor compacto de variantes", () => {
  it("separa os atributos que realmente variam", () => {
    expect(deriveVariantGroups(variants, "BR")).toEqual([
      { key: "tamanho", label: "Tamanho", values: ["Solteiro", "Queen"] },
      { key: "cor", label: "Cor", values: ["Bege", "Preto"] },
    ]);
  });

  it("remove atributos derivados que representam a mesma partição", () => {
    const measures = variants.slice(0, 2).map((variant, index) => ({
      ...variant,
      attributes: { medida: index ? "Queen 158x198" : "Solteiro 88x188", dimensoes: index ? "158x198" : "88x188" },
    }));
    expect(deriveVariantGroups(measures, "BR").map((group) => group.key)).toEqual(["medida"]);
  });

  it("mantém a combinação atual ao trocar um atributo", () => {
    const groups = deriveVariantGroups(variants, "BR");
    expect(findVariantForAttribute(variants, groups, variants[0], "tamanho", "Queen")?.id).toBe("queen-bege");
  });

  it("desabilita estoque esgotado, mas permite pré-venda", () => {
    expect(variantIsSelectable(variants[1])).toBe(false);
    expect(variantIsSelectable({ ...variants[1], availability: "PREORDER" })).toBe(true);
  });
});
