ALTER TABLE "ProductMarketOfferVariant"
ADD COLUMN "hasColorMaterial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "colorMaterialName" TEXT,
ADD COLUMN "materialType" TEXT,
ADD COLUMN "colorHex" VARCHAR(7),
ADD COLUMN "textureImageUrl" TEXT;
