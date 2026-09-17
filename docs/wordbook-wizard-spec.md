# 단어장 만들기 위저드 + 추천 커리큘럼 — 확정 스펙 v1

> **이 문서가 유일 정본이다.** 구현 에이전트는 이 문서와 견본 파일만 근거로 삼는다.
> 여기 없는 숫자·명칭·필드를 창작하는 것은 **critical 결함**이다.
> 원장: 2026-08-10, 브랜치 jooyeon20260727. 감독(본체)이 개정권을 가진다.

## 0. 목표 (한 줄)

디렉터가 `/director/workbench/wordbook` 에서 **5스텝 위저드**로
추천 커리큘럼 기반 "교재형 단어장"(N단어 → 단계 분할 → 학습 주기)을 만들고,
**시차 예약 배포**로 하루치가 자동으로 열리게 한다.

## 1. 확정 UX 플로우

### 진입
- 상단바(`wordbook-client.tsx` 헤더)에 **주 CTA 「단어장 만들기」** (blue-600, h-8, Sparkles/BookPlus 아이콘).
  「담은 단어 N」 버튼 왼쪽. md 미만에서도 노출(아이콘+축약).
- 「보낸 단어장」 뷰의 "우리 학원 단어장" 빈 상태 → 같은 위저드 열기.
- BasketDock step "list" 상단에 보조 진입: 「이 단어들로 교재 짜기」 (담은 단어를 위저드 재료로).

### 위저드 5스텝 (전면 모달)
```
1 커리큘럼   추천 커리큘럼 8종 갤러리 + 직접 설계 + (담은 단어 있으면) 담은 단어로
2 범위·수준  단어 수 / 수준·난이도 / 학년 / 고급 조건 + 실시간 매칭 카운트
3 구성 방식  단계(유닛) 정렬·분류 체계 4종 + 단계 미리보기
4 학습 주기  하루 단어 수 ↔ 기간 양방향 계산 + 주5/7일 + 요약 문장
5 확인·생성  이름 / 요약 카드 / 단계 아코디언 → 생성 → 성공 화면(배포 3택)
```
- 프리셋을 고르면 2~4 스텝이 **프리셋 기본값으로 미리 채워진 채** 열린다. 스텝을 건너뛰지 않는다
  (수정 기회를 항상 준다). 직접 설계는 빈 기본값으로 시작.
- 담은 단어 모드(`sourceSenseIds` 지정)일 때 스텝 2는 "담은 단어 N개를 사용합니다" 잠금 카드로 대체.

### 성공 화면의 배포 3택 (버튼 3개, 큼직하게)
1. **「스케줄대로 자동 배포」** — SeriesDeploy 모달: 대상 선택 + 시작일 → 단계별 과제를
   `availableFrom` 시차 예약으로 일괄 생성.
2. **「1단계만 먼저 보내기」** — 기존 BasketDock send 스텝 재사용(`presetDeck`=1단계 덱).
3. **「나중에 보내기」** — 닫고 「보낸 단어장」 뷰로 전환(새 교재 카드가 보이는 상태).

## 2. 데이터 모델 — DDL 없음, spec JSONB 확장

`VocabDeckSpec` (`src/lib/vocab-drill/payload.ts`)에 **선택 필드 1개** 추가:

```ts
/** 교재(시리즈) 소속 표식 — 위저드 산출 덱에만 존재. */
series?: {
  key: string;        // 교재 식별자 (위저드가 생성, 전 단계 덱 공유)
  title: string;      // 교재 이름 (덱 title 과 별개 보존)
  index: number;      // 1-base 단계 번호
  total: number;      // 총 단계 수
  curriculum?: string;    // 프리셋 key (직접 설계면 없음)
  schedule?: {
    wordsPerDay: number;  // = 단계(유닛) 크기
    daysPerWeek: 5 | 7;
    totalDays: number;    // 학습일 수 = 단계 수
  };
};
```

- 단계 덱 spec = `{ senseIds: [...], limit: senseIds.length, series }` — **명시 목록**이라
  코퍼스가 갱신돼도 교재 내용이 흔들리지 않는다(교재는 책이다).
- `sanitizeDeckSpec`(`src/actions/vocab-drill-admin/decks.ts`)은 미지 키를 버리므로
  **series 화이트리스트 추가 필수** (`sanitizeSeriesMeta` — 타입·범위 검증, index 1..total, total 1..60,
  wordsPerDay 5..100, totalDays 1..120, key/title 문자열 길이 제한 key≤40·title≤80).
- **학생 트랙 허브 오염 방지**: `listActiveDecks`(`src/lib/vocab-drill/decks.ts`)가
  ACTIVE 덱을 take:30 으로 전부 노출한다 → **take:120 으로 읽고 `spec.series` 보유 덱을 JS 필터로
  제외 후 30개 slice**. 단계 덱은 학생에게 과제로만 도달한다.
  (`listStudentDecks` 가 이 함수를 부르는 구조는 유지.)

## 3. 서버 계약 — 신규 파일 2개

### 3a-0. 파일 분리 (개정 1 — 클라이언트 임포트 안전성)

- **`src/lib/vocab-drill/wordbook-plan-types.ts`** — 순수 타입·산식·클램프 상수.
  클라이언트에서 임포트 가능(서버 의존 0). WizardState·커리큘럼·스텝이 전부 여기 타입을 쓴다.
- **`src/lib/vocab-drill/wordbook-plan.ts`** — 서버 리졸버(listWordbookSensesData·prisma 사용).
  액션에서만 임포트.
- size 하한은 5 (담은 단어 모드가 소량일 수 있다 — 스펙 v1 의 50 을 개정).

### 3a. `src/lib/vocab-drill/wordbook-plan(-types).ts` (순수 로직 + 리졸버)

```ts
export type WordbookOrderScheme =
  | "easy-first"    // difficultyAvg ASC NULLS LAST, per10k DESC 타이브레이크
  | "frequency"     // per10k DESC NULLS LAST, senseId ASC
  | "tier-ladder"   // tier 서열(basic0→core1→academic2→advanced3) ASC, per10k DESC
  | "mixed-pos";    // frequency 로 뽑은 뒤 JS 라운드로빈으로 유닛마다 품사 고르게

export interface WordbookPlanBase {   // 스텝2가 만드는 풀 조건 (탐색 필터의 부분집합)
  grades?: string[]; tiers?: string[]; difficulties?: number[];
  posList?: string[]; trendLabels?: string[];
  excludePhrase?: boolean; excludeStopwords?: boolean;
  minTrapRate?: number;               // 덱 spec 엔 없지만 됨 — 최종 덱은 senseIds 라서
  allSenses?: boolean;                // 위저드 기본 false(대표 뜻만) — 반드시 명시
  passage?: VocabPassageScope;
}

export interface WordbookPlanInput {
  base: WordbookPlanBase;
  sourceSenseIds?: string[];          // 담은 단어 모드 — 있으면 base 무시
  size: number;                       // 총 단어 수 50..2500
  wordsPerDay: number;                // 단계 크기 5..100
  daysPerWeek: 5 | 7;
  order: WordbookOrderScheme;
}

export interface WordbookUnitPlan {
  index: number;                      // 1-base
  title: string;                      // "1단계"
  senseIds: string[];
  count: number;
  sample: { lemma: string; senseKo: string; pos: string }[];  // 앞 6개
  tierCounts: Record<string, number>;
  avgDifficulty: number | null;       // difficultyAvg 평균, 소수 1자리
}

export interface WordbookPlan {
  totalMatched: number;               // 조건에 걸린 전체 (size 클램프 전)
  totalPlanned: number;               // min(size, totalMatched)
  units: WordbookUnitPlan[];
  schedule: { wordsPerDay: number; daysPerWeek: 5 | 7; totalDays: number; calendarDays: number };
  warnings: string[];                 // "조건에 맞는 단어가 요청보다 적습니다" 등 한국어 문장
}
```

- 리졸버는 `listWordbookSensesData`(`wordbook-explore.ts`)를 **재사용**한다
  (offset 0, limit=size, sort 는 scheme 매핑: easy-first→difficulty asc / frequency→per10k desc /
  tier-ladder→tier asc / mixed-pos→per10k desc). 탐색 화면과 같은 해석기 = 화면·덱 불일치 원천 차단.
  단 easy-first 는 sort "difficulty" 가 정수 컬럼이므로 **동률이 크다** — 리졸버가 받은 rows 를
  JS 에서 (difficultyAvg ?? difficulty) 로 안정 재정렬한다 (row 에 difficultyAvg 없으면 difficulty 사용).
- `sourceSenseIds` 모드: prisma 로 해당 sense 직접 조회(활성 번들, retiredAt null) 후 JS 정렬.
- 스케줄 산식(정본):
  `totalDays = ceil(totalPlanned / wordsPerDay)` (= units.length)
  `calendarDays = daysPerWeek === 7 ? totalDays : totalDays + floor((totalDays - 1) / 5) * 2`
  (주5일제: 5학습일마다 주말 2일 삽입 — 시작 요일 무관한 근사치. 표시용.)
- mixed-pos 는 **비례 보간(smooth weighted round-robin)** 이다(개정 3 — 단순 라운드로빈은
  작은 버킷이 앞 단계에서 소진돼 뒷 단계가 명사·형용사만 남았다, 스모크 실측).
  버킷 소비 속도가 크기에 비례해 전 버킷이 거의 동시에 바닥난다.

### 3b. `src/actions/vocab-drill-admin/wordbook-wizard.ts` ("use server")

```ts
export async function planWordbookAction(input: WordbookPlanInput & { countOnly?: boolean })
  : Promise<VocabDeckActionResult<WordbookPlan | { totalMatched: number }>>
// countOnly → listWordbookSensesData(limit 1) 로 total 만. 스텝2 라이브 카운트용(디바운스 300ms).

export async function createWordbookSeriesAction(input: {
  title: string;                      // 교재 이름 (trim, 80자)
  subtitle?: string;                  // 120자
  curriculum?: string;                // 프리셋 key
  units: { title: string; senseIds: string[] }[];   // planWordbook 산출 그대로
  schedule: { wordsPerDay: number; daysPerWeek: 5 | 7; totalDays: number };
}): Promise<VocabDeckActionResult<{ seriesKey: string; deckIds: string[]; totalWords: number }>>
// requireStaffAuth → 검증(units 1..60, unit.senseIds 1..500, 총합 ≤2500,
// senseId 실존·활성 확인은 senses 일괄 조회 1회) → $transaction 으로 덱 N개 생성.
// 덱 title = `${교재이름} · ${i}단계`, subtitle = 유닛 요약(선택), orderIndex = 1000 + i,
// senseCountCache = senseIds.length, spec.series 포함. slug 는 null.

// ★ 개정 4 (2026-08-10 적대검수 반영) — 청크 배포 계약
export async function deployWordbookSeriesAction(input: {
  seriesKey: string;
  targets: { type: "STUDENT"; id: string }[];       // 기존 StudyTargetInput 그대로
  startDate: string;                                // "YYYY-MM-DD" (KST)
  itemTypes?: string[];                             // 미지정 = 자동 섞기
  countPerUnit?: number;                            // 미지정 = min(유닛 크기, 100), 5 미만이면 5
  withDue?: boolean;                                // 기본 false = 마감 없음
  fromIndex?: number;                               // 0-base 이어받기
}): Promise<VocabDeckActionResult<{
  created: number; skipped: number; failedUnits: number[]; failedReason?: string;
  firstAvailable: string; nextIndex: number | null; totalUnits: number;
}>>
// **호출부는 nextIndex 가 null 이 될 때까지 반복 호출해야 한다**(한 번에 10단계).
// 누적 집계(created 합·failedUnits 합)는 호출부 책임. 날짜는 series.index 가 아니라
// **활성 단계 순번(fromIndex 기준 i+1)** 으로 잡는다(보관 구멍이 있어도 연속).
// withDue=false 가 기본인 이유: 매 단계에 자정 마감을 붙이면 다음 날부터 학생
// 화면에 「기한 지남」이 단계 수만큼 쌓인다(교재는 밀리면 따라잡는 것이 정상).
// 시리즈 덱들을 조회(academy 소유 + spec.series.key 일치, index 순) →
// 유닛 i 의 학습일 = startDate 부터 daysPerWeek 반영해 i번째 학습일
//   (주5일제: 토·일 건너뜀. startDate 가 주말이면 다음 월요일부터.)
// availableFrom = 그 날 00:00 KST (1단계이고 그 날이 오늘이면 now),
// dueAt = 그 날 23:59:59 KST (basket-send 의 KST 고정 관용구 재사용),
// 과제 제목 = `${교재이름} · ${i}단계`, payload = { deckIds:[덱id], count, itemTypes? }.
// 내부적으로 createStudyAssignment 를 유닛마다 호출(가드 전부 재사용). 실패 유닛은 skipped 로 계상.
```

- KST 산식은 `basket-send.tsx` 의 마감일 관용구(자정 고정)를 따른다. date-fns 금지(리포 규약).
- `VocabDeckActionResult` 는 `decks.ts` 의 기존 타입 재사용.

## 4. 추천 커리큘럼 8종 — `src/lib/vocab-drill/wordbook-curricula.ts`

**전 수치는 2026-08-10 활성 번들 `v4537-761b9699` 실측으로 보정한 값이다. 임의 변경 금지.**
각 항목: `key, title, tagline, audience, badge, base(WordbookPlanBase), size, wordsPerDay,
daysPerWeek, order, accent("blue"|"emerald"|"amber"|"purple"|"rose"|"slate")`.

| key | title | 대상 | base 핵심 | size | 하루 | 주기 | order |
|---|---|---|---|---|---|---|---|
| `suneung-final-1000` | 수능 파이널 1000 | 고3·수능 직전 | grades:[고3], tiers:[core,academic], excludeStopwords, excludePhrase | 1000 | 40 | 7일 | frequency |
| `go1-first-600` | 고1 첫 내신 기초 600 | 고1 | grades:[고1], tiers:[basic,core], excludeStopwords, excludePhrase | 600 | 20 | 5일 | easy-first |
| `go2-core-800` | 고2 실력 다지기 800 | 고2 | grades:[고2], tiers:[core], excludeStopwords, excludePhrase | 800 | 25 | 5일 | easy-first |
| `master-2000` | 수능 핵심 마스터 2000 | 전 학년 장기 | tiers:[core,academic], excludeStopwords, excludePhrase | 2000 | 40 | 5일 | tier-ladder |
| `advanced-500` | 고난도 어휘 정복 500 | 상위권 | tiers:[advanced], difficulties:[4,5], excludeStopwords, excludePhrase | 500 | 20 | 5일 | frequency |
| `idiom-600` | 숙어·구동사 완성 600 | 전 학년 | posList:[idiom,phrasal_verb], excludeStopwords | 600 | 20 | 5일 | frequency |
| `trend-300` | 요즘 뜨는 단어 300 | 최신 경향 대비 | trendLabels:[급증,신규 등장,증가], excludeStopwords, excludePhrase | 300 | 15 | 5일 | frequency |
| `trap-400` | 함정 집중 케어 400 | 오답 잦은 학생 | minTrapRate:0.3, excludeStopwords, excludePhrase | 400 | 20 | 5일 | frequency |

- 공통: `allSenses:false` 명시(대표 뜻만 — **3상태 함정**, 미명시 금지).
- 풀 실측 근거(감독 정찰): 고3 core+academic 풀 3,309 / 고1 2,458 / 고2 2,484 / advanced 6,560 /
  idiom+phrasal_verb 6,968 / 급증1,728+신규7,566+증가1,756(표제어) / trapRate>0 뜻 11,276 —
  전 프리셋 size 가 풀 안에 든다. 단 카드에 **정적 풀 숫자를 박지 않는다**(라이브 카운트가 정본).
- tagline·audience 문안은 구현 에이전트가 쓰되 **과장 금지**("25개년 기출 전수 분석" 같은 실측 기반
  표현은 가능 — 코퍼스는 실제 2003~2027·지문 4,537·표제어 27,011).
- 멘트 순화 규약: 화면에 "표제어→단어", "시행처→시험 종류", "티어→수준". 영문 enum 노출 금지.

## 5. 위저드 상태 계약 — `wizard/wizard-types.ts` (견본에 포함, 변경은 감독만)

```ts
export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  curriculum: string | null;          // 프리셋 key | null(직접 설계)
  sourceSenseIds: string[] | null;    // 담은 단어 모드
  base: WordbookPlanBase;
  size: number;
  order: WordbookOrderScheme;
  wordsPerDay: number;
  daysPerWeek: 5 | 7;
  paceMode: "daily" | "period";       // 스텝4 탭 — 하루 양 기준 | 기간 기준
  periodWeeks: number;                // paceMode "period" 일 때 입력값 (1..26)
  title: string;
  subtitle: string;
}
export interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  plan: WordbookPlan | null;          // 스텝3 진입 시 셸이 fetch, 이후 갱신
  planLoading: boolean;
  liveTotal: number | null;           // 스텝2 라이브 카운트 (셸이 디바운스 fetch)
  liveTotalLoading: boolean;
  requestPlan: () => void;            // 구성 변경 시 재계획 요청 (셸이 소유)
}
```
- **셸(`wordbook-wizard.tsx`)이 모든 fetch 를 소유**한다. 스텝 컴포넌트는 표시+patch 만.
- 스텝 파일은 `StepProps` 하나만 받는다. 다른 prop 추가 금지(셸-스텝 계약 고정).
- **개정 2**: `step-review.tsx` 만 `ReviewStepProps = StepProps & { creating, created, createError,
  basketMode: boolean, onDeploySchedule, onSendFirstUnit, onGotoManage }` 를 받는다(생성 실행
  자체는 셸 푸터 버튼이 담당 — created 가 차면 스텝5가 성공 화면으로 전환). 정본은 wizard-types.ts.
- 파생값 공식(스텝 3·4·5 공통, 반드시 이 식만):
  `totalPlanned = plan ? plan.totalPlanned : min(size, liveTotal ?? size)`
  `totalDays = ceil(totalPlanned / wordsPerDay)`
  `periodWeeks 입력 시 wordsPerDay = clamp(ceil(totalPlanned / (periodWeeks * daysPerWeek)), 5, 100)`

## 6. 파일 소유권 (팬아웃 격리 단위)

전부 `src/app/(director)/director/workbench/wordbook/wizard/` 아래. **각 에이전트는 자기 파일 1개만
전면 작성한다**(멱등 — 플레이스홀더가 있어도 전면 교체). 다른 파일 수정 금지.

| 파일 | 소유 | 내용 |
|---|---|---|
| `wizard-types.ts` | 감독(견본) | WizardState·StepProps·상수 |
| `wordbook-wizard.tsx` | 감독(견본) | 모달 셸·스텝 레일·푸터·fetch 오케스트레이션 |
| `step-curriculum.tsx` | 감독(견본) | 스텝1 — 프리셋 갤러리 |
| `step-scope.tsx` | 에이전트 A | 스텝2 — 규모·수준·조건 + 라이브 카운트 표시 |
| `step-structure.tsx` | 에이전트 B | 스텝3 — 구성 방식 4종 + 단계 미리보기 |
| `step-schedule.tsx` | 에이전트 C | 스텝4 — 학습 주기 양방향 계산 |
| `step-review.tsx` | 에이전트 D | 스텝5 — 확인·생성·성공 화면(배포 3택 버튼) |
| `series-deploy.tsx` | 에이전트 E | 스케줄 자동 배포 모달(위저드 성공화면 + 보낸단어장 겸용) |
| `deployments-panel.tsx`·`deck-card.tsx` 개조 | 에이전트 F | 시리즈 그룹 교재 카드 |
| payload/decks/wordbook-client/basket-dock 배선 | 감독 | 공유 인프라 전부 |

## 7. 스타일 규약 (wordbook 디렉토리 관용구 — 위반 = major)

- shadcn 금지(이 디렉토리 규약). 모달은 `fixed inset-0 z-50` 수제. 차트 라이브러리 금지(div 바).
- 팔레트: 바탕 `bg-white text-slate-800`, 경계 `border-slate-200`, 주 액션 `bg-blue-600 hover:bg-blue-700`,
  위험 `rose-600`, 경고 `amber-600`, 성공 `emerald-500`. 보라 그라데이션 금지.
- 폰트 크기 관용구: 본문 `text-[12.5px]`, 보조 `text-[11.5px]`, 캡션 `text-[10.5px]`,
  스텝 제목 `text-[15px] font-semibold`, 위저드 헤드라인 `text-[17px] font-bold`.
- 숫자 `tabular-nums`, 한글 `break-keep`. 스크롤 컨테이너 `min-h-0 flex-1 overflow-y-auto`.
- **버튼은 시원하게**: 위저드 주 버튼 `h-11 px-6 text-[14px] font-semibold rounded-xl`,
  선택 카드 최소 높이 88px, 큰 옵션(단어 수·하루 양)은 `h-14` 급 타일. 칩·라디오 대신 **타일 버튼**.
- 선택 상태: `border-blue-600 ring-2 ring-blue-100 bg-blue-50/50`. 비선택 hover: `border-slate-300 bg-slate-50`.
- 아이콘은 lucide-react 기존 의존성만.
- 파일당 500줄 미만(400+ 경고). date-fns 금지 — 날짜는 수제 포맷.
- 접근성: 모달 `role="dialog" aria-modal`, 스텝 버튼 `aria-current`, ESC 닫기(작성 중이면 확인).

## 8. 함정 원장 (이걸 어기면 실검수에서 잡힌 전례가 있다)

1. `allSenses` 3상태 — 위저드 산출 spec/plan 은 **항상 boolean 명시**. undefined 금지.
2. senseIds 덱은 `limit = senseIds.length` (100 고정 시 101번째부터 조용히 잘림 — 실사고).
3. `spec.grades`(단어의 주 출현 학년) ≠ `passage.grades`(시험 친 학년). 혼용 금지.
4. 학생 허브 `listActiveDecks` 필터 누락 시 단계 덱 수십 개가 학생 홈 도배 — 반드시 series 제외.
5. per10k 는 표제어 역정규화 — 다의어 전 뜻이 동점. 위저드 기본 `allSenses:false` 로 원천 차단.
6. `minTrapRate`·`board` 는 **덱 spec 에 없는** 탐색 전용 축 — 위저드에선 plan(=senseIds 확정) 경유라 사용 가능. 조건형 spec 에 넣으려 하지 마라(조용히 무시된다).
7. 서버 검증 없이 클라 숫자를 믿지 마라 — size/wordsPerDay/units 클램프는 서버에서도 반복.
8. `createStudyAssignment` 의 count 는 5..100, 풀 초과 시 서버가 클램프(notice) — 배포 액션에서 그대로 신뢰.
9. 시리즈 배포 시 `dueAt >= availableFrom` 검증이 서버에 있다(mutations.ts:138) — 같은 날이면 자정/23:59 로 자연 충족.
10. 음성테스트(프로브) 주입 후 **반드시 원복**.

## 9. 검증 게이트 (전 단위 공통)

1. `npx tsc --noEmit` 통과 (또는 이 프로젝트 관용 타입체크).
2. Playwright 실화면: 위저드 각 스텝 스크린샷 + 프리셋→생성→보낸 단어장 카드 확인 관통.
3. 생성 QA 데이터는 제목 `[QA]` 접두 + 종료 시 보관(archive) 원복.
4. 배포 QA 는 테스트 학생(이동주(테스트), cms35q8dg00019q37g2nvlj4l)에게만. 종료 시 정리.
5. 스텝 컴포넌트는 `StepProps` 외 import 는 wizard-types·wordbook-curricula·wordbook-ui(기존 칩)·lucide·react 만.

---

## 10. 개정 원장 — 2026-08-10 적대검수(4렌즈) 반영

검수 함대가 근거와 함께 잡아낸 것들. **여기 적힌 것이 현행 정본이고, 앞 절의 서술과
충돌하면 이 절이 이긴다.**

### 감독이 이미 집행한 것 (에이전트는 다시 손대지 마라)
1. `listVocabDecks` take 100 → **600**, 응답에서 `spec.senseIds` 제거 + `senseIdCount` 신설.
   (교재 1권=최대 60덱이라 100이면 ARCHIVED 구간이 통째로 잘려 「되살리기」가 불가능해졌다.)
2. 교재 생성: 60회 순차 INSERT → **`createManyAndReturn` 1회**. 반환 순서를 믿지 않고
   `series.index` 로 정렬해 1단계를 확정한다.
3. 교재 이름 **80자**(서버가 60으로 자르던 것 수정). `schedule.totalDays = units.length` 강제.
4. `planWordbookAction` 서버측 **60단계 클램프**.
5. 예약 배포: **대상 학생 선행 검증 1회**(예전엔 유닛마다 60번 반복 거부) ·
   **청크(10단계) + nextIndex** · **failedUnits/failedReason 반환** ·
   **firstAvailable 은 실제 성공분 기준** · **날짜는 활성 순번 기준** ·
   **dueAt 은 `withDue` 옵션(기본 없음)** · seriesKey 로 좁힌 질의.
6. 페이지에 `maxDuration = 300`.
7. 셸: 플랜 이펙트 **seq 를 조기 반환보다 먼저 증가**(스테일 응답 착륙 차단) ·
   조기 반환 시 **planLoading 해제**(영구 고착 차단) · `planFor` 로 플랜↔입력 짝 보장 ·
   스텝에는 **freshPlan 만** 전달 · canCreate 에 60단계 상한 + 비활성 사유 표시 ·
   스텝2 「다음」은 재계산 중 차단 · 라이브 카운트는 **스텝2 전용**(size 의존 제거) ·
   재오픈 시 in-flight 무효화 · 예약 배포 완료 후 「보낸 단어장」으로 이동.

### 남은 지시 — 소유 파일별 (이 절이 수정 팬아웃의 유일 근거)

**series-deploy.tsx**
- ⚠️ **필수**: `nextIndex` 가 null 이 될 때까지 액션을 반복 호출하고, 진행률("N/M단계 예약 중")을
  보여줄 것. 지금은 첫 10단계만 만들고 끝난다 — 계약 변경분 미반영 상태다.
- 누적 집계로 결과 화면 구성: 총 created, failedUnits(번호 나열), created===0 이면 failedReason 원문.
- **마감 옵션 UI 추가**: 「마감 없음(추천)」 / 「그날까지 마감」 타일 2개 → `withDue`.
  기본은 마감 없음, 설명에 "마감을 붙이면 다음 날부터 지난 단계가 「기한 지남」으로 표시돼요".
- 예약 미리보기·요약의 단계 번호는 **활성 순번**(1..unitCount) — 서버와 같은 기준이다.
- 오늘 시작이면 결과 문구를 "1단계는 지금 바로 열렸어요"로 분기(미래형 단정 금지).

**step-schedule.tsx**
- 「기간으로 정하기」 탭 전환 시 `periodWeeks` 를 현재 계획과 동기화할 것(같은 화면에서
  "6주"와 "학습일 24일(약 5주)"이 동시에 보이던 모순).
- 하루 양이 하한 5로 클램프되면 고른 주 수가 무시된다는 사실을 문구로 알릴 것.
- **문구 정정**: 「지금 정한 주기는 나중에 보낼 때 바꿀 수도 있어요」는 **거짓**이다
  (배포 모달에 주기 컨트롤이 없다) → "주기는 교재에 저장돼요. 바꾸려면 교재를 다시 만들어야 해요."
- 주 5일일 때 "매일"이라 쓰지 말 것 — "평일마다".

**step-review.tsx**
- 성공화면·요약의 「매일 1단계씩」 → `daysPerWeek` 로 분기("평일마다 1단계씩" / "매일 1단계씩").
- 배포 3택 ①의 설명도 같은 규칙.

**step-curriculum.tsx**
- 「내가 직접 설계할게요」 카드 문구에서 **기출 범위 약속을 삭제**할 것 — 스텝2에 기출 범위 UI가 없다.
  ("학년·수준·난이도·품사까지 조건을 직접 고릅니다"로.)

**deployments-panel.tsx / series-book-card.tsx**
- 용어 통일: 이 화면의 산출물은 **교재**(단계로 나뉜 것)와 **단어장**(단일 덱) 두 종류다.
  섹션 제목·버튼·빈 상태 문구에서 둘을 섞지 말 것.
- `VocabDeckRow.spec.senseIds` 는 이제 **없다**(senseIdCount 로 대체) — 쓰고 있다면 고칠 것.

**composer-vocab-spec.tsx (과제 배포 위저드의 덱 선택)**
- `spec.series` 가 있는 단계 덱을 목록에서 **제외**할 것. 교재는 전용 예약 배포로 나간다.
  (60개 「교재 · N단계」가 선택 목록을 도배한다.)

### 알면서 남기는 것 (이번 라운드 범위 밖 — 기록만)
- 학생 과제 목록에 미래 예약 카드가 단계 수만큼 즉시 보인다(잠금 상태). 학생앱 표면
  수정이 필요해 별건으로 둔다. 완화책은 배포 시 단계 수를 적게 가져가는 것.
- `easy-first` 의 difficultyAvg 안정 재정렬 미구현(정수 difficulty + per10k 2차 정렬로 동작).
  §3a 의 해당 문장은 **미구현 상태임을 명시**한다.
- 단계 **내부** 단어 순서는 서빙에서 per10k 로 재정렬된다(content.ts) — 스텝3 표본 순서와 다르다.
- 스텝1·5 는 StepProps 확장형을 받는다(CurriculumStepProps·ReviewStepProps) — §5·§6 의
  "StepProps 하나만" 문구보다 이 원장이 우선한다.

---

## 11. 발송 통합 — 2026-08-10 실사용 피드백 반영 (이 절이 §1 배포 3택·§3b 배포 계약·§10 배포 지시를 대체한다)

사용자 확정 지시: **「예약 배포」 개념 폐기. 기존 우측 슬라이드(학생에게 보내기)로 단일 통합.**
근거: ① "예약"이 낯설다 — 바로 배포되는지 알 수 없다 ② 너무 느리다(50단계 = 액션 50회 왕복,
유닛당 인증·대상전개·풀집계·트랜잭션·revalidate 반복) ③ 「1단계 보내기」와 「예약 배포」의
차이를 알 수 없다.

### 서버 정본 — `sendWordbookSeriesAction` (구 deployWordbookSeriesAction 삭제됨)

```ts
sendWordbookSeriesAction({
  seriesKey, targets: {type:"STUDENT"|"CLASS", id}[],
  startDate?: "YYYY-MM-DD",   // 미지정 = 오늘 → 1단계 즉시 시작
  itemTypes?: string[],       // 빈/미지정 = 자동 섞기
  countPerUnit?: number,      // 미지정 = 단계 단어 수만큼
}) → { created, taskCount, totalUnits, firstOpen: "today"|date, lastOpen: date }
```

- **한 번 호출로 끝**(청크·nextIndex·fromIndex 없음). 검증 1회 + 한 트랜잭션
  (과제 N + 태스크 N×M + 브리지 N×M 을 createMany 3방). 20단계×1명 실측 목표 3초 이내.
- 마감(dueAt)은 **항상 없음**(withDue 폐기 — 밀린 단계는 따라잡는 것).
- 1단계는 startDate 가 오늘이면 availableFrom=now(즉시), 다음 단계부터 학습일마다 자정 KST.
- 상한: (1+2M)×N ≤ 8,000행 초과 시 "반을 나누어 보내 주세요".

### UI 계약

- **버튼은 「학생에게 보내기」 하나다.** 교재 카드에서도, 위저드 성공 화면에서도 같다.
  「예약 배포」·「1단계 보내기」·「예약」이라는 단어를 화면에서 전부 제거한다.
- 흐름: 버튼 → 기존 우측 슬라이드(BasketDock send 스텝)가 **교재 모드**로 열린다.
- 공유 타입 정본: `wordbook-types.ts` 의 `WordbookPresetSeries`
  `{ seriesKey, title, unitCount, totalWords, wordsPerDay, daysPerWeek }`.
- 교재 모드 send 스텝 구성(위→아래): ① 요약 헤더(단어장 'X' · N단계 · M단어 — 기존 덱 프리셋
  헤더 관용구) ② 대상 선택(반 칩·검색·체크 — 기존 그대로) ③ 문제 유형 칩(기존 그대로)
  ④ 단계당 문항 수: 「자동(단계 단어 수)」 기본 + 직접 입력 ⑤ 시작일(기본 오늘, min 오늘)
  ⑥ 요약 문장: "지금 보내면 1단계는 바로 시작되고, 다음 단계는 {평일|매일}마다 하나씩 자동으로
  열려요 · 총 N단계" ⑦ [학생에게 보내기] 버튼(문구 고정).
- 교재 모드에서는 과제 제목 입력·마감일 입력을 **표시하지 않는다**(제목은 단계별 자동
  "교재 · N단계", 마감은 없음 — 이유를 캡션 한 줄로).
- 완료 화면: 기존 「N명에게 보냈습니다」 관용구 + "1단계는 바로 시작 · 총 U단계가 하루
  하나씩 열려요"(firstOpen==="today" 분기. 미래 시작일이면 "M.D(요일)부터 시작").
- 위저드 성공 화면은 **2택**: 「학생에게 보내기」(주) / 「나중에 보내기」.
  ReviewStepProps: onDeploySchedule·onSendFirstUnit → **onSendToStudents 하나로 대체**.
- `wizard/series-deploy.tsx`·`series-deploy-bits.tsx` 는 **삭제됐다** — 참조 금지.

---

## 12. 스텝4 캘린더 재설계 — 2026-08-10 사용자 확정 (§5 의 paceMode·periodWeeks 폐기)

"하루 양으로 / 기간으로" 탭 이분법 폐기. **캘린더가 곧 인터페이스다.**

- WizardState: `paceMode`·`periodWeeks` 삭제, `startDate: "YYYY-MM-DD"`(기본 오늘) 신설.
- 상호작용(전부 순수 계산, 서버 왕복 0 — 하루 양 변경만 셸 디바운스 플랜 재계산 유발):
  · 하루 양 변경(스테퍼/프리셋/직접 입력) → 캘린더 끝나는 날 즉시 이동
  · 캘린더에서 시작일 이후 클릭 → 그날을 끝으로 하루 양 역산(클램프 시 스냅 안내:
    "하루 100단어가 최대예요 — 가장 빨라도 M.D에 끝나요")
  · 시작일 이전/당일 클릭 → 시작일 이동(과거는 오늘로)
- 캘린더 정본: `wizard-calendar.tsx` — 날짜→학습일 Map 은 O(학습일 수≤60) 1회 메모이즈,
  6주 고정 그리드(높이 안정), 셀은 h-14 에 날짜+["N개"|"쉼"] 만(잘림 없음), React.memo.
- `WordbookPresetSeries.startDate?` 신설 — 스텝4에서 고른 시작일이 보내기 화면 초기값으로
  흐른다(과거면 오늘로). 구성 방식은 6종(§ WORDBOOK_ORDER_SCHEMES — pos-grouped·random 추가,
  뒤 셋은 선정=빈출순·배열만 JS, random 은 시드 고정 셔플).

---

## 13. 학습 요일 집합 — 2026-08-10 사용자 확정 (주5/7 이분법 폐기)

학원 관례(월수금·화목토)를 담기 위해 `daysPerWeek: 5|7` 을 **`studyDays: number[]`
(0=일~6=토, 정렬·유일, 1~7개)** 로 전면 교체. 정본 산식·표기는 전부 wordbook-plan-types:
`sanitizeStudyDays / normalizeStudyDays / studyDaysLabel("월·수·금") /
studyDaysCadence("월·수·금마다") / studyDaysShort("주 3일 (월·수·금)")`,
`nthStudyDate·planCalendarDays·formatPlanPeriod` 는 요일 배열 시그니처.

- **저장(JSONB spec.series.schedule)**: `studyDays` 가 정본, `daysPerWeek` 는 길이
  (구형 호환·표시용). 구형 덱(주5/7만 저장)은 `sanitizeVocabDeckSeries` 가 읽기 시점에
  요일 집합으로 승격한다(주5→[1..5], 주7→[0..6]) — 스모크 d8·d9 검증.
- **스텝4 UI**: 요일 7칩(최소 1일 강제) + 퀵 프리셋 4종(평일·매일·월수금·화목토).
  캘린더·역산·발송 리듬이 전부 요일 집합을 따른다.
- **payload.ts 의 요일 검증은 의도적 사본**이다 — plan-types 가 payload 를 임포트하므로
  역방향 값 임포트는 순환. 규칙 변경 시 두 곳을 나란히 고칠 것.
- 종단 실측: 월수금 20단계 발송 → 과제 요일 분포 1,3,5 반복(8.10→9.23, 약 7주), 마감 0건.

### §13 추가 (2026-08-10 실사용 피드백 2차)

- **단계 상한 60 → 120** (`PLAN_UNITS_MAX`·`SERIES_UNITS_MAX` — 반드시 동치 유지).
  근거: 2,000단어·월수금 = 118단계가 정상 사용인데 60에 막혀 "기간을 늘려도 적용이
  안 되는" 무효 상태에 빠졌다. 날짜 산식 가드 800→1200일(주1일 120단계 대비),
  덱 목록 take 1500. 종단 실측: 118덱 생성 5.0초 · 118과제 발송 2.5초 ·
  마지막 단계가 클릭한 날짜(2027-05-10)에 정확히 열림.
- **유효 하한 `effMinWpd = max(5, ceil(총단어/120))`** 을 스텝4의 전 컨트롤
  (캘린더 클릭·스테퍼·프리셋·직접 입력)에 적용 — 상한 밖 날짜를 눌러도
  **가능한 최장 계획으로 스냅**하고 사유를 말한다("최대 120단계(하루 N개) —
  가장 길게는 M.D까지"). 무효 상태(빨간 경고+다음 잠김)는 백스톱으로만 남는다.

### §13 추가 2 (2026-08-10 실사용 피드백 3차)

- 하루 양 입력칸: number 스피너가 폭을 먹어 "100"이 잘렸다 → w-20 + appearance
  제거(증감은 −/+ 버튼 소관).
- **클릭 피드백은 캘린더 카드 안**(`WizardCalendar.notice`, aria-live) — 왼쪽 요약에만
  두면 클릭한 손 옆에서는 아무 일도 없는 것처럼 보인다. 사유 3종: ① 불가능하게 이른
  날짜("그날까지 끝내려면 하루 N개 — 최대는 100개라 가장 빨라도 M.D") ② 상한 밖 늦은
  날짜(최대 120단계 스냅) ③ 쉬는 요일 클릭("X요일은 쉬는 날이에요 — 가까운 학습일
  기준으로 맞췄어요").
