-- 학생 시험 리포트: exam_analyses + exam_report_students 신규 테이블 (26-07-06)
-- 적용: npx prisma db execute --file prisma/migrations/manual/20260706_add_exam_report_tables.sql --schema prisma/schema.prisma
-- 전부 멱등(IF NOT EXISTS / duplicate_object 무시) — migrate deploy / db push 금지 관례 준수.

CREATE TABLE IF NOT EXISTS "exam_analyses" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "schoolName" TEXT,
    "grade" TEXT,
    "subject" TEXT NOT NULL DEFAULT 'ENGLISH',
    "examType" TEXT NOT NULL DEFAULT 'MIDTERM',
    "examYear" INTEGER,
    "semester" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceFiles" JSONB,
    "structure" JSONB,
    "analysis" JSONB,
    "reviewState" JSONB,
    "aiMeta" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "exam_report_students" (
    "id" TEXT NOT NULL,
    "examAnalysisId" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentMeta" JSONB,
    "responses" JSONB,
    "scoreSummary" JSONB,
    "gradingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "report" JSONB,
    "reportStatus" TEXT NOT NULL DEFAULT 'NONE',
    "shareToken" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_report_students_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "exam_analyses_academyId_status_createdAt_idx"
    ON "exam_analyses"("academyId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "exam_analyses_academyId_deletedAt_updatedAt_idx"
    ON "exam_analyses"("academyId", "deletedAt", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "exam_report_students_shareToken_key"
    ON "exam_report_students"("shareToken");
CREATE INDEX IF NOT EXISTS "exam_report_students_examAnalysisId_deletedAt_idx"
    ON "exam_report_students"("examAnalysisId", "deletedAt");
CREATE INDEX IF NOT EXISTS "exam_report_students_academyId_createdAt_idx"
    ON "exam_report_students"("academyId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "exam_analyses"
        ADD CONSTRAINT "exam_analyses_academyId_fkey"
        FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "exam_report_students"
        ADD CONSTRAINT "exam_report_students_academyId_fkey"
        FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "exam_report_students"
        ADD CONSTRAINT "exam_report_students_examAnalysisId_fkey"
        FOREIGN KEY ("examAnalysisId") REFERENCES "exam_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
