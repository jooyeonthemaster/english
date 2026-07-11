-- ============================================================================
-- 어법 드릴 신규 테이블 5종 — surgical CREATE (additive · idempotent)
--
-- 적용:
--   npx prisma db execute --file scripts/sql/grammar-drill-tables.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. Student FK는 걸지 않는다(relation-free 설계 —
-- prisma/schema.prisma 의 GrammarDrill* 모델 헤더 주석 참조).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "grammar_drill_attempts" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "itemId"        TEXT NOT NULL,
  "unitId"        TEXT NOT NULL,
  "conceptId"     TEXT NOT NULL,
  "itemType"      TEXT NOT NULL,
  "difficulty"    INTEGER NOT NULL,
  "correct"       BOOLEAN NOT NULL,
  "answer"        TEXT NOT NULL,
  "timeMs"        INTEGER NOT NULL DEFAULT 0,
  "hintUsed"      INTEGER NOT NULL DEFAULT 0,
  "conceptPeeked" BOOLEAN NOT NULL DEFAULT FALSE,
  "source"        TEXT NOT NULL DEFAULT 'DRILL',
  "assignmentId"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "grammar_drill_attempts_studentId_createdAt_idx"
  ON "grammar_drill_attempts" ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "grammar_drill_attempts_studentId_conceptId_idx"
  ON "grammar_drill_attempts" ("studentId", "conceptId");
CREATE INDEX IF NOT EXISTS "grammar_drill_attempts_studentId_itemId_idx"
  ON "grammar_drill_attempts" ("studentId", "itemId");
CREATE INDEX IF NOT EXISTS "grammar_drill_attempts_academyId_createdAt_idx"
  ON "grammar_drill_attempts" ("academyId", "createdAt");

CREATE TABLE IF NOT EXISTS "grammar_drill_mastery" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "conceptId"     TEXT NOT NULL,
  "unitId"        TEXT NOT NULL,
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "correct"       INTEGER NOT NULL DEFAULT 0,
  "streak"        INTEGER NOT NULL DEFAULT 0,
  "masteryScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "box"           INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "grammar_drill_mastery_studentId_conceptId_key"
  ON "grammar_drill_mastery" ("studentId", "conceptId");
CREATE INDEX IF NOT EXISTS "grammar_drill_mastery_studentId_unitId_idx"
  ON "grammar_drill_mastery" ("studentId", "unitId");
CREATE INDEX IF NOT EXISTS "grammar_drill_mastery_academyId_updatedAt_idx"
  ON "grammar_drill_mastery" ("academyId", "updatedAt");

CREATE TABLE IF NOT EXISTS "grammar_drill_unit_progress" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "unitId"        TEXT NOT NULL,
  "stage"         TEXT NOT NULL DEFAULT 'CONCEPT',
  "conceptDoneAt" TIMESTAMP(3),
  "drillDoneAt"   TIMESTAMP(3),
  "readingDoneAt" TIMESTAMP(3),
  "writtenDoneAt" TIMESTAMP(3),
  "masteredAt"    TIMESTAMP(3),
  "bestTestScore" INTEGER,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "grammar_drill_unit_progress_studentId_unitId_key"
  ON "grammar_drill_unit_progress" ("studentId", "unitId");
CREATE INDEX IF NOT EXISTS "grammar_drill_unit_progress_academyId_updatedAt_idx"
  ON "grammar_drill_unit_progress" ("academyId", "updatedAt");

CREATE TABLE IF NOT EXISTS "grammar_drill_assignments" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "staffId"       TEXT,
  "title"         TEXT NOT NULL,
  "note"          TEXT,
  "spec"          JSONB NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'ASSIGNED',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"     TIMESTAMP(3),
  "completedAt"   TIMESTAMP(3),
  "resultSummary" JSONB
);
CREATE INDEX IF NOT EXISTS "grammar_drill_assignments_studentId_status_idx"
  ON "grammar_drill_assignments" ("studentId", "status");
CREATE INDEX IF NOT EXISTS "grammar_drill_assignments_academyId_createdAt_idx"
  ON "grammar_drill_assignments" ("academyId", "createdAt");

CREATE TABLE IF NOT EXISTS "grammar_drill_chat_messages" (
  "id"               TEXT PRIMARY KEY,
  "academyId"        TEXT NOT NULL,
  "studentId"        TEXT NOT NULL,
  "contextItemId"    TEXT,
  "contextConceptId" TEXT,
  "role"             TEXT NOT NULL,
  "content"          TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "grammar_drill_chat_messages_studentId_createdAt_idx"
  ON "grammar_drill_chat_messages" ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "grammar_drill_chat_messages_academyId_createdAt_idx"
  ON "grammar_drill_chat_messages" ("academyId", "createdAt");
