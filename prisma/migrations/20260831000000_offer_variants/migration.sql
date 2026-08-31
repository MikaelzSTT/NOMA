-- CreateTable
CREATE TABLE "ProductMarketOfferVariant" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sku" TEXT,
    "attributes" JSONB NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "availability" "AvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offerId" TEXT NOT NULL,

    CONSTRAINT "ProductMarketOfferVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductMarketOfferVariant_offerId_active_idx" ON "ProductMarketOfferVariant"("offerId", "active");
CREATE INDEX "ProductMarketOfferVariant_offerId_isDefault_idx" ON "ProductMarketOfferVariant"("offerId", "isDefault");
CREATE INDEX "ProductMarketOfferVariant_sku_idx" ON "ProductMarketOfferVariant"("sku");
CREATE UNIQUE INDEX "ProductMarketOfferVariant_one_default_per_offer" ON "ProductMarketOfferVariant"("offerId") WHERE "isDefault" = true;

-- AddForeignKey
ALTER TABLE "ProductMarketOfferVariant" ADD CONSTRAINT "ProductMarketOfferVariant_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductMarketOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
