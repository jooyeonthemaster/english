-- 26-07-09 시험지 배포·OMR 즉시채점·태블릿 응시·응시이력 통합
-- 관례: surgical ALTER 전용 (migrate deploy / db push 금지). 전부 additive nullable — 무회귀.
-- 적용: Supabase Management API 또는 prisma db execute.

-- ── exam_submissions: 할당(ASSIGNED)→응시(IN_PROGRESS)→제출(SUBMITTED)→채점(GRADED) 수명주기 확장
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "accessToken" text;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "accessEnabled" boolean NOT NULL DEFAULT false;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "mode" text;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "responses" jsonb;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "scoreSummary" jsonb;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "orderSnapshot" jsonb;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "assignedAt" timestamptz;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "assignedBy" text;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "examReportStudentId" text;
ALTER TABLE exam_submissions ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS "exam_submissions_accessToken_key" ON exam_submissions("accessToken");

-- ── exam_analyses: 자체 시험지 내부(INTERNAL) 분석 링크
ALTER TABLE exam_analyses ADD COLUMN IF NOT EXISTS "sourceExamId" text;
CREATE INDEX IF NOT EXISTS "exam_analyses_sourceExamId_idx" ON exam_analyses("sourceExamId");

-- ── exam_report_students: 로스터 학생 귀속 + 제출 역링크 (soft-ref, FK 미설정 — 코드베이스 관례)
ALTER TABLE exam_report_students ADD COLUMN IF NOT EXISTS "studentId" text;
ALTER TABLE exam_report_students ADD COLUMN IF NOT EXISTS "examSubmissionId" text;
CREATE INDEX IF NOT EXISTS "exam_report_students_studentId_idx" ON exam_report_students("studentId");

-- ── student_analytics: AI 추세변화 분석 저장
ALTER TABLE student_analytics ADD COLUMN IF NOT EXISTS "examTrendReport" jsonb;
ALTER TABLE student_analytics ADD COLUMN IF NOT EXISTS "examTrendGeneratedAt" timestamptz;
ALTER TABLE student_analytics ADD COLUMN IF NOT EXISTS "examTrendStatus" text;
