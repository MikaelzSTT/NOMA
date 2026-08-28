import "dotenv/config";
import { db } from "@/lib/db";
import { syncProductsWithAdapter } from "@/lib/catalog/sync-products";
import { slugify } from "@/lib/utils";
import { MockSupplierAdapter } from "@/suppliers/adapters/mock-supplier-adapter";

async function seed() {
  const adapter = new MockSupplierAdapter();
  const supplier = await db.supplier.upsert({
    where: { adapterKey: adapter.key },
    update: { name: adapter.name, active: true, authorized: true, capabilities: [...adapter.capabilities] },
    create: { name: adapter.name, slug: slugify(adapter.key), adapterKey: adapter.key, active: true, authorized: true, capabilities: [...adapter.capabilities] },
  });
  const existingRule = await db.pricingRule.findFirst({ where: { supplierId: supplier.id, name: "Markup demonstrativo 1.8" } });
  if (!existingRule) {
    await db.pricingRule.create({ data: { supplierId: supplier.id, name: "Markup demonstrativo 1.8", type: "MARKUP", value: 1.8, active: true, priority: 100 } });
  }
  const legacyMock = await db.supplier.findUnique({ where: { adapterKey: "mock" } });
  if (legacyMock) {
    await db.supplier.update({ where: { id: legacyMock.id }, data: { active: false } });
    await db.product.updateMany({ where: { supplierId: legacyMock.id }, data: { active: false, archivedAt: new Date() } });
  }
  const result = await syncProductsWithAdapter(adapter, { supplierId: supplier.id });
  console.info(`Seed concluído: ${result.succeeded} produtos, ${result.failed} erros, ${result.durationMs}ms.`);
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao executar seed.");
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
