import { requireApiAdmin } from "@/lib/api-auth";
import { processUrlImportJob } from "@/services/url-import";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    return Response.json(await processUrlImportJob(id));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível processar a fila."; }
