-- 실물 쿠폰 등록 rate-limit(코드 추측 방지) — fixed window 카운터.
-- 적용: npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/manual/20260707_printable_coupon_ratelimit.sql

CREATE TABLE IF NOT EXISTS "printable_coupon_claim_rate_limits" (
  "id"          TEXT NOT NULL,
  "scope"       VARCHAR(16) NOT NULL,
  "key"         VARCHAR(128) NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "printable_coupon_claim_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "printable_coupon_claim_rate_limits_scope_key_windowStart_key"
  ON "printable_coupon_claim_rate_limits" ("scope", "key", "windowStart");
