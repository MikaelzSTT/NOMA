-- Color/material options describe the product globally. They are deliberately
-- independent from market offers and commercial variants.
-- The source database was audited before this migration was authored and had
-- no populated legacy values. Abort on divergent databases instead of silently
-- discarding data that needs an explicit, reviewed conversion.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProductMarketOfferVariant"
    WHERE "hasColorMaterial" = true
       OR NULLIF(BTRIM("colorMaterialName"), '') IS NOT NULL
       OR NULLIF(BTRIM("materialType"), '') IS NOT NULL
       OR NULLIF(BTRIM("colorHex"), '') IS NOT NULL
       OR NULLIF(BTRIM("textureImageUrl"), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy variant color/material data exists; migrate it explicitly before dropping the columns.';
  END IF;
END $$;

ALTER TABLE "Product"
ADD COLUMN "hasColorMaterialOptions" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProductColorMaterialOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "colorHex" VARCHAR(7),
    "textureImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductColorMaterialOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductColorMaterialOption_productId_sortOrder_idx"
ON "ProductColorMaterialOption"("productId", "sortOrder");

ALTER TABLE "ProductColorMaterialOption"
ADD CONSTRAINT "ProductColorMaterialOption_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductMarketOfferVariant"
DROP COLUMN "hasColorMaterial",
DROP COLUMN "colorMaterialName",
DROP COLUMN "materialType",
DROP COLUMN "colorHex",
DROP COLUMN "textureImageUrl";
