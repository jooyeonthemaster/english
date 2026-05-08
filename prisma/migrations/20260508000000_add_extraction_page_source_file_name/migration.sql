ALTER TABLE "extraction_pages"
ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;
