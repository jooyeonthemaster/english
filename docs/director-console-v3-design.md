# 학생 관리 대개편 v3 — 최종 설계안 (경합 종합, 2026-07-21)

> 종합 원칙: **A안(강사 단순성)을 화면·동선·워딩의 기간(基幹)으로, B안의 타입 계약을 코드 계층에, C안의 실행 규율을 마이그레이션 골격으로** 병합한다.
> 심사 3인의 verdict가 명목상 기간은 갈렸으나(A/B/B), 실질 요구는 동일하다 — "A의 말과 동선 + B의 타입 방어선 + C의 무회귀 시퀀스". 강사 사용성(가중 40%)에서 A가 3심 전원 최고점(34/34/34)이므로 화면 계층은 A를 따른다.
> 규범 지위: docs/director-console-spec.md v2.1의 **증보 개정(v3)**. 브리프 §1 확정 제약 전수 준수.

---

## 0. 심사 반영 기록 — 채택·기각 판정표 (보수적 중재)

심사 지적을 전부 리포 소스로 재검증했다. 근거가 확정된 것만 반영하고, 추측성 지적은 기각한다.

### 0.1 반영 (사실 확정)

| # | 지적 | 검증 결과 | 최종안 처리 |
|---|---|---|---|
| 1 | A의 `?view=` 쿼리 nav 활성판정 붕괴 | **확정** — admin-shell.tsx:278-294 routeMatches는 `usePathname` 기반 pathname 전용(`path === href \|\| path.startsWith(href+'/')`). 쿼리 URL은 영구 비활성, `/students`가 전 뷰에서 활성 | D4를 **경로 세그먼트 기반**으로 재설계 — `/students/(manage)/` 라우트 그룹 + 뷰별 실 경로. nav 매처 무개조(기존 형제-prefix 판정이 그대로 동작) |
| 2 | A의 행 hover-reveal CTA — 초보·태블릿 발견성 제로 | 타당(자기 원칙 "새 상호작용 패턴 발명 금지"와 모순) | 행 CTA **상시 노출**(h-6 미니 버튼, 호버 시 강조만) |
| 3 | A의 hub-header StatTile 재조립 + text-2xl 유지 모순 | **확정** — page-frame.tsx:167 StatTile 값은 `text-lg` 하드코딩 | hub-header **존치**(C안 판정 채택 — spec §6 확대 타이포의 산물). 프리미티브 규칙 R1의 적용 범위를 "분석 탭 내부"로 한정 명문화 |
| 4 | A의 "드릴 뱅크 초안 내보내기" 과대 포장 | **타당** — 생성물은 Question(수능형), 드릴은 GrammarItem(6유형) — gen-pipeline 렌즈 확정 "별세계, 브릿지 없음". 변환 설계 부재 | v3 범위 **제외**(v4 후보로 변환 설계 요건 명시). b유닛 안내 문구를 정직하게 교체 |
| 5 | A의 재배선 표 소스 미검증 2행 | **확정** — _shared.ts:117-119 `STUDY_ASSIGNMENT_PATHS`는 이미 `/director/students/assignments`·`/director/students` 양쪽 포함. grammar-drill-admin/assignments.ts의 revalidate는 `/director/grammar-lab/${studentId}`(삭제 예정 사문 상세 전용) | 경로 존치 설계(아래 D4)로 **딥링크·revalidate 재배선 자체가 0건**이 되어 자연 해소 |
| 6 | B의 `mode:'review'` — 존재하지 않는 학습지 모드 | **확정** — src/lib/study-assignments/types.ts:58 유니온은 `off\|light\|standard\|intense`뿐 | WORKSHEET 취약 매핑은 **기존 모드 내 정직 매핑**: 같은 학습지 재배포 + studyMode `standard`, 워딩 「이 학습지 다시 보내기」(A안) |
| 7 | B의 '첫 시도 정답률' 시험 적용 = 거짓 설명 | **확정** — trend.ts:217-221 pushTypeStat은 단순 정오 누적, 시험엔 재시도 개념 없음 | 시험 유형 지표 명칭은 **「유형별 정답률」**. '첫 시도 정답률'은 학습지 전용. B의 「영역별 숙달도」→「영역별 첫 시도 정답률」 개칭은 채택(동음이의 해소) |
| 8 | B의 billing keep-mounted 제거 = 목적 외 회귀 | 타당(3심 일치 — 분석 3탭 범위 밖, 논증 부재) | billing **무접촉**. exams 탭만 마운트 규약 통일(아래 #10) |
| 9 | B의 어법 4세그 폐지 = 회귀 반경 초과 | 타당(정찰이 "건강한 본체" 판정한 5+1파일 전면 재편, 편익 근거 미제시) | **4세그 존치 + pill 정합**(A·C 합치). 평탄화는 사용 데이터 확인 후 재론 |
| 10 | A·C 공통 exams 폴링 누수(keep-mounted + usePollingAction) | **확정** — student-hub-client.tsx:361-411 `visited.has("exams")+hidden` 래퍼. 훅은 document.visibilityState만 검사 — 타 탭 체류 중 폴링 지속 | **exams keep-mounted 제거**(B의 마운트 규약 이식): `tab === "exams"` 조건 마운트로 전환. 3탭 전부 "진입 마운트·이탈 언마운트" |
| 11 | C의 QUESTIONS 프리필터 P2 유예 = 과대평가 | **확정** — composer-question-picker.tsx는 row.subType(:45)과 필터 파이프(:88-94) 보유. additive prop 1개 공사 | **v3 범위 편입**: `initialSubTypes` prop 신설(시험 취약→배포 축 완결) |
| 12 | C의 워딩 트리오(어법 훈련/어법 훈련 현황/어법 훈련소) + 신조어 '유닛 문항 뱅크' | 타당(1~2음절 차이 3라벨 — 52세 변별 실패 위험) | A안 워딩 채택: 탭 「어법 훈련」(불변) / nav·뷰 「**어법 현황**」 / 생성 허브 「**어법 훈련소**」. children은 「유닛 둘러보기」·「생성 기록」 |
| 13 | B의 어법 19유닛 스코프 칩 = 인지 부하 | 타당(2심 지적) | 어법 탭에 스코프 칩 행을 두지 않는다(4세그 존치가 그 역할). 골격 조항 "[B] 스코프 행은 해당 시에만"으로 정합 |

### 0.2 기각 (근거 불충분 또는 이미 올바름)

| 지적 | 기각 근거 |
|---|---|
| "C의 exam-parts 4파일" 표기 | 실측 3파일(score-trend-chart·type-heatmap·trend-report-section) — **A 목록이 정확**. 삭제 대상 총계는 탭 본체 포함 4파일 |
| "engine 가중 이식은 /g 무접촉 위반" 우려 | spec §7.2는 학생면 **시각 결과물** 한정 조항. 편성 순서는 서버 로직이고 브리프 §2.1이 명시 초청 — 3안·3심 전원 (a) 합의 |
| "C의 redeploy 반려는 결함" | C의 반려 논거(재확인 기회 = 초보 안전장치)도 유효 — 절충안 채택: redeployStudyAssignment 신설하되 **마감일 확인 팝오버 내장**(무확인 배포 금지). 빠른 길/편집 길 공존(B) |
| "폴링 15초 완전 통일이 정합" | 시험 집계는 두 테이블 풀스캔 병합(렌즈 실측)이고 채점 이벤트가 드묾 — C의 차등 근거가 실증적. **훅·UI는 단일**(usePollingAction+RefreshStrip), 인터벌만 학습지·어법 15초 / 시험 60초 예외를 성문화 |
| 보강 렌즈 인용 불가 주장 시비 | 3건 output 파일 0바이트 유실 **사실 확인** — C의 자진신고가 정직했다. 브리프 §2.1 기재 내용을 정본으로 삼는다 |

---

## 1. 설계 철학 — 3동사 모델 + 타입 방어선 + 무회귀 규율

강사의 모든 행위: **① 본다(분석) → ② 찾는다(보충 필요) → ③ 보낸다(과제)**.

| 원칙 | 내용 | 집행 장치 |
|---|---|---|
| 한 문장 원칙 (A) | 모든 화면·탭·모달은 "여기서 할 일"이 한 문장 — 설명 스트립 상시 노출 | D6 사전 등재 의무 |
| 같은 버튼, 같은 자리 (A) | 보충 필요가 보이는 모든 행·셀에 동일 모양·동일 워딩 [과제 보내기] — **상시 노출** | WeakSpotRow/WeakPointCta 단일 컴포넌트 |
| 신개념 제로 (A) | 새 용어 없이 기존 숫자를 말로 풀어 쓴다: "숙달도 27점 · 12회 시도 중 8회 오답" | director-glossary.ts + grep 게이트 |
| 접되, 지우지 않는다 (A) | 파워 기능은 삭제 대신 "자세한 설정" 뒤로 접거나 뷰 뒤로 민다 | §7 무회귀 체크리스트 |
| 문법은 타입으로 강제 (B) | 공용 행 렌더러의 도메인 분기(if study… else grammar…) 오염을 타입 계약으로 방어 | WeakSpot·AnalyticsLabelResolver + 카탈로그 직임포트 금지 규약 |
| 시각 변화 0 선행 (C) | 추출·이동·삭제는 M0 정지작업으로 분리, 단계별 독립 그린 | §8 마이그레이션 표 |

---

## D1. 분석 문법 통일 — 학생 분석 3탭 공통 골격

### D1-1. 골격 정본 (spec §4.3 신설 조항으로 편입)

```
┌ [A] 헤더 스트립 ─────────────────────────────────────────────────────────┐
│ 한 문장 설명 · (마지막 갱신 14:32 · ↻)              [세그먼트 — 해당 시]   │
├ [B] 스코프 필터 행 (해당 시) — FilterChip 가로 스크롤, 탭 전체 계산 범위    │
├ [C] KPI 스트립 — StatTile 3~5 (page-frame 정본)                          │
├ [D] 카드 그리드 — 2열(lg 미만 1열), 고정 높이(기본 h-[420px]/h-[360px])    │
│     + 내부 스크롤. 카드 셸은 AnalyticsCard만                              │
│     보충 필요 행: 상시 노출 [과제 보내기] 미니 버튼(WeakSpotRow)            │
│     보충 필요 카드 우상단: [이 범위로 과제 보내기]                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**규칙 10조 (R1~R10):**
- R1. 분석 탭 내부 KPI는 `StatTile/StatStrip`만. 로컬 Kpi/StatCard 재구현 금지. **적용 범위는 분석 탭 내부** — hub-header 퀵스탯은 spec §6 확대 타이포 정본으로 존치.
- R2. 카드 셸은 `AnalyticsCard`만(헤더 `bg-slate-50/60` + 본문 `overflow-y-auto`). 행 높이 기본값 h-[420px](기록/성과)·h-[360px](취약) — 내부 스크롤로 흡수.
- R3. 세그먼트는 pill형 `SegmentPills` 단일 정본. bordered-tab형은 과제 상세 모달 3탭 전용 격리(모달=탭, 탭 내부=세그먼트).
- R4. 히트맵 색은 `heatToneByRate` 5단(80/60/40/20, emerald→rose) — masteryHeatClass(display.ts)와 동일 임계. "낮을수록 붉다"가 3탭 공통 의미.
- R5. 보충 필요 표시는 StatusPill rose + 워딩 「보충 필요」(D6). 앰버/오렌지 금지 유지.
- R6. 폴링은 `usePollingAction` 단일 훅 + `RefreshStrip` 단일 UI. 인터벌: 학습지 15s · 어법 15s · **시험 60s(예외 성문화 — 두 테이블 풀스캔 집계·채점 이벤트 저빈도)**. visibility 중단·수동 갱신·stale-on-error 공통. AI 추세 생성 중 5초 폴링은 생성 진행 한정 예외.
- R7. 마운트 규약: 3탭 전부 **진입 마운트·이탈 언마운트**(exams keep-mounted 제거 — student-hub-client.tsx:361 `visited.has` 래퍼 폐기). billing 등 분석 외 탭 무접촉.
- R8. 탭 배지는 조치 필요 수만(tasks 미완료 수 유지). exams 배지(reports.length) 제거 — 문서 수는 세그 라벨 「리포트 N」이 표기.
- R9. 빈 상태는 `CardEmpty`(카드) / `TabEmpty`(dashed + 아이콘 + CTA) 2종만. TabEmpty에는 항상 배포 CTA.
- R10. 점수 단독 노출 금지 — 보충 필요 수치 옆에 항상 말 설명(`scoreExplain`) + 첫 노출 카드에 `MetricHelpTip`(ⓘ).

### D1-2. 공용 프리미티브 — 파일 실명

| 구분 | 파일 | 내용 |
|---|---|---|
| 신설 | `src/components/students/hub/analytics/kit.tsx` | AnalyticsCard·CardEmpty·TabEmpty·FilterChip·FilterChipRow·SegmentPills·RefreshStrip·RankingRow·MetricBar·DetailRow·VerdictIcon·heatToneByRate·HeatCell·MetricHelpTip — study-analytics-tab 로컬 구현의 **승격(값 변경 없음, 이동만)** |
| 신설 | `src/components/students/hub/analytics/use-polling-action.ts` | usePollingAction(load, deps, {intervalMs}) — 15s 기본+visibility 중단+reloadTick+stale-on-error(study-analytics-tab:819-846 추출) |
| 신설 | `src/components/students/hub/analytics/weak-spot-row.tsx` | WeakSpotRow(라벨+MetricBar+점수+scoreExplain+상시 [과제 보내기]) + WeakPointCta(row/card 2형) |
| 신설 | `src/lib/student-analytics/types.ts` | WeakSpot·WeakDeployTarget·ScoreLike·AnalyticsLabelResolver (D2) |
| 신설 | `src/lib/student-analytics/resolvers.ts` | studyLabels·examLabels·grammarLabels — 도메인 카탈로그(STUDY_STAGE_META·GRAMMAR_TYPE_LABEL·TrendTypeStat 키)를 아는 유일한 층 |
| 개편 | `study-analytics-tab.tsx` | 로컬 프리미티브 제거→kit import(동작 무변경) + CTA 배선(D2) + planStale 소생(호출부 planHash 전달 — spec §4.2.2 계약 복구) + 「영역별 숙달도」 카드 → **「영역별 첫 시도 정답률」 개칭**(B — 동음이의 해소) |
| 개편 | `hub-header.tsx` | **무접촉**(존치 확정 — §0.1-3) |
| 개편 | `student-hub-client.tsx` | study 탭 `flags.grammar` 게이트 해제(:355 어긋난 커플링 절단) · exams keep-mounted 제거(R7) · exams 배지 제거(R8) · 설명 스트립 중앙 렌더 일원화 · onDuplicate 배선(D4) |

**금지 규약(B — kit의 오염 방어선)**: `src/components/students/hub/analytics/*` 파일은 STUDY_STAGE_META·STUDY_SKILL_LABELS·GRAMMAR_TYPE_LABEL·CONCEPT_SKELETON_BY_ID를 직접 임포트하지 않는다. 라벨은 `AnalyticsLabelResolver` props 주입만. useScopeFilter·buildFeedItems는 v3에서 추출하지 않는다(소비처 1곳 — C의 최소침습 판단 채택).

### D1-3. 탭별 구성

**학습지 탭(정본 — 최소 수정)**: spec §4.2 골격 그대로. 변경분: ① kit 소비 전환 ② 취약 단어·문장·어법 포인트 행에 WeakSpotRow(상시 CTA) ③ 카드 우상단 CTA(취약 단어 「이 학습지 다시 보내기」 / 어법 포인트 「이 범위로 과제 보내기」) ④ planStale 소생 ⑤ 「영역별 첫 시도 정답률」 개칭. 영역별 카드는 v3 1차 CTA 없음(축→콘텐츠 자동 매핑 부정직 — 2차).

**시험 탭(전면 재작성 — v3 최대 단일 공사)**:

```
[A] 배포한 시험지 응시와 내신 분석 점수를 한 시계열로 봅니다 · 갱신 ↻   [성적 분석 | 리포트 3]
[B] 시험 구분 | (전체) (배포 시험 n) (내신 분석 n)     ← B안 스코프 칩(두 모집단 정직 노출)
[C] ┌ 총 응시 12회 ┐┌ 평균 점수율 74% ┐┌ 추세 ▲ 오름 ┐  (StatTile 3 — summarize() 재사용)
[D] ┌ 점수율 추이(recharts, 토큰 재바인딩) ┐ ┌ 유형별 정답률 히트맵(heatToneByRate) ┐
    │ 점 클릭 → 응시 행 하이라이트          │ │ 셀 클릭 팝오버: "빈칸추론 정답률 33%   │
    │                                     │ │  (3/9)" + [이 범위로 과제 보내기]      │
    ├ 응시 기록 테이블 ─────────────────────┤ ├ AI 추세 분석(기존 REST·5cr — 셸만 교체)┤
    │ 행 클릭 → ReviewDrawer(기존 정본)     │ │                                      │
    └─────────────────────────────────────┘ └──────────────────────────────────────┘
    (리포트 세그먼트: reports-tab.tsx 기존 유지 — 이미 신 언어)
```

- 신설: `src/components/students/hub/exam-tab/exam-tab.tsx`(셸·usePollingAction 60s)·`score-trend-card.tsx`·`type-heatmap-card.tsx`·`sittings-table-card.tsx`·`trend-ai-card.tsx`
- 재사용(무개조): aggregateStudentExamHistory(trend.ts)·summarize()(exam-history.ts)·ReviewDrawer·`/api/students/[studentId]/exam-trend`
- 삭제(컷오버 후): `src/components/students/student-exam-history-tab.tsx` + `src/components/students/exam-history-parts/` **3파일**(score-trend-chart·type-heatmap·trend-report-section — 실측 확정 목록). hex 90여 건 진원 소멸. recharts는 유지(색만 CSS 변수 재바인딩, 토스 hex 금지).

**어법 탭(4세그 존치 + pill 정합 + 취약 가시성)**:

```
[A] 스모트 어법 커리큘럼의 훈련 기록과 개념별 숙달도를 봅니다 · 갱신 ↻  [분석 | 개념 학습 | 시도 기록 | 질문 로그]
[C] ┌ 푼 문항 214 ┐┌ 정답률 71% ┐┌ 보충 필요 개념 3 ┐┌ 최근 7일 42문항 ┐  (StatTile 4)
[D] (기본 세그=분석)
    ┌ 개념 숙달도 지도(기존 grammar-analysis 재사용) ┐ ┌ 보충 필요 개념 랭킹 ─────────┐
    │ 셀 클릭 팝오버: "관계대명사 숙달도 27점 ·      │ │ 관계대명사 27점 · 12회 중 8회 │
    │  12회 중 8회 오답" [시도 기록 보기]            │ │ 오답   [과제 보내기]  ← 상시  │
    │  [과제 보내기]                                │ │ …(숙달도 낮은 순, 접힘 전체)  │
    ├ 최근 14일 활동(기존) ─────────────────────────┤ ├ 축별 정답률(기존) ────────────┤
```

- 개편 `grammar-tab.tsx`: bordered-tab 4세그 → SegmentPills(R3) · 로컬 Kpi → StatTile(R1) · KPI에 「보충 필요 개념 N」 타일(스크롤 없이 시나리오 시작점 — A의 최고 평가 요소). 4세그 **전부 보존**, 기본 진입 분석.
- 개편 `grammar-analysis.tsx`: 셀 팝오버에 WeakPointCta 추가(기존 드릴다운 보존) + 「보충 필요 개념」 랭킹 카드 신설(weakness.ts selector).
- grammar-lessons/attempts/chat-log **무접촉**(이미 신 언어 — 정찰 판정 존중).

### D1-4. 마이그레이션(D1)
1. kit+훅 추출(동작 무변경, study-analytics-tab import 교체) → tsc·빌드·스냅샷 diff 0.
2. 허브 셸 정리(게이트·배지·마운트 규약·설명 스트립).
3. 어법 탭 세그·KPI·랭킹 카드(데이터 무접촉).
4. 시험 탭 신설 4카드 → 배선 교체 → 구 4파일 삭제 → hex grep 게이트.

---

## D2. 취약점 → 과제 원클릭 플로우

### D2-1. 단일 타입 계약 — WeakSpot (B) + 단일 CTA — WeakPointCta (A)

```ts
// src/lib/student-analytics/types.ts (신설)
export interface WeakSpot {
  domain: "study" | "exam" | "grammar";
  axis: "word" | "sentence" | "grammar-code" | "exam-type" | "concept";
  key: string;                       // wordKey · 문장번호 · a~m · subType · conceptId
  label: string;                     // 해석기 산출 확정 라벨
  metric: { kind: "mastery" | "first-try" | "accuracy"; value: number };
  // accuracy = 시험 유형별 정답률(재시도 개념 없음 — trend.ts 실측 기반 정직 명명)
  evidence: { attempts: number; wrong: number; lastWrongAt?: string };
  deploy: WeakDeployTarget | null;   // null = 배포 경로 없음(사유 툴팁만)
}
export type WeakDeployTarget =
  | { kind: "GRAMMAR"; grammarSpec: Partial<GrammarAssignmentPayload>; weakConcepts: WeakConceptPreset[] }
  | { kind: "QUESTIONS"; questionFilter: { subTypes: string[] } }
  | { kind: "WORKSHEET"; content: PickedContent; studyMode: "standard" };  // 기존 모드 유니온 내 — 'review' 금지
```

`WeakPointCta`(weak-spot-row.tsx): row형 = **상시 노출** h-6 미니 버튼 「과제 보내기」(호버 시 강조만) / card형 = 우상단 「이 범위로 과제 보내기」. 클릭 → 셸의 `openDeployComposer(spots, source)` — student-hub-client가 컴포저를 리프트하므로 3탭에 콜백 prop 1개(`onDeploy`) 배선이 전부.

### D2-2. 취약 유형 → 과제 kind 매핑표 (정본)

| 취약 표면 | kind | 프리셋 | 비고 |
|---|---|---|---|
| 어법 탭 개념 랭킹·히트맵 셀 | GRAMMAR | conceptIds:[해당], count 10 | 기존 WeakConceptPreset 확장(attempts·wrongCount additive) |
| 학습지 어법 포인트(a~m) | GRAMMAR | `GRAMMAR_CODE_CONCEPTS[code]` | 신설 `src/lib/grammar-drill/grammar-code-map.ts` — 13코드→드릴 conceptIds 수제 정적 테이블(두 분류축의 최초 브리지). 매핑 없는 코드는 유닛 추천 강등+컨텍스트에 "정확 매핑 없음" 표기 |
| 학습지 취약 단어·문장 | WORKSHEET | 같은 학습지 content + studyMode standard | 워딩 「이 학습지 다시 보내기」 — 정직한 재학습. 단어→신규 콘텐츠 생성은 v3 밖(툴팁 명시) |
| 시험 유형 히트맵 셀 | QUESTIONS | questionFilter.subTypes 프리필터 | `composer-question-picker.tsx`에 `initialSubTypes` prop(additive — :45 subType·:88-94 필터 파이프 실존 확인). 0건이면 「문제 생성으로 이동」 링크 |
| 학습지 영역별(7축) | — | CTA 없음(1차) | 자동 매핑 부정직 위험 — 2차 |

### D2-3. 컨텍스트 스트립 — 컴포저 헤더 아래 전폭 1행 (A)

패널 소속이 아니라 **배포 행위 전체의 전제**이므로 전폭(40px, 펼침 최대 160px). 2심이 bestElements로 지목.

```
┌ 과제 보내기 ──────────────────────────────────────────────────── ✕ ┐
│ ⓘ 김민준 · 관계대명사 숙달도 27점 · 12회 시도 중 8회 오답 · 최근 오답 7/19 │
│   이미 나간 관련 과제 1건: 「어법 훈련 10문항」 7/18 마감 · 완료  [자세히 ∨] │
├──────────────┬──────────────────────────┬──────────────────────────┤
│ ① 누구에게    │ ② 무엇을 · 언제까지        │ ③ 실물 확인               │
```

- 신설 `src/components/study-assignments/composer-context-strip.tsx` — reasons 문장화 + 관련 과제 칩(클릭→과제 상세 모달). [자세히]: 개념별 점수 테이블 + 최근 오답 3건.
- 신설 서버 액션 `src/actions/study-assignments/assign-context.ts` → `getAssignAnalysisContext(studentId, spots)`: grammarDrillMastery 점수·시도 + 최근 오답 3건 + `listStudentStudyTasks` 재사용으로 같은 kind·겹치는 범위 기존 과제.
- ComposerPreset 확장(additive): `analysisSeed?: { spots: WeakSpot[]; source: "study"|"exam"|"grammar" }`. 시드 없는 기존 진입은 스트립 미렌더(무회귀).

### D2-4. "취약 우선 자동 편성"을 참으로 — engine (a) 채택 (3안·3심 만장일치)

- 개편 `src/lib/grammar-drill/engine.ts`: assignment 분기에서 pool 구성 후 학생 masteryScore(개념별)로 **(개념 숙달도 asc, 난이도 asc) 안정 정렬** → `pickItems(ctx, pool, n, { preserveOrder: true })` — pickItems optional 4번째 인자 추가(미출제 shuffle을 입력 순서 보존으로 대체, wrong/seen 층위 유지). **C의 최소침습 메커니즘 채택** — smart/review/drill 모드 무접촉을 구조로 보증.
- 신설 단위 테스트 `src/lib/grammar-drill/__tests__/engine-assignment.test.ts`: 동일 스펙·동일 mastery 입력에서 취약 개념 문항 선두 검증.
- 근거: 컴포저 카피(composer-grammar-spec.tsx:62-63)가 현재 거짓 — v3의 핵심 서사(분석→배포) 접점에서 카피가 거짓이면 신뢰 전체 붕괴. /g 시각 무접촉 조항 위반 아님(서버 편성 로직, 브리프 §2.1 명시 권장).
- 함께: 취약 선정 4곳 분산 수렴 — 신설 `src/lib/grammar-drill/weakness.ts`: `selectWeakConcepts(grid, {minAttempts:3, cutoff:60, top?})`·`selectStaleConcepts(...)`(WEAK_SCORE=60·MIN_ATTEMPTS=3·STALE_DAYS=21 상수 성문화). collectWeakConcepts/collectStaleConcepts/weakest/insights 호출부를 교체(반환 계약 동일 — 동작 보존).

### D2-5. 원클릭 재배포 — 절충안

신설 `redeployStudyAssignment(assignmentId, { dueAt, onlyIncomplete })` — `src/actions/study-assignments/mutations.ts`에 additive. 상세 모달 「미완료 학생에게 다시 보내기」가 1콜로 실행되되, **마감일 확인 팝오버 내장**(요일 퀵칩 — 무확인 배포 금지, C의 초보 안전장치 논거 수용). 기존 복제→컴포저 편집 길 보존(B의 두 경로 공존).

### D2-6. 클릭 수 검증 (심사 기준 1)

- 어법 보충: 어법 탭(1) → 랭킹 행 [과제 보내기](2) → 마감 칩 [내일](3) → [과제 보내기](4). **4클릭 · 신개념 0.**
- 시험 유형 보충: 시험 탭(1) → 히트맵 셀(2) → [이 범위로 과제 보내기](3) → 프리필터된 문제 확인·선택(4~5) → 마감 칩(6) → 보내기(7). 프리필터가 "고르기"를 "확인하기"로 낮춘다.

---

## D3. 컴포저 UX 재설계 (기존 3패널 증축 — A 기간)

### D3-1. 3스텝 번호제
패널 헤더에 번호+질문형 라벨: ① **누구에게**(ComposerTargetPicker 무개조) / ② **무엇을 · 언제까지** / ③ **실물 확인**. 미충족 패널에 rose 도트. 개편 `assignment-composer.tsx` — 리사이즈·접기·프리셋·requestClose 가드 전부 보존.

### D3-2. ② 구성 폼 재배치 — 마감일 시인성 + 피커 봉쇄 (A + C)

```
┌ ② 무엇을 · 언제까지 ─────────────────────────────┐
│ 과제 종류 (4행 라디오 — 현행)                      │
│ ── 핵심 카드(파란 좌측 보더 — 항상 피커 위) ─────── │
│ 과제 제목 [______________]                        │
│ 마감일 [오늘][내일 화][금요일][일요일][마감 없음]     │
│        [2026-07-25] [23:59▾]                     │
│        ⚠ 마감일을 정하지 않으면 학생 화면에         │
│          기한이 표시되지 않아요                    │
│ ────────────────────────────────────────────────│
│ 콘텐츠 선택(피커) — **max-h 고정 + 내부 스크롤**    │  ← C: 묻힘의 근본 원인(무한 흡입) 직접 제거
│ ▸ 자세한 설정(접힘): 예약 배포·안내문·응시 설정·    │
│   학습 모드·완료 조건 — 접힘 시 요약 칩 상시 표기    │
│   ("예약 없음 · 안내문 없음 · 태블릿 응시")         │
│   프리셋/기존 값이 기본과 다르면 자동 펼침(C)        │
└──────────────────────────────────────────────────┘
```

개편 `composer-config-form.tsx`: 제목·마감 블록을 피커 위로 + 피커 max-h 고정 + AdvancedSettings 접이 섹션. 마감일 요일 칩·서울 TZ·prefs 복원 보존.

### D3-3. 푸터 — 문장형 확인 바 + 미충족 가이드 (A + C)

```
김민준 외 2명에게 · 어법 훈련 10문항 · 7/25(금) 23:59 마감      [취소] [과제 보내기]
미충족 시(첫 번째 사유만): 「② 왼쪽에서 받을 학생을 선택해 주세요」
마감 없음 배포: 「마감일이 없어요 — 마감 없이 보내려면 그대로 누르세요」(버튼 활성)
```

버튼 워딩 확정: 「배포」→「**과제 보내기**」(D6 단일 동사).

### D3-4. 어법 패널 재설계

개편 `composer-grammar-spec.tsx`:
1. **붕괴 수리**: 유닛/개념 칩에 `min-w-0`+`truncate`+`title`, 프리셋 영역 `flex-wrap`(핫픽스 성격 — 선행 배포 가능).
2. **프리셋 칩 → 이유 행 리스트**(A 카드 + B 행 구조 동형): 「취약 개념 프리셋 27점」 칩 폐기 →
   `☑ 관계대명사  [████░░ 27점]  12회 시도 중 8회 오답` 행(개별 체크 토글 = conceptIds 반영, 원클릭 채움 보존). 헤더 「보충이 필요한 개념 (자동 추천)」 + ⓘ 「숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요」. `WeakConceptPreset`에 `attempts?·wrongCount?` additive.
3. **유닛 실물 브라우징**: 유닛 칩 옆 [문항 보기] → 신설 `src/components/grammar-drill/unit-browser-modal.tsx`(D5 훈련소와 공유). 문항 전수 목록(유형·난이도·발문 1줄) + 행 클릭 → GrammarItemModal + 학생 컨텍스트 시 보충 필요 개념 문항 상단 정렬.
4. **모달 승격**: `students/hub/grammar-item-modal.tsx` → 이동 `src/components/grammar-drill/grammar-item-modal.tsx` + 구 경로 re-export shim 1줄(무회귀). 역결합 해소, 훈련소·컴포저·허브 3소비처 공용층.
5. 신설 서버 액션 `listGrammarPoolItems(spec, {studentId?})` — `src/actions/grammar-drill-admin/item-view.ts`에 additive: bundle itemIdsByUnit/Concept 인덱스로 전수 반환(DB 0회), studentId 시 mastery 1회 조회로 보충 필요 정렬. 무필터 전수 렌더 금지(유닛/개념 필터 기본 적용 — 성능 방어).

### D3-5. 파워 유저 보존
리사이즈 패널·프리셋 고정 진입·QUESTIONS 스냅샷 잠금·예약 배포·응시 설정·prefs 복원·defaultDue 프리필·requestClose 가드 전부 보존. 삭제 0 — 변경은 순서·접힘·워딩·추가뿐.

---

## D4. 과제 관리 통합 + 학생 관리 IA — 경로 세그먼트 물리 통합

### D4-1. 결정: "/students 한 장"을 **라우트 그룹 + 경로 뷰**로 구현

A의 물리 통합 방향(사용자 원문 4 정면 충족)을 취하되, 쿼리스트링 대신 **경로 세그먼트**로 — nav 활성판정(pathname 전용, admin-shell.tsx:278-294 실측)과 딥링크를 동시에 살리는 유일한 교차점이다.

```
src/app/(director)/director/students/
  [studentId]/…                     (학생 허브 — 그룹 밖, 스위처 없음. 무접촉)
  (manage)/                          ← 신설 라우트 그룹(URL 미출현)
    layout.tsx                       신설 — 공통 PageShell·헤더·뷰 스위처·컴포저/상세 모달 리프트
    page.tsx                         이동(기존 students/page.tsx) — [학생] 뷰
    loading.tsx                      이동
    assignments/page.tsx             이동(기존 그대로) — [과제 달력] 뷰 · **URL 불변**
    classes/page.tsx                 신설 — [반] 뷰
    grammar/page.tsx                 신설 — [어법 현황] 뷰(grammar-lab 목록 이식)
src/app/(director)/director/grammar-lab/page.tsx → redirect(/director/students/grammar)
grammar-lab/[studentId]/page.tsx    redirect 존치(백링크 호환) · detail-client(417줄)·assignment-panel(307줄) 삭제
```

```
학생 관리 ──────────────────────────────  [+ 학생 등록] [과제 보내기]
[ 학생 ] [ 반 ] [ 과제 달력 ] [ 어법 현황 ]   ← 뷰 스위처(SegmentPills 대형, Link 내비)
(하나의 PageShell·하나의 헤더 아래 4뷰 — "별도 페이지" 감각 소멸)
```

**이 설계가 세 안의 결함을 동시에 해소하는 근거:**
- `/director/students/assignments?open=` **URL 불변** → 인바운드 딥링크 3곳(use-worksheet-assign.ts:27·exam-list-client.tsx:796·deployment-tab.tsx:208)·revalidatePath(_shared.ts:117-119 — 이미 양 경로 포함 실측) **재배선 0건**(B·C의 최대 장점 흡수).
- nav 활성판정 **무개조**: 경로 기반이라 routeMatches가 그대로 동작. `/students`(학생 목록)와 `/students/assignments`(과제 달력)의 중복 활성은 nav-item.tsx의 기존 형제-더긴-prefix 판정(:117-128, "/questions vs /questions/generate" 버그 수정분)이 이미 해결 — 데스크톱·모바일 이중 렌더 모두 같은 routeMatches 소비라 추가 공사 없음.
- 물리적으로 한 장(공유 layout = 단일 셸) → 사용자 원문 4 정면 충족(A의 유일 강점 보존).
- 뷰 전환 = 라우트 내비 → R7 마운트 규약과 자연 일치, 뷰별 북마크 가능.

**nav 개편**(`nav-config.ts` — 학생 관리 children):

```
학생 관리
 ├ 학생 목록      /students
 ├ 반 편성        /students/classes
 ├ 과제 달력      /students/assignments     (구 "과제 관리" 개칭)
 ├ 어법 현황      /students/grammar         (구 "어법 훈련" 개칭·이관)
 ├ 내신 시험 분석  /workbench/exam-report     (물리 이동 금지 기확정 — 유지)
 └ 리포트 관리    /workbench/exam-report/library (유지)
```

Coming Soon 스텁 「과제 관리」(/assignments, nav-config.ts:357)와 COMING_SOON_FEATURE_BY_PATH.assignments(:64) 삭제 — 이중 노출 해소(3안 합치).

### D4-2. 보드 고유 기능 — 전량 존치(URL 불변이므로 "이관"조차 아님)

| 기능 | 결정 |
|---|---|
| 월 캘린더·KPI 4타일·학생/반 필터·검색·정렬·조치필요 핀·`+이 날짜 마감` 프리필·`?student=` 해석 | **전량 존치** — assignments-board-client.tsx는 PageShell 탈피(layout이 감쌈)만 |
| 필터 행 UI | kit의 FilterChip·SegmentPills로 정합 재작성(로직 무변경 — 사용자 원문 4 "필터 이질" 해소) |
| onDuplicate 허브 비대칭 | student-hub-client.tsx 상세 모달에 `onDuplicate={buildDuplicatePreset…}` 배선(기능 회복) |
| 목록 평균 점수 컬럼 | v3 범위 밖(queries.ts 집계 확장 필요 — 후속) |

grammar-drill-admin/assignments.ts의 revalidate(`/director/grammar-lab/${studentId}` — 사문 상세 전용)는 **무접촉**. 사문 삭제 후 이 액션들의 참조가 0이 되면 후속 정리 후보로 기록만(v3 삭제 금지 — 보수 판단).

### D4-3. 반 뷰 = 폴더 UI 이식 (사용자 명시 요구) — 2단 경로

**P0(무DnD — C의 초보 친화 경로, 2심 bestElements)**: roster-selection-bar에 「선택 학생 → 반에 배정」 버튼 → `MoveOrCopyFolderPicker` 재사용(정확히 이 용도의 기성 모달). DnD 없이 편성 완결.
**P1(DnD — A의 폴더 그리드)**: FolderSection 소비처 9호.

| 구분 | 파일 | 내용 |
|---|---|---|
| 신설 | `src/components/students/manage/class-folder-view.tsx` | FolderSection — dragItemType="student"·treatRootAsFolder(rootLabel 「전체 학생」)·enableFolderControls. 평면(중첩 없음) |
| 신설 | `src/components/students/manage/student-drag-card.tsx` | draggable payload `{studentId, studentIds, type:"student"}`(question-bank-card 규약 동형) + 보충 필요 개념 수 배지(weakness.ts 재사용) |
| 신설 | `src/actions/students/class-folders.ts` | FolderActions 5종: listClassFolders·createClassFolder·renameClassFolder·deleteClassFolder(재원생 거부)·addStudentsToClass/removeStudentsFromClass — **Class/ClassEnrollment 기존 모델 재사용, 스키마 무변경**. revalidatePath("/director/students") 1건 추가 |
| 개편 | `workbench/shared/types.ts` | `DragItemType`에 `"student"` 추가(현행 :21 `"question"\|"passage"\|"exam"\|"draft"` 실측) |
| 개편 | `workbench/shared/folder-drag.ts` | 범용 헬퍼 `folderDropItemIds(data, idKey)` 신설(`<type>Id`/`<type>Ids` 관례 — B의 payload 계약 성문화). 기존 questionIds/draftIds 특례 분기 무접촉 존치 |
| 개편 | `workbench/shared/folder-card.tsx` | @ts-nocheck 해제 + 타입 수리(별도 커밋 — C) |

- 복수 반(ClassEnrollment 다대다)이므로 드롭 기본 동작 = **담기(추가)** + 단일 확정 토스트("고2 심화에 3명을 편성했습니다 · 실행 취소"). 폴더 간 드래그는 기존 DragDropModePopover(itemLabel="학생") 2선택.
- **범용 계약 성문화(B)**: 새 도메인 추가 = 유니온 1줄 + FolderActions 5종 액션 파일 1개 + draggable 1곳. spec v3 증보에 표로 수록 — 국어 확장의 정본.

---

## D5. 어법 훈련소 (신설 — 출제 파이프라인 그룹)

### D5-1. 라우트·nav·워딩
- 라우트: `src/app/(director)/director/workbench/grammar-studio/` — 제작 축(spec §2)이므로 워크벤치 밑(3안 중 2안 합치 명명).
- nav: 출제 파이프라인 그룹, "학습지 생성" 직후 5번째 NavItem(nav-ia 렌즈 확정 최적 자리). 라벨 「**어법 훈련소**」, children 「유닛 둘러보기」·「생성 기록」(신조어 '유닛 문항 뱅크' 기각). 아이콘: workflow-icons.tsx에 `GrammarStudioIcon` 5번째 추가(forwardRef+WORKFLOW_ICON_NAMES 패턴).
- 워딩 3분법(확정): 만드는 곳 = 「어법 훈련소」 / 보는 곳 = 「어법 현황」(/students/grammar) / 학생 허브 탭 = 「어법 훈련」(key 불변).
- 플래그: `ENABLE_GRAMMAR_STUDIO`(feature-flags.ts publicBooleanFlag, 기본 false 다크런칭).

### D5-2. 화면 구성 (A 와이어 채택)

```
어법 훈련소 — 유닛을 고르면 실제 문항을 보고, 부족한 유닛은 AI로 만들어 채웁니다
[StatStrip] 전체 문항 1,682 · 유닛 19 · 문항 없는 유닛 7(기초) · 이번 달 생성 24
폴더 그리드(FolderSection 10호 — 읽기 전용: CRUD·드래그 봉인, 커리큘럼 불변 계약)
  루트=전체 → 파트 4(기초 골격·판별 1~3부) → 유닛 19(배지=문항 수 · 0이면 rose ⚠)
유닛 진입: 개념 칩 + 유형 칩 + 난이도 칩 → 문항 전수 목록(내부 스크롤)
  행 클릭 → GrammarItemModal(정답·해설·힌트 계단 — 기존 강사 뷰)
  우상단 [이 유닛으로 AI 생성]
```

| 구분 | 파일 |
|---|---|
| 신설 | `grammar-studio/page.tsx`(getGrammarBundle 통계 프리로드) · `grammar-studio-client.tsx`(셸) · `unit-detail.tsx`(칩+전수 테이블) · `generate-panel.tsx` |
| 재사용 | curriculum.ts(GRAMMAR_UNITS/CONCEPT_SKELETONS) · bundle.ts 인덱스 · grammar-item-modal(D3 승격본) · listGrammarPoolItems(D3 공유) · FolderSection(콜백 미주입 표시 전용) |

### D5-3. AI 생성 — 합성지문 방식 (3안·3심 만장일치 확정)

- 흐름: 유닛/개념/난이도/문항수 선택 → 신설 `POST /api/workbench/ai-jobs/grammar-studio`(기존 question-generation 라우트의 박피 래퍼) → 신설 `src/app/api/ai/generate-questions-auto/_lib/grammar-concept-seed.ts`의 `buildConceptSeedPassage(conceptIds, difficulty)`: 개념 스켈레톤+저작규범(grammar-drill-authoring.md §4·§6 금지변형 8종 프롬프트 계약 증류)으로 80~120단어 단락 1콜 → `prisma.passage.create({source:"GRAMMAR_STUDIO", …})`(기존 컬럼만 — 스키마 무변경) → 기존 `runQuestionGenerationWithEmptyRetry`(subType GRAMMAR_ERROR, PREMIUM 사다리) + `runGrammarSolverGate` 필수 → `saveGeneratedQuestionsForJob` 무개조 → 신설 액션 `ensureGrammarStudioCollection(unitId)`(`src/actions/workbench/grammar-studio-collections.ts`): QuestionCollection 「어법 훈련소」 루트 + 유닛 하위 폴더 자동 귀속.
- 시드 게이트 1종 신설: 단락에 대상 개념 구문 실제 포함 검사(grammar-concept-seed.ts 내).
- 크레딧: CREDIT_COSTS.AUTO_GEN_BATCH×count(PREMIUM 배수) 그대로 + 사전 고지 「10문항 생성 = N크레딧」. 상한 요청당 10문항·유닛당 동시 1잡(기존 큐). 실패 전액 환불(기존 잡 인프라).
- **저장처: Question/QuestionCollection 단일**(시험지 출제·폴더 UI 즉시 호환). **드릴 뱅크 반입·초안 내보내기는 v3 제외** — Question(수능형)↔GrammarItem(드릴 6유형)은 스키마·분류축·저장소가 다른 별세계(gen-pipeline 렌즈 확정)로 변환 설계가 없는 내보내기는 과대 포장(심사 확정). v4 요건 명시: 유형 변환 설계 + verify-grammar-drill-bundle 게이트 + ID 네임스페이스 + 사람 검수.
- b유닛 안내(정직): 「이 유닛에는 아직 드릴 문항이 없습니다. AI로 만든 문항은 문제은행에 저장됩니다」 + [이 유닛으로 AI 생성].
- v3 1차 범위: **브라우징+실물 미리보기(P0, 플래그 off 머지 가능) + 합성지문 생성·Question 저장·자동 폴더(P1 — b01 10문항 실측·솔버 게이트 통과율 확인 후 플래그 on)**.

---

## D6. 워딩·설명 사전 v3 (디렉터면 노출 어휘 — 이 표 밖 신규 노출 금지)

### D6-1. 핵심 용어

| 용어 | 정의 | 표기 규칙 |
|---|---|---|
| **숙달도** | grammarDrillMastery.masteryScore(EWMA) | 항상 「숙달도 N점」+근거 병기 「N회 시도 중 M회 오답」. 첫 노출 ⓘ: 「숙달도는 최근 풀이에 가중치를 둔 점수예요. 60점 미만이면 보충을 권장해요」 |
| **보충 필요** | 숙달도 60 미만(시도 3회+) 또는 오답률 상위 | "취약"의 강사 노출 대체어. StatusPill rose. 코드 식별자 weak 유지 |
| **첫 시도 정답률** | 학습지 전용(힌트·재시도 없는 첫 풀이) | 학습지 「영역별 첫 시도 정답률」 카드(개칭). **시험·어법에 사용 금지** |
| **정답률** | 단순 정오 비율 | 시험 「유형별 정답률」(재시도 개념 없음 — trend.ts 실측 정직 명명) · 어법 훈련 정답률 |
| **과제 보내기** | 배포 행위 단일 동사 | 모든 CTA·컴포저 제목·확정 버튼(「배포」·「만들기」 계열 금지) |
| **이 범위로 과제 보내기** | 취약 컨텍스트 배포 | WeakPointCta card형 고정 |
| **다시 보내기** | 동일 콘텐츠 재배포 | 「이 학습지 다시 보내기」·「미완료 학생에게 다시 보내기」 |
| **어법 훈련소 / 어법 현황 / 어법 훈련** | 생성 허브 / 관제 뷰 / 허브 탭 | D5-1 3분법 |
| **과제 달력** | 구 "과제 관리" 뷰 | nav·뷰 스위처 |
| **복습 대상** | 숙달 후 STALE_DAYS(21일) 초과 | 어법 랭킹 보조 |

### D6-2. 화면별 한 문장 (발췌 — 전량 director-glossary.ts 상수화)

| 표면 | 한 문장 |
|---|---|
| 학생 관리 홈 | 학생을 찾고, 반을 꾸리고, 과제를 한 곳에서 관리합니다 |
| [반] 뷰 | 학생을 골라 반에 배정하거나, 카드를 반 폴더로 끌어다 놓으세요 |
| [과제 달력] 뷰 | 나간 과제의 진행과 마감을 한눈에 봅니다 |
| [어법 현황] 뷰 | 우리 학원 학생들의 어법 훈련 상태를 봅니다 |
| 학습지 탭 | 배포한 학습지에서 이 학생이 어디를 어려워하는지 봅니다 — 부족한 곳에서 바로 과제를 보내세요 |
| 시험 탭 | 시험 점수 흐름과 약한 유형을 봅니다 — 약한 유형에서 바로 과제를 보내세요 |
| 어법 훈련 탭 | 어법 개념별 숙달도를 봅니다 — 보충이 필요한 개념에서 바로 과제를 보내세요 |
| 어법 훈련소 | 유닛을 고르면 실제 문항을 보고, 부족한 유닛은 AI로 만들어 채웁니다 |
| 컴포저 | 누구에게, 무엇을, 언제까지 — 세 가지만 정하면 됩니다 |

### D6-3. 빈 상태 (발췌)

| 위치 | 문구 + CTA |
|---|---|
| 시험 탭 | 「아직 응시 기록이 없습니다. 시험지를 보내면 점수 흐름이 여기에 쌓입니다」 [시험 과제 보내기] |
| 어법 탭 | 「아직 훈련 기록이 없습니다. 어법 과제를 보내면 개념별 숙달도가 여기에 쌓입니다」 [어법 과제 보내기] |
| 반 뷰 | 「아직 반이 없습니다. 새 반을 만들고 학생을 배정해 보세요」 [+ 새 반] |
| 유형 프리필터 0건 | 「이 유형의 문제가 문제은행에 없습니다」 [문제 생성으로 이동] |
| 컨텍스트 스트립 관련 과제 0 | 「이 개념으로 나간 과제는 아직 없습니다 — 첫 보충 과제예요」 |
| 보충 필요 카드 데이터 부족 | 「기록이 3회 이상 쌓이면 보충이 필요한 항목이 여기에 나타납니다」 |

### D6-4. 집행 장치
- 신설 `src/lib/wording/director-glossary.ts` — TAB_DESCRIPTIONS 흡수·확장 + METRIC_HELP·EMPTY_STATES·CTA_LABELS + `scoreExplain(s)` 헬퍼(「숙달도 27점 · 12회 시도 중 8회 오답」 포맷 단일 소스). 신규/개편 표면은 리터럴 금지.
- grep 게이트(spec §8 증보): 디렉터 표면에 「취약 개념 프리셋」·「배포하기」·「응시 이력」·시험 탭 「첫 시도 정답률」·토스 hex 잔존 시 critical.

---

## 7. 무회귀·제약 준수 총괄

| 계약 | 준수 방식 |
|---|---|
| 스키마 additive-only | **신규 테이블 0·컬럼 0** — 반=Class/ClassEnrollment 재사용, 훈련소=Passage/Question/QuestionCollection 행 추가만 |
| /g 표면 무접촉 | 학생면 파일 0건. engine 가중은 서버 편성 로직(브리프 §2.1 명시 권장) — 문항 ID·커리큘럼·이벤트 파이프 불변 + 단위 테스트 |
| 딥링크 | `?open=` 3곳 **재배선 0건**(URL 불변) · tab key 불변 · `?tab=reports` 별칭 유지 · /grammar-lab → redirect 1건(쿼리 승계) |
| revalidatePath | _shared.ts 무변경(이미 양 경로) · class-folders 1건 추가 · grammar-drill-admin 무접촉 |
| 과제 상세 모달 | 3탭 고정·기존 기능 전부 보존 + onDuplicate 배선·redeploy는 **추가** 방향 |
| 디자인 언어 | 신규 전 표면 page-frame+WideModal+kit. 토스 hex 신규 0(진원 4파일 삭제). shadcn ui/* 신규 0 |
| 금지변형 8종 | grammar-concept-seed 프롬프트 계약 + 솔버 게이트 + 시드 게이트 |
| keep-mounted | exams만 제거(분석 3탭 마운트 규약 통일). **billing 무접촉** |
| 워크스페이스 | korean nav 무접촉(어법 훈련소는 영어 전용 — 국어 관제는 별건) |

---

## 8. 마이그레이션 시퀀스 — 단계별 독립 그린 (C 정본)

각 단계 자체 배포 가능(그린 = tsc 0에러·eslint 클린·build·해당 Playwright 캡처·grep 게이트).

| 단계 | 내용 | 회귀 반경 | 그린 증명 |
|---|---|---|---|
| **M0 정지작업** | 사문 2파일 삭제(redirect 존치) · GrammarItemModal 이동+shim · kit/훅 추출+study-analytics-tab 소비 교체 · weakness.ts/grammar-code-map.ts/글로서리/타입 신설(소비자 0) | **시각·동작 변화 0** | tsc·build + 학생 상세 스냅샷 diff 0 |
| **M1 허브 셸·어법 탭** (M0→) | 셸 4건(게이트·배지·exams 마운트·스트립) + 어법 pill·StatTile·랭킹 카드 + planStale | 허브 grammar/study/exams 탭 한정, tab key 불변 | Playwright 1920/1440 3탭 |
| **M2 시험 탭 재작성** (M0→, M1과 병렬) | exam-tab 4카드 신설 → 배선 원자 교체 → 구 4파일 삭제 | exams 탭 한정 — ReviewDrawer·REST 무변경 | 차트·히트맵·드로어 캡처 + hex grep 0 |
| **M3 컴포저+배선** (M0→, M1·M2와 병렬) | 폼 재배치+피커 max-h → 번호 헤더·푸터 → 어법 패널·브라우저 → 컨텍스트 스트립·assign-context → 3탭 CTA(시험 CTA는 M2 후 활성) → engine (a)+테스트 → 피커 initialSubTypes → redeploy | 컴포저 진입점 6곳(전부 optional 확장) + /g 편성 순서 | 4 kind 배포 E2E·엔진 단위 테스트·기존 진입점 스모크 |
| **M4 IA 통합** (독립) | (manage) 라우트 그룹+layout 셸+3클라 임베더블화 → grammar 뷰+redirect → nav 재편+스텁 삭제 | URL 전부 불변(신설 2경로+redirect 1) — 딥링크 3곳 무접촉 | `?open=`·`?student=` 수동 검증 + nav 활성판정 4뷰 확인 |
| **M5 반 편성** (M4→) | class-folders 5종 → P0 선택바 배정(MoveOrCopyFolderPicker) → P1 DnD(DragItemType+folder-card @ts-nocheck 해제) | 유니온 확장 컴파일 전파(기존 4도메인 무변경)·신 뷰는 신 경로 | tsc + 폴더 8소비처 스모크 + 편성 E2E |
| **M6-a 훈련소 P0** (M3 브라우저 재사용, 플래그 off) | grammar-studio 라우트+폴더 그리드+브라우징+nav | ENABLE_GRAMMAR_STUDIO=false 노출 0 | 플래그 on 캡처 |
| **M6-b 훈련소 P1** (M6-a→) | 시드+합성지문+잡 라우트+자동 폴더+생성 패널 | 신규 잡 도메인 — 기존 생성 3경로 무접촉 | b01 10문항 실측·솔버 통과율 리포트·크레딧 차감/환불 테스트 |
| **M7 문서 증보** (M1 직후 착수, 수시) | spec v3 증보(§4.3 규칙 10조·§9 워딩 사전·훈련소·IA)·WS-spec §10/§11.6 모순 개정 | — | 스펙-코드 대조 + grep 게이트 |

---

## 9. WBS — 병렬 팬아웃 단위 (단위당 소유 파일 배타)

> **[토대] 그룹 = 공유 파일 접촉 단위** — 반드시 선행·단독 실행. 이후 트랙 A~E 병렬.
> 충돌 다발점 단일 소유: `nav-config.ts`→C-4 · `student-hub-client.tsx`→A-4 · `study-analytics-tab.tsx`→(토대 후) A-3 · `workbench/shared/*`→C-3.

### [토대] (상호 병렬 가능, 전부 동작 보존)

| # | 단위 | 소유 파일(신설\*·개편·삭제†) |
|---|---|---|
| F-1 | 분석 킷 추출 | \*hub/analytics/kit.tsx · \*hub/analytics/use-polling-action.ts · \*hub/analytics/weak-spot-row.tsx · 개편 study-analytics-tab.tsx(import 교체만) |
| F-2 | 타입·해석기·선정기·매핑 | \*lib/student-analytics/types.ts · \*lib/student-analytics/resolvers.ts · \*lib/grammar-drill/weakness.ts · \*lib/grammar-drill/grammar-code-map.ts · 개편 lib/study-assignments/types.ts(analysisSeed·questionFilter·WeakConceptPreset 확장 — 전부 additive) |
| F-3 | 모달 승격·사문 삭제 | \*components/grammar-drill/grammar-item-modal.tsx(이동) · 개편 students/hub/grammar-item-modal.tsx(re-export shim) · †grammar-lab/[studentId]/{grammar-lab-detail-client,assignment-panel}.tsx |
| F-4 | 워딩 글로서리 | \*lib/wording/director-glossary.ts |

### 트랙 A — 허브 3탭 (F-1·F-2 후)

| # | 단위 | 소유 파일 | 선행 |
|---|---|---|---|
| A-1 | 시험 탭 재작성 | \*hub/exam-tab/{exam-tab,score-trend-card,type-heatmap-card,sittings-table-card,trend-ai-card}.tsx · †student-exam-history-tab.tsx · †exam-history-parts/ 3파일 | F-1·F-2 |
| A-2 | 어법 탭 정합+CTA | 개편 grammar-tab.tsx · grammar-analysis.tsx | F-1·F-2·F-3 |
| A-3 | 학습지 탭 CTA+planStale+개칭 | 개편 study-analytics-tab.tsx | F-1·F-2 (F-1과 순차 — 같은 파일) |
| A-4 | 허브 셸 정리 | 개편 student-hub-client.tsx(게이트·배지·exams 마운트·스트립·onDuplicate·openDeployComposer) · students/[studentId]/page.tsx | F-1, A-1~3의 prop 계약 확정 후 |

### 트랙 B — 컴포저·엔진 (F-2·F-3 후, 트랙 A와 병렬)

| # | 단위 | 소유 파일 | 선행 |
|---|---|---|---|
| B-1 | 구성 폼 재배치+피커 봉쇄 | 개편 composer-config-form.tsx | — |
| B-2 | 컴포저 셸·스트립·액션 | 개편 assignment-composer.tsx · \*composer-context-strip.tsx · \*actions/study-assignments/assign-context.ts | B-1 |
| B-3 | 어법 패널+유닛 브라우저 | 개편 composer-grammar-spec.tsx · \*components/grammar-drill/unit-browser-modal.tsx · 개편 actions/grammar-drill-admin/item-view.ts(listGrammarPoolItems) | F-3 |
| B-4 | engine 가중+테스트 | 개편 lib/grammar-drill/engine.ts · \*lib/grammar-drill/__tests__/engine-assignment.test.ts | — |
| B-5 | QUESTIONS 프리필터 | 개편 composer-question-picker.tsx(initialSubTypes) | F-2 |
| B-6 | 원클릭 재배포 | 개편 actions/study-assignments/mutations.ts(redeployStudyAssignment) · assignment-detail 푸터 배선 | — |

### 트랙 C — IA·반 (독립 시작 가능)

| # | 단위 | 소유 파일 | 선행 |
|---|---|---|---|
| C-1 | 임베더블화 | 개편 students-roster-client.tsx · assignments-board-client.tsx · grammar-lab-list-client.tsx(+동반 UI 4파일 이동 준비) — PageShell 탈피 prop | — |
| C-2 | (manage) 라우트 그룹+셸 | \*students/(manage)/layout.tsx · \*students/manage/students-manage-shell.tsx · 이동 students/{page,loading}.tsx·assignments/ → (manage)/ · \*(manage)/grammar/page.tsx(grammar-lab UI 5파일 이식) · 개편 grammar-lab/page.tsx(→redirect) | C-1 |
| C-3 | 반 편성(P0→P1) | \*actions/students/class-folders.ts · \*students/manage/{class-folder-view,student-drag-card}.tsx · \*(manage)/classes/page.tsx · 개편 workbench/shared/{types,folder-drag,folder-card}.ts(x) · roster-selection-bar(배정 버튼) | C-2 |
| C-4 | nav 재편·스텁 삭제 | 개편 nav-config.ts(children 재편+Coming Soon 스텁+훈련소 항목 — **단일 소유**, D-1의 nav 수정 위임 수취) | C-2, D-1 라우트 존재 |

### 트랙 D — 훈련소 (F-3, B-3 후)

| # | 단위 | 소유 파일 | 선행 |
|---|---|---|---|
| D-1 | 브라우징(플래그 off) | \*workbench/grammar-studio/{page,grammar-studio-client,unit-detail}.tsx · 개편 workflow-icons.tsx · feature-flags.ts | F-3·B-3(listGrammarPoolItems 공유) |
| D-2 | 생성 | \*grammar-studio/generate-panel.tsx · \*api/workbench/ai-jobs/grammar-studio/route.ts · \*api/ai/generate-questions-auto/_lib/grammar-concept-seed.ts · \*actions/workbench/grammar-studio-collections.ts | D-1 |

### 트랙 E — 마감 (각 트랙 완료분부터)

| # | 단위 | 소유 파일 | 선행 |
|---|---|---|---|
| E-1 | 워딩 치환+grep 게이트 | 각 표면 문구 치환(소유 단위 경유) · scripts grep 게이트 | F-4·각 트랙 |
| E-2 | 스펙 v3 증보 | docs/director-console-spec.md · docs/worksheet-study-spec.md | 전 트랙 |

**병렬도**: [토대] 4단위 동시 → A(4)·B(6)·C(4)·D(2) 4트랙 병렬(트랙 내 순차 최소) → E 마감. 검증 게이트: tsc 0에러 · build 그린 · Playwright(관리 4뷰·허브 3탭·컴포저 4시드 진입·훈련소·구/신 딥링크) · hex/워딩 grep · engine 단위 테스트.

---

## 10. 구현 착지 기록 (2026-07-21 — 감독 증보, N-12)

전 WBS(토대 4 · A4 · B6 · C4 · D2) 구현 완료 + 적대 검수 5렌즈(발견 47) → 수리
지시서(critical 1 · major 12 · minor 24) 전량 수리. 설계와 달라진 착지 확정분:

1. **리다이렉트 정본 = next.config.ts redirects()** (§D4-1 개정). 페이지 레벨
   `redirect()` 풀 로드는 Next 16 클라이언트 Router React #310("Rendered more
   hooks") 크래시를 밟는다(/director 선례 — 검수에서 실증·근본 수리). config 등재
   5건: `/director` · `/director/korean`(기존) + v3 신규 `/director/tutor` ·
   `/director/grammar-lab` · `/director/grammar-lab/:studentId` ·
   `/director/assignments`(M-12) · 훈련소 플래그 게이트(env 조건부, 대소문자
   무시 — N-1). 페이지 내 redirect()는 폴백으로만 잔존(파일 주석 명기).
   **신규 레거시 경로 흡수는 반드시 config로** — 페이지 redirect 신설 금지.
2. **취약(보충 필요) 컷오프 60 전면 확정**(M-1·M-7) — collectWeakConcepts·
   개요 칩·컴포저 자동 추천·어법 현황 TOP8 전부 cutoff 60. 무컷오프 top3는 폐기.
3. **nav·스위처 라벨** = 「학생 목록」·「반 편성」(N-4 — MANAGE_VIEW_LABELS 값,
   본문 §D4-1 표기와 일치 확정).
4. **히트맵 상위색 emerald 통일**(N-11) — display.ts masteryHeatClass 상위 2단
   blue→emerald(소비처는 디렉터 허브뿐, /g 무접촉).
5. **summarize 정본 이동**(N-18) — `src/lib/exam-scoring/summarize.ts` 순수
   모듈. 서버 액션·시험 탭이 공용 import(클라 복제 금지). 헤더 퀵스탯
   「평균 점수율」도 동일 집계 소비(M-10 — 허브 헤더·시험 탭 수치 단일 소스).
6. **어법 탭 15초 폴링 장착**(M-5 — R6 인터벌 표 준수 완료), 과제 탭 「마감
   없음」 폴백은 dueAt 기준(M-2), 취약 프리셋 버튼도 analysisSeed 동봉(M-3 —
   3탭 착지 동형).
7. **워딩 게이트 확장**: 금지열에 「과제 배포」·「~ 만들기」(과제 CTA 결합형)
   추가, 스코프에 grammar-lab/** 포함. 서술형 명사 용례(「직접 배포」 배지·
   「배포 N분 전」)와 생성 문맥(「반 만들기」 aria)은 허용. 주석은 게이트 제외.
8. **v4 이월**: 드릴 뱅크 반입(별세계 변환 설계) · 단일 티어 모드 난이도 1·2
   생성의 사다리·솔버 미경유(M6-b 플래그 on 게이트에서 b01 10문항 실측 필수) ·
   국어 워크스페이스 관제 축 · 보드 평균점수 컬럼.
