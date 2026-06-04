CREATE TABLE "similar_exam_generation_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stage" TEXT NOT NULL DEFAULT 'UPLOADING',
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "originalFileName" TEXT,
    "totalPages" INTEGER NOT NULL,
    "pageImageUrls" JSONB NOT NULL,
    "blueprint" JSONB,
    "config" JSONB,
    "result" JSONB,
    "generatedExamId" TEXT,
    "errorMessage" TEXT,
    "triggerRunId" TEXT,
    "creditTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "similar_exam_generation_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "similar_exam_generation_jobs_academyId_status_idx" ON "similar_exam_generation_jobs"("academyId", "status");
CREATE INDEX "similar_exam_generation_jobs_academyId_createdAt_idx" ON "similar_exam_generation_jobs"("academyId", "createdAt");
CREATE INDEX "similar_exam_generation_jobs_generatedExamId_idx" ON "similar_exam_generation_jobs"("generatedExamId");
