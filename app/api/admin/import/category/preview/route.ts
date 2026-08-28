import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { discoverCategoryProducts } from "@/services/url-import";

const bodySchema = z.object({
  url: z.url().max(2_000),
  maxPages: z.number().int().min(1).max(10).default(3),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { url, maxPages } = bodySchema.parse(await request.json());
    return Response.json(await discoverCategoryProducts(url, maxPages));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível descobrir produtos da categoria.";
}
