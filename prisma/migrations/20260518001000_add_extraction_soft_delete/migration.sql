-- Soft-delete support for extraction jobs and M1 passage drafts.

ALTER TABLE "extraction_jobs"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

ALTER TABLE "extraction_m1_passage_drafts"
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

CREATE INDEX IF NOT EXISTS "extraction_jobs_deletedAt_idx"
    ON "extraction_jobs"("deletedAt");

CREATE INDEX IF NOT EXISTS "extraction_jobs_academyId_deletedAt_createdAt_idx"
    ON "extraction_jobs"("academyId", "deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_deletedAt_idx"
    ON "extraction_m1_passage_drafts"("deletedAt");

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_jobId_deletedAt_idx"
    ON "extraction_m1_passage_drafts"("jobId", "deletedAt");
