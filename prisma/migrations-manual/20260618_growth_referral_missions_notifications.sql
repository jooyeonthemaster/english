-- ============================================================================
-- Growth: Referral + Credit Missions + Notifications (surgical, additive-only)
-- Apply with: npx prisma db execute --file <this> --schema prisma/schema.prisma
-- NOTE: generated via `prisma migrate diff` then trimmed to ONLY the new tables.
--       Pre-existing schema drift (DROP DEFAULTs, DROP TABLE feature_pressure,
--       RenameIndex) was intentionally excluded — do NOT add it back.
-- ============================================================================

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdByStaffId" TEXT,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalSignups" INTEGER NOT NULL DEFAULT 0,
    "totalRewarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerAcademyId" TEXT NOT NULL,
    "referredAcademyId" TEXT NOT NULL,
    "referredStaffId" TEXT,
    "referrerReward" INTEGER NOT NULL DEFAULT 0,
    "referredReward" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "fraudSignals" JSONB,
    "referrerTxId" TEXT,
    "referredTxId" TEXT,
    "signupIp" TEXT,
    "signupUserAgent" TEXT,
    "grantedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "clawedBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_missions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "rewardCredits" INTEGER NOT NULL,
    "iconKey" TEXT,
    "actionUrl" TEXT,
    "ctaLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxRewardPerMonth" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_mission_claims" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "missionKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "rewardCredits" INTEGER NOT NULL,
    "creditTxId" TEXT,
    "claimedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_mission_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "recipientStaffId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "iconKey" TEXT,
    "actionUrl" TEXT,
    "data" JSONB,
    "groupKey" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_states" (
    "staffId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_states_pkey" PRIMARY KEY ("staffId")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_academyId_key" ON "referral_codes"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE INDEX "referral_codes_code_idx" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredAcademyId_key" ON "referrals"("referredAcademyId");

-- CreateIndex
CREATE INDEX "referrals_referrerAcademyId_createdAt_idx" ON "referrals"("referrerAcademyId", "createdAt");

-- CreateIndex
CREATE INDEX "referrals_status_createdAt_idx" ON "referrals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "referrals_referralCodeId_idx" ON "referrals"("referralCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_missions_key_key" ON "credit_missions"("key");

-- CreateIndex
CREATE INDEX "credit_missions_isActive_sortOrder_idx" ON "credit_missions"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "academy_mission_claims_academyId_createdAt_idx" ON "academy_mission_claims"("academyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "academy_mission_claims_academyId_missionKey_periodKey_key" ON "academy_mission_claims"("academyId", "missionKey", "periodKey");

-- CreateIndex
CREATE INDEX "notifications_recipientStaffId_createdAt_idx" ON "notifications"("recipientStaffId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientStaffId_readAt_idx" ON "notifications"("recipientStaffId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_academyId_createdAt_idx" ON "notifications"("academyId", "createdAt");

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerAcademyId_fkey" FOREIGN KEY ("referrerAcademyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredAcademyId_fkey" FOREIGN KEY ("referredAcademyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_mission_claims" ADD CONSTRAINT "academy_mission_claims_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientStaffId_fkey" FOREIGN KEY ("recipientStaffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_states" ADD CONSTRAINT "notification_states_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
