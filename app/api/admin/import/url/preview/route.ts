import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { previewProductUrl } from "@/services/url-import";

const bodySchema = z.object({ url: z.url().max(2_000) });

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { url } = bodySchema.parse(await request.json());
    return Response.json(await previewProductUrl(url));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível obter o preview."; }
