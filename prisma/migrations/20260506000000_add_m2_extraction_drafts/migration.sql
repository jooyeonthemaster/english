-- M2 extraction drafts: review-first passage/question registration.

CREATE TABLE IF NOT EXISTS "extraction_passage_drafts" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "extractionResultId" TEXT,
  "sourceMaterialId" TEXT,
  "passageOrder" INTEGER NOT NULL,
  "sourcePageIndex" INTEGER[],
  "problemText" TEXT NOT NULL,
  "restoredText" TEXT,
  "teacherText" TEXT,
  "restorationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "confidence" DOUBLE PRECISION,
  "warnings" JSONB,
  "metadata" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "extraction_passage_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_question_drafts" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "passageDraftId" TEXT,
  "questionOrder" INTEGER NOT NULL,
  "questionNumber" INTEGER,
  "sourcePageIndex" INTEGER[],
  "stem" TEXT NOT NULL,
  "choices" JSONB,
  "answer" TEXT,
  "explanation" TEXT,
  "questionType" TEXT,
  "confidence" DOUBLE PRECISION,
  "warnings" JSONB,
  "reviewStatus" TEXT NOT NULL DEFAULT 'DRAFT',
  "metadata" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "extraction_question_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_passage_sentences" (
  "id" TEXT NOT NULL,
  "passageDraftId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "problemText" TEXT,
  "restoredText" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OK',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "extraction_passage_sentences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_passage_restorations" (
  "id" TEXT NOT NULL,
  "passageDraftId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "originalText" TEXT NOT NULL,
  "restoredText" TEXT NOT NULL,
  "modelUsed" TEXT,
  "unresolvedMarkers" JSONB,
  "warnings" JSONB,
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "extraction_passage_restorations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_passage_restoration_changes" (
  "id" TEXT NOT NULL,
  "restorationId" TEXT NOT NULL,
  "sentenceOrder" INTEGER,
  "before" TEXT NOT NULL,
  "after" TEXT NOT NULL,
  "reason" TEXT,
  "evidenceQuestionNumber" INTEGER,
  "evidenceType" TEXT,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extraction_passage_restoration_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "extraction_passage_source_matches" (
  "id" TEXT NOT NULL,
  "passageDraftId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceRef" TEXT,
  "title" TEXT,
  "publisher" TEXT,
  "unit" TEXT,
  "year" INTEGER,
  "confidence" DOUBLE PRECISION,
  "method" TEXT NOT NULL,
  "reason" TEXT,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "extraction_passage_source_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_passage_drafts_jobId_passageOrder_key"
  ON "extraction_passage_drafts"("jobId", "passageOrder");
CREATE INDEX IF NOT EXISTS "extraction_passage_drafts_jobId_idx"
  ON "extraction_passage_drafts"("jobId");
CREATE INDEX IF NOT EXISTS "extraction_passage_drafts_sourceMaterialId_idx"
  ON "extraction_passage_drafts"("sourceMaterialId");
CREATE INDEX IF NOT EXISTS "extraction_passage_drafts_reviewStatus_idx"
  ON "extraction_passage_drafts"("reviewStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_question_drafts_jobId_questionOrder_key"
  ON "extraction_question_drafts"("jobId", "questionOrder");
CREATE INDEX IF NOT EXISTS "extraction_question_drafts_jobId_idx"
  ON "extraction_question_drafts"("jobId");
CREATE INDEX IF NOT EXISTS "extraction_question_drafts_passageDraftId_idx"
  ON "extraction_question_drafts"("passageDraftId");
CREATE INDEX IF NOT EXISTS "extraction_question_drafts_reviewStatus_idx"
  ON "extraction_question_drafts"("reviewStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_passage_sentences_passageDraftId_order_key"
  ON "extraction_passage_sentences"("passageDraftId", "order");
CREATE INDEX IF NOT EXISTS "extraction_passage_sentences_passageDraftId_idx"
  ON "extraction_passage_sentences"("passageDraftId");

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_passage_restorations_passageDraftId_key"
  ON "extraction_passage_restorations"("passageDraftId");
CREATE INDEX IF NOT EXISTS "extraction_passage_restorations_status_idx"
  ON "extraction_passage_restorations"("status");

CREATE INDEX IF NOT EXISTS "extraction_passage_restoration_changes_restorationId_idx"
  ON "extraction_passage_restoration_changes"("restorationId");

CREATE INDEX IF NOT EXISTS "extraction_passage_source_matches_passageDraftId_idx"
  ON "extraction_passage_source_matches"("passageDraftId");
CREATE INDEX IF NOT EXISTS "extraction_passage_source_matches_sourceId_idx"
  ON "extraction_passage_source_matches"("sourceId");

ALTER TABLE "extraction_passage_drafts"
  ADD CONSTRAINT "extraction_passage_drafts_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extraction_passage_drafts"
  ADD CONSTRAINT "extraction_passage_drafts_extractionResultId_fkey"
  FOREIGN KEY ("extractionResultId") REFERENCES "extraction_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "extraction_passage_drafts"
  ADD CONSTRAINT "extraction_passage_drafts_sourceMaterialId_fkey"
  FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_question_drafts"
  ADD CONSTRAINT "extraction_question_drafts_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extraction_question_drafts"
  ADD CONSTRAINT "extraction_question_drafts_passageDraftId_fkey"
  FOREIGN KEY ("passageDraftId") REFERENCES "extraction_passage_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "extraction_passage_sentences"
  ADD CONSTRAINT "extraction_passage_sentences_passageDraftId_fkey"
  FOREIGN KEY ("passageDraftId") REFERENCES "extraction_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_passage_restorations"
  ADD CONSTRAINT "extraction_passage_restorations_passageDraftId_fkey"
  FOREIGN KEY ("passageDraftId") REFERENCES "extraction_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_passage_restoration_changes"
  ADD CONSTRAINT "extraction_passage_restoration_changes_restorationId_fkey"
  FOREIGN KEY ("restorationId") REFERENCES "extraction_passage_restorations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_passage_source_matches"
  ADD CONSTRAINT "extraction_passage_source_matches_passageDraftId_fkey"
  FOREIGN KEY ("passageDraftId") REFERENCES "extraction_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
