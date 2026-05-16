-- Preserve the original structured AI payload so generated questions can keep
-- their type-specific UI after being saved to the question bank.
ALTER TABLE "questions" ADD COLUMN "structuredData" JSONB;
