-- ============================================================================
-- 국어/영어 폴더(컬렉션) 과목 분리 — surgical ALTER (26-07-02)
--
-- 규약: passages.subject 와 동일 — null = ENGLISH(기존 폴더 전부·영어 경로
-- 무회귀), 'KOREAN' = 국어 라우트에서 생성한 폴더.
--
-- ⚠️ 적용 방법 (이 프로젝트의 마이그레이션 드리프트 관례):
--   prisma migrate deploy / prisma db push 절대 금지.
--   prisma db execute --file scripts/sql/ko-collections-subject.sql
--   (또는 Supabase SQL editor / Management API 로 아래 두 문장만 실행)
--
-- ⚠️ 배포 순서: 이 ALTER 를 먼저 실행한 뒤 새 코드(재생성된 Prisma 클라이언트
--   포함)를 배포하는 것을 권장. 로컬은 `npx prisma generate` 로 타입만 재생성
--   (DB 무접촉). 코드 측은 컬럼 부재 시에도 P2022 를 잡아 레거시(공유 폴더)
--   동작으로 우아하게 강등되도록 방어돼 있으나(목록/생성 경로), 폴더
--   이름변경/삭제 등 주변 경로까지 전부 방어하지는 않으므로 ALTER 선행이 안전.
-- ============================================================================

ALTER TABLE passage_collections  ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE question_collections ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE webtoon_collections  ADD COLUMN IF NOT EXISTS subject text;

-- 인덱스 소견: 별도 인덱스 불필요.
--   폴더 조회는 항상 academyId(기존 인덱스)로 먼저 좁혀진 뒤 subject 를
--   필터하는데, 학원당 폴더 수는 수십~수백 행 규모라 잔여 필터 비용이
--   무시할 수준이다. (실측 최대 ~302개 폴더 — 26-06-29 RCA 기준)
--   subject 단독/복합 인덱스는 쓰기 비용만 늘린다. 필요해지면
--   CREATE INDEX CONCURRENTLY 로 나중에 추가해도 된다.
