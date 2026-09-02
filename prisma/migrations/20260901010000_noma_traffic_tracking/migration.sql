-- CreateTable
CREATE TABLE "NomaTrafficVisit" (
    "id" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "market" "Market" NOT NULL,
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

    CONSTRAINT "NomaTrafficVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NomaTrafficVisit_dedupeKey_key" ON "NomaTrafficVisit"("dedupeKey");
CREATE INDEX "NomaTrafficVisit_visitedAt_idx" ON "NomaTrafficVisit"("visitedAt");
CREATE INDEX "NomaTrafficVisit_market_visitedAt_idx" ON "NomaTrafficVisit"("market", "visitedAt");
CREATE INDEX "NomaTrafficVisit_utmSource_visitedAt_idx" ON "NomaTrafficVisit"("utmSource", "visitedAt");
CREATE INDEX "NomaTrafficVisit_utmCampaign_visitedAt_idx" ON "NomaTrafficVisit"("utmCampaign", "visitedAt");
CREATE INDEX "NomaTrafficVisit_gclid_visitedAt_idx" ON "NomaTrafficVisit"("gclid", "visitedAt");
