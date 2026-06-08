-- CreateTable
CREATE TABLE "custom_type_analysis_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "referenceImage" TEXT NOT NULL,
    "referenceMediaType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "gradeInfo" TEXT,
    "manualCrop" BOOLEAN NOT NULL DEFAULT true,
    "createdTypeId" TEXT,
    "suggestedName" TEXT,
    "resultSpec" JSONB,
    "sourceAnalysis" JSONB,
    "analysisModel" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "custom_type_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_type_analysis_jobs_academyId_status_idx" ON "custom_type_analysis_jobs"("academyId", "status");

-- CreateIndex
CREATE INDEX "custom_type_analysis_jobs_academyId_createdAt_idx" ON "custom_type_analysis_jobs"("academyId", "createdAt");
