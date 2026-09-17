# 시험 분석 v4 — 스튜디오 「시험 분석」·「학생 관리」 대개편 확정 스펙 (26-09-02)

> 발단(사용자 지시 원문 요지): 스튜디오 시험 분석 탭에서 자체 시험지 카드를 눌렀는데 오른쪽에
> 아무것도 없다 → 분석이 안 됐으면 「분석하라」는 안내가 떠야 한다. 자체 시험지와 외부(사진·PDF)
> 시험지를 왼쪽에서 분리해 보여주고, 분석 안 된 시험지에 분석 버튼을 달아라. 분석은 백그라운드
> 병렬·gemini-3.7-flash·해당 카드에 은은한 푸른 빛. 10~20페이지 시험지 분석 자체를 UI·UX·품질
> 모두 압도적으로 개선하라. 지금 상태·다음 단계·리포트가 왜 안 보이는지가 직관적이어야 한다.
> 「시험 분석」 옆에 「학생 관리」 탭을 신설해 분석→링크 발송→학생 관리가 스튜디오 안에서
> 자연스럽게 이어지게 하라(기존 학생 관리 페이지는 너무 복잡 — 스튜디오 디자인 언어 기반,
> 모달 최소, 좌우 펼침 패널로 섹션 구분). 필살기·적대 검수·수정 루프 하네스.
>
> 이 문서가 v4 의 **정본**이다. 선행 정본 `docs/studio-exam-analysis-integration.md`(S2 골격·
> 콘솔 레일·디자인 언어 v1)과 `docs/class-studio-spec.md` §3.10.28 은 그대로 유효하며 여기서
> 바뀐 것만 덮어쓴다. 함대는 이 문서만 읽는다. **임의 숫자·임의 자구 추가 = critical.**

---

## 0. 실측된 결함(왜 백지인가) — 26-09-02 감독 재검증

| # | 사실 | 근거 |
|---|---|---|
| F1 | INTERNAL(자체 시험지) 분석은 `analysis.examLevel` 이 **항상 null** — 순수 합성기가 총평 근거가 없다고 정직 표기 | `src/lib/exam-scoring/internal-analysis.ts:421-422` · `report-bridge.ts:68,82` |
| F2 | 레일 [총평] 탭은 examLevel null 이면 점선 박스 1개("모든 문항 분석이 끝나면…")만 그린다 → **사용자가 본 백지** | `analysis-rail/rail-synthesis.tsx:60-69` · 스크린샷 `.tmp-studio-analysis/shots/02b-analysis-1600-rail-internal.png` |
| F3 | INTERNAL 을 실제 LLM 으로 올리는 경로는 `POST /api/exams/[examId]/analysis-boost`(W6) 하나뿐인데 ① perQuestion 만 채우고 **examLevel 은 절대 안 만든다** ② 동기 300s(클라 await) ③ 진행률 기록 없음 ④ 스튜디오엔 진입점 0 | `analysis-boost/route.ts:104-126` |
| F4 | 목록 API 는 카드에 「다음 할 일」을 그릴 재료(검수 k/N·답안 제출 수·채점 확정 수·공유 수·심층 여부)를 하나도 내려주지 않는다 | `api/exam-report/analyses/route.ts:131-159` |
| F5 | vision 경로: Gemini 모델에서 `cacheSystem/cacheImages` 는 **no-op**(anthropic 전용 게이트) — 배치 6문항마다 **전 페이지 재전송**. `ExamMapEntry` 에 페이지 색인이 없어 배치가 어느 페이지를 봐야 하는지 모른다. E1a 는 전 페이지 1콜(20장이면 장당 600KB 로 압착). 클라 상한 12페이지 | `llm.ts:152-154` · `types.ts:36-51` · `llm-images.ts:35-38` · `intake-upload-state.ts:30` |
| F6 | `reasoningEffort:"low"` 는 Gemini 분기에서 **사고 켜짐**(enabled:true, effort low) — 출력 예산 12000 을 사고가 나눠 쓴다 | `atlas-ai.ts:379-388` |
| F7 | 학생 관리: 스튜디오엔 `c/[classId]` 4탭(지문·학생·결과·설정)과 ERP `/director/students`(61파일 16k줄, 수납·출결·상담 깊이)가 있고, 워크벤치 스튜디오(`/director/studio?class=`)에는 학생 표면이 없다 | 정찰 결과 §3 |

---

## 1. 결정(감독 확정 — 함대는 재논의 금지)

1. **왼쪽 목록은 2그룹**: 「자체 시험지」(INTERNAL 분석 행 + **아직 분석 행이 없는 자체 시험지 후보**) / 「외부 시험지 · 사진·PDF」(그 외). 그룹 헤더는 9차 확정 밴드 문법(`h-8 bg-slate-100 px-3` + 카운트 칩).
   - **【개정 26-09-03 — 사용자 지시】 세로 2밴드 → 폭 50:50 반반 탭 + 자구 「자체 시험지」→「스모트 시험지」.** 지시 원문: *"외부 시험지 · 사진·PDF 이게 지금 너무 아래로 내려와 있어. 자체 시험지 이거 옆에 반반으로 탭 구분해."* / *"이건 자체 시험지가 아니라 스모트 시험지야."*
     발단은 실물이다 — 스모트 10건 + 후보 다수인 방에서 **외부 그룹(7건)이 스크롤 한 바닥 아래로 밀려나** 존재 자체가 안 보였다(세로 적층의 구조적 결함이지 정렬 문제가 아니다).
     · 탭 = `grid grid-cols-2`(반반 강제) · 밴드 실루엣(`h-8 rounded-md px-3 text-[11px] font-semibold` + 흰 배경 링 카운트 칩) 승계 · 활성색은 자산 필과 같은 파랑 어휘.
     · 본문은 **활성 그룹 하나만 마운트**(비활성 언마운트 — `hidden` 유지 마운트는 카드가 2벌 남아 프로브·포커스가 안 보이는 카드를 집는다).
     · 자구는 그룹 탭과 허브 카드 칩(`showSourceChip`)이 **한 벌**이다.
     · 활성 탭 결정 3층: ① 자동(항목 있는 그룹, 스모트 우선) → ② 레일 추종(`activeGroup` **전이**) → ③ 명시 포커스(`focus.token` 전이 — 등록 완료 = 외부 탭). ②③ 은 **전이 판정**이라 5초 폴 틱이 사용자의 탭 선택을 되끌지 않는다. 클래스 교체는 ①로 전면 초기화.
     · ③이 필수인 이유: 등록 완료는 낙관 행을 **외부** 그룹에 프리펜드하는데, 스모트 탭에 서 있으면 「등록했는데 아무 일도 안 일어났다」가 된다. 레일 선택으로 대신하지 않는다 — 서버에 행이 생기기 전이라 상세 페치가 404 로 떨어진다.
1-a2. **【개정 26-09-04 — 사용자 지시】 후보 접이 = 점선 전폭 행 → 탭 줄 「범위 세그먼트」**

   원문 요지: *"「다른 클래스·미분류 시험지 25개 보기」 이 버튼을 [지문함 범위 세그먼트] 이런 느낌으로 해줘. 그 컴포넌트 자체를 [탭 줄]에 넣어버리고 그 행은 지워버려. 노트북 작은 화면에서 찌그러지지 않게."*

   - **폐기**: 그리드 안 `col-span-full` 점선 토글 행. 카드 흐름을 가로지르는 전폭 띠라 1열로 접히는 폭에서 목록 한가운데 이물질이었다.
   - **신설**: 탭 줄 오른쪽 세그먼트 `[이 클래스 (N) | 전체 (M)]`. 시각 어휘는 스튜디오 지문함 「범위」 세그먼트(§3.10.4 — `h-7` 흰 트랙 + 활성 파랑 필)를 그대로 승계한다. 클래스 축이 없으면(허브) 자구가 `[최근 (N) | 전체 (M)]`.
   - **탭 카운트 = 지금 그려지는 수**(펼치면 접힌 수만큼 상승). 구 「+N」 muted 꼬리는 세그먼트 「전체 (M)」과 같은 말이라 폐기.
   - **빈 판정 개정**: 구 코드는 「접힌 후보가 있으면 비지 않음」이었다(그리드 안에 토글 행이 있었기 때문). 행을 걷어낸 지금 그대로 두면 「이 클래스 0건 + 접힌 N건」이 **백지**가 되므로, 넓히라고 말하는 안내문으로 바꿨다.
   - **좁은 폭 방어(실측)**: 세그먼트가 같은 줄을 쓰면 탭 가용폭이 ≈205px 줄어 「외부 시험지 · 사진·PDF」가 1440·1366px 에서 잘렸다(129>91). → 자구 교체 임계를 **세그먼트 유무로 분기**(없으면 `@md`, 있으면 `@2xl`)하고, `@lg`(32rem) 미만에서는 세그먼트가 아래 줄로 내려간다. 게이트 `.tmp-studio-analysis/probe-scope-segment.mjs` — 1600/1440/1366/1280 에서 자구 잘림 0 · 가로 넘침 0 · 세그먼트 이탈 0.
   - 계약 셀렉터: `[data-analysis-candidates-scope-group]`(트랙, 접힘일 때만 `[data-analysis-candidates-collapsed]`) · `[data-analysis-candidates-scope="class"|"all"]`. 「전체」 버튼이 구 계약 `[data-analysis-candidates-more]`·`[data-analysis-candidates-folded]` 를 승계한다.

1-b. **【개정 26-09-03 오후 — 사용자 지시 3건】 원본 탭 · CTA 자리 재배치**

   원문: *"여기 스모트 시험지에서도 이 원본 탭 구현해줘. 원본 탭에서는 그 조판된 시험지를 보여주면 되잖아."* / *"이런 식으로 그 다음 단계를 안내해주는 그런 버튼들은 딱 위치를 [픽바 버튼] 이렇게 그 하단에 고정시켜서 보여줘."* / *"미분석 시험에 대해서 분석을 하는 이 버튼은 위치가 저 우측 탭이 아니라, [지문관리 하단 「실전 문제 생성」] 이런 식으로 좌측 탭에 고정이 된 상태로 있어야지. 철저하게 그 지문 관리 페이지의 느낌을 철저하게 확인하고 작업하도록 해."*

   **(A) [원본] 탭은 INTERNAL 에도 있다 — 내용은 「조판된 시험지」.** 같은 날 오전 판단(「INTERNAL 은 사진이 없으니 원본 탭 삭제」)의 **반전**이다. 전제(사진 없음)는 맞았고 **원본의 실체를 잘못 잡았던 것**이다 — INTERNAL 의 원본은 그 분석이 태어난 조판 결과물이다. 5탭 공통(총평·학생·문항·원본·정보).
   - 렌더러 = `ExamFirstPagePreview`(+ additive `maxPages`, 기본 1 = 기존 호출부 무회귀). **`ExamDetailPaperPreview` 이식 금지** — `#exam-paper-print-root` + `usePrintPortal` 이 앱 전역 인쇄를 가로채 다른 표면을 백지화시킨 실측 이력이 있고 툴바·줌·전역 PrintStyles 를 달고 온다. **zoom 이식도 금지**(상위 가로 스크롤 흡수 = 레일 「가로 오버플로 0」 계약과 충돌).
   - 확대 수단은 **레일 리사이즈**(320~960). 그래서 새 탭 탈출구를 만들지 않았다 — 탈출구 예외를 사진 확대처럼 늘리지 않는다.
   - 페치 = 셸 콘솔 1인스턴스 `ensureExamSheet(examId)`(`getExamPreviewData` 서버 액션). 키는 **examId**(`row.sourceExamId` — 상세 페이로드엔 없다). `sourceExamId` 는 surgical ALTER 열이라 **null 가능** → 빈 상태 필수.

   **(B) 레일의 「다음 단계」는 하단 도크다.** 스크롤러 **밖** flex 형제(`shrink-0` + 픽바 도킹 토큰). `position:fixed` 금지 — 레일은 aside(320~960, 드래그 중 style.width 직접 기입)와 드로어(360/85vw, fixed inset-0) **두 트리에 동시 마운트**라 뷰포트 기준 좌표가 양쪽에서 동시에 맞을 수 없다. 블록을 통째로 옮긴 이유: 제목(`data-next-step-title`)과 CTA 가 갈라지면 「카드 힌트 == 레일 제목」 정합 게이트가 두 노드를 넘나든다. **구 §3 U5-1「전 상태 공통 최상단」은 폐기.**

   **(C) 「분석 시작」 CTA 는 레일이 아니라 중앙 판 하단 도크다.** 경계선은 **kind 하나**로 판정한다 — `candidate-analyze` · `internal-deepen` · `retry-failed` · `resume-draft`(= 실행이 붙는 analyze 계열 전부). 그 4종은 요약 행만으로 대상 id 가 나오는 **순수 fire-and-forget** 이라 판 밖으로 나갈 수 있고, 나머지(`review-gate`·`add-students`·`confirm-grading`·일괄 3종 등)는 레일 상태나 `detail.students` 를 먹으므로 **구조적으로 못 나간다**.
   - 도크 토큰은 지문관리(library-pane) 하단 CTA 바를 글자 단위로 승계: 바 `shrink-0 border-t border-slate-100 bg-white px-5 py-3` · 버튼 `h-10 rounded-lg px-2 text-[13px] font-bold` + `bg-blue-600`/비활 `bg-blue-300` · **native disabled 금지, aria-disabled + 힌트 글로우**.
   - 대상 = **지금 선택된 행/후보**(지문관리 CTA 가 「선택한 지문」에 거는 것과 같은 규칙). 선택이 없거나 분석 계열이 아니면 비활성이고, 클릭하면 분석 가능한 카드를 글로우로 짚는다.
   - **과금 2단 확인은 그대로**다(`RailConfirmButton` 재사용) — 자리 이동 지시는 안전장치 해제 지시가 아니다.
   - 실행자는 `analyzeRequestFor(step, {row, candidate})` **한 함수**(rail-next-step-actions) — 판정은 `next-step.ts`, 실행은 이 함수. 두 벌 금지.
   - 파생: 목록만 내부 스크롤(`AnalysesBoard scrollBody` additive) → 툴바 고정 + 도크가 바닥에 붙는다. 판(`analysis-pane`)은 더 이상 스크롤러가 아니다.

2. **자체 시험지의 「분석」= analysis-boost 경로**(N문항 × 1cr, 최소 하한 없음)를 **백그라운드 fire-and-forget** 으로 바꾸고, 라우트가 ① 배치마다 `aiMeta.boost.progress` 기록 ② 문항 분석 뒤 **E1c 종합(examLevel)까지 생성** ③ 모델 gemini-3.7-flash ④ 동시 3배치. 카드는 폴로 `boost.status` 를 받아 **은은한 푸른 글로우**(기존 `WorkbenchLoadingCard variant="analyzing"` — 학습지·문항 생성 큐와 같은 어휘)로 돈다.
3. **레일 상단에 「여정 스트립 + 다음 단계 블록」** 을 상시 배치. 다음 단계는 **순수 함수 1개**(`src/lib/exam-report/next-step.ts`)가 도출하고, 카드 힌트 줄·레일 블록·학생 관리 뷰가 **같은 함수**를 쓴다(계기판과 버튼이 어긋날 수 없다).
4. **목록 API 에 `funnel` 스칼라 묶음 추가**(서버 계산, raw JSON egress 0) + `?include=candidates` 로 미분석 자체 시험지 후보. 허브는 무변화(옵션 미전달 = 기존 응답).
5. **vision 경로 v4**: 모델 3.7-flash · `ExamMapEntry.page` 추가(additive) · E1a **페이지 청크(≤6장)** · E1b **페이지 국소 배치**(대상 문항 페이지 ±1, 최대 6장) · 동시 3 · E1c 의 difficultyProfile/typeDistribution 은 **코드가 결정론 계산**(LLM 은 prose 3필드만) · 클라 상한 20페이지.
6. **5번째 뷰 「학생 관리」** 신설: 중앙 = 클래스 로스터 × 시험 리포트 현황 매트릭스, 우측 = 학생 상세 레일(초대 링크·시험별 리포트·공유). 모달 0(추가 폼은 레일 인라인). 시험 분석 레일의 「학생」 단계 CTA 가 이 뷰로 건너간다(같은 페이지 뷰 전환).
7. **일괄 채점 확정은 만들지 않는다**(원버튼 금지 원칙 `exam-map-table.tsx:8-9` 존중 — 선행 정본 §9 결정 1 을 (b) 로 확정). 「채점」 단계 CTA 는 미확정 첫 학생 아코디언으로 **이동**만 한다.
8. **탈출구 0 계약 유지 + 예외 1**: INTERNAL 학생 0명 상태의 「시험지 배포 화면」 링크는 레일이 해결할 수 없는 타 도메인이므로 `data-rail-escape-allowed` 를 달고 새 탭 허용. 프로브 게이트는 `a[target=_blank]:not(:has(img)):not([data-rail-escape-allowed])` = 0.
9. 크레딧 표기는 `CREDIT_COSTS` 실값에서만 파생(`EXAM_ANALYSIS_BOOST`=1/문항, `EXAM_STUDENT_REPORT`=5/명). 숫자 하드코딩 금지.
10. **(검수 라운드 추가, 감독 사후 승인 26-09-02)** INTERNAL 분석의 정답·배점 검수 게이트는 **구조상 열림**(정답은 출제자가 확정한 값 — 검수할 근거가 없다): `funnel.computeFunnel`·`next-step.resolveFacts` 가 INTERNAL 이면 gateOpen=true·confirmedCount=questionCount 로 고정. 여정 「검수」 칸은 INTERNAL 에서 항상 done.
11. **(검수 라운드 추가, 감독 사후 승인)** 심층 분석이 「문항 완료·총평만 실패」(`boost.status=DONE && synthFailed`)로 끝나면 재과금 CTA 대신 **「총평 다시 생성」(0 cr, `POST analysis-boost` body `{synthOnly:true}`)** — 라우트는 살아있는 문항 전부가 `boostedNumbers` 에 있을 때만 이 경로를 허용하고, RUNNING 게이트 CAS 로 직렬화한다(잡·과금·배치 없음). 스태프 인증·테넌트 스코프 안에서 텍스트 콜 1회 — 남용 상한은 후속 후보(레이트리밋).

---

## 2. 공유 계약(감독이 먼저 만든다 — 함대는 import 만)

### 2.1 목록 행 확장 — `src/hooks/use-exam-report-activity.ts`

```ts
export interface ExamReportFunnel {
  questionCount: number;            // examMap.questions.length (0 = 지도 없음)
  confirmedCount: number;           // reviewState.mapConfirmedNumbers ∩ 지도 번호
  gateOpen: boolean;                // getMapGateStatus(...).open — 서버 단일 소스
  grandfathered: boolean;
  hasExamLevel: boolean;            // analysis.examLevel 존재(총평 재료)
  depth: "NONE" | "SHALLOW" | "DEEP"; // INTERNAL: NONE=행 없음(후보) SHALLOW=합성만 DEEP=examLevel 有. 비INTERNAL: ANALYZED&&hasExamLevel→DEEP, 그 외 SHALLOW
  boost: { status: "RUNNING" | "DONE" | "FAILED"; startedAt: number; completed: number; total: number } | null;
  students: {
    total: number; answerIssued: number; answerSubmitted: number;
    graded: number; reportGenerated: number; reportGenerating: number;
    reportFailed: number; shared: number;
    // 학생 단위 배타 분류(합 = total) — 서버·클라 공용 summarizeFunnelStudents(next-step.ts)
    needLink: number;        // 미채점·미제출·링크 미발급(비INTERNAL; INTERNAL 은 0)
    awaitingAnswer: number;  // 미채점·미제출·링크 발급됨
    needGrading: number;     // 미채점·제출됨(INTERNAL 은 미채점 전부)
    needReport: number;      // 채점 확정·리포트 NONE|FAILED
    needShare: number;       // GENERATED·공유 꺼짐
  };
}
export interface ExamReportSummaryRow { …기존…; funnel?: ExamReportFunnel; }

/** ?include=candidates — INTERNAL 분석 행이 아직 없는 자체 시험지 */
export interface ExamCandidateRow {
  examId: string; title: string; questionCount: number; classId: string | null;
  examType: string | null; updatedAt: string;
}
```
- 훅 옵션 `includeCandidates?: boolean` → `candidates: ExamCandidateRow[]` 반환 필드 추가. 폴 서명에 `boost.status:completed` 와 candidates id 목록을 섞고, `hasActive` 에 `boost.status==="RUNNING"` 포함(5초 유지).
- 서버(`GET /api/exam-report/analyses`): `structure`·`reviewState` 를 select 하되 **응답에 싣지 않는다**(계산만). `hasExamLevel` 은 `$queryRaw` 로 `analysis->'examLevel'` 존재 판정(analysis JSON 전체 select 금지 — egress). 학생 집계는 `examReportStudent.findMany({select 스칼라 6개})` 1회 후 메모리 집계. `boost` 는 aiMeta.boost 원시 판독(RUNNING 은 `BOOST_STALE_MS` 초과 시 FAILED 로 강등 표기).
- `?include=candidates`: `exam.findMany({academyId, subject≠KOREAN, deletedAt null, questions some(question.deletedAt null)})` 중 INTERNAL 분석 행(sourceExamId) 없는 것, `updatedAt desc take 30`, `questionCount` = 살아있는 문항 수.

### 2.2 다음 단계 도출 — `src/lib/exam-report/next-step.ts` (순수, 테스트 동반)

```ts
export type ExamJourneyStep = "analyze" | "review" | "students" | "grading" | "reports";
export type ExamNextStepKind =
  | "candidate-analyze"      // 후보 시험지: [AI 분석 시작 · N cr]
  | "internal-deepen"        // INTERNAL SHALLOW: [AI 심층 분석 · N cr]
  | "boost-running"          // 심층 분석 중(진행률)
  | "analyzing"              // vision 분석 중(진행률)
  | "resume-draft" | "retry-failed" | "resume-upload"
  | "review-gate"            // [정답·배점 검수 k/N]
  | "add-students"           // [학생 추가] / INTERNAL: 배포 안내
  | "issue-answer-links"     // [답안 링크 N명 발급·복사]
  | "await-answers"          // 제출 대기(CTA 없음, 미제출 N명 표시 + 링크 재복사 보조)
  | "confirm-grading"        // [채점 확인 N명] (이동만)
  | "generate-reports"       // [리포트 N명 생성 · N×5cr]
  | "reports-generating"      // 생성 중(진행률)
  | "share-reports"          // [공유 링크 N명 발급·복사]
  | "all-done";              // [공유 링크 전체 복사]
export interface ExamNextStep {
  kind: ExamNextStepKind;
  title: string;            // 1줄 — "다음: …"
  description: string;      // 1~2문장, 왜 이 단계인지
  cta: { label: string; creditCost?: number; tone: "primary" | "secondary" | "danger" } | null;
  count?: number;           // CTA 대상 수
  progress?: { completed: number; total: number } | null;
  journey: Record<ExamJourneyStep, "done" | "active" | "pending">;
  journeyStep: ExamJourneyStep;   // active 칸 — 스트립과 블록이 같은 값을 본다
}
export function summarizeFunnelStudents(students, isInternal): ExamReportFunnelStudents  // 서버 목록 API 도 이 함수로 need* 계산
export function deriveExamNextStep(input: {
  row: ExamReportSummaryRow | null;          // null = 후보
  candidate?: ExamCandidateRow | null;
  detail?: ExamAnalysisDetail | null;        // 있으면 학생 행 단위로 정밀 판정(레일)
  costs: { boostPerQuestion: number; reportPerStudent: number };
}): ExamNextStep
```
판정 순서(위에서 첫 매치 — 구현 `next-step.ts` 가 정본, 테스트 `tests/unit/exam-next-step.test.mjs`): candidate → ANALYZING → boost RUNNING → FAILED → DRAFT(resumable/orphan) → **학생 퍼널**(gate closed → students 0 → needLink>0 → needGrading>0 → awaitingAnswer>0(리포트 축 전부 0일 때) → needReport>0 → reportGenerating>0 → needShare>0 → awaitingAnswer>0 → all-done) → 그 결과가 **차단 단계가 아닐 때만** INTERNAL&&!hasExamLevel(internal-deepen).
journey: analyze=done iff status ANALYZED · review=done iff gateOpen · students=done iff total>0 · grading=done iff graded===total>0 · reports=done iff reportGenerated===total>0 && shared===total. active = 현재 kind 가 속한 단계, 나머지 pending.
detail 이 있으면 학생 집계는 detail.students 에서 재계산(레일 낙관 패치 반영), 없으면 row.funnel.students.

> **§2.2 주석(26-09-02 수정 루프 결정, SHARED #5)**: INTERNAL 행은 검수 게이트를 **구조상 열림**으로 본다 — `computeFunnel`(서버)과 `resolveFacts`(클라 detail 분기) 모두 isInternal 이면 `gateOpen=true·grandfathered=true·confirmedCount=questionCount`. 근거: 정답·배점은 시험지가 확정한 값이고 report-bridge 는 reviewState 를 쓰지 않아 INTERNAL 학생 0명 행이 심층 분석 성공 직후 0/N 검수(review-gate)에 걸려 배포 단계(add-students)를 가렸다. 따라서 INTERNAL 의 여정 review 칸은 항상 done. 같은 루프에서 `boost` 스냅샷에 `synthFailed·stale·error`(additive)가 실리고, internal-deepen 은 DONE+synthFailed → 「총평 다시 생성」(무과금, `ExamNextStep.synthOnly`) / FAILED+CHARGE_FAILED → 「차감 없음」 / FAILED+stale → 「환불 여부는 크레딧 관리에서 확인」 자구로 갈린다. 학생 분류 술어는 `classifyFunnelStudent` 단일 함수(§1-3).

> **§2.2 개정(26-09-04, 사용자 지적 「AI 분석은 안 했는데 왜 리포트는 완성이야?」)**: INTERNAL 의 AI 분석(`internal-deepen`)은 **관문이 아니라 강화**다 — 서버의 리포트 게이트(`students/[studentId]/generate/route.ts`)는 `status==="ANALYZED" && gradingConfirmed` 만 보고 `examLevel` 을 요구한 적이 없으며, 자체 시험지는 브리지가 행을 만드는 순간 ANALYZED 다(`report-bridge.ts` — 출제 해설 합성). 종전 순서는 이 단계를 학생 퍼널 **위**에 두어, 채점·리포트가 밀려 있어도 도크·카드가 영원히 「AI 분석이 아직 없습니다」만 말했다(선행조건처럼 읽히는 거짓 계기판 + 여정 스트립이 `분석`만 영영 미완). 개정 규칙:
> - `deriveFunnelStep` 과 `internalDeepenStep` 을 분리하고, 퍼널 결과가 `BLOCKING_FUNNEL_KINDS`(review-gate·issue-answer-links·confirm-grading·generate-reports·reports-generating·share-reports) **밖**일 때만 강화를 띄운다. 밖 = add-students·await-answers·all-done(강사가 기다리거나 끝낸 상태 = 리포트 생성 **전**이라 재생성 재과금이 없는 가장 값싼 시점).
> - 여정 `분석` 칸은 `status ANALYZED` 하나로 판정한다. AI 분석 여부는 **깊이 배지**(`funnel.depth` SHALLOW/DEEP)가 따로 말한다 — 두 축을 한 칸에 겹치지 않는다.
> - 진입점 보존: 중앙 판 하단 도크는 `deriveExamAnalyzeStep`(분석 계열 전용 도출, 강화가 뒤로 밀려도 항상 CTA 를 낸다)을 보고, 레일 도크·카드 힌트는 `deriveExamNextStep` 을 본다. 판정은 여전히 `next-step.ts` 한 파일.
> - `generate-reports` 의 CTA 는 「리포트 만들 학생 선택」(**이동**)이고 `creditCost` 를 달지 않는다. 대상 선택·일괄 실행·과금 확인은 [학생] 탭의 `rail-report-picker.tsx` 가 전담한다(사용자 지시: "무슨 학생의 리포트를 생성할지 학생 목록에서 선택하게 해야지" — 종전엔 대상이 보이지 않는 일괄 5cr×N 이었다).

> **§10 개정(26-09-04 오후, 사용자 지시 3건)** — [학생] 탭 구조:
> - **목록 통합**: 「등록됨」/「아직 응시하지 않은 학생」 2섹션을 **한 목록**으로 합치고 **상태 태그**로만 구분한다(`rail-student-rows.tsx` · `buildUnifiedRows`). 태그의 단일 소스는 `classifyFunnelStudent`(답안 없음/링크 미발급/답안 기다리는 중/**채점 미완료**/**채점 완료**/리포트 만드는 중/리포트 완성/공유함). 정렬은 할 일이 남은 단계가 위. 근거: "여기 학생이랑 여기 학생이랑 이렇게 구분할 필요가 있나? 그냥 정답 체크 완료, 미완료 태그로 분류만 해주는게 좋지 않아?"
> - **행 체크 → 하단 픽바**(`rail-student-pick-bar.tsx`, 지문관리 dossier-pick-bar 관용구): 선택이 있으면 레일 하단 도크가 「다음 단계」 대신 픽바를 든다. 버튼은 **선택 안에서 가능한 액션만** — 답안 링크 보내기 / 리포트 생성(과금·2단 확인·cr 칩) / 공유 링크 발급. 선택 키는 출처 접두로 분리한다(`s:<examReportStudentId>` / `r:<studentId>`). 근거: "애초에 여기서 체크를 하면 버튼이 뜨도록 하면 되잖아."
> - **자구**: 화면에서 「로스터」를 쓰지 않는다 → 「우리 반 학생」·「학생 명단」. 근거: "로스터 같은 어려운 표현 쓰지 마."
> - 발급한 답안 링크는 셸(`useAnalysisConsole.issuedLinks`)이 들고 `rail-issued-links.tsx` 가 그린다 — 행에서 보내든 픽바로 여러 명을 보내든 같은 목록에 쌓인다(발급 즉시 행 상태가 바뀌어 링크가 화면에서 증발하던 결함의 수리를 통합 구조에서도 유지).

> **§10 개정(26-09-05, 사용자 지시 5건)** — 답안 링크·도크:
> - **제출은 최종**: `answerSubmittedAt` 이 있으면 `/a` 는 읽기전용이고 `POST /api/answer/[token]` 은 409 `LOCKED`(reason `SUBMITTED`)로 거절한다. 종전엔 채점 확정 전까지 몇 번이든 덮어쓸 수 있었다. 제출 일시는 학생 화면 잠금 안내와 레일 OMR 존 칩에 표기한다. 오기입 정정 경로는 **강사 쪽**(레일 정오표 직접 입력)만 남는다.
> - **[링크 끄기] 철거**(레일): 무엇을 끄는지 모호했고 제출이 최종이 된 뒤로는 끌 이유가 없다. 서버 액션 `disableAnswerLink` 는 전체 워크스페이스에 남아 있다.
> - **카카오톡 전송은 링크 입력칸과 같은 줄**(복사 옆) — 보내는 수단끼리 붙인다.
> - **모바일 OMR 안내를 푸른 카드로 크게**: "학생에게 모바일 OMR을 보내서 자동으로 채점하세요"(채점 확정 후에는 비노출 — 읽기전용이라 거짓이 된다).
> - **「답 직접 입력」 버튼 신설**: 강사가 학생 답을 대신 입력할 수 있다는 사실이 어디에도 드러나지 않았다(사용자 지적). 누르면 `focusStudent(id, 첫 미채점 번호)` 로 정오표 타일을 선택·펄스한다.
> - **도크 CTA 는 선택 게이트**: `confirm-grading`·`generate-reports` 는 **학생을 체크하기 전까지 비활성**이고 이유를 버튼 아래 한 줄로 말한다. 실제 행동은 체크가 띄우는 픽바가 든다(채점하기 / 답안 링크 / 리포트 생성 / 공유 링크).

> **§10 개정(26-09-05 오후, 사용자 지시 2건)** — 목록 범위·소속:
> - **탭 배지 = 보이는 행 수**. 종전 `detail.students.length`(이 시험에 행이 있는 학생)는 26-09-04 목록 통합 이후 화면과 갈렸다(배지 1 / 목록 3). 행 배열을 레일에서 한 번 만들어(`unifiedRows`) 배지·목록·픽바가 같은 것을 본다.
> - **클래스 소속 축**(`UnifiedStudentRow.membership`): `inClass`(기본값 — 칩 없음) / `otherClass`「다른 반」 / `unlinked`「명단 밖」(studentId 없음) / `unknown`(클래스 미선택·명단 미적재 — **판정 불가라 칩을 달지 않는다**).
> - **범위 필터**(`console.studentScope`, 기본 `class`): 칩 `[우리 반 N] [전체 M]`. 접는 것은 `otherClass` 뿐이다 — `unlinked`·`unknown` 은 "모르는 것"이라 접지 않는다(비INTERNAL 자유입력 행이 통째로 사라지는 것을 막는다). 접힌 학생은 목록 아래 「{클래스} 학생이 아닌 N명이 이 시험을 쳤어요 · [전체 보기]」로 **항상 한 클릭 거리**에 남긴다(채점·리포트가 있는 행을 화면에서 잃지 않는 것이 이 필터의 상한선). 픽바는 필터를 걸지 않은 전체 행으로 선택 키를 해석한다(범위를 좁혔다고 이미 고른 학생이 사라지면 안 된다).
> - **[학생 추가]를 INTERNAL 에서도 연다**. 종전 비노출 근거(브리지 자동 등록이 정본)는 OMR 링크가 메인 배포 수단이 되며 무너졌다 — 로스터 [링크 보내기]가 이미 같은 행을 만들고 있었다. 서버 가드는 `mode="roster"` 경로를 INTERNAL 에 허용하므로(자유입력만 거부) 「명단에 없는 학생 새로 등록」 폼만 INTERNAL 에서 감춘다. 검색은 학원 전체 범위라 **다른 반 학생을 담는 경로**가 곧 이 패널이다.

> **§10 보강(26-09-05, 사용자 지시 2건)** — 아직 답안이 없는 학생 행:
> - 행 CTA 자구를 **「OMR 링크 보내기」**로(픽바도 동일). 「링크 보내기」는 무슨 링크인지 말하지 않았다.
> - **[✏ 직접 입력] 신설**: 링크를 만들기 전에도 강사가 답을 대신 넣을 수 있어야 한다(사용자 지시). `addExamStudentFromRoster` 로 **링크 없이 행만** 만들고(무과금·토큰 0) `focusStudent` 로 곧바로 정오표를 펼친다. 종전에는 링크 발급만이 행을 만드는 유일한 경로여서, 링크를 안 쓰는 학생은 채점 자체가 불가능했다.
> - 후보 화면(분석 행이 아직 없는 시험지)에는 이 버튼을 넘기지 않는다 — 담을 분석 행 자체가 없다(그 화면의 [OMR 링크 보내기]는 서버가 분석 행을 먼저 만든다).

> **§10 재설계(26-09-05, 사용자 지시)** — 강사 직접 입력 화면을 **OMR 답안지**로:
> 원문: "선생님이 직접 입력하는 창 자체가 너무 직관적이지 않아 … 내가 입력해야 할 것은 학생 답이잖아 … omr이면 당연히 직관적으로 뭘 해야 할지 보이는데."
> - 구 `rail-grading-tiles`(정오 타일 그리드 + 탭 상세)를 폐기하고 `rail-answer-sheet.tsx` + `rail-answer-detail.tsx` 로 교체. 한 줄이 한 문항: `[번호] ① ② ③ ④ ⑤`. **선지를 누르면 그게 학생 답**이고 정오는 `deriveStatusFromChoice` 로 자동 파생돼 고른 선지에 색이 입는다(초록=정답/빨강=오답/검정=정답 미상). 별도 채점 동작이 없다. 서답형만 텍스트 칸 + ○✕△(자동 채점 불가 축).
> - **번호를 누르면** 2차 화면(발문·정답/모범답안·허용 변형·수동 정오·부분점수)이 펴진다 — 예외를 1차 화면에 늘어놓지 않는다. 종전 구조는 강사가 넣어야 할 값(학생 답)이 2차 화면에 있어서 20문항이면 클릭 40번이었다.
> - 잡음 제거: 「채점 필요 20문항 · 1,2,3…20번」 나열 배너 → **할 일 한 문장 + 진행 숫자**(`학생이 고른 답을 표시하세요 3/20`). 아코디언 상단의 「미채점」 칩(목록 행 태그·답안지 헤더와 3중 중복) 제거. 리포트 존의 번호 20개 나열도 남은 문항 **수**로 축약.
> - OMR 존의 [답 직접 입력] 버튼 철거 — **지금 열려 있는 아코디언 자체가 그 화면**이다(같은 화면 안에서 그 화면으로 가라는 버튼).

### 2.3 시험 종합 공용 모듈 — `src/lib/exam-report/synthesis.ts`

```ts
/** perQuestion+examMap 에서 결정론 계산 — LLM 무관(레일 차트와 문항 데이터 불일치 원천 차단) */
export function computeDeterministicExamLevel(examMap: ExamMap, perQuestion: QuestionAnalysis[]):
  Pick<ExamLevelAnalysis, "difficultyProfile" | "typeDistribution">;
/** LLM prose 3필드(overview/trapOverview/scopeInference) — stage "examAnalysis", 이미지 0 */
export async function synthesizeExamLevel(opts: {
  examMap: ExamMap; perQuestion: QuestionAnalysis[]; examMeta: ExamReportMeta;
  deadlineAt?: number; usage?: ExamReportLlmUsage;
}): Promise<ExamLevelAnalysis>;   // = 결정론 2필드 + LLM prose 3필드 합성
```
- difficultyProfile: difficulty 1~2 easy / 3 medium / 4 hard / 5 killer, 번호는 examMap order 순.
- typeDistribution: perQuestion.typeLabel(공백 제거) 그룹 → numbers(order 순) + points 합(examMap.points null 은 0).
- vision E1c(`exam-analyze-direct.ts`)와 boost 라우트 **둘 다 이 모듈을 호출**한다(프롬프트 2벌 금지).
- prose 규칙: overview ≥3문장(체감 난이도 판정·구성·출제 경향), trapOverview 는 오답 설계 패턴 2개 이상 인용, scopeInference 는 근거(문항 번호) 병기. 합니다체.

### 2.4 보강 발사 헬퍼 — `board-shared.ts`

```ts
export function fireBoostRequest(examId: string): void   // POST /api/exams/${examId}/analysis-boost, await 금지, 402→toast, 409(ALREADY_RUNNING)→toast.info
```

### 2.5 단위 간 인터페이스(이름 고정 — 다른 단위가 이 이름으로 배선한다)

| 소유 | 표면 | 계약 |
|---|---|---|
| U4 | `StudioAnalysisPane` props | 기존 `active`·`onSelect(row\|null)`·`activeRowId` + **추가** `onSelectCandidate?: (c: ExamCandidateRow \| null) => void` · `activeCandidateId?: string \| null` · `focusAnalysisId?: string \| null`(셸이 학생 관리에서 건너올 때 — 판이 boardRows 에서 행을 찾아 `onSelect(row)` 호출 후 `onFocusConsumed?.()`) · `onFocusConsumed?: () => void`. 훅은 `useExamReportActivity({ enabled: active, includeCandidates: true })`. 카드 선택과 후보 선택은 배타(한쪽 선택 시 다른 쪽 null 업링크). |
| U5 | `AnalysisDetailRail` props | `row: ExamReportSummaryRow \| null`(**null 허용으로 변경**) · **추가** `candidate?: ExamCandidateRow \| null`(row null && candidate 有 = 후보 화면) · `onOpenStudentsView?: () => void`(add-students CTA 등 — 셸이 `view="students"` 전환) · 나머지 기존 props 유지. `AnalysisConsoleApi` **추가** `focusStudent(studentId: string): void`(activeTab students + 아코디언 펼침 + 필요 시 loadStudent) · `issueAnswerLinksBulk(studentIds: string[]): Promise<{issued: string[]; failed: string[]; table: string}>` · `generateReportsBulk(studentIds: string[]): Promise<{started: string[]; stoppedBy402: boolean}>` · `enableSharesBulk(studentIds: string[]): Promise<{enabled: string[]; failed: string[]; table: string}>` · `copyShareTable(): Promise<string>`(공유 켜진 전원). `useAnalysisConsole(row \| null, …)` 시그니처 불변(row null = 무동작). |
| U6 | 셸 상태 | `analysisRailRow: ExamReportSummaryRow \| null` + **추가** `analysisRailCandidate: ExamCandidateRow \| null`(둘 중 하나만 non-null) · `analysisFocus: {analysisId: string; studentId: string} \| null`(학생 관리 → 시험 분석 건너뛰기: view=analysis 전환 + `focusAnalysisId` 전달 + 행 선택 후 `analysisConsole.focusStudent(studentId)`) · `studentsRailStudentId: string \| null`. 콜백 2종: `openStudentsView()` / `openAnalysisForStudent(analysisId, studentId)`. |
| U6 | `StudioStudentsPane` props | `{ classId: string; active: boolean; activeStudentId: string \| null; onSelectStudent: (id: string \| null) => void; refreshKey: number; onRequestAdd: () => void }` — 데이터는 셸 훅 `useStudioStudents(classId, active, refreshKey)` 가 들고 판·레일에 내려준다(2중 마운트 규칙). |
| U6 | `StudentDetailRail` props | `{ classId: string; student: StudioStudentExamRow \| null; mode: "detail" \| "add"; onClose; onOpenAnalysis: (analysisId: string, studentId: string) => void; onChanged: () => void }` — `mode:"add"` 는 인라인 추가 폼(검색+이름·학년). |
| U6 | 액션 | `listStudioClassStudentExams(classId): Promise<StudioActionResult<{ academyCode: string; students: StudioStudentExamRow[] }>>` in `src/actions/studio/student-exams.ts`. `StudioStudentExamRow = { studentId, name, studentCode, grade, lastStudyAt, exams: StudioStudentExamEntry[] }`, `StudioStudentExamEntry = { reportStudentId, analysisId, title, examType, sourceType, updatedAt, totalScore, maxScore, gradingConfirmed, reportStatus, shareEnabled, shareToken, answerEnabled, answerToken, answerSubmittedAt }`. |
| U2 | 목록 API | `GET /api/exam-report/analyses?view=summary[&include=candidates]` — §2.1. `funnel` 은 **모든 행**에 채운다(허브도 받되 무시). |
| 공통 | 계약 셀렉터(프로브) | `[data-analysis-dock]`(중앙 판 하단 도크) · `[data-analysis-dock-cta][data-analysis-dock-kind]`(분석 시작 버튼 — **레일이 아니다**, 26-09-03) · `[data-rail-next-step-dock]`(레일 하단 도크) · `[data-rail-exam-sheet][data-rail-exam-sheet-page]`(INTERNAL 원본 = 조판된 시험지) · `[data-analyses-board-scroll]`(목록 내부 스크롤러) · `[data-analysis-group-tab="internal"\|"external"]`(**그룹 탭 버튼** — 자구·카운트가 여기 산다, 26-09-03) · `[data-analysis-group-tab-active]`(활성 탭에만) · `[data-analysis-group="internal"\|"external"]`(**활성 그룹 본문 1개만** — 비활성은 언마운트이므로 프로브는 카드를 찾기 전에 해당 탭을 먼저 클릭할 것) · `[data-analysis-candidate="<examId>"]`(후보 카드) · `[data-next-step="<kind>"]`(레일 블록 루트) · `[data-next-step-cta]`(CTA 버튼) · `[data-journey-step="<step>"][data-state="done\|active\|pending"]` · `[data-studio-students-pane]` · `[data-student-row="<studentId>"]` · `[data-student-rail]` · `[data-asset-view="students"]` · `[data-rail-escape-allowed]`. |

---

## 3. 단위별 구현 계약

### U1 vision 엔진 v4 (파일 소유: `src/lib/exam-report/{model-config,types,schemas,prompts,exam-analyze-direct,llm-images}.ts`, `analyze/_lib/route-run.ts`, `hub/intake-upload-state.ts`)
1. `model-config.ts` examAnalysis: `ANALYSIS_MODEL` 기본 `google/gemini-3.7-flash`(env `EXAM_REPORT_ANALYSIS_MODEL` 오버라이드 유지, 헤더 주석에 26-09-02 사용자 확정 기록), `maxOutputTokens 16000`, `reasoningEffort "low"` 유지, timeout 180s 유지.
2. `types.ts` `ExamMapEntry.page?: number`(1-based, 첨부 사진 전역 인덱스 — 코드가 부여, LLM 은 청크 내 상대 인덱스 반환) · `schemas.ts` examMapStructureFields 에 `page` optional(관대 파스). `normalizeChoiceToken` 무접촉.
3. `prompts.ts` E1a: 스키마 블록에 `"page": 1` 추가(「첨부 사진 중 이 문항의 발문이 시작되는 장의 순번(1부터)」). `buildExamMapUserPrompt` 에 `pageOffset`(전역 시작 번호)·`pageCount` 전달 — 청크 호출 시 "이 사진들은 전체 N장 중 a~b장" 고지 + "발문이 이 장들에서 시작하는 문항만 기록". E1b: 규칙에 **근거 인용**(explanation 은 지문의 핵심 근거 문장을 따옴표로 1개 이상 인용), **난이도 앵커**(1=정답률 90%↑ … 5=30%↓ 킬러), 어법 문항은 밑줄 항목별 문법 포인트 명시, trapDesign.why 는 「학생이 이 선지를 고르는 오개념」 형식. 합니다체 규칙 추가(boost 프롬프트와 동일 자구).
4. `exam-analyze-direct.ts`: `extractExamMap` → 페이지 > 6 이면 `chunk(images, 6)` 순차(동시 2) 호출 후 병합(number 공백제거 키 dedupe — 먼저 온 청크 우선, page = 청크 offset + 상대), `order` 는 (page, 청크 내 order) 재부여. E1b 배치: 대상 문항을 page 오름차순 정렬 후 6개씩 자르되 **같은 배치의 페이지 범위가 3장을 넘으면 거기서 끊는다**; 배치 이미지 = 배치 페이지 집합 ∪ 인접 ±1, 최대 6장(page 없는 문항은 전 페이지 폴백 — 구 지도 무회귀). `FANOUT_CONCURRENCY 3`. E1c 는 `synthesizeExamLevel` 호출로 교체.
5. `llm-images.ts`: `prepareLlmImages(buffers, { pagesPerCall = 6 })` — perPageBudget 분모를 `min(buffers.length, pagesPerCall)` 로. 호출부(route-run loadExamImages) 무변경 시그니처.
6. `intake-upload-state.ts` `MAX_PAGES 20`(서버 upload-urls zod 30 이내 — 실측). 토스트 자구 자동 추종.
7. 무회귀: page 없는 구 examMap 으로도 E1b 가 전 페이지 폴백으로 돈다. tsc 0.

### U2 보강(INTERNAL) v4 + 목록 API (파일 소유: `api/exams/[examId]/analysis-boost/route.ts`, `src/lib/exam-scoring/boost.ts`, `api/exam-report/analyses/route.ts`, `src/hooks/use-exam-report-activity.ts`(감독 선작성 타입 위에 훅 옵션·서명 구현), `board-shared.ts`(fireBoostRequest))
1. boost.ts: `FANOUT_CONCURRENCY 3`, `onBatchComplete(completed,total)` 콜백 → 라우트가 `aiMeta.boost.progress` CAS 갱신(재시도 3). 프롬프트 품질 규칙은 U1 E1b 와 동일 자구(근거 인용·난이도 앵커·오개념형 why).
2. 라우트: 문항 배치 완료 후 `synthesizeExamLevel` 로 examLevel 생성·저장(`analysis.examLevel`), 실패해도 perQuestion 저장은 유지(boost.status DONE + `synthFailed:true`). 과금·환불 로직 무접촉. 응답 즉시가 아니라 완주 후 응답이지만 클라는 기다리지 않는다(fire-and-forget 계약).
3. 목록 API: §2.1 funnel + candidates. `hasExamLevel` raw SQL. 기존 필드·순서 무변경.
4. 훅: `includeCandidates` 옵션, `candidates` 반환, 서명·hasActive 확장.

### U3 (감독 선작성) `next-step.ts` + 단위 테스트 + `synthesis.ts`

### U4 왼쪽 목록(스튜디오) (파일 소유: `workbench/analysis-pane.tsx`, `hub/analyses-board.tsx`, `hub/analyses-board-cards.tsx`)
1. `AnalysesBoard` additive props: `groupBySource?: boolean`(2그룹 밴드), `candidates?: ExamCandidateRow[]`(자체 그룹 말미에 「분석 전」 카드), `onOpenCandidate?`, `activeCandidateId?`, `renderHint?: (row) => ReactNode`(카드 하단 힌트 줄). 허브 무변화.
2. 카드: INTERNAL 깊이 칩(SHALLOW=「심층 분석 전」 amber ring / DEEP=「심층 분석 완료」 emerald ring — 디자인 언어 v1 ring 문법) · boost RUNNING = `WorkbenchLoadingCard variant="analyzing"` 로 렌더(진행률 `boost.completed/total`, 상태 라벨 「AI 심층 분석 중」) · 힌트 줄 = `deriveExamNextStep(row).title`(11px slate-500, 1줄 truncate).
3. 후보 카드: 제목·「문항 N · 분석 전」 메타·상태 아이콘 칩(FileClock slate) · 클릭 = `onOpenCandidate`. 액션 버튼 없음(레일 정본).
4. 빈 그룹은 밴드만 남기지 않는다(그룹 자체 생략). 필터·검색은 그룹 관통.

### U5 우측 레일 (파일 소유: `workbench/analysis-detail-rail.tsx`, `analysis-rail/*` 전부, 신규 `analysis-rail/rail-journey.tsx`·`rail-next-step.tsx`)
1. 헤더 아래 **여정 스트립**(5칩: 분석·검수·학생·채점·리포트 — `StepChip` 시각 문법 미러: done 파랑 체크 / active 테두리 볼드 / pending muted. 296px 플로어에서 라벨 2자+아이콘) + **다음 단계 블록**(2급 slate-50 카드: title 13px semibold · description 12px · CTA h-10 rounded-lg blue-600 `text-[12.5px] font-bold` — `dossier-pick-bar.tsx:99-109` ACTION 토큰 미러, 과금 CTA 는 `RailConfirmButton` 2단 + 코스트 칩).
2. 후보(candidate) 선택 시 레일 = 제목·문항 N·[AI 분석 시작 · N cr](→ `fireBoostRequest` + 낙관 boost RUNNING 표시). 셸이 후보 선택을 들고 있어야 한다 → `analysisRailRow` 대신 `analysisRailTarget: {kind:"row",row}|{kind:"candidate",candidate}` 로 확장(셸 파일은 U6 소유이므로 **U5 는 `AnalysisDetailRail` props 로 `candidate?: ExamCandidateRow|null` 을 additive 받는 것까지**만 하고, 셸 배선은 U6 가 한다).
3. INTERNAL SHALLOW: 탭바는 유지하되 [총평] 탭 본문 상단이 다음 단계 블록(심층 분석 CTA)이고 점선 빈 상태는 삭제. boost RUNNING: 헤더 진행 바(기존 analyzing 미러) + "AI 심층 분석 중 k/N".
4. CTA 동작: review-gate → RailReviewSection 펼침(activeTab synthesis 유지) · add-students → students 탭 + 추가 패널 열림 · issue-answer-links → 콘솔 `issueAnswerLinksBulk(studentIds)`(enableAnswerLink 순차, 부분 성공 반환) 후 「이름\tURL」 클립보드 + 토스트 · confirm-grading → students 탭 + 첫 미확정 학생 아코디언 펼침 · generate-reports → 콘솔 `generateReportsBulk(ids)`(동시 2, 402 즉시 중단·잔여 배너) 2단 확인(총액 N×5cr) · share-reports → `enableExamReportShare` 순차 + 클립보드 · all-done → 전체 공유 링크 복사 · INTERNAL add-students → 안내 + 배포 화면 링크(`data-rail-escape-allowed`).
5. [정보] 탭 이하 기존 섹션 무접촉. 탈출구 게이트 §1-8.

### U6 「학생 관리」 5번째 뷰 (파일 소유: `source-switcher.tsx`, `studio-location.ts`, `library-pane.tsx`, `studio-home-client.tsx`, 신규 `workbench/students-pane.tsx`·`workbench/student-detail-rail.tsx`·`workbench/use-studio-students.ts`, 신규 액션 `src/actions/studio/student-exams.ts`)
1. `StudioAssetView` += `"students"` · `ASSET_VIEWS` 5번째 `{ key:"students", label:"학생 관리", Icon: Users }` · `viewCounts.students = studentCount`(클래스 학생 수, 셸에서 prop) · 플래그 게이트는 시험 분석과 동일(`ENABLE_EXAM_DEPLOYMENT`) 양쪽 · `STUDIO_ASSET_VIEWS` satisfies · 컴팩트 임계는 640 유지하되 G15b 5필 재실측을 게이트로(하네스 U7).
2. 셸: `studentsRailActive`(뷰당 1개 규약) · `rightPanelView` 사슬에서 analysis 다음 · `hasRightPanel`·`rightPanelLabel("학생 관리")`·드로어 라벨 분기 · `listActive` 음성 판정 유지(`!== "passages"` — students 뷰에서도 목록 fetch 2회 수용, E24 §1⑤). 선택 학생·후보 선택 상태는 셸 소유(`analysisRailTarget` §U5-2 포함).
3. 액션 `listStudioClassStudentExams(classId)`: 클래스 ENROLLED 학생 × `examReportStudent(studentId in, deletedAt null)` 조인 → 학생별 `{studentId,name,studentCode,grade,lastStudyAt, exams:[{analysisId,title,examType,sourceType,updatedAt, scoreSummary(total/max), gradingConfirmed, reportStatus, shareEnabled, shareToken, answerEnabled, answerToken, answerSubmittedAt}]}` + 학원 코드(초대 링크 조립용, `getStudioInviteKit` 재사용 가능). `requireStaffAuth`·클래스 소유 검증(`assertClassBelongsToAcademy` 관례).
4. 중앙 `StudioStudentsPane`: 툴바 = 지문관리와 동일 규격(아이콘 칩 `Users` · 「학생 관리 · 클래스 로스터」 브레드크럼 · ml-auto 검색 · [+ 학생 추가] 프라이머리 h-7). 상단 요약 스트립 1줄(학생 N · 리포트 완성 k · 공유 대기 m · 채점 대기 j — 칩). 목록 = 학생 행(이름·코드 mono·학년·최근 시험 점수·리포트 상태 뱃지·초대 [복사] 아이콘) — 흰 바탕 rounded border 패널, divide-y. 행 클릭 = 우측 학생 상세 레일(선택 하이라이트 blue-400 테두리). 학생 0명 빈 상태 = 안내 + [학생 추가]. 폴링 없음(뷰 진입·변이 후 재조회). `[+ 학생 추가]` = 레일에 인라인 추가 패널(기존 `student-add-modal.tsx` 의 검색+이름폼 로직을 **레일 인라인 폼**으로 이식 — 모달 사용 금지).
5. 우측 `StudentDetailRail`: 헤더(이름·학생코드 mono·학년) → 「초대」 블록(학원코드+학생코드 표시 · [초대 링크 복사] · [카카오 공유] — `StudentAppShareRow` 재사용, `buildStudentAppLoginUrl`) → 「시험 리포트」 그룹 리스트(밴드 헤더 + divide-y): 시험별 행(제목·점수·채점 뱃지·리포트 뱃지) + 행 액션(리포트 있으면 [공유 링크 복사]/[공유 끄기 2단] · 답안 링크 있으면 [답안 링크 복사] · [시험 분석에서 열기] = 셸 콜백으로 view=analysis 전환 + 해당 분석 선택 + students 탭 + 그 학생 아코디언 펼침) → 「클래스」 블록([클래스에서 제외] 2단 danger — `removeStudentFromStudioClass`). 페치는 셸 훅 `useStudioStudents`(aside·드로어 2중 마운트 규칙).
6. 시험 분석 레일 ↔ 학생 관리 상호 이동은 **뷰 전환 콜백 2종**(셸 소유)으로: `openStudentInStudentsView(studentId)` / `openAnalysisForStudent(analysisId, studentId)`.

### U7 하네스 (파일 소유: `.tmp-studio-analysis/probe-v4.mjs`, `tests/unit/exam-next-step.test.ts`)
게이트(전부 기계 판정 + 스크린샷): G1 **그룹 탭 2개**(26-09-03 개정) — 자구 「스모트 시험지」·「외부 시험지」 존재 + 구 자구 「자체 시험지」 부재 + 본문 마운트 정확히 1개 + 두 탭 실측 폭 차 ≤1px(반반) + 활성 탭 표식 1개, 외부 탭 클릭 시 외부 본문 마운트 · G2 INTERNAL SHALLOW 카드 선택 → 레일에 `[data-next-step="internal-deepen"]` + **레일 CTA 0개** + 중앙 도크 `[data-analysis-dock-cta][data-analysis-dock-kind="internal-deepen"]` 이 과금 표기와 **2단 확인**(1클릭 → 「한 번 더 누르면 N 차감」, 4s 자동 해제)을 든다(26-09-03 개정 — 「레일에 없다」만 보면 「아무 데도 없다」가 통과하는 공허한 게이트가 된다) · G3 후보 카드 `[data-analysis-candidate]` ≥0(0이면 note) · G4 여정 스트립 `[data-journey-step]` 5개 · G5 외부 ANALYZED 카드 → 레일 kind 가 review-gate|add-students|… 중 하나 · G6 학생 관리 필 `[data-asset-view="students"]` 클릭 → `[data-studio-students-pane]` + 행 ≥1 → 행 클릭 → `[data-student-rail]` + 초대 블록 · G7 모달 0(`[role=dialog]` 가시 0) · G8 탈출구 0(§1-8 셀렉터) · G9 4폭 오버플로 0(1600/1280/1100/900) · G10 `?view=students` reload 복원 · G11 5필 자연폭 실측(compact 임계 640 vs 실측) · G12(실 LLM, 1회) INTERNAL 5문항 심층 분석 fire → 카드 `.workbench-loading-card--analyzing` 관측 → 완료 후 [총평] 탭에 「난이도 프로필」 렌더 + funnel.depth DEEP. **G14(26-09-03) INTERNAL [원본] = 조판된 시험지**: 탭 존재 · `[data-rail-exam-sheet]` 마운트 · `[data-rail-exam-sheet-page]` 실측 높이 > 200px(스켈레톤·빈 상태와 구분) · `#exam-paper-print-root` **0개**(전역 인쇄 포털 누출 금지) · 탈출구 0 · 가로 오버플로 0.
음성테스트: `next-step.ts` 판정 1개를 고의로 깨고 G2/G5 가 RED 가 되는지 확인 후 복구. **26-09-03 실측**: ⓐ 도크의 2단 확인 분기를 죽이면 G2 가 「did NOT arm — one click may charge」로 RED(그 주입은 실제로 20cr 을 태웠다 — 주입 테스트는 과금 경로를 건드린다는 사실 자체가 기록) ⓑ 조판 지면 렌더를 죽이면 G14 가 높이 162 로 RED.

### U8 문서
- 이 파일 §0-b 진행표 갱신 · `docs/studio-exam-analysis-integration.md` §0-b 에 v4 행 1줄 · `docs/class-studio-spec.md` §3.10.29 신설(뷰 축 5필·학생 관리 계약 요지·탈출구 예외).

---

## 4. 디자인 언어(v1 계승 + v4 추가 어휘)

- 타이포 5단(10.5/11/12/13/15) · bold 금지(semibold 상한, **예외: 프라이머리 CTA `font-bold` — 기존 조판 버튼 토큰 그대로**) · 카드 2단(1급 white+shadow / 2급 slate-50) · 뱃지 `rounded-full + ring-1 ring-inset ring-*-200/60` · 신호등 emerald→blue→amber→rose · 섹션 밴드 `h-8 bg-slate-100`.
- **여정 스트립**: 5칩 가로 1줄, 칩 = `h-6 rounded-full px-2 text-[11px]`; done `bg-blue-50 text-blue-700 ring-blue-200/60`+체크 · active `bg-white text-slate-900 ring-2 ring-blue-500` · pending `bg-slate-50 text-slate-400 ring-slate-200/60`. 칩 사이 `›` slate-300.
- **다음 단계 블록**: `rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5`(유일 허용 투명도 = 배경 tint 1곳, 디자인 언어 v1 예외 명시) · 상단 라벨 「다음 단계」(관점에 따라 「학생 리포트 · 다음 단계」) 10.5px uppercase tracking-wider slate-400 · title 13px semibold slate-900 · **description 은 그리지 않는다**(26-09-04 사용자 지시 — 제목+CTA 로 충분, 부연 2줄은 도크 세로만 먹었다. 필드는 살아 있고 중앙 도크가 버튼 title 툴팁으로 쓴다) · CTA h-10 full-width.
- **글로우**: 진행 카드 = `WorkbenchLoadingCard variant="analyzing"`(orbit+sheen — 기존 큐 어휘). 레일 진행 바 = 기존 ANALYZING 바 재사용.
- 학생 관리 행 = `rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300`(레일 학생 행과 동일 개체), 선택 = `border-blue-400 shadow-[0_0_0_1px_rgba(96,165,250,0.55)]`(카드 선택과 동일).

---

## 5. 함정 원장(재발 금지 — 함대 필독)

- **aside/드로어 2중 마운트**: 레일·학생 레일의 페치는 셸 훅 1인스턴스만. 컴포넌트 로컬 prop 구동 effect 페치 금지(`use-analysis-detail.ts` 헤더).
- **keep-previous**: 재조회에 detail 을 null 로 비우면 백지 플래시. `patchDetail` 로 낙관 갱신.
- **scrollIntoView 금지**(조상 하이재킹) — 스크롤러 scrollTop 직접 보정.
- **`next build` 금지**(dev 실행 중) — 검증은 `npx tsc --noEmit`.
- **memo 방어선**: LibraryPane/SourceSwitcher 에 넘기는 prop 은 원시값 또는 안정 참조.
- **선지 정규화**: vision 경로 `normalizeChoiceToken` 은 1~5 전용 — 무접촉(내신 5지). 6지 이상은 INTERNAL 경로만(`normalizeChoiceTokenExtended`).
- **과금 라벨**: 코스트는 `CREDIT_COSTS` 만. 「N cr」 표기 = `RailConfirmButton` 코스트 칩 관례.
- **폴 서명**: 진행 중(boost RUNNING·ANALYZING)엔 `t${Date.now()}` 혼입으로 백오프 차단.
- **탈출구**: §1-8 예외 셀렉터 외 `a[target=_blank]` 금지.
- **URL 미러**: 뷰 추가 시 `STUDIO_ASSET_VIEWS satisfies` 가 컴파일 게이트. `listActive` 음성 판정 유지.
- **Prisma JSON 서브패스**: `hasExamLevel` 은 raw SQL — analysis 전체 select 는 egress 위반.
- **CRLF**: 리포는 혼재. 편집 도구는 파일 기존 개행을 따르고 `git diff --numstat` 로 줄바꿈만 바뀐 파일을 걸러낸다.

---

## 6. 진행표

| 단위 | 상태 |
|---|---|
| 스펙 착지 | 26-09-02 작성 |
| U3 공유 계약(타입·next-step·synthesis·fireBoostRequest·단위 테스트) | **감독 작성 완료(26-09-02)** — `use-exam-report-activity.ts`(funnel/candidates 타입+훅 옵션) · `next-step.ts` · `synthesis.ts` · `board-shared.ts fireBoostRequest` · `tests/unit/exam-next-step.test.mjs` |
| U1·U2·U4·U5·U6 | **구현 완료(26-09-02, 필살기 `wf_dfd848f2-f96` 6기·1.22M 토큰)** — tsc 0 · 단위 테스트 신규 3종(next-step 6·page-batching 8·funnel 6) 전부 초록 · 선재 실패 17건은 HEAD 워크트리 기준선에서 동일 재현(v4 무관: HWPX·코퍼스 무결성·어법 후처리 등). 함대 반박 채택 3: U1 청크 병합 order 는 (청크순, 청크 내 order) · U5 add-students CTA = 레일 인라인 추가 + 「학생 관리」 보조 링크 · U6 onOpenAnalysis 2번째 인자 = ExamReportStudent.id. 신규 모듈: `exam-page-batching.ts`·`exam-map-extract.ts`·`prompts-shared.ts`·`prompts-exam-map.ts`·`funnel.ts`·`analyses-board-{groups,candidate-card,progress-cards,toolbar,source-column}.tsx`·`analysis-rail/{rail-journey,rail-next-step,rail-next-step-actions,rail-candidate,rail-header,rail-primitives,rail-meta-tab,use-analysis-bulk}`·`students-pane.tsx`·`student-detail-rail(-add).tsx`·`students-shared.tsx`·`use-studio-students.ts`·`actions/studio/student-exams.ts`. 감독 추가 배선: `StudioAnalysisPane.classId`→`AnalysesBoard.currentClassId`(후보 「이 클래스 우선+나머지 접이」 축 — probe 1차 실측: 후보 30장 벽) · `data-next-step-title` |
| U7 하네스 | **probe-v4 G1~G11 ALL GREEN(1차)** · **G12 실 LLM ALL GREEN** — INTERNAL 5문항 「새 시험지 2026-07-24」: 발사→카드 글로우(`workbench-loading-card--analyzing`, 0/5)→레일 boost-running→**54s 완료**(gemini-3.7-flash, 5cr 차감 실측 995,057→995,052)→depth DEEP→[총평] 난이도 프로필·유형 분포·오답 설계 총평 실렌더→다음 단계 「공유 링크를 발급하세요 (1명)」로 전진. 계기 수리 1(보드 로딩 대기 없이 카드 탐색 → waitForFunction). 허브 무회귀: 그룹/칩/힌트/후보 0·페이지 에러 0 |
| 적대 검수→중재→수정→재검증 | **완료(26-09-02, `wf_5f29d5a6-2d1` 29기·6.5M 토큰·51분)** — 4렌즈×5단위+정합 1 = 발견 235 → 중재(근거 확인·근본원인 병합 9건·기각 129) → 지시 25+공유 6 → 수정 6기(근거 반박 5: 중재자의 SUP-U4-1 변형안 기각·아이콘 조건에 status 가드·오개념 자구 중복·실 LLM 재실행은 감독 몫) → 재검증 **tsc 0·단위 717/699(실패 17=선재 동일)·probe-v4 40/40 GREEN**. 주요 수리: 레거시(page 없는) 배치 이미지 예산 초과 회귀(12MB 총량 복원) · 페이지 창 미스 시 재분석이 같은 창을 반복하던 결함(전 페이지 폴백) · E1a 청크 1회 재시도 · boost 프롬프트 난이도 앵커 2벌 → 1벌 · Gemini 에서 무의미한 배치1 직렬 단계 제거 · 잡 생성 실패 시 RUNNING 게이트 잔류 수리 · 게이트 CAS 재시도 3회 · ARCHIVED 시험지 후보 제외 · 후보 「이 클래스 우선+나머지 접이」(SUP-U4-1) · focus 소비 경합 수리 · rail-source effect 무한 재시도 수리 · 후보 CTA 실패 시 영구 잠김 해제 · 하드코딩 5cr 3곳 제거 · 과금 CTA 프라이머리 승격 · INTERNAL SHALLOW 헤더 뱃지 「심층 분석 전」 · 학생 분류 술어 3벌 → `classifyFunnelStudent` 단일 · fire 헬퍼가 실패를 토스트+`exam-report:refresh` 이벤트로 폴 즉시 bump · `attachExamSources` 서버측 20p 상한+재업로드 시 page 초기화 · 학생 관리 로스터 갱신 누락 수리 · 액션 academyId 이중 게이트. 검수가 지적한 게이트 사각(vision 경로 무커버리지)은 G13 으로 메움 |
| **G12 재실행(수정 후 라우트)** | **ALL GREEN** — INTERNAL 3문항 「새 시험지 2026-07-06」 36s 완료(3cr) → 총평 → 다음 단계 「채점을 확인하세요 (1명)」 전진 |
| **G13 vision 실 LLM 게이트**(`probe-v4-vision.mjs`) | **ALL GREEN(26-09-02)** — 8페이지 2027학년도 6월 모평 영어 PDF 를 스튜디오 인테이크로 등록(클라 래스터라이즈 8슬롯) → ANALYZING 카드 글로우·레일 analyzing → **212s 완주**(문항 인식 ≈100s → 12/45 → 36/45 → 45/45) · examMap **45문항 전부 page 보유(1~8 전 페이지 분포)** · perQuestion **OK 45/45** · answerConfidence HIGH 44/LOW 1 · 호출 17회(E1a 2청크 + E1b 페이지 국소 배치 + 정합 게이트 + 종합) · prompt 77k/completion 31k 토큰 · 모델 google/gemini-3.7-flash · examLevel 결정론 버킷 합 = OK 수 · 근거 문장 인용 37/45 · 다음 단계 = 「정답·배점을 확인하세요 (0/45)」 + 검수 배너. 총평 실물: 「쉬움 26·보통 13·어려움 6 → 체감 '보통'… 반의·역방향 함정(21·30·33·40번) … 평가원 모의고사 변형 추정(18·29·31번 근거)」. 계기 함정 1(등록 토글 셀렉터 2개 중 숨은 것 선행 → visible 필터). 크레딧 실측 45cr. 참고: aiMeta.durationMs 는 마지막 라운드만 기록(선재 의미론) |
| U8 문서 | 이 표 + 통합 정본 §0-b + 스튜디오 스펙 §3.10.29 반영 |
| **잔여(후속 후보, 미착수)** | E1a 청크 진행률 표시 · E1a 실패 사유(`aiMeta.lastError`)+재추출 next-step kind · `ExamAnalysisStudentRow.shareToken` 노출로 벌크 공유의 학생별 GET 팬아웃 제거 · 학생 관리 → 시험 분석 역방향 훅 `openStudentInStudentsView` 배선 · synthOnly 레이트리밋 · 선재 단위 테스트 실패 17건(HWPX·코퍼스 무결성·어법 후처리 — v4 무관) · 실행 불가 `.test.ts` 17건 |

---

## 7. 리포트 2관점 분리 + 시험지 분석 리포트 공개 공유 (26-09-03~04)

### 7.1 지시·결정

사용자 지시 원문 요지(26-09-03): "[총평] 탭 아래 「리포트 생성 5cr」 버튼이 **리포트 공유** 버튼이 돼서 분석된 자료를 학생·학부모에게 공유하는 링크 생성·링크 복사·카톡 등 공유 기능이 있어야 한다. [학생] 탭에서 **학생 리포트 생성**이 나와야 한다. 리포트는 2개의 관점 — 시험지 자체를 분석한 것도 리포트, 학생이 시험을 치른 다음 분석한 것도 리포트 — 둘을 잘 구분해라."

| 관점 | 축(DB) | 공개 라우트 | 과금 | 레일 자리 |
|---|---|---|---|---|
| ① **시험지 분석 리포트** — 총평·난이도·유형·오답 설계·출제 범위·문항별 | `ExamAnalysis.shareToken/shareEnabled/sharedAt`(신설) | `/r/exam/[token]` | 없음(분석이 곧 리포트 — 공유만) | [총평]·[문항]·[원본]·[정보] 탭 도크 = `RailExamShareBlock` + 본문 캡션 「시험지 분석 리포트」 |
| ② **학생 리포트** — 학생이 치른 뒤 채점·상담 | `ExamReportStudent.shareToken…`(기존) | `/r/[token]`(기존) | 생성 학생당 `CREDIT_COSTS.EXAM_STUDENT_REPORT` | [학생] 탭 도크 = 기존 퍼널 블록(아이브로우 「학생 리포트 · 다음 단계」) + 본문 캡션 「학생 리포트」 |

- 도크는 한 블록만 들므로 **활성 탭이 관점을 고른다**. 판정은 `next-step.ts resolveRailDockPerspective(step, activeTab)` 하나: `journeyStep analyze|review` → 탭 무관 퍼널(진행률·검수 CTA — 시험지가 아직 공개할 상태가 아님) · 그 뒤 → `students` 탭 = 퍼널, 그 외 = 공유 블록. UI 에 이 판정을 복제하지 않는다(§1-3 규약).
- 퍼널 자구에 「학생 리포트」를 박았다(`generate-reports` 「학생 리포트를 생성하세요 (N명)」/CTA 「학생 리포트 생성」 · `reports-generating` 「학생 리포트 생성 중」 · `share-reports` 「학생 리포트 공유 링크를 발급하세요」). 카드 힌트 줄도 같은 함수라 같이 바뀐다.

### 7.2 데이터 지층 — **prod ALTER 선행 → 배포 순서(사용자 승인 대상)**

- `prisma/schema.prisma` ExamAnalysis 에 `shareToken String? @unique · shareEnabled Boolean @default(false) · sharedAt DateTime?`.
- SQL: `prisma/migrations/manual/20260903_exam_analysis_share.sql`(ADD COLUMN IF NOT EXISTS ×3 + UNIQUE INDEX IF NOT EXISTS — 전부 additive, 재실행 안전). 적용: `npx prisma db execute --file prisma/migrations/manual/20260903_exam_analysis_share.sql`.
- **26-09-04 실측: `.env.local` DB(Supabase pooler = prod 공용)에 컬럼 없음(`information_schema` 조회 `[]`)** — 적용 전에는 상세 GET(`analyses/[id]`) 이 3컬럼 select 로 P2022 를 내 레일 전체가 「불러오지 못했습니다」가 된다. 코드 배포보다 ALTER 가 먼저다.
- 서버액션 `src/actions/exam-report/share.ts`: `enableExamAnalysisShare(analysisId)`(status `ANALYZED` 만 · 기존 토큰 재사용 · P2002 3회 재시도) / `disableExamAnalysisShare`(토큰 회수 rotate). barrel `index.ts` 재노출.
- 상세 API `api/exam-report/analyses/[id]/route.ts` select 3컬럼 → `ExamAnalysisDetail.shareToken/shareEnabled/sharedAt`(ui-contracts). 낙관 반영 채널 `AnalysisConsoleApi.patchDetailAnalysisShare`(학생 축 `patchDetailStudent` 와 별개).

### 7.3 공개 라우트 `/r/exam/[token]`

- `page.tsx`(서버·force-dynamic·noindex·무인증) → `exam-public-content.tsx`(본문) + `exam-public-question-card.tsx`(문항 카드) + `exam-public-shared.ts`(계약 타입·토큰). `/r/[token]` 의 `ReportPrintButton`·`.er-public-print-hide` 관례 재사용, 서체 Pretendard 를 같은 로더(`ensureReportFonts`)로 실로드.
- 게이트: `shareToken` + `shareEnabled` + `deletedAt null` + `status ANALYZED`. 학생 데이터는 **0건** 직렬화(학생 행은 정답 공개 승계 판정용 존재 여부 1건 `take:1` 만).
- **정답 공개 규칙**: INTERNAL = 전부 공개(시험지 확정값) / 외부 = `getMapGateStatus` 열림이면 전부, 아니면 `reviewState.mapConfirmedNumbers` 문항만. 비공개 문항은 「정답 검수 중」 칩 + 상단 안내(N문항). 레일 공유 블록도 게이트 미완이면 이 사실을 amber 1줄로 예고한다.
- 본문: sticky 목차 → 표지(제목·메타 칩·지표 4: 문항/총점/유형/어려움·킬러) → 01 총평 → 02 난이도 프로필(세그먼트 바 + 버킷별 번호) → 03 유형 분포(랭킹 바 + 번호) → 04 오답 설계 → 05 출제 범위 → 06 문항별(번호·유형·난이도 칩·배점·정답 · 출제 포인트·개념 칩·난이도 5눈금+근거·접근 전략·접이[오답 함정 N개 / 상세 해설+출제 의도]). 인쇄 `beforeprint` 에 접이 강제 펼침, 카드 `break-inside: avoid`.

### 7.4 레일 변경(`analysis-rail/*`)

- 신설 `rail-exam-share-block.tsx`: 꺼짐 = 아이브로우 「시험지 분석 리포트」+제목 「학생·학부모에게 공유하세요」 + 프라이머리 CTA 「리포트 공유 링크 만들기」(무과금 — 켜면서 링크 자동 복사) / 켜짐 = **머리말 3줄 없이**(26-09-04 사용자 지시 「이 섹션은 필요 없어」 — 링크·버튼이 이미 상태를 말하고 설명은 도크 세로만 먹었다. 관점 이름은 탭 본문 첫 줄 관점 캡션이 든다) 링크 input(truncate) + [복사] · 2열 grid [카카오톡] + [다른 앱으로](`navigator.share` 지원 기기만, 아니면 [미리보기]) · 「새 탭에서 미리보기」(`data-rail-escape-allowed` — §1-8 예외에 편입: 공개 링크 확인은 원본 사진 열람과 같은 파일 열람급) · [공유 끄기] 2단 danger. 낙관 반영 `patchDetailAnalysisShare`.
- 신설 `rail-perspective-caption.tsx`: 탭 본문 첫 줄 관점 캡션(`data-rail-perspective="exam"|"students"`).
- `analysis-detail-rail.tsx`: 도크 분기 + `eyebrow` + 캡션 2곳. 500줄 상한을 넘겨 `RailNextStepDock`·`AnalysisRailEmpty` 를 `rail-shell-parts.tsx` 로 분리(`AnalysisRailEmpty` 는 셸 호환용 re-export).
- `rail-next-step.tsx`: `eyebrow` prop(기본 「다음 단계」) · **설명 문단 렌더 삭제**(26-09-04, §4 참조 — 남는 골격은 아이브로우→제목→진행 바→CTA→note→보조 링크).
- `components/growth/kakao-share-button.tsx`: `title/description/buttonTitle/label/iconClassName/recordMission` prop 추가(기본값 = 종전 추천 카드·미션 보상 기록 유지). 공유 블록은 리포트 자구 + `recordMission={false}`.

### 7.5 셀렉터 계약(프로브)

`[data-exam-share-block][data-exam-share-state=on|off]` · `[data-exam-share-cta]` · `[data-exam-share-url]` · `[data-exam-share-copy]` · `[data-exam-share-more]` · `[data-exam-share-preview]`(+`data-rail-escape-allowed`) · `[data-exam-share-off]` · `[data-rail-perspective=exam|students]` · 공개 페이지 `[data-xp-section=overview|difficulty|types|traps|scope|questions]`.

### 7.6 검증(26-09-04)

- `npx tsc --noEmit` 0 · eslint 0 error(선재 warning 5 = route.ts 언더스코어 변수) · 단위 `exam-next-step.test.mjs` **11/11**(신규 2: 도크 관점 10케이스 · 퍼널 자구).
- `probe-v4.mjs` G15 추가(공유 블록 존재·관점 캡션 2·탈출구 0·[학생] 탭 전환 시 퍼널 블록) — **미실행**(dev 서버 미기동 + DB 컬럼 미적용 선행). G5 는 공유 블록이 보이면 [학생] 탭으로 옮겨 kind 를 읽도록 수정(안 그러면 kind=null 로 가짜 RED).
- 실 브라우저·카카오·`navigator.share`·인쇄는 **사용자 테스트 대기**.

### 7.7 함정·잔여

- `ExamAnalysisDetail.sourceType` 유니온에 `INTERNAL` 이 없다(tsc TS2367) — INTERNAL 판정은 요약 행 `row.sourceType` 소관, 블록은 `isInternal` prop 으로 받는다.
- 단위 테스트의 「여정 칸」 루프는 `summary*` 접두 키만 스텝 아닌 케이스로 건너뛴다 — 스텝이 아닌 케이스를 추가할 땐 키에 `summary` 접두(어기면 `Object.entries(undefined)` 로 죽는다).
- `next-step.ts` 626줄(선재 600+ 에 판정 함수 1개 추가) — 분할 후속 후보.
- 학생 리포트 `SharePanel`·`rail-student-expand` 의 카카오 카드는 여전히 **추천 카드 자구+미션 보상 기록**(선재) — 리포트 자구 + `recordMission={false}` 로 전환 후속.
- 잔여: 공개 페이지 OG 이미지 · 공유 열람 계기 · 링크 만료/비밀번호 · `학생 관리` 뷰에 시험지 분석 공유 상태 노출.

---

## 8. 채점 확정 막다른 길 해소 + 정답 노출 + OMR 링크 (26-09-04)

### 8.1 실측된 결함 — 「채점 확인」은 **누를 수 없는 절차**였다

사용자 질문("이 채점 확인이라는 절차가 뭘까? 필수적인 절차야?")에서 출발해 실측:

| 시험지 | 문항 | 자동 확정 | 사유 |
|---|---|---|---|
| 2026-07-11 | 20 (전부 MC) | ✅ | `unknownCount 0` |
| 2026-07-24 | 5 (전부 MC) | ✅ | `unknownCount 0` |
| 2026-07-10 | 8 (전부 MC) | ✅ | `unknownCount 0` |
| **2026-07-06** | 3 (MC 2 + **ESSAY 1**) | ❌ | **`unknownCount 1`** |

- `gradingConfirmed` 는 리포트 생성의 **서버 게이트**다(`students/[studentId]/generate/route.ts` → 400 `NOT_CONFIRMED`). 점수가 학부모 문서에 실리므로 API 직접 호출도 막는다.
- INTERNAL 은 `report-bridge` 가 `gradingConfirmed = scoreSummary.unknownCount === 0` 으로 **자동 확정**한다 → 객관식만 있는 시험은 이 단계가 아예 안 보인다.
- **결함 3중**: ① 자체 시험지의 서술형(`MANUAL_ONLY` → `kindOf` ESSAY)은 자동 채점이 영원히 UNKNOWN ② 그런데 레일 편집기가 `gradingEditable = !isInternal && …` 로 **INTERNAL 편집을 잠갔다** → 손댈 방법이 레일에 없음 ③ 그 상태에서 안내문은 "정오를 입력하고 [채점 확정]을 누르면"이라고 **존재하지 않는 조작**을 지시. 결과: 「채점을 확인하세요 (1명)」 영구 고착 = 리포트 생성 불가.
- 부수 결함: `examMap` 은 서술형 정답을 **의도적으로 비워 둔다**(`internal-analysis.structureCorrectAnswer` MANUAL_ONLY → `undefined`, "모범답을 지도에 싣지 않는다"). 그래서 화면에 정답이 없어 대조 채점 자체가 불가능했다(사용자 지적 "정답이 뭔지를 보여줘야 채점 확인이 가능할 거 아니야"). 모범답안은 문항 뱅크에 실재한다 — 실측 `Q3.correctAnswer="(A) confusing the wind's flow pattern along the building's surface"` + `structuredData.blanks[].acceptableVariants` 2건.

### 8.2 근본 수리 — 브리지 「강사 확정 보존 병합」

INTERNAL 편집 잠금의 원래 근거는 「재동기화가 수동 편집을 덮어쓴다」였고, 그건 사실이었다(`syncSubmissionToReport` 가 `responses` 를 통째로 교체). 그 뿌리를 먼저 없앴다.

- 신설 `internal-analysis.mergePreservingReviewed(machine, existing)` — 축은 machine(현 할당 문항), 그 위에서 기존 행이 `reviewed === true` 면 **기계 판정 대신 그 행을 보존**(정오·부분점수·메모·학생답 원문). 학생 제출 경로의 최고 불변식(`answer-entry.applyAnswerSubmission`)을 브리지에도 같은 규칙으로 적용. `report-bridge` 가 재수출.
- 순수 함수 → 단위 테스트 `tests/unit/report-bridge-preserve-reviewed.test.mjs` **4/4**(보존·갱신·축·번호표기·참조 패스스루).

### 8.3 UI 5건

1. **INTERNAL 채점 편집 해금** — `gradingEditable = reportStatus !== "GENERATING"`(전 워크스페이스 `verdict-board` 는 애초에 잠그지 않았다 — 레일만 어긋나 있었다).
2. **정답 노출**(지시 ①) — 선택 문항 상세에 발문(brief) + `학생 답 ↔ 정답/모범답안` 대조 + 허용 변형(≤4). 정답 2소스: `examMap.correctAnswer` 우선, 없으면 **INTERNAL 문항 원문**(`api.reviewQuestions.items[number].correctAnswer`, 셸 소유 dedup 페치 재사용 — 미채점이 남아 있을 때만 `ensureReviewQuestions()`).
3. **확정 버튼을 문항 근처에**(지시 ②) — 타일 상세 하단 액션 줄: `[다음 미채점 N번 →]` / `[채점 확정]`(미채점 0일 때만 활성). 타일 위에 「채점 필요 N문항 · n,m번 — 자동 채점되지 않았습니다」 amber 스트립.
4. **부드러운 시선 이동**(지시 ③) — 도크 CTA → `focusStudent(studentId, questionNumber)` → 학생 탭·아코디언 펼침·해당 타일 자동 선택 + 1.8s 링 펄스. 번호를 호출부가 모르면(첫 클릭, 학생 단건 미로드) **아코디언이 첫 미채점 문항으로 떨어뜨린다** — 2클릭 방지. 포커스 수신은 **렌더 중 전이 판정**(effect 직접 setState 금지 — `react-hooks/set-state-in-effect`).
5. **OMR 답안 링크 존**(사용자 요청) — 종전 비INTERNAL 전용 → **전 분석 공통**. 링크 input + [복사] + **[카카오톡 전송]**(리포트 자구·미션 보상 기록 없음) + [링크 끄기]. 안전 근거 2겹: 확정(reviewed) 행은 학생 제출이 못 덮고, 확정 후엔 `/a` 가 읽기전용(`locked`). INTERNAL 이고 이미 제출한 학생에겐 "확정하지 않은 문항만 갱신됩니다" 안내.

### 8.4 도크 CTA 재정의

사용자 지시("이 버튼은 그 학생 리포트 생성 기능이 되어야"): `confirm-grading` 의 title 「학생 리포트를 생성하세요 (N명)」 · CTA 「학생 리포트 생성」 · **과금 칩 없음**(이 단계의 클릭은 차감이 아니라 이동) · note 「N번이 자동 채점되지 않았어요 — 누르면 해당 문항으로 이동합니다」.

### 8.5 파일 분할(500줄 상한)

`rail-student-expand.tsx` 1049줄 → 582 + `rail-grading-tiles.tsx`(362, VerdictTiles) + `rail-student-links.tsx`(196, 공유·OMR 존).

### 8.6 검증(26-09-04)

`npx tsc --noEmit` 0 · eslint 0 error(warning 3 = 선재) · 단위 `exam-next-step` 11/11 + `report-bridge-preserve-reviewed` 4/4 · 전체 스위트 실패 18건은 **전부 선재**(HWPX·코퍼스 무결성·어법 후처리·landing-demo·suneung — 이 작업 무관). 브라우저 실동작(서술형 확정 → 리포트 생성 → 공유, 카카오 전송)은 **사용자 테스트 대기**.

### 8.7 함정·잔여

- `gradingConfirmed` 는 **리포트 생성의 유일한 서버 게이트**다 — UI 에서 우회 경로를 만들지 마라.
- 브리지는 `reviewed` 행만 보존한다. 강사가 **저장만 하고 확정하지 않은** 초안(reviewed=false)은 재동기화에 덮인다(의도 — 확정이 곧 서명).
- 학생 개인 리포트 공유(`SharePanel`·`rail-student-links` 공유 존)의 카카오 카드는 여전히 추천 자구+미션 기록(선재) — 리포트 자구 전환 후속.
- `analysisId` prop 미사용 경고(선재) · `next-step.ts` 626줄 분할 후속.

---

## 9. 레일 탭 3개로 축약 (26-09-04)

사용자 지시 2건:

1. **[정보] 탭 폐기** — "이 정보 탭은 불필요한 것 같아". 학교·학년·시험·시기·등록일은 왼쪽 목록 카드가 이미 말하고, 검수 완료 emerald 칩은 「미완일 때만 뜨는 배너」로 충분하다. `rail-meta-tab.tsx` **삭제**.
   ⚠ 단, 상세가 없는 상태(ANALYZING·DRAFT·FAILED)의 `MetaBlock` 폴백은 **유지**한다 — 그건 탭이 아니라 본문이 빌 때의 대체물이다(지우면 분석 중 레일이 백지가 된다).
2. **[문항] → [총평] 합류** — "이 문항 탭은 사실 내용이 총평 안에 있어야 할 것 같아". 시험지 한 장을 보는 관점이 집계(총평·난이도·유형)와 개별(문항 카드)로 갈려 탭 순례가 생겼다. 이제 같은 스크롤 위에서 위→아래로 잇는다: 관점 캡션 → 총평 프로즈 → 난이도/유형 차트 → 오답 설계 → 출제 범위 → **밴드 헤더 「문항별 분석 N문항」** → 필터 칩 + 문항 카드 목록.

결과: **3탭 = [총평] [학생] [원본]**.

- `RailSectionKey` 를 `"synthesis" | "students" | "source"` 로 **좁혔다** — 사라진 탭으로 `setActiveTab` 하는 코드가 남으면 컴파일이 실패하는 게이트다(문자열 유니온을 넓게 두면 죽은 탭 전환이 조용히 남는다).
- `resolveRailDockPerspective`(§7)의 규칙은 그대로다: `students` 탭이면 학생 리포트 퍼널, 그 외([총평]·[원본])면 시험지 분석 리포트 공유. 단위 테스트의 탭 케이스도 `"questions"` → `"source"` 로 갱신(없는 탭을 테스트하지 않는다).
- 검증: tsc 0 · eslint 0 error · `exam-next-step` 11/11.

---

## 10. [학생] 탭 = 클래스 로스터 전원 + 링크 발송 (26-09-04)

### 10.1 실측된 결함

사용자 지적: "이 클래스에는 학생이 2명인데, 이 시험 목록에 학생은 김연주밖에 없어?" → "당연히 저 학생 목록에는 해당 클래스의 모든 학생이 보여야지. 그리고 그 학생들에게 해당 시험지 링크를 보낼 수 있도록 해줘야 하는 거라고."

실측(2학년 × 새 시험지 2026-07-06):

```
CLASS 2학년   김주연(K4K5CR) · ㄴㅇㄹ(BHAGBJ)        ← 로스터 2명
EXAM          classId 없음 · status DRAFT            ← 클래스에 배포된 적 없음
SUBMISSION    김연주(cmpavfoiq…) SUBMITTED 07-11     ← 로스터 2명과 **다른 학생**
```

- [학생] 탭은 `ExamReportStudent`(응시·등록된 학생)만 그렸다. 자체 시험지는 **응시가 곧 등록**이라, 아직 안 본 학생은 화면에 존재하지 않았고 → 링크를 보낼 대상조차 고를 수 없었다(닭-달걀).
- 게다가 `assertStudentAddAllowed` 가 INTERNAL 의 **모든** 수동 추가를 막고 있어(「배포·응시가 자동 등록합니다」) 레일에서 손쓸 방법이 0이었다.
- 별개 사실: 분석 목록은 `academyId` 로만 거른다(`exam_analyses.classId` 컬럼 자체가 없음 — S1 미착수). 그래서 2학년을 골라도 학원 전체 분석이 보인다. **이번 작업 범위 밖**(별도 원장 항목).

### 10.2 서버

1. `assertStudentAddAllowed(analysisId, academyId, mode)` — `mode`(신설) `"freeform" | "roster"`.
   · freeform(이름만 만드는 행) = INTERNAL 계속 **금지**: 로스터 귀속이 없어 나중에 그 학생이 앱으로 응시해도 같은 사람인지 알 방법이 없다 → 두 줄·이중 계상.
   · roster(studentId 귀속) = INTERNAL **허용**. 중복 위험은 브리지에서 제거했다(아래 2).
   · **INTERNAL 은 검수 게이트 예외**(구조상 열림 — funnel.ts·next-step.ts 와 같은 규칙). 이 예외가 없으면 학생 0명 자체 시험지에서 존재하지도 않는 검수를 요구하며 링크를 막는다.
2. `report-bridge.syncSubmissionToReport` 기존 행 조회 **3축**: ①`submission.examReportStudentId` ②`examSubmissionId` ③**`(examAnalysisId, studentId)`**(신설). 강사가 응시 전에 담아 둔 로스터 행에 나중 응시 결과가 **얹힌다** — 같은 학생·같은 시험 = 리포트 1장.
3. 신설 액션 2개(`students.ts`):
   · `listExamClassRoster(analysisId, classId): ExamRosterEntry[]` — 클래스 ENROLLED×ACTIVE 로스터 + 이 분석의 `reportStudentId`(없으면 미응시). 학원 이중 게이트.
   · `issueExamAnswerLinkForRoster(analysisId, rosterStudentId)` — **담기+링크 발급을 한 호출로**(강사에겐 「이 학생에게 시험지 보내기」가 한 동작이다). 멱등: 이미 담긴 학생은 그 행 재사용, 토큰 있으면 재사용해 켜기만.

### 10.3 UI

- 신설 훅 `use-analysis-roster.ts` — 셸 소유(2중 마운트 방어), 키 `${analysisId}::${classId}` 1회 dedup, **리셋 effect 없이 노출 산식으로 교차 오염 차단**(`use-studio-students` 관례).
- 신설 `rail-roster-section.tsx` — [학생] 탭 하단 「아직 응시하지 않은 학생 N명」 그룹: 행마다 이름·학생코드 + **[링크 보내기]**(발급 즉시 클립보드 복사), 상단에 **[전원 링크 발급 · 표 복사]**(순차·부분 성공 숫자 보고). 발급 직후 인라인 패널에 링크 + [복사]·[카카오톡 전송](리포트 자구·미션 기록 없음) — 목록이 갱신돼 행이 「등록됨」으로 올라가도 링크를 다시 찾지 않게.
- `classId`·`className` 은 셸(`selectedClassId`) → `AnalysisDetailRail` → `RailStudentSection` 으로 내린다.
- 등록 0명 빈 상태 카드는 **로스터도 비었을 때만** 띄운다(빈 상태 2겹 방지).

### 10.4 검증(26-09-04)

- tsc 0 · eslint 0 error(warning 3 = 선재).
- 실데이터 재현(읽기 전용): 2학년 × 07-06 → 등록됨 `["김연주"]` · 미응시 `김주연(K4K5CR)`, `ㄴㅇㄹ(BHAGBJ)` = **링크 보내기 대상 2명**. 화면 기대치와 일치.
- 브라우저 실동작(링크 발급→학생 입력→자동 채점→목록 이동)은 **사용자 테스트 대기**.

### 10.5 함정·잔여

- 브리지 3축 조회의 부수효과: 같은 학생이 같은 시험에 **재응시**하면 종전엔 행이 2개였는데 이제 1개로 수렴한다(마지막 제출이 반영). 「학생 1명 = 리포트 1장」 규약과는 일치하지만, 재응시 이력을 두 행으로 보던 화면이 있다면 확인 필요.
- 분석 목록의 **클래스 필터는 여전히 없다**(S1) — 다른 클래스 시험지를 열어도 지금 선택된 클래스의 로스터가 「미응시」로 뜬다. 의도된 동작(선택 클래스에게 보내는 것)이지만, S1 이 들어오면 분석 자체를 클래스로 가르는 게 맞다.
- 자체 시험지의 정식 응시 경로(앱 배포)는 그대로다 — OMR 링크는 **답안 회수** 수단이지 배포 대체가 아니다.

---

## 11. 도크 = 액션 바 (26-09-04)

사용자 지시: "이 버튼만 남기고 나머지 다른 것들 좀 정리해." (가리킨 것: `data-next-step-title` 「학생 리포트를 생성하세요 (3명)」)

- **CTA 가 있으면 버튼 하나만** 그린다. 걷어낸 것: 아이브로우(「학생 리포트 · 다음 단계」)·제목·진행 바·note·보조 링크·껍데기 카드(blue tint).
  껍데기까지 벗기는 이유: 도크 자체가 이미 border-top + 흰 바닥 + 위로 뜨는 그림자를 가진 표면이라, 그 위에 tint 카드를 또 올리면 상자-속-상자가 된다.
- **정보는 사라지지 않았다** — 제자리에 이미 있다: 관점 이름 = 탭 본문 첫 줄 관점 캡션 · 미채점 문항 안내 = 학생 아코디언 amber 스트립(§8) · 진행률 = 헤더 진행 바·카드 힌트 줄.
- **CTA 가 없는 kind 는 예외**: `analyzing`·`boost-running`·`reports-generating`, 그리고 CTA 가 중앙 도크로 이사한 분석 계열(`internal-deepen`·`retry-failed`·`resume-draft`)까지 비우면 도크가 빈 상자가 된다 → 그 경우에만 제목 1줄 + 진행 바 + note 를 카드로 남긴다.
- 제거된 props: `eyebrow`(§7 에서 추가했던 것)·`secondary`. `RailNextStepSecondary` 타입과 액션 훅의 `secondary` 산출은 계약으로 남겨 뒀다(되살릴 때 그대로 쓰면 된다) — 주석으로 「현재 미렌더」를 명시.
- 검증: tsc 0 · eslint 0 error · 단위 15/15.

---

## 12. 도크 규격 통일 + 공유 블록 정리 (26-09-04)

### 12.1 두 도크 CTA 높이 — **실측이 가설을 뒤집었다**

지시: "이 두 버튼 높이를 동일하게 해줘"(중앙 「AI 분석 시작」 vs 레일 「학생 리포트 생성」).

Playwright 실측(1600×1000, `smoat-large-ui` 켜짐):

| | 버튼 높이 | 폰트 | 바 높이 | 바 패딩 |
|---|---|---|---|---|
| 중앙 도크 | **52px** | 17px | 77px | `px-5 py-3` |
| 레일 도크 | **52px** | 16px | 75px | `px-3 pb-3 pt-2.5` |

**버튼 자체는 이미 같았다**(둘 다 `h-10` → `height:2.5rem`, 대형 UI 모드에서 `min-height:3.25rem !important` = 52px). 어긋나 보인 실체는 ① **바 세로 패딩 2px 차이**로 두 CTA 의 윗선이 밀린 것 ② **폰트 16 vs 17px**.

수리: 레일 도크 바 `pb-3 pt-2.5` → **`py-3`**(중앙과 동일) · 레일 CTA 토큰 `text-[12.5px]` → **`text-[13px]`**(중앙 `BUTTON_BASE` 와 동일). 이제 두 바·두 버튼이 같은 규격이다.

> 교훈: 높이 어긋남을 보면 버튼부터 고치기 쉬운데, 여기선 **버튼이 무죄**였다. 대형 UI 모드가 `h-*` 를 `min-height` 로 덮어쓰므로 클래스만 읽고 판단하면 틀린다 — 실측이 정답.

### 12.2 공유 블록(켜짐) 정리

- **[공유 끄기] 제거**(지시). `disableExamAnalysisShare` 서버액션은 계약으로 남기되 화면에 노출하지 않는다 — 되살릴 땐 이 블록에 다시 달면 된다. 클라의 죽은 핸들러·import 는 함께 걷어냈다(dead code 금지).
- **[미리보기]를 [복사] 왼쪽 버튼으로** 승격(지시). 구 하단 텍스트 링크는 폐기. 새 탭 예외 셀렉터(`data-rail-escape-allowed`·`data-exam-share-preview`)는 그대로 — §1-8 예외 목록 불변.
- 전송 줄은 `navigator.share` 지원 여부에 따라 2열/1열로 갈린다(미지원 기기에서 빈 칸이 남지 않게).

결과 골격(켜짐):

```
[ https://…/r/exam/…    ] [미리보기] [복사]
[ 카카오톡 ]  [ 다른 앱으로 ]
```

- 검증: tsc 0 · eslint 0 error · 단위 15/15.

---

## 13. 카드 상태 표기 문법 통일 (26-09-04)

사용자 지적: "둘 다 심층 분석 전인데 왜 생긴 게 다르지?"(후보 「새 시험지 2026-08-27」 vs 분석 행 「새 시험지 2026-07-10」)

### 13.1 실체 — 상태는 실제로 달랐고, **표기 문법이 그 차이를 가렸다**

| | 후보 카드 | 분석 행 카드(SHALLOW) |
|---|---|---|
| 데이터 | INTERNAL **분석 행 자체가 없음** | 분석 행 있음 + 기본 분석(합성) 완료, 심층만 없음 |
| 상태 표기 | 메타 **문자열**에 박힘(`중간고사 · 문항 6 · 분석 전`) | **칩**(`심층 분석 전` amber) |
| 아이콘 | FileClock slate | FileClock amber |
| 삭제·집계 | 없음(지울 행이 없다·집계 대상 없음) | 있음 |

즉 「분석 전」 ≠ 「심층 분석 전」이 맞는데, 한쪽은 텍스트·한쪽은 칩이라 **같은 줄이 서로 다른 문법**이 됐다. 카드가 달라 보인 진짜 원인은 데이터 차이가 아니라 이 문법 불일치다.

### 13.2 수리

- `board-shared.ts` 에 **공용 토큰** 신설: `BOARD_CHIP_CLASS` + `ANALYSIS_STATE_CHIP`(`none` slate / `SHALLOW` amber / `DEEP` emerald — 신호등 어휘 §4).
- 후보 카드: 메타에서 「분석 전」 문자열을 빼고 **칩**으로 올렸다(`data-analysis-depth="NONE"`). 메타는 「중간고사 · 문항 6」.
- 분석 행 카드: 인라인으로 쓰던 칩 자구·색을 공용 토큰으로 교체(색을 두 곳에 쓰지 않는다).
- 결과: 두 카드가 **같은 골격**이 된다 — `[아이콘] 제목 [삭제?]` / `메타 + 상태 칩` / `집계 + 시각` / `힌트 줄`. 아이콘 색·칩 색·힌트가 같은 말을 한다.
- 남는 차이는 **데이터 차이뿐**: 후보엔 삭제 버튼(지울 분석 행이 없다)과 학생·리포트 집계(대상 없음)가 없다.
- 검증: tsc 0 · eslint 0 error.

---

## 14. 「기본 분석」 용어 정리 + 후보 레일 백지 해소 (26-09-04)

### 14.1 「기본 분석」은 **거의 쓰이지 않는 말이었다**

사용자 질문: "기본 분석이라는 건 쓰이는 개념이야?"

전수 확인 결과 시험 분석 도메인에서 그 말이 화면에 나오는 곳은 **아이콘 툴팁 1곳**(`BASIC_ANALYSIS_VISUAL.label`, `title`/`aria-label`)뿐이었다. 정작 칩은 「심층 분석 전」, 힌트 줄은 「AI 심층 분석이 아직 없습니다」라고 말한다 — 같은 상태를 세 이름으로 부른 셈(코드 주석은 "아이콘·깊이 칩·힌트가 같은 말을 한다"고 적어 뒀지만 label 이 그 약속을 깨고 있었다). 툴팁을 **「심층 분석 전」**으로 통일했다.

개념 자체(설명이 필요할 때의 정의):

| | 기본(합성) | 심층(boost) |
|---|---|---|
| AI 콜 | **0** | 문항 8개/배치, 정답은 전제로 제공 |
| 과금 | 0 | `CREDIT_COSTS.EXAM_ANALYSIS_BOOST` × 문항 수 |
| 해설·전략 | 출제 시 저장된 `QuestionExplanation`(content/keyPoints) 이관 | LLM 이 새로 작성 |
| 의도·포인트 | **유형 메타 문구**(유형 차원 사실 서술) | 문항 개별 분석 |
| 오답 함정 | 저장된 오답 해설만, 매력도 **2 고정** | 선지별 why + 매력도 1~3 |
| 시험 총평(examLevel) | **null**(합성 근거 없음) | 생성 — 난이도 프로필·유형 분포·오답 설계·출제 범위 |

`depth` 판정 기준은 하나다 — **examLevel 유무**(`funnel.computeDepth`).

### 14.2 후보 레일이 **문자 그대로 빈 div** 였다

사용자 지적: "그 기본 분석 전에는 왜 오른쪽 탭에 애초에 아무것도 표시조차 안 돼. 시험지 원본, 학생들 그런 아무것도 없다는 소리야."

`RailCandidateView` 본문은 `<div className="min-w-0 px-3 py-3" />` — 헤더·여정·도크만 있고 내용이 0이었다. 분석 결과가 없다는 건 맞지만, **분석과 무관하게 이미 존재하는 두 가지**는 크레딧을 쓰기 전에 봐야 할 것들이다:

- **[원본]** 조판된 시험지 — `ensureExamSheet` 의 키가 애초에 `examId` 라 분석 행 없이도 조회된다(`RailExamSheetSection` 그대로 재사용).
- **[학생]** 클래스 로스터 + **[링크 보내기]** — 아직 응시자가 없어도 답안 링크는 보낼 수 있어야 한다.

### 14.3 후보에서 링크를 보내면 분석 행이 생긴다

- 신설 액션 `listExamClassRosterByExam(examId, classId)` — 분석 행이 있으면 그 기준, 없으면 전원 미등록으로 반환.
- 신설 액션 `issueExamAnswerLinkByExam(examId, rosterStudentId)` — `syncInternalAnalysisForExam`(AI 0콜·무과금·멱등)으로 INTERNAL 분석 행을 **먼저 만든 뒤** 기존 발급 경로에 위임. 학생이 응시했을 때 일어나는 것과 같은 동기화라 새 개념이 아니다.
  ⚠ 부수효과(의도): 이 호출로 후보가 분석 행으로 **승격**된다 → 왼쪽 목록에서 카드가 「분석 전」 후보에서 분석 행 카드로 옮겨가고, 후보 레일은 언마운트된다.
- `useAnalysisRoster` 는 `RosterTarget = {kind:"analysis"|"exam", id}` 로 일반화. 콘솔이 `useMemo` 로 **안정 참조**를 만들어 넘긴다(매 렌더 새 객체면 `ensureRoster` 가 매번 새 함수 → 섹션 effect 가 렌더마다 재요청).
- `useAnalysisConsole(row, refreshDetail, patchDetail, candidateExamId?)` — 4번째 인자 추가(셸이 `analysisRailCandidate?.examId` 전달).
- 탭 활성값은 셸 소유(`api.activeTab`) 그대로. 후보엔 [총평]이 없으므로 `students` 가 아니면 `source` 로 접는다.

- 검증: tsc 0 · eslint 0 error · 단위 15/15. 브라우저 실동작(후보 [원본] 렌더·후보에서 링크 발급→승격)은 **사용자 테스트 대기**.

---

## 15. 「심층 전인데 왜 분석 내용이 있나」 + OMR 링크 위상 확정 (26-09-04)

### 15.1 총평 탭의 내용은 **총평이 아니라 문항별 분석**이었다

사용자 질문: "심층 분석 전인데, 이 분석 내용은 어떻게 있는 거야?"

실측(`새 시험지 2026-07-10`·`2026-06-04`, 둘 다 SHALLOW):

```
examLevel = null          ← 총평·난이도 프로필·유형 분포 없음(맞다)
perQuestion = 8 / 22, OK 전부  ← 문항별 분석은 꽉 차 있다
boostedNumbers = null     ← 심층(boost)은 한 번도 안 돌았다
```

내용의 출처가 갈린다:

| 필드 | SHALLOW 실측값 | 출처 |
|---|---|---|
| `explanation` | "빈칸 문장은 공연자·관객의 공유된 즐거움을…"(구체적) | **출제 때 저장한 `QuestionExplanation.content`** |
| `trapDesign[].why` | "본문은 …라고 긍정적으로 서술하므로 방향이 반대된 오답"(구체적) | 저장된 `wrongOptionExplanations` |
| `intent` | "지문의 핵심 표현을 빈칸으로 비워 문맥 추론력을 묻습니다" | **유형 메타 문구**(전 문항 동일) |
| `examPoint` | "빈칸에 들어갈 원문 표현과 가장 가까운 영어 선택지를 고릅니다" | 유형 메타 문구 |
| `attractiveness` | 전부 2 | **고정값** |

즉 자체 시험지는 **출제 시점에 이미 좋은 해설을 갖고 태어난다**. 심층 분석이 실제로 더하는 건 ① 시험 총평(examLevel) ② 유형 일반론 → **이 문항 개별** 의도·포인트 ③ 매력도 실제 판정 ④ 난이도 근거.

혼란의 직접 원인은 §9(문항 탭을 총평으로 합침)다 — 총평이 빈 채 문항 카드만 잔뜩 보이니 "심층 전인데 왜 분석이 있지?"가 됐다. **수리**: examLevel 이 없으면 그 자리에 한 줄로 이유를 말한다 — "시험 총평·난이도 프로필·유형 분포는 AI 심층 분석에서 만들어집니다. 아래 문항별 분석은 출제할 때 저장된 해설이에요."(비INTERNAL 은 뒷문장 교체)

### 15.2 OMR 링크가 **메인**이다 — 감독 확정

§14 에서 「OMR 링크가 자체 시험지의 정본 배포 경로(앱 응시)를 우회한다」고 제기했고, 감독이 확정했다: **"omr 링크 보내는 게 메인이야. 어차피 출력된 시험지에서 작업하는 경우가 더 많을 거란 말이지."**

- 현행 위계 유지 — 미응시 학생 섹션의 1차 액션은 **[링크 보내기]**(+[전원 링크 발급·표 복사]).
- 앱 응시 경로(개별 배포·QR 자기등록·과제 배포)는 그대로 살아 있다(`ExamSubmission` 생성 → 브리지). 두 경로는 `(분석, studentId)` 축에서 **한 행으로 수렴**한다(§10 브리지 3축 조회) — 링크로 먼저 담아 둔 학생이 나중에 앱으로 응시해도 리포트는 1장이다.
- 참고(재논의 금지 근거): 링크 경로는 `ExamSubmission` 을 만들지 않으므로 배정·시작·제출 시각, 시간제한, 과제 연동이 남지 않는다. 종이 시험지 운용에서는 그게 비용이 아니라는 것이 감독 판단이다.

---

## 16. 링크 발급 플로우 수리 + 제출 증거 재정의 (26-09-04)

사용자 지적: "[전원 링크 발급·표 복사]를 클릭하면 갑자기 (등록됨 목록으로) 돼버리고 그 링크가 없어져버리는 거야? 이거 완전 플로우가 이상해."

### 16.1 링크가 화면에서 증발했다

발급 → 그 학생은 즉시 「등록됨」으로 올라가 미응시 목록에서 빠진다 → `pending.length === 0` → **섹션이 통째로 언마운트** → 방금 만든 링크가 사라진다. 일괄 발급은 애초에 클립보드에만 넣고 화면엔 아무것도 남기지 않았다.

수리(`rail-roster-section.tsx`):
- 발급 결과를 **목록**(`issued: IssuedLink[]`)으로 쌓는다(단건·일괄 공용).
- 섹션 생존 조건을 `pending > 0 || issued > 0` 으로. 미응시가 0이면 헤더가 「방금 보낸 링크 N명」으로 바뀐다.
- 링크마다 [복사]·[카카오톡], 2명 이상이면 [표 다시 복사], [닫기].

### 16.2 더 나쁜 결함 — 링크만 보낸 학생이 「채점 필요」로 둔갑

`classifyFunnelStudent` 에 「**INTERNAL 이면 미채점 전부 needGrading**」 특례가 있었다. 근거는 "자체 시험지는 행이 존재한다 = 제출했다"였는데, §10·§14 로 강사가 응시 **전에** 로스터 학생을 담을 수 있게 되면서 그 전제가 깨졌다. 그대로 두면 답을 낸 적 없는 학생이 채점 대상으로 집계돼 도크가 **존재하지 않는 채점**을 시킨다.

수리 — **제출 증거 2계**:

```
submitted = answerSubmittedAt != null      // OMR 링크로 제출
         || examSubmissionId  != null      // 앱 응시로 제출(브리지는 SUBMITTED/GRADED 에만 행 생성)
```

- `ExamAnalysisStudentRow.examSubmissionId` 신설 → 상세 API·목록 API funnel select·`StudioStudentExamEntry` 까지 전파.
- `classifyFunnelStudent(s)`·`summarizeFunnelStudents(rows)` 의 **`isInternal` 인자 제거** — 「자체 시험지는 링크 축이 0」이라는 규칙 자체가 폐기됐다(OMR 이 메인, §15.2). TS 가 전 호출부를 잡아 준다(arity 오류).
- 새 의미: 담기만 함 → `needLink` · 링크 보냄 → `awaitingAnswer` · 제출됨(둘 중 하나) → `needGrading`.

### 16.3 낡은 자구 정리

`add-students`(INTERNAL)의 「시험지를 배포해 …. **수동 추가는 지원하지 않습니다**」는 이제 거짓이다. → 제목 유지, description 「[학생] 탭에서 클래스 학생에게 답안 링크를 보내세요. 시험지를 배포해 앱으로 응시하게 할 수도 있습니다.」, CTA 「답안 링크 보내기」(primary, [학생] 탭 전환). 배포 화면 탈출구는 **로스터 섹션 아래 링크**로 이사했다 — 도크는 CTA 하나만 그리므로(§11) 거기 두면 메인 동선이 배포로 밀린다.

### 16.4 검증

tsc 0 · eslint 0 error · 단위 **723/704**(실패 18 = 전부 선재, 이번 변경 전과 동일). 갱신한 테스트 3파일: `exam-next-step`(제출 증거 2계·자구), `exam-funnel`(INTERNAL 픽스처에 `examSubmissionId`), `studio-students-summary`(동상 + 인자 제거).

---

## 17. 「분석 전」/「심층 분석 전」 상태 통합 — 후보 무과금 승격 (26-09-04)

사용자 지적: "지금 심층 분석 전이랑 그냥 분석 전이랑 왜 상태가 달라? … 어차피 분석 전 시험지들도 문제 생성에서 해설이 다 있을 거니 [총평] 탭 자체가 없을 필요까지는 없잖아." → 이어서 "분석 전이랑 심층 분석 전이라는 태그 구분도 그러면 이상한 거잖아. 그냥 분석 전으로 통일하는 게 맞지 않을까?"

### 17.1 실측 — 두 상태의 차이는 「행 유무」 하나였다

| | 「분석 전」(후보) | 「심층 분석 전」(SHALLOW) |
|---|---|---|
| 실체 | `ExamAnalysis` 행 **없음** | 행 있음 · `analysis.examLevel` 만 null |
| 데이터 소스 | `Exam` 직접 조회(`loadCandidates`) | `ExamAnalysis.analysis.perQuestion` |
| 컴포넌트 | `CandidateCard` + `RailCandidateView` | `BoardCard` + `AnalysisRowRail` |
| 레일 탭 | 원본 / 학생 (2) | 총평 / 학생 / 원본 (3) |

- `depth: "NONE"` 은 **계산되는 값이 아니다**. `computeDepth`(funnel.ts)는 SHALLOW/DEEP 만 반환하고, 후보 카드의 `data-analysis-depth="NONE"` 은 하드코딩 문자열이다(후보는 퍼널을 안 탄다).
- 그 행을 만드는 일(`syncInternalAnalysisForExam`)은 `Question.explanation`(content·keyPoints·wrongOptionExplanations)을 `perQuestion` 으로 옮겨 적는 게 전부다 — **AI 0콜·크레딧 0·멱등**. 코드가 이미 자백하고 있었다: next-step 「출제 해설을 옮긴 기본 분석만 있습니다」, 레일 「아래 문항별 분석은 출제할 때 저장된 해설이에요」.
- 종전 호출부는 3곳뿐이었다: ① 답안 링크 발급(`issueExamAnswerLinkByExam`) ② **유료** 심층 분석 라우트 ③ 학생 제출 채점 브리지. **「그냥 열어 보기」 경로가 없어서** 후보가 후보로 남았다.

결론: 사용자에게 의미 있는 상태 구분이 아니라 순수한 부기(bookkeeping)였다. 「탭이 없을 필요는 없다」는 지적이 옳다.

### 17.2 수리 ① — 후보를 열면 그 자리에서 무과금 승격

신설 `src/actions/exam-report/internal-sync.ts` → `ensureInternalAnalysisForExam(examId)`.
- 소유 가드 후 기존 행이 있으면 그 id(멱등), 없으면 `syncInternalAnalysisForExam`.
- **null 강등 조건은 `loadCandidates` 의 제외 규칙과 같은 집합**으로 맞춘다: 배포 플래그 off · ARCHIVED · KOREAN · 살아있는 문항 0. 규칙이 갈리면 「후보로는 뜨는데 열면 throw」가 생긴다.
- 호출은 `analysis-pane.tsx` `handleOpenCandidate` → `promoteCandidate(examId)`. fire-and-forget · examId 단위 1회 잠금 · 성공 시 `refresh()`.
- 선택 이전은 **기존 승격 동기 effect**가 그대로 처리한다(후보 소실 + `sourceExamId` 일치 행 출현 → `onSelect(promoted)`). 레일 콘솔은 `analysisId` 변화로 리셋돼 [총평] 탭에서 시작한다.

**실패는 무음**이다. 사용자의 행동(카드 열기)은 이미 성공했고 후보 화면이 그대로 뜨므로 무회귀다 — 카드 클릭마다 토스트를 띄우면 그게 더 소음이다. 대신 잠금을 풀어 재클릭으로 재시도된다. (`fireExamReportPost` 의 「무음 삼킴 금지」는 **버튼이 거짓 성공처럼 보이는** 경우의 규칙이라 여기 해당 없음.)

### 17.3 수리 ② — 칩 자구 통일: 상태는 둘뿐

`ANALYSIS_STATE_CHIP`(board-shared, 자구 정본):

```
none    → 「분석 전」 amber   ┐ 같은 객체(PRE_ANALYSIS_CHIP)
SHALLOW → 「분석 전」 amber   ┘ 사용자에게 이 둘은 같은 상태다
DEEP    → 「분석 완료」 emerald
```

- 후보 카드 아이콘도 slate → **amber**(`BASIC_ANALYSIS_VISUAL` 과 동일). 승격 전후로 카드가 달라 보이면 안 된다.
- `BoardCard` 메타 줄에 **「문항 N」** 추가(INTERNAL·`showFunnel` 한정) — 후보 카드의 「중간고사 · 문항 6」 미러. 승격으로 이 정보가 사라지던 회귀 차단.
- 「심층」을 지운 표면: 레일 헤더 뱃지 · 헤더 진행 캡션 · 총평 빈 상태 안내 · boost 진행 카드 3자구 · next-step 6자구(제목·설명·CTA·실패 사유) · boost 토스트 2종. CTA 는 후보와 같은 **「AI 분석 시작」**.
- **크레딧 원장·과금 표면까지 통일**(감독 확정 — "섞여도 어쩔 수 없지"):
  `CREDIT_LABELS.EXAM_ANALYSIS_BOOST` 「AI 심층분석 보강」→**「AI 시험 분석」**(크레딧 관리 내역 줄) ·
  `WorkbenchAiJob.title` 「AI 심층분석 보강 — {제목}」→「AI 시험 분석 — {제목}」 ·
  환불 사유 3종 · API 에러 자구 4종(토스트로 그대로 노출) ·
  시험지 상세 배포 탭 `boost-button` 버튼/확인 다이얼로그(「AI 분석 시작 · Ncr」/「AI 분석 중…」).
  과거 원장 행은 옛 이름 그대로 남는다 — 이름이 섞이는 것보다 「누른 버튼과 영수증이 다른 것」이 나쁘다는 판단.
  **이웃 op 는 그대로**: `EXAM_ANALYSIS`(외부 시험지 vision 분석)는 「시험지 문항 분석」 유지 — 두 줄이 원장에서
  비슷해 보이는 것은 인지된 잔여 리스크.

### 17.4 함정

- **프로브가 자구로 카드를 집고 있었다**(E33 계보 재발). `probe-v4.mjs` G2 는 `hasText: "심층 분석 전"`, `_synthesis-check.mjs` 는 `hasText: "심층 분석 완료"` — 자구 통일로 **조용히 0건**이 될 뻔했다. 둘 다 계약 속성 `[data-analysis-depth="SHALLOW"|"DEEP"]` 로 교체.
- `BASIC_ANALYSIS_VISUAL.label` 은 자구를 다시 쓰지 말고 `ANALYSIS_STATE_CHIP.SHALLOW.label` 을 읽는다(§14 에서 아이콘·칩·힌트가 세 이름으로 갈렸던 지점).
- 승격은 **허브에도 행을 만든다** — 허브는 `includeCandidates` 를 안 쓰므로, 스튜디오에서 열어만 본 시험지가 시험 분석 허브 목록에 새로 나타난다. 의도된 부작용(삭제로 되돌릴 수 있음)이나 감독 확인 대상.
- 문항에 `QuestionExplanation` 이 없으면 승격돼도 `analysisStatus: "FAILED"`(빈 해설)로 저장된다 — 승격이 내용을 만들어 주지는 않는다.

### 17.5 검증

tsc 0 · 단위 `exam-next-step`·`exam-funnel`·`exam-report-analyze`·`exam-report-assemble`·`exam-report-grading` **23/23**.

## 18. 분석 현황 보드 UI 폴리시 (26-09-05)

지시 원문: *"야 이거 ui좀 개선해봐."* — 첨부는 탭 줄의 범위 세그먼트 `[이 클래스 (10) | 전체 (35)]` HTML.

### 18.1 실측된 결함

- **탭 줄에 둥근 상자 셋이 세 문법으로 서 있었다.** 그룹 탭 2개(h-8 파스텔 필 + 링 카운트 칩)와 범위 세그먼트(h-7 흰 트랙 + 파랑 채움)가 한 줄에 놓이자 「내비게이션」과 「필터」가 형태로 구분되지 않았고, 카운트도 칩 「10」과 괄호 「(10)」 두 벌이었다. 활성 탭(파스텔)이 세그먼트의 활성(진한 파랑)보다 약해 위계가 뒤집혀 있었다.
- **날짜가 떠다녔다.** 집계 줄(`학생 N명 · 리포트 N건 ……… 연월일 시:분`)이 좁은 열·큰 글씨 모드(`body.smoat-large-ui`, 본문 13→17px)에서 줄바꿈돼 날짜만 한 줄을 차지했고, 후보 카드는 집계가 없어 빈 줄 끝에 날짜만 우측 정렬로 떠 있었다.
- 카드 10장마다 **테두리 휴지통 상자 10개**가 목록을 어지럽혔다(진행 카드는 이미 고스트 아이콘이라 두 문법이 공존).
- 목록이 내부 스크롤러라 카드 35장을 내리면 **탭·범위 컨트롤이 시야에서 사라졌다**.

### 18.2 수리

- **그룹 탭 = 밑줄 탭 스트립**(`analyses-board-groups.tsx`): h-8 · 텍스트 + 2px 파랑 밑줄(`-mb-px` 로 스트립 `border-b` 위에 겹침) · 비활성은 회색 글자만 · 카운트는 탭 안 원형 카운터 하나(활성 `bg-blue-100`, 비활성 `bg-slate-100`). 줄에서 채워진 상자는 범위 세그먼트 하나뿐이 된다(지문함 「범위」 세그먼트 어휘는 그대로).
- **탭 줄 sticky** — `sticky -top-4 z-10 bg-white`. Chrome 은 sticky 임계를 스크롤러의 **콘텐츠 박스**로 잡아 `top-0` 이면 `py-4` 만큼(16px) 아래에 멈추고 그 띠로 카드가 비쳤다(실측). 스크롤러 패딩만큼 음수로 당겨 스크롤포트 모서리에 붙인다.
- **날짜 = 카드 마지막 줄 왼쪽 정렬**(연월일 시:분 전문). 경위: 제목 줄 우측(1차) → 큰 글씨 모드에서 제목이 2줄로 접힘 → 사용자 지시 *"시험지 이름이 2줄로 나뉘는 게 마음에 안 들어"* (동시 진행 세션 nara-ba 가 수리) → 힌트 아래 `<p>`. `MetaChipsRow` 에 `showTimestamp` prop(기본 true) 을 추가해 터미널 카드는 끄고 진행 카드(WorkbenchLoadingCard metaSlot)는 유지. 메타 줄은 `flex-wrap` → nowrap(메타 문자열만 truncate)으로 바꿔 학교명이 길어도 칩이 다음 줄로 떨어지지 않는다.
- **휴지통 = 고스트 아이콘**(h-7 · border 없음 · 호버 rose 바탕) — 진행 카드 `DeleteIconAction` 과 통일.
- **힌트 줄 강조**(`analysis-pane-shared.tsx`): 카드의 유일한 「다음 행동」이라 slate-600 medium + 파랑 화살표(크기 불변).

### 18.3 검증(26-09-05)

- `probe-scope-segment.mjs` ALL PASS(1600/1440/1366 한 줄·1280 스택, 자구 잘림 0, 가로 넘침 0, 전체 10→35 전이) · `probe-group-tabs.mjs` ALL GREEN(반반 폭·비활성 언마운트·레일 추종) · tsc 0 · eslint 0.
- `probe-v4.mjs` **ALL GREEN**(재실행). 1차 실행에서 G2(SHALLOW 카드 → 레일 `internal-deepen`)가 `null` 로 1건 FAIL 했으나 재실행에서 통과 — 같은 시각 다른 세션(nara-ba)이 카드 파일을 편집해 HMR 이 돌던 중의 일과성으로 판정.
- 스냅: `.tmp-studio-analysis/shots-ui-polish/{before,after3}-{1600,1280,1024}.png` · `after3-expanded-scrolled.png`(sticky 실측).

### 18.4 함정·잔여

- **큰 글씨 모드가 실사용 화면이다.** `body.smoat-large-ui :where(button.h-9)` 가 `min-height: 2.9rem !important` 를 먹여 h-9 탭이 46px 로 부풀었다(h-8 → 41.6px). 폭 계산도 본문 13→17px 기준으로 해야 한다 — 제목 줄에 날짜를 두는 안이 기본 모드 계산으론 맞았지만 큰 글씨 모드에서 무너진 이유.
- **동시 세션 충돌**: 같은 파일을 두 세션이 편집해 날짜 위치가 두 번 바뀌었다(제목 줄 → 메타 줄 우측 → 마지막 줄). 최종은 nara-ba 상태. `analyses-board-cards.tsx` 의 집계 줄 주석 「타임스탬프는 제목 줄로 이사」는 옛 문장(실제는 마지막 줄) — nara-ba 편집 종료 확인 후 정정 완료.
- 파일 길이: `analyses-board-groups.tsx` 458 · `analyses-board-cards.tsx` 472 (500줄 상한 근접).
