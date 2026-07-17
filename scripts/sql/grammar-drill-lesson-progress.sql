-- ============================================================================
-- 인터랙티브 레슨 진행 테이블 (학습 OS)
--
-- 적용: npx prisma db execute --file scripts/sql/grammar-drill-lesson-progress.sql --schema prisma/schema.prisma
-- ⚠️ prisma migrate / db push 금지 (prod drift). surgical SQL 만 쓴다.
--
-- Student 와 relation-free (FK 없음, 명시 조인) — grammar_drill_* 5테이블과 동일 규약.
-- 기존 테이블은 컬럼 추가도 하지 않는다(병렬 세션 충돌 회피).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "grammar_drill_lesson_progress" (
  "id"             TEXT PRIMARY KEY,
  "academyId"      TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "unitId"         TEXT NOT NULL,
  "conceptId"      TEXT NOT NULL,
  "blocksSeen"     INTEGER NOT NULL DEFAULT 0,
  "blocksTotal"    INTEGER NOT NULL DEFAULT 0,
  "lastBlockIndex" INTEGER NOT NULL DEFAULT 0,
  "checkTotal"     INTEGER NOT NULL DEFAULT 0,
  "checkCorrect"   INTEGER NOT NULL DEFAULT 0,
  -- 학생 자기평가 1(자신 없음) ~ 3(설명할 수 있음)
  "confidence"     INTEGER,
  -- NOTE 블록에 학생이 자기 말로 쓴 필기 — 교사가 열람한다
  "note"           TEXT,
  "secondsSpent"   INTEGER NOT NULL DEFAULT 0,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "grammar_drill_lesson_progress_student_concept_key"
  ON "grammar_drill_lesson_progress" ("studentId", "conceptId");
CREATE INDEX IF NOT EXISTS "grammar_drill_lesson_progress_student_unit_idx"
  ON "grammar_drill_lesson_progress" ("studentId", "unitId");
CREATE INDEX IF NOT EXISTS "grammar_drill_lesson_progress_academy_updated_idx"
  ON "grammar_drill_lesson_progress" ("academyId", "updatedAt");
