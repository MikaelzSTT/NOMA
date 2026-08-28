import type { PricingRuleType } from "@/generated/prisma/enums";

export interface PriceRuleInput {
  type: PricingRuleType;
  value: number;
  roundingIncrement?: number | null;
}

export function calculateSellingPrice(costPrice: number, rule: PriceRuleInput) {
  if (!Number.isFinite(costPrice) || costPrice < 0) throw new Error("Custo invalido.");
  if (!Number.isFinite(rule.value) || rule.value < 0) throw new Error("Valor da regra invalido.");

  const raw = rule.type === "MARKUP"
    ? costPrice * rule.value
    : costPrice + rule.value;
  const increment = rule.roundingIncrement ?? 0.01;
  if (!Number.isFinite(increment) || increment <= 0) throw new Error("Arredondamento invalido.");
  return Math.round(Math.ceil(raw / increment) * increment * 100) / 100;
}
