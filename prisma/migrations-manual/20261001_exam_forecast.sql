-- ============================================================================
-- 학교별 내신 적중 예측 팩(exam-forecast) — 한광고 2학년 2학기 1차(2026-10) 첫 적용
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20261001_exam_forecast.sql
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본 camelCase 큰따옴표 인용.
-- 팩 ↔ 지문 ↔ 문항 ↔ 세트는 느슨한 참조(packId·passageId 인덱스만) — 운영 테이블과 무관한 독립 데이터.
--
-- 계약: src/lib/exam-forecast/types.ts · 스펙 docs/hanguang-2610/spec.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS "exam_forecast_packs" (
  "id"          TEXT PRIMARY KEY,
  "slug"        TEXT NOT NULL,
  "schoolName"  TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "subtitle"    TEXT,
  "examMeta"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "analysis"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rangeInfo"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status"      TEXT NOT NULL DEFAULT 'draft',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_forecast_packs_slug_key" ON "exam_forecast_packs" ("slug");

CREATE TABLE IF NOT EXISTS "exam_forecast_passages" (
  "id"          TEXT PRIMARY KEY,
  "packId"      TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "sourceGroup" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "titleKo"     TEXT NOT NULL,
  "titleEn"     TEXT,
  "text"        TEXT NOT NULL,
  "sentences"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "footnotes"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "analysis"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "prediction"  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_forecast_passages_packId_code_key" ON "exam_forecast_passages" ("packId", "code");

CREATE TABLE IF NOT EXISTS "exam_forecast_questions" (
  "id"          TEXT PRIMARY KEY,
  "packId"      TEXT NOT NULL,
  "passageId"   TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "role"        TEXT NOT NULL DEFAULT 'forecast',
  "qtype"       TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'MC',
  "difficulty"  INTEGER NOT NULL DEFAULT 3,
  "points"      DOUBLE PRECISION,
  "body"        JSONB NOT NULL,
  "answer"      TEXT NOT NULL,
  "explanation" TEXT NOT NULL DEFAULT '',
  "rationale"   TEXT NOT NULL DEFAULT '',
  "transform"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tags"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_forecast_questions_packId_code_key" ON "exam_forecast_questions" ("packId", "code");
CREATE INDEX IF NOT EXISTS "exam_forecast_questions_packId_passageId_idx" ON "exam_forecast_questions" ("packId", "passageId");
CREATE INDEX IF NOT EXISTS "exam_forecast_questions_packId_qtype_idx" ON "exam_forecast_questions" ("packId", "qtype");

CREATE TABLE IF NOT EXISTS "exam_forecast_sets" (
  "id"          TEXT PRIMARY KEY,
  "packId"      TEXT NOT NULL,
  "no"          INTEGER NOT NULL,
  "title"       TEXT NOT NULL,
  "tier"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "items"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "pdfPaths"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "exam_forecast_sets_packId_no_key" ON "exam_forecast_sets" ("packId", "no");
