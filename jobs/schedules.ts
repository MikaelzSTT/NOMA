import { env } from "@/lib/env";

export const syncSchedules = {
  prices: { cron: env.SYNC_PRICE_CRON, scope: "prices" },
  availability: { cron: env.SYNC_AVAILABILITY_CRON, scope: "availability" },
  catalog: { cron: env.SYNC_CATALOG_CRON, scope: "catalog" },
} as const;

export type SyncScope = keyof typeof syncSchedules;
