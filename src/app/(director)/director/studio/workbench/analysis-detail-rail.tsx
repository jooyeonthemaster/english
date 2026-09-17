"use client";

// ============================================================================
// 시험 분석 — 우측 「분석 결과 콘솔」 레일 (26-09-01 대개편, 정본 §3.10.28 ·
// v4 26-09-02 docs/exam-analysis-v4-spec.md §3 U5)
//
// 카드 클릭 = 이 레일. **탈출구 0**(26-09-02 재재지시 "저 오른쪽 섹션 내에서
// 다 해결") — 모달·같은 탭 이동은 물론 새 탭 위임도 없다. 분석 결과 열람
// (총평·문항별 심층분석·시험지 원본)과 처리 전부 인라인: 정답·배점 검수
// (RailReviewSection)·채점 입력/확정(정오 타일 편집기)·리포트 생성·공유·답안
// 링크·학생 추가/신규 등록/삭제. 새 탭은 원본 사진 클릭(파일 열람)과 v4 §1-8
// 유일 예외(INTERNAL 학생 0명의 배포 화면, data-rail-escape-allowed)뿐.
//
// 골격(26-09-03 개정): 헤더 → **여정 스트립**(분석·검수·학생·채점·리포트) →
// 탭바 → 스크롤 본문(검수 배너 → 탭 본문) → **하단 도크 「다음 단계」**.
// 여정·다음 단계는 전부 deriveExamNextStep 1함수 산출(카드 힌트 줄과 같은 소스
// — 계기판·버튼 불일치 원천 차단). row null + candidate = 후보 화면
// (RailCandidateView). 구 하단 [다시/이어서 분석] 존은 다음 단계 블록 CTA 로
// 흡수(중복 버튼 제거).
// ⚠ **분석을 시작하는 CTA 는 이 레일에 없다**(26-09-03 사용자 지시) —
//   candidate-analyze·internal-deepen·retry-failed·resume-draft 는 중앙 판
//   하단 도크(analysis-pane)가 든다. 레일 도크는 그 **다음** 단계부터다.
//   경계선은 next-step.ts 의 journey step === "analyze" 하나로 판정한다.
//
// 프레젠테이션 전용: 페치·확장·활성 탭은 셸의 useAnalysisDetail +
// useAnalysisConsole 1인스턴스(aside·드로어 2렌더 공유 — 2중 페치 차단).
// 폭 계약: 레일 aside 는 리사이저블(320~960, 기본 360) + 드로어 360·max 85vw —
// 콘텐츠 플로어 **~296px**(적대검수 V2-C1). 전 행 truncate+title 또는 break-keep,
// 가로 오버플로 0. 표 금지(정오·함정 전부 스택/auto-fit 그리드).
// 검수 칩은 getMapGateStatus 단일 소스(B8 — status 로 완료를 추정하지 않는다).
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import {
  Compass,
  FileBarChart,
  ListChecks,
  Loader2,
  RotateCw,
  Target,
} from "lucide-react";
import type {
  ExamCandidateRow,
  ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import type { ExamAnalysisDetail } from "@/components/exam-report/ui-contracts";
import { getMapGateStatus } from "@/lib/exam-report/map-gate";
import {
  deriveExamNextStep,
  resolveRailDockPerspective,
} from "@/lib/exam-report/next-step";
import {
  ANALYSIS_STATE_CHIP,
  EXAM_TYPE_LABEL,
  STATUS_BADGE,
  formatAnalysisEta,
  progressPercent,
} from "@/components/exam-report/hub/board-shared";
import { formatDateTime } from "@/lib/utils";
import { RailCandidateView } from "./analysis-rail/rail-candidate";
import { RailExamShareBlock } from "./analysis-rail/rail-exam-share-block";
import { RailHeader, type RailHeaderProgress } from "./analysis-rail/rail-header";
import { RailPerspectiveCaption } from "./analysis-rail/rail-perspective-caption";
import {
  AnalysisRailEmpty,
  RailNextStepDock,
} from "./analysis-rail/rail-shell-parts";

// 셸(studio-home-client)이 이 모듈에서 가져가던 이름 — 분리 후에도 경로 유지.
export { AnalysisRailEmpty };
import { RailJourneyStrip } from "./analysis-rail/rail-journey";
import { NEXT_STEP_COSTS, RailNextStepBlock } from "./analysis-rail/rail-next-step";
import { useNextStepAction } from "./analysis-rail/rail-next-step-actions";
import { ClampedProse, MetaBlock, RailTab } from "./analysis-rail/rail-primitives";
import { RailQuestionSection } from "./analysis-rail/rail-question-section";
import { RailReviewSection } from "./analysis-rail/rail-review-section";
import { RailSynthesis } from "./analysis-rail/rail-synthesis";
import { RailExamSheetSection } from "./analysis-rail/rail-exam-sheet-section";
import { RailSourceSection } from "./analysis-rail/rail-source-section";
import { RailStudentPickBar } from "./analysis-rail/rail-student-pick-bar";
import {
  buildUnifiedRows,
  filterRowsByScope,
  isRosterPending,
} from "./analysis-rail/rail-student-rows";
import { RailStudentSection } from "./analysis-rail/rail-student-section";
import type { AnalysisConsoleApi } from "./analysis-rail/use-analysis-console";

export interface AnalysisDetailRailProps {
  /** 선택 행(요약 폴 실황 — ANALYZING 진행률·상태 뱃지는 이쪽이 신선하다).
   *  v4: null 허용 — candidate 와 함께 후보 화면, 둘 다 없으면 빈 상태. */
  row: ExamReportSummaryRow | null;
  /** v4 — 분석 행이 아직 없는 자체 시험지(row null 일 때만 의미). */
  candidate?: ExamCandidateRow | null;
  detail: ExamAnalysisDetail | null;
  detailLoading: boolean;
  detailError: boolean;
  onClose: () => void;
  /** 상세 재조회(헤더 새로고침·에러 복구) — 셸의 detailNonce 를 올린다. */
  onRetryDetail: () => void;
  /** 콘솔 상태·지연 페치 — 셸 1인스턴스(useAnalysisConsole) */
  console: AnalysisConsoleApi;
  /** v4 — 「학생 관리」 뷰 전환(add-students 보조 액션). 셸이 view="students". */
  onOpenStudentsView?: () => void;
  /** 스튜디오에서 선택된 클래스 — [학생] 탭의 「미응시」 로스터 축(26-09-04 §10). */
  classId?: string | null;
  className?: string | null;
}

export function AnalysisDetailRail(props: AnalysisDetailRailProps) {
  const { row, candidate, onClose, console: api, classId, className } = props;
  if (!row) {
    return candidate ? (
      <RailCandidateView
        key={candidate.examId}
        candidate={candidate}
        onClose={onClose}
        console={api}
        classId={classId ?? null}
        className={className ?? null}
      />
    ) : (
      <AnalysisRailEmpty />
    );
  }
  return <AnalysisRowRail {...props} row={row} />;
}

function AnalysisRowRail({
  row,
  detail,
  detailLoading,
  detailError,
  onClose,
  onRetryDetail,
  console: api,
  onOpenStudentsView,
  classId = null,
  className = null,
}: AnalysisDetailRailProps & { row: ExamReportSummaryRow }) {
  const analyzing = row.status === "ANALYZING";
  const progress = row.progress ?? null;
  const hasProgress = analyzing && !!progress && progress.total > 0;
  const isInternal = row.sourceType === "INTERNAL";
  const boost = row.funnel?.boost ?? null;
  const boostRunning = boost?.status === "RUNNING";
  // 헤더 칩 — INTERNAL 은 status 가 ANALYZED 여도 AI 분석(DEEP) 전이면 「분석 완료」
  // emerald 가 여정 스트립(분석 active)과 모순(U5-spec-6). U4 카드 깊이 칩과 같은
  // 어휘: RUNNING=「AI 분석 중」 blue / SHALLOW=「분석 전」 amber(자구 정본은
  // board-shared ANALYSIS_STATE_CHIP — 26-09-04 「그냥 분석 전으로 통일」). funnel
  // 미포함(구 API·낙관 행)이면 카드와 같이 상태 뱃지로 폴백.
  const badge =
    isInternal &&
    row.status === "ANALYZED" &&
    row.funnel &&
    row.funnel.depth !== "DEEP"
      ? boostRunning
        ? {
            label: "AI 분석 중",
            className: "border border-blue-200 bg-blue-50 text-blue-700",
          }
        : {
            label: ANALYSIS_STATE_CHIP.SHALLOW.label,
            className: "border border-amber-200 bg-amber-50 text-amber-700",
          }
      : STATUS_BADGE[row.status];

  // 검수 게이트 — 단일 소스 함수(레일·워크스페이스·서버 공용).
  const gate =
    detail?.examMap && detail.examMap.questions.length > 0
      ? getMapGateStatus({
          questionNumbers: detail.examMap.questions.map((q) => q.number),
          reviewState: detail.reviewState,
          studentCount: detail.students.length,
        })
      : null;

  // 여정·다음 단계 — 카드 힌트 줄과 같은 함수(§1-3). detail 이 있으면 학생 행
  // 단위 정밀 판정(낙관 패치 즉시 반영).
  const step = useMemo(
    () => deriveExamNextStep({ row, detail, costs: NEXT_STEP_COSTS }),
    [row, detail],
  );
  const action = useNextStepAction({
    step,
    row,
    detail,
    detailLoading,
    api,
    onOpenStudentsView,
  });
  // 도크 관점(26-09-03 리포트 2관점 분리) — [학생] 탭 = 학생 리포트 퍼널 블록, 그 외
  // 탭 = 시험지 분석 리포트 공유 블록. 분석·검수 단계는 탭 무관 퍼널 블록. 판정은
  // next-step.ts resolveRailDockPerspective 단일 소스(여기서 탭을 다시 읽지 않는다).
  const dockPerspective = resolveRailDockPerspective(step, api.activeTab);
  // 【26-09-05 사용자 지적】 "학생이 3명인데 학생 탭에 1이라고 되어 있냐?"
  //   탭 배지가 detail.students.length(=이 시험에 **행이 있는** 학생)였는데, 목록은
  //   26-09-04 통합으로 클래스 명단 잔여까지 함께 그린다 — 계기와 화면이 갈렸다.
  //   그래서 행 배열을 **여기서 한 번만** 만들어 탭 배지·목록·픽바가 같은 것을 본다.
  const unifiedRows = useMemo(
    () => (detail ? buildUnifiedRows(detail.students, api.roster) : []),
    [api.roster, detail],
  );
  // 픽바가 볼 행(선택 해석의 근거) — **필터를 걸지 않는다**: 범위를 좁힌 뒤에도
  // 이미 고른 학생이 조용히 사라지면 안 된다. 선택 0이면 도크는 「다음 단계」.
  const dockRows = api.pickedStudentKeys.size === 0 ? [] : unifiedRows;
  // 탭 배지는 **보이는 행 수**다(26-09-05: 배지 1 / 목록 3 지적의 수리 — 범위
  // 필터를 켠 뒤에도 둘이 갈리면 같은 결함이 재발한다).
  const visibleStudentCount = filterRowsByScope(
    unifiedRows,
    api.studentScope,
  ).length;
  // 명단 적재는 **탭과 무관하게 레일이 연다**(26-09-05). 종전엔 [학생] 섹션의 effect
  // 만이 열어서, 총평 탭에 머무는 동안 배지는 명단 없는 산식(다른 반 포함)을 셌고
  // [학생] 탭을 누르는 순간에야 줄었다. 2중 마운트(aside·드로어) dedup 은 훅이
  // analysisId×classId 1회로 진다(rail-candidate 와 같은 호출 관례).
  const { ensureRoster } = api;
  useEffect(() => {
    if (classId) ensureRoster(classId);
  }, [classId, ensureRoster]);
  // 명단이 오기 전엔 배지를 **비운다** — 「모름」을 3으로 셌다가 2로 고치는 것이
  // 사용자가 본 플래시다(isRosterPending 주석).
  const rosterPending = isRosterPending(classId, api.rosterPhase);

  // 탭 전환 시 스크롤 최상단 복귀 — 이전 탭의 깊은 scrollTop 잔존 방지.
  // focusStudent 전이(학생 섹션이 행 위치로 보정)에는 1회 양보한다 — 선언
  // 순서가 계약: 이 effect 가 focusNonce 갱신 effect 보다 먼저 돌아야 한다.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenFocusNonceRef = useRef(0);
  useEffect(() => {
    const nonce = api.focusRequest?.nonce ?? 0;
    if (nonce !== seenFocusNonceRef.current) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [api.activeTab, api.focusRequest]);
  useEffect(() => {
    seenFocusNonceRef.current = api.focusRequest?.nonce ?? 0;
  }, [api.focusRequest]);

  const metaRows: { label: string; value: string }[] = [];
  if (row.schoolName) metaRows.push({ label: "학교", value: row.schoolName });
  if (row.grade) metaRows.push({ label: "학년", value: row.grade });
  metaRows.push({ label: "시험", value: EXAM_TYPE_LABEL[row.examType] });
  if (detail?.examYear || detail?.semester) {
    metaRows.push({
      label: "시기",
      value: [detail?.examYear ? `${detail.examYear}년` : null, detail?.semester]
        .filter(Boolean)
        .join(" "),
    });
  }
  metaRows.push({ label: "등록일", value: formatDateTime(row.createdAt) });

  const examLevel = detail?.analysis?.examLevel ?? null;
  const perQuestion = detail?.analysis?.perQuestion ?? [];
  const sourceFiles = detail?.sourceFiles ?? null;
  // 총평 빈 상태: 점선 박스 대신 **왜 없는지 말하는 한 줄**(§3 U5-3).
  // 26-09-04: 게이트를 `!examLevel` **전부**로 넓혔다. 종전엔 kind 가
  // internal-deepen·boost-running 일 때만 한 줄을 썼고, 그 밖(FAILED·DRAFT·
  // 검수 게이트·학생 단계 등)에서는 점선 박스가 「모든 문항 분석이 끝나면 시험
  // 전체 수준을 종합합니다」라고 **거짓말**을 했다 — 아무것도 돌고 있지 않은데
  // 곧 채워질 것처럼 말한다. examLevel 이 없는 이유는 언제나 하나(AI 분석을 아직
  // 안 돌렸다)이므로 자구도 하나여야 한다.
  const hideSynthesisEmpty = !examLevel;

  // 렌더용 활성 탭. 【26-09-03 오후 반전】 구 코드는 INTERNAL 의 "source" 를
  // "questions" 로 강등했다 — 같은 날 오전에 「INTERNAL 은 사진이 없으니 [원본]
  // 탭을 없앤다」로 닫았기 때문이다. 사용자 지시로 반전됐다: INTERNAL 의 원본은
  // 사진이 아니라 **스모트에서 조판된 시험지**다(RailExamSheetSection). 이제 5탭
  // 공통이므로 강등 분기 자체가 사라졌다.
  const activeTab = api.activeTab;

  // 헤더 진행 바 — ANALYZING(요약 폴 progress) / boost RUNNING(funnel.boost) 공용.
  const headerProgress: RailHeaderProgress | null = analyzing
    ? {
        percent: hasProgress ? progressPercent(progress) : null,
        caption: hasProgress
          ? `${progress.completed}/${progress.total} 문항 분석 중${
              formatAnalysisEta(progress) ? ` · ${formatAnalysisEta(progress)}` : ""
            }`
          : "문항을 인식하는 중입니다...",
      }
    : boostRunning && boost
      ? {
          percent:
            boost.total > 0
              ? Math.round(
                  Math.min(1, Math.max(0, boost.completed / boost.total)) * 100,
                )
              : null,
          caption: `AI 분석 중 ${boost.completed}/${boost.total}`,
        }
      : null;

  return (
    <div data-analysis-rail className="flex h-full min-h-0 min-w-0 flex-col">
      <RailHeader
        badgeLabel={badge.label}
        badgeClassName={badge.className}
        badgeSpinning={analyzing || boostRunning}
        title={row.title}
        onRefresh={analyzing ? undefined : onRetryDetail}
        onClose={onClose}
        progress={headerProgress}
      >
        <RailJourneyStrip journey={step.journey} />
      </RailHeader>

      {/* ── 상단 탭바(26-09-02 "상단 탭으로 올려줘" — 접이 밴드 IA 폐기).
          **3탭: 총평 / 학생 / 원본**(26-09-04 사용자 지시). 언더라인 문법.
          검수 배너는 blocking 이라 탭과 무관하게 스크롤러 상단 공통.
          · [문항]은 [총평] 안으로 접어 넣었다 — "이 문항 탭은 사실 내용이 총평 안에
            있어야 할 것 같아". 시험지 한 장을 보는 관점이 총평(집계)과 문항(개별)로
            갈려 탭 순례가 생겼던 것을, 같은 스크롤 위에서 위→아래로 잇는다.
          · [정보]는 폐기 — "불필요한 것 같아". 학교·학년·시기·등록일은 왼쪽 목록
            카드가 이미 말하고, 검수 완료 칩은 배너(미완일 때만)로 충분하다. 단
            **상세가 없는 상태**(ANALYZING·DRAFT·FAILED)에서는 여전히 MetaBlock 이
            본문을 채운다 — 그건 탭이 아니라 폴백이다. ── */}
      {detail && !analyzing ? (
        <div className="flex shrink-0 items-stretch border-b border-slate-200 px-1">
          <RailTab
            tabKey="synthesis"
            label="총평"
            active={api.activeTab === "synthesis"}
            onSelect={api.setActiveTab}
          />
          <RailTab
            tabKey="students"
            label="학생"
            count={rosterPending ? undefined : visibleStudentCount}
            active={api.activeTab === "students"}
            onSelect={api.setActiveTab}
          />
          {/* [원본] — 26-09-03 오후 사용자 지시로 **INTERNAL 포함 전 분석 공통**.
              비INTERNAL = 업로드 사진 / INTERNAL = 조판된 시험지. */}
          <RailTab
            tabKey="source"
            label="원본"
            active={api.activeTab === "source"}
            onSelect={api.setActiveTab}
          />
        </div>
      ) : null}

      {/* ── 본문(유일 스크롤러 — 계약 속성은 학생 아코디언 앵커 보정용) ────── */}
      <div
        ref={scrollRef}
        data-analysis-rail-scroll
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="min-w-0 space-y-3 px-3 py-3">
          {/* 다음 단계 블록은 26-09-03 사용자 지시로 **하단 도크**로 내려갔다
              (스크롤러 밖 형제 — 이 파일 하단 RailNextStepDock 참조). 구 §3 U5-1
              「전 상태 공통 최상단」은 그 지시로 폐기됐다. */}
          {analyzing ? (
            <MetaBlock rows={metaRows} />
          ) : detailLoading && !detail ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-400">
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              상세 정보를 불러오는 중...
            </div>
          ) : detailError && !detail ? (
            <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <p className="break-keep text-[12px] leading-relaxed text-rose-600">
                상세 정보를 불러오지 못했습니다. 목록에서 삭제됐거나 일시적인
                오류일 수 있어요.
              </p>
              <button
                type="button"
                onClick={onRetryDetail}
                className="inline-flex h-7 w-fit cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
              >
                <RotateCw className="size-3 shrink-0" aria-hidden="true" />
                다시 시도
              </button>
            </div>
          ) : detail ? (
            <>
              {/* 검수 배너+인라인 에디터 — blocking 이라 전 탭 공통 상단.
                  완료 emerald 칩은 [정보] 탭 소관(상시 1줄 점유 제거). */}
              {gate && !gate.open ? (
                <RailReviewSection detail={detail} gate={gate} console={api} />
              ) : null}

              {activeTab === "synthesis" ? (
                <div className="min-w-0 space-y-2">
                  {/* 관점 캡션(26-09-03 리포트 2관점) — 이 탭 = 시험지 자체의 분석
                      리포트. 학생 리포트는 [학생] 탭. 도크 아이브로우와 같은 어휘. */}
                  <RailPerspectiveCaption
                    perspective="exam"
                    icon={<FileBarChart className="size-3" aria-hidden="true" />}
                    label="시험지 분석 리포트"
                    hint="시험지 자체를 분석한 리포트 · 공유는 아래에서"
                  />
                  {examLevel?.overview ? (
                    <ClampedProse text={examLevel.overview} />
                  ) : null}
                  {/* 26-09-04: 분석 전(examLevel null)이면 **왜 총평이 없는지**를
                      한 줄로 말한다. §9 에서 [문항]을 이 탭으로 합친 뒤, 총평은
                      비었는데 문항 카드만 잔뜩 보여 "심층 분석 전인데 이 분석
                      내용은 어떻게 있는 거야?"가 됐다(사용자 질문). 점선 빈 상태
                      박스(RailSynthesis)는 진행 중 3겹으로 쌓여 여전히 안 쓴다.
                      자구는 「심층 분석」→「AI 분석」으로 통일(칩과 같은 어휘). */}
                  {examLevel ? (
                    <RailSynthesis examLevel={examLevel} />
                  ) : hideSynthesisEmpty ? (
                    <p className="break-keep rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-500">
                      시험 총평·난이도 프로필·유형 분포는 <b className="font-semibold text-slate-700">AI 분석</b>에서 만들어집니다.
                      {isInternal
                        ? " 아래 문항별 분석은 출제할 때 저장된 해설이에요."
                        : " 아래는 문항 분석 결과입니다."}
                    </p>
                  ) : (
                    <RailSynthesis examLevel={examLevel} />
                  )}
                  {/* 두 프로즈 섹션은 카드 + 글리프로 가른다(26-09-03 사용자
                      지시 "구분이 되도록") — 카드 토큰은 위 RailSynthesis 와 동일.
                      글리프 의미: 함정 조준(Target) / 범위 탐색(Compass). */}
                  {examLevel?.trapOverview ? (
                    <ClampedProse
                      label="오답 설계 총평"
                      icon={
                        <Target className="size-3 shrink-0" aria-hidden="true" />
                      }
                      text={examLevel.trapOverview}
                    />
                  ) : null}
                  {examLevel?.scopeInference ? (
                    <ClampedProse
                      label="출제 범위 추정"
                      icon={
                        <Compass className="size-3 shrink-0" aria-hidden="true" />
                      }
                      text={examLevel.scopeInference}
                    />
                  ) : null}

                  {/* ── 문항별 분석(26-09-04 사용자 지시로 [문항] 탭에서 합류) ──
                      집계(총평·난이도·유형)에서 개별(문항 카드)로 **같은 스크롤 위에서**
                      내려간다. 밴드 헤더로 경계를 준다 — 위는 시험지 전체, 아래는 문항
                      하나하나. 필터 칩·아코디언은 섹션이 자체 소유(로컬 상태). ── */}
                  {perQuestion.length > 0 ? (
                    <div className="min-w-0 space-y-2 pt-1">
                      <div className="flex min-w-0 items-center gap-2 border-t border-slate-100 pt-2.5">
                        <ListChecks
                          className="size-3.5 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                          문항별 분석
                        </p>
                        <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium tabular-nums text-slate-500">
                          {perQuestion.length}문항
                        </span>
                      </div>
                      <RailQuestionSection
                        perQuestion={perQuestion}
                        mapEntries={detail.examMap?.questions ?? []}
                        isInternal={isInternal}
                        console={api}
                      />
                    </div>
                  ) : null}
                </div>
              ) : activeTab === "students" ? (
                <div className="min-w-0 space-y-2">
                  {/* 【26-09-05】 관점 캡션(「학생 리포트 — 학생이 시험을 치른 뒤의…」)
                      을 걷어냈다(사용자 지시). 탭 이름이 [학생]이고 그 아래가 학생
                      목록인 화면에서 「여기는 학생 리포트입니다」는 설명이 아니라 자리
                      차지였다. 시험지 분석과의 구분은 [총평] 탭 캡션이 계속 든다. */}
                  <RailStudentSection
                    row={row}
                    detail={detail}
                    rows={unifiedRows}
                    gateOpen={gate?.open ?? false}
                    classId={classId}
                    className={className}
                    console={api}
                  />
                </div>
              ) : isInternal ? (
                // [원본] — INTERNAL 의 원본은 사진이 아니라 조판된 시험지다.
                // examId 는 **요약 행에만** 있다 — 상세 페이로드는 sourceExamId 를
                // select 하지 않는다(analyses/[id]/route.ts).
                <RailExamSheetSection
                  examId={row.sourceExamId ?? null}
                  console={api}
                />
              ) : (
                <RailSourceSection sourceFiles={sourceFiles} console={api} />
              )}
            </>
          ) : (
            // DRAFT(사진 유·무)·FAILED 등 상세 없는 종결 상태 — 메타는 유지(퇴행 방지)
            <MetaBlock rows={metaRows} />
          )}
        </div>
      </div>

      {/* ── 하단 도크 「다음 단계」(26-09-03 사용자 지시) ────────────────────
          지시 원문: "그 다음 단계를 안내해주는 그런 버튼들은 딱 위치를 [픽바
          시험지 조판 버튼] 이렇게 그 하단에 고정시켜서 보여줘."
          **스크롤러 밖 flex 형제**다 — 지문 도시에 픽바·지문관리 하단 CTA 와
          같은 도킹 관용구(본문을 아무리 내려도 늘 하단). position:fixed 는 금지:
          레일은 aside(폭 320~960, 드래그 중 style.width 직접 기입·리렌더 0)와
          <xl 드로어(360/85vw, fixed inset-0) **두 트리에 동시 마운트**되므로
          뷰포트 기준 좌표가 양쪽에서 동시에 맞을 수 없다.
          블록 전체를 옮긴 이유: 제목(data-next-step-title)과 CTA 가 갈라지면
          「카드 힌트 == 레일 제목」 정합 게이트(G5)가 두 노드를 넘나든다. ── */}
      {/* 도크 내용은 **관점**이 고른다(26-09-03 사용자 지시 "이 버튼이 리포트 공유
          버튼이 돼야 하고, 학생 탭에서는 학생 리포트 생성이 나와야 한다"):
          exam = 시험지 분석 리포트 공유 블록(무과금·링크 복사·카카오·다른 앱) /
          students = 학생 리포트 퍼널 블록(생성 Ncr·공유 링크 발급 등). detail 미도착
          이면 공유 상태를 모르므로 퍼널 블록(스피너 자리 유지)으로 폴백. */}
      {/* 【26-09-04】 목록에서 학생을 체크하면 도크가 **픽바**로 바뀐다(사용자 지시:
          "애초에 여기서 체크를 하면 버튼이 뜨도록 하면 되잖아" — 지문관리 픽바 관용구).
          선택이 0이 되면 다시 「다음 단계」로 돌아간다. 선택이 관점보다 우선하는
          이유: 강사가 방금 손으로 고른 대상이 자동 판정보다 구체적이다. */}
      <RailNextStepDock>
        {dockRows.length > 0 && detail ? (
          <RailStudentPickBar
            rows={dockRows}
            target={{ kind: "analysis", id: detail.id }}
            gateOpen={isInternal || (gate?.open ?? false)}
            console={api}
          />
        ) : dockPerspective === "exam" && detail ? (
          <RailExamShareBlock
            detail={detail}
            gateOpen={gate?.open ?? false}
            isInternal={isInternal}
            console={api}
          />
        ) : (
          <RailNextStepBlock
            step={step}
            onAction={action.run}
            busy={action.busy}
            disabled={action.disabled}
            note={action.note}
            escapeHref={action.escapeHref}
          />
        )}
      </RailNextStepDock>
    </div>
  );
}


