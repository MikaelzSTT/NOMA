CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'IN_PROCESS');

CREATE TYPE "PaymentProvider" AS ENUM ('MERCADO_PAGO');

CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "publicOrderNumber" VARCHAR(32) NOT NULL,
  "market" "Market" NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paymentProvider" "PaymentProvider" NOT NULL,
  "productId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "variantId" TEXT,
  "productNameSnapshot" VARCHAR(255) NOT NULL,
  "productSlugSnapshot" VARCHAR(255) NOT NULL,
  "variantNameSnapshot" VARCHAR(255),
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "shippingAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "buyerEmail" VARCHAR(255),
  "buyerName" VARCHAR(255),
  "buyerPhone" VARCHAR(40),
  "shippingAddress" JSONB,
  "mercadoPagoPreferenceId" VARCHAR(120),
  "mercadoPagoPaymentId" VARCHAR(120),
  "mercadoPagoCheckoutUrl" VARCHAR(1000),
  "externalReference" VARCHAR(80) NOT NULL,
  "checkoutIdempotencyKey" VARCHAR(120) NOT NULL,
  "sessionHash" VARCHAR(64),
  "utmSource" VARCHAR(255),
  "utmMedium" VARCHAR(255),
  "utmCampaign" VARCHAR(255),
  "utmContent" VARCHAR(255),
  "utmTerm" VARCHAR(255),
  "gclid" VARCHAR(255),
  "referrer" VARCHAR(600),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NomaPurchaseIntentEvent" ADD COLUMN "orderId" TEXT;

CREATE UNIQUE INDEX "Order_publicOrderNumber_key" ON "Order"("publicOrderNumber");
CREATE UNIQUE INDEX "Order_mercadoPagoPreferenceId_key" ON "Order"("mercadoPagoPreferenceId");
CREATE UNIQUE INDEX "Order_mercadoPagoPaymentId_key" ON "Order"("mercadoPagoPaymentId");
CREATE UNIQUE INDEX "Order_externalReference_key" ON "Order"("externalReference");
CREATE UNIQUE INDEX "Order_checkoutIdempotencyKey_key" ON "Order"("checkoutIdempotencyKey");
CREATE INDEX "Order_market_createdAt_idx" ON "Order"("market", "createdAt");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE INDEX "Order_productId_createdAt_idx" ON "Order"("productId", "createdAt");
CREATE INDEX "Order_offerId_createdAt_idx" ON "Order"("offerId", "createdAt");
CREATE INDEX "NomaPurchaseIntentEvent_orderId_idx" ON "NomaPurchaseIntentEvent"("orderId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ProductMarketOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductMarketOfferVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NomaPurchaseIntentEvent" ADD CONSTRAINT "NomaPurchaseIntentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
