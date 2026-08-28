import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default async function AdminLogsPage() {
  await requireAdmin();
  const logs = await db.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 100 });
  return (
    <div className="admin-page">
      <div className="admin-heading"><div><p className="eyebrow">Observabilidade</p><h1>Logs de sincronizacao</h1><p>Ultimas 100 execucoes, sem tokens, cookies ou credenciais.</p></div></div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Horario</th><th>Provider</th><th>Operacao</th><th>Status</th><th>Processados</th><th>Sucessos</th><th>Erros</th><th>Duracao</th></tr></thead>
          <tbody>{logs.map((log) => <tr key={log.id}><td className="whitespace-nowrap">{formatDate(log.startedAt)}</td><td>{log.provider}</td><td>{log.operation}</td><td><Status value={log.status} /></td><td>{log.processedCount}</td><td>{log.successCount}</td><td>{log.errorCount}</td><td>{log.durationMs == null ? "Em andamento" : `${(log.durationMs / 1000).toFixed(1)}s`}</td></tr>)}</tbody>
        </table>
        {logs.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum log registrado.</p>}
      </div>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const ok = value === "SUCCESS";
  const running = value === "RUNNING";
  const Icon = running ? Clock3 : ok ? CheckCircle2 : AlertCircle;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${ok ? "text-brand" : running ? "text-muted" : "text-red-700"}`}><Icon size={14} />{value}</span>;
}
