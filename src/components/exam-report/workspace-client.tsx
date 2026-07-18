"use client";

// ============================================================================
// 학생 시험 리포트 — 분석 워크스페이스 셸 (v3)
//
// 책임: 상세 로드 / 탭 전환·인디케이터 / 헤더·상태 뱃지 조립.
// 탭 2개: [문항 분석 | 학생 관리] (구조검수 폐기). 각 탭 UI 는 스텝 컴포넌트가
// 담당하고, 셸은 props 계약(ui-contracts)만 안다.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BarChart3,
  Check,
  ChevronRight,
  FileBarChart,
  ImageIcon,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import type {
  ExamAnalysisDetail,
  ExamWorkspaceStep,
} from "./ui-contracts";
import type { ExamType } from "@/lib/exam-report/types";
import { getMapGateStatus } from "@/lib/exam-report/map-gate";
import { triggerHintGlow } from "@/lib/hint-glow";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SourceImageViewer } from "./source-image-viewer";
import { ResizableSheetContent } from "./resizable-sheet-content";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { AnalysisStep } from "./analysis/analysis-step";
import { StudentsTab } from "./students/students-tab";
import { useWorkspaceModalClose } from "./workspace-modal";

const HUB_HREF = "/director/workbench/exam-report";

interface WorkspaceClientProps {
  analysisId: string;
  /** 팝업(WorkspaceModal) 안에서 렌더 — 페이지 문맥 전제(-m-6·100vh·배경)를 벗는다. */
  embedded?: boolean;
}

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  MIDTERM: "중간고사",
  FINAL: "기말고사",
  MOCK: "모의고사",
  OTHER: "기타",
};

// ── 탭 정의 ─────────────────────────────────────────────────────────────────

const STEPS: { key: ExamWorkspaceStep; label: string }[] = [
  { key: "analysis", label: "문항 분석" },
  { key: "students", label: "학생 관리" },
];

/** 학생 관리 게이트 — 정답·배점 문항별 확인이 끝나야 열린다(map-gate 단일 판정). */
function gateStatusOf(detail: ExamAnalysisDetail) {
  return getMapGateStatus({
    questionNumbers: (detail.examMap?.questions ?? []).map((q) => q.number),
    reviewState: detail.reviewState,
    studentCount: detail.students.length,
  });
}

/** 로드 시점의 status 로 기본 탭을 정한다(이후는 수동 전환). */
function deriveInitialStep(detail: ExamAnalysisDetail): ExamWorkspaceStep {
  // 이미 분석 완료 + 학생이 있으면 학생 관리로, 그 외엔 문항 분석부터.
  // 단 게이트가 닫혀 있으면(정답·배점 미확인) 건너뛰기 금지 — 검증이 먼저다.
  if (
    detail.status === "ANALYZED" &&
    detail.students.length > 0 &&
    gateStatusOf(detail).open
  ) {
    return "students";
  }
  return "analysis";
}

function isStepComplete(
  detail: ExamAnalysisDetail,
  step: ExamWorkspaceStep,
): boolean {
  // "AI 분석 완료"가 아니라 "사람이 정답·배점을 확인 완료"를 뜻해야 한다.
  // (기존엔 status==="ANALYZED" 라 0/22 인데도 체크마크가 켜졌다.)
  if (step === "analysis") return gateStatusOf(detail).open;
  return false;
}

/**
 * B4 폴 유지 판정 — 판독/리포트 생성 중이거나, 답안 링크가 활성인데 아직 미제출인
 * 학생(외부 제출 이벤트 대기). hasLiveStudent 계산과 폴 내부 필터가 반드시 같은
 * 판정식을 쓰도록 단일화한다.
 */
function isLiveStudent(s: ExamAnalysisDetail["students"][number]): boolean {
  return (
    s.readState.status === "READING" ||
    s.reportStatus === "GENERATING" ||
    (s.answerEnabled && !s.answerSubmittedAt)
  );
}

// ── 셸 ──────────────────────────────────────────────────────────────────────

export function ExamReportWorkspaceClient({
  analysisId,
  embedded = false,
}: WorkspaceClientProps) {
  // 팝업 안이면 닫기 핸들, 전체 페이지면 null (헤더가 X 렌더 여부를 이걸로 판단)
  const closeModal = useWorkspaceModalClose();
  // 시험지 총평 시트 — 트리거는 이 헤더(「시험지 원본」 옆), 콘텐츠·저장은 AnalysisStep.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [detail, setDetail] = useState<ExamAnalysisDetail | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "notFound" | "error">(
    "loading",
  );
  const [step, setStep] = useState<ExamWorkspaceStep>("analysis");
  // 최초 로드 시 한 번만 기본 탭을 세팅 — onDetailChange 로 detail 이 갱신돼도
  // 사용자가 고른 탭을 되돌리지 않는다.
  const stepInitializedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam-report/analyses/${analysisId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 404) {
        setPhase("notFound");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const data = (await res.json()) as { analysis: ExamAnalysisDetail };
      setDetail(data.analysis);
      if (!stepInitializedRef.current) {
        // 허브 보드 "학생 추가" CTA(?openAddStudent=1) — 기본 탭 파생과 무관하게
        // 학생 관리 탭으로 직행해야 StudentsTab 이 마운트되어 파라미터를 소비
        // (학생 추가 다이얼로그 오픈 + URL 정리)한다. 학생 0명(ANALYZED)이면
        // deriveInitialStep 이 analysis 탭을 골라 CTA 가 무산되는 갭을 막는다.
        const wantsAddStudent =
          new URLSearchParams(window.location.search).get("openAddStudent") ===
          "1";
        setStep(
          wantsAddStudent ? "students" : deriveInitialStep(data.analysis),
        );
        stepInitializedRef.current = true;
      }
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [analysisId]);

  useEffect(() => {
    // 마운트 시 1회 서버 로드(외부 시스템 동기화) — setState 는 fetch 콜백에서만
    // 일어나므로 캐스케이드 렌더 우려가 없다(규칙 오탐, 학생 워크스페이스와 동일).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleDetailChange = useCallback((next: ExamAnalysisDetail) => {
    setDetail(next);
  }, []);

  // 게이트에 막힌 클릭 — 문항 분석으로 돌려보내고 해야 할 일(채점 지도)로 시선을
  // 끈다. 막기만 하고 방치하면 "왜 안 눌리지"가 되므로 반드시 유도까지 한다.
  const handleGateBlocked = useCallback(() => {
    setStep("analysis");
    // 탭 전환 렌더 후에 대상이 DOM 에 붙으므로 다음 프레임에 글로우.
    requestAnimationFrame(() => {
      triggerHintGlow(document.querySelector("[data-exam-map-panel]"), {
        scrollBlock: "center",
      });
    });
    toast.info("정답·배점을 모두 검수하면 학생 관리로 넘어갈 수 있어요.");
  }, []);

  const advanceFromAnalysis = useCallback(() => {
    if (detail && !gateStatusOf(detail).open) {
      handleGateBlocked();
      return;
    }
    setStep("students");
  }, [detail, handleGateBlocked]);

  // B4: 학생 관리 탭 라이브 갱신 — 판독(READING)/리포트 생성(GENERATING) 중인 학생이
  // 있으면 상세를 주기 재페치해 pulse 뱃지·상태를 갱신한다(문항 분석 ANALYZING 폴링과
  // 동일 패턴). 살아있는 학생이 사라지면 startAdaptivePoll cleanup 으로 폴링 종료.
  // (결함수리) 활성 답안 링크 대기(answerEnabled && 미제출)도 라이브로 취급 —
  // 학생의 /a/{token} 제출은 외부 이벤트라 어떤 로컬 액션도 재페치를 트리거하지
  // 못해 "제출됨" 뱃지가 새로고침 전까지 영원히 안 떴다. 제출되면(answerSubmittedAt
  // 세팅) 조건이 소멸해 폴이 자연 종료된다.
  const hasLiveStudent = detail?.students.some(isLiveStudent) ?? false;
  useEffect(() => {
    if (phase !== "ready" || !hasLiveStudent) return;
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5_000,
      run: async (signal) => {
        try {
          const res = await fetch(`/api/exam-report/analyses/${analysisId}`, {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          if (!res.ok) return null;
          const data = (await res.json()) as { analysis: ExamAnalysisDetail };
          if (signal.aborted) return null;
          setDetail(data.analysis);
          const live = data.analysis.students.filter(isLiveStudent).length;
          return `${data.analysis.status}:${live}:t${Date.now()}`;
        } catch {
          return null;
        }
      },
    });
  }, [phase, hasLiveStudent, analysisId]);

  if (phase === "loading") {
    return (
      <PageShell embedded={embedded}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </PageShell>
    );
  }

  if (phase === "notFound" || phase === "error") {
    return (
      <PageShell embedded={embedded}>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-slate-500">
            {phase === "notFound"
              ? "분석을 찾을 수 없습니다."
              : "불러오는 중 문제가 발생했습니다."}
          </p>
          <div className="flex items-center gap-2">
            {phase === "error" && (
              <button
                type="button"
                onClick={() => {
                  setPhase("loading");
                  void load();
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                다시 시도
              </button>
            )}
            <Link
              href={HUB_HREF}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              목록으로
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!detail) return null;

  const metaParts = [
    detail.schoolName,
    detail.grade,
    EXAM_TYPE_LABEL[detail.examType],
    detail.examYear ? `${detail.examYear}년` : null,
    detail.semester,
  ].filter((v): v is string => Boolean(v));

  return (
    <PageShell embedded={embedded}>
      <main className="flex w-full min-w-0 flex-1 flex-col gap-4">
        {/* 헤더 — 제목 + 탭 인디케이터 (+ 팝업이면 닫기 X).
            팝업에선 **풀블리드 고정 헤더**: PageShell 의 좌우/상단 패딩을 음수 마진으로
            상쇄해 팝업 카드의 좌·우·상 끝에 딱 붙이고(둥근 모서리는 팝업 카드의
            overflow-hidden 이 잘라준다), 스크롤 컨테이너(팝업 본문) 기준 sticky top-0 로
            고정한다. 떠 있는 카드가 아니라 창의 헤더 바처럼 보이게 하는 게 목적이라
            rounded/side-border/shadow 를 뺀다. 전체 페이지 폴백에서는 평범한 카드로 흐른다.
            상태·검수 진행은 탭/본문이 이미 보여줘 헤더 뱃지는 중복이라 제거. */}
        <div
          className={
            embedded
              ? "sticky top-0 z-20 -mx-4 -mt-4 sm:-mx-6"
              : undefined
          }
        >
          <section
            className={
              embedded
                ? "flex min-w-0 flex-col border-b border-slate-200 bg-white"
                : "flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <WorkflowPageTitle
                  icon={FileBarChart}
                  title={detail.title}
                  description={
                    metaParts.length > 0 ? metaParts.join(" · ") : undefined
                  }
                />
                {/* 시험지 원본 — 정답·배점 검수 내내 대조하는 자료라 특정 패널이
                    아닌 헤더(제목 옆)에 상주시킨다. 시트는 대조 가능해야 하므로
                    최소 화면 절반 폭(기본 sm:max-w-sm 캡 해제). */}
                {(detail.sourceFiles?.length ?? 0) > 0 && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        <ImageIcon className="h-3.5 w-3.5" />
                        시험지 원본
                      </Button>
                    </SheetTrigger>
                    <ResizableSheetContent
                      storageKey="smoat.examReport.sourceSheet.width"
                      defaultWidth={640}
                      minWidth={420}
                    >
                      <SheetHeader>
                        <SheetTitle>시험지 원본</SheetTitle>
                      </SheetHeader>
                      <div className="px-4 pb-6">
                        <SourceImageViewer
                          analysisId={detail.id}
                          sourceFiles={detail.sourceFiles ?? []}
                        />
                      </div>
                    </ResizableSheetContent>
                  </Sheet>
                )}
                {/* 시험지 총평 — 「시험지 원본」 바로 오른쪽. 시트 콘텐츠·저장은
                    AnalysisStep(문항 분석 스텝) 에 있으므로, 그 스텝일 때만 노출한다.
                    (다른 탭에선 스텝이 언마운트돼 시트가 안 열림) */}
                {step === "analysis" && detail.status === "ANALYZED" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOverviewOpen(true)}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    시험지 총평
                  </Button>
                )}
              </div>
              {/* 닫기 — 팝업일 때만(전체 페이지에선 컨텍스트가 없어 렌더 안 함) */}
              {closeModal && (
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="닫기"
                  title="닫기 (Esc)"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <TabIndicator
              detail={detail}
              current={step}
              onSelect={setStep}
              onGateBlocked={handleGateBlocked}
            />
          </section>
        </div>

        {/* 탭 본문 */}
        {step === "analysis" && (
          <AnalysisStep
            detail={detail}
            onDetailChange={handleDetailChange}
            onAdvance={advanceFromAnalysis}
            overviewOpen={overviewOpen}
            onOverviewOpenChange={setOverviewOpen}
          />
        )}
        {step === "students" && (
          <StudentsTab
            detail={detail}
            onDetailChange={handleDetailChange}
            onBack={() => setStep("analysis")}
          />
        )}
      </main>
    </PageShell>
  );
}

// ── 페이지 셸 ────────────────────────────────────────────────────────────────
// 로딩/에러/본문이 동일한 배경·여백 셸을 공유하도록 고정(A8) — 분기 간 레이아웃 점프 방지.
/**
 * 로딩/에러/본문이 동일한 배경·여백 셸을 공유하도록 고정(A8) — 분기 간 레이아웃 점프 방지.
 *
 * embedded = 팝업(WorkspaceModal) 안에서 렌더될 때. 페이지 문맥 전제를 벗는다:
 *  - `-m-6`(페이지 패딩 상쇄)는 팝업 안에선 카드 밖으로 삐져나가므로 제거
 *  - `min-h-[calc(100vh-56px)]`(헤더 뺀 전체 높이)도 팝업이 높이를 쥐므로 제거
 *  - 배경은 팝업 카드가 이미 깔아서 중복 불필요
 * 좌우 여백은 팝업 카드의 인셋(mx-8~20)이 만들어 주므로 셸은 최소만 준다.
 */
function PageShell({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  return (
    // pb-20(페이지 모드): 본문 하단 숨통 — 마지막 카드가 뷰포트 바닥에 붙어 답답하던
    // 문제(유저 피드백). 모달 임베드는 자체 스크롤 컨테이너라 py-4 유지.
    <div
      className={
        embedded
          ? "flex min-h-full min-w-0 flex-col px-4 py-4 sm:px-6"
          : "-m-6 flex min-h-[calc(100vh-56px)] min-w-0 flex-col bg-[#F4F6F9] px-4 pb-20 pt-4 sm:px-6 xl:px-8"
      }
    >
      {children}
    </div>
  );
}

// ── 탭 인디케이터 ───────────────────────────────────────────────────────────

function TabIndicator({
  detail,
  current,
  onSelect,
  onGateBlocked,
}: {
  detail: ExamAnalysisDetail;
  current: ExamWorkspaceStep;
  onSelect: (step: ExamWorkspaceStep) => void;
  /** 게이트에 막힌 클릭 — 해야 할 일(미확인 문항)로 유도 */
  onGateBlocked: () => void;
}) {
  const gate = gateStatusOf(detail);
  return (
    // py-3: 스텝 칩이 헤더 카드 하단 보더에 붙어 답답하던 문제(유저 피드백) —
    // 고정 h-11(칩 상하 6px)을 풀고 상하 12px 숨통을 준다.
    <nav className="flex shrink-0 flex-wrap items-center gap-1.5 overflow-visible px-3 py-3 sm:flex-nowrap">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const complete = isStepComplete(detail, s.key);
        const count =
          s.key === "students" ? detail.students.length : undefined;
        // 게이트: 정답·배점 확인 전에는 학생 관리 진입 차단. native disabled 대신
        // aria-disabled 로 두어 클릭을 받고, 해야 할 일(미확인 문항)로 유도한다.
        const gated = s.key === "students" && !gate.open;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <button
              type="button"
              aria-disabled={gated || undefined}
              title={
                gated
                  ? `정답·배점을 모두 검수하면 열려요 (${gate.confirmedCount}/${gate.totalCount})`
                  : undefined
              }
              onClick={() => (gated ? onGateBlocked() : onSelect(s.key))}
              className={
                "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (active
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
                  : gated
                    ? "cursor-not-allowed border-transparent text-slate-300"
                    : "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
              }
            >
              <span
                className={
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold " +
                  (active
                    ? "bg-blue-600 text-white"
                    : complete
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-slate-200 text-slate-500")
                }
              >
                {gated ? (
                  <Lock className="h-3 w-3" />
                ) : complete && !active ? (
                  <Check className="h-3 w-3" />
                ) : (
                  i + 1
                )}
              </span>
              {s.label}
              {gated ? (
                <span className="tabular-nums text-slate-300">
                  {gate.confirmedCount}/{gate.totalCount}
                </span>
              ) : (
                count != null &&
                count > 0 && (
                  <span className="tabular-nums text-slate-400">{count}</span>
                )
              )}
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRight
                className="hidden size-3.5 shrink-0 text-slate-300 sm:block"
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
