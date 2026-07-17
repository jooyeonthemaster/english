-- ============================================================================
-- 어법 스텟 테이블 (학습 OS v2 — 상태창·칭호·게임 XP)
--
-- 적용: npx prisma db execute --file scripts/sql/grammar-drill-stats.sql --schema prisma/schema.prisma
-- ⚠️ prisma migrate / db push 금지 (prod drift). surgical SQL 만 쓴다.
--
-- Student 와 relation-free (FK 없음, 명시 조인) — grammar_drill_* 규약과 동일.
-- 학생당 1행. gameLog 는 게임 XP 중복 지급을 막는 원장이다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "grammar_drill_stats" (
  "id"               TEXT PRIMARY KEY,
  "academyId"        TEXT NOT NULL,
  "studentId"        TEXT NOT NULL,
  "xp"               INTEGER NOT NULL DEFAULT 0,
  "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
  "replays"          INTEGER NOT NULL DEFAULT 0,
  "gamesPlayed"      INTEGER NOT NULL DEFAULT 0,
  "gamePerfects"     INTEGER NOT NULL DEFAULT 0,
  "bossWins"         INTEGER NOT NULL DEFAULT 0,
  "bossLosses"       INTEGER NOT NULL DEFAULT 0,
  "memoryGatePasses" INTEGER NOT NULL DEFAULT 0,
  "bestCombo"        INTEGER NOT NULL DEFAULT 0,
  -- {"L1":0,"L2":0,"L3":0,"L4":0,"L5":0}
  "lensXp"           JSONB NOT NULL DEFAULT '{}',
  -- {"p0":0,"p1":0,"p2":0,"p3":0}
  "partXp"           JSONB NOT NULL DEFAULT '{}',
  -- [{"key":"sp-first-lesson","earnedAt":"2026-07-15T00:00:00Z"}]
  "titles"           JSONB NOT NULL DEFAULT '[]',
  -- {"b01-c1:b14":{"plays":3,"best":"perfect"}}
  "gameLog"          JSONB NOT NULL DEFAULT '{}',
  "lastStudyDate"    TIMESTAMP(3),
  "streakDays"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "grammar_drill_stats_studentId_key"
  ON "grammar_drill_stats" ("studentId");
CREATE INDEX IF NOT EXISTS "grammar_drill_stats_academy_updated_idx"
  ON "grammar_drill_stats" ("academyId", "updatedAt");
