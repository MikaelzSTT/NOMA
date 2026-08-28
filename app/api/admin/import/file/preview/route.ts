import { requireApiAdmin } from "@/lib/api-auth";
import { parseCatalogFile, suggestColumnMapping } from "@/services/file-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo CSV ou XLSX." }, { status: 400 });
    const parsed = await parseCatalogFile(file);
    return Response.json({ type: parsed.type, columns: parsed.columns, rows: parsed.rows.slice(0, 10), totalRows: parsed.rows.length, suggestedMapping: suggestColumnMapping(parsed.columns) });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível ler o arquivo."; }
