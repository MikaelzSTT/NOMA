import "server-only";
import { db } from "@/lib/db";
import {
  deduplicateProducts,
  syncProductsWithAdapter,
  syncSupplierProducts,
  type SyncAdapterOptions,
  type SyncResult,
} from "@/lib/catalog/sync-products";
import { createSupplierAdapter, hasSupplierAdapter } from "@/suppliers/registry";
import type { SupplierAdapter } from "@/suppliers/types";

export interface SyncOptions extends SyncAdapterOptions {
  adapter?: SupplierAdapter;
}

export type { SyncResult };
export { deduplicateProducts };

export async function syncProducts(options: SyncOptions = {}): Promise<SyncResult> {
  if (options.adapter) {
    return syncProductsWithAdapter(options.adapter, options);
  }

  const market = options.market ?? "BR";
  const suppliers = await db.supplier.findMany({ where: { active: true, authorized: true, supportedMarkets: { has: market } } });
  if (suppliers.length === 0) throw new Error("Nenhum fornecedor ativo e autorizado foi configurado.");

  const results: SyncResult[] = [];
  for (const supplier of suppliers) {
    if (!hasSupplierAdapter(supplier.adapterKey)) continue;
    const adapter = createSupplierAdapter(supplier);
    if (!adapter.fetchProducts) continue;
    results.push(await syncSupplierProducts(supplier, adapter, options));
  }
  if (results.length === 0) throw new Error("Nenhum fornecedor ativo oferece sincronização de catálogo.");
  return results.reduce((total, result) => ({
    logId: result.logId,
    processed: total.processed + result.processed,
    succeeded: total.succeeded + result.succeeded,
    failed: total.failed + result.failed,
    skipped: total.skipped + result.skipped,
    removed: total.removed + result.removed,
    durationMs: total.durationMs + result.durationMs,
  }), { logId: results.at(-1)!.logId, processed: 0, succeeded: 0, failed: 0, skipped: 0, removed: 0, durationMs: 0 });
}
