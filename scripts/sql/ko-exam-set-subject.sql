-- ============================================================================
-- 국어/영어 시험지·세트 과목 분리 — surgical ALTER + 백필 (26-07-03)
--
-- 판별자 일급화(P0): 지금까지 exams / exam_collections / question_sets 는 subject
-- 컬럼이 없어 question.subType 'KO_' 접두사 조인추론으로만 국어를 갈랐다. 이 3계층에
-- subject 컬럼을 심어 스코프를 자기 컬럼으로 통일한다.
--   규약: passages.subject / *_collections.subject 와 동일 —
--     null = ENGLISH(기존 전부·영어 경로 무회귀), 'KOREAN' = 국어.
--
-- ⚠️ 적용 방법 (이 프로젝트의 마이그레이션 드리프트 관례):
--   prisma migrate deploy / prisma db push 절대 금지.
--   prisma db execute --file scripts/sql/ko-exam-set-subject.sql
--   (또는 Supabase SQL editor / Management API 로 아래 문장만 실행)
--
-- ⚠️ 배포 순서: 이 ALTER+백필 을 먼저 실행한 뒤 새 코드(재생성된 Prisma 클라이언트
--   포함)를 배포하는 것을 권장. 로컬은 `npx prisma generate` 로 타입만 재생성(DB
--   무접촉). 코드 측은 컬럼 부재 시 P2022 를 잡아 레거시(subType 'KO_' 조인추론)
--   동작으로 우아하게 강등되도록 방어돼 있으나(목록/생성 경로), ALTER 선행이 안전.
--
-- ⚠️ 컬럼 케이싱: Prisma 는 @map 없는 필드를 camelCase 컬럼(쌍따옴표 인용)으로
--   만든다 — "questionId" / "examId" / "deletedAt" / "subType" / "setId". 아래
--   백필은 그 케이싱을 전제한다. 적용 전 information_schema 로 실제 케이싱 확인 권장:
--     SELECT column_name FROM information_schema.columns
--      WHERE table_name IN ('exam_questions','questions','question_set_items');
-- ============================================================================

-- ── 1) 컬럼 추가 (additive · nullable · idempotent) ──────────────────────────
ALTER TABLE exams            ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE exam_collections ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE question_sets    ADD COLUMN IF NOT EXISTS subject text;

-- ── 2) 백필 ──────────────────────────────────────────────────────────────────
-- exams: "살아있는(deletedAt IS NULL) KO_ 문항 1개 이상" 시험지에 'KOREAN' 스탬프.
--   crud.ts 기존 none-clause(deletedAt null + subType LIKE 'KO_%')와 1:1 대칭 —
--   백필 후 영어 목록(subject null|≠KOREAN)은 기존 none-clause 결과와 정확히 일치.
--   LIKE 'KO\_%' 의 밑줄은 리터럴 이스케이프(기본 ESCAPE '\').
UPDATE exams e
   SET subject = 'KOREAN'
 WHERE e.subject IS NULL
   AND EXISTS (
     SELECT 1 FROM exam_questions eq
       JOIN questions q ON q.id = eq."questionId"
      WHERE eq."examId" = e.id
        AND q."deletedAt" IS NULL
        AND q."subType" LIKE 'KO\_%'
   );

-- question_sets: 멤버 중 KO_ 문항 1개 이상이면 'KOREAN'.
--   listQuestionSets 의 items.some KO_ 규약과 대칭(세트 멤버 판정은 deletedAt 무필터).
UPDATE question_sets s
   SET subject = 'KOREAN'
 WHERE s.subject IS NULL
   AND EXISTS (
     SELECT 1 FROM question_set_items i
       JOIN questions q ON q.id = i."questionId"
      WHERE i."setId" = s.id
        AND q."subType" LIKE 'KO\_%'
   );

-- exam_collections: 백필 없음. 사전 국어 시험지 폴더가 없다는 전제(모든 기존 폴더는
--   subject NULL = 영어 취급). 국어 시험지 폴더는 국어 라우트 createExamCollection 이
--   'KOREAN' 스탬프로 신규 생성한다. (혹시 국어 라우트가 이미 exam 폴더를 만들어 뒀다면
--   적용 전 아래로 확인하고, 있으면 멤버 시험지 subject 기반 소급 UPDATE 를 추가한다.)
--   SELECT count(*) FROM exam_collections;  -- 백필 대상 유무 사전 점검

-- ── 인덱스 소견 ──────────────────────────────────────────────────────────────
-- 별도 인덱스 불필요. 목록은 항상 academyId(기존 인덱스)로 먼저 좁혀진 뒤 subject 를
-- 필터하며 학원당 시험지/폴더/세트 수는 소규모라 잔여 필터 비용이 무시할 수준이다.
-- 필요해지면 CREATE INDEX CONCURRENTLY 로 나중에 추가.
