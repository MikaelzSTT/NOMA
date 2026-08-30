"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckSquare, FileSpreadsheet, Link2, ListChecks, ListPlus, LoaderCircle, Upload } from "lucide-react";
import { MARKET_CONFIG, MARKETS, type Market } from "@/lib/market";

type SupplierOption = { id: string; name: string; supportedMarkets: Market[] };
type Mapping = Record<string, string>;
type Template = { id: string; name: string; supplierId: string; columnMapping: Mapping };
type FilePreview = { type: "CSV" | "XLSX"; columns: string[]; rows: Array<Record<string, unknown>>; totalRows: number; suggestedMapping: Mapping };
type EditableProduct = {
  supplierProductId: string; sku: string; title: string; description?: string; shortDescription?: string;
  category: string; categorySlug?: string; subcategory?: string; brand?: string;
  images: Array<{ url: string; alt?: string; isPrimary?: boolean }>;
  costPrice?: number; sellingPrice?: number; compareAtPrice?: number; currency: string; stock: number;
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "PREORDER" | "UNKNOWN" | "REMOVED";
  shippingCost?: number; estimatedDelivery?: string; sourceUrl?: string;
  variants: Array<{ supplierVariantId?: string; sku: string; title: string; options: Record<string, string>; costPrice?: number; sellingPrice?: number; stock: number; active?: boolean }>;
  attributes: Record<string, string | number | boolean>; active: boolean; featured: boolean;
};
type Job = {
  id: string; status: string; totalItems: number; processedItems: number; successItems: number; errorItems: number;
  items?: Array<{ id: string; sourceRef: string | null; status: string; error: string | null; normalizedData?: unknown; product?: { slug: string; title: string } | null }>;
};
type DiscoveredProduct = {
  supplierProductId?: string; sku?: string; title: string; productUrl: string; imageUrl?: string; costPrice?: number; sellingPrice?: number; stock?: number; availability?: string;
};

const fieldLabels: Record<string, string> = {
  supplierProductId: "ID no fornecedor", sku: "SKU", title: "Título", description: "Descrição",
  shortDescription: "Descrição curta", category: "Categoria", subcategory: "Subcategoria", brand: "Marca",
  images: "Imagens", costPrice: "Custo do fornecedor", sellingPrice: "Preço de venda", compareAtPrice: "Preço comparativo",
  currency: "Moeda", stock: "Estoque", availability: "Disponibilidade", shippingCost: "Custo de frete",
  estimatedDelivery: "Prazo de entrega", sourceUrl: "URL de origem", variants: "Variantes (JSON)", attributes: "Atributos (JSON)", active: "Ativo", featured: "Destaque",
};

export function ImportWorkspace({ suppliers, templates, recentJobs }: { suppliers: SupplierOption[]; templates: Template[]; recentJobs: Job[] }) {
  const [market, setMarket] = useState<Market>("BR");
  const marketSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.supportedMarkets.includes(market)), [market, suppliers]);
  const [supplierId, setSupplierId] = useState(marketSuppliers[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [templateName, setTemplateName] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchUrls, setBatchUrls] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [previewProducts, setPreviewProducts] = useState<Record<string, EditableProduct>>({});
  const [batchMessage, setBatchMessage] = useState("");
  const [categoryUrl, setCategoryUrl] = useState("");
  const [maxPages, setMaxPages] = useState(3);
  const [categoryProducts, setCategoryProducts] = useState<DiscoveredProduct[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Record<string, boolean>>({});
  const [categoryMessage, setCategoryMessage] = useState("");
  const availableTemplates = useMemo(() => templates.filter((template) => template.supplierId === supplierId), [supplierId, templates]);

  function selectMarket(nextMarket: Market) {
    setMarket(nextMarket);
    const nextSupplier = suppliers.find((supplier) => supplier.supportedMarkets.includes(nextMarket));
    setSupplierId(nextSupplier?.id ?? "");
  }

  async function previewFile() {
    if (!file) return setFileMessage("Selecione um arquivo.");
    setBusy(true); setFileMessage("");
    const form = new FormData(); form.set("file", file);
    const response = await fetch("/api/admin/import/file/preview", { method: "POST", body: form });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setFileMessage(body.error ?? "Falha ao ler arquivo.");
    setFilePreview(body); setMapping(body.suggestedMapping); setFileMessage(`${body.totalRows} linha(s) encontrada(s). Revise o mapeamento.`);
  }

  async function importFile() {
    if (!file || !filePreview || !supplierId) return;
    setBusy(true); setFileMessage("");
    const form = new FormData();
    form.set("file", file); form.set("supplierId", supplierId); form.set("market", market); form.set("mapping", JSON.stringify(mapping)); form.set("templateName", templateName);
    const response = await fetch("/api/admin/import/file/commit", { method: "POST", body: form });
    const body = await response.json(); setBusy(false);
    setFileMessage(response.ok ? `Importação concluída: ${body.succeeded} sucesso(s), ${body.failed} erro(s).` : body.error ?? "Falha na importação.");
  }

  async function createBatch(urls: string[], sourceName = "Lista de URLs") {
    setBusy(true); setBatchMessage(""); setJob(null); setPreviewProducts({});
    const response = await fetch("/api/admin/import/url-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, sourceName, market }),
    });
    const body = await response.json();
    if (!response.ok) { setBusy(false); setBatchMessage(body.error ?? "Falha ao criar fila."); return; }
    const first = await fetch(`/api/admin/import/jobs/${body.id}`).then((result) => result.json());
    setJob(first); setBusy(false);
    await processBatch(body.id, first);
  }

  async function createBatchFromTextarea() {
    const urls = batchUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    await createBatch(urls, "Lista de URLs");
  }

  async function processBatch(id: string, initial: Job) {
    let current = initial;
    while (current.processedItems < current.totalItems && ["PENDING", "IMPORTING"].includes(current.status)) {
      const response = await fetch(`/api/admin/import/jobs/${id}/process`, { method: "POST" });
      current = await response.json(); setJob(current); hydratePreviewProducts(current);
      if (!response.ok) break;
    }
    hydratePreviewProducts(current);
    setBatchMessage(current.status === "PREVIEW" ? "Extração concluída. Revise e confirme os produtos antes de salvar." : "Fila processada.");
  }

  async function confirmJobPreviews() {
    if (!job) return;
    const items = Object.entries(previewProducts).map(([itemId, product]) => ({ itemId, product }));
    if (items.length === 0) return setBatchMessage("Nenhum preview disponível para salvar.");
    setBusy(true); setBatchMessage("");
    const response = await fetch(`/api/admin/import/jobs/${job.id}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setBatchMessage(body.error ?? "Falha ao salvar previews.");
    setJob(body.job); hydratePreviewProducts(body.job);
    setBatchMessage(`${body.savedProducts.length} produto(s) salvo(s).`);
  }

  async function discoverCategory() {
    setBusy(true); setCategoryMessage(""); setCategoryProducts([]); setSelectedUrls({});
    const response = await fetch("/api/admin/import/category/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: categoryUrl, maxPages, market }),
    });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setCategoryMessage(body.error ?? "Categoria não suportada.");
    setCategoryProducts(body.products);
    setSelectedUrls(Object.fromEntries(body.products.map((product: DiscoveredProduct) => [product.productUrl, true])));
    const warning = body.warnings?.length ? ` ${body.warnings.join(" ")}` : "";
    setCategoryMessage(`${body.products.length} produto(s) encontrado(s) em ${body.supplier.name}.${warning}`);
  }

  async function importSelectedCategoryProducts() {
    const urls = categoryProducts.filter((product) => selectedUrls[product.productUrl]).map((product) => product.productUrl);
    if (urls.length === 0) return setCategoryMessage("Marque ao menos um produto.");
    setCategoryMessage("");
    await createBatch(urls, `Categoria: ${categoryUrl}`);
  }

  function hydratePreviewProducts(current: Job) {
    const products = Object.fromEntries((current.items ?? [])
      .filter((item) => item.status === "PREVIEW")
      .map((item) => [item.id, coercePreviewProduct(item.normalizedData)])
      .filter((entry): entry is [string, EditableProduct] => Boolean(entry[1])));
    setPreviewProducts(products);
  }

  function patchPreviewProduct(itemId: string, product: EditableProduct) {
    setPreviewProducts((current) => ({ ...current, [itemId]: product }));
  }

  return (
    <div className="space-y-6">
      <section className="admin-panel">
        <label className="admin-field max-w-sm">Mercado de destino<select value={market} onChange={(event) => selectMarket(event.target.value as Market)}>{MARKETS.map((item) => <option key={item} value={item}>{MARKET_CONFIG[item].label}</option>)}</select></label>
        {marketSuppliers.length === 0 && <p className="mt-3 text-sm text-red-700">Nenhum fornecedor ativo suporta este mercado.</p>}
      </section>

      <section className="admin-panel">
        <div className="mb-5 flex items-start gap-3"><ListPlus className="text-brand" /><div><h2>A. Importar várias URLs</h2><p className="text-sm text-muted">Uma URL por linha. A fila persiste e cada item vira preview antes de salvar no catálogo.</p></div></div>
        <textarea className="w-full" rows={6} value={batchUrls} onChange={(event) => setBatchUrls(event.target.value)} placeholder={"https://fornecedor.example/produto-1\nhttps://fornecedor.example/produto-2"} />
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="button-secondary" type="button" disabled={busy || !batchUrls.trim()} onClick={createBatchFromTextarea}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Link2 size={17} />} Extrair previews</button>
          {Object.keys(previewProducts).length > 0 && <button className="button-primary" type="button" disabled={busy} onClick={confirmJobPreviews}><CheckSquare size={17} /> Confirmar e salvar previews</button>}
        </div>
        {batchMessage && <p className="mt-3 text-sm text-muted">{batchMessage}</p>}
        {job && <JobStatus job={job} />}
        {job?.items?.filter((item) => item.status === "PREVIEW").map((item) => previewProducts[item.id] && (
          <ProductPreviewEditor key={item.id} product={previewProducts[item.id]} onChange={(product) => patchPreviewProduct(item.id, product)} heading={item.sourceRef ?? item.id} />
        ))}
        {!job && recentJobs.length > 0 && <div className="mt-5 border-t border-border pt-4"><p className="mb-2 text-xs font-bold uppercase text-muted">Filas recentes</p>{recentJobs.map((item) => <div key={item.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{item.id.slice(-8)}</span><span>{item.status} · {item.processedItems}/{item.totalItems}</span></div>)}</div>}
      </section>

      <section className="admin-panel">
        <div className="mb-5 flex items-start gap-3"><ListChecks className="text-brand" /><div><h2>B. Importar página de categoria</h2><p className="text-sm text-muted">Cole uma listagem de fornecedor suportado. O adapter descobre produtos e pagina quando permitido.</p></div></div>
        <div className="grid items-end gap-3 lg:grid-cols-[1fr_9rem_auto]">
          <label className="admin-field">URL da categoria<input value={categoryUrl} onChange={(event) => setCategoryUrl(event.target.value)} placeholder="https://fornecedor.example/categoria/..." /></label>
          <NumberField label="Páginas" value={maxPages} integer onChange={(value) => setMaxPages(value ?? 1)} />
          <button className="button-secondary" type="button" disabled={busy || !categoryUrl} onClick={discoverCategory}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <ListChecks size={17} />} Descobrir</button>
        </div>
        {categoryMessage && <p className="mt-3 text-sm text-muted">{categoryMessage}</p>}
        {categoryProducts.length > 0 && <>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categoryProducts.map((product) => (
              <label key={product.productUrl} className="grid cursor-pointer grid-cols-[auto_4rem_1fr] gap-3 rounded-md border border-border p-3 text-sm">
                <input type="checkbox" checked={Boolean(selectedUrls[product.productUrl])} onChange={(event) => setSelectedUrls((current) => ({ ...current, [product.productUrl]: event.target.checked }))} />
                <div className="aspect-square overflow-hidden rounded bg-surface bg-cover bg-center" style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined} />
                <span className="min-w-0"><strong className="block truncate text-ink">{product.title}</strong><small className="block truncate text-muted">{product.sku ?? product.supplierProductId ?? product.productUrl}</small><small className="block text-muted">{product.stock ?? "?"} em estoque</small></span>
              </label>
            ))}
          </div>
          <button className="button-primary mt-4" type="button" disabled={busy} onClick={importSelectedCategoryProducts}><Upload size={17} /> Extrair selecionados para preview</button>
        </>}
      </section>

      <section className="admin-panel">
        <div className="mb-5 flex items-start gap-3"><FileSpreadsheet className="text-brand" /><div><h2>C. CSV / XLSX</h2><p className="text-sm text-muted">Use preferencialmente quando o fornecedor disponibilizar catálogo em planilha.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="admin-field">Fornecedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecione</option>{marketSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="admin-field">Arquivo<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFilePreview(null); }} /></label>
        </div>
        <button className="button-secondary mt-4" type="button" disabled={busy || !file} onClick={previewFile}>{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />} Ler colunas</button>
        {fileMessage && <p className="mt-3 text-sm text-muted">{fileMessage}</p>}
        {filePreview && <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filePreview.columns.map((column) => <label className="admin-field" key={column}>{column}<select value={mapping[column] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [column]: event.target.value }))}><option value="">Ignorar coluna</option>{Object.entries(fieldLabels).map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label>)}</div>
          {availableTemplates.length > 0 && <label className="admin-field mt-4 max-w-md">Usar template salvo<select defaultValue="" onChange={(event) => { const template = templates.find((item) => item.id === event.target.value); if (template) setMapping(Object.fromEntries(filePreview.columns.map((column) => [column, template.columnMapping[column] ?? ""]))); }}><option value="">Selecione</option>{availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}
          <PreviewTable preview={filePreview} mapping={mapping} />
          <div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_auto]"><label className="admin-field">Salvar/regravar como template (opcional)<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Ex.: Planilha mensal fornecedor X" /></label><button className="button-primary" type="button" disabled={busy || !supplierId} onClick={importFile}>Importar {filePreview.totalRows} produto(s)</button></div>
        </>}
      </section>
    </div>
  );
}

function ProductPreviewEditor({ product, heading, onChange }: { product: EditableProduct; heading: string; onChange: (product: EditableProduct) => void }) {
  const markup = product.costPrice && product.sellingPrice ? round(product.sellingPrice / product.costPrice, 4) : undefined;
  const margin = product.costPrice && product.sellingPrice ? round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100, 2) : undefined;
  const patch = <K extends keyof EditableProduct>(key: K, value: EditableProduct[K]) => onChange({ ...product, [key]: value });
  return <div className="mt-6 space-y-4 border-t border-border pt-5">
    <p className="truncate text-xs font-bold uppercase text-muted">Preview · {heading}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField label="Título" value={product.title} onChange={(value) => patch("title", value)} />
      <TextField label="Categoria" value={product.category} onChange={(value) => patch("category", value)} />
      <TextField label="Subcategoria" value={product.subcategory ?? ""} onChange={(value) => patch("subcategory", value)} />
      <TextField label="Marca" value={product.brand ?? ""} onChange={(value) => patch("brand", value)} />
      <NumberField label="Custo do fornecedor" value={product.costPrice} onChange={(value) => patch("costPrice", value)} />
      <NumberField label="Markup" value={markup} onChange={(value) => patch("sellingPrice", product.costPrice != null && value != null ? round(product.costPrice * value, 2) : product.sellingPrice)} />
      <NumberField label="Margem (%)" value={margin} onChange={(value) => patch("sellingPrice", product.costPrice != null && value != null && value < 100 ? round(product.costPrice / (1 - value / 100), 2) : product.sellingPrice)} />
      <NumberField label="Preço final" value={product.sellingPrice} onChange={(value) => patch("sellingPrice", value)} />
      <NumberField label="Estoque" value={product.stock} integer onChange={(value) => patch("stock", value ?? 0)} />
    </div>
    <label className="admin-field">Descrição<textarea rows={4} value={product.description ?? ""} onChange={(event) => patch("description", event.target.value)} /></label>
    <label className="admin-field">Imagens (uma URL por linha)<textarea rows={4} value={product.images.map((image) => image.url).join("\n")} onChange={(event) => patch("images", event.target.value.split(/\r?\n/).map((imageUrl) => imageUrl.trim()).filter(Boolean).map((imageUrl, index) => ({ url: imageUrl, isPrimary: index === 0 })))} /></label>
  </div>;
}

function PreviewTable({ preview, mapping }: { preview: FilePreview; mapping: Mapping }) {
  const visible = preview.columns.filter((column) => mapping[column]);
  if (!visible.length) return null;
  return <div className="admin-table-wrap mt-6"><table className="admin-table"><thead><tr>{visible.map((column) => <th key={column}>{fieldLabels[mapping[column]!] ?? mapping[column]}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 5).map((row, index) => <tr key={index}>{visible.map((column) => <td key={column} className="max-w-56 truncate">{String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}

function JobStatus({ job }: { job: Job }) {
  return <div className="mt-5 border-t border-border pt-4"><div className="flex items-center justify-between"><strong>Fila {job.status}</strong><span className="text-sm text-muted">{job.processedItems}/{job.totalItems} · {job.successItems} sucesso(s) · {job.errorItems} erro(s)</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface"><div className="h-full bg-brand transition-all" style={{ width: `${job.totalItems ? (job.processedItems / job.totalItems) * 100 : 0}%` }} /></div>{job.items && <div className="mt-4 max-h-80 overflow-auto">{job.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border py-2 text-xs"><span className="truncate">{item.product ? <Link className="font-bold text-brand" href={`/admin/produtos?query=${encodeURIComponent(item.product.title)}`}>{item.product.title}</Link> : item.sourceRef}</span><span>{item.status}</span>{item.error && <small className="col-span-2 text-red-700">{item.error}</small>}</div>)}</div>}</div>;
}

function coercePreviewProduct(value: unknown): EditableProduct | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const product = value as EditableProduct;
  return typeof product.title === "string" && typeof product.sku === "string" ? product : null;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="admin-field">{label}<input value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function NumberField({ label, value, integer, onChange }: { label: string; value?: number; integer?: boolean; onChange: (value?: number) => void }) { return <label className="admin-field">{label}<input type="number" min="0" step={integer ? "1" : "0.01"} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></label>; }
function round(value: number, decimals: number) { return Number(value.toFixed(decimals)); }
