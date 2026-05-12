-- Store source/original candidates used by the M1 passage restoration pipeline.

CREATE TABLE IF NOT EXISTS "extraction_m1_passage_source_matches" (
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

    CONSTRAINT "extraction_m1_passage_source_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_source_matches_passageDraftId_idx" ON "extraction_m1_passage_source_matches"("passageDraftId");
CREATE INDEX IF NOT EXISTS "extraction_m1_passage_source_matches_sourceId_idx" ON "extraction_m1_passage_source_matches"("sourceId");

ALTER TABLE "extraction_m1_passage_source_matches"
ADD CONSTRAINT "extraction_m1_passage_source_matches_passageDraftId_fkey"
FOREIGN KEY ("passageDraftId") REFERENCES "extraction_m1_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
