import type { ShippingAdapter } from "@/lib/shipping/types";

export const fixedShippingAdapter: ShippingAdapter = {
  async quote(input) {
    const price = roundMoney(Number(input.offer.shippingCost));
    if (!Number.isFinite(price) || price < 0) return [];
    return [{
      serviceCode: "fixed",
      serviceName: "Entrega",
      price,
      currency: input.offer.currency,
      estimatedMinDays: input.offer.estimatedDeliveryMinDays,
      estimatedMaxDays: input.offer.estimatedDeliveryMaxDays,
      rawResponse: { source: "ProductMarketOffer.shippingCost" },
    }];
  },
};

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
