import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";
import { getPublicOrder } from "@/lib/orders";
import { formatDate, formatMoney } from "@/lib/utils";

type ReturnState = "success" | "pending" | "failure";

export async function PedidoStatus({ orderNumber, state }: { orderNumber: string; state: ReturnState }) {
  const order = await getPublicOrder(orderNumber);
  if (!order || order.market !== "BR") notFound();
  const content = contentFor(order.paymentStatus, state);
  const Icon = content.icon;

  return (
    <main className="container py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="eyebrow">Pedido {order.publicOrderNumber}</p>
          <h1 className="mt-2 text-3xl font-black text-ink">{content.title}</h1>
          <p className="mt-3 text-muted">{content.description}</p>
        </div>

        <section className="admin-panel">
          <div className="flex items-start gap-4">
            <span className="grid size-11 place-items-center rounded-sm bg-mint text-brand-strong"><Icon size={22} /></span>
            <div className="min-w-0">
              <h2>{order.productNameSnapshot}</h2>
              <p className="mt-1 text-sm text-muted">{order.variantNameSnapshot ?? "Variante padrao"} · {order.quantity} unidade(s)</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <Metric label="Status do pedido" value={order.status} />
            <Metric label="Status do pagamento" value={order.paymentStatus} />
            <Metric label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
            <Metric label="Frete" value={formatMoney(order.shippingAmount, order.currency)} />
            <Metric label="Total" value={formatMoney(order.total, order.currency)} />
            <Metric label="Criado em" value={formatDate(order.createdAt)} />
          </dl>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          {state === "failure" && <Link href="/br" className="button-primary"><RotateCcw size={17} /> Voltar a loja</Link>}
          <Link href="/br" className="button-secondary">Continuar navegando</Link>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase text-muted">{label}</dt><dd className="mt-1 font-extrabold text-ink">{value}</dd></div>;
}

function contentFor(paymentStatus: string, state: ReturnState) {
  if (paymentStatus === "APPROVED") {
    return {
      title: "Pagamento confirmado",
      description: "Recebemos a confirmacao do Mercado Pago e registramos o pedido na NOMA.",
      icon: CheckCircle2,
    };
  }
  if (paymentStatus === "REJECTED" || paymentStatus === "CANCELLED") {
    return {
      title: "Nao foi possivel concluir o pagamento",
      description: "O pedido segue sem confirmacao de pagamento. Voce pode tentar novamente pela loja ou solicitar atendimento.",
      icon: XCircle,
    };
  }
  return {
    title: state === "failure" ? "Pagamento ainda nao confirmado" : "Pagamento em processamento",
    description: "A tela mostra apenas o status registrado pela NOMA apos validacao. Atualize em alguns instantes se ja concluiu o pagamento.",
    icon: Clock3,
  };
}
