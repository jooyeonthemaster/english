-- 시험지 분석 리포트 공개 링크(/r/exam/[token]) — exam_analyses 에 공유 토큰 3컬럼 추가(26-09-03).
-- 학생 개인 리포트 공유(exam_report_students.shareToken, /r/[token])와 별개 축이다.
-- 적용: npx prisma db execute --file prisma/migrations/manual/20260903_exam_analysis_share.sql
-- (관례: migrate deploy / db push 금지 — surgical ALTER 만. 전부 additive·IF NOT EXISTS 라 재실행 안전)
ALTER TABLE "exam_analyses" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "exam_analyses" ADD COLUMN IF NOT EXISTS "shareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "exam_analyses" ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_analyses_shareToken_key" ON "exam_analyses"("shareToken");
