import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizeSourceUrl } from "@/lib/catalog/source-url";
import { normalizedSupplierProductSchema } from "@/lib/validation/catalog-product";
import { upsertCatalogProduct } from "@/services/catalog-products";
import { createSupplierAdapter, identifySupplierAdapter } from "@/suppliers/registry";
import type { DiscoveredSupplierProduct, NormalizedSupplierProduct } from "@/suppliers/types";

interface CommitPreviewInput {
  itemId: string;
  product: NormalizedSupplierProduct;
}

export async function previewProductUrl(rawUrl: string) {
  const { supplier, adapter, url } = await identifySupplierAdapter(rawUrl);
  if (!adapter.fetchProductByUrl) throw new Error(`${supplier.name} reconhece o domínio, mas não oferece importação por URL.`);
  const product = normalizeImportedProduct(await adapter.fetchProductByUrl(url));
  return {
    supplier: { id: supplier.id, name: supplier.name },
    product: serializableProduct(product),
  };
}

export async function discoverCategoryProducts(rawUrl: string, maxPages = 3) {
  const { supplier, adapter, url } = await identifySupplierAdapter(rawUrl);
  if (!adapter.discoverProducts) throw new Error(`${supplier.name} reconhece o domínio, mas não oferece descoberta de categoria.`);

  const products: DiscoveredSupplierProduct[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let nextUrl: URL | undefined = url;
  let pages = 0;
  while (nextUrl && pages < Math.max(1, Math.min(maxPages, 10))) {
    const page = await adapter.discoverProducts(nextUrl);
    for (const product of page.products) {
      const productUrl = normalizeSourceUrl(product.productUrl);
      if (!productUrl || seen.has(productUrl)) continue;
      seen.add(productUrl);
      products.push({ ...product, productUrl });
    }
    if (page.warnings?.length) warnings.push(...page.warnings);
    if (page.isLastPage || !page.nextPageUrl) break;
    nextUrl = new URL(page.nextPageUrl);
    pages += 1;
  }
  if (nextUrl && pages >= maxPages) warnings.push(`Paginação interrompida no limite de ${maxPages} página(s).`);

  return {
    supplier: { id: supplier.id, name: supplier.name },
    products,
    warnings,
  };
}

export async function confirmUrlProduct(supplierId: string, candidate: NormalizedSupplierProduct) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier || !supplier.active || !supplier.authorized) throw new Error("Fornecedor indisponível ou não autorizado.");
  const product = normalizeImportedProduct(candidate);
  const adapter = createSupplierAdapter(supplier);
  if (product.sourceUrl && adapter.supportsUrl && !adapter.supportsUrl(new URL(product.sourceUrl))) {
    throw new Error("A URL de origem não pertence ao adapter selecionado.");
  }
  const saved = await upsertCatalogProduct(supplier, product, { manualPriceOverride: product.sellingPrice != null });
  await db.importJob.create({
    data: {
      type: "URL",
      status: "SUCCESS",
      sourceName: product.sourceUrl,
      supplierId: supplier.id,
      totalItems: 1,
      processedItems: 1,
      successItems: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
      items: { create: { sourceRef: product.sourceUrl, status: "SUCCESS", normalizedData: serializableProduct(product) as unknown as Prisma.InputJsonValue, productId: saved.id, startedAt: new Date(), finishedAt: new Date() } },
    },
  });
  return { id: saved.id, slug: saved.slug };
}

export async function createUrlImportJob(urls: string[], options: { sourceName?: string } = {}) {
  const unique = [...new Set(urls.map((url) => normalizeSourceUrl(url)).filter(Boolean))].slice(0, 500) as string[];
  if (unique.length === 0) throw new Error("Informe ao menos uma URL.");
  const items: Array<{ sourceRef: string; status: "PENDING" | "ERROR"; error?: string }> = [];
  for (const url of unique) {
    try {
      await identifySupplierAdapter(url);
      items.push({ sourceRef: url, status: "PENDING" });
    } catch (error) {
      items.push({ sourceRef: url, status: "ERROR", error: cleanError(error) });
    }
  }
  return db.importJob.create({
    data: {
      type: "URL_BATCH",
      status: items.some((item) => item.status === "PENDING") ? "PENDING" : "ERROR",
      sourceName: options.sourceName ?? "Lista de URLs",
      totalItems: items.length,
      processedItems: items.filter((item) => item.status === "ERROR").length,
      errorItems: items.filter((item) => item.status === "ERROR").length,
      items: { create: items },
    },
    select: { id: true },
  });
}

export async function processUrlImportJob(jobId: string, batchSize = 3) {
  const job = await db.importJob.findFirst({ where: { id: jobId, type: "URL_BATCH" }, select: { id: true } });
  if (!job) throw new Error("Fila de importação não encontrada.");
  await db.importJob.update({ where: { id: jobId }, data: { status: "IMPORTING", startedAt: new Date() } });
  const items = await db.importItem.findMany({ where: { jobId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(batchSize, 10)) });
  for (const item of items) {
    await db.importItem.update({ where: { id: item.id }, data: { status: "IMPORTING", startedAt: new Date(), attempts: { increment: 1 } } });
    try {
      const { supplier, adapter, url } = await identifySupplierAdapter(item.sourceRef ?? "");
      if (!adapter.fetchProductByUrl) throw new Error("O adapter não oferece importação por URL.");
      const product = normalizeImportedProduct(await adapter.fetchProductByUrl(url));
      await db.importItem.update({
        where: { id: item.id },
        data: {
          status: "PREVIEW",
          rawData: { supplierId: supplier.id, supplierName: supplier.name } as Prisma.InputJsonValue,
          normalizedData: serializableProduct(product) as unknown as Prisma.InputJsonValue,
          error: null,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await db.importItem.update({ where: { id: item.id }, data: { status: "ERROR", error: cleanError(error), finishedAt: new Date() } });
    }
  }
  return refreshJobTotals(jobId);
}

export async function commitImportJobPreviews(jobId: string, inputs: CommitPreviewInput[]) {
  if (inputs.length === 0) throw new Error("Selecione ao menos um preview para salvar.");
  const savedProducts: Array<{ id: string; slug: string }> = [];
  for (const input of inputs.slice(0, 500)) {
    const item = await db.importItem.findFirst({
      where: { id: input.itemId, jobId, status: "PREVIEW" },
      select: { id: true, sourceRef: true },
    });
    if (!item) throw new Error("Preview não encontrado ou já processado.");
    await db.importItem.update({ where: { id: item.id }, data: { status: "IMPORTING", startedAt: new Date(), attempts: { increment: 1 } } });
    try {
      const product = normalizeImportedProduct({
        ...input.product,
        sourceUrl: input.product.sourceUrl ?? item.sourceRef ?? undefined,
      });
      const { supplier } = await identifySupplierAdapter(product.sourceUrl ?? item.sourceRef ?? "");
      const saved = await upsertCatalogProduct(supplier, product, { manualPriceOverride: product.sellingPrice != null });
      savedProducts.push({ id: saved.id, slug: saved.slug });
      await db.importItem.update({
        where: { id: item.id },
        data: {
          status: "SUCCESS",
          productId: saved.id,
          normalizedData: serializableProduct(product) as unknown as Prisma.InputJsonValue,
          error: null,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await db.importItem.update({ where: { id: item.id }, data: { status: "ERROR", error: cleanError(error), finishedAt: new Date() } });
    }
  }
  const job = await refreshJobTotals(jobId);
  return { job, savedProducts };
}

export async function getImportJobStatus(jobId: string) {
  const job = await db.importJob.findUnique({
    where: { id: jobId },
    select: {
      id: true, type: true, status: true, totalItems: true, processedItems: true, successItems: true, errorItems: true, createdAt: true, finishedAt: true,
      items: {
        select: {
          id: true,
          sourceRef: true,
          status: true,
          error: true,
          normalizedData: true,
          product: { select: { slug: true, title: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });
  if (!job) throw new Error("Importação não encontrada.");
  return job;
}

async function refreshJobTotals(jobId: string) {
  const grouped = await db.importItem.groupBy({ by: ["status"], where: { jobId }, _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((group) => [group.status, group._count._all]));
  const success = counts.SUCCESS ?? 0;
  const errors = counts.ERROR ?? 0;
  const previews = counts.PREVIEW ?? 0;
  const pending = (counts.PENDING ?? 0) + (counts.IMPORTING ?? 0);
  await db.importJob.update({
    where: { id: jobId },
    data: {
      status: pending > 0 ? "IMPORTING" : previews > 0 ? "PREVIEW" : errors > 0 ? "ERROR" : "SUCCESS",
      processedItems: success + errors + previews,
      successItems: success,
      errorItems: errors,
      finishedAt: pending === 0 && previews === 0 ? new Date() : null,
    },
  });
  return getImportJobStatus(jobId);
}

function normalizeImportedProduct(product: unknown) {
  const parsed = normalizedSupplierProductSchema.parse(product);
  return normalizedSupplierProductSchema.parse({
    ...parsed,
    sourceUrl: normalizeSourceUrl(parsed.sourceUrl),
  });
}

function serializableProduct(product: NormalizedSupplierProduct) {
  const { sourceUpdatedAt, ...serializable } = product;
  void sourceUpdatedAt;
  return serializable;
}

function cleanError(error: unknown) {
  return (error instanceof Error ? error.message : "Erro desconhecido").replace(/(authorization|token|api[_-]?key|cookie|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 500);
}
