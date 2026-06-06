-- CreateTable
CREATE TABLE "similar_question_generation_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referenceImage" TEXT NOT NULL,
    "referenceMediaType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "passageIds" JSONB NOT NULL,
    "gradeInfo" TEXT,
    "referenceCount" INTEGER NOT NULL DEFAULT 0,
    "passageCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "similar_question_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "similar_question_generation_jobs_academyId_status_idx" ON "similar_question_generation_jobs"("academyId", "status");

-- CreateIndex
CREATE INDEX "similar_question_generation_jobs_academyId_createdAt_idx" ON "similar_question_generation_jobs"("academyId", "createdAt");
