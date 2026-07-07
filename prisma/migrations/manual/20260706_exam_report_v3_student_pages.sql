-- 시험 리포트 v3(직접분석 재설계): 학생별 시험지 이미지 + AI 판독 상태 컬럼 (26-07-06)
-- 적용: npx prisma db execute --file prisma/migrations/manual/20260706_exam_report_v3_student_pages.sql --schema prisma/schema.prisma
-- 멱등 — migrate deploy / db push 금지 관례 준수.

ALTER TABLE "exam_report_students" ADD COLUMN IF NOT EXISTS "sourceFiles" JSONB;
ALTER TABLE "exam_report_students" ADD COLUMN IF NOT EXISTS "readState" JSONB;
