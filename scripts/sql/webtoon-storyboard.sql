-- ============================================================================
-- 웹툰 v2 콘티(스토리보드) 컬럼 — surgical ALTER (26-09-29)
--
-- webtoons.storyboard (jsonb, nullable): Gemini 가 설계한 컷별 샷·앵글·구도·대사.
-- null = 레거시(AtlasCloud 시절 직접 프롬프트) 행 — 기존 행 전부 무회귀.
--
-- ⚠️ 적용 방법 (이 프로젝트의 마이그레이션 드리프트 관례):
--   prisma migrate deploy / prisma db push 절대 금지.
--   npx prisma db execute --file scripts/sql/webtoon-storyboard.sql --schema prisma/schema.prisma
--   (또는 Supabase SQL editor 로 아래 한 문장만 실행)
--
-- ⚠️ 배포 순서: 이 ALTER 를 **먼저** 실행한 뒤 새 코드(재생성된 Prisma 클라이언트
--   포함 — Vercel + Trigger.dev 워커 둘 다)를 배포한다. Prisma 는 select 없는
--   조회에서 모든 스칼라 컬럼을 읽으므로, 컬럼 없이 새 코드가 먼저 뜨면 웹툰
--   조회·생성 경로가 P2022 로 실패한다. ADD COLUMN IF NOT EXISTS 라 재실행 안전.
-- ============================================================================

ALTER TABLE webtoons ADD COLUMN IF NOT EXISTS storyboard jsonb;
