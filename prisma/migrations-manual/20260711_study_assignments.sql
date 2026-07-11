-- ============================================================================
-- 통합 학습 과제(StudyAssignment) 신규 테이블 2종 — surgical CREATE
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20260711_study_assignments.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. Student/Exam/PassageReport FK는 걸지 않는다
-- (relation-free 설계 — prisma/schema.prisma 의 StudyAssignment* 모델 주석 참조).
--
-- 시험지(EXAM)·학습지(WORKSHEET)·문제세트(QUESTIONS)·어법훈련(GRAMMAR)을
-- 학생/반 단위로 배포하는 통합 과제 레이어. EXAM 은 exam_submissions,
-- GRAMMAR 는 grammar_drill_assignments 를 브리지 soft-ref 로 연결한다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "study_assignments" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "createdById"   TEXT,
  "kind"          TEXT NOT NULL,
  "refId"         TEXT,
  "payload"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "title"         TEXT NOT NULL,
  "instructions"  TEXT,
  "availableFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"         TIMESTAMP(3),
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "targets"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "targetSummary" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "study_assignments_academyId_createdAt_idx"
  ON "study_assignments" ("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "study_assignments_academyId_dueAt_idx"
  ON "study_assignments" ("academyId", "dueAt");

CREATE TABLE IF NOT EXISTS "study_assignment_tasks" (
  "id"                  TEXT PRIMARY KEY,
  "academyId"           TEXT NOT NULL,
  "assignmentId"        TEXT NOT NULL,
  "studentId"           TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'ASSIGNED',
  "examSubmissionId"    TEXT,
  "grammarAssignmentId" TEXT,
  "responses"           JSONB,
  "result"              JSONB,
  "startedAt"           TIMESTAMP(3),
  "completedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "study_assignment_tasks_assignmentId_studentId_key"
  ON "study_assignment_tasks" ("assignmentId", "studentId");
CREATE INDEX IF NOT EXISTS "study_assignment_tasks_studentId_status_createdAt_idx"
  ON "study_assignment_tasks" ("studentId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "study_assignment_tasks_academyId_createdAt_idx"
  ON "study_assignment_tasks" ("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "study_assignment_tasks_assignmentId_idx"
  ON "study_assignment_tasks" ("assignmentId");
