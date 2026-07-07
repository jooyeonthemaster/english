-- 실물 쿠폰 CREDIT_GRANT 지급 크레딧의 절대 만료일(캘린더 선택). null=무기한(RIDE).
-- 적용: npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/20260707_printable_coupon_grant_expiry_at.sql

ALTER TABLE "printable_coupon_batches"
  ADD COLUMN IF NOT EXISTS "grantExpiryAt" TIMESTAMP(3);
