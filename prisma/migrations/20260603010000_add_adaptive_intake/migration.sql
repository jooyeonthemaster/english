-- Adaptive Intake — additive columns only (nullable / array-default).
-- Safe to apply online: existing rows untouched, no behavior change until the
-- EXTRACTION_ADAPTIVE_INTAKE feature flag is enabled and new code reads them.

-- Passage: extraction lineage. sourcePageIndex was previously LOST on promote
-- (no column existed) — this restores "where did this passage come from?".
ALTER TABLE "passages" ADD COLUMN "sourcePageIndex" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "passages" ADD COLUMN "extractionOutput" TEXT;

-- ExtractionJob: triage / intake-plan snapshot + routing audit.
ALTER TABLE "extraction_jobs" ADD COLUMN "inputType" TEXT;
ALTER TABLE "extraction_jobs" ADD COLUMN "intakePlan" JSONB;
ALTER TABLE "extraction_jobs" ADD COLUMN "triageConfidence" DOUBLE PRECISION;
ALTER TABLE "extraction_jobs" ADD COLUMN "estimatedPassageCount" INTEGER;

-- ExtractionItem: crop region / segment provenance / incomplete reason.
ALTER TABLE "extraction_items" ADD COLUMN "cropBox" JSONB;
ALTER TABLE "extraction_items" ADD COLUMN "segmentKind" TEXT;
ALTER TABLE "extraction_items" ADD COLUMN "incompleteReason" TEXT;

-- ExtractionPage: D4 multi-page bundle inputs.
ALTER TABLE "extraction_pages" ADD COLUMN "bundleKey" TEXT;
ALTER TABLE "extraction_pages" ADD COLUMN "spanPageIndices" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
