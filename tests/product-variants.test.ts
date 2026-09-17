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
    expect(deriveVariantGroups(variants, "BR")).toMatchObject([
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

  it("mantém variante ativa com stock zero visível, mas não clicável", () => {
    expect(variantIsSelectable({ ...variants[1], active: true, stock: 0, availability: "OUT_OF_STOCK" })).toBe(false);
  });

  it("mantém quatro variantes de colchão ativas e em estoque selecionáveis em um único seletor", () => {
    const mattressVariants = mattress();
    const groups = deriveVariantGroups(mattressVariants, "BR");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "tamanho",
      label: "Tamanho",
      values: ["Casal", "Queen Size", "Super Queen", "King Size"],
      options: [
        { value: "Casal", label: "Casal 138×188", variantIds: ["casal"] },
        { value: "Queen Size", label: "Queen 158×198", variantIds: ["queen"] },
        { value: "Super Queen", label: "Super Queen 178×198", variantIds: ["super-queen"] },
        { value: "King Size", label: "King 193×203", variantIds: ["king"] },
      ],
    });
    const candidates = groups[0].options.map((option) => findVariantForAttribute(mattressVariants, groups, mattressVariants[0], groups[0].key, option.value));
    expect(candidates.every((candidate) => candidate && variantIsSelectable(candidate))).toBe(true);
  });

  it("troca Casal, Queen, Super Queen e King selecionando a variante real e o preço correspondente", () => {
    const mattressVariants = mattress();
    const groups = deriveVariantGroups(mattressVariants, "BR");
    const selectedPrices = ["Casal", "Queen Size", "Super Queen", "King Size"].map((value) => {
      const selected = findVariantForAttribute(mattressVariants, groups, mattressVariants[0], "tamanho", value);
      return [selected?.id, selected?.salePrice];
    });

    expect(selectedPrices).toEqual([
      ["casal", 2100],
      ["queen", 2400],
      ["super-queen", 2800],
      ["king", 3200],
    ]);
  });

  it("desabilita variante sem estoque ou inativa", () => {
    expect(variantIsSelectable({ ...mattress()[0], stock: 0 })).toBe(false);
    expect(variantIsSelectable({ ...mattress()[1], active: false })).toBe(false);
  });

  it("preserva produto genuinamente multidimensional como Cor + Tamanho", () => {
    const groups = deriveVariantGroups(variants, "BR");

    expect(groups.map((group) => group.key)).toEqual(["tamanho", "cor"]);
    expect(findVariantForAttribute(variants, groups, variants[0], "tamanho", "Queen")?.id).toBe("queen-bege");
    expect(findVariantForAttribute(variants, groups, variants[2], "cor", "Preto")?.id).toBe("queen-preto");
  });

  it("não cria três seletores para tamanho, dimensões e texto de opção redundantes", () => {
    const groups = deriveVariantGroups(mattress(), "BR");

    expect(groups.map((group) => group.key)).toEqual(["tamanho"]);
    expect(groups[0].options.map((option) => option.label)).toEqual([
      "Casal 138×188",
      "Queen 158×198",
      "Super Queen 178×198",
      "King 193×203",
    ]);
  });

});

function mattress() {
  return [
    {
      id: "casal",
      label: "Sem Box Casal 138x188x38",
      attributes: { tamanho: "Casal", dimensoes: "138x188x38", quantidade: "Sem Box Casal 138x188x38" },
      stock: 5,
      availability: "AVAILABLE",
      active: true,
      salePrice: 2100,
    },
    {
      id: "queen",
      label: "Sem Box Queen Size 158x198x38",
      attributes: { tamanho: "Queen Size", dimensoes: "158x198x38", quantidade: "Sem Box Queen Size 158x198x38" },
      stock: 4,
      availability: "AVAILABLE",
      active: true,
      salePrice: 2400,
    },
    {
      id: "super-queen",
      label: "Sem Box Super Queen 178x198x38",
      attributes: { tamanho: "Super Queen", dimensoes: "178x198x38", quantidade: "Sem Box Super Queen 178x198x38" },
      stock: 3,
      availability: "AVAILABLE",
      active: true,
      salePrice: 2800,
    },
    {
      id: "king",
      label: "Sem Box King Size 193x203x38",
      attributes: { tamanho: "King Size", dimensoes: "193x203x38", quantidade: "Sem Box King Size 193x203x38" },
      stock: 2,
      availability: "AVAILABLE",
      active: true,
      salePrice: 3200,
    },
  ];
}
