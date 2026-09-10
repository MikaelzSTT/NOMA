import { del } from "@vercel/blob";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  await requireAdmin();

  let url: string;
  try {
    const body = await request.json() as { url?: unknown };
    url = typeof body.url === "string" ? body.url : "";
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!isVercelBlobUrl(url)) {
    return Response.json({ error: "URL de imagem inválida." }, { status: 400 });
  }

  try {
    await del(url);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível remover a imagem do storage." }, { status: 400 });
  }
}

function isVercelBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "blob.vercel-storage.com" || url.hostname.endsWith(".blob.vercel-storage.com"));
  } catch {
    return false;
  }
}
