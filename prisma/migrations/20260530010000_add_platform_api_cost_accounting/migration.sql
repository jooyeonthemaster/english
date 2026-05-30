CREATE TABLE IF NOT EXISTS "provider_pricings" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelPattern" TEXT,
  "unitType" TEXT NOT NULL DEFAULT 'TOKENS',
  "inputUsdPer1M" DECIMAL(12,6),
  "outputUsdPer1M" DECIMAL(12,6),
  "unitUsd" DECIMAL(12,6),
  "usdToKrwRate" DECIMAL(12,4) NOT NULL DEFAULT 1350,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_pricings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "provider_pricings_provider_unitType_isActive_effectiveFrom_idx"
  ON "provider_pricings"("provider", "unitType", "isActive", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "provider_pricings_effectiveFrom_effectiveTo_idx"
  ON "provider_pricings"("effectiveFrom", "effectiveTo");

CREATE TABLE IF NOT EXISTS "platform_api_usage_costs" (
  "id" TEXT NOT NULL,
  "academyId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceDetail" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "operationType" TEXT,
  "unitType" TEXT NOT NULL DEFAULT 'TOKENS',
  "unitCount" INTEGER NOT NULL DEFAULT 1,
  "calls" INTEGER NOT NULL DEFAULT 1,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "inputUsdPer1M" DECIMAL(12,6),
  "outputUsdPer1M" DECIMAL(12,6),
  "unitUsd" DECIMAL(12,6),
  "usdToKrwRate" DECIMAL(12,4) NOT NULL DEFAULT 1350,
  "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "costKrw" INTEGER NOT NULL DEFAULT 0,
  "pricingSource" TEXT NOT NULL DEFAULT 'MISSING',
  "pricingId" TEXT,
  "metadata" JSONB,
  "usageAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_api_usage_costs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_api_usage_costs_sourceKey_key"
  ON "platform_api_usage_costs"("sourceKey");

CREATE INDEX IF NOT EXISTS "platform_api_usage_costs_usageAt_idx"
  ON "platform_api_usage_costs"("usageAt");

CREATE INDEX IF NOT EXISTS "platform_api_usage_costs_academyId_usageAt_idx"
  ON "platform_api_usage_costs"("academyId", "usageAt");

CREATE INDEX IF NOT EXISTS "platform_api_usage_costs_provider_unitType_usageAt_idx"
  ON "platform_api_usage_costs"("provider", "unitType", "usageAt");

CREATE INDEX IF NOT EXISTS "platform_api_usage_costs_sourceType_sourceId_idx"
  ON "platform_api_usage_costs"("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "platform_api_usage_costs_pricingSource_usageAt_idx"
  ON "platform_api_usage_costs"("pricingSource", "usageAt");

ALTER TABLE "platform_api_usage_costs"
  ADD CONSTRAINT "platform_api_usage_costs_academyId_fkey"
  FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_api_usage_costs"
  ADD CONSTRAINT "platform_api_usage_costs_pricingId_fkey"
  FOREIGN KEY ("pricingId") REFERENCES "provider_pricings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
