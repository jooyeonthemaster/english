"use client";

// ============================================================================
// 문항 분석 탭 (v4) — AnalysisStepProps 계약 준수.
//
//  DRAFT/미분석      : "시험 분석 시작" CTA.
//  ANALYZING         : 진행 스트립(실제 %·ETA·문항 칩) + 지도/카드 점진 노출.
//                      재개는 서버 자가연쇄(after self-POST, W1)가 잇는다 —
//                      클라이언트는 시작 1회 + 폴링 감시견(정체 시 1회 재점화)만.
//  DRAFT/FAILED 부분 : "이어서 분석" 배너(추가 과금 없음) — 중단 건 막다른 화면 제거.
//  ANALYZED          : 채점 지도(내부 스크롤) + 문항 분석 카드(유형 필터)
//                      + 우측 시험지 종합 패널 + 하단 고정 "다음으로 (학생 관리)".
//
// 저장 파이프라인(version CAS + 낙관갱신 + 충돌 재페치)은 use-analysis-persistence
// 훅으로 로직 불변 분리. 배너/필터/칩 스트립은 analysis-banners /
// analysis-progress-strip 프레젠테이션 모듈로 분리.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Play } from "lucide-react";
import type { AnalysisStepProps, ExamAnalysisDetail } from "../ui-contracts";
import { EXAM_ANALYSIS_MIN_CREDITS } from "@/lib/exam-report/types";
import { getMapGateStatus } from "@/lib/exam-report/map-gate";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { Button } from "@/components/ui/button";
import {
  PanelHandle,
  useResizablePanels,
} from "@/components/layout/resizable-panels";
import { cn } from "@/lib/utils";
import { QuestionSidePanel } from "./question-side-panel";
import { ExamOverviewPanel } from "./exam-overview-panel";
import { ResizableSheetContent } from "../resizable-sheet-content";
import { QuestionAnalysisCard } from "./question-analysis-card";
import { SourcePanel } from "./source-panel";
import { MobileMapFlow } from "./analysis-step-mobile";
import { AnalysisProgress } from "./analysis-progress";
import { ExamMapTable } from "./exam-map-table";
import {
  MobileStepHeader,
  MobileStepNav,
  type MobileFlowStep,
} from "@/components/workbench/mobile-step-flow";
import { triggerHintGlow } from "@/lib/hint-glow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SourceImageViewer } from "../source-image-viewer";
import {
  AnalysisProgressStrip,
  type QuestionChipInfo,
} from "./analysis-progress-strip";
import { AnalysisFailedBanner, ResumeAnalysisBanner } from "./analysis-banners";
import {
  useAnalysisPersistence,
  type WorkingState,
} from "./use-analysis-persistence";

function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

// 감시견 정체 판정 임계 — 배치 커밋(progress.updatedAt)이 임계 이상 멈추면 서버
// 자가연쇄 단선으로 보고 1회 재점화한다.
// (결함수리) 한 라운드는 최대 270s(자가연쇄 self-POST 주기)까지 커밋 없이 정상
// 진행될 수 있다 — 이전 150s/240s 임계는 살아있는 런을 죽었다고 오판해 재점화
// POST 가 신선 잡 펜스를 탈취하고, 진행 중이던 배치와 원가를 이중 지출할 수
// 있었다. 라운드 최대치(270s)를 확실히 넘긴 값으로만 "죽었다"고 단정한다.
const WATCHDOG_PROGRESS_STALL_MS = 300_000;
// 첫 체크포인트 전(progress 부재)에는 E1a(문항 인식)까지 겹쳐 더 오래 걸릴 수
// 있어 runStartedAt 기준은 추가로 완화한다(360s > 라운드 270s).
const WATCHDOG_RUN_START_STALL_MS = 360_000;

// 모바일 스텝(시안 A) — PC 의 2탭(문항 분석|학생 관리)과 달리, 모바일은 "한 화면 한
// 기능" 방침대로 문항 분석을 ①정답·배점 / ②분석 검수로 쪼갠다. ③학생 관리는 게이트.
type MobileStep = "map" | "review";
const MOBILE_STEPS: readonly MobileFlowStep[] = [
  { key: "map", label: "정답·배점" },
  { key: "review", label: "분석 검수" },
  { key: "students", label: "학생 관리" },
];

export function AnalysisStep({
  detail,
  onDetailChange,
  onAdvance,
  overviewOpen = false,
  onOverviewOpenChange,
}: AnalysisStepProps) {
  const pathname = usePathname();
  const creditsHref = pathname?.startsWith("/teacher")
    ? "/teacher/credits"
    : "/director/credits";

  const [reanalyzing, setReanalyzing] = useState<Set<string>>(new Set());
  // D4: 전체 분석 드라이버가 도는 동안(서버가 아직 ANALYZING 으로 넘어가기 전 포함)
  // 진행뷰를 붙잡는 로컬 플래그. 시작 직후 폴링이 아직 DRAFT 인 상세를 되받아
  // 진행뷰를 idle 로 되돌리는 회귀를 막는다. finally 의 재페치 후 해제한다.
  const [driving, setDriving] = useState(false);
  // 카드 리스트 유형 필터(null=전체) — 문항 수가 많을 때 세로 나열 완화.

  // ── 시험지 원본 분할 패널(우측 밀어내기) — Sheet 오버레이 대체(유저 요청).
  // 폭은 공용 리사이저 훅이 관리(드래그 조절 + localStorage 영속), 열림 여부는
  // 세션 로컬(기본 닫힘). 핸들 클릭(접기)은 아래 effect 가 "패널 닫기"로 매핑.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const {
    containerRef: splitContainerRef,
    widths: panelWidths,
    collapsed: panelCollapsed,
    startResize: startPanelResize,
    toggleCollapsed: togglePanelCollapsed,
    expand: expandPanel,
  } = useResizablePanels({
    panels: [{ key: "sources", min: 320, max: 920, defaultWidth: 480, sign: -1 }],
    // 패널이 열리면 총평 aside(380px)는 숨기므로 이 값이 곧 채점 지도 보장폭.
    // 1280px 뷰포트(콘텐츠 ~996px)에서도 지도 ~540px + 패널 ~416px 이 성립한다.
    minCenter: 560,
    storageKey: "exam-report:analysis-sources",
  });
  useEffect(() => {
    if (panelCollapsed.sources) {
      setSourcesOpen(false);
      // 접힘을 즉시 되돌려 다음 "시험지 원본" 클릭 때 바로 펼쳐지게 한다.
      expandPanel("sources");
    }
  }, [panelCollapsed.sources, expandPanel]);
  // xl 브레이크포인트 판정 — 분할 패널/모바일 폴백을 CSS 숨김이 아니라 '한쪽만
  // 마운트'로 갈라 SourceImageViewer 의 서명 URL POST·줌 상태가 이원화되지 않게.
  const [isXl, setIsXl] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setIsXl(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // ── 최신 상태 참조(비동기 핸들러 stale 방지) ──────────────────────────────
  const detailRef = useRef<ExamAnalysisDetail>(detail);
  detailRef.current = detail;
  const onChangeRef = useRef(onDetailChange);
  onChangeRef.current = onDetailChange;
  const busyRef = useRef(false); // 분석 드라이버 in-flight
  const workingRef = useRef<WorkingState>({
    analysis: detail.analysis,
    reviewState: detail.reviewState,
    examMap: detail.examMap,
    version: detail.version,
  });
  useEffect(() => {
    workingRef.current = {
      analysis: detail.analysis,
      reviewState: detail.reviewState,
      examMap: detail.examMap,
      version: detail.version,
    };
  }, [detail.analysis, detail.reviewState, detail.examMap, detail.version]);

  const id = detail.id;

  const refreshDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam-report/analyses/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { analysis: ExamAnalysisDetail };
      onChangeRef.current(data.analysis);
    } catch {
      /* 폴링/감시견이 이어서 반영 */
    }
  }, [id]);

  // ── 저장 파이프라인(디바운스 배치 + 직렬 저장 — use-analysis-persistence) ───
  const {
    saveState,
    handleEditMapEntry,
    handleToggleMapConfirm,
    handleEditField,
    handleEditExamLevel,
    handleToggleConfirm,
  } = useAnalysisPersistence({
    id,
    detailRef,
    onChangeRef,
    workingRef,
    refreshDetail,
  });

  // 표에서 선택된 문항 — 우측 분석 패널(PC) / 펼친 카드(모바일) 공용.
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  // 모바일 스텝 플로우 상태(PC 무영향 — lg:hidden 트리에서만 쓴다).
  const [mobileStep, setMobileStep] = useState<MobileStep>("map");
  const [mobileSourceOpen, setMobileSourceOpen] = useState(false);

  // ── 분석 드라이버(시작/재점화 1회 POST) ───────────────────────────────────
  // {resume:true} 를 받아도 재 POST 하지 않는다 — 다음 라운드는 서버 자가연쇄가
  // 잇고, 클라는 폴링 감시견으로 정체만 감시한다(계약 §2). 202/409/에러 분기 유지.
  const runAnalyze = useCallback(
    async (numbers?: string[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      // 전체 재실행(단일 문항 재분석 아님)일 때만 진행뷰를 붙잡는다.
      const fullRun = !numbers || numbers.length === 0;
      if (fullRun) setDriving(true);
      if (numbers && numbers.length > 0) {
        setReanalyzing(new Set(numbers));
      }
      // 낙관적 진입 표시(이미 ANALYZING 이면 무영향).
      if (detailRef.current.status !== "ANALYZING") {
        onChangeRef.current({ ...detailRef.current, status: "ANALYZING" });
      }
      try {
        let res: Response;
        try {
          res = await fetch(`/api/exam-report/analyses/${id}/analyze`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(numbers ? { numbers } : {}),
          });
        } catch {
          return; // 네트워크 오류 — 폴링/감시견/리컨실이 이어서 처리
        }
        if (res.status === 402) {
          toast.error("크레딧이 부족합니다", {
            description: "충전 후 다시 시도해 주세요.",
            action: {
              label: "크레딧 관리",
              onClick: () => {
                window.location.href = creditsHref;
              },
            },
          });
          return;
        }
        if (res.status === 409) return; // 다른 곳에서 진행 중 / 상태 변경
        // 202 {inProgress:true}: 이미 신선한 잡이 진행 중 — 폴링만 유지.
        if (res.status === 202) return;
        if (!res.ok) {
          toast.error("문항 분석 중 오류가 발생했습니다.");
          return;
        }
        // 200: 종결({status:...}) 또는 미종결({resume:true}) — 어느 쪽이든 여기서
        // 끝. 미종결이면 서버가 after() 로 자기 자신을 재개 POST 한다(W1).
      } finally {
        busyRef.current = false;
        setReanalyzing(new Set());
        // 응답 종료 후 상세를 재페치해 서버 status(ANALYZING/ANALYZED/FAILED)로
        // 수렴시킨 뒤 진행뷰 붙잡기를 해제한다(D4).
        await refreshDetail();
        if (fullRun) setDriving(false);
      }
    },
    [id, creditsHref, refreshDetail],
  );

  // 허브에서 업로드 직후 ?start=1 로 진입 → DRAFT+sourceFiles 면 E1 분석 1회 자동 시작.
  // 클라 전용(window.location)으로 읽어 useSearchParams Suspense 경계 요구를 피한다.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") !== "1") return;
    // 쿼리 제거 — 새로고침/뒤로가기 시 재시작 방지.
    window.history.replaceState(null, "", window.location.pathname);
    const d = detailRef.current;
    if (d.status === "DRAFT" && (d.sourceFiles?.length ?? 0) > 0) {
      void runAnalyze(undefined);
    }
  }, [runAnalyze]);

  // ── 감시견: 서버 자가연쇄 단선 감지 → 1회 재점화 ──────────────────────────
  // 폴 tick 마다 최신 상세로 정체를 판정한다. 진행(updatedAt)이 다시 관측되면
  // 재점화 1회권을 복원해 "정체 에피소드당 1회"로 제한한다(재점화 폭주 방지).
  const watchdogFiredRef = useRef(false);
  const lastProgressAtRef = useRef<number | null>(null);
  const watchdogTick = useCallback(
    (next: ExamAnalysisDetail) => {
      if (next.status !== "ANALYZING" || busyRef.current) return;
      const progressAt = next.aiMeta.progress?.updatedAt ?? null;
      if (progressAt != null && progressAt !== lastProgressAtRef.current) {
        lastProgressAtRef.current = progressAt;
        watchdogFiredRef.current = false;
      }
      if (watchdogFiredRef.current) return;
      const now = Date.now();
      const stalled =
        progressAt != null
          ? now - progressAt > WATCHDOG_PROGRESS_STALL_MS
          : next.aiMeta.runStartedAt != null
            ? now - next.aiMeta.runStartedAt > WATCHDOG_RUN_START_STALL_MS
            : false;
      if (!stalled) return;
      watchdogFiredRef.current = true;
      // 202(이미 진행 중)/409 는 무해 — 서버 펜스가 이중 실행을 차단한다.
      void runAnalyze(undefined);
    },
    [runAnalyze],
  );

  // ANALYZING 동안(또는 드라이버가 도는 동안) 5초 폴링으로 체크포인트(진행분) 반영
  // + 감시견 판정. driving 도 조건에 포함해, 시작 직후 서버가 아직 DRAFT 라 status 가
  // 순간 뒤로 밀려도 폴링이 끊기지 않고 이어져 ANALYZING 으로 수렴한다(D4).
  useEffect(() => {
    if (detail.status !== "ANALYZING" && !driving) return;
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5_000,
      run: async (signal) => {
        try {
          const res = await fetch(`/api/exam-report/analyses/${id}`, {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { analysis: ExamAnalysisDetail };
          if (signal.aborted) return null;
          onChangeRef.current(data.analysis);
          watchdogTick(data.analysis);
          const n = data.analysis.analysis?.perQuestion.length ?? 0;
          return `${data.analysis.status}:${n}:t${Date.now()}`;
        } catch {
          return null;
        }
      },
    });
  }, [detail.status, driving, id, watchdogTick]);

  // ── 파생 값 ────────────────────────────────────────────────────────────────
  const examMap = detail.examMap;
  const questions = examMap?.questions ?? [];
  const perQuestion = detail.analysis?.perQuestion ?? [];
  const analysisByNumber = new Map(
    perQuestion.map((a) => [numberKey(a.number), a]),
  );
  // 검수 확정 집합은 numberKey(공백정규화) 기준 비교 — 저장값은 원문 유지.
  const confirmedSet = new Set(
    (detail.reviewState.confirmedNumbers ?? []).map(numberKey),
  );
  const okList = perQuestion.filter((a) => a.analysisStatus === "OK");
  const confirmedCount = okList.filter((a) =>
    confirmedSet.has(numberKey(a.number)),
  ).length;
  const completed = questions.filter((q) =>
    analysisByNumber.has(numberKey(q.number)),
  ).length;
  const unjudgedCount = questions.length - completed;

  const hasMap = questions.length > 0;
  const hasProgress = perQuestion.length > 0;
  // 서버 status 가 ANALYZING 이거나, 전체 드라이버가 도는 중이면 언제나 진행뷰가
  // 이긴다(D4: 시작 직후 폴링이 되받은 DRAFT 상세가 idle 로 되돌리는 것 차단).
  const analyzing = detail.status === "ANALYZING" || driving;
  // 저장은 더 이상 입력을 막지 않는다 — 낙관 반영 + 디바운스 배치 + 직렬 저장이라
  // 타이핑 중 잠글 이유가 없다(과거엔 saving 이 표 전체를 비활성화해 22행 연타 입력과
  // 싸웠다). 분석 진행 중(analyzing)만 편집을 잠근다.
  const locked = analyzing;

  // 학생 관리 게이트 상태 — 확인 진행률/승계 여부의 단일 판정(map-gate).
  const mapGate = getMapGateStatus({
    questionNumbers: questions.map((q) => q.number),
    reviewState: detail.reviewState,
    studentCount: detail.students.length,
  });

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  // 우측 패널이 띄울 문항 — 표 선택값에서 파생(선택 없으면 총평만 보이는 빈 상태).
  const selectedIndex = selectedNumber
    ? sortedQuestions.findIndex((q) => q.number === selectedNumber)
    : -1;
  const selectedEntry =
    selectedIndex >= 0 ? sortedQuestions[selectedIndex] : null;
  const selectedAnalysis = selectedEntry
    ? (analysisByNumber.get(numberKey(selectedEntry.number)) ?? null)
    : null;

  // 문항 칩 스트립 소스 — OK/FAILED/미판정 상태와 카드 스크롤 타깃.
  const chips: QuestionChipInfo[] = sortedQuestions.map((q) => {
    const key = numberKey(q.number);
    const a = analysisByNumber.get(key);
    return {
      number: q.number,
      state: !a ? "PENDING" : a.analysisStatus === "FAILED" ? "FAILED" : "OK",
      targetId: `exam-qa-${key}`,
    };
  });
  const scrollToCard = useCallback((targetId: string) => {
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // (유형 칩 벽 제거) AI 가 만든 유형 라벨은 문항마다 거의 고유해 22문항이면 count 1
  // 짜리 칩이 15~20개 생겨 필터가 아니라 사실상 네비게이션이었다. 유형 필터는
  // 채점 지도 툴바의 드롭다운으로 대체했다(ExamMapTable).

  // 중단된 부분 분석 재개 CTA — reconcile 이 DRAFT 로 강등한 건/부분 FAILED 건도
  // 막다른 화면 없이 이어서 분석 가능(RCA #3 수리).
  const canResume =
    (detail.status === "DRAFT" || detail.status === "FAILED") &&
    !analyzing &&
    hasMap &&
    unjudgedCount > 0;

  // ── DRAFT / 미분석: 분석 시작 CTA ──────────────────────────────────────────
  if (!hasMap && !analyzing) {
    return (
      <div className="flex flex-col gap-4">
        {detail.status === "FAILED" && (
          <AnalysisFailedBanner
            onRetry={() => void runAnalyze(undefined)}
            busy={driving}
            refundedCredits={detail.aiMeta.refundedCredits}
          />
        )}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-slate-500">
              업로드한 시험지를 AI 가 직접 분석합니다. 정답·배점·문항 해설을 한
              번에 생성해요.
            </p>
            <Button
              type="button"
              onClick={() => void runAnalyze(undefined)}
              disabled={!detail.sourceFiles || detail.sourceFiles.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Play className="h-4 w-4" />
              시험 분석 시작
            </Button>
            {/* 과금 안내 — CreditCostChip 표준 표기(◈·"N 크레딧" 텍스트 금지). */}
            <p className="flex items-center justify-center gap-1 text-xs text-slate-400">
              분석 비용: 문항당
              <CreditCostChip
                amount={CREDIT_COSTS.EXAM_ANALYSIS}
                className="text-slate-500"
              />
              · 최소
              <CreditCostChip
                amount={EXAM_ANALYSIS_MIN_CREDITS}
                className="text-slate-500"
              />
            </p>
          </div>
        </section>
      </div>
    );
  }

  // ── ANALYZING 이고 지도/진행분이 아직 없으면 전체 진행 화면(문항 인식 중) ──
  if (analyzing && !hasMap && !hasProgress) {
    return <AnalysisProgress completed={0} total={0} />;
  }

  // ── 분석 결과 뷰(진행 스트립 + 지도 + 카드 + 종합) ────────────────────────
  const sourcesVisible = sourcesOpen && (detail.sourceFiles?.length ?? 0) > 0;

  return (
    // xl+: 시험지 원본 패널이 열리면 기존 콘텐츠(좌 컬럼)를 왼쪽으로 밀어내는
    // 분할 행. items-start 로 우측 패널 컬럼이 자기 높이만 갖게 해 sticky 성립.
    <div
      ref={splitContainerRef}
      className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
      {/* 시험지 총평 시트 — 트리거는 워크스페이스 헤더(「시험지 원본」 옆), 열림
          상태만 상위가 제어한다. 편집 저장은 여기 파이프라인(handleEditExamLevel)을
          그대로 타므로 버전 충돌이 없다. 콘텐츠는 body 로 포털돼 위치는 무관. */}
      <Sheet open={overviewOpen} onOpenChange={onOverviewOpenChange}>
        <ResizableSheetContent
          storageKey="smoat.examReport.overviewSheet.width"
          defaultWidth={560}
          minWidth={420}
        >
          <SheetHeader>
            <SheetTitle>시험지 총평</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">
            <ExamOverviewPanel
              examLevel={detail.analysis?.examLevel ?? null}
              disabled={locked}
              onEdit={handleEditExamLevel}
            />
          </div>
        </ResizableSheetContent>
      </Sheet>

      {analyzing && (
        <AnalysisProgressStrip
          progress={detail.aiMeta.progress ?? null}
          fallbackCompleted={completed}
          fallbackTotal={questions.length}
          chips={chips}
          onChipClick={scrollToCard}
        />
      )}
      {canResume && (
        <ResumeAnalysisBanner
          remaining={unjudgedCount}
          busy={driving}
          onResume={() => void runAnalyze(undefined)}
        />
      )}
      {detail.status === "FAILED" && !canResume && (
        <AnalysisFailedBanner
          onRetry={() => void runAnalyze(undefined)}
          busy={driving}
          refundedCredits={detail.aiMeta.refundedCredits}
        />
      )}

      {/* xl 미만: 분할 컬럼 대신 지도 위 블록 카드로 원본 표시(줌 동일).
          !isXl 조건 마운트 — xl 패널과 동시에 살아 서명 URL POST 가 2배로
          나가고 줌 상태가 갈라지던 이중 마운트 차단. */}
      {sourcesVisible && !isXl && (
        <div className="h-[70vh] xl:hidden">
          <SourcePanel
            analysisId={detail.id}
            sourceFiles={detail.sourceFiles ?? []}
            onClose={() => setSourcesOpen(false)}
          />
        </div>
      )}
      {/* ── 모바일(시안 A) — 스텝 플로우. PC 트리와 완전 분리(lg:hidden) ────── */}
      {hasMap && examMap && (
        <div className="flex flex-col gap-3 lg:hidden">
          <MobileStepHeader
            steps={MOBILE_STEPS}
            currentKey={mobileStep}
            onSelect={(key) => {
              // ③ 학생 관리는 게이트 통과 전엔 못 간다 — 상위가 막고 유도한다.
              if (key === "students") {
                onAdvance();
                return;
              }
              setMobileStep(key as MobileStep);
            }}
          />

          {mobileStep === "map" && (
            <MobileMapFlow
              entries={examMap.questions}
              confirmedNumbers={detail.reviewState.mapConfirmedNumbers ?? []}
              grandfathered={mapGate.grandfathered}
              failedNumbers={detail.aiMeta.failedNumbers ?? []}
              analysisByNumber={analysisByNumber}
              disabled={locked}
              openNumber={selectedNumber}
              onOpenNumber={setSelectedNumber}
              onEdit={handleEditMapEntry}
              onToggleConfirm={(numbers, confirmed) =>
                void handleToggleMapConfirm(numbers, confirmed)
              }
              onOpenSource={() => setMobileSourceOpen(true)}
              onReanalyze={(number) => void runAnalyze([number])}
            />
          )}

          {mobileStep === "review" && (
            <div className="flex flex-col gap-2.5">
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-400">
                리포트 문구용 · 채점에는 영향 없어요 · 검수{" "}
                <span className="font-bold tabular-nums text-slate-600">
                  {confirmedCount}/{okList.length}
                </span>
              </p>
              {sortedQuestions.map((q) => {
                const key = numberKey(q.number);
                const a = analysisByNumber.get(key);
                if (!a) return null;
                return (
                  <QuestionAnalysisCard
                    key={q.number}
                    question={q}
                    analysis={a}
                    isConfirmed={confirmedSet.has(key)}
                    busy={reanalyzing.has(q.number)}
                    saving={locked}
                    onToggleConfirm={() => handleToggleConfirm(q.number)}
                    onReanalyze={() => void runAnalyze([q.number])}
                    onEditField={(patch) => handleEditField(q.number, patch)}
                  />
                );
              })}
            </div>
          )}

          {/* 하단 고정 바 — 미확인이 남으면 연파랑(곧 갈 수 있는 길) + 힌트 글로우 */}
          <MobileStepNav
            prev={
              mobileStep === "review"
                ? { label: "이전", onClick: () => setMobileStep("map") }
                : null
            }
            next={
              mobileStep === "map"
                ? {
                    label: mapGate.open
                      ? "다음 단계로"
                      : `다음 단계로 — ${mapGate.confirmedCount}/${mapGate.totalCount} 검수`,
                    onClick: mapGate.open
                      ? () => setMobileStep("review")
                      : undefined,
                    onDisabledHint: () => {
                      const first = mapGate.pendingNumbers[0];
                      if (!first) return;
                      setSelectedNumber(first);
                      requestAnimationFrame(() =>
                        triggerHintGlow(
                          document.querySelector(
                            `[data-map-card="${CSS.escape(first)}"]`,
                          ),
                          { scrollBlock: "center" },
                        ),
                      );
                    },
                  }
                : { label: "학생 관리로", onClick: onAdvance }
            }
            hint={
              mobileStep === "map" && !mapGate.open
                ? "정답·배점을 모두 검수하면 넘어갈 수 있어요"
                : undefined
            }
          />
          {/* 고정 바에 본문이 가리지 않도록 여백 예약 */}
          <div aria-hidden="true" className="h-24" />

          {/* 원본 사진 — 모바일에선 표(안의 시트)가 없으므로 여기서 연다 */}
          <Sheet open={mobileSourceOpen} onOpenChange={setMobileSourceOpen}>
            <SheetContent side="right" className="w-[92vw] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>시험지 원본</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <SourceImageViewer
                  analysisId={detail.id}
                  sourceFiles={detail.sourceFiles ?? []}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* 시안 B — 채점 지도(주인공) + 우측 424px 분석 패널.
          문항 분석은 22장 아코디언이 아니라 표에서 고른 하나만 우측에 띄운다.
          (PC 전용 — 모바일은 위 스텝 플로우가 담당)

          2열 분기는 뷰포트(xl)가 아니라 **실제 가용 폭**(@container) 기준이다:
          표 min-w 760 + gap 16 + 패널 424 = 1200px 이 맨몸 최소치인데, 뷰포트
          1280 이어도 사이드바·패딩·팝업 여백을 빼면 실폭이 1000px 대라 2열이
          켜지는 순간 표가 min-width 로 짓눌려 가로 스크롤이 났다. 1360px 부터
          켜서 2열 진입 시 표가 최소 900px 는 확보하도록 여유를 준다. */}
      {hasMap && examMap && (
        <div className="@container hidden lg:block">
          <div className="grid grid-cols-1 items-start gap-4 @min-[1360px]:grid-cols-[1fr_424px]">
            <ExamMapTable
              entries={examMap.questions}
              confirmedNumbers={detail.reviewState.mapConfirmedNumbers ?? []}
              grandfathered={mapGate.grandfathered}
              disabled={locked}
              saveState={saveState}
              analyzing={analyzing}
              failedNumbers={detail.aiMeta.failedNumbers ?? []}
              selectedNumber={selectedNumber}
              sourceFiles={detail.sourceFiles ?? []}
              sourcesOpen={sourcesOpen}
              onToggleSources={() => setSourcesOpen((v) => !v)}
              onEdit={handleEditMapEntry}
              onToggleConfirm={(numbers, confirmed) =>
                void handleToggleMapConfirm(numbers, confirmed)
              }
              onSelectNumber={setSelectedNumber}
            />

            <aside className="@min-[1360px]:sticky @min-[1360px]:top-4 @min-[1360px]:self-start">
              <QuestionSidePanel
                entry={selectedEntry}
                analysis={selectedAnalysis}
                isConfirmed={
                  !!selectedEntry &&
                  confirmedSet.has(numberKey(selectedEntry.number))
                }
                reviewedCount={confirmedCount}
                reviewableCount={okList.length}
                disabled={locked}
                busy={!!selectedEntry && reanalyzing.has(selectedEntry.number)}
                hasPrev={selectedIndex > 0}
                hasNext={
                  selectedIndex >= 0 &&
                  selectedIndex < sortedQuestions.length - 1
                }
                onPrev={() =>
                  setSelectedNumber(
                    sortedQuestions[selectedIndex - 1]?.number ?? null,
                  )
                }
                onNext={() =>
                  setSelectedNumber(
                    sortedQuestions[selectedIndex + 1]?.number ?? null,
                  )
                }
                onClose={() => setSelectedNumber(null)}
                onToggleConfirm={() =>
                  selectedEntry && handleToggleConfirm(selectedEntry.number)
                }
                onReanalyze={() =>
                  selectedEntry && void runAnalyze([selectedEntry.number])
                }
                onEditField={(patch) =>
                  selectedEntry && handleEditField(selectedEntry.number, patch)
                }
              />
            </aside>
          </div>
        </div>
      )}

      {/* 다음으로 (학생 관리) — 팝업 하단에 고정되는 바.
          PageShell 좌우·하단 패딩을 음수 마진으로 상쇄해 팝업 폭을 가로지르고,
          스크롤 컨테이너(팝업 본문) 기준 sticky bottom-0 으로 붙는다.
          게이트가 닫혀 있으면 상위(workspace-client)가 막고 미확인 문항으로 유도하므로
          버튼은 항상 눌리게 두되(aria-disabled), 남은 개수는 옆 문구로 알린다.
          모바일은 MobileStepNav 가 같은 역할의 고정 바를 이미 깔아서 여기선 숨긴다
          (lg:flex) — 안 그러면 하단에 바가 두 개 겹친다. */}
      {detail.status === "ANALYZED" && (
        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-auto hidden items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:flex">
          {!mapGate.open && (
            <span className="text-[11.5px] text-slate-400">
              정답·배점을 모두 검수하면 열려요 ·{" "}
              <span className="font-semibold tabular-nums text-slate-500">
                {mapGate.confirmedCount}/{mapGate.totalCount}
              </span>
            </span>
          )}
          <Button
            type="button"
            onClick={onAdvance}
            aria-disabled={!mapGate.open || undefined}
            // 기본 폭(~150px)의 약 2배로 존재감을 준다. 새 arbitrary/스케일 유틸은
            // turbopack JIT 가 늦게 굽는 함정이 있어(min-w-[280px]/min-w-72 모두 미생성
            // 확인), 폭만은 인라인 style 로 못박아 확실히 적용한다. 문구가 길면 자람.
            style={{ minWidth: 288 }}
            className={cn(
              mapGate.open
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-blue-300 shadow-none hover:bg-blue-300",
            )}
          >
            다음으로 (학생 관리)
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      </div>

      {/* 우: 시험지 원본 분할 패널(xl+) — 핸들 드래그로 폭 조절, 클릭으로 닫기.
          sticky + 뷰포트 높이로 좌측을 스크롤해도 원본이 계속 보인다(대조 용도).
          isXl 조건 마운트 — 모바일 폴백과의 이중 마운트 차단(위 주석 참조). */}
      {sourcesVisible && isXl && (
        <div className="hidden shrink-0 xl:sticky xl:top-4 xl:flex xl:h-[calc(100vh-32px)]">
          <PanelHandle
            label="시험지 원본"
            panelKey="sources"
            collapsed={false}
            side="right"
            startResize={startPanelResize}
            toggleCollapsed={togglePanelCollapsed}
            expand={expandPanel}
          />
          <div style={{ width: panelWidths.sources }} className="h-full">
            <SourcePanel
              analysisId={detail.id}
              sourceFiles={detail.sourceFiles ?? []}
              onClose={() => setSourcesOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
