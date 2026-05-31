CREATE TABLE IF NOT EXISTS "provider_billing_reconciliations" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "unitType" TEXT,
  "modelPattern" TEXT,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "actualCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "actualCostKrw" INTEGER NOT NULL DEFAULT 0,
  "usdToKrwRate" DECIMAL(12,4) NOT NULL DEFAULT 1350,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "referenceId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_billing_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "provider_billing_reconciliations_periodStart_periodEnd_idx"
  ON "provider_billing_reconciliations"("periodStart", "periodEnd");

CREATE INDEX IF NOT EXISTS "provider_billing_reconciliations_provider_periodStart_idx"
  ON "provider_billing_reconciliations"("provider", "periodStart");
