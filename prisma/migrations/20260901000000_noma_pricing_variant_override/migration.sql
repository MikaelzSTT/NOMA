ALTER TABLE "ProductMarketOfferVariant"
ADD COLUMN "manualPriceOverride" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProductMarketOfferVariant" variant
SET "manualPriceOverride" = offer."manualPriceOverride"
FROM "ProductMarketOffer" offer
WHERE variant."offerId" = offer."id";
