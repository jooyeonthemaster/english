# 내신 적중 예측 팩(exam-forecast)

학교 한 곳의 시험 한 번을 겨냥해 **기출 해부 → 범위 지문별 출제 예측 → 동형 봉투 모의고사·예측 문항 문제집**을 만들어
화면에서 걸러 보고, 골라 담고, 기출과 같은 조판의 시험지로 인쇄·PDF 로 받는 기능이다.

- 화면: `/director/exam-forecast` (목록) · `/director/exam-forecast/[slug]` (팩)
- 인쇄: `/director/exam-forecast/[slug]/print` (앱 셸 없는 전용 화면)
- 첫 팩: `hanguang-2026-2mid` — 한광고 2학년 2026학년도 2학기 1차

팩마다 달라지는 것(학교 시험지 원본, 분석 원장, 생성 스펙)은 저장소에 넣지 않는다 — 공개 저장소이고 학교·교재의 저작물이 섞여 있다.
그 자료는 작업장(`.tmp-<팩>/`, `docs/<팩>/`, 둘 다 gitignore)과 DB 에만 둔다. 이 문서는 구조와 운영법만 적는다.

## 1. 데이터

`prisma/migrations-manual/20261001_exam_forecast.sql` (추가 전용 · 관계 없음 · `prisma db execute` 로 적용).

| 테이블 | 한 행 | 주요 컬럼 |
|---|---|---|
| `exam_forecast_packs` | 팩 | `slug` · `examMeta`(시험지 머리·바닥글 문구, `access.academyIds`) · `analysis`(출제 경향 해부) · `rangeInfo`(범위 추정 근거) |
| `exam_forecast_passages` | 지문 | `code` · `sourceGroup`(학평/올림포스/기출) · `text` · `analysis` · `prediction`(유형별 출제 확률) |
| `exam_forecast_questions` | 문항 | `role`(reference = 기출 원본, forecast = 예측) · `qtype` · `body`(렌더 모델) · `answer` · `explanation` · `rationale` · `transform` · `sortOrder` |
| `exam_forecast_sets` | 봉투 모의고사 1회 | `no` · `tier` · `items`[{number, questionId, points}] |

타입·JSON 계약은 `src/lib/exam-forecast/types.ts`(문항)와 `analysis-types.ts`(분석)에 있다.
문항 본문 마크업: `<u>` `<b>` `<i>` · `[[BLANK]]` `[[BLANK:A]]` · `[[SLOT:n]]` · 빈 줄 = 문단.

### 열람 권한

기본은 원장 세션이 필요하고, 팩의 `examMeta.access.academyIds` 가 있으면 **그 학원만** 열 수 있다(없으면 원장 전원).
`examMeta.access.public: true` 면 **공개 팩** — 링크만 있으면 로그인 없이 누구나 연다(학원 제한보다 우선, 검색 노출은 noindex 로 막음).
비원장(비로그인·강사)이 `/director/exam-forecast/<slug>` 를 열면 proxy 가 셸 없는 `/forecast/<slug>` 로 보내고, 인쇄 화면은 그대로 통과시킨다 — 비공개 팩이면 두 페이지가 로그인·`/teacher` 로 되돌린다.
판정은 `isForecastPackPublic`·`canAccessForecastPack`(`src/lib/exam-forecast/queries.ts`) — 화면·인쇄·API 가 같이 쓴다.
넓히거나 공개·잠금을 바꾸려면 DB 의 `examMeta.access` 만 고친다(코드 변경·배포 불필요). 재적재 때는 `FORECAST_ACCESS_ACADEMY_IDS`·`FORECAST_PUBLIC=1` 환경변수로 `build-bundle.py` 가 같은 값을 다시 쓴다.

## 2. 화면

| 탭 | 내용 |
|---|---|
| 개요·범위 | 범위 추정 근거 사슬, 기출 ↔ 원 출처 대조표, 예상 출처 구성, 지문 적중 지도 |
| 출제 경향 해부 | 기출 30문항 지도(유형·배점·출처), 배점·정답 분포 차트, 원문 → 시험지 변형 대조, 설계 원리 카드(반박 검증 결과 포함), 렌즈별 발견 |
| 지문별 예측 | 지문 원문·논리 흐름·어법·어휘, 유형별 출제 확률과 출제 지점, 그 지문의 예측 문항(펼쳐 보기·담기·지문 단위 인쇄) |
| 문항 은행 | 출처·유형 계열·세부 유형·난도·종류·봉투 회차·지문·검색으로 거르기, 체크해서 담기 |
| 봉투 모의고사 | 회차별 구성표, 문제지·정답해설 PDF, 문제집 PDF |
| 기출 원본 | 실제 시험지 문항을 같은 조판으로 재현 + 정답·출처·원문 대조 |

담은 문항은 하단 트레이에 모이고(브라우저 `localStorage`, 고른 순서 보존) 「시험지로 인쇄·PDF」「정답·해설지」로 나간다.
문항 본문은 목록에 싣지 않고 펼칠 때 `/api/exam-forecast/[slug]/questions?ids=` 로 받는다.

## 3. 조판 엔진

`src/components/exam-forecast/paper/`

- `paged-paper.tsx` — 숨은 측정 단(폭 90.4mm)에서 문항의 「발문+지문」「선지」 높이를 재고, `paginate.ts` 가 단·쪽에 배치한 뒤
  210×297mm 쪽으로 그린다. **화면 = 인쇄 = PDF**(같은 DOM). 준비되면 `data-fcp-ready="1"`.
- `paginate.ts` — 배치 규칙: 통째로 들어가면 넣고, 안 들어가면 「발문+지문」만 이 단 바닥에 두고 선지를 다음 단으로.
  단에 블록이 둘 이상이면 첫 블록은 꼭대기·끝 블록은 바닥(남는 공간은 사이). 꽉 찬 단은 줄 간격을 최대 12% 줄인다.
  논술형은 새 쪽에서 문항당 한 단, 마지막 단 바닥에 「확인 사항」 상자.
- `question-parts.tsx` — 문항 블록(위: 발문·상자·지문 / 아래: 선지·답란). 선지 모양 5종(목록·2열·3열·표·두 줄 쌓기).
- `paper-css.ts` — 실측 치수(mm). 블록 공통 / 쪽 배치(@page 여백 0) / 정답지 흐름(@page 여백 있음).
- `answer-sheet.tsx` — 정답표 + 해설 2단 흐름.

인쇄 경로 쿼리: `?set=3` · `?set=3&answers=1` · `?q=12-40,55`(문항 `sortOrder` 목록) · `?passage=<code>` · `?workbook=all|hakpyeong|olympus` · `?ref=1` · `&print=0`(자동 인쇄 끔).
브라우저 인쇄 대화상자에서 문제지는 여백 「없음」, 「머리글과 바닥글」 끔.

## 4. 스크립트(`scripts/exam-forecast/`)

| 파일 | 하는 일 |
|---|---|
| `transcript-to-paper.py` | 기출 전사 JSON → 렌더 모델 |
| `build-blueprint.py` | 봉투 N회 배정표(회차당 지문 1회, 지문×유형 중복 없음, 원 유형 배제, 출처 비율, 정답 번호 균형) + 문제집 확장 과제 |
| `build-jobs.py` | 지문별 생성 과제 브리프(4문항씩) |
| `build-bundle.py` | 지문·분석·예측·문항·세트 → 번들 JSON (`FORECAST_ACCESS_ACADEMY_IDS` 로 허용 학원 지정). **범위 검사**: 작업 폴더의 `range/range-allowlist.json` 이 없거나, 그 목록 밖 지문이 지문·문항·봉투 어디에든 있으면 번들을 만들지 않고 멈춘다 |
| `display_text.py` | 번들 직전 표시용 정리 — 해설의 지문 문장 번호(❶·S3)를 「셋째 문장」으로(조사 보정), 출제 예측의 작업 문서 참조 제거. 편집 워크플로가 다듬은 오버레이(`gen/display-overlay.json`, 원문 해시 일치분만)를 우선 쓴다 |
| `seed-pack.ts` | 번들 → DB 멱등 적재(`--dry` 검사만, `--prune` 번들에 없는 행 삭제) |
| `build-pdfs.mjs` | 앱 인쇄 경로를 Playwright 로 열어 PDF 생성(`set:3` `set:3:answers` `workbook:all` `ref` `all-sets`) |
| `upload-pdfs.mjs` | PDF → Supabase 비공개 버킷 `exam-forecast/<slug>/` (내려받기는 `/api/exam-forecast/[slug]/pdf?file=` 60초 서명 URL) |

문항 생성·검수는 과금 API 가 아니라 Claude Code 에이전트 워크플로로 돌린다.

1. **생성** — 작성 → 기계 검사(유형별 형식·정답 번호·[보기] 낱말 수) → 블라인드 풀이 ∥ 공개 감사 → 반박권 있는 수정 → 재풀이.
2. **재심** — 판정이 갈린 문항은 서로 다른 렌즈의 블라인드 풀이 2인(정답 없는 인쇄용 파일만 읽음)이 다시 푼다.
   둘 다 정답과 같고 「다른 답도 인정해야 한다」(`altMustBeAccepted`)가 없으면 원안 유지, 아니면 수리 → 2인 재확인(최대 2회).
   판정 함정: 풀이자가 「다른 답 없음」을 서술 칸에 적어도 분쟁으로 세면 오탐이 쏟아진다 — 인정 여부는 불리언으로 따로 받는다.
   등위 명사구 순서만 바꾼 배열·부사절 위치만 다른 배열은 기출과 같은 허용 대안이다.
3. **회차 감수** — 회차마다 통독(문항 사이 누설·선지 중복·정답 분포·난도) ∥ 조판 쪽 이미지 시각 검수 ∥ 블라인드 수험생 30문항 전수 풀이(채점은 스크립트). 지적 문항은 2의 재심 경로로 고친다.
4. **표시 문장 편집** — 출제 예측·설계 문장의 작업 용어를 선생님용 문장으로(사실 보존 감사 + 원리 번호 보존 게이트).

## 5. 새 팩을 만들 때

1. 기출 스캔을 전사하고 범위 지문을 정규화한다(원문은 코퍼스·교재와 기계 대조).
   **범위는 학원 범위 파일의 수업용 자료에 본문이 실린 지문만**이다 — 파일에서 기계로 뽑아 `range-allowlist.json` 을 만들고,
   추정으로 지문을 더하지 않는다(업체 변형문제 묶음은 범위와 무관하게 전 번호를 다루므로 근거가 아니다).
2. 기출 지문의 출처를 코퍼스와 대조해 범위 패턴을 확정한다 — 근거는 `rangeInfo.evidence` 에 단계별로 남긴다.
   직전 시험의 **범위 자료와 실제 시험지를 지문 단위로 전수 대조**해(범위 N지문 중 몇 개가 어떤 유형으로 나왔나) 지문별 출제 확률을 보정한다.
   보정은 블라인드 백테스트(시험지를 못 보는 예측자에게 범위만 주고 예측 → 실제와 채점)로 검증한다.
3. 기출을 재조판해 스캔과 쪽 단위로 견준다(쪽수·블록 배치·줄 수). 치수는 `paper-css.ts` 의 변수로만 조정한다.
4. 배정표 → 생성 → 검수 → 번들 → 적재 → PDF → 업로드 순으로 4절 스크립트를 돌린다.
5. `examMeta.access.academyIds` 를 정하고 음성테스트(허용 목록 밖 학원이면 404)를 돌린 뒤 배포한다.
