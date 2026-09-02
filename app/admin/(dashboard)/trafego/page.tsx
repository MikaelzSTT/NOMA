import { CalendarDays, Clock3, MousePointerClick, Tags, TrendingUp } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { summarizeTrafficSources, summarizeUtmCampaigns, trafficSourceLabel } from "@/lib/noma-traffic";

export default async function AdminTrafficPage() {
  await requireAdmin();
  const now = new Date();
  const today = startOfLocalDay(now);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [visitsToday, visitsLast7Days, gclidLast7Days, recentVisits, attributionVisits] = await Promise.all([
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
  ]);

  const sources = summarizeTrafficSources(attributionVisits);
  const campaigns = summarizeUtmCampaigns(attributionVisits);
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
          <h1>Visitas da landing</h1>
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
            <h2>Visitas recentes</h2>
            <p className="mt-1 text-sm text-muted">Ultimas 50 visitas deduplicadas da landing de maintenance.</p>
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

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
