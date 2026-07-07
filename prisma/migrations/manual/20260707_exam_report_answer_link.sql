-- 학생 답안입력 링크(/a/[token]) — exam_report_students 에 답안 토큰 3컬럼 추가.
-- 적용: npx prisma db execute --file prisma/migrations/manual/20260707_exam_report_answer_link.sql
-- (관례: migrate deploy / db push 금지 — surgical ALTER 만)
ALTER TABLE "exam_report_students" ADD COLUMN IF NOT EXISTS "answerToken" TEXT;
ALTER TABLE "exam_report_students" ADD COLUMN IF NOT EXISTS "answerEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "exam_report_students" ADD COLUMN IF NOT EXISTS "answerSubmittedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_report_students_answerToken_key" ON "exam_report_students"("answerToken");
