import { ShippingQuoteError, type ShippingAdapter } from "@/lib/shipping/types";

export const manualShippingAdapter: ShippingAdapter = {
  async quote() {
    throw new ShippingQuoteError("manual_shipping", 409, "Frete requer compra assistida.");
  },
};
