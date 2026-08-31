import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { previewProductFromUrl } from "@/lib/product-import/url-importer";

const bodySchema = z.object({
  url: z.url().max(2_000),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { url } = bodySchema.parse(await request.json());
    return Response.json(await previewProductFromUrl(url));
  } catch {
    return Response.json({ error: "Não foi possível extrair dados públicos desta URL." }, { status: 400 });
  }
}
