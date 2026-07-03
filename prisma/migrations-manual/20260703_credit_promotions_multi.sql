-- Multiple concurrent promotions per product.
-- Applied manually against the dev/prod DB (schema drift), see MEMORY: prisma-migration-drift.
--
-- Promotions become their own rows (credit_promotions, N per product). The old
-- single-promotion columns on credit_top_up_products (discountRate/bonusRate/
-- promotion*) are migrated into rows and left in the DB but no longer mapped by
-- Prisma. credit_promotion_targets is repointed from productId → promotionId.

-- 1) New promotions table.
CREATE TABLE IF NOT EXISTS "credit_promotions" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "name"         TEXT,
  "discountRate" INTEGER NOT NULL DEFAULT 0,
  "bonusRate"    INTEGER NOT NULL DEFAULT 0,
  "startsAt"     TIMESTAMP(3) NOT NULL,
  "endsAt"       TIMESTAMP(3) NOT NULL,
  "audience"     TEXT NOT NULL DEFAULT 'ALL',
  "linkToken"    TEXT,
  "priority"     INTEGER NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_promotions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_promotions_linkToken_key" ON "credit_promotions" ("linkToken");
CREATE INDEX IF NOT EXISTS "credit_promotions_productId_idx" ON "credit_promotions" ("productId");
CREATE INDEX IF NOT EXISTS "credit_promotions_linkToken_idx" ON "credit_promotions" ("linkToken");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'credit_promotions_productId_fkey') THEN
    ALTER TABLE "credit_promotions"
      ADD CONSTRAINT "credit_promotions_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "credit_top_up_products" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Backfill: migrate each product's inline promotion into a promotion row.
--    Deterministic id 'promo_' || productId so targets can be repointed by join.
INSERT INTO "credit_promotions" (
  "id", "productId", "name", "discountRate", "bonusRate", "startsAt", "endsAt",
  "audience", "linkToken", "priority", "isActive", "createdAt", "updatedAt"
)
SELECT
  'promo_' || "id", "id", "promotionName", "discountRate", "bonusRate",
  "promotionStartsAt", "promotionEndsAt", COALESCE("promotionAudience", 'ALL'),
  "promotionLinkToken", 0, true, now(), now()
FROM "credit_top_up_products"
WHERE ("discountRate" > 0 OR "bonusRate" > 0)
  AND "promotionStartsAt" IS NOT NULL
  AND "promotionEndsAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- 3) Repoint credit_promotion_targets: productId → promotionId.
ALTER TABLE "credit_promotion_targets" ADD COLUMN IF NOT EXISTS "promotionId" TEXT;

UPDATE "credit_promotion_targets" t
SET "promotionId" = 'promo_' || t."productId"
WHERE t."promotionId" IS NULL
  AND EXISTS (SELECT 1 FROM "credit_promotions" p WHERE p."id" = 'promo_' || t."productId");

-- Drop targets whose product had no migrated promotion (orphans).
DELETE FROM "credit_promotion_targets"
WHERE "promotionId" IS NULL
   OR "promotionId" NOT IN (SELECT "id" FROM "credit_promotions");

-- Retire the old productId wiring.
ALTER TABLE "credit_promotion_targets" DROP CONSTRAINT IF EXISTS "credit_promotion_targets_productId_fkey";
ALTER TABLE "credit_promotion_targets" DROP CONSTRAINT IF EXISTS "credit_promotion_targets_productId_academyId_key";
ALTER TABLE "credit_promotion_targets" DROP COLUMN IF EXISTS "productId";

ALTER TABLE "credit_promotion_targets" ALTER COLUMN "promotionId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "credit_promotion_targets_promotionId_academyId_key"
  ON "credit_promotion_targets" ("promotionId", "academyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'credit_promotion_targets_promotionId_fkey') THEN
    ALTER TABLE "credit_promotion_targets"
      ADD CONSTRAINT "credit_promotion_targets_promotionId_fkey"
      FOREIGN KEY ("promotionId") REFERENCES "credit_promotions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
