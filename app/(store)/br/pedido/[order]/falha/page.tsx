import { PedidoStatus } from "../pedido-status";

type Props = { params: Promise<{ order: string }> };

export const dynamic = "force-dynamic";

export default async function PedidoFalhaPage({ params }: Props) {
  const { order } = await params;
  return <PedidoStatus orderNumber={order} state="failure" />;
}
