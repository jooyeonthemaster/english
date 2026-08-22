-- ============================================================================
-- 클래스 스튜디오 — 클래스 ↔ 지문 등록부 (surgical CREATE)
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20260809_class_studio.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. Class/Passage/Staff FK 는 걸지 않는다
-- (relation-free 설계 — prisma/schema.prisma StudioClassPassage 주석 참조).
--
-- 계약: docs/class-studio-spec.md §6.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "studio_class_passages" (
  "id"        TEXT PRIMARY KEY,
  "academyId" TEXT NOT NULL,
  "classId"   TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "addedById" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "studio_class_passages_classId_passageId_key"
  ON "studio_class_passages" ("classId", "passageId");

CREATE INDEX IF NOT EXISTS "studio_class_passages_academyId_classId_sortOrder_idx"
  ON "studio_class_passages" ("academyId", "classId", "sortOrder");

CREATE INDEX IF NOT EXISTS "studio_class_passages_passageId_idx"
  ON "studio_class_passages" ("passageId");
