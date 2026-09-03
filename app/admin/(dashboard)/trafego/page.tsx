import { CalendarDays, Clock3, MousePointerClick, ShoppingCart, Tags, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  aggregateProductIntentEvents,
  buildTrafficFunnel,
  purchaseIntentSourceLabel,
  summarizeTrafficSources,
  summarizeUtmCampaigns,
  trafficSourceLabel,
} from "@/lib/noma-traffic";

export default async function AdminTrafficPage() {
  await requireAdmin();
  const now = new Date();
  const today = startOfLocalDay(now);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [visitsToday, visitsLast7Days, gclidLast7Days, recentVisits, attributionVisits, recentIntentEvents, funnelIntentEvents] = await Promise.all([
    db.nomaTrafficVisit.count({ where: { visitedAt: { gte: today } } }),
    db.nomaTrafficVisit.count({ where: { visitedAt: { gte: last7Days } } }),
    db.nomaTrafficVisit.count({ where: { visitedAt: { gte: last7Days }, gclid: { not: null } } }),
    db.nomaTrafficVisit.findMany({
      orderBy: { visitedAt: "desc" },
      take: 50,
      select: {
        id: true,
        visitedAt: true,
        market: true,
        pathname: true,
        referrer: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        gclid: true,
        userAgentSummary: true,
      },
    }),
    db.nomaTrafficVisit.findMany({
      where: { visitedAt: { gte: last7Days } },
      orderBy: { visitedAt: "desc" },
      select: { visitedAt: true, referrer: true, utmSource: true, utmCampaign: true },
    }),
    db.nomaPurchaseIntentEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: {
        id: true,
        occurredAt: true,
        eventType: true,
        market: true,
        productTitle: true,
        productSlug: true,
        variantLabel: true,
        displayedPrice: true,
        currency: true,
        referrer: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    }),
    db.nomaPurchaseIntentEvent.findMany({
      where: { occurredAt: { gte: last7Days } },
      orderBy: { occurredAt: "desc" },
      select: {
        eventType: true,
        market: true,
        productOfferId: true,
        productTitle: true,
      },
    }),
  ]);

  const sources = summarizeTrafficSources(attributionVisits);
  const campaigns = summarizeUtmCampaigns(attributionVisits);
  const funnel = buildTrafficFunnel({ visits: visitsLast7Days, events: funnelIntentEvents });
  const productIntentRows = aggregateProductIntentEvents(funnelIntentEvents).slice(0, 50);
  const cards = [
    { label: "Visitas hoje", value: visitsToday, icon: CalendarDays },
    { label: "Visitas últimos 7 dias", value: visitsLast7Days, icon: TrendingUp },
    { label: "Com gclid em 7 dias", value: gclidLast7Days, icon: MousePointerClick },
    { label: "Campanhas UTM em 7 dias", value: campaigns.filter((item) => item.label !== "Sem UTM").length, icon: Tags },
  ];

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Trafego proprio</p>
          <h1>Visitas da loja</h1>
          <p>Dados gravados pela NOMA a partir das requisicoes recebidas, independentes de GA4 e Google Ads.</p>
        </div>
      </div>

      <div className="admin-stat-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="admin-stat">
            <span><Icon size={18} /></span>
            <div><strong>{value.toLocaleString("pt-BR")}</strong><p>{label}</p></div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <BreakdownPanel title="Origem das visitas" rows={sources} empty="Nenhuma origem registrada nos últimos 7 dias." />
        <BreakdownPanel title="Campanhas UTM" rows={campaigns} empty="Nenhuma campanha registrada nos últimos 7 dias." />
      </div>

      <section className="admin-panel mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2>Funil</h2>
            <p className="mt-1 text-sm text-muted">Eventos proprios de intencao de compra nos ultimos 7 dias.</p>
          </div>
          <ShoppingCart className="text-brand" size={20} />
        </div>
        <div className="admin-stat-grid">
          <FunnelMetric label="Visitas" value={funnel.visits} />
          <FunnelMetric label="Visualizacoes de produto" value={funnel.productViews} />
          <FunnelMetric label="Cliques em comprar" value={funnel.buyClicks} />
          <FunnelMetric label="Adicionar ao carrinho" value={funnel.addToCart} />
          <FunnelMetric label="Inicio de checkout" value={funnel.checkoutStart} />
          <FunnelMetric label="Compra assistida" value={funnel.assistedPurchaseClicks} />
          <FunnelMetric label="Visita -> produto" value={formatPercent(funnel.visitToProductRate)} />
          <FunnelMetric label="Produto -> comprar" value={formatPercent(funnel.productToBuyClickRate)} />
          <FunnelMetric label="Comprar -> checkout" value={formatPercent(funnel.buyClickToCheckoutRate)} />
        </div>
      </section>

      <section className="admin-panel mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2>Eventos recentes</h2>
            <p className="mt-1 text-sm text-muted">Ultimos 50 eventos proprios de produto e intencao de compra.</p>
          </div>
          <Clock3 className="text-brand" size={20} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Horario</th>
                <th>Evento</th>
                <th>Mercado</th>
                <th>Produto</th>
                <th>Variante</th>
                <th>Valor</th>
                <th>Origem/campanha</th>
              </tr>
            </thead>
            <tbody>
              {recentIntentEvents.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap">{formatDate(event.occurredAt)}</td>
                  <td>{eventLabel(event.eventType)}</td>
                  <td>{event.market}</td>
                  <td className="max-w-56 truncate">{event.productTitle || event.productSlug}</td>
                  <td>{event.variantLabel ?? "-"}</td>
                  <td>{event.displayedPrice == null ? "-" : formatMoney(event.displayedPrice, event.currency ?? undefined)}</td>
                  <td>{intentAttributionLabel(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentIntentEvents.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum evento registrado.</p>}
        </div>
      </section>

      <section className="admin-panel mt-6">
        <div className="mb-4">
          <h2>Intencao por produto</h2>
          <p className="mt-1 text-sm text-muted">Agregacao por produto e mercado nos ultimos 7 dias.</p>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Mercado</th>
                <th>Visualizacoes</th>
                <th>Cliques em comprar</th>
                <th>Checkout start</th>
                <th>Taxa de intencao</th>
              </tr>
            </thead>
            <tbody>
              {productIntentRows.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-72 truncate">{row.product}</td>
                  <td>{row.market}</td>
                  <td>{row.productViews.toLocaleString("pt-BR")}</td>
                  <td>{row.buyClicks.toLocaleString("pt-BR")}</td>
                  <td>{row.checkoutStart.toLocaleString("pt-BR")}</td>
                  <td>{formatPercent(row.purchaseIntentRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {productIntentRows.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum produto com evento registrado.</p>}
        </div>
      </section>

      <section className="admin-panel mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2>Visitas recentes</h2>
            <p className="mt-1 text-sm text-muted">Ultimas 50 visitas deduplicadas da loja publica e da landing de maintenance.</p>
          </div>
          <Clock3 className="text-brand" size={20} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Horario</th>
                <th>Mercado</th>
                <th>Pathname</th>
                <th>Origem</th>
                <th>UTM</th>
                <th>gclid</th>
                <th>User agent</th>
              </tr>
            </thead>
            <tbody>
              {recentVisits.map((visit) => (
                <tr key={visit.id}>
                  <td className="whitespace-nowrap">{formatDate(visit.visitedAt)}</td>
                  <td>{visit.market}</td>
                  <td className="max-w-56 truncate">{visit.pathname}</td>
                  <td>{trafficSourceLabel(visit)}</td>
                  <td>{utmLabel(visit)}</td>
                  <td>{visit.gclid ? "Sim" : "Nao"}</td>
                  <td>{visit.userAgentSummary ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentVisits.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhuma visita registrada.</p>}
        </div>
      </section>
    </div>
  );
}

function FunnelMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="admin-stat">
      <div><strong>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</strong><p>{label}</p></div>
    </div>
  );
}

function BreakdownPanel({ title, rows, empty }: { title: string; rows: Array<{ label: string; count: number }>; empty: string }) {
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => <MetricBar key={row.label} row={row} max={rows[0]?.count ?? 1} />)}
        {rows.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      </div>
    </section>
  );
}

function MetricBar({ row, max }: { row: { label: string; count: number }; max: number }) {
  const width = `${Math.max(8, Math.round((row.count / max) * 100))}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-bold text-ink">{row.label}</span>
        <span className="text-muted">{row.count.toLocaleString("pt-BR")}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-surface">
        <div className="h-full bg-brand" style={{ width }} />
      </div>
    </div>
  );
}

function utmLabel(visit: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }) {
  const values = [visit.utmSource, visit.utmMedium, visit.utmCampaign].filter(Boolean);
  return values.length > 0 ? values.join(" / ") : "-";
}

function intentAttributionLabel(event: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
}) {
  const source = purchaseIntentSourceLabel(event);
  const campaign = [event.utmMedium, event.utmCampaign].filter(Boolean).join(" / ");
  return campaign ? `${source} / ${campaign}` : source;
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    product_view: "Product view",
    buy_click: "Comprar",
    add_to_cart: "Adicionar ao carrinho",
    checkout_start: "Inicio de checkout",
    assisted_purchase_click: "Compra assistida",
  };
  return labels[eventType] ?? eventType;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
