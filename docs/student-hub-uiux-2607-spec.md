# 학생 허브·시험 리포트 UI/UX 대개편 — 확정 스펙 (2026-07-25)

> **이 문서가 단일 진실원이다.** 구현·검수 에이전트는 채팅 맥락이 아니라 이 문서만 읽는다.
> 여기 없는 것은 하지 않는다. 여기 있는 것은 빠짐없이 한다.

---

## 0. 배경 — 사용자 확정 요구 8건

| # | 요구 | 대상 |
|---|---|---|
| R1 | 학생 상세 과제 탭에 **캘린더 뷰** — "과제 달력을 이 학생으로 필터 건 느낌", 컴포넌트 재사용 | `?tab=tasks` |
| R2 | 과제 달력의 **필터 팝오버가 망가짐** — 철저히 수리 | `/director/students/assignments` |
| R3 | 학습지 탭의 **진행 매트릭스를 상단으로** | `?tab=study` |
| R4 | **숙달도 100% 오표시** — 적대적으로 파고들어 해결 | `?tab=study` 외 4표면 |
| R5 | 시험 탭 **응시 기록을 상단으로**, **AI 추세 분석 카드 제거** | `?tab=exams` |
| R6 | 응시 기록 행 클릭 → **아주 넓은 모달**로 시험 상세 전부 (페이지 이동 없이) | `?tab=exams` |
| R7 | exam-report 학생 페이지 — **문항별 결과를 요약 블록 바로 아래로**, 채점 검토와의 분리 해소 | exam-report |
| R8 | 오답 문항에서 **곧바로 변형 문제 생성 → 과제 배포**로 이어지는 자연스러운 흐름 | 전 표면 |

---

## 1. 불변 계약 (위반 = critical)

### 1.1 디자인 규범 (docs/director-console-v3-design.md R1~R10 계승)
- **카드 셸**: 학생 허브 3탭은 `AnalyticsCard`(kit.tsx:148)만. 섹션 카드는 `SectionCard`(page-frame.tsx:41).
- **모달 셸**: `WideModal`(layout/wide-modal.tsx:19)만. shadcn `Dialog` 신규 사용 금지. 우측 Sheet 로 문항 상세 금지(spec §4.2.2 사용자 확정).
- **세그먼트**: `SegmentPills`(kit.tsx:313)만.
- **필터 칩**: `FilterChip`/`FilterChipRow`(kit.tsx:224/267).
- **상태 필**: `StatusPill`(page-frame.tsx:105) + `PillTone` 7색. 로컬 재구현 금지.
- **빈 상태**: `CardEmpty`/`TabEmpty`(kit.tsx:188/193) 2종만.
- **색 의미**: slate=중립/기록없음 · blue=진행/선택 · emerald=양호 · rose=경고/보충필요.
  **앰버·오렌지 금지. Sparkles 아이콘 금지. 토스 hex(#191F28 등) 신규 사용 금지.**
- **점수 톤**: `scoreText`/`scoreBar`(kit.tsx:93/99) — <50 rose, <80 blue, ≥80 emerald.
- **타이포 밀도**: 본문 최소 `text-[13px]`, 보조 `text-[12px]`. 10~11px 은 칩/배지 전용.
- **관용 화음**: 흰 카드 + `border-slate-200` + 헤더 구분선 `border-slate-100` + 포인트 `blue-600`.
  radius: 섹션카드 `rounded-lg`+`shadow-sm`, 콘텐츠카드 `rounded-xl`, 모달 `rounded-2xl`+`shadow-2xl`, 칩 `rounded-full`.
- **반응형**: `lg:grid-cols-2` 가 분석 그리드 골격, lg 미만 1열. 가로 스크롤은 컨테이너 내부에서만.

### 1.2 문구 규범
- 신규 노출 문구는 **반드시** `src/lib/wording/director-glossary.ts` 에 상수로 추가한 뒤 임포트한다. 리터럴 직접 표기 금지.
- 배포 동사는 「과제 보내기」 단일. 「배포하기」·「만들기」 계열 금지.
- 「숙달도」는 **어법 EWMA 전용**. 학습지 축은 「첫 시도 정답률」(§3 참조).
- 「응시 이력」 금지 → 「응시 기록」.

### 1.3 무회귀
- **기존 기능을 없애지 않는다.** 이동·재배치는 허용, 삭제는 이 문서가 명시한 것만(§7 AI 추세 카드).
- 서버 액션/타입은 **필드 추가만**. 기존 필드 제거·이름 변경 금지(단 §3 masteryPct 의미 변경은 명시 승인).
- 타입 검사·빌드가 통과해야 한다. `@ts-nocheck` 신규 추가 금지.

---

## 2. 신규 공유 인프라 (감독이 먼저 만든다 — 단위 에이전트는 **수정 금지, 소비만**)

| 경로 | 내용 |
|---|---|
| `src/lib/worksheet-study/grade.ts` | `computeStudyMastery()` / `computeMasteryPct()` 재정의 (§3) |
| `src/lib/study-assignments/task-calendar.ts` | 학생 과제 → 캘린더 행 어댑터 (§4) |
| `src/lib/question-variant/index.ts` | 변형 문제 시드·프롬프트·딥링크 (§8) |
| `src/lib/wording/director-glossary.ts` | 신규 문구 상수 (각 절에 키 명시) |

---

## 3. R4 — 숙달도 결함 수리 (최우선, critical)

### 3.1 확정된 원인 (실데이터 확증)
학생 `cmpavfoiq0001mm9sga30eupz`, state `cmrxolcg60002kz049uqgfszo`:
```
reading    : done,       (무채점 → 점수 없음)
vocab-quiz : done,       firstCorrect 12 / firstTotal 12
vocab-match: in-progress, firstCorrect 0 / firstTotal 4, answered 4 / total 4
exam       : in-progress, firstCorrect 0 / firstTotal 2, answered 2 / total 5
→ DB masteryPct = 100
```
`grade.ts:209` 의 `if (s.status !== "done") continue` 가 **진행 중 스테이지를 분모에서 통째로 배제**한다.
오답 6문항이 전부 사라지고 만점 스테이지 하나만 남아 100%가 된다.

### 3.2 새 정의 (확정)
```ts
export interface StudyMastery {
  /** 첫 시도 정답률(%) — 전 스테이지(done+in-progress) 첫 시도 채점 문항 기준. 채점 0건이면 null */
  firstTryPct: number | null;
  /** 진도(%) — 채점 스테이지의 푼 문항 / 전체 문항. 산정 불가면 null */
  coveragePct: number | null;
  firstCorrect: number;   // 분자
  firstTotal: number;     // 분모(첫 시도 채점 문항 수)
  answered: number;       // 진도 분자
  totalItems: number;     // 진도 분모
  stagesDone: number;     // 완료 스테이지 수(무채점 포함)
  stagesTotal: number;    // 상태가 있는 스테이지 수
  /** 전 스테이지가 done 이 아니면 true — UI 가 「학습 중」 배지를 건다 */
  provisional: boolean;
}
export function computeStudyMastery(stages): StudyMastery
export function computeMasteryPct(stages): number | null  // = computeStudyMastery(stages).firstTryPct
```

**집계 규칙 (엄수)**
- `firstCorrect`/`firstTotal` 은 **status 무관** 전 스테이지에서 합산. `firstTotal` 이 number 이고 > 0 인 스테이지만.
- 진도: **채점 스테이지만**(`STUDY_STAGE_META[id].graded !== false`) 분모에 넣는다. 스테이지별
  `total ?? firstTotal ?? 0` 를 분모, `answered ?? firstTotal ?? 0` 를 분자로 합산.
  - 무채점 스테이지(지문 통독·어휘 카드)를 카탈로그로 배제하는 이유: 진행 중일 때만 `total` 이 저장되고
    완료되면 사라져, 같은 스테이지가 상태에 따라 분모에 들어갔다 나갔다 한다(실측 확인).
  - 카탈로그에 없는 stage id 는 보수적으로 채점 취급.
- 분자는 분모를 넘지 않게 클램프(`Math.min`).
- `provisional` = 상태가 있는 스테이지 중 `status !== "done"` 이 하나라도 있으면 true.
- 순수함수. `Date.now()`/`Math.random()` 금지(기존 파일 규약).

**검산 (위 실데이터 기준 — 구현 후 반드시 일치해야 함)**
- firstTryPct = 12 / (12+4+2) = **67%** (구 100%)
- coveragePct = (12+4+2) / (12+4+5) = 18/21 = **86%**
- provisional = true

### 3.3 계산 경로 통일 (critical — 교사면/학생면 값이 다른 결함 동시 해소)
- **모든 표시 표면은 `stageStates` 로부터 재계산한다. DB `masteryPct` 스냅샷을 읽지 않는다.**
- `WorksheetStudyState.masteryPct` 컬럼은 캐시로 계속 **쓰기만** 한다(새 정의로). 마이그레이션 불필요.
- 수정 대상:
  - `src/actions/students/study-analytics.ts` — `masteryPct: st.masteryPct` → 파싱한 stages 로 `computeStudyMastery` 재계산. 행에 `mastery: StudyMastery` 추가(기존 `masteryPct` 필드는 `mastery.firstTryPct` 로 유지).
  - `src/actions/study-assignments/study-stats.ts` — 동일.
  - `src/lib/worksheet-study/server.ts` — `buildSummary`(재계산 경로, 이미 정상)와 `applyStudyEvents` 저장부를 새 함수로.
- **`StudentStudyStageCell` 에 `firstTotal?: number` 추가** (현재 없어 UI 가 분모를 못 보여줌).

### 3.4 표시 (4표면)
| 표면 | 변경 |
|---|---|
| `study-analytics-tab.tsx` 매트릭스 | 「숙달도」 컬럼 → **「첫 시도 정답률」** + 신규 **「진도」** 컬럼. provisional 이면 값 옆 「학습 중」 슬레이트 배지 |
| `study-report-tab.tsx` 교사 매트릭스 | 동일 |
| `g/w/[taskId]/hub-client.tsx` 히어로 | 라벨 「숙달도」 → 「첫 시도 정답률」, 아래 보조행에 「진도 N% · 푼 문항 a/b」 |
| `g/w/[taskId]/report/report-client.tsx` 종합 카드 | 동일. 5xl 대형 숫자 옆/아래에 진도 병기 필수 |

- 매트릭스 `MatrixCell` 툴팁: in-progress = `진행 중 · 푼 문항 {answered}/{total} · 첫 시도 정답 {firstCorrect}/{firstTotal}`.
  done 무채점 = `채점 없는 단계 — 정답률 계산에 포함되지 않습니다`.
- 첫 시도 정답률 컬럼 헤더에 `MetricHelpTip` 필수(R10) — 문구는 glossary `METRIC_HELP.FIRST_TRY_RATE` 재사용.

### 3.5 동시 개정 대상 (누락 시 빌드/테스트 실패)
- `tests/unit/worksheet-study-grade.test.mjs:67-72` — in-progress 배제를 고정한 단언을 **새 정의로 개정**.
- `docs/worksheet-study-spec.md:277` 숙달도 정의 문단 개정.
- `src/lib/wording/director-glossary.ts` — `METRIC_LABELS.FIRST_TRY_RATE` 재사용 + 신규 `METRIC_LABELS.COVERAGE = "진도"`, `METRIC_HELP.COVERAGE`, `STUDY_PROVISIONAL_BADGE = "학습 중"`.

### 3.6 범위 밖(이번에 하지 않음 — 보고서에 명시)
- plan 드리프트(학습지 편집으로 삭제된 스테이지가 교사면 매트릭스에 잔존)는 교사면 서버액션에 `compileStudyPlan` 을 넣어야 해 성능 검증이 필요하다. **이번 범위 밖**.

---

## 4. R1 — 학생 상세 과제 탭 캘린더 뷰

### 4.1 채택안 (확정)
**보드(`AssignmentsBoardClient`) 임베드 금지.** 이유:
- `syncUrl`(assignments-board-client.tsx:150-159)이 `?tab=tasks` 를 날린다 (critical).
- `listStudyAssignments({studentId})` 는 DIRECT(고아 ExamSubmission/GrammarDrillAssignment) 배포를 못 잡아 같은 화면 상·하단 건수가 어긋난다 (critical).
- 서버 조회 2콜이 추가로 강제된다.

**채택: 프레젠테이션 컴포넌트 `AssignmentsCalendar` 만 재사용 + 어댑터.**

### 4.2 어댑터 계약 — `src/lib/study-assignments/task-calendar.ts` (신규, 감독 작성)
```ts
/** 캘린더가 실제로 읽는 필드는 id/dueAt/availableFrom/kind/title 5개뿐(assignments-calendar.tsx:96-106, 188, 236, 262-310) */
export function taskToCalendarRow(t: StudentStudyTaskRow): StudyAssignmentListRow
/** 캘린더 버킷 키와 목록 필터가 공유하는 단일 날짜축 */
export function taskDateKey(t: StudentStudyTaskRow): string   // "YYYY-MM-DD"
export function taskMonthKey(t: StudentStudyTaskRow): string  // "YYYY-MM"
```
- 날짜축: `dueAt ?? availableFrom ?? assignedAt`.
  DIRECT 행은 dueAt/availableFrom 이 하드 null 이므로(task-union.ts:298) **assignedAt 폴백이 필수** — 없으면 1970-01-01 로 조용히 유실된다.
- `taskToCalendarRow` 는 `dueAt` 이 있으면 그대로, 없으면 `dueAt:null` + `availableFrom = (availableFrom ?? assignedAt)` 로 채워 캘린더의 「시작일(마감 없음)」 점선 칩 경로를 탄다.
- 나머지 필드(status/taskCount/…)는 캘린더가 읽지 않으므로 안전한 더미로 채우되 **타입은 정확히** 맞춘다.

### 4.3 UI (tasks-tab.tsx)
```
[SegmentPills: 목록 | 달력]            ← kit.tsx SegmentPills, ariaLabel="과제 보기 전환"
[상태 칩(전체/미완료/기한지남/완료) + 우측 액션(취약 과제·새 과제)]
[유형 칩 + 기간 select]                ← 기존 유지, 캡션 「배포일 기준」 추가
─ 목록 뷰 ─  기존 <ul> 그대로
─ 달력 뷰 ─  lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:h-[620px]
             좌: <AssignmentsCalendar month rows selectedDate onSelectDate onMonthChange />
             우: 같은 행 렌더러(내부 스크롤) — 날짜 선택 시 그 날짜만, 미선택 시 전체
```
- 월 상태는 로컬 `useState`, 초기값 = 서울 현재월. `onMonthChange` 는 **setState 한 줄**(서버 왕복 0 — 데이터는 이미 전부 prop 으로 있다).
- 캘린더 rows = **목록과 동일한 `filtered` 배열**을 어댑터로 변환한 것. 두 패널의 모집단이 항상 같아야 한다(정합 계약).
- 날짜 선택 시 우측 목록은 `taskDateKey(row) === selectedDate` 로 좁힌다. 선택 칩(해제 가능)을 목록 헤더에 표시.
- 세그먼트 값은 `useState` 로컬(탭 언마운트 시 초기화 허용).
- 달력 뷰에서도 상태/유형/기간 필터가 그대로 적용된다(AND 결합).

### 4.4 함께 고치는 결함
- **예약 상태 누락**: `statusPill()` 에 `availableFrom` 미래 = violet 「예약」 분기 추가(개요 탭 overview-tab.tsx:212-244 및 상세 모달과 신호 통일).
- **필터 초기화 어포던스**: 빈 상태에만 있던 「필터 초기화」를 **활성 필터가 있으면 항상** 툴바에 노출.
- 기간 select 활성 시 blue 보더로 활성 표시.

---

## 5. R2 — 과제 달력 필터 전면 재설계

### 5.1 확정된 결함
- `PopoverContent w-64`(256px) 안에서 `AssignmentsTargetFilter` 가 **자체 absolute 드롭다운 `w-72`(288px)** 를 띄운다(assignments-target-filter.tsx:154) → 팝오버 밖으로 삐져나가고 가로 스크롤바가 생긴다. **팝오버 안 팝오버 = 금지 패턴.**
- `autoFocus` 인풋이 Radix 포커스 관리와 충돌.
- 학생/반 트리거 2개 → 선택하면 둘 다 사라지고 칩만 남아 **대상 축을 바꾸려면 해제 후 다시** 열어야 한다.
- 활성 필터가 파란 점 하나로만 표시되고 그 점은 `aria-hidden` → 무엇이 걸렸는지 화면·보조기술 모두 알 수 없다.

### 5.2 확정 설계
**(A) `AssignmentsTargetFilter` 를 중첩 팝오버 → 인라인 패널로 재작성**
```tsx
export function AssignmentsTargetFilter({
  value, onChange, locked = false,
}: { value: BoardTargetFilter | null; onChange: (n: BoardTargetFilter | null) => void; locked?: boolean })
```
- `absolute` 드롭다운 **제거**. 패널 본문이 그 자리에서 직접 렌더된다.
- 상단에 `SegmentPills<"STUDENT"|"CLASS">` (학생 | 반) — 선택된 값이 있어도 축을 바로 바꿀 수 있다.
- 그 아래 검색 인풋(`autoFocus` 제거) + `max-h-56 overflow-y-auto` 리스트.
- 선택된 항목은 리스트에서 blue 배경 + 체크로 표시하고, 다시 누르면 해제된다.
- `locked=true` 면 읽기 전용 칩만 렌더(해제 X 없음) — 향후 임베드용 예약 계약.
- 로스터 lazy 로드(`getAssignTargets` 1회)와 딥링크 이름 해석 이펙트는 **동작 그대로 보존**.

**(B) 보드 필터 팝오버 재구성 (`assignments-board-client.tsx`)**
- `PopoverContent` → `align="end" className="w-[320px] p-0"`, 내부는
  헤더(「필터」 + 활성 시 「초기화」) / 「상태」 칩 4 / 구분선 / 「대상」 인라인 패널.
- 대상 선택 시 팝오버를 닫는다(결과를 즉시 보게).
- **활성 필터를 툴바에 항상 보이게** — 종류 칩 줄 오른쪽(아이콘 버튼 왼쪽)에 제거 가능한 칩을 렌더:
  `[상태 기한 지남 ✕]` `[학생 김연주 ✕]` `[검색 "빨간색" ✕]`.
  → 아이콘 뒤에 숨는 필터가 없어진다. 파란 점은 유지하되 트리거에 `aria-label="필터{활성 시 ' · 적용됨'}"`.
- 팝오버 트리거의 `aria-hidden` 점은 그대로 두되 aria-label 로 상태를 전달.

### 5.3 금지
- 팝오버 안에 또 다른 팝오버/absolute 드롭다운을 넣지 마라.
- KPI 스트립(BoardKpiStrip)의 집계 축은 **변경 금지** — 타일은 필터 진입점이므로 서버 스코프 총계를 유지한다.

---

## 6. R3 — 학습지 탭 재구성

### 6.1 확정 순서
```
1) 한 줄 설명 + RefreshStrip                (기존)
2) 학습지별 진행 매트릭스  ← 최상단 전폭 이동
3) 2열 그리드: 실시간 학습 피드 | 영역별 첫 시도 정답률
4) 2열 그리드: 자주 틀린 단어 | 보충 필요 문장·어법 포인트
```

### 6.2 `WorksheetFilterBar` 제거 — 매트릭스가 곧 스코프 선택기
- 칩 바와 매트릭스 첫 컬럼은 완전 중복이다. 매트릭스를 상단에 두면 칩 바는 존재 이유가 없다.
- 매트릭스 헤더 `aside` 에 현재 스코프를 표시한다:
  - 미선택: `전체 학습지 {n}개 · 학습지를 누르면 그 지문만 분석합니다`
  - 선택됨: 제거 가능한 blue 칩 `[이 학습지만 분석 중 · {제목} ✕]`
- 매트릭스 첫 컬럼(학습지)에 `sticky left-0 bg-inherit` 를 걸어 가로 스크롤 중에도 선택 대상이 보이게 한다.
- 행 선택 상태(`aria-selected`, `bg-blue-50/70`)는 유지.

### 6.3 매트릭스 컬럼 (확정)
`학습지 | …스테이지들… | 첫 시도 정답률 | 진도 | 총 학습 | 마지막 활동`
- 첫 시도 정답률: `scoreText` 톤 + provisional 이면 우측에 `학습 중` slate 배지.
- 진도: `{coveragePct}%` + 아래 `{answered}/{totalItems}` 소형 회색.
- 값이 null 이면 `—`(slate-300).

---

## 7. R5 — 시험 탭 재구성

### 7.1 확정 레이아웃
```
1) 시험 구분 칩 + RefreshStrip                  (기존)
2) KPI 3타일                                    (기존, base grid-cols-1 로 수정 — 고아 타일 방지)
3) 응시 기록  ← 전폭 최상단. AnalyticsCard, className 없음(높이 자동, 내부 max-h-[360px] 스크롤)
4) 2열: 점수율 추이(h-[420px]) | 유형별 정답률(h-[420px])
```
- **`TrendAiCard` 완전 제거**: `trend-ai-card.tsx` 파일 삭제 + `exam-tab.tsx` import/렌더 제거.
  API 라우트(`/api/students/[studentId]/exam-trend`)·크레딧 상수·prisma 컬럼은 **건드리지 않는다**(무회귀).
- 응시 기록 테이블이 전폭이 되므로 `min-w-[620px]` 잘림이 해소된다. 「답안 보기」 열이 항상 보여야 한다.

### 7.2 응시 기록 카드 수정
- 회차 축 방향 통일: 테이블은 최신이 위(현행 유지)이되 **회차 배지에 「n회」와 함께 날짜를 같은 셀에** 두어 차트(오름차순)와의 혼동을 줄인다. (열 순서 변경 없음)
- EXTERNAL 행:
  - `examAnalysisId` 있음 → **같은 탭 `router.push`** + `?step=analysis&from=<현재 경로>` (현행 `window.open(_blank)` 폐기).
  - 없음 → 액션 셀에 비활성 버튼 + `title` 사유(glossary `EXAM_ROW_NO_REPORT`).
- INTERNAL 행 → **§7.3 시험 상세 모달** 오픈.

### 7.3 R6 — 시험 상세 와이드 모달 (신규, 이번 개편의 심장)

**`ReviewDrawer`(640px Sheet)를 `SubmissionDetailModal`(WideModal)로 전면 교체한다.**
- 파일: `src/components/exams/exam-detail-client-parts/deployment-tab-parts/submission-detail-modal.tsx` (신규)
- **props 는 기존과 동일**: `{ submissionId: string | null; onClose: () => void; onMutated: () => void }`
  → 3개 호출처(`exam-tab.tsx`, `tasks-tab.tsx`, deployment-tab)가 import 만 바꾸면 된다.
- 기존 `review-drawer.tsx` 는 **삭제**하고 3개 호출처를 모두 새 컴포넌트로 교체한다(같은 기능이 두 벌 남는 것을 금지).
- `review-question-card.tsx`(수동확정 세그먼트)·`teacher-entry.tsx`(대리입력)는 **재사용**한다.

**레이아웃 (확정)**
```
WideModal maxWidth="max-w-[min(1720px,96vw)]" bodyClassName="p-0"
├ 헤더(WideModal 기본): icon=ClipboardList, title="{학생명} · {시험명}", description="{응시 모드} · 제출 {일시}"
├ 본문 grid: lg:grid-cols-[minmax(0,1fr)_380px], h-[min(80vh,900px)]
│  ├ 좌(스크롤):
│  │   ① 요약 스트립 — 점수 대형 / 정오 4분포 도트 / 정답률 링(92px) / 타임라인(응시·제출·채점)
│  │   ② 문항 타일 그리드 — auto-fill minmax(6.5rem,1fr).
│  │      타일 = 번호 · 정오기호 · 유형라벨 · 배점. 정답 emerald / 오답 rose / 부분 blue / 미확정·미상 slate.
│  │      상단에 정오 필터 칩(정답·오답·부분·검토대기) + 「오답만」 토글.
│  │   ③ 선택 문항 상세 패널 — 발문 전문 · 선지(정답 강조·학생 선택 표시) · 지문 원문(접힘) ·
│  │      해설 · 오답 선지별 해설 · 획득 점수 · 수동확정 세그먼트
│  │      → 하단 액션: **「이 문항 변형 만들기」**(§8)
│  └ 우(sticky rail):
│      · 채점 상태 배너(검토 대기 n · 미입력 n · 삭제 문항 n)
│      · 액션: 답안 대리입력 / 재채점 / 리포트 열기
│      · 「틀린 문항 전체로 변형 만들기」 (§8 일괄)
└ 푸터: 좌측 안내문 1줄 + 닫기
```
- 대리입력 모드는 **화면을 통째로 갈아끼우지 않는다** — 좌측 ③ 자리를 `TeacherEntry` 로 교체하고 ①②는 유지(현행 결함 수리).
- 정오 색 축을 학생 허브와 통일: **정답 emerald / 오답 rose**. (드로어의 CORRECT=blue 축 폐기.)
  `EFFECTIVE_STATUS_META`(shared.tsx:129) 를 고치지 말고 **모달 안에서 자체 톤 맵**을 쓴다(다른 소비처 무회귀).
- ESC/백드롭 닫기는 `WideModal` 기본. 중첩 AlertDialog(재채점 확인) 사용 시 캡처 가드 필요(wide-modal.tsx:46 전역 리스너 함정).

### 7.4 서버 페이로드 확장 — `SubmissionReviewQuestion`
모달과 §8 변형 생성이 요구하는 필드를 **추가만** 한다(기존 필드 불변):
```ts
  /** 발문 전문(클램프 없음) */
  questionText?: string;
  /** 선지 원문 [{label, text}] — options JSON 정규화 */
  options?: { label: string; text: string }[];
  /** 원본 지문 — 변형 생성 딥링크의 passageId 원천 */
  passageId?: string | null;
  passage?: { id: string; title: string; content: string } | null;
  /** 해설 */
  explanation?: { content: string; keyPoints: string[]; wrongOptions: { label: string; text: string }[] } | null;
  difficulty?: string | null;
```
- 구현 위치: `src/actions/exams/_submission-review-core.ts` 의 `loadQuestions` 가 이미 `questionText·options·passage.content` 를 SELECT 한다. **`QuestionExplanation` 조인만 추가**(`prisma.questionExplanation.findMany({ where: { questionId: { in } } })`, 모델 `prisma/schema.prisma:1031`).
- 반환은 `src/actions/exams/submission-review.ts:204-249` 의 map 안에서 채운다.
- **성능**: 문항 수는 한 응시 기준 수십 개. 배치 조회 1회 추가로 충분.
- `wrongOptionExplanations` 는 `{"1":"..."}` 또는 `[{label,explanation}]` 두 형태 모두 파싱한다.

---

## 8. R8 — 오답 → 변형 문제 생성 → 과제 배포

### 8.1 흐름 (확정)
```
[오답 문항]  ─(변형 만들기)─▶  /director/workbench/generate?passageIds=..&types=..&difficulty=..&variant=<seedId>&student=..&from=..
                                   │  · 워크스페이스에 그 지문이 자동으로 담긴다
                                   │  · 유형·개수·난이도가 자동 세팅된다
                                   │  · 상단에 「오답 기반 변형」 컨텍스트 스트립(원본 문항·학생 답·정답)
                                   ▼
                              [생성 버튼 클릭 → 생성]
                                   ▼
                        하단 결과 패널에서 문항 선택 → **「과제 보내기」** (student 프리셀렉트)
```

### 8.2 신규 모듈 `src/lib/question-variant/index.ts` (감독 작성)
```ts
export interface VariantSeedQuestion {
  questionId: string;
  orderLabel: string;           // "1번"
  subType: string;              // 카탈로그 키 (GRAMMAR_ERROR 등)
  typeLabel: string;
  difficulty?: string | null;   // BASIC|INTERMEDIATE|KILLER
  passageId: string;
  passageTitle?: string;
  questionText?: string;
  correctText?: string;         // 정답 표기
  studentText?: string | null;  // 학생 답
  keyPoints?: string[];
}
export interface VariantSeed {
  origin: "exam-report" | "submission";
  studentId?: string;
  studentName?: string;
  examTitle?: string;
  createdAt: string;            // ISO — 호출부가 주입(순수성 유지)
  questions: VariantSeedQuestion[];
}

/** sessionStorage 핸드오프 — URL 이 길어지지 않게 리치 시드를 넘긴다 */
export function saveVariantSeed(seed: VariantSeed): string;      // returns seedId
export function readVariantSeed(seedId: string): VariantSeed | null;   // 읽고 지우지 않음
export function clearVariantSeed(seedId: string): void;

/** 딥링크 조립 — 시드가 유실돼도 동작하도록 핵심 파라미터를 URL 에도 싣는다 */
export function buildVariantGenerateHref(input: {
  seedId: string; questions: VariantSeedQuestion[]; studentId?: string; from?: string;
}): string;

/** 생성 요청 customPrompt — 원본을 베끼지 않고 출제 포인트만 계승 */
export function buildVariantPrompt(seed: VariantSeed, subType: string): string;
```
- 저장 키: `smoat:variant-seed:{seedId}`. `seedId` 는 `crypto.randomUUID()`.
- **URL 계약(신규 쿼리 3종 + 기존 1종)**
  | 파라미터 | 형식 | 의미 |
  |---|---|---|
  | `passageIds` | `id[,id]` | 기존 계약 그대로 |
  | `types` | `SUBTYPE:n[,SUBTYPE:n]` | 유형별 문항 수 프리필 |
  | `difficulty` | `BASIC\|INTERMEDIATE\|KILLER` | 난이도 프리필 |
  | `variant` | seedId | sessionStorage 리치 시드 키 |
  | `student` | studentId | 생성 후 과제 보내기 프리셀렉트 |
  | `from` | 내부 절대경로 | 돌아가기 링크 |

- `buildVariantPrompt` 규칙(프롬프트 본문에 반드시 포함):
  1. 같은 지문·같은 유형으로 **새 문항**을 만든다. 원본 발문·선지를 그대로 옮기지 않는다.
  2. 원본이 겨눈 **출제 포인트(문법 항목/논리 관계/어휘 층위)** 는 유지한다.
  3. 학생이 고른 오답이 유도된 **오개념을 다시 시험**하되 정답 위치·표현은 달리한다.
  4. 정답은 하나로 명확해야 하고, 원본 정답과 문자열이 같아지면 안 된다.
  5. 한국어 발문 규범(수능/내신)을 따른다.
  - 원본 정보는 "참고(재사용 금지)" 블록으로 인용한다.

### 8.3 진입점 (모두 구현)
| 위치 | CTA | 비고 |
|---|---|---|
| `question-detail-view.tsx`(exam-report 문항 상세 모달) 우측 레일 하단 | 「이 문항 변형 만들기」 | `review.passageId` 필요 |
| `analysis-step.tsx` 문항별 결과 헤더 | 「틀린 문항 변형 만들기 ({n})」 | 오답+부분 문항 일괄 |
| `submission-detail-modal.tsx` 문항 상세 패널 | 「이 문항 변형 만들기」 | §7.4 payload 필요 |
| `submission-detail-modal.tsx` 우측 레일 | 「틀린 문항 전체로 변형 만들기」 | |

**비활성 규칙(사유 툴팁 필수, glossary `VARIANT_DISABLED_REASONS`)**
- `passageId` 없음 → 「원본 지문이 연결되지 않은 문항입니다」
- `subType` 이 `QUESTION_TYPE_UI` 카탈로그에 없음 → 「생성 지원 유형이 아닙니다」
- 대상 문항 0건 → 「변형할 오답이 없습니다」

### 8.4 generate 페이지 수신부
- `generate-page-client.tsx:141-181` 블록에 `initialTypesRef`/`initialDifficultyRef`/`initialVariantRef`/`initialStudentRef`/`initialFromRef` 추가.
- `:703-742` 딥링크 적용 이펙트에서 `workspaceApi.loadPassages(...)` 직후, 담긴 각 행에 `setOverride(localId, { typeCounts, difficulty, ... })` 를 적용한다.
- 시드가 있으면 **컨텍스트 스트립**을 워크스페이스 상단에 렌더:
  `오답 기반 변형 · {학생명} · {시험명} · {n}문항 · [원본 보기]` + 우측 `[해제]`.
  스트립은 신규 컴포넌트 `workspace/variant-context-strip.tsx`.
- `customPrompt` 는 생성 시점에 `buildVariantPrompt` 결과를 행 override 의 `customPrompt` 로 넣는다(사용자가 수정 가능해야 하므로 GenerationConfigPanel 의 커스텀 프롬프트 입력을 프리필하는 방식).
- **딥링크 지문이 목록에 없을 때 무음 실패 금지** — 토스트로 사유를 알린다.

### 8.5 생성 후 배포 동선 (필수)
- `embedded-question-bank.tsx` 결과 패널에 `AssignQuestionsAction` 을 배선한다(현재 「시험지 만들기」만 있음).
- `assign-questions-action.tsx` 에 `defaultStudentIds?: string[]` prop 추가 → `AssignmentComposer` 로 전달.
- `?student=` 가 있으면 그 학생이 프리셀렉트된다.

---

## 9. R7 — exam-report 학생 페이지

### 9.1 확정 섹션 순서 (`analysis-step.tsx`)
```
① HeroCard (요약 블록)
② 문항별 결과 (AnalysisQuestionGrid)   ← 여기로 이동
③ 취약 하이라이트 카드 1~3
④ 취약점 분해 (AnalysisBreakdown)
⑤ AI 상담 리포트 게이트웨이
```

### 9.2 함께 고치는 결함
- `graded === 0` 분기에서 **`ReportGatewayCard` 도 함께 숨긴다** — 현재 동일 목적지 CTA 2개가 겹쳐 나온다(analysis-step.tsx:266).
- `AnalysisQuestionGrid` 에 `reviewLoading`/`reviewError`/`onRetryReview` prop 추가 → 원본 문항 조회 실패 시 `AnalysisBreakdown` 과 같은 문구로 고지(현재 조용히 필터만 축소).
- 타일에 **난이도 뱃지**(기본/중급/킬러)와 지문 라벨(있으면 truncate)을 추가 — 난이도·지문 필터의 결과를 검증할 수 있어야 한다.
- 필터 상태 소실 방어: `difficultyOptions` 에 없는 선택값은 `AnalysisBreakdown` 과 동일하게 교집합으로 정리한다.
- `question-detail-view.tsx`: `explanation.wrongOptionExplanations` 렌더 추가(서버가 이미 보내는데 화면에 없음) + §8 변형 CTA.

### 9.3 "채점 검토와 리포트가 왜 분리?" 에 대한 확정 답
- **채점 검토(=`SubmissionDetailModal`)** 는 이제 지문·선지·해설·출제 포인트까지 모두 보여준다 → 리포트 페이지의 문항 상세와 정보량이 동등해진다.
- 역할 분담을 명시한다: 모달 = **한 응시의 채점·문항 검토**, 리포트 페이지 = **분석·학부모 리포트 산출**.
- 모달 우측 레일의 「리포트 열기」가 두 표면을 잇는 단일 통로다(기존 로직 유지).

---

## 10. 검증 게이트 (통과 기준)

1. `npx tsc --noEmit` 0 error.
2. `npm run lint` 신규 error 0.
3. `node --test tests/unit` 통과(숙달도 테스트는 새 정의로 개정된 상태에서).
4. `.tmp-qa/capture.mjs` 로 전 표면 캡처 → 콘솔 error 0.
5. 숙달도 검산: 학생 `cmpavfoiq0001mm9sga30eupz` 의 「미디어의 영향력」 행이 **첫 시도 정답률 67% · 진도 86% · 「학습 중」 배지**로 표시된다.
6. 행동 게이트: 과제 탭 달력 토글 → 날짜 클릭 → 우측 목록이 그 날짜로 좁혀진다.
7. 행동 게이트: 응시 기록 행 클릭 → 넓은 모달이 뜨고 문항 타일 클릭 시 지문·해설이 보인다.
8. 행동 게이트: 오답 문항의 「변형 만들기」 클릭 → generate 페이지에 지문이 담기고 유형/개수가 프리필된다.

---

## 11. 소유권 (단위 격리 — 한 에이전트는 자기 파일만 수정)

| 단위 | 파일 | 의존 |
|---|---|---|
| A1 | `src/lib/worksheet-study/server.ts`, `tests/unit/worksheet-study-grade.test.mjs`, `docs/worksheet-study-spec.md` | grade.ts(감독) |
| A2 | `src/actions/students/study-analytics.ts` | grade.ts |
| A3 | `src/actions/study-assignments/study-stats.ts`, `src/components/study-assignments/study-report-tab.tsx` | grade.ts |
| A4 | `src/app/g/w/[taskId]/page.tsx`, `hub-client.tsx`, `report/page.tsx`, `report/report-client.tsx` | grade.ts |
| A5 | `src/actions/exams/_submission-review-core.ts`, `src/actions/exams/submission-review.ts` | — |
| A6 | `src/components/study-assignments/assignments-target-filter.tsx` | — |
| A7 | `src/components/study-assignments/assignments-board-client.tsx` | A6 |
| B1 | `src/components/students/hub/study-analytics-tab.tsx` | A2 |
| B2 | `src/components/students/hub/tasks-tab.tsx` | task-calendar.ts(감독) |
| B3 | `src/components/exams/.../submission-detail-modal.tsx`(신규) + `review-drawer.tsx` 삭제 | A5, question-variant |
| B4 | `src/components/students/hub/exam-tab/exam-tab.tsx`, `sittings-table-card.tsx`, `trend-ai-card.tsx` 삭제 | B3 |
| B5 | `src/components/exam-report/grading/analysis-step.tsx`, `analysis-question-grid.tsx` | — |
| B6 | `src/components/exam-report/grading/question-detail-view.tsx` | question-variant |
| B7 | `src/app/(director)/director/workbench/generate/generate-page-client.tsx` + `workspace/variant-context-strip.tsx`(신규) | question-variant |
| B8 | `src/app/(director)/director/workbench/generate/embedded-question-bank.tsx`, `src/components/workbench/question-bank-client/assign-questions-action.tsx` | — |

**공유 파일은 감독 소관**: `grade.ts`, `types.ts`(worksheet-study), `task-calendar.ts`, `question-variant/index.ts`, `director-glossary.ts`.
단위 에이전트가 이 5개 파일을 수정하면 critical 위반이다. 필요한 것이 없으면 보고만 하라.
