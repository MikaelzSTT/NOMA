-- CreateEnum
CREATE TYPE "Market" AS ENUM ('BR', 'US');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "supportedMarkets" "Market"[] NOT NULL DEFAULT ARRAY['BR']::"Market"[];

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "market" "Market" NOT NULL DEFAULT 'BR';

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN "market" "Market" NOT NULL DEFAULT 'BR';
ALTER TABLE "PriceHistory" ADD COLUMN "productOfferId" TEXT;

-- CreateTable
CREATE TABLE "ProductMarketOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierProductId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "slug" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "images" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "costPrice" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "compareAtPrice" DECIMAL(12,2),
    "discountPercent" DECIMAL(5,2),
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "shippingCost" DECIMAL(12,2),
    "estimatedDelivery" TEXT,
    "estimatedDeliveryMinDays" INTEGER,
    "estimatedDeliveryMaxDays" INTEGER,
    "sourceUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "popularityScore" INTEGER NOT NULL DEFAULT 0,
    "manualPriceOverride" BOOLEAN NOT NULL DEFAULT false,
    "pricingRuleType" "PricingRuleType",
    "pricingRuleValue" DECIMAL(12,4),
    "internalNotes" TEXT,
    "syncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "syncErrorAt" TIMESTAMP(3),
    "lastPriceSyncAt" TIMESTAMP(3),
    "lastStockSyncAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMarketOffer_pkey" PRIMARY KEY ("id")
);

-- Backfill current catalog as Brazil offers. Existing Product fields are kept
-- for compatibility and continue to preserve all data.
INSERT INTO "ProductMarketOffer" (
    "id", "productId", "market", "supplierId", "supplierProductId", "sku",
    "title", "slug", "shortDescription", "description", "currency",
    "costPrice", "sellingPrice", "compareAtPrice", "discountPercent",
    "stockQuantity", "availability", "shippingCost", "estimatedDelivery",
    "sourceUrl", "active", "featured", "popularityScore",
    "manualPriceOverride", "pricingRuleType", "pricingRuleValue",
    "internalNotes", "syncStatus", "syncError", "syncErrorAt",
    "lastPriceSyncAt", "lastStockSyncAt", "lastSyncedAt", "firstSeenAt",
    "removedAt", "createdAt", "updatedAt"
)
SELECT
    'offer_' || md5(random()::text || clock_timestamp()::text || p."id"),
    p."id",
    'BR'::"Market",
    p."storeId",
    p."externalId",
    p."sku",
    NULL,
    p."slug",
    NULL,
    NULL,
    p."currency",
    p."costPrice",
    p."currentPrice",
    p."previousPrice",
    p."discountPercent",
    p."stock",
    p."availability",
    p."shippingCost",
    p."estimatedDelivery",
    p."originalUrl",
    p."active",
    p."featured",
    p."popularityScore",
    p."manualPriceOverride",
    p."pricingRuleType",
    p."pricingRuleValue",
    p."internalNotes",
    p."syncStatus",
    p."syncError",
    p."syncErrorAt",
    p."lastPriceSyncAt",
    p."lastStockSyncAt",
    p."lastSyncedAt",
    p."firstSeenAt",
    p."removedAt",
    p."createdAt",
    p."updatedAt"
FROM "Product" p
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketOffer_market_slug_key" ON "ProductMarketOffer"("market", "slug");
CREATE UNIQUE INDEX "ProductMarketOffer_supplierId_market_supplierProductId_key" ON "ProductMarketOffer"("supplierId", "market", "supplierProductId");
CREATE INDEX "ProductMarketOffer_productId_market_idx" ON "ProductMarketOffer"("productId", "market");
CREATE INDEX "ProductMarketOffer_market_active_availability_idx" ON "ProductMarketOffer"("market", "active", "availability");
CREATE INDEX "ProductMarketOffer_market_active_sellingPrice_idx" ON "ProductMarketOffer"("market", "active", "sellingPrice");
CREATE INDEX "ProductMarketOffer_supplierId_market_active_idx" ON "ProductMarketOffer"("supplierId", "market", "active");
CREATE INDEX "ProductMarketOffer_featured_popularityScore_idx" ON "ProductMarketOffer"("featured", "popularityScore");
CREATE INDEX "ProductMarketOffer_lastPriceSyncAt_idx" ON "ProductMarketOffer"("lastPriceSyncAt");
CREATE INDEX "ProductMarketOffer_lastStockSyncAt_idx" ON "ProductMarketOffer"("lastStockSyncAt");
CREATE INDEX "PriceHistory_productOfferId_recordedAt_idx" ON "PriceHistory"("productOfferId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ProductMarketOffer" ADD CONSTRAINT "ProductMarketOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductMarketOffer" ADD CONSTRAINT "ProductMarketOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
