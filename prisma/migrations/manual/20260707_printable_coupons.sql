-- 실물(인쇄형) 쿠폰: 발급 배치 + 인쇄 코드(=학원 보유 쿠폰) 2테이블
-- 드리프트 주의: dev DB가 기록 마이그레이션보다 앞서 있어 `migrate deploy` 금지.
-- 적용: npx prisma db execute --file prisma/migrations/manual/20260707_printable_coupons.sql

CREATE TABLE IF NOT EXISTS "printable_coupon_batches" (
  "id"                   TEXT NOT NULL,
  "batchName"            TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "description"         TEXT,
  "effectType"          TEXT NOT NULL DEFAULT 'CREDIT_GRANT',
  "grantCredits"        INTEGER,
  "grantExpiryDays"     INTEGER,
  "discountAmount"      INTEGER,
  "discountPercent"     INTEGER,
  "validUntil"          TIMESTAMP(3),
  "quantity"            INTEGER NOT NULL,
  "perAcademyLimit"     INTEGER NOT NULL DEFAULT 1,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdByAdminId"    TEXT,
  "createdByAdminEmail" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "printable_coupon_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "printable_coupon_batches_createdAt_idx"
  ON "printable_coupon_batches" ("createdAt");

CREATE TABLE IF NOT EXISTS "printable_coupon_codes" (
  "id"                 TEXT NOT NULL,
  "batchId"            TEXT NOT NULL,
  "serialNumber"       VARCHAR(16) NOT NULL,
  "tokenHash"          TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'ACTIVE',
  "claimedByAcademyId" TEXT,
  "claimedByStaffId"   TEXT,
  "claimedAt"          TIMESTAMP(3),
  "creditTxId"         TEXT,
  "usedTopUpId"        TEXT,
  "usedAt"             TIMESTAMP(3),
  "expiresAt"          TIMESTAMP(3),
  "printedAt"          TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "printable_coupon_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "printable_coupon_codes_serialNumber_key"
  ON "printable_coupon_codes" ("serialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "printable_coupon_codes_tokenHash_key"
  ON "printable_coupon_codes" ("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "printable_coupon_codes_creditTxId_key"
  ON "printable_coupon_codes" ("creditTxId");
CREATE UNIQUE INDEX IF NOT EXISTS "printable_coupon_codes_usedTopUpId_key"
  ON "printable_coupon_codes" ("usedTopUpId");
CREATE INDEX IF NOT EXISTS "printable_coupon_codes_batchId_status_idx"
  ON "printable_coupon_codes" ("batchId", "status");
CREATE INDEX IF NOT EXISTS "printable_coupon_codes_claimedByAcademyId_status_idx"
  ON "printable_coupon_codes" ("claimedByAcademyId", "status");

DO $$ BEGIN
  ALTER TABLE "printable_coupon_codes"
    ADD CONSTRAINT "printable_coupon_codes_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "printable_coupon_batches" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
