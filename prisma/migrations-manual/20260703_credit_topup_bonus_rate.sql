-- Credit top-up promotion: bonus credits (지급 추가 %).
-- Applied manually against the dev/prod DB (schema drift), see MEMORY: prisma-migration-drift.
--
-- bonusRate = extra credits granted as a percentage of creditAmount while the
-- promotion window is active. e.g. 50 → buyer pays the price but receives
-- creditAmount × 1.5 (총 150% 지급). 0 = no bonus (default). The buyer's paid
-- price is unaffected — only the granted credit amount is inflated.

ALTER TABLE "credit_top_up_products"
  ADD COLUMN IF NOT EXISTS "bonusRate" INTEGER NOT NULL DEFAULT 0;
