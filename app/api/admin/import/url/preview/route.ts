import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { isMarket } from "@/lib/market";
import { previewProductUrl } from "@/services/url-import";

const bodySchema = z.object({
  url: z.url().max(2_000),
  market: z.string().trim().transform((value) => value.toUpperCase()).refine(isMarket),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { url, market } = bodySchema.parse(await request.json());
    return Response.json(await previewProductUrl(url, market));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível obter o preview."; }
