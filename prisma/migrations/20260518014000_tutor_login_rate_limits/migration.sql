CREATE TABLE IF NOT EXISTS "tutor_login_rate_limits" (
  "id" TEXT NOT NULL,
  "academySlug" TEXT NOT NULL,
  "ip" CHAR(45) NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tutor_login_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tutor_login_rate_limits_academySlug_ip_windowStart_key"
  ON "tutor_login_rate_limits"("academySlug", "ip", "windowStart");

CREATE INDEX IF NOT EXISTS "tutor_login_rate_limits_academySlug_windowStart_idx"
  ON "tutor_login_rate_limits"("academySlug", "windowStart");
