-- Promotion bundles: expose several promotions through ONE shareable link
-- (/credits/promo/b/{slug}) and landing page. Claiming seeds every member
-- promotion's linkToken into the promo cookie (multi-token), so the existing
-- pricing engine applies each promotion to its own product unchanged.
-- Applied manually against the dev/prod DB (schema drift), see MEMORY: prisma-migration-drift.

CREATE TABLE IF NOT EXISTS "credit_promotion_bundles" (
  "id"               TEXT NOT NULL,
  "slug"             TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdByAdminId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_promotion_bundles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_promotion_bundles_slug_key"
  ON "credit_promotion_bundles" ("slug");

CREATE TABLE IF NOT EXISTS "credit_promotion_bundle_items" (
  "id"          TEXT NOT NULL,
  "bundleId"    TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "credit_promotion_bundle_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_promotion_bundle_items_bundleId_promotionId_key"
  ON "credit_promotion_bundle_items" ("bundleId", "promotionId");

CREATE INDEX IF NOT EXISTS "credit_promotion_bundle_items_promotionId_idx"
  ON "credit_promotion_bundle_items" ("promotionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'credit_promotion_bundle_items_bundleId_fkey'
  ) THEN
    ALTER TABLE "credit_promotion_bundle_items"
      ADD CONSTRAINT "credit_promotion_bundle_items_bundleId_fkey"
      FOREIGN KEY ("bundleId") REFERENCES "credit_promotion_bundles" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'credit_promotion_bundle_items_promotionId_fkey'
  ) THEN
    ALTER TABLE "credit_promotion_bundle_items"
      ADD CONSTRAINT "credit_promotion_bundle_items_promotionId_fkey"
      FOREIGN KEY ("promotionId") REFERENCES "credit_promotions" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
