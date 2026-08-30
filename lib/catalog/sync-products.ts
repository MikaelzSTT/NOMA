import { randomUUID } from "node:crypto";
import type { Supplier } from "@/generated/prisma/client";
import { SyncOperation, SyncStatus } from "@/generated/prisma/enums";
import { upsertCatalogProduct } from "@/lib/catalog/catalog-products";
import type { NormalizedSupplierProduct, SupplierAdapter } from "@/lib/catalog/supplier-types";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Market } from "@/lib/market";
import { RequestThrottle } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";

export interface SyncAdapterOptions {
  supplierId?: string;
  market?: Market;
  operation?: (typeof SyncOperation)[keyof typeof SyncOperation];
  incremental?: boolean;
  batchSize?: number;
}

export interface SyncResult {
  logId: string;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  removed: number;
  durationMs: number;
}

export function deduplicateProducts(products: NormalizedSupplierProduct[]) {
  const unique = new Map<string, NormalizedSupplierProduct>();
  for (const product of products) unique.set(product.supplierProductId, product);
  return [...unique.values()];
}

export async function syncProductsWithAdapter(
  adapter: SupplierAdapter,
  options: SyncAdapterOptions = {},
): Promise<SyncResult> {
  const supplier = await ensureSupplier(adapter, options.supplierId);
  return syncSupplierProducts(supplier, adapter, options);
}

export async function syncSupplierProducts(
  supplier: Supplier,
  adapter: SupplierAdapter,
  options: SyncAdapterOptions = {},
) {
  if (!adapter.fetchProducts) throw new Error(`${adapter.name} não oferece importação de catálogo.`);
  const market = options.market ?? "BR";
  if (!supplier.supportedMarkets.includes(market)) throw new Error(`Fornecedor ${supplier.name} não opera no mercado ${market}.`);
  const operation = options.operation ?? (options.incremental ? SyncOperation.INCREMENTAL : SyncOperation.FULL_CATALOG);
  const started = Date.now();
  const lockOwner = await acquireSyncLock(adapter.key);
  const log = await db.syncLog.create({ data: { provider: adapter.key, operation, status: SyncStatus.RUNNING } });
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let removed = 0;
  let cursor = supplier.syncCursor ?? undefined;
  const seen = new Set<string>();
  const errors: string[] = [];

  try {
    const throttle = new RequestThrottle(env.SYNC_REQUESTS_PER_SECOND);
    const batches = adapter.fetchProducts({
      cursor: options.incremental ? cursor : undefined,
      limit: options.batchSize ?? env.SYNC_BATCH_SIZE,
      updatedAfter: options.incremental ? new Date(Date.now() - env.SYNC_STALE_HOURS * 3_600_000) : undefined,
    });
    for await (const batch of batches) {
      await throttle.wait();
      cursor = batch.nextCursor ?? cursor;
      const products = deduplicateProducts(batch.products);
      skipped += batch.products.length - products.length;
      for (const raw of products) {
        processed += 1;
        const parsed = normalizedSupplierProductSchema.safeParse(raw);
        if (!parsed.success) {
          failed += 1;
          errors.push(`${raw.supplierProductId || "sem-id"}: ${parsed.error.issues[0]?.message ?? "Produto inválido"}`);
          continue;
        }
        try {
          await upsertCatalogProduct(supplier, parsed.data, { market, preserveManualPrice: true });
          seen.add(parsed.data.supplierProductId);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          const message = cleanError(error);
          errors.push(`${parsed.data.supplierProductId}: ${message}`);
          await db.product.updateMany({
            where: { supplierId: supplier.id, supplierProductId: parsed.data.supplierProductId },
            data: { syncStatus: "ERROR", syncError: message, syncErrorAt: new Date() },
          });
        }
      }
    }

    if (operation === SyncOperation.FULL_CATALOG && failed === 0 && seen.size > 0) {
      const result = await db.product.updateMany({
        where: { supplierId: supplier.id, supplierProductId: { notIn: [...seen] }, removedAt: null },
        data: { availability: "REMOVED", active: false, removedAt: new Date(), syncStatus: "STALE" },
      });
      await db.productMarketOffer.updateMany({
        where: { supplierId: supplier.id, market, supplierProductId: { notIn: [...seen] }, removedAt: null },
        data: { availability: "REMOVED", active: false, removedAt: new Date(), syncStatus: "STALE" },
      });
      removed = result.count;
    }
    const durationMs = Date.now() - started;
    const status = failed === 0 ? SyncStatus.SUCCESS : succeeded > 0 ? SyncStatus.PARTIAL : SyncStatus.FAILED;
    await db.$transaction([
      db.supplier.update({ where: { id: supplier.id }, data: { lastSyncedAt: new Date(), syncCursor: cursor } }),
      db.syncLog.update({
        where: { id: log.id },
        data: {
          status,
          processedCount: processed,
          successCount: succeeded,
          errorCount: failed,
          skippedCount: skipped,
          durationMs,
          finishedAt: new Date(),
          cursor,
          message: removed ? `${removed} produto(s) marcado(s) como removido(s).` : undefined,
          errorSummary: errors.length ? errors.slice(0, 25) : undefined,
        },
      }),
    ]);
    return { logId: log.id, processed, succeeded, failed, skipped, removed, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    await db.syncLog.update({
      where: { id: log.id },
      data: { status: SyncStatus.FAILED, processedCount: processed, successCount: succeeded, errorCount: Math.max(failed, 1), skippedCount: skipped, durationMs, finishedAt: new Date(), message: cleanError(error), errorSummary: errors.length ? errors.slice(0, 25) : undefined },
    });
    throw error;
  } finally {
    await releaseSyncLock(adapter.key, lockOwner);
  }
}

async function ensureSupplier(adapter: SupplierAdapter, supplierId?: string) {
  if (supplierId) {
    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new Error("Fornecedor não encontrado.");
    return supplier;
  }
  return db.supplier.upsert({
    where: { adapterKey: adapter.key },
    update: { name: adapter.name, active: true, authorized: true, capabilities: [...adapter.capabilities], supportedMarkets: ["BR"] },
    create: { name: adapter.name, slug: slugify(adapter.key), adapterKey: adapter.key, active: true, authorized: true, capabilities: [...adapter.capabilities], supportedMarkets: ["BR"] },
  });
}

async function acquireSyncLock(provider: string) {
  const ownerId = randomUUID();
  const acquiredUntil = new Date(Date.now() + 30 * 60_000);
  const reclaimed = await db.syncLock.updateMany({ where: { provider, acquiredUntil: { lt: new Date() } }, data: { ownerId, acquiredUntil } });
  if (reclaimed.count) return ownerId;
  try {
    await db.syncLock.create({ data: { provider, ownerId, acquiredUntil } });
    return ownerId;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002") throw new Error(`Já existe uma sincronização em andamento para ${provider}.`);
    throw error;
  }
}

async function releaseSyncLock(provider: string, ownerId: string) {
  await db.syncLock.updateMany({ where: { provider, ownerId }, data: { acquiredUntil: new Date(0) } }).catch(() => undefined);
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  return message.replace(/(authorization|token|api[_-]?key|cookie|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500);
}
