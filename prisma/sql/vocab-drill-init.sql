-- ============================================================================
-- 단어 훈련(VocabDrill) 신규 테이블 13종 — surgical CREATE
-- (additive · idempotent · relation-free · DROP 없음)
--
-- 적용:
--   npx prisma db execute --file prisma/sql/vocab-drill-init.sql
--   (또는 Supabase SQL editor)
--
-- 되돌리기: prisma/sql/vocab-drill-rollback.sql (별도 파일 · 수동 실행 전용)
--
-- 관례: migrate deploy / db push 금지(prod DB drift). 컬럼은 Prisma 기본
-- camelCase 큰따옴표 인용. Student/Academy FK는 걸지 않는다(relation-free 설계 —
-- prisma/schema.prisma 의 GrammarDrill* 모델 헤더 주석이 규약 원문).
--
-- 템플릿: 어법 드릴(scripts/sql/grammar-drill-tables.sql,
--         src/lib/grammar-drill/engine.ts) 을 단어 도메인으로 복제한 것.
-- 데이터 원본: experiments/vocab-corpus-20260728/build/lemmas.json
--         (+ stats.json / phrase-stats.json — 연도별 원시 시계열)
-- 적재기: scripts/vocab-db-load.ts (--dry-run 기본, --apply 로만 쓴다)
--
-- ⚠️ 레거시 vocabulary_lists / vocabulary_items / vocab_test_results /
--    wrong_vocab_answers 는 **이 파일에서 단 한 문장도 건드리지 않는다.**
--    그 4테이블은 FK 를 걸고 Academy·Student 모델에 relation 필드가 등록돼 있어
--    손대는 순간 공유 모델 블록을 건드리게 된다. 네임스페이스를 vocab_drill_* 로
--    완전히 분리해 충돌 가능성을 0 으로 만든다.
-- ============================================================================


-- ============================================================================
-- §0. 조회 패턴 — 인덱스는 전부 여기서 파생된다
--
-- 이 절이 인덱스 설계의 유일한 근거다. 아래 8개 패턴에 대응하지 않는 인덱스는
-- 이 파일에 없다(장식 금지). 새 인덱스를 추가하려면 먼저 여기에 패턴을 적어라.
--
-- Q1. 학년별 단어장 (디렉터 「단어 훈련」 탭 · 학생앱 덱 구성)
--     "고2 기출에서 나오는 core/academic 뜻 중 빈도 상위 200개, 구/숙어 제외"
--       SELECT … FROM vocab_drill_senses
--        WHERE "retiredAt" IS NULL AND "gradeTop"='고2' AND "tier"=ANY($1)
--        ORDER BY "per10k" DESC NULLS LAST LIMIT 200;
--     → senses 에 lemma 의 per10k·gradeTop·isPhrase·trendLabel 을 **역정규화**해
--       조인 없이 단일 테이블로 끝낸다(콘텐츠는 번들 단위로 통째 재적재되므로
--       갱신 이상(update anomaly)이 발생할 수 없다).
--     → idx: vocab_drill_senses_tier_gradeTop_per10k_idx (partial: 미은퇴)
--
-- Q2. 난이도별 큐 (학생앱 드릴 — box → 난이도 창 [1,2]/[2,3]/[3,4])
--       SELECT … FROM vocab_drill_senses
--        WHERE "retiredAt" IS NULL AND "difficulty" BETWEEN $1 AND $2
--        ORDER BY "per10k" DESC NULLS LAST LIMIT 50;
--     → idx: vocab_drill_senses_difficulty_per10k_idx (partial: 미은퇴)
--     (난이도가 범위 조건이라 정렬까지 인덱스로 받지는 못한다. 미은퇴 sense 가
--      10만 행 규모여도 bitmap scan + top-N sort 로 수 ms 다 — 과잉설계 금지.)
--
-- Q3. 학생별 복습 대상 ★ 규모가 어법과 결정적으로 다른 지점
--       -- 오늘 만기된 것부터
--       SELECT … FROM vocab_drill_mastery
--        WHERE "studentId"=$1 AND "dueAt" <= now() ORDER BY "dueAt" LIMIT 20;
--       -- 취약(숙달도 낮은 순)
--       SELECT … FROM vocab_drill_mastery
--        WHERE "studentId"=$1 AND "masteryScore" < 60 ORDER BY "masteryScore" LIMIT 20;
--     → 어법은 학생×개념이 수십 행이라 findMany({where:{studentId}}) 전량 로드 후
--       메모리 정렬이 성립했다(engine.ts:605-615, 745-748, 818-824).
--       단어는 학생×sense 가 수천~수만 행이다. **그 패턴을 그대로 옮기면 안 된다.**
--       그래서 (a) 어법에 없던 "dueAt" 컬럼을 두어 복습 큐를 인덱스 range scan +
--       LIMIT 으로 바꾸고, (b) 모든 서빙 질의에 LIMIT 을 강제한다.
--     → idx: _studentId_dueAt_idx, _studentId_masteryScore_idx
--
-- Q4. 트렌드 뷰 (디렉터 — 급증/급감 단어, 표제어 연도별 그래프)
--       SELECT "lemma","pos","per10k","trendLabel" FROM vocab_drill_lemmas
--        WHERE "retiredAt" IS NULL AND "trendLabel"=$1
--        ORDER BY "per10k" DESC LIMIT 100;
--       SELECT "byYear","per10kByYear" FROM vocab_drill_lemma_year_stats
--        WHERE "lemmaId"=$1;            -- 한 번에 표제어 1개
--     → idx: vocab_drill_lemmas_trendLabel_per10k_idx (partial), year_stats PK
--     ⚠️ 이 그래프는 **표제어 전체**의 시계열이다(전 표면형 합산 — §2-3 의 정정 참조).
--        목록의 per10k 와 상세 그래프 합계가 어긋나면 적재기 버그다. 대조식:
--          SELECT l."lemma", l."totalOccurrences", y."totalOccurrences"
--            FROM vocab_drill_lemmas l JOIN vocab_drill_lemma_year_stats y ON y."lemmaId"=l."id"
--           WHERE l."totalOccurrences" IS DISTINCT FROM y."totalOccurrences";   -- 0행이어야 한다
--
-- Q5. 지문 → 단어 역참조 (학습지·시험 지문에 등장하는 뜻 뽑기)
--       SELECT DISTINCT "senseId" FROM vocab_drill_examples
--        WHERE "passageId" = ANY($1);
--     → idx: vocab_drill_examples_passageId_idx
--     (worksheet_study_item_logs.wordKey 로 쌓이는 기존 「취약 단어장」과의
--      접합점이기도 하다 — /g/vocab 은 지문 기반, /g/track/vocab 은 코퍼스 기반.)
--
-- Q6. 표제어 검색 (디렉터 탭 검색창 — 접두 일치)
--       SELECT … FROM vocab_drill_lemmas WHERE "lemma" LIKE $1 || '%' LIMIT 20;
--     → idx: vocab_drill_lemmas_lemma_pattern_idx (text_pattern_ops — 기본 콜레이션
--       btree 로는 LIKE 접두 검색에 인덱스가 안 걸린다)
--
-- Q7. 학생 시도 이력 / 학원 전체 활동 (디렉터 탭 attempts 리스트 · 대시보드)
--       WHERE "studentId"=$1 ORDER BY "createdAt" DESC LIMIT 50
--       WHERE "studentId"=$1 AND "senseId"=$2
--       WHERE "academyId"=$1 AND "createdAt" >= $2
--     → 어법 grammar_drill_attempts 인덱스 3종을 그대로 복제 + lemmaId 축 추가
--
-- Q8. 과제·덱 진행 (배포 레이어)
--       WHERE "studentId"=$1 AND "status"='ASSIGNED'
--       WHERE "studentId"=$1 AND "deckId"=$2
--     → _studentId_status_idx, _studentId_deckId_key
--     ★ 2026-08-04 추가: **시도 로그도 같은 두 축으로 걸러진다.** 덱 단계 판정
--       (engine.ts — LEARN 소화율/DECK_TEST 채점/진행 집계)과 과제 진행
--       (engine.ts·queue.ts·task-union.ts)이 studentId+deckId / studentId+assignmentId
--       로 질의하는데, attempts 인덱스는 studentId 선두 3종(createdAt/senseId/lemmaId)
--       뿐이라 학생의 시도 **전량**을 훑고 걸러냈다. 시도는 학생당 수천~수만 행으로
--       자라는 append-only 원장이라 이 축이 없으면 덱 화면이 학생 이력에 비례해 느려진다.
--     → _studentId_deckId_idx, _studentId_assignmentId_idx
--
-- Q9. 콘텐츠 재빌드 정합 (번들 스윕 · sense 은퇴 시 영향 학생 찾기)
--       SELECT "studentId" FROM vocab_drill_mastery WHERE "senseId"=$1;
--       SELECT … WHERE "bundleVersion" <> $active;   -- 이번 번들이 확인 안 한 행
--     → _senseId_idx, 각 콘텐츠 테이블의 _bundleVersion_idx
-- ============================================================================


-- ============================================================================
-- §1. 설계 결정 3건 — 어법 템플릿에서 **의도적으로 벗어난** 지점
--
-- ── 결정 1. 콘텐츠를 코드 번들이 아니라 DB 에 둔다 (템플릿 이탈) ──────────────
-- 어법은 "콘텐츠=코드 번들 / DB=학습 데이터"가 규약이다(schema.prisma:5000-5004).
-- 단어는 그 규약을 따를 수 없다:
--   · 어법 콘텐츠는 개념 수십 개 · 문항 수천 개(src/data/grammar-drill, 36파일).
--   · 단어 콘텐츠는 현재 표제어 6,860 / 뜻 13,783 / 예문 16,604 인데 이건 지문
--     536/4,537(11.8%) 시점이다. 전량 적재 시 표제어 ~27,000 / 뜻 ~60,000 /
--     예문 ~180,000 — lemmas.json 하나가 22.2MB → 150MB+ 로 간다.
--   · 서버리스 번들에 150MB JSON 을 싣고 콜드스타트마다 메모리 적재하는 건 불가능.
-- 따라서 콘텐츠 7테이블(§2)은 DB 에 둔다. 다만 어법 규약의 **정신**은 그대로 지킨다:
--   (a) 콘텐츠 테이블은 **읽기 전용**이다 — 쓰기는 scripts/vocab-db-load.ts 만.
--   (b) 클라이언트로 통째로 내려보내지 않는다. 큐 API 가 문항 단위 화이트리스트
--       페이로드만 서빙하고, 정답(senseKo)·함정(note)은 **제출 후에만** 준다.
--   (c) 번들 버전(vocab_drill_bundles)으로 출처를 못 박는다.
--
-- ── 결정 2. senseId 는 "내용 주소(content-addressed)" 이며 번들과 무관하다 ──
-- 문제: sense 에 안정 숫자 ID 가 없다. 자연키는 (lemma, pos, senseKey) 뿐이고
-- senseKey 는 영어 정의 **문장**이다. 어법의 conceptId('u01-c1')는 사람이 정한
-- 불변 ID 였다 — 이게 결정적 차이다. 추출이 11.8% 이고 4단계 LLM 병합 대기가
-- 2,409 표제어라, 재빌드마다 senseKey 가 병합·변형되어 학습 데이터가 고아가 된다.
-- 해법(3중):
--   (a) lemmaId  = sha1(lower(lemma) '\x1f' pos)[0..15]
--       — (lemma,pos)는 6,860건 전수에서 중복 0 으로 실측 확인된 전역 유니크 자연키.
--         **번들 버전을 해시 입력에 넣지 않는다** — 넣으면 재빌드마다 ID 가 바뀌어
--         정확히 우리가 피하려는 고아 문제가 발생한다.
--   (b) senseId  — **정본은 sense-registry.json 이다**(docs/vocab-corpus-spec.md §11).
--       신규 발급 때의 주조 규칙만 lemmaId ':' sha1(normalize(senseKey))[0..7] 이고
--       (normalize 는 scripts/vocab-corpus-build.ts 의 normSense 와 동일 규칙),
--       한 번 발급된 senseId 는 **정의문이 바뀌어도 그대로 간다.**
--       ★ 2026-07-28 정정: 내용주소만으로는 부족하다. senseKey 는 영영 정의 **문장**이라
--         4단계 LLM 병합(대기 2,409 표제어)이 돌면 통째로 바뀐다. 그래서 다음 번들에서
--         같은 sense 인지의 판정 근거를 **원 추출 항목의 출처**(passageId +
--         sentenceIndex + surface)로 옮겼다 — 이건 재빌드해도 변하지 않는다.
--         겹침이 1:1 로 모호하지 않을 때만 승계하고, 병합·분할이 의심되면 잇지 않는다.
--   (c) vocab_drill_sense_aliases — 은퇴 senseId → 생존 senseId 이관 원장.
--       ★ 2026-07-28 정정: 이 표는 **명시적 판정만** 담는다(4단계 LLM 병합 산출 또는 사람).
--         적재기가 정의문 유사도로 자동 생성하던 경로는 제거됐다 — 근거는 §11.1 과
--         scripts/vocab-sense-registry.ts 머리말. 매핑 근거가 없으면 잇지 않고,
--         딸린 숙달도는 고아로 둔다. 잘못 이어 붙이는 것보다 낫다.
--       콘텐츠 행은 DELETE 하지 않고 "retiredAt" 으로 은퇴시킨다
--       (append-only 원칙 — 학습 이력이 참조 중일 수 있다).
--   + vocab_drill_mastery 는 senseId 와 lemmaId 를 **둘 다** 들고 있다. 최악의
--     경우 sense 매핑이 끊겨도 표제어 단위 집계는 살아남는다(우아한 성능저하).
--
-- ── 결정 3. 연도별 출현은 컬럼이 아니라 JSONB, 그것도 **별도 테이블** ──────────
-- 질문: 표제어당 25개 연도(2003~2027)를 컬럼으로 펼칠 것인가, JSONB 로 둘 것인가.
-- 답: JSONB. 그리고 vocab_drill_lemmas 가 아니라 vocab_drill_lemma_year_stats 에.
-- 근거 4가지:
--  1) **연도는 필터·정렬 축이 아니다.** §0 의 Q1~Q9 어디에도 "연도로 거른다"가
--     없다. 연도 시계열은 Q4 의 표제어 상세 그래프에서 **표제어 1건씩** 통째로
--     읽히는 표시용 페이로드다. 필터 축이 아닌 것을 컬럼으로 펼치면 인덱스가
--     하나도 안 붙는 50개 컬럼(byYear 25 + per10kByYear 25)만 남는다.
--  2) **희소하다.** trend.label 이 '신규 등장' 828 · '미등장' 203 · '중간기만
--     등장' 320 인 데서 보듯 대부분의 표제어는 25년 중 일부에만 나타난다.
--     (yearsPresent · longestGap 지표가 존재하는 이유가 그것이다.)
--     펼친 컬럼은 대부분 NULL/0 이 된다.
--  3) **연도는 늘어난다.** 2028학년도가 붙으면 컬럼 방식은 prod DDL 이 필요하다.
--     이 리포는 DDL 을 surgical SQL + 사용자 승인으로만 집행한다 — 스키마가
--     달력에 묶이는 설계는 규약과 정면으로 충돌한다. JSONB 는 키만 늘어난다.
--  4) **JSONB 를 별도 테이블로 뺀 이유가 따로 있다.** Prisma 의 findMany 는 기본
--     select 가 전 스칼라 컬럼이라, 같은 행에 JSONB 를 두면 Q1/Q2 같은 목록
--     질의가 매번 TOAST 를 detoast 한다. 표제어 목록 200건 = 불필요한 25키 JSONB
--     200개 역직렬화. 1:1 분리하면 목록 질의는 절대 그 비용을 내지 않고,
--     상세 그래프만 PK 조회로 가져간다.
-- 대신 **필터·정렬에 실제로 쓰이는 축은 진짜 스칼라 컬럼**으로 뽑았다:
--     per10k, per10kGo1/Go2/Go3(학년은 3개뿐 — 저카디널리티 + 필터 축이라 펼침),
--     gradeSkew, gradeTop, typeSkew, trendLabel, trendRatio/Slope, yearsPresent.
--   즉 규칙은 "카디널리티가 낮고 필터 축이면 펼치고, 높고 표시용이면 JSONB".
-- 탈출구: 훗날 "2024년에 급증한 단어" 같은 질의가 실제로 생기면
--   vocab_drill_lemma_year_rows(lemmaId, year, count, per10k) long 테이블을
--   **추가로** 만들면 된다(additive — 기존 행 재작성 없음).
-- ⚠️ 실측: byYear / per10kByYear 는 build/lemmas.json 에 **없다**. quant 에는
--   trend 요약 8필드만 옮겨져 있다(shapeQuant, scripts/vocab-corpus-stats.ts:335-346).
--   원시 시계열은 stats.json(rows 23,371) · phrase-stats.json(rows 2,079) 에만 있고,
--   이 두 파일의 meta.passages 는 이미 4,537 — **정량 축은 전량 완료 상태**다.
--   그래서 year_stats 테이블은 적재기에 --stats= 를 줄 때만 채워지며, 비어 있어도
--   나머지 기능은 전부 동작한다(전 컬럼 DEFAULT 보유).
-- ============================================================================


-- ############################################################################
-- §2. 콘텐츠 (읽기 전용 · 번들 버전 관리 · 쓰기는 적재기만)
-- ############################################################################

-- ─────────────────────────────────────────────────────────────────────────────
-- 2-1. 번들 원장 — 어떤 코퍼스 스냅샷이 지금 테이블에 들어있는지의 정본.
--      콘텐츠 행의 "bundleVersion" 은 "이 행을 마지막으로 확인한 번들"을 뜻한다.
--      활성 번들이 확인하지 않은 행 = 은퇴 후보(적재기 --sweep 이 retiredAt 을 찍는다).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_bundles" (
  "id"           TEXT PRIMARY KEY,
  "version"      TEXT NOT NULL,                          -- 예: v536-3f2a1c9d (docs + 체크섬)
  "sourcePath"   TEXT NOT NULL,                          -- experiments/…/build/lemmas.json
  "checksum"     TEXT NOT NULL,                          -- sha256(lemmas.json)
  "docs"         INTEGER NOT NULL DEFAULT 0,             -- meta.docs (추출 완료 지문 수)
  "corpusDocs"   INTEGER NOT NULL DEFAULT 0,             -- stats.json meta.passages (전체 지문 수)
  "lemmaCount"   INTEGER NOT NULL DEFAULT 0,
  "senseCount"   INTEGER NOT NULL DEFAULT 0,
  "exampleCount" INTEGER NOT NULL DEFAULT 0,
  "trapCount"    INTEGER NOT NULL DEFAULT 0,
  "status"       TEXT NOT NULL DEFAULT 'STAGED',         -- STAGED | ACTIVE | RETIRED
  "meta"         JSONB NOT NULL DEFAULT '{}'::jsonb,     -- 적재 리포트 요약(검증 실패 건수 등)
  "builtAt"      TIMESTAMP(3),
  "loadedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_bundles_version_key"
  ON "vocab_drill_bundles" ("version");
-- 활성 번들은 언제나 정확히 하나 — 부분 유니크로 DB 가 직접 보장한다.
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_bundles_active_key"
  ON "vocab_drill_bundles" ("status") WHERE "status" = 'ACTIVE';
CREATE INDEX IF NOT EXISTS "vocab_drill_bundles_status_loadedAt_idx"
  ON "vocab_drill_bundles" ("status", "loadedAt");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-2. 표제어 마스터 — id = lemmaId(번들 무관 내용 주소). §1 결정 2.
--      quant 계열은 전부 NULL 허용: 실측 6,860 중 31건이 quant 없음
--      (신규 표제어 — vocab-phrase-stats.ts 재실행 전). NOT NULL 로 잡으면 적재 실패한다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_lemmas" (
  "id"                 TEXT PRIMARY KEY,                       -- sha1(lower(lemma)|pos)[0..15]
  "bundleVersion"      TEXT NOT NULL,
  "lemma"              TEXT NOT NULL,
  "pos"                TEXT NOT NULL,                          -- noun|verb|adjective|adverb|preposition|conjunction|idiom|phrasal_verb|collocation
  "isPhrase"           BOOLEAN NOT NULL DEFAULT FALSE,         -- quant.isPhrase (없으면 pos 로 유도)
  "senseCount"         INTEGER NOT NULL DEFAULT 0,
  "totalEntries"       INTEGER NOT NULL DEFAULT 0,
  "needsMergeJudgment" BOOLEAN NOT NULL DEFAULT FALSE,         -- 4단계 LLM 병합 판정 대기
  "confusable"         JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- string[] (실측: 빈 배열 23건)
  "collocations"       JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- string[] (실측: 빈 배열 3,544건 = 52%)
  "surfaces"           JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- quant.surfaces (실측 최대 7개)
  -- ── quant 스칼라(필터·정렬 축) ──
  "totalOccurrences"   INTEGER,
  "passageCount"       INTEGER,
  "per10k"             DOUBLE PRECISION,                       -- 코퍼스 정규화 빈도(원시빈도로 추세 논하지 말 것)
  -- ★ 학년 3축은 **전 표면형 합산 후 재계산**한 값이다(적재기에 --stats= 를 줬을 때).
  --   year_stats.per10kByGrade 와 반드시 같아야 한다 — 목록(여기)과 상세(거기)가
  --   같은 화면에서 다른 수를 말하면 그게 곧 버그다. 실측: basis 1개만 쓰던 구현판과
  --   값이 갈리는 표제어 1,637/6,829(24.0%), gradeTop(argmax)이 뒤집히는 것 377건(5.5%).
  "per10kGo1"          DOUBLE PRECISION,
  "per10kGo2"          DOUBLE PRECISION,
  "per10kGo3"          DOUBLE PRECISION,
  "gradeTop"           TEXT,                                   -- per10kByGrade argmax: 고1|고2|고3
  "gradeSkew"          DOUBLE PRECISION,
  -- ⚠️ 유형 2축은 아직 **basis(lead) 표면형 값**이다. 유형별 per10k 를 합산 후 재계산하려면
  --   유형별 총단어수가 필요한데 stats.json meta 에 없다(wordsByYear·wordsByGrade 만 있다).
  --   topTypes 의 per10k 를 역산해 추정할 수는 있으나(실측 오차 0.02~0.69%) 측정값 컬럼에
  --   추정치를 넣지 않는다. scripts/vocab-corpus-stats.ts 가 meta.wordsByType 를 산출하면
  --   그때 합산으로 바꾼다. 그전까지 이 두 컬럼은 표제어 전체가 아니라 대표 표면형의 성질이다.
  "typeSkew"           DOUBLE PRECISION,
  "topTypes"           JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- [{typeGroup, per10k}] 상위 3
  -- ── 추세(quant.trend) ──
  "trendLabel"         TEXT,                                   -- 급증|증가|안정|감소|급감|신규 등장|중간기만 등장|미등장
  "trendRatio"         DOUBLE PRECISION,
  "trendSlope"         DOUBLE PRECISION,
  "earlyPer10k"        DOUBLE PRECISION,
  "latePer10k"         DOUBLE PRECISION,
  "yearsPresent"       INTEGER,                                -- basis 표면형 기준(합산값은 year_stats 에)
  "longestGap"         INTEGER,                                -- 〃
  "trendBasis"         TEXT,                                   -- 추세 라벨의 대표 surface(집계 기준이 아니다)
  "zeroKind"           TEXT,                                   -- null | none | absent
  "retiredAt"          TIMESTAMP(3),                           -- 은퇴(DELETE 하지 않는다)
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 자연키 무결성 — id 는 (lemma,pos) 해시이므로 이 유니크가 곧 해시 충돌 감지기다.
-- 충돌 시 조용한 데이터 병합 대신 unique violation 으로 시끄럽게 실패한다.
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_lemmas_lemma_pos_key"
  ON "vocab_drill_lemmas" ("lemma", "pos");
-- Q6 접두 검색(기본 콜레이션 btree 로는 LIKE 'x%' 에 인덱스가 안 걸린다)
CREATE INDEX IF NOT EXISTS "vocab_drill_lemmas_lemma_pattern_idx"
  ON "vocab_drill_lemmas" ("lemma" text_pattern_ops);
-- Q4 트렌드 목록
CREATE INDEX IF NOT EXISTS "vocab_drill_lemmas_trendLabel_per10k_idx"
  ON "vocab_drill_lemmas" ("trendLabel", "per10k" DESC) WHERE "retiredAt" IS NULL;
-- 전역 빈도 랭킹(단어장 소스)
CREATE INDEX IF NOT EXISTS "vocab_drill_lemmas_per10k_idx"
  ON "vocab_drill_lemmas" ("per10k" DESC) WHERE "retiredAt" IS NULL;
-- Q9 스윕/감사
CREATE INDEX IF NOT EXISTS "vocab_drill_lemmas_bundleVersion_idx"
  ON "vocab_drill_lemmas" ("bundleVersion");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-3. 표제어 연도/유형 시계열 — §1 결정 3. 표제어당 1행, PK 조회로만 읽힌다.
--      lemmas.json 에는 없다. 적재기에 --stats=…/stats.json (+ --phrase-stats=)
--      를 줄 때만 채워진다. 비어 있어도 나머지 기능은 전부 동작한다.
--
-- ★ 2026-07-28 정정 (적대검수 major-1/major-2) — 이 테이블의 의미가 바뀌었다.
--   (구) `quant.trend.basis` **표면형 한 개**의 행을 그대로 실었다. basis 는
--        "출현이 가장 많은 표면형"일 뿐 표제어가 아니다. 실측 귀결:
--          · 표제어 총출현 ≠ basis 행 total 인 표제어 1,637/6,829 (24.0%)
--          · 코퍼스 합계 523,846 vs 458,247 → 12.5% 유실
--          · make(verb): 목록 per10k 33.83 vs 상세 그래프 15.17 — 같은 화면이 모순
--   (신) **표제어가 실현한 모든 표면형의 합**이다. 합산 규칙은
--        scripts/vocab-corpus-build.ts 의 quantFor 와 동일하며(구 행은 그 행 하나만 —
--        굴절형이 이미 내부 합산돼 있어 표면형을 또 더하면 이중계상),
--        per10k 는 **합산 후 재계산**한다(연도마다 분모가 다르므로 절대 더하지 않는다).
--        실측: 6,829 표제어 전건에서 Σ(합산) == quant.totalOccurrences → 일치율 100.00%.
-- ★ yearMin/yearMax 는 **0 이 아닌 해**로만 잡는다. byYear 는 25개 연도 키를 전부
--   갖고 0 인 해도 키가 있다 — 키 목록으로 min/max 를 잡으면 전 행이 2003~2027 이
--   되어 컬럼 2개가 정보량 0 이 된다(구현판의 실측 결과가 그랬다).
--   실측(수리 후): 2003 시작 13.33% · 2027 종료 17.19% · 전구간 6.74%.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_lemma_year_stats" (
  "lemmaId"           TEXT PRIMARY KEY,                    -- 1:1 (조인 없이 PK 조회)
  "bundleVersion"     TEXT NOT NULL,
  "statsSource"       TEXT NOT NULL DEFAULT 'stats',       -- stats | phrase-stats | mixed
  "basis"             TEXT,                                -- 추세 라벨의 대표 표면형(quant.trend.basis)
                                                           -- ⚠️ 집계 기준이 아니다 — 집계는 아래 basisSurfaces 전량
  "basisSurfaces"     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 실제로 합산한 통계 행 키 전량
  "totalOccurrences"  INTEGER NOT NULL DEFAULT 0,          -- Σ(합산 행 total). vocab_drill_lemmas 와 같아야 한다
  "byYear"            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"2003":130,…,"2027":206} 25키(0 포함)
  "per10kByYear"      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 합산 후 meta.wordsByYear 로 재계산
  "byGrade"           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"고1":…,"고2":…,"고3":…}
  "per10kByGrade"     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 합산 후 meta.wordsByGrade 로 재계산
  "byType"            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 15종 typeGroup 전체(원시 빈도)
  "byBoard"           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 출제기관(평가원/교육청/EBS…) 원시 빈도
  "yearMin"           INTEGER,                             -- 출현이 **있는** 첫 해 (0 인 해는 등장이 아니다)
  "yearMax"           INTEGER,                             -- 출현이 **있는** 마지막 해
  "yearsPresent"      INTEGER,                             -- 출현이 있는 해의 수(합산 기준)
  "longestGap"        INTEGER,                             -- 최장 연속 미등장 구간(합산 기준)
  "gapFrom"           INTEGER,
  "gapTo"             INTEGER,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 이미 (구) 형상으로 테이블이 만들어진 DB 를 위한 가산 정정. CREATE TABLE IF NOT EXISTS
-- 는 기존 테이블을 건드리지 않으므로 컬럼 추가는 여기서 따로 해야 멱등하다.
-- ADD COLUMN IF NOT EXISTS 는 PostgreSQL 9.6+ 에서 지원되며 반복 실행에 안전하다.
ALTER TABLE "vocab_drill_lemma_year_stats"
  ADD COLUMN IF NOT EXISTS "basisSurfaces"    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "totalOccurrences" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "yearsPresent"     INTEGER,
  ADD COLUMN IF NOT EXISTS "longestGap"       INTEGER;
CREATE INDEX IF NOT EXISTS "vocab_drill_lemma_year_stats_bundleVersion_idx"
  ON "vocab_drill_lemma_year_stats" ("bundleVersion");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-4. 뜻(sense) 마스터 — 이 프로젝트의 핵심 단위. 숙달도의 축이기도 하다.
--      lemma/pos/per10k/gradeTop/isPhrase/trendLabel 은 표제어에서 역정규화한 것
--      (§0 Q1 — 서빙 질의를 단일 테이블로 끝내기 위함. 번들 단위 통째 재적재라
--       갱신 이상 없음).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_senses" (
  "id"                 TEXT PRIMARY KEY,                       -- lemmaId ':' sha1(normSenseKey)[0..7]
  "bundleVersion"      TEXT NOT NULL,
  "lemmaId"            TEXT NOT NULL,                          -- soft-ref → vocab_drill_lemmas.id
  "lemma"              TEXT NOT NULL,                          -- 역정규화
  "pos"                TEXT NOT NULL,                          -- 역정규화
  "senseKey"           TEXT NOT NULL,                          -- 영어 정의 원문(표제어 내 유니크 — 실측 중복 0)
  "senseKeyNorm"       TEXT NOT NULL,                          -- 해시 입력(정규화형). 재빌드 매칭의 기준
  "senseEn"            TEXT NOT NULL,                          -- 대표 영어 정의
  "senseEnVariants"    JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- 병합된 정의 변이형(상한 5)
  "senseKo"            TEXT NOT NULL,                          -- senseKoProvisional (실측 공백 0건)
  "senseKoCandidates"  JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- [{ko, n}] 빈도순
  "tier"               TEXT    NOT NULL DEFAULT 'core',        -- 대표 tier: basic|core|academic|advanced
  "tiers"              JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- 원본은 배열(실측 최대 3개)
  "difficulty"         INTEGER NOT NULL DEFAULT 3,             -- 1~5 = clamp(round(difficultyAvg))
  "difficultyAvg"      DOUBLE PRECISION NOT NULL DEFAULT 3,    -- 실측 1.0~5.0
  "occurrences"        INTEGER NOT NULL DEFAULT 0,
  "exampleCount"       INTEGER NOT NULL DEFAULT 0,             -- 실측: 예문 0개인 sense 없음, 최대 5
  "trapCount"          INTEGER NOT NULL DEFAULT 0,
  "trapRate"           DOUBLE PRECISION NOT NULL DEFAULT 0,    -- 0~1
  "trapKinds"          JSONB   NOT NULL DEFAULT '{}'::jsonb,   -- {kind: count}
  "senseOrder"         INTEGER NOT NULL DEFAULT 0,             -- 표제어 내 표시 순서
  "needsMergeJudgment" BOOLEAN NOT NULL DEFAULT FALSE,         -- 역정규화(병합 대기 표시)
  -- ── 표제어에서 역정규화(서빙 단일 테이블화) ──
  "isPhrase"           BOOLEAN NOT NULL DEFAULT FALSE,
  "per10k"             DOUBLE PRECISION,
  "gradeTop"           TEXT,
  "trendLabel"         TEXT,
  "retiredAt"          TIMESTAMP(3),                           -- 은퇴(DELETE 금지 — 학습 이력이 참조 중)
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 자연키 무결성 + 해시 충돌 감지기
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_senses_lemmaId_senseKeyNorm_key"
  ON "vocab_drill_senses" ("lemmaId", "senseKeyNorm");
-- 표제어 상세(뜻 목록)
CREATE INDEX IF NOT EXISTS "vocab_drill_senses_lemmaId_senseOrder_idx"
  ON "vocab_drill_senses" ("lemmaId", "senseOrder");
-- Q1 학년별 단어장
CREATE INDEX IF NOT EXISTS "vocab_drill_senses_tier_gradeTop_per10k_idx"
  ON "vocab_drill_senses" ("tier", "gradeTop", "per10k" DESC) WHERE "retiredAt" IS NULL;
-- Q2 난이도 창 큐
CREATE INDEX IF NOT EXISTS "vocab_drill_senses_difficulty_per10k_idx"
  ON "vocab_drill_senses" ("difficulty", "per10k" DESC) WHERE "retiredAt" IS NULL;
-- 병합 판정 대기 목록(디렉터 검수 뷰) — 부분 인덱스라 매우 작다
CREATE INDEX IF NOT EXISTS "vocab_drill_senses_needsMerge_idx"
  ON "vocab_drill_senses" ("lemmaId") WHERE "needsMergeJudgment" AND "retiredAt" IS NULL;
-- Q9 스윕/감사
CREATE INDEX IF NOT EXISTS "vocab_drill_senses_bundleVersion_idx"
  ON "vocab_drill_senses" ("bundleVersion");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-5. 예문 — 어느 지문 어느 문장에서 왔는지가 이 테이블의 존재 이유다.
--      id = sha1(senseId|passageId|sentenceIndex|surface) — **정체성 필드만** 해시한다.
--      en/ko 가 재추출로 다듬어져도 같은 행을 UPDATE 하지, 새 행을 만들지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_examples" (
  "id"            TEXT PRIMARY KEY,
  "bundleVersion" TEXT NOT NULL,
  "senseId"       TEXT NOT NULL,                            -- soft-ref → vocab_drill_senses.id
  "lemmaId"       TEXT NOT NULL,
  "passageId"     TEXT NOT NULL,                            -- exam-passages soft-ref
  "sentenceIndex" INTEGER NOT NULL,                         -- 실측 0~31
  "grade"         TEXT,                                     -- 고1|고2|고3
  "year"          INTEGER,                                  -- 실측 2003~2027
  "typeGroup"     TEXT,                                     -- 15종(제목·빈칸추론·어휘·…·함축의미)
  "surface"       TEXT NOT NULL,                            -- 실제 굴절형(made, making)
  "en"            TEXT NOT NULL,
  "ko"            TEXT NOT NULL,
  "ord"           INTEGER NOT NULL DEFAULT 0,               -- sense 내 표시 순서(0~4)
  "retiredAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- sense 상세 + "이 뜻의 고2 예문" 을 한 인덱스로 처리한다.
-- sense 당 예문이 최대 5개이므로 ord 정렬은 메모리에서 공짜 — 인덱스를 더 만들지 않는다.
CREATE INDEX IF NOT EXISTS "vocab_drill_examples_senseId_grade_ord_idx"
  ON "vocab_drill_examples" ("senseId", "grade", "ord");
-- Q5 지문 → 단어 역참조(학습지·시험 연동의 접합점)
CREATE INDEX IF NOT EXISTS "vocab_drill_examples_passageId_idx"
  ON "vocab_drill_examples" ("passageId");
CREATE INDEX IF NOT EXISTS "vocab_drill_examples_bundleVersion_idx"
  ON "vocab_drill_examples" ("bundleVersion");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-6. 함정(trap) — **sense 단위**에 달린다(표제어 단위 아님).
--      kind 7종 실측: polysemy 3,586 · collocation 923 · syntax 760 ·
--      form-confusion 353 · false-friend 294 · negation 48 · register 25.
--      note 는 한국어 서술이며 **제출 후에만** 학생에게 노출한다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_traps" (
  "id"            TEXT PRIMARY KEY,                          -- sha1(senseId|kind|note)[0..15]
  "bundleVersion" TEXT NOT NULL,
  "senseId"       TEXT NOT NULL,
  "lemmaId"       TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "note"          TEXT NOT NULL,
  "ord"           INTEGER NOT NULL DEFAULT 0,
  "retiredAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "vocab_drill_traps_senseId_ord_idx"
  ON "vocab_drill_traps" ("senseId", "ord");
-- 함정 유형별 분석(디렉터 — "다의어 함정이 몰린 단어" 뷰)
CREATE INDEX IF NOT EXISTS "vocab_drill_traps_kind_idx"
  ON "vocab_drill_traps" ("kind") WHERE "retiredAt" IS NULL;
CREATE INDEX IF NOT EXISTS "vocab_drill_traps_bundleVersion_idx"
  ON "vocab_drill_traps" ("bundleVersion");


-- ─────────────────────────────────────────────────────────────────────────────
-- 2-7. sense 이관 원장 — §1 결정 2 (c). 4단계 LLM 병합이 뜻을 합치면 여기에 기록하고,
--      숙달도는 alias 체인을 타고 생존 senseId 로 따라간다.
--      체인(A→B→C)은 액션 레이어에서 해소하며 사이클 방지는 코드 책임.
--
-- ★ 2026-07-28 정정 (적대검수 major-4 / spec §11) — **채우는 주체가 바뀌었다.**
--   이 표는 이제 **명시적 판정이 남긴 매핑만** 담는다. 적재기(scripts/vocab-db-load.ts)가
--   재빌드 때 정의문 Jaccard 유사도로 자동 생성하던 경로는 제거됐다. 그 장치의 실측 귀결:
--     · 생존 sense 가 1개인 표제어(4,451/6,860 = 64.9%)에서는 시드값 때문에
--       **유사도를 계산조차 하지 않고** 죽은 뜻을 전부 그 하나로 병합했다
--     · ON CONFLICT (fromSenseId) DO NOTHING 이라 최초 1회로 굳어 재실행해도 정정 불가
--     · 4단계 병합이 2,409 표제어의 sense 목록을 갈아엎을 예정이라
--       전혀 다른 뜻에 학생 숙달도가 붙는다
--   문자열 유사도는 의미 동일성의 근거가 될 수 없다(3단계 선병합이 같은 이유로 실패했다).
--   근거 없는 매핑은 만들지 않는다 — 고아 숙달도는 자연 소멸하게 둔다(§11.2 "미상").
--   ⚠️ 이 표가 비어 있는 것은 정상이다. 4단계 병합 산출이 채우기 전까지는 비어 있다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_sense_aliases" (
  "id"            TEXT PRIMARY KEY,
  "fromSenseId"   TEXT NOT NULL,                             -- 은퇴한 senseId
  "toSenseId"     TEXT NOT NULL,                             -- 생존 senseId
  "lemmaId"       TEXT NOT NULL,
  "reason"        TEXT NOT NULL DEFAULT 'MERGE',             -- MERGE | RENAME | SPLIT_PICK | MANUAL
  "confidence"    DOUBLE PRECISION NOT NULL DEFAULT 1,       -- 명시 판정은 1. 추정치를 넣지 마라.
  "fromSenseKey"  TEXT,
  "toSenseKey"    TEXT,
  "bundleVersion" TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 은퇴 senseId 하나당 목적지는 하나 — 체인은 되지만 분기는 안 된다.
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_sense_aliases_fromSenseId_key"
  ON "vocab_drill_sense_aliases" ("fromSenseId");
CREATE INDEX IF NOT EXISTS "vocab_drill_sense_aliases_toSenseId_idx"
  ON "vocab_drill_sense_aliases" ("toSenseId");
CREATE INDEX IF NOT EXISTS "vocab_drill_sense_aliases_lemmaId_idx"
  ON "vocab_drill_sense_aliases" ("lemmaId");


-- ############################################################################
-- §3. 학습 데이터 (relation-free · academyId + studentId 컬럼만 · FK 없음)
--     어법의 형상을 그대로 복제한다. 벗어난 곳은 ★ 로 표시하고 이유를 적었다.
-- ############################################################################

-- ─────────────────────────────────────────────────────────────────────────────
-- 3-1. 시도 로그 — 축적의 원장(append-only). 모든 분석이 여기서 파생된다.
--      grammar_drill_attempts 의 정확한 복제 + senseId/lemmaId 2축 + clientKey.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_attempts" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "senseId"       TEXT NOT NULL,                             -- 숙달도의 축
  "lemmaId"       TEXT NOT NULL,                             -- ★ sense 매핑이 끊겨도 살아남는 상위 축
  "deckId"        TEXT,
  "exampleId"     TEXT,                                      -- 문맥 문항이면 사용한 예문
  "itemType"      TEXT NOT NULL,                             -- MEANING_CHOICE | WORD_CHOICE | CONTEXT_FILL | SPELL | EXAMPLE_MATCH | TRAP_JUDGE | FLASH
  "difficulty"    INTEGER NOT NULL DEFAULT 3,
  "correct"       BOOLEAN NOT NULL,
  "answer"        TEXT NOT NULL,                             -- 학생 응답(적재 시 500자 slice — 어법 관례)
  "timeMs"        INTEGER NOT NULL DEFAULT 0,                -- 0~30분 clamp(어법 관례)
  "hintUsed"      INTEGER NOT NULL DEFAULT 0,                -- 0~2
  "meaningPeeked" BOOLEAN NOT NULL DEFAULT FALSE,            -- 풀이 중 뜻 열람(어법 conceptPeeked 대응)
  "source"        TEXT NOT NULL DEFAULT 'DRILL',             -- DRILL | FLASH | CONTEXT | REVIEW | DECK_TEST | MIXED | ASSIGNMENT | WORKSHEET
  "assignmentId"  TEXT,
  ---- ★ 어법에 없는 컬럼: 재시도/네트워크 중복 제출 멱등. NULL 이면 제약 없음.
  "clientKey"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Q7 (어법 인덱스 3종 그대로) + lemmaId 축
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_createdAt_idx"
  ON "vocab_drill_attempts" ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_senseId_idx"
  ON "vocab_drill_attempts" ("studentId", "senseId");
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_lemmaId_idx"
  ON "vocab_drill_attempts" ("studentId", "lemmaId");
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_academyId_createdAt_idx"
  ON "vocab_drill_attempts" ("academyId", "createdAt");
-- Q8 서빙 축(2026-08-04 추가 — §0 Q8 의 ★ 참조). deckId/assignmentId 는 NULL 허용이라
-- 부분 인덱스로 좁힐 수도 있으나, 두 컬럼 모두 NULL 비율이 높지 않고(덱·과제 밖 시도는
-- 복습/취약 큐뿐) 부분 인덱스는 Prisma 가 표현하지 못해 schema.prisma 와 어긋난다.
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_deckId_idx"
  ON "vocab_drill_attempts" ("studentId", "deckId");
CREATE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_assignmentId_idx"
  ON "vocab_drill_attempts" ("studentId", "assignmentId");
-- ★ 멱등 제출(worksheet_study_item_logs 선례의 정신). clientKey 를 보내는
--   클라이언트만 보호받고, 안 보내면 어법과 동일하게 무제약 append 다.
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_attempts_studentId_clientKey_key"
  ON "vocab_drill_attempts" ("studentId", "clientKey") WHERE "clientKey" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3-2. 숙달도 — 학생×sense 1행. 어법 engine.ts:126-168 의 계산식을 그대로 쓴다:
--        seed         prevScore = 기존값 ?? (정답 40 / 오답 10)
--        masteryScore = round((prev*0.75 + (correct?100:0)*0.25) * 10) / 10   (EWMA α=0.25)
--        streak       = correct ? prev+1 : 0
--        box          = correct ? min(5, prev+1) : max(0, prev-2)             (Leitner)
--        난이도 창     box<=1 → [1,2] · box<=3 → [2,3] · else [3,4]
--      ★ 어법에 없는 컬럼 3개(dueAt/lapses/remappedFrom) — 이유는 각 줄 주석 참조.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_mastery" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "senseId"       TEXT NOT NULL,
  "lemmaId"       TEXT NOT NULL,                             -- ★ sense 고아화 대비 상위 집계 축
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "correct"       INTEGER NOT NULL DEFAULT 0,
  "streak"        INTEGER NOT NULL DEFAULT 0,
  "masteryScore"  DOUBLE PRECISION NOT NULL DEFAULT 0,       -- 0~100 EWMA(소수 1자리 유지)
  "box"           INTEGER NOT NULL DEFAULT 0,                -- 0~5 라이트너
  "lapses"        INTEGER NOT NULL DEFAULT 0,                -- ★ box 하락 누적 — "여러 번 무너진 단어" 판별
  "firstSeenAt"   TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  ---- ★ 어법에 없는 컬럼 중 가장 중요. box → 간격 → 다음 복습 예정 시각.
  ----   어법은 학생당 개념 수십 행이라 전량 로드 후 메모리 정렬이 성립했지만,
  ----   단어는 학생당 수천~수만 행이다. dueAt 인덱스 + LIMIT 이 없으면 큐를 짤 때마다
  ----   학생 전체 숙달도를 스캔하게 된다(§0 Q3).
  "dueAt"         TIMESTAMP(3),
  "remappedFrom"  TEXT,                                      -- ★ alias 이관 흔적(감사)
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- 학생×대상 1행 규약(어법 studentId_conceptId 대응) — upsert 의 where 이기도 하다
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_mastery_studentId_senseId_key"
  ON "vocab_drill_mastery" ("studentId", "senseId");
-- Q3 복습 큐(만기순)
CREATE INDEX IF NOT EXISTS "vocab_drill_mastery_studentId_dueAt_idx"
  ON "vocab_drill_mastery" ("studentId", "dueAt");
-- Q3 취약 단어(숙달도 낮은 순). WEAK_SCORE=60 을 부분 인덱스 조건에 박지 않는다 —
-- 코드 상수가 바뀔 때마다 prod DDL 이 필요해지는 결합을 만들지 않기 위함.
CREATE INDEX IF NOT EXISTS "vocab_drill_mastery_studentId_masteryScore_idx"
  ON "vocab_drill_mastery" ("studentId", "masteryScore");
-- 표제어 단위 집계(디렉터 탭 · sense 매핑 붕괴 시 대체 축)
CREATE INDEX IF NOT EXISTS "vocab_drill_mastery_studentId_lemmaId_idx"
  ON "vocab_drill_mastery" ("studentId", "lemmaId");
-- Q9 콘텐츠 재빌드 역참조 — "이 sense 를 학습한 학생 전부" (alias 이관에 필수)
CREATE INDEX IF NOT EXISTS "vocab_drill_mastery_senseId_idx"
  ON "vocab_drill_mastery" ("senseId");
-- 학원 전체 뷰(어법 precedent)
CREATE INDEX IF NOT EXISTS "vocab_drill_mastery_academyId_updatedAt_idx"
  ON "vocab_drill_mastery" ("academyId", "updatedAt");


-- ─────────────────────────────────────────────────────────────────────────────
-- 3-3. 단어장(덱) — 어법의 "유닛" 대응물. ★ 중요: **멤버십 테이블을 두지 않는다.**
--      덱은 "저장된 질의"다. spec JSONB 가 §0 Q1/Q2 의 필터를 담고, 소속 sense 는
--      매번 파생 계산한다. 멤버십을 물리 저장하면 덱 100개 × sense 500개 = 5만 행이
--      번들 재빌드마다 재작성 대상이 되고, 은퇴한 senseId 를 가리키는 죽은 멤버십이
--      쌓인다. 파생으로 두면 그 두 문제가 동시에 사라진다.
--      (고정 목록이 꼭 필요하면 spec.senseIds 에 명시적으로 박는다 — 그때는
--       그 스냅샷이 곧 의도이며 alias 로 이관된다.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_decks" (
  "id"              TEXT PRIMARY KEY,
  "academyId"       TEXT NOT NULL,                           -- GLOBAL 덱은 시스템 학원 id 를 쓴다
  "scope"           TEXT NOT NULL DEFAULT 'ACADEMY',         -- GLOBAL | ACADEMY
  "slug"            TEXT,                                    -- go2-core-500
  "title"           TEXT NOT NULL,
  "subtitle"        TEXT,
  "spec"            JSONB NOT NULL DEFAULT '{}'::jsonb,      -- {grades?,tiers?,difficulties?,posList?,trendLabels?,minPer10k?,excludePhrase?,senseIds?,limit}
  "senseCountCache" INTEGER NOT NULL DEFAULT 0,              -- 표시용 캐시(정본은 spec 파생)
  "orderIndex"      INTEGER NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',          -- ACTIVE | ARCHIVED
  "createdById"     TEXT,                                    -- staff soft-ref
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "vocab_drill_decks_academyId_status_orderIndex_idx"
  ON "vocab_drill_decks" ("academyId", "status", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_decks_academyId_slug_key"
  ON "vocab_drill_decks" ("academyId", "slug") WHERE "slug" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3-4. 덱 진행 — grammar_drill_unit_progress 대응. 학생×덱 1행.
--      단계: LEARN → DRILL → CONTEXT → TEST → MASTERED
--      (어법 CONCEPT → DRILL → READING → WRITTEN → TEST → MASTERED 의 단어판)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_deck_progress" (
  "id"             TEXT PRIMARY KEY,
  "academyId"      TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "deckId"         TEXT NOT NULL,
  "stage"          TEXT NOT NULL DEFAULT 'LEARN',
  "learnDoneAt"    TIMESTAMP(3),
  "drillDoneAt"    TIMESTAMP(3),
  "contextDoneAt"  TIMESTAMP(3),
  "masteredAt"     TIMESTAMP(3),
  "totalCount"     INTEGER NOT NULL DEFAULT 0,               -- 덱 파생 시점 스냅샷
  "seenCount"      INTEGER NOT NULL DEFAULT 0,
  "masteredCount"  INTEGER NOT NULL DEFAULT 0,
  "bestTestScore"  INTEGER,                                  -- 0~100
  "lastStudiedAt"  TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_deck_progress_studentId_deckId_key"
  ON "vocab_drill_deck_progress" ("studentId", "deckId");
CREATE INDEX IF NOT EXISTS "vocab_drill_deck_progress_deckId_updatedAt_idx"
  ON "vocab_drill_deck_progress" ("deckId", "updatedAt");
CREATE INDEX IF NOT EXISTS "vocab_drill_deck_progress_academyId_updatedAt_idx"
  ON "vocab_drill_deck_progress" ("academyId", "updatedAt");


-- ─────────────────────────────────────────────────────────────────────────────
-- 3-5. 과제 — grammar_drill_assignments 대응.
--      ★ 배포 레이어 접합 방향이 어법과 반대다. 어법은 study_assignment_tasks 에
--        "grammarAssignmentId" 컬럼을 두어 위→아래로 가리킨다. 단어는 그 방식을
--        쓸 수 없다 — docs/study-os-spec.md 규약이 "기존 테이블은 **컬럼 추가도
--        하지 않는다**(병렬 세션 충돌 회피)"이기 때문이다. 그래서 여기에 "taskId" 를
--        두어 아래→위로 가리킨다. 공유 테이블은 한 글자도 건드리지 않는다.
--        (StudyAssignment.kind 유니온에 "VOCAB" 을 추가하는 것은 코드 변경이지
--         DDL 이 아니다 — payload JSONB 가 이미 kind 별 스펙을 담는다.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_assignments" (
  "id"            TEXT PRIMARY KEY,
  "academyId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "staffId"       TEXT,
  "taskId"        TEXT,                                      -- ★ study_assignment_tasks soft-ref (역방향)
  "assignmentId"  TEXT,                                      -- study_assignments soft-ref
  "title"         TEXT NOT NULL,
  "note"          TEXT,                                      -- 학생에게 보이는 선생님 메모(합니다체)
  "spec"          JSONB NOT NULL DEFAULT '{}'::jsonb,        -- {deckIds?,senseIds?,lemmaIds?,tiers?,difficulties?,count}
  "status"        TEXT NOT NULL DEFAULT 'ASSIGNED',          -- ASSIGNED | IN_PROGRESS | DONE
  "resultSummary" JSONB,                                     -- {total, correct, timeMs}
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"     TIMESTAMP(3),
  "completedAt"   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "vocab_drill_assignments_studentId_status_idx"
  ON "vocab_drill_assignments" ("studentId", "status");
CREATE INDEX IF NOT EXISTS "vocab_drill_assignments_academyId_createdAt_idx"
  ON "vocab_drill_assignments" ("academyId", "createdAt");
-- 태스크 1건당 단어 과제 1건(중복 브리지 방지)
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_assignments_taskId_key"
  ON "vocab_drill_assignments" ("taskId") WHERE "taskId" IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3-6. 스텟 — 학생당 1행. grammar_drill_stats 의 단어판(축소).
--      칭호의 정본은 코드(순수 함수)이고 titles JSONB 는 획득 시각 이력일 뿐이다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vocab_drill_stats" (
  "id"             TEXT PRIMARY KEY,
  "academyId"      TEXT NOT NULL,
  "studentId"      TEXT NOT NULL,
  "xp"             INTEGER NOT NULL DEFAULT 0,
  "sensesSeen"     INTEGER NOT NULL DEFAULT 0,
  "sensesMastered" INTEGER NOT NULL DEFAULT 0,               -- masteryScore >= 80 도달 누적
  "decksCompleted" INTEGER NOT NULL DEFAULT 0,
  "reviewsDone"    INTEGER NOT NULL DEFAULT 0,
  "bestCombo"      INTEGER NOT NULL DEFAULT 0,
  "tierXp"         JSONB   NOT NULL DEFAULT '{}'::jsonb,     -- {"basic":0,"core":0,"academic":0,"advanced":0}
  "posXp"          JSONB   NOT NULL DEFAULT '{}'::jsonb,     -- {"noun":0,…,"collocation":0}
  "titles"         JSONB   NOT NULL DEFAULT '[]'::jsonb,     -- [{key, earnedAt}]
  "lastStudyDate"  TIMESTAMP(3),
  "streakDays"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vocab_drill_stats_studentId_key"
  ON "vocab_drill_stats" ("studentId");
CREATE INDEX IF NOT EXISTS "vocab_drill_stats_academyId_updatedAt_idx"
  ON "vocab_drill_stats" ("academyId", "updatedAt");


-- ============================================================================
-- §4. 적용 후 할 일 (이 SQL 이 하지 않는 것)
--
-- 1) prisma/schema.prisma 에 동일 모델 13개를 **손으로** 추가한다(@@map 필수).
--    테이블은 이 SQL 이 만들었고, schema.prisma 는 Prisma Client 타입만 맞춘다.
--    모델 블록 위에 아래 주석을 반드시 단다:
--      /// 적용 SQL: prisma/sql/vocab-drill-init.sql (surgical, migrate 금지)
--    타입 대응: TEXT→String, INTEGER→Int, DOUBLE PRECISION→Float,
--              BOOLEAN→Boolean, JSONB→Json, TIMESTAMP(3)→DateTime,
--              TEXT(장문: note/en/ko/answer/senseKey)→String @db.Text
--    ※ 적재기 scripts/vocab-db-load.ts 는 $executeRaw 로 쓰므로 schema.prisma
--      갱신 **전에도** 동작한다. 서빙 코드만 생성 타입이 필요하다.
--
-- 2) 부분 유니크 인덱스 3개(bundles_active_key, attempts_studentId_clientKey_key,
--    decks_academyId_slug_key, assignments_taskId_key)는 Prisma 가 표현하지 못한다.
--    schema.prisma 에는 @@unique 를 **적지 마라** — introspect drift 가 난다.
--    대신 모델 주석에 "부분 유니크(SQL 정본)" 라고 남긴다.
--
-- 3) 콘텐츠 적재:
--      npx tsx scripts/vocab-db-load.ts --file=experiments/vocab-corpus-20260728/build/lemmas.json
--      (검증 리포트 확인 후) … --apply
--      (연도 시계열까지) … --stats=experiments/vocab-corpus-20260728/stats.json \
--                          --phrase-stats=experiments/vocab-corpus-20260728/phrase-stats.json --apply
--
-- 4) 자기 검증 — 주석을 **전부 제거한 뒤**(줄 끝 주석 포함) 확인한다.
--    a. 레거시 4테이블 참조 0건. 이름은 위 §0 §1 주석에서 언급할 뿐이다:
--         sed 's/--.*//' prisma/sql/vocab-drill-init.sql \
--           | grep -cE 'vocabulary_|vocab_test_results|wrong_vocab_answers'   # → 0
--    b. DROP / DELETE / TRUNCATE 0건 (파괴적 조작 없음):
--         sed 's/--.*//' prisma/sql/vocab-drill-init.sql \
--           | grep -ciE '\b(drop|delete|truncate)\b'                          # → 0
--       ALTER 는 **1건 있다** — vocab_drill_lemma_year_stats 의 컬럼 4개 가산
--       (basisSurfaces / totalOccurrences / yearsPresent / longestGap).
--       CREATE TABLE IF NOT EXISTS 는 이미 있는 테이블을 건드리지 않으므로,
--       구 형상으로 이미 만들어진 DB 를 따라오게 하려면 ADD COLUMN IF NOT EXISTS
--       가 유일한 멱등 수단이다. 여전히 순수 additive다 — 컬럼을 지우거나
--       타입을 바꾸지 않는다:
--         sed 's/--.*//' prisma/sql/vocab-drill-init.sql \
--           | grep -icE 'alter table .* (drop|alter) column'                  # → 0
--    c. 멱등 — IF NOT EXISTS 없는 CREATE / ADD COLUMN 0건
--       (주석을 먼저 지운다 — 이 자기검증 문단 자체가 패턴에 걸린다):
--         sed 's/--.*//' prisma/sql/vocab-drill-init.sql \
--           | grep -E '^CREATE (TABLE|UNIQUE INDEX|INDEX)|ADD COLUMN' \
--           | grep -vc 'IF NOT EXISTS'                                        # → 0
--    d. 개수: CREATE TABLE 13 · CREATE INDEX 47 · ALTER TABLE 1(ADD COLUMN 4)
--       (45 → 47: 2026-08-04 attempts 의 studentId+deckId / studentId+assignmentId 가산)
-- ============================================================================
