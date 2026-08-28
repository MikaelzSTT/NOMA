import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireApiAdmin } from "@/lib/api-auth";
import { INTERNAL_IMPORT_FIELDS, importCatalogRows, parseCatalogFile, type ColumnMapping } from "@/services/file-import";

export const runtime = "nodejs";

const mappingSchema = z.record(z.string().max(300), z.union([z.enum(INTERNAL_IMPORT_FIELDS), z.literal("")]));

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const supplierId = String(form.get("supplierId") ?? "");
    const templateName = String(form.get("templateName") ?? "").trim().slice(0, 120);
    const mapping = mappingSchema.parse(JSON.parse(String(form.get("mapping") ?? "{}"))) as ColumnMapping;
    if (!(file instanceof File)) throw new Error("Selecione um arquivo CSV ou XLSX.");
    if (!Object.values(mapping).includes("title") || (!Object.values(mapping).includes("sku") && !Object.values(mapping).includes("supplierProductId"))) {
      throw new Error("Mapeie ao menos título e SKU/ID do fornecedor.");
    }
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, active: true } });
    if (!supplier) throw new Error("Fornecedor não encontrado.");
    const parsed = await parseCatalogFile(file);
    const template = templateName ? await db.importMappingTemplate.upsert({
      where: { supplierId_name: { supplierId, name: templateName } },
      update: { fileType: parsed.type, columnMapping: mapping as Prisma.InputJsonValue },
      create: { supplierId, name: templateName, fileType: parsed.type, columnMapping: mapping as Prisma.InputJsonValue },
    }) : null;
    const result = await importCatalogRows(supplier, parsed.rows, mapping, { fileName: file.name, fileType: parsed.type, mappingTemplateId: template?.id });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível importar o arquivo."; }
