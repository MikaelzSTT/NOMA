import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/auth";

const allowedContentTypes = ["image/jpeg", "image/png", "image/webp"];
const maximumSizeInBytes = 8 * 1024 * 1024;

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = await request.json() as HandleUploadBody;
  } catch {
    return Response.json({ error: "Requisição de upload inválida." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        await requireAdmin();
        if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
          throw new Error("missing-blob-token");
        }
        return {
          allowedContentTypes,
          maximumSizeInBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
    });
    return Response.json(json);
  } catch (error) {
    const message = error instanceof Error && error.message === "missing-blob-token"
      ? "Storage não configurado. Defina BLOB_READ_WRITE_TOKEN no ambiente da Vercel."
      : "Não foi possível preparar o upload da imagem.";
    return Response.json({ error: message }, { status: 400 });
  }
}
