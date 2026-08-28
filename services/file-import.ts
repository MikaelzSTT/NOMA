import "server-only";
import readXlsxFile from "read-excel-file/node";
import type { Prisma, Supplier } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { upsertCatalogProduct } from "@/services/catalog-products";
import type { NormalizedSupplierProduct } from "@/suppliers/types";

export const INTERNAL_IMPORT_FIELDS = [
  "supplierProductId", "sku", "title", "description", "shortDescription",
  "category", "subcategory", "brand", "images", "costPrice", "sellingPrice",
  "compareAtPrice", "currency", "stock", "availability", "shippingCost",
  "estimatedDelivery", "sourceUrl", "variants", "attributes", "active", "featured",
] as const;

export type InternalImportField = typeof INTERNAL_IMPORT_FIELDS[number];
export type ColumnMapping = Record<string, InternalImportField | "">;
export type ImportRow = Record<string, string | number | boolean | null>;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;

export async function parseCatalogFile(file: File) {
  if (file.size > MAX_FILE_SIZE) throw new Error("O arquivo excede o limite de 10 MB.");
  const extension = file.name.toLocaleLowerCase("pt-BR").split(".").at(-1);
  if (!extension || !["csv", "xlsx"].includes(extension)) throw new Error("Envie um arquivo CSV ou XLSX.");
  const rows = extension === "csv"
    ? parseCsv(await file.text())
    : await parseXlsx(Buffer.from(await file.arrayBuffer()));
  if (rows.length < 2) throw new Error("O arquivo precisa conter cabeçalho e pelo menos uma linha de produto.");
  if (rows.length - 1 > MAX_ROWS) throw new Error(`O arquivo excede o limite de ${MAX_ROWS.toLocaleString("pt-BR")} produtos por importação.`);
  const columns = uniqueColumns(rows[0]!.map(cellText));
  const data = rows.slice(1).filter((row) => row.some((cell) => cellText(cell).trim() !== "")).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, scalar(row[index])])) as ImportRow,
  );
  return { type: extension === "csv" ? "CSV" as const : "XLSX" as const, columns, rows: data };
}

export function suggestColumnMapping(columns: string[]): ColumnMapping {
  const aliases: Record<string, InternalImportField> = {
    id: "supplierProductId", codigo: "supplierProductId", codigo_produto: "supplierProductId",
    supplierproductid: "supplierProductId", sku: "sku", sku_fornecedor: "sku",
    nome: "title", nome_produto: "title", produto: "title", titulo: "title", title: "title",
    descricao: "description", description: "description", descricao_curta: "shortDescription",
    categoria: "category", subcategoria: "subcategory", marca: "brand", foto: "images",
    fotos: "images", imagem: "images", imagens: "images", preco_atacado: "costPrice",
    custo: "costPrice", costprice: "costPrice", preco_custo: "costPrice",
    preco_venda: "sellingPrice", sellingprice: "sellingPrice", preco: "sellingPrice",
    preco_comparacao: "compareAtPrice", moeda: "currency", estoque: "stock", stock: "stock",
    disponibilidade: "availability", frete: "shippingCost", prazo_entrega: "estimatedDelivery",
    url: "sourceUrl", url_produto: "sourceUrl", variantes: "variants", atributos: "attributes",
    ativo: "active", destaque: "featured",
  };
  return Object.fromEntries(columns.map((column) => [column, aliases[normalizeHeader(column)] ?? ""])) as ColumnMapping;
}

export function normalizeMappedRow(row: ImportRow, mapping: ColumnMapping): NormalizedSupplierProduct {
  const values = Object.fromEntries(Object.entries(mapping).filter(([, target]) => target).map(([column, target]) => [target, row[column]]));
  const stock = integer(values.stock, 0);
  const supplierProductId = text(values.supplierProductId) || text(values.sku);
  const sku = text(values.sku) || supplierProductId;
  const sourceUrl = text(values.sourceUrl) || undefined;
  return {
    supplierProductId,
    sku,
    title: text(values.title),
    description: optionalText(values.description),
    shortDescription: optionalText(values.shortDescription),
    category: text(values.category) || "Sem categoria",
    subcategory: optionalText(values.subcategory),
    brand: optionalText(values.brand),
    images: splitImages(values.images).map((url, index) => ({ url, isPrimary: index === 0 })),
    costPrice: money(values.costPrice),
    sellingPrice: money(values.sellingPrice),
    compareAtPrice: money(values.compareAtPrice),
    currency: (text(values.currency) || "BRL").toUpperCase(),
    stock,
    availability: availability(values.availability, stock),
    shippingCost: money(values.shippingCost),
    estimatedDelivery: optionalText(values.estimatedDelivery),
    sourceUrl,
    variants: jsonArray(values.variants),
    attributes: jsonRecord(values.attributes),
    active: bool(values.active, true),
    featured: bool(values.featured, false),
  };
}

export async function importCatalogRows(
  supplier: Supplier,
  rows: ImportRow[],
  mapping: ColumnMapping,
  options: { fileName: string; fileType: "CSV" | "XLSX"; mappingTemplateId?: string },
) {
  const job = await db.importJob.create({
    data: {
      type: options.fileType,
      status: "IMPORTING",
      sourceName: options.fileName,
      columnMapping: mapping as Prisma.InputJsonValue,
      totalItems: rows.length,
      supplierId: supplier.id,
      mappingTemplateId: options.mappingTemplateId,
      startedAt: new Date(),
    },
  });
  let succeeded = 0;
  let failed = 0;
  for (const row of rows) {
    const item = await db.importItem.create({ data: { jobId: job.id, status: "IMPORTING", rawData: row as Prisma.InputJsonValue, startedAt: new Date() } });
    try {
      const normalized = normalizeMappedRow(row, mapping);
      const product = await upsertCatalogProduct(supplier, normalized, { manualPriceOverride: normalized.sellingPrice != null });
      succeeded += 1;
      await db.importItem.update({ where: { id: item.id }, data: { status: "SUCCESS", productId: product.id, normalizedData: normalized as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
    } catch (error) {
      failed += 1;
      await db.importItem.update({ where: { id: item.id }, data: { status: "ERROR", error: cleanError(error), finishedAt: new Date() } });
    }
  }
  await db.importJob.update({
    where: { id: job.id },
    data: { status: failed === 0 ? "SUCCESS" : "ERROR", processedItems: rows.length, successItems: succeeded, errorItems: failed, finishedAt: new Date(), message: failed ? "Algumas linhas não puderam ser importadas." : "Importação concluída." },
  });
  return { jobId: job.id, total: rows.length, succeeded, failed };
}

async function parseXlsx(buffer: Buffer) {
  const rows = await readXlsxFile(buffer);
  return rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString() : cell));
}

function parseCsv(input: string) {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => count(firstLine, b) - count(firstLine, a))[0] ?? ",";
  const rows: Array<Array<string>> = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error("CSV inválido: aspas não foram fechadas.");
  return rows;
}

function uniqueColumns(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `Coluna ${index + 1}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence === 1 ? base : `${base} (${occurrence})`;
  });
}

function normalizeHeader(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
function count(value: string, token: string) { return value.split(token).length - 1; }
function cellText(value: unknown) { return value == null ? "" : value instanceof Date ? value.toISOString() : String(value); }
function scalar(value: unknown): string | number | boolean | null { return value == null ? null : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : cellText(value); }
function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function optionalText(value: unknown) { return text(value) || undefined; }
function integer(value: unknown, fallback: number) { const parsed = Number(String(value ?? "").replace(/[^\d-]/g, "")); return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback; }
function money(value: unknown) {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  const raw = String(value).replace(/[^\d,.-]/g, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function bool(value: unknown, fallback: boolean) { if (value == null || value === "") return fallback; return ["1", "true", "sim", "yes", "ativo"].includes(text(value).toLowerCase()); }
function splitImages(value: unknown) { return text(value).split(/[;|\n]+/).map((item) => item.trim()).filter(Boolean); }
function availability(value: unknown, stock: number): NormalizedSupplierProduct["availability"] {
  const normalized = normalizeHeader(text(value));
  if (["available", "disponivel", "em_estoque"].includes(normalized)) return "AVAILABLE";
  if (["out_of_stock", "indisponivel", "sem_estoque"].includes(normalized)) return "OUT_OF_STOCK";
  if (["preorder", "pre_venda"].includes(normalized)) return "PREORDER";
  if (normalized === "removed" || normalized === "removido") return "REMOVED";
  return stock > 0 ? "AVAILABLE" : "UNKNOWN";
}
function jsonRecord(value: unknown) { if (!text(value)) return {}; try { const parsed = JSON.parse(text(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function jsonArray(value: unknown): NormalizedSupplierProduct["variants"] { if (!text(value)) return []; try { const parsed = JSON.parse(text(value)); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function cleanError(error: unknown) { return (error instanceof Error ? error.message : "Erro desconhecido").slice(0, 500); }
