-- Credit top-up promotion targeting + shareable link.
-- Applied manually against the dev/prod DB (schema drift), see MEMORY: prisma-migration-drift.
--
-- promotionAudience: "ALL" (everyone) | "TARGETED" (only listed academies or link visitors).
-- promotionLinkToken: opaque token for /credits/promo/{token}; any logged-in director
--   who opens a valid (in-window) link unlocks the promotion for their academy.
-- credit_promotion_targets: academies explicitly targeted by a product's promotion.

ALTER TABLE "credit_top_up_products"
  ADD COLUMN IF NOT EXISTS "promotionAudience" TEXT NOT NULL DEFAULT 'ALL';

ALTER TABLE "credit_top_up_products"
  ADD COLUMN IF NOT EXISTS "promotionLinkToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_up_products_promotionLinkToken_key"
  ON "credit_top_up_products" ("promotionLinkToken");

CREATE TABLE IF NOT EXISTS "credit_promotion_targets" (
  "id"        TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_promotion_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_promotion_targets_productId_academyId_key"
  ON "credit_promotion_targets" ("productId", "academyId");

CREATE INDEX IF NOT EXISTS "credit_promotion_targets_academyId_idx"
  ON "credit_promotion_targets" ("academyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'credit_promotion_targets_productId_fkey'
  ) THEN
    ALTER TABLE "credit_promotion_targets"
      ADD CONSTRAINT "credit_promotion_targets_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "credit_top_up_products" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
