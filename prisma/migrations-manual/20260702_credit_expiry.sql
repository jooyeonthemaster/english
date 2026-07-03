-- Credit expiry: single balance-wide expiry + per-product validity days.
-- Applied manually against the dev/prod DB (schema drift), see MEMORY: prisma-migration-drift.
--
-- Model: the whole CreditBalance shares one expiresAt. A purchase / admin grant
-- with an expiry extends it to GREATEST(expiresAt, now) + granted days
-- (= now + remaining + granted). Promo/event grants ride the existing value.

ALTER TABLE "credit_balances"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

ALTER TABLE "credit_top_up_products"
  ADD COLUMN IF NOT EXISTS "expiryDays" INTEGER;

-- Default validity for the four catalog products, keyed by credit amount
-- (creditAmount is UNIQUE): 스타터 30일 / 스탠다드 90일 / 프리미엄 180일 / 엔터프라이즈 365일.
UPDATE "credit_top_up_products" SET "expiryDays" = 30  WHERE "creditAmount" = 150;
UPDATE "credit_top_up_products" SET "expiryDays" = 90  WHERE "creditAmount" = 450;
UPDATE "credit_top_up_products" SET "expiryDays" = 180 WHERE "creditAmount" = 1500;
UPDATE "credit_top_up_products" SET "expiryDays" = 365 WHERE "creditAmount" = 4500;
