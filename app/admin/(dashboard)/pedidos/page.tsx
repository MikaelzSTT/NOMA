import { CreditCard, ReceiptText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";

export default async function AdminOrdersPage() {
  await requireAdmin();
  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      publicOrderNumber: true,
      createdAt: true,
      productNameSnapshot: true,
      variantNameSnapshot: true,
      total: true,
      currency: true,
      market: true,
      paymentProvider: true,
      status: true,
      paymentStatus: true,
      mercadoPagoPaymentId: true,
    },
  });

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Pedidos reais</p>
          <h1>Pedidos</h1>
          <p>Pedidos criados por checkouts de pagamento da NOMA.</p>
        </div>
        <ReceiptText className="text-brand" size={24} />
      </div>

      <section className="admin-panel">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2>Ultimos pedidos</h2>
            <p className="mt-1 text-sm text-muted">A lista mostra no maximo os 100 pedidos mais recentes.</p>
          </div>
          <CreditCard className="text-brand" size={20} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Data</th>
                <th>Produto</th>
                <th>Total</th>
                <th>Mercado</th>
                <th>Gateway</th>
                <th>Status</th>
                <th>Pagamento</th>
                <th>MP payment ID</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="font-bold text-ink">{order.publicOrderNumber}</td>
                  <td className="whitespace-nowrap">{formatDate(order.createdAt)}</td>
                  <td className="max-w-72 truncate">{order.productNameSnapshot}{order.variantNameSnapshot ? ` / ${order.variantNameSnapshot}` : ""}</td>
                  <td>{formatMoney(order.total, order.currency)}</td>
                  <td>{order.market}</td>
                  <td>{order.paymentProvider}</td>
                  <td>{order.status}</td>
                  <td>{order.paymentStatus}</td>
                  <td>{order.mercadoPagoPaymentId ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum pedido real registrado.</p>}
        </div>
      </section>
    </div>
  );
}
