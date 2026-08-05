-- ============================================================================
-- 문항 자산 캠페인 — 적재 테이블 DDL
-- ⚠ 실행 전 사용자 승인 필수 (프로덕션 DB). 실행: psql 또는 프리즈마 $executeRaw.
--
-- 단위: sense별 1행 — 서빙(queue-items)이 senseId로 문항을 뽑는 소비 단위와 일치.
-- content(jsonb)에 팩의 sense 조각 전체(stems·meaningChoiceSets·wordChoiceDistractors·
-- hints·trapClaims·contextRequired·spellEligible)를 담는다. 정본은 여전히 팩 파일이고
-- 이 테이블은 서빙 캐시다 — 재적재는 멱등(upsert).
-- ============================================================================
CREATE TABLE IF NOT EXISTS vocab_drill_item_assets (
  sense_id      text PRIMARY KEY,
  spelling      text NOT NULL,
  display_lemma text,
  serve         boolean NOT NULL DEFAULT true,
  serve_reason  text,
  content       jsonb NOT NULL,
  gate_clean    boolean NOT NULL DEFAULT false,
  campaign_tag  text NOT NULL,            -- 예: 'luna-2026-08' — 재생성 세대 구분
  loaded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vocab_drill_item_assets_spelling_idx
  ON vocab_drill_item_assets (spelling);
