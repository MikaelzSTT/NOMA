import type { PricingRuleType } from "@/generated/prisma/enums";

export interface PriceRuleInput {
  type: PricingRuleType;
  value: number;
  roundingIncrement?: number | null;
}

export interface NomaBrPriceInput {
  costPrice: number;
  compareAtPrice?: number | null;
}

export interface NomaBrPriceResult {
  costPrice: number;
  percentagePrice: number;
  minimumAbsolutePrice: number;
  basePrice: number;
  compareAtCeiling?: number;
  salePrice: number;
  grossProfit: number;
  grossMarginPercent: number;
  needsManualReview: boolean;
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

export function calculateNomaBrSalePrice(input: NomaBrPriceInput): NomaBrPriceResult {
  const costPrice = money(input.costPrice);
  if (!Number.isFinite(costPrice) || costPrice < 0) throw new Error("Custo invalido.");

  const percentagePrice = money(costPrice * 1.15);
  const minimumAbsolutePrice = money(costPrice + 350);
  const basePrice = Math.max(percentagePrice, minimumAbsolutePrice);
  const compareAtPrice = input.compareAtPrice == null ? null : money(input.compareAtPrice);
  const compareAtCeiling = compareAtPrice != null && Number.isFinite(compareAtPrice) && compareAtPrice > costPrice
    ? money(compareAtPrice * 0.98)
    : undefined;
  const target = compareAtCeiling == null ? basePrice : Math.min(basePrice, compareAtCeiling);
  const salePrice = roundCommercialPrice(target, compareAtCeiling);
  const grossProfit = money(salePrice - costPrice);
  const grossMarginPercent = salePrice > 0 ? money((grossProfit / salePrice) * 100) : 0;

  return {
    costPrice,
    percentagePrice,
    minimumAbsolutePrice,
    basePrice,
    compareAtCeiling,
    salePrice,
    grossProfit,
    grossMarginPercent,
    needsManualReview: compareAtCeiling != null && compareAtCeiling < basePrice,
  };
}

export function calculateGrossMargin(costPrice: number, salePrice: number) {
  const cost = money(costPrice);
  const sale = money(salePrice);
  const grossProfit = money(sale - cost);
  return {
    grossProfit,
    grossMarginPercent: sale > 0 ? money((grossProfit / sale) * 100) : 0,
  };
}

function roundCommercialPrice(value: number, ceiling?: number) {
  const cappedValue = ceiling == null ? value : Math.min(value, ceiling);
  if (cappedValue < 100) return floorMoney(cappedValue);

  const base = Math.floor((cappedValue - 90) / 100);
  const candidates = [base * 100 + 90, (base + 1) * 100 + 90]
    .filter((candidate) => candidate > 0 && (ceiling == null || candidate <= ceiling));
  if (candidates.length === 0) return floorMoney(cappedValue);

  return money(candidates.sort((left, right) => {
    const distance = Math.abs(left - cappedValue) - Math.abs(right - cappedValue);
    return distance || right - left;
  })[0]!);
}

function floorMoney(value: number) {
  return Math.floor(value * 100) / 100;
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}
