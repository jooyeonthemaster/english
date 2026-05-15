-- M1 passage extraction drafts keep the raw OCR passage and restored passage together.

CREATE TABLE IF NOT EXISTS "extraction_m1_passage_drafts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceMaterialId" TEXT,
    "passageOrder" INTEGER NOT NULL,
    "sourcePageIndex" INTEGER[] NOT NULL,
    "title" TEXT,
    "rawText" TEXT NOT NULL,
    "restoredText" TEXT NOT NULL,
    "teacherText" TEXT NOT NULL,
    "restorationStatus" TEXT NOT NULL DEFAULT 'RESTORED',
    "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "confidence" DOUBLE PRECISION,
    "warnings" JSONB,
    "metadata" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "savedPassageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_m1_passage_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_m1_passage_draft_changes" (
    "id" TEXT NOT NULL,
    "passageDraftId" TEXT NOT NULL,
    "sentenceOrder" INTEGER,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "changeType" TEXT,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourcePageIndex" INTEGER[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_m1_passage_draft_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_jobId_passageOrder_key" ON "extraction_m1_passage_drafts"("jobId", "passageOrder");
CREATE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_jobId_idx" ON "extraction_m1_passage_drafts"("jobId");
CREATE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_sourceMaterialId_idx" ON "extraction_m1_passage_drafts"("sourceMaterialId");
CREATE INDEX IF NOT EXISTS "extraction_m1_passage_drafts_reviewStatus_idx" ON "extraction_m1_passage_drafts"("reviewStatus");
CREATE INDEX IF NOT EXISTS "extraction_m1_passage_draft_changes_passageDraftId_idx" ON "extraction_m1_passage_draft_changes"("passageDraftId");

ALTER TABLE "extraction_m1_passage_drafts"
ADD CONSTRAINT "extraction_m1_passage_drafts_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_m1_passage_drafts"
ADD CONSTRAINT "extraction_m1_passage_drafts_sourceMaterialId_fkey"
FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_m1_passage_draft_changes"
ADD CONSTRAINT "extraction_m1_passage_draft_changes_passageDraftId_fkey"
FOREIGN KEY ("passageDraftId") REFERENCES "extraction_m1_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
