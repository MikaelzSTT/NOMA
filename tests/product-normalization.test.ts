import { describe, expect, it } from "vitest";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";
import { canonicalProductHash } from "@/lib/catalog/product-hash";
import { calculateDiscount, slugify } from "@/lib/utils";
import { MOCK_CATALOG } from "@/suppliers/mock-catalog";

describe("normalização de produtos", () => {
  it("aceita o modelo interno definitivo do catálogo mock", () => {
    expect(normalizedSupplierProductSchema.safeParse(MOCK_CATALOG[0]).success).toBe(true);
  });

  it("rejeita URL insegura e custo negativo", () => {
    const parsed = normalizedSupplierProductSchema.safeParse({ ...MOCK_CATALOG[0], sourceUrl: "javascript:alert(1)", costPrice: -10 });
    expect(parsed.success).toBe(false);
  });

  it("valida nome e amostra somente quando cor/material está ligado", () => {
    const baseVariant = MOCK_CATALOG[0]!.variants[0]!;
    const invalid = normalizedSupplierProductSchema.safeParse({
      ...MOCK_CATALOG[0],
      variants: [{ ...baseVariant, hasColorMaterial: true }],
    });
    const disabled = normalizedSupplierProductSchema.safeParse({
      ...MOCK_CATALOG[0],
      variants: [{ ...baseVariant, hasColorMaterial: false, colorHex: "inválido" }],
    });
    const valid = normalizedSupplierProductSchema.safeParse({
      ...MOCK_CATALOG[0],
      variants: [{
        ...baseVariant,
        hasColorMaterial: true,
        colorMaterialName: "Linho Bege",
        materialType: "Linho",
        colorHex: "#d8c3a5",
      }],
    });

    expect(invalid.success).toBe(false);
    expect(disabled.success).toBe(true);
    expect(valid.success && valid.data.variants[0]?.colorHex).toBe("#D8C3A5");
  });

  it("gera desconto, slug e hash determinísticos", () => {
    expect(calculateDiscount(80, 100)).toBe(20);
    expect(calculateDiscount(100, 80)).toBeUndefined();
    expect(slugify("Sofá Arco")).toBe("sofa-arco");
    expect(canonicalProductHash("Sofá Arco", "Noma")).toBe(canonicalProductHash("Sofa Arco", "Noma"));
  });
});
