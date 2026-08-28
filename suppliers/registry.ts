import "server-only";
import type { Supplier } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decryptSupplierCredentials } from "@/lib/supplier-secrets";
import { MockSupplierAdapter } from "@/suppliers/adapters/mock-supplier-adapter";
import type { SupplierAdapter, SupplierRuntimeConfig } from "@/suppliers/types";

type AdapterFactory = (config: SupplierRuntimeConfig) => SupplierAdapter;

const factories = new Map<string, AdapterFactory>([
  ["mock-catalog", () => new MockSupplierAdapter()],
]);

export function registerSupplierAdapter(key: string, factory: AdapterFactory) {
  factories.set(key, factory);
}

export function hasSupplierAdapter(key: string) {
  return factories.has(key);
}

export function createSupplierAdapter(supplier: Supplier) {
  const factory = factories.get(supplier.adapterKey);
  if (!factory) {
    throw new Error(`O fornecedor ${supplier.name} ainda não possui um adapter implementado (${supplier.adapterKey}).`);
  }
  return factory({
    id: supplier.id,
    name: supplier.name,
    adapterKey: supplier.adapterKey,
    baseUrl: supplier.baseUrl ?? undefined,
    settings: isRecord(supplier.settings) ? supplier.settings : undefined,
    credentials: decryptSupplierCredentials(supplier.credentialsEncrypted),
  });
}

export async function identifySupplierAdapter(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Informe uma URL válida.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("A URL deve usar HTTP ou HTTPS.");

  const suppliers = await db.supplier.findMany({ where: { active: true, authorized: true } });
  for (const supplier of suppliers) {
    const factory = factories.get(supplier.adapterKey);
    if (!factory) continue;
    const adapter = createSupplierAdapter(supplier);
    if (adapter.supportsUrl?.(url)) return { supplier, adapter, url };
  }
  throw new Error(`Nenhum fornecedor autorizado possui adapter para o domínio ${url.hostname}. Não será tentado scraping genérico.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
