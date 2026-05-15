-- Teacher-editable label for an extraction job. UI prefers this when set,
-- otherwise falls back to `originalFileName`. Original file name stays as-is
-- for audit / debugging.

ALTER TABLE "extraction_jobs"
ADD COLUMN IF NOT EXISTS "displayName" TEXT;
