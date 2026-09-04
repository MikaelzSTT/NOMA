import { Plus, Save, ShieldCheck } from "lucide-react";
import { saveSupplierAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { MARKET_CONFIG, MARKETS } from "@/lib/market";
import { SHIPPING_STRATEGIES, type ShippingStrategyCode } from "@/lib/shipping/types";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SuppliersPage({ searchParams }: Props) {
  await requireAdmin();
  const raw = await searchParams;
  const suppliers = await db.supplier.findMany({ include: { _count: { select: { offers: true, mappingTemplates: true } } }, orderBy: { name: "asc" } });
  return <div className="admin-page"><div className="admin-heading"><div><p className="eyebrow">Integrações</p><h1>Fornecedores</h1><p>Cadastre fontes para planilhas e associe adapters reais quando disponíveis.</p></div></div>
    {raw.saved === "ok" && <div className="admin-alert success">Fornecedor salvo.</div>}
    {raw.saved === "error" && <div className="admin-alert error">Revise os campos do fornecedor.</div>}
    {raw.saved === "invalid-json" && <div className="admin-alert error">Configuração e credenciais precisam ser objetos JSON válidos.</div>}
    <details className="admin-panel" open={suppliers.length === 0}><summary className="flex cursor-pointer list-none items-center gap-2 font-bold"><Plus size={18} /> Novo fornecedor</summary><SupplierForm /></details>
    <div className="mt-6 grid gap-4 xl:grid-cols-2">{suppliers.map((supplier) => <details className="admin-panel" key={supplier.id} open={raw.id === supplier.id}><summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-4"><div><h2>{supplier.name}</h2><p className="mt-1 text-sm text-muted">{supplier.adapterKey} · {supplier._count.offers} oferta(s) · {supplier._count.mappingTemplates} template(s) · {supplier.supportedMarkets.join(", ")}</p><p className="mt-1 text-sm text-muted">Frete: {shippingStrategyLabel(supplier.shippingStrategy as ShippingStrategyCode)} · {shippingStatusLabel(supplier)}</p></div><span className={`status-pill ${supplier.active ? "active" : "inactive"}`}>{supplier.active ? "Ativo" : "Inativo"}</span></div></summary><SupplierForm supplier={supplier} /></details>)}</div>
  </div>;
}

function SupplierForm({ supplier }: { supplier?: Awaited<ReturnType<typeof db.supplier.findFirst>> }) {
  return <form action={saveSupplierAction} className="mt-5 space-y-4 border-t border-border pt-5">{supplier && <input type="hidden" name="id" value={supplier.id} />}
    <div className="grid gap-4 sm:grid-cols-2"><label className="admin-field">Nome<input name="name" required defaultValue={supplier?.name ?? ""} /></label><label className="admin-field">Chave do adapter<input name="adapterKey" required pattern="[a-z0-9][a-z0-9-]*" defaultValue={supplier?.adapterKey ?? ""} placeholder="distribuidor-x" /></label></div>
    <label className="admin-field">URL base (opcional)<input name="baseUrl" type="url" defaultValue={supplier?.baseUrl ?? ""} /></label>
    <fieldset>
      <legend className="mb-2 text-xs font-bold uppercase text-muted">Mercados suportados</legend>
      <div className="flex flex-wrap gap-4">{MARKETS.map((market) => <label className="check-row" key={market}><input name="supportedMarkets" type="checkbox" value={market} defaultChecked={supplier?.supportedMarkets?.includes(market) ?? market === "BR"} />{MARKET_CONFIG[market].label}</label>)}</div>
    </fieldset>
    <label className="admin-field">Configuração não sensível (JSON)<textarea name="settings" rows={4} defaultValue={supplier?.settings ? JSON.stringify(supplier.settings, null, 2) : "{}"} /></label>
    <fieldset className="rounded-sm border border-border p-4">
      <legend className="px-1 text-xs font-bold uppercase text-muted">Frete</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="admin-field">Estratégia de frete<select name="shippingStrategy" defaultValue={supplier?.shippingStrategy ?? "MANUAL"}>{SHIPPING_STRATEGIES.map((strategy) => <option key={strategy} value={strategy}>{shippingStrategyLabel(strategy)}</option>)}</select></label>
        <label className="admin-field">CEP de origem<input name="shippingOriginPostalCode" inputMode="numeric" defaultValue={supplier?.shippingOriginPostalCode ?? ""} placeholder="00000-000" /></label>
      </div>
      <label className="admin-field mt-4">Configuração de frete não sensível (JSON)<textarea name="shippingConfig" rows={4} defaultValue={supplier?.shippingConfig ? JSON.stringify(supplier.shippingConfig, null, 2) : "{}"} /></label>
      <div className="mt-4 flex flex-wrap gap-6"><label className="check-row"><input name="shippingActive" type="checkbox" value="true" defaultChecked={supplier?.shippingActive ?? false} />Frete ativo</label><label className="check-row"><input name="shippingCheckoutEnabled" type="checkbox" value="true" defaultChecked={supplier?.shippingCheckoutEnabled ?? false} />Checkout automático disponível</label></div>
      <p className="mt-3 text-sm text-muted">{shippingStatusLabel(supplier)}</p>
    </fieldset>
    <label className="admin-field">Novas credenciais (JSON)<textarea name="credentials" rows={3} defaultValue="{}" placeholder={'{"apiKey":"..."}'} /><small className="font-normal text-muted">Nunca exibimos o valor salvo. Deixe {'{}'} para manter as credenciais atuais.</small></label>
    <div className="flex flex-wrap gap-6"><label className="check-row"><input name="active" type="checkbox" value="true" defaultChecked={supplier?.active ?? true} />Fornecedor ativo</label><label className="check-row"><input name="authorized" type="checkbox" value="true" defaultChecked={supplier?.authorized ?? false} /><ShieldCheck size={16} />Fonte autorizada</label></div>
    <button className="button-primary"><Save size={17} /> Salvar fornecedor</button>
  </form>;
}

function shippingStrategyLabel(strategy: ShippingStrategyCode) {
  const labels: Record<ShippingStrategyCode, string> = {
    SUPPLIER_API: "API do fornecedor",
    CARRIER_API: "API de transportadora",
    TABLE: "Tabela",
    FIXED: "Fixo",
    MANUAL: "Manual",
    DISABLED: "Desativado",
  };
  return labels[strategy];
}

function shippingStatusLabel(supplier?: { shippingStrategy?: string; shippingActive?: boolean; shippingCheckoutEnabled?: boolean } | null) {
  if (!supplier || supplier.shippingStrategy === "MANUAL") return "compra assistida obrigatória";
  if (supplier.shippingStrategy === "DISABLED" || !supplier.shippingActive) return "frete automático inativo";
  if (!supplier.shippingCheckoutEnabled) return "checkout automático desativado";
  return "checkout automático disponível";
}
