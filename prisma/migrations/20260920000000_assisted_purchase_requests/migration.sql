CREATE TYPE "AssistedPurchaseStatus" AS ENUM ('NEW', 'CONTACTED', 'WON', 'LOST');

CREATE TABLE "AssistedPurchaseRequest" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "variantId" TEXT,
  "market" "Market" NOT NULL,
  "customerName" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "email" VARCHAR(255),
  "consent" BOOLEAN NOT NULL,
  "productTitleSnapshot" VARCHAR(255) NOT NULL,
  "variantLabelSnapshot" VARCHAR(255),
  "priceSnapshot" DECIMAL(12,2) NOT NULL,
  "currencySnapshot" VARCHAR(3) NOT NULL,
  "pageUrl" VARCHAR(1000),
  "status" "AssistedPurchaseStatus" NOT NULL DEFAULT 'NEW',
  "notes" TEXT,
  "submissionKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssistedPurchaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistedPurchaseRequest_submissionKey_key" ON "AssistedPurchaseRequest"("submissionKey");
CREATE INDEX "AssistedPurchaseRequest_status_createdAt_idx" ON "AssistedPurchaseRequest"("status", "createdAt");
CREATE INDEX "AssistedPurchaseRequest_market_createdAt_idx" ON "AssistedPurchaseRequest"("market", "createdAt");
CREATE INDEX "AssistedPurchaseRequest_productId_createdAt_idx" ON "AssistedPurchaseRequest"("productId", "createdAt");
CREATE INDEX "AssistedPurchaseRequest_offerId_createdAt_idx" ON "AssistedPurchaseRequest"("offerId", "createdAt");

ALTER TABLE "AssistedPurchaseRequest" ADD CONSTRAINT "AssistedPurchaseRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistedPurchaseRequest" ADD CONSTRAINT "AssistedPurchaseRequest_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductMarketOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistedPurchaseRequest" ADD CONSTRAINT "AssistedPurchaseRequest_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductMarketOfferVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
