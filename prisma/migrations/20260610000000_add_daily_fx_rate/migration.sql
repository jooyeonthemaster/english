-- Daily USD->KRW FX rate cache — additive only.
-- Stores one ECB (Frankfurter) daily reference rate per KST date so platform
-- API costs convert with the real daily rate instead of a fixed 1350.
-- Rows are fetched lazily (self-healing) on dashboard/sync load.
-- Pre-existing prod drift is deliberately EXCLUDED here — same policy as
-- 20260603000000_add_academy_memo.

-- CreateTable
CREATE TABLE "daily_fx_rates" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'USD',
    "quote" TEXT NOT NULL DEFAULT 'KRW',
    "rate" DECIMAL(12,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FRANKFURTER',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_fx_rates_date_key" ON "daily_fx_rates"("date");
