ALTER TABLE "similar_question_generation_jobs"
ADD COLUMN IF NOT EXISTS "skipSummary" JSONB;
