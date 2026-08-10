-- ============================================================================
-- 단어 훈련(VocabDrill) — 지문↔단어 전수 매핑 1종 추가 (surgical CREATE)
-- (additive · idempotent · relation-free · DROP 없음)
--
-- 적용:
--   npx prisma db execute --file prisma/sql/vocab-drill-passage-words.sql --schema prisma/schema.prisma
--   (또는 Supabase SQL editor)
--
-- 되돌리기: 이 파일 맨 아래 §R 주석의 DROP 2문 (수동 실행 전용)
--
-- 관례는 vocab-drill-init.sql 과 동일하다 — migrate deploy / db push 금지,
-- 컬럼은 Prisma camelCase 큰따옴표 인용, FK 없음(relation-free).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 왜 examples 를 확장하지 않고 테이블을 새로 파는가
-- ─────────────────────────────────────────────────────────────────────────────
-- vocab_drill_examples 는 **학생 카드용 예문**이다. 후보당 5개 상한
-- (vocab-corpus-build.ts:240 EXAMPLE_CAP)이 걸려 있어서 빈출어는 상한이 일찍
-- 차고 나머지 지문 출현분이 버려진다. 실측:
--     raw 추출 185,635항목 → examples 97,524행 (52.5%)
--     지문당 평균 40.9개  → 21.5개
--     2027 6월 20번: 39개 → 12개 (focus·activity·practice·effort 전부 소실)
--
-- 그 상한은 "학생 카드에 예문을 몇 개 보여줄까"의 답이지 "이 지문에 어떤 단어가
-- 나오는가"의 답이 아니다. examples 의 상한을 푸는 순간 학습 카드·문항 생성이
-- 함께 흔들리므로(전 소비처가 뜻당 예문 수를 5 내외로 가정한다), 지문↔단어
-- 링크만 담는 테이블을 따로 둔다. **학생 서빙 경로는 한 줄도 건드리지 않는다.**
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §0. 조회 패턴 — 인덱스는 전부 여기서 파생된다 (init.sql §0 규약 계승)
-- ─────────────────────────────────────────────────────────────────────────────
-- P1. 기출 범위 → 단어 (이 테이블의 존재 이유 · 스튜디오 「기출 회차로 찾기」)
--       SELECT … FROM vocab_drill_senses s
--        WHERE EXISTS (SELECT 1 FROM vocab_drill_passage_words pw
--                       WHERE pw."senseId" = s.id
--                         AND pw."year" BETWEEN $1 AND $2
--                         AND pw."board" = ANY($3) …);
--     → idx: vocab_drill_passage_words_year_board_senseId_idx
--     ⚠️ EXISTS 로 쓴다. JOIN 하면 한 뜻이 여러 지문에 나올 때 행이 곱해진다
--        (실측 최다 뜻은 800개 지문에 출현 — 목록이 800배가 된다).
--
-- P2. 단일 지문 → 단어 ("2027 6월 20번 지문의 단어")
--       SELECT … FROM vocab_drill_passage_words WHERE "passageId" = $1;
--     → idx: vocab_drill_passage_words_passageId_idx
--
-- P3. 단어 → 나온 지문 (표제어 도시에 역참조 · 「이 단어가 나온 기출」)
--       SELECT … FROM vocab_drill_passage_words WHERE "senseId" = ANY($1);
--     → idx: vocab_drill_passage_words_senseId_idx
--
-- P4. 범위 요약 카운트 (레일 하단 "지문 N개 · 단어 M개" 실시간 표시)
--       SELECT COUNT(DISTINCT "passageId"), COUNT(DISTINCT "senseId") … WHERE <범위>;
--     → P1 인덱스 재사용(별도 인덱스 만들지 않는다)
--
-- P5. 스윕/감사 (번들 재적재 시 이전 세대 정리)
--       WHERE "bundleVersion" <> $1
--     → idx: vocab_drill_passage_words_bundleVersion_idx
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1. 지문↔뜻 매핑 — 행의 단위는 **(지문 × 뜻) 유일쌍**이다.
--
--     한 지문에서 같은 뜻이 두 문장에 나와도 1행이다("이 지문에 이 뜻이
--     나온다"가 이 테이블이 답하는 질문의 전부다). 그래서 목록 질의에
--     DISTINCT 가 필요 없다 — 인덱스만으로 끝난다.
--     id = sha1(passageId '\x1f' senseId)[0..15] — 내용주소. 재적재해도 같은
--     쌍은 같은 id 라 UPSERT 가 멱등하다(examples 의 id 규약과 동형).
--
--     지문 메타(year·board·exam·grade·qFrom·qTo·typeGroup)는 **역정규화**한다.
--     근거는 init.sql §0 이 senses 에 표제어 필드를 역정규화한 것과 동일하다 —
--     코퍼스는 번들 단위로 통째 재적재되므로 갱신 이상이 발생할 수 없고,
--     지문 정본(src/data/exam-passages/passages.json)은 앱 번들에만 있고 DB 에는
--     없다. 역정규화하지 않으면 "2003~2027 학평 고3" 같은 흔한 조건이 지문 id
--     수천 개짜리 IN 목록으로 나가야 한다.
--
--     ⚠️ 장문(41-42 처럼 한 지문이 두 문항)은 161건이다. qFrom/qTo 두 컬럼으로
--        구간을 그대로 들고, 범위 필터는 **겹침 판정**으로 쓴다
--        (qFrom <= :to AND qTo >= :from). 대표값 하나만 두면 41-42 지문이
--        "41번까지" 조건에서 통째로 빠지거나 들어온다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_passage_words" (
  "id"            TEXT PRIMARY KEY,                 -- sha1(passageId|senseId)[0..15]
  "bundleVersion" TEXT NOT NULL,
  "passageId"     TEXT NOT NULL,                    -- exam-passages soft-ref
  "senseId"       TEXT NOT NULL,                    -- soft-ref → vocab_drill_senses.id
  "lemmaId"       TEXT NOT NULL,                    -- soft-ref → vocab_drill_lemmas.id
  "surface"       TEXT NOT NULL,                    -- 그 지문에서의 실제 굴절형(Instructors)
  "sentenceIndex" INTEGER NOT NULL,                 -- 최초 출현 문장(0-base)
  "occurrences"   INTEGER NOT NULL DEFAULT 1,       -- 이 지문 안에서의 출현 횟수
  -- ── 지문 메타 역정규화 ──
  "year"          INTEGER NOT NULL,                 -- 학년도 2003~2027
  "board"         TEXT NOT NULL,                    -- 대학수학능력시험|수능모의평가|학력평가
  "exam"          TEXT NOT NULL,                    -- 수능|6월|9월|3월|…|예비 (12종)
  "grade"         TEXT,                             -- 고1|고2|고3 (수능·모평은 고3)
  "qFrom"         INTEGER NOT NULL,                 -- 문항번호 구간 시작(실측 18~55)
  "qTo"           INTEGER NOT NULL,                 -- 구간 끝(단일 문항이면 qFrom 과 같다)
  "typeGroup"     TEXT,                             -- 15종(빈칸추론·글의순서·어법·…)
  "examId"        TEXT NOT NULL,                    -- 시험지 식별자(283종) — 회차 통째 선택
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- P1 기출 범위 → 단어. 선행 컬럼이 year·board 인 이유: 실측 선택도가 가장 높다
-- (연도 25종 · 시행처 3종). senseId 를 뒤에 붙여 EXISTS 가 인덱스만으로 끝난다.
CREATE INDEX IF NOT EXISTS "vocab_drill_passage_words_year_board_senseId_idx"
  ON "vocab_drill_passage_words" ("year", "board", "senseId");
-- P2 단일 지문 → 단어
CREATE INDEX IF NOT EXISTS "vocab_drill_passage_words_passageId_idx"
  ON "vocab_drill_passage_words" ("passageId");
-- P3 단어 → 나온 지문(도시에 역참조)
CREATE INDEX IF NOT EXISTS "vocab_drill_passage_words_senseId_idx"
  ON "vocab_drill_passage_words" ("senseId");
-- 회차 통째 선택("2027 6월 모평 전체") — examId 는 283종뿐이라 매우 선택적이다
CREATE INDEX IF NOT EXISTS "vocab_drill_passage_words_examId_idx"
  ON "vocab_drill_passage_words" ("examId");
-- P5 스윕/감사
CREATE INDEX IF NOT EXISTS "vocab_drill_passage_words_bundleVersion_idx"
  ON "vocab_drill_passage_words" ("bundleVersion");

-- 같은 (지문, 뜻) 이 두 행이 되는 것을 DB 가 막는다 — 적재기 버그의 최후 방어선.
-- id 가 이미 그 해시이므로 사실상 PK 와 동치지만, 해시 충돌·id 규약 변경 시
-- 조용히 중복이 쌓이는 길을 닫아 둔다.
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_passage_words_passageId_senseId_key"
  ON "vocab_drill_passage_words" ("passageId", "senseId");


-- ─────────────────────────────────────────────────────────────────────────────
-- §2. 자기검증 — 적재 후 이 4문이 전부 기대값이어야 한다.
--     (init.sql 의 surgical 자기검증 관례 계승. 실행은 수동.)
-- ─────────────────────────────────────────────────────────────────────────────
-- ① 총행수 — 183,616 근방(dry-run 실측). 0 이면 적재기가 안 돈 것이다.
--    SELECT COUNT(*) FROM vocab_drill_passage_words;
--
-- ② 고아 senseId 0행 — senses 에 없는 뜻을 가리키면 적재기 해소 버그다.
--    SELECT COUNT(*) FROM vocab_drill_passage_words pw
--     WHERE NOT EXISTS (SELECT 1 FROM vocab_drill_senses s WHERE s.id = pw."senseId");
--
-- ③ 지문 수 4,537 — **전 지문**이다. examples 는 4,536개였다(예문 상한 탓에
--    ebsi_go2_20231219-q30 이 통째로 비어 있었다). 이 테이블이 그 1건까지 덮는다.
--    SELECT COUNT(DISTINCT "passageId") FROM vocab_drill_passage_words;
--
-- ④ 기존 examples 를 **완전히 덮는가** — 0행이어야 한다.
--    examples 에 있는 (지문,뜻) 쌍이 이 테이블에 없으면 복원이 아니라 교체다.
--    SELECT COUNT(*) FROM (
--      SELECT DISTINCT "passageId","senseId" FROM vocab_drill_examples WHERE "retiredAt" IS NULL
--      EXCEPT SELECT "passageId","senseId" FROM vocab_drill_passage_words) t;


-- ─────────────────────────────────────────────────────────────────────────────
-- §R. 롤백 (수동 실행 전용 — 이 파일을 그냥 다시 돌려도 아무 일도 없다)
--     DROP INDEX IF EXISTS "vocab_drill_passage_words_passageId_senseId_key";
--     DROP TABLE IF EXISTS "vocab_drill_passage_words";
-- ─────────────────────────────────────────────────────────────────────────────
