import { NextResponse } from "next/server";
import { getPublicOrder } from "@/lib/orders";

type Context = { params: Promise<{ order: string }> };

export async function GET(_request: Request, context: Context) {
  const { order: orderNumber } = await context.params;
  const order = await getPublicOrder(orderNumber);

  if (!order || order.market !== "BR") {
    return NextResponse.json({ status: "not_found" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (
    order.paymentStatus === "APPROVED"
    && order.mercadoPagoPaymentId
    && order.paidAt
    && order.currency === "BRL"
  ) {
    return NextResponse.json({
      status: "approved",
      conversion: {
        transactionId: order.publicOrderNumber,
        value: Number(order.total),
        currency: "BRL",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const status = ["REJECTED", "CANCELLED", "REFUNDED"].includes(order.paymentStatus)
    ? "terminal"
    : "pending";
  return NextResponse.json({ status }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
