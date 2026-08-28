import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { createUrlImportJob } from "@/services/url-import";

const bodySchema = z.object({
  urls: z.array(z.string().trim().min(1).max(2_000)).min(1).max(500),
  sourceName: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { urls, sourceName } = bodySchema.parse(await request.json());
    return Response.json(await createUrlImportJob(urls, { sourceName }));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível criar a fila."; }
