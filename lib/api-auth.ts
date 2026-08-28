import "server-only";
import { getAdminSession } from "@/lib/auth";

export async function requireApiAdmin(request: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
    }
  }
  return null;
}
