-- Keep question-bank deletion behavior consistent across all code paths.
-- A Question owns these dependent rows; deleting it should remove stale exam
-- links, wrong-answer logs, and AI chat threads instead of failing on FKs.

ALTER TABLE "exam_questions" DROP CONSTRAINT IF EXISTS "exam_questions_questionId_fkey";
ALTER TABLE "exam_questions"
  ADD CONSTRAINT "exam_questions_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wrong_answer_logs" DROP CONSTRAINT IF EXISTS "wrong_answer_logs_questionId_fkey";
ALTER TABLE "wrong_answer_logs"
  ADD CONSTRAINT "wrong_answer_logs_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" DROP CONSTRAINT IF EXISTS "ai_conversations_questionId_fkey";
ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "questions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
