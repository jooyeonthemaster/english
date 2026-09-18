-- ============================================================================
-- 유입 분석 — 보유기간 집행에 필요한 누락 인덱스 (additive · idempotent)
--
-- 적용:
--   npx prisma db execute --file prisma/migrations-manual/20260918_analytics_indexes.sql
--   (또는 Supabase SQL editor)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). schema.prisma 에는 같은 인덱스를
-- @@index([lastSeenAt]) 로 함께 적어 둘 것(스키마 소유자 몫 — 이 파일만으로는 drift 가 남는다).
--
-- CONCURRENTLY 를 쓰지 않는 이유: prisma db execute 는 파일을 한 트랜잭션으로 보내므로
-- CREATE INDEX CONCURRENTLY 가 "cannot run inside a transaction block" 으로 죽는다.
-- 대상 테이블이 현재 528행(analytics_visitors)이라 잠금 시간은 무시할 수준이다.
-- 수억 행 규모가 되면 psql 로 CONCURRENTLY 를 따로 돌린다.
--
-- 근거(2026-09-18 운영 DB EXPLAIN 실측):
--   analytics_visitors 의 인덱스는 pkey · firstSeenAt · academyId 3개뿐이라
--   보유기간 크론의 `WHERE "lastSeenAt" < cutoff` 가 Seq Scan 이다
--   (EXPLAIN: Node Type "Seq Scan", Filter "lastSeenAt < now() - 365 days").
--   events(createdAt) · sessions(lastSeenAt) · link_clicks(createdAt) 는 이미 인덱스가 있다.
--
-- 만들지 않은 인덱스와 그 이유:
--   analytics_sessions("hostname") — 실측상 distinct 3개(qa.seed 860 · localhost 7 · 127.0.0.1 1)로
--   선택도가 없어 플래너가 쓰지 않는다(868행에서 Seq Scan 이 정답). 테스트 호스트 집계는
--   전체 스캔 한 번이면 끝나므로 쓰기 비용만 늘리는 인덱스가 된다. 세션이 수십만 행이 되고
--   테스트 호스트 비율이 1% 아래로 내려가면 그때 부분 인덱스
--   (`... ("hostname") WHERE "hostname" IN ('localhost','127.0.0.1')`)로 다시 판단한다.
--
-- 계약: docs/analytics/analytics-spec.md §15 · docs/analytics/ops-checklist.md
-- ============================================================================

CREATE INDEX IF NOT EXISTS "analytics_visitors_lastSeenAt_idx"
  ON "analytics_visitors" ("lastSeenAt");

-- 적용 후 확인:
--   EXPLAIN SELECT * FROM "analytics_visitors" WHERE "lastSeenAt" < now() - interval '365 days';
--   → "Index Scan using analytics_visitors_lastSeenAt_idx" 가 나와야 한다.
--   (행이 아주 적으면 플래너가 여전히 Seq Scan 을 고를 수 있다 — SET enable_seqscan = off 로 확인.)
