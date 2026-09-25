import { paymentIdFromMercadoPagoReturn, PedidoStatus, type MercadoPagoReturnSearchParams } from "../pedido-status";

type Props = {
  params: Promise<{ order: string }>;
  searchParams: Promise<MercadoPagoReturnSearchParams>;
};

export const dynamic = "force-dynamic";

export default async function PedidoFalhaPage({ params, searchParams }: Props) {
  const [{ order }, query] = await Promise.all([params, searchParams]);
  return <PedidoStatus orderNumber={order} state="failure" mercadoPagoPaymentId={paymentIdFromMercadoPagoReturn(query)} />;
}
