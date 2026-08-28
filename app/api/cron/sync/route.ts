import { NextRequest, NextResponse } from "next/server";
import { SyncOperation } from "@/generated/prisma/enums";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncProducts } from "@/services/sync-products";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!env.CRON_SECRET || authorization !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  if (!checkRateLimit("cron-sync", 10).allowed) {
    return NextResponse.json({ error: "Limite temporario atingido." }, { status: 429 });
  }
  const scope = request.nextUrl.searchParams.get("scope") ?? "catalog";
  const options = scope === "prices"
    ? { operation: SyncOperation.PRICE, incremental: true }
    : scope === "availability"
      ? { operation: SyncOperation.AVAILABILITY, incremental: true }
      : { operation: SyncOperation.FULL_CATALOG, incremental: false };
  try {
    const result = await syncProducts(options);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json(
      { error: "Falha na sincronizacao. Consulte os logs administrativos." },
      { status: 500 },
    );
  }
}
