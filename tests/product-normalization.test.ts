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

  it("gera desconto, slug e hash determinísticos", () => {
    expect(calculateDiscount(80, 100)).toBe(20);
    expect(calculateDiscount(100, 80)).toBeUndefined();
    expect(slugify("Sofá Arco")).toBe("sofa-arco");
    expect(canonicalProductHash("Sofá Arco", "Noma")).toBe(canonicalProductHash("Sofa Arco", "Noma"));
  });
});
