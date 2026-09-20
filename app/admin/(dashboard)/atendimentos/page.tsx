import { ExternalLink, Headphones } from "lucide-react";
import { updateAssistedPurchaseStatusAction } from "@/app/admin/(dashboard)/atendimentos/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/utils";

const statuses = ["NEW", "CONTACTED", "WON", "LOST"] as const;

export default async function AdminAssistedPurchasesPage() {
  await requireAdmin();
  const requests = await db.assistedPurchaseRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      market: true,
      customerName: true,
      phone: true,
      email: true,
      consent: true,
      productTitleSnapshot: true,
      variantLabelSnapshot: true,
      priceSnapshot: true,
      currencySnapshot: true,
      pageUrl: true,
      status: true,
      notes: true,
      productId: true,
      offerId: true,
      variantId: true,
    },
  });

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Compra assistida</p>
          <h1>Atendimentos</h1>
          <p>Solicitações para produtos de alto valor, com dados acessíveis apenas no admin.</p>
        </div>
        <Headphones className="text-brand" size={24} />
      </div>

      <section className="admin-panel">
        <div className="mb-4">
          <h2>Solicitações recentes</h2>
          <p className="mt-1 text-sm text-muted">Exibindo no máximo as 100 solicitações mais recentes.</p>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Produto</th>
                <th>Variante</th>
                <th>Preço</th>
                <th>Status</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="whitespace-nowrap">{formatDate(request.createdAt)}</td>
                  <td className="font-bold text-ink">{request.customerName}</td>
                  <td className="whitespace-nowrap">{request.phone}</td>
                  <td>{request.email ?? "—"}</td>
                  <td className="max-w-64">{request.productTitleSnapshot}</td>
                  <td>{request.variantLabelSnapshot ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatMoney(request.priceSnapshot, request.currencySnapshot)}</td>
                  <td>
                    <form action={updateAssistedPurchaseStatusAction} className="flex min-w-48 items-center gap-2">
                      <input type="hidden" name="id" value={request.id} />
                      <label className="sr-only" htmlFor={`status-${request.id}`}>Status do atendimento</label>
                      <select
                        id={`status-${request.id}`}
                        name="status"
                        defaultValue={request.status}
                        className="min-w-0 rounded-sm border border-border bg-white px-2 py-2 text-xs text-ink"
                      >
                        {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                      <button className="button-secondary min-h-0 px-3 py-2 text-xs" type="submit">Salvar</button>
                    </form>
                  </td>
                  <td>
                    <details className="admin-request-details">
                      <summary>Ver tudo</summary>
                      <dl>
                        <div><dt>Mercado</dt><dd>{request.market}</dd></div>
                        <div><dt>Consentimento</dt><dd>{request.consent ? "Aceito" : "Não aceito"}</dd></div>
                        <div><dt>Produto ID</dt><dd>{request.productId}</dd></div>
                        <div><dt>Oferta ID</dt><dd>{request.offerId}</dd></div>
                        <div><dt>Variante ID</dt><dd>{request.variantId ?? "—"}</dd></div>
                        <div><dt>Atualizado em</dt><dd>{formatDate(request.updatedAt)}</dd></div>
                        <div><dt>Notas</dt><dd>{request.notes ?? "—"}</dd></div>
                      </dl>
                      {request.pageUrl && (
                        <a href={request.pageUrl} target="_blank" rel="noopener noreferrer" className="text-link mt-3 inline-flex items-center gap-1">
                          Abrir produto <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhuma solicitação de atendimento registrada.</p>}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: (typeof statuses)[number]) {
  return {
    NEW: "Novo",
    CONTACTED: "Contatado",
    WON: "Ganho",
    LOST: "Perdido",
  }[status];
}
