-- CreateTable
CREATE TABLE "NomaPurchaseIntentEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" VARCHAR(40) NOT NULL,
    "market" "Market" NOT NULL,
    "productId" TEXT NOT NULL,
    "productOfferId" TEXT NOT NULL,
    "productSlug" VARCHAR(255) NOT NULL,
    "productTitle" VARCHAR(255) NOT NULL,
    "variantId" TEXT,
    "variantLabel" VARCHAR(255),
    "displayedPrice" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "pathname" VARCHAR(600) NOT NULL,
    "referrer" VARCHAR(600),
    "utmSource" VARCHAR(255),
    "utmMedium" VARCHAR(255),
    "utmCampaign" VARCHAR(255),
    "utmContent" VARCHAR(255),
    "utmTerm" VARCHAR(255),
    "gclid" VARCHAR(255),
    "userAgentSummary" VARCHAR(255),
    "sessionHash" VARCHAR(64),
    "dedupeKey" VARCHAR(64) NOT NULL,

    CONSTRAINT "NomaPurchaseIntentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NomaPurchaseIntentEvent_dedupeKey_key" ON "NomaPurchaseIntentEvent"("dedupeKey");
CREATE INDEX "NomaPurchaseIntentEvent_occurredAt_idx" ON "NomaPurchaseIntentEvent"("occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_market_occurredAt_idx" ON "NomaPurchaseIntentEvent"("market", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_eventType_occurredAt_idx" ON "NomaPurchaseIntentEvent"("eventType", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_market_eventType_occurredAt_idx" ON "NomaPurchaseIntentEvent"("market", "eventType", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_productId_eventType_occurredAt_idx" ON "NomaPurchaseIntentEvent"("productId", "eventType", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_productOfferId_eventType_occurredAt_idx" ON "NomaPurchaseIntentEvent"("productOfferId", "eventType", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_utmSource_occurredAt_idx" ON "NomaPurchaseIntentEvent"("utmSource", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_utmCampaign_occurredAt_idx" ON "NomaPurchaseIntentEvent"("utmCampaign", "occurredAt");
CREATE INDEX "NomaPurchaseIntentEvent_gclid_occurredAt_idx" ON "NomaPurchaseIntentEvent"("gclid", "occurredAt");

-- AddForeignKey
ALTER TABLE "NomaPurchaseIntentEvent" ADD CONSTRAINT "NomaPurchaseIntentEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NomaPurchaseIntentEvent" ADD CONSTRAINT "NomaPurchaseIntentEvent_productOfferId_fkey" FOREIGN KEY ("productOfferId") REFERENCES "ProductMarketOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NomaPurchaseIntentEvent" ADD CONSTRAINT "NomaPurchaseIntentEvent_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductMarketOfferVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
