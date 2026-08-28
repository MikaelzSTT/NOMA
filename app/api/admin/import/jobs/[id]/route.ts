import { requireApiAdmin } from "@/lib/api-auth";
import { getImportJobStatus } from "@/services/url-import";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    return Response.json(await getImportJobStatus(id));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 404 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Fila não encontrada."; }
