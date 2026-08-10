-- ============================================================================
-- 학습지 스터디 — 오답 단어 누적 뷰용 컬럼·인덱스 추가 (surgical ALTER)
-- (additive · idempotent · relation-free)
--
-- 적용:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations-manual/20260720_worksheet_study_word_meaning.sql
--
-- wordMeaning: 표제어 뜻 스냅샷 — 학생/원장 누적 취약 단어장이 원본 학습지를
-- 재파싱하지 않고 자립하도록 기록 시점에 동봉한다.
-- ============================================================================

ALTER TABLE "worksheet_study_item_logs"
  ADD COLUMN IF NOT EXISTS "wordMeaning" TEXT;

CREATE INDEX IF NOT EXISTS "worksheet_study_item_logs_academyId_studentId_wordKey_idx"
  ON "worksheet_study_item_logs" ("academyId", "studentId", "wordKey");
