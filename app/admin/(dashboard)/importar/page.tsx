import type { Prisma } from "@/generated/prisma/client";
import { ImportWorkspace } from "@/components/admin/import-workspace";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminImportPage() {
  await requireAdmin();
  const [suppliers, templates, recentJobs] = await Promise.all([
    db.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.importMappingTemplate.findMany({ select: { id: true, name: true, supplierId: true, columnMapping: true }, orderBy: { updatedAt: "desc" } }),
    db.importJob.findMany({ where: { type: "URL_BATCH" }, select: { id: true, status: true, totalItems: true, processedItems: true, successItems: true, errorItems: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const safeTemplates = templates.map((template) => ({ ...template, columnMapping: asMapping(template.columnMapping) }));
  return <div className="admin-page"><div className="admin-heading"><div><p className="eyebrow">Entrada de catálogo</p><h1>Importar produtos</h1><p>Arquivos, URLs compatíveis e filas usam o mesmo modelo interno.</p></div></div><ImportWorkspace suppliers={suppliers} templates={safeTemplates} recentJobs={recentJobs} /></div>;
}

function asMapping(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")])) : {};
}
