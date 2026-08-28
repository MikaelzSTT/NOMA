-- Evolui o catalogo de comparador para catalogo interno multi-fornecedor.
-- As colunas fisicas legadas sao preservadas quando o Prisma usa @map.

CREATE TYPE "ProductSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'STALE', 'ERROR');
CREATE TYPE "PricingRuleType" AS ENUM ('FIXED_MARGIN', 'MARKUP');
CREATE TYPE "ImageStorageStatus" AS ENUM ('EXTERNAL', 'PENDING_COPY', 'STORED', 'COPY_ERROR');
CREATE TYPE "ImportType" AS ENUM ('API', 'CSV', 'XLSX', 'URL', 'URL_BATCH');
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'IMPORTING', 'PREVIEW', 'SUCCESS', 'ERROR', 'CANCELLED');

ALTER TABLE "Store"
  ADD COLUMN "settings" JSONB,
  ADD COLUMN "credentialsEncrypted" TEXT,
  ADD COLUMN "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "supplierName" TEXT;
UPDATE "Product" SET "sku" = "externalId" WHERE "sku" IS NULL;
UPDATE "Product" SET "supplierName" = "Store"."name"
  FROM "Store" WHERE "Product"."storeId" = "Store"."id" AND "Product"."supplierName" IS NULL;
ALTER TABLE "Product" ALTER COLUMN "sku" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "supplierName" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "originalUrl" DROP NOT NULL;

ALTER TABLE "Product"
  ADD COLUMN "subcategory" TEXT,
  ADD COLUMN "costPrice" DECIMAL(12,2),
  ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shippingCost" DECIMAL(12,2),
  ADD COLUMN "estimatedDelivery" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "manualPriceOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pricingRuleType" "PricingRuleType",
  ADD COLUMN "pricingRuleValue" DECIMAL(12,4),
  ADD COLUMN "syncStatus" "ProductSyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "lastPriceSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastStockSyncAt" TIMESTAMP(3);

ALTER TABLE "ProductImage"
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "storageStatus" "ImageStorageStatus" NOT NULL DEFAULT 'EXTERNAL';

UPDATE "ProductImage" SET "sourceUrl" = "url" WHERE "sourceUrl" IS NULL;

ALTER TABLE "PriceHistory" ADD COLUMN "costPrice" DECIMAL(12,2);

CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL,
  "supplierVariantId" TEXT,
  "sku" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "costPrice" DECIMAL(12,2),
  "sellingPrice" DECIMAL(12,2),
  "stock" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricingRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "PricingRuleType" NOT NULL,
  "value" DECIMAL(12,4) NOT NULL,
  "roundingIncrement" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "supplierId" TEXT,
  "categoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportMappingTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fileType" "ImportType" NOT NULL,
  "columnMapping" JSONB NOT NULL,
  "defaults" JSONB,
  "supplierId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportMappingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "type" "ImportType" NOT NULL,
  "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "sourceName" TEXT,
  "columnMapping" JSONB,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "processedItems" INTEGER NOT NULL DEFAULT 0,
  "successItems" INTEGER NOT NULL DEFAULT 0,
  "errorItems" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "supplierId" TEXT,
  "mappingTemplateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportItem" (
  "id" TEXT NOT NULL,
  "sourceRef" TEXT,
  "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "rawData" JSONB,
  "normalizedData" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "jobId" TEXT NOT NULL,
  "productId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVariant_productId_sku_key" ON "ProductVariant"("productId", "sku");
CREATE INDEX "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");
CREATE INDEX "Product_active_archivedAt_availability_idx" ON "Product"("active", "archivedAt", "availability");
CREATE INDEX "Product_categoryId_active_sellingPrice_idx" ON "Product"("categoryId", "active", "currentPrice");
CREATE INDEX "Product_supplierId_active_idx" ON "Product"("storeId", "active");
CREATE INDEX "Product_lastPriceSyncAt_idx" ON "Product"("lastPriceSyncAt");
CREATE INDEX "Product_lastStockSyncAt_idx" ON "Product"("lastStockSyncAt");
CREATE INDEX "Product_sku_idx" ON "Product"("sku");
CREATE INDEX "ProductImage_storageStatus_idx" ON "ProductImage"("storageStatus");
CREATE INDEX "PricingRule_supplierId_active_priority_idx" ON "PricingRule"("supplierId", "active", "priority");
CREATE INDEX "PricingRule_categoryId_active_priority_idx" ON "PricingRule"("categoryId", "active", "priority");
CREATE UNIQUE INDEX "ImportMappingTemplate_supplierId_name_key" ON "ImportMappingTemplate"("supplierId", "name");
CREATE INDEX "ImportMappingTemplate_supplierId_updatedAt_idx" ON "ImportMappingTemplate"("supplierId", "updatedAt");
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");
CREATE INDEX "ImportJob_supplierId_createdAt_idx" ON "ImportJob"("supplierId", "createdAt");
CREATE INDEX "ImportItem_jobId_status_idx" ON "ImportItem"("jobId", "status");
CREATE INDEX "ImportItem_productId_idx" ON "ImportItem"("productId");

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportMappingTemplate" ADD CONSTRAINT "ImportMappingTemplate_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_mappingTemplateId_fkey"
  FOREIGN KEY ("mappingTemplateId") REFERENCES "ImportMappingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportItem" ADD CONSTRAINT "ImportItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
