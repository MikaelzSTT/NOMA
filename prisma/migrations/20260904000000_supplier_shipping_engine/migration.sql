CREATE TYPE "ShippingStrategy" AS ENUM ('SUPPLIER_API', 'CARRIER_API', 'TABLE', 'FIXED', 'MANUAL', 'DISABLED');

ALTER TABLE "Store"
  ADD COLUMN "shippingStrategy" "ShippingStrategy" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "shippingActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shippingCheckoutEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shippingOriginPostalCode" VARCHAR(16),
  ADD COLUMN "shippingConfig" JSONB;

UPDATE "Store" supplier
SET
  "shippingStrategy" = 'FIXED',
  "shippingActive" = true,
  "shippingCheckoutEnabled" = true
WHERE EXISTS (
  SELECT 1
  FROM "ProductMarketOffer" offer
  WHERE offer."supplierId" = supplier."id"
    AND offer."shippingCost" IS NOT NULL
);

ALTER TABLE "Order"
  ADD COLUMN "shippingQuoteId" TEXT,
  ADD COLUMN "shippingServiceCode" VARCHAR(80),
  ADD COLUMN "shippingServiceName" VARCHAR(160),
  ADD COLUMN "shippingEstimatedMinDays" INTEGER,
  ADD COLUMN "shippingEstimatedMaxDays" INTEGER,
  ADD COLUMN "destinationPostalCode" VARCHAR(16);

CREATE TABLE "ShippingQuote" (
  "id" TEXT NOT NULL,
  "market" "Market" NOT NULL,
  "supplierId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "variantId" TEXT,
  "destinationPostalCode" VARCHAR(16) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "serviceCode" VARCHAR(80) NOT NULL,
  "serviceName" VARCHAR(160) NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "estimatedMinDays" INTEGER,
  "estimatedMaxDays" INTEGER,
  "strategy" "ShippingStrategy" NOT NULL,
  "adapterKey" VARCHAR(120) NOT NULL,
  "rawResponse" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revalidatedAt" TIMESTAMP(3),
  CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_shippingQuoteId_key" ON "Order"("shippingQuoteId");
CREATE INDEX "ShippingQuote_offerId_variantId_destinationPostalCode_quantity_idx" ON "ShippingQuote"("offerId", "variantId", "destinationPostalCode", "quantity");
CREATE INDEX "ShippingQuote_supplierId_createdAt_idx" ON "ShippingQuote"("supplierId", "createdAt");
CREATE INDEX "ShippingQuote_expiresAt_idx" ON "ShippingQuote"("expiresAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingQuoteId_fkey" FOREIGN KEY ("shippingQuoteId") REFERENCES "ShippingQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductMarketOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductMarketOfferVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
