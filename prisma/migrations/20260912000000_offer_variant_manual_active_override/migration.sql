ALTER TABLE "ProductMarketOfferVariant"
ADD COLUMN "manualActiveOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProductMarketOfferVariant"
SET "manualActiveOverride" = true
WHERE "active" = false
  AND NOT ("availability" = 'OUT_OF_STOCK' AND "stock" = 0);
