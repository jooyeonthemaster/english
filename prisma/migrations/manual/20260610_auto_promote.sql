-- autoPromote (문제생성 페이지 발 잡의 서버사이드 draft→Passage 자동 승격 플래그).
-- 이 DB는 prisma migrate 히스토리와 드리프트가 있어 `db execute`로 직접 적용한다.
--   npx prisma db execute --file prisma/migrations/manual/20260610_auto_promote.sql --schema prisma/schema.prisma
-- NOT NULL DEFAULT false 는 PG11+ 메타데이터 전용(테이블 rewrite/락 없음), 재실행 멱등.
ALTER TABLE "extraction_jobs" ADD COLUMN IF NOT EXISTS "autoPromote" BOOLEAN NOT NULL DEFAULT false;
