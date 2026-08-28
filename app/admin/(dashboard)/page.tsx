import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, Clock3, FolderTree, RefreshCw, Store, XCircle } from "lucide-react";
import { runManualSyncAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminDashboard({ searchParams }: Props) {
  await requireAdmin();
  const raw = await searchParams;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [total, active, unavailable, updatedToday, syncErrors, categories, stores, lastSync, withoutPrice, productsWithError] = await Promise.all([
    db.product.count(),
    db.product.count({ where: { active: true, archivedAt: null } }),
    db.product.count({ where: { availability: { in: ["OUT_OF_STOCK", "REMOVED"] } } }),
    db.product.count({ where: { lastSyncedAt: { gte: today } } }),
    db.syncLog.count({ where: { status: { in: ["FAILED", "PARTIAL"] }, startedAt: { gte: today } } }),
    db.category.count(),
    db.supplier.count({ where: { active: true } }),
    db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    db.product.count({ where: { sellingPrice: null } }),
    db.product.count({ where: { syncError: { not: null } } }),
  ]);
  const cards = [
    { label: "Total de produtos", value: total, icon: Boxes, href: "/admin/produtos" },
    { label: "Produtos ativos", value: active, icon: CheckCircle2, href: "/admin/produtos" },
    { label: "Indisponiveis", value: unavailable, icon: XCircle, href: "/admin/produtos?status=unavailable" },
    { label: "Atualizados hoje", value: updatedToday, icon: Clock3 },
    { label: "Erros de sincronizacao", value: syncErrors, icon: AlertTriangle, href: "/admin/logs" },
    { label: "Produtos com erro", value: productsWithError, icon: AlertTriangle, href: "/admin/produtos?status=error" },
    { label: "Categorias", value: categories, icon: FolderTree },
    { label: "Fornecedores integrados", value: stores, icon: Store },
    { label: "Sem preco", value: withoutPrice, icon: AlertTriangle, href: "/admin/produtos?status=no-price" },
  ];

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div><p className="eyebrow">Dashboard</p><h1>Visao geral</h1><p>Saude do catalogo e das integracoes.</p></div>
        <form action={runManualSyncAction}><button className="button-primary"><RefreshCw size={17} /> Sincronizar agora</button></form>
      </div>
      {raw.sync === "ok" && <div className="admin-alert success">Sincronizacao concluida. {raw.processed} produto(s) processado(s).</div>}
      {raw.sync === "error" && <div className="admin-alert error">A sincronizacao falhou. Consulte os logs para ver o motivo.</div>}
      {raw.sync === "rate-limit" && <div className="admin-alert error">Limite de sincronizacoes manuais atingido. Aguarde um minuto.</div>}
      <div className="admin-stat-grid">
        {cards.map(({ label, value, icon: Icon, href }) => {
          const content = <><span><Icon size={18} /></span><div><strong>{value.toLocaleString("pt-BR")}</strong><p>{label}</p></div></>;
          return href ? <Link key={label} href={href} className="admin-stat hover:border-brand">{content}</Link> : <div key={label} className="admin-stat">{content}</div>;
        })}
      </div>
      <section className="admin-panel mt-6">
        <div className="flex items-center justify-between gap-4"><div><h2>Ultima sincronizacao</h2><p className="mt-1 text-sm text-muted">{lastSync ? `${lastSync.provider} · ${formatDate(lastSync.startedAt)}` : "Nenhuma sincronizacao registrada."}</p></div><Link href="/admin/logs" className="text-link">Ver logs</Link></div>
        {lastSync && <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-4"><Metric label="Status" value={lastSync.status} /><Metric label="Processados" value={lastSync.processedCount} /><Metric label="Sucessos" value={lastSync.successCount} /><Metric label="Erros" value={lastSync.errorCount} /></div>}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs font-bold uppercase text-muted">{label}</p><strong className="mt-1 block text-lg text-ink">{value}</strong></div>;
}
