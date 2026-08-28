import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";
import { confirmUrlProduct } from "@/services/url-import";

const bodySchema = z.object({ supplierId: z.string().min(1), product: normalizedSupplierProductSchema });

export async function POST(request: Request) {
  const unauthorized = await requireApiAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const body = bodySchema.parse(await request.json());
    return Response.json(await confirmUrlProduct(body.supplierId, body.product));
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Não foi possível salvar o produto."; }
