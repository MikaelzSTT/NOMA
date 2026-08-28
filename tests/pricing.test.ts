import { describe, expect, it } from "vitest";
import { calculateSellingPrice } from "@/services/pricing";

describe("precificação", () => {
  it("aplica markup ao custo sem confundir custo e venda", () => {
    expect(calculateSellingPrice(100, { type: "MARKUP", value: 1.8 })).toBe(180);
  });

  it("aplica margem fixa e arredondamento", () => {
    expect(calculateSellingPrice(100, { type: "FIXED_MARGIN", value: 49.9, roundingIncrement: 1 })).toBe(150);
  });
});
