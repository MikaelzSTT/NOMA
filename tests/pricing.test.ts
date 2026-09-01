import { describe, expect, it } from "vitest";
import { calculateNomaBrSalePrice, calculateSellingPrice } from "@/services/pricing";

describe("precificação", () => {
  it("aplica markup ao custo sem confundir custo e venda", () => {
    expect(calculateSellingPrice(100, { type: "MARKUP", value: 1.8 })).toBe(180);
  });

  it("aplica margem fixa e arredondamento", () => {
    expect(calculateSellingPrice(100, { type: "FIXED_MARGIN", value: 49.9, roundingIncrement: 1 })).toBe(150);
  });

  it("calcula preço NOMA BR pelo maior valor entre percentual e mínimo absoluto", () => {
    const result = calculateNomaBrSalePrice({ costPrice: 1000 });

    expect(result).toMatchObject({
      basePrice: 1350,
      salePrice: 1390,
      grossProfit: 390,
      needsManualReview: false,
    });
  });

  it("respeita teto de 98% do comparativo e alerta revisão manual", () => {
    const result = calculateNomaBrSalePrice({ costPrice: 1000, compareAtPrice: 1200 });

    expect(result.compareAtCeiling).toBe(1176);
    expect(result.salePrice).toBe(1090);
    expect(result.needsManualReview).toBe(true);
  });

  it("arredonda para apresentação comercial próxima terminando em 90", () => {
    expect(calculateNomaBrSalePrice({ costPrice: 3242.61 }).salePrice).toBe(3690);
  });
});
