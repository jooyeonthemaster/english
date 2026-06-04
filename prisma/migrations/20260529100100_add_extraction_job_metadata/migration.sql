-- Add a Json column on extraction_jobs so finalize can read follow-up hints
-- (currently used by the "빠른 분석" / "빠른 생성" flows to auto-promote drafts
-- and fan out workbench AI jobs after restoration). Nullable so existing rows
-- and the regular bulk-extract path remain untouched.
ALTER TABLE "extraction_jobs" ADD COLUMN "metadata" JSONB;
