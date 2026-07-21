-- ============================================================================
-- 학습지 스터디 모드 신규 테이블 2종 — surgical CREATE
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20260720_worksheet_study.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. StudyAssignmentTask/PassageReport FK는 걸지 않는다
-- (relation-free 설계 — prisma/schema.prisma 의 WorksheetStudy* 모델 주석 참조).
--
-- 배포된 학습지(WORKSHEET 과제)의 단계별 인터랙티브 학습 상태 + 문항 단위
-- 응답 로그. 계약: docs/worksheet-study-spec.md §6.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "worksheet_study_states" (
  "id"           TEXT PRIMARY KEY,
  "academyId"    TEXT NOT NULL,
  "taskId"       TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "reportId"     TEXT NOT NULL,
  "planHash"     TEXT,
  "stageStates"  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "weakness"     JSONB,
  "masteryPct"   INTEGER,
  "totalTimeMs"  INTEGER NOT NULL DEFAULT 0,
  "startedAt"    TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "worksheet_study_states_taskId_key"
  ON "worksheet_study_states" ("taskId");
CREATE INDEX IF NOT EXISTS "worksheet_study_states_academyId_assignmentId_idx"
  ON "worksheet_study_states" ("academyId", "assignmentId");
CREATE INDEX IF NOT EXISTS "worksheet_study_states_studentId_updatedAt_idx"
  ON "worksheet_study_states" ("studentId", "updatedAt");

CREATE TABLE IF NOT EXISTS "worksheet_study_item_logs" (
  "id"          TEXT PRIMARY KEY,
  "academyId"   TEXT NOT NULL,
  "stateId"     TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "stageId"     TEXT NOT NULL,
  "itemKey"     TEXT NOT NULL,
  "skill"       TEXT NOT NULL,
  "sentenceNo"  INTEGER,
  "wordKey"     TEXT,
  "grammarCode" TEXT,
  "attempt"     INTEGER NOT NULL DEFAULT 1,
  "correct"     BOOLEAN,
  "selfGrade"   TEXT,
  "response"    TEXT,
  "timeMs"      INTEGER,
  "hintUsed"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "worksheet_study_item_logs_stateId_stageId_itemKey_attempt_key"
  ON "worksheet_study_item_logs" ("stateId", "stageId", "itemKey", "attempt");
CREATE INDEX IF NOT EXISTS "worksheet_study_item_logs_stateId_createdAt_idx"
  ON "worksheet_study_item_logs" ("stateId", "createdAt");
CREATE INDEX IF NOT EXISTS "worksheet_study_item_logs_academyId_studentId_createdAt_idx"
  ON "worksheet_study_item_logs" ("academyId", "studentId", "createdAt");
