import { db } from "@/lib/db";
import { syncProducts } from "@/services/sync-products";

syncProducts({ incremental: process.argv.includes("--incremental") })
  .then((result) => {
    console.info(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha na sincronizacao.");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
