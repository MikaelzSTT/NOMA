import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";
import { commitImportJobPreviews } from "@/services/url-import";

const bodySchema = z.object({
  items: z.array(z.object({
    itemId: z.string().min(1),
    product: normalizedSupplierProductSchema,
    manualPriceOverride: z.boolean().optional(),
  })).min(1).max(500),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    return Response.json(await commitImportJobPreviews(id, body.items));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível salvar os previews.";
}
