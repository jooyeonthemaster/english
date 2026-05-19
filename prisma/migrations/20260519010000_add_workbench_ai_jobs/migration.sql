-- Persistent Trigger.dev-owned AI workbench jobs.
CREATE TABLE "workbench_ai_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "passageId" TEXT,
    "mode" TEXT,
    "questionType" TEXT,
    "generationPlan" TEXT NOT NULL DEFAULT 'STANDARD',
    "difficulty" TEXT,
    "requestedCount" INTEGER NOT NULL DEFAULT 1,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "triggerRunId" TEXT,
    "creditTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workbench_ai_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workbench_ai_jobs_academyId_domain_status_idx" ON "workbench_ai_jobs"("academyId", "domain", "status");
CREATE INDEX "workbench_ai_jobs_academyId_createdAt_idx" ON "workbench_ai_jobs"("academyId", "createdAt");
CREATE INDEX "workbench_ai_jobs_passageId_idx" ON "workbench_ai_jobs"("passageId");
CREATE INDEX "workbench_ai_jobs_status_createdAt_idx" ON "workbench_ai_jobs"("status", "createdAt");

ALTER TABLE "workbench_ai_jobs"
  ADD CONSTRAINT "workbench_ai_jobs_academyId_fkey"
  FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workbench_ai_jobs"
  ADD CONSTRAINT "workbench_ai_jobs_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workbench_ai_jobs"
  ADD CONSTRAINT "workbench_ai_jobs_passageId_fkey"
  FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
