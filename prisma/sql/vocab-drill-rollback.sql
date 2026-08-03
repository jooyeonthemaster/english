-- ============================================================================
-- 단어 훈련(VocabDrill) 되돌리기 — ⛔ 파괴적. 자동 실행 금지.
--
-- prisma/sql/vocab-drill-init.sql 이 만든 13테이블을 지운다.
-- **학생 학습 데이터가 함께 사라진다**(vocab_drill_attempts / _mastery /
-- _deck_progress / _stats). 콘텐츠는 lemmas.json 에서 재적재하면 되지만
-- 학습 데이터는 복구 경로가 없다.
--
-- 이 파일은 init 과 **분리돼 있다**. init 에는 DROP 이 단 한 문장도 없다.
--
-- 실행 전 필수:
--   1) 사용자 명시 승인
--   2) 학습 데이터 백업 —
--      \copy (SELECT * FROM "vocab_drill_attempts") TO 'attempts.csv' CSV HEADER
--      \copy (SELECT * FROM "vocab_drill_mastery")  TO 'mastery.csv'  CSV HEADER
--      \copy (SELECT * FROM "vocab_drill_deck_progress") TO 'deck_progress.csv' CSV HEADER
--      \copy (SELECT * FROM "vocab_drill_stats")    TO 'stats.csv'    CSV HEADER
--   3) 이 파일 전체를 읽고 대상 13개가 맞는지 눈으로 확인
--
-- 적용(승인 후에만):
--   npx prisma db execute --file prisma/sql/vocab-drill-rollback.sql
--
-- ⚠️ 레거시 vocabulary_lists / vocabulary_items / vocab_test_results /
--    wrong_vocab_answers 는 이 파일의 대상이 **아니다**. 위 4개 이름은
--    아래 실행문 어디에도 없다.
-- ============================================================================

-- ── 콘텐츠만 비우고 스키마는 남기고 싶다면 여기까지만 쓴다(권장 경로) ──────────
-- 학습 데이터를 지키면서 코퍼스만 갈아엎는 방법. DROP 대신 이걸 먼저 검토하라.
--
--   DELETE FROM "vocab_drill_traps";
--   DELETE FROM "vocab_drill_examples";
--   DELETE FROM "vocab_drill_senses";
--   DELETE FROM "vocab_drill_lemma_year_stats";
--   DELETE FROM "vocab_drill_lemmas";
--   DELETE FROM "vocab_drill_bundles";
--   -- vocab_drill_sense_aliases 는 남긴다(학습 데이터 이관 이력이다)
--
-- 위 6줄은 주석 처리해 두었다. 필요하면 손으로 풀어라.

-- ── 전체 철거 ────────────────────────────────────────────────────────────────
-- 의존 관계가 FK 로 걸려 있지 않으므로(relation-free) 순서는 무관하지만,
-- 학습 데이터 → 콘텐츠 순으로 적어 무엇이 사라지는지 눈에 띄게 한다.

DROP TABLE IF EXISTS "vocab_drill_stats";
DROP TABLE IF EXISTS "vocab_drill_assignments";
DROP TABLE IF EXISTS "vocab_drill_deck_progress";
DROP TABLE IF EXISTS "vocab_drill_decks";
DROP TABLE IF EXISTS "vocab_drill_mastery";
DROP TABLE IF EXISTS "vocab_drill_attempts";

DROP TABLE IF EXISTS "vocab_drill_sense_aliases";
DROP TABLE IF EXISTS "vocab_drill_traps";
DROP TABLE IF EXISTS "vocab_drill_examples";
DROP TABLE IF EXISTS "vocab_drill_senses";
DROP TABLE IF EXISTS "vocab_drill_lemma_year_stats";
DROP TABLE IF EXISTS "vocab_drill_lemmas";
DROP TABLE IF EXISTS "vocab_drill_bundles";

-- 인덱스는 테이블과 함께 사라진다(별도 DROP INDEX 불필요).
-- schema.prisma 에서도 해당 13개 모델 블록을 손으로 지워야 타입이 맞는다.
