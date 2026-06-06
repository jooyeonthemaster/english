-- Academy admin memo — additive only.
-- Adds a single nullable TEXT column holding internal admin notes that are
-- surfaced on the 회원 관리 (member management) list + detail screens.
-- Pre-existing prod drift (similar_exam_generation_jobs, question_sets history,
-- updatedAt defaults, index renames) is deliberately EXCLUDED and must not be
-- touched here — same policy as 20260601000001_add_question_sets.

-- AlterTable
ALTER TABLE "academies" ADD COLUMN "memo" TEXT;
