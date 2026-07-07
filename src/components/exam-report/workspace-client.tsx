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
import { ArrowLeft, Check, ChevronRight, FileBarChart, Loader2 } from "lucide-react";
import type {
  ExamAnalysisDetail,
  ExamWorkspaceStep,
} from "./ui-contracts";
import type { ExamAnalysisStatus, ExamType } from "@/lib/exam-report/types";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { AnalysisStep } from "./analysis/analysis-step";
import { StudentsTab } from "./students/students-tab";

const HUB_HREF = "/director/workbench/exam-report";

interface WorkspaceClientProps {
  analysisId: string;
}

// ── 상태 뱃지 ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  ExamAnalysisStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  DRAFT: {
    label: "분석 대기",
    className: "border border-slate-200 bg-slate-50 text-slate-600",
  },
  ANALYZING: {
    label: "분석 중",
    className: "border border-blue-200 bg-blue-50 text-blue-700",
    pulse: true,
  },
  ANALYZED: {
    label: "분석 완료",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  FAILED: {
    label: "실패",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
  },
};

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

/** 로드 시점의 status 로 기본 탭을 정한다(이후는 수동 전환). */
function deriveInitialStep(detail: ExamAnalysisDetail): ExamWorkspaceStep {
  // 이미 분석 완료 + 학생이 있으면 학생 관리로, 그 외엔 문항 분석부터.
  if (detail.status === "ANALYZED" && detail.students.length > 0) {
    return "students";
  }
  return "analysis";
}

function isStepComplete(
  detail: ExamAnalysisDetail,
  step: ExamWorkspaceStep,
): boolean {
  if (step === "analysis") return detail.status === "ANALYZED";
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

export function ExamReportWorkspaceClient({ analysisId }: WorkspaceClientProps) {
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
        setStep(deriveInitialStep(data.analysis));
        stepInitializedRef.current = true;
      }
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [analysisId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDetailChange = useCallback((next: ExamAnalysisDetail) => {
    setDetail(next);
  }, []);

  const advanceFromAnalysis = useCallback(() => setStep("students"), []);

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
      <PageShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </PageShell>
    );
  }

  if (phase === "notFound" || phase === "error") {
    return (
      <PageShell>
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

  const badge = STATUS_BADGE[detail.status];
  // ANALYZING 뱃지에는 실제 진행(aiMeta.progress, optional 소비)을 {completed}/{total}
  // 로 병기 — 진행 스냅샷이 아직 없으면(첫 체크포인트 전) 라벨만 보인다.
  const progress =
    detail.status === "ANALYZING" ? detail.aiMeta.progress : undefined;
  const badgeLabel =
    progress && progress.total > 0
      ? `${badge.label} ${Math.min(progress.completed, progress.total)}/${progress.total}`
      : badge.label;
  const metaParts = [
    detail.schoolName,
    detail.grade,
    EXAM_TYPE_LABEL[detail.examType],
    detail.examYear ? `${detail.examYear}년` : null,
    detail.semester,
  ].filter((v): v is string => Boolean(v));

  return (
    <PageShell>
      <main className="flex w-full min-w-0 flex-col gap-4">
        {/* 헤더 카드 — 뒤로가기 + 제목 + 상태 뱃지 + 탭 인디케이터 */}
        <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={HUB_HREF}
                title="리포트 목록"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <WorkflowPageTitle
                icon={FileBarChart}
                title={detail.title}
                description={
                  metaParts.length > 0 ? metaParts.join(" · ") : undefined
                }
              />
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${badge.className}`}
            >
              {badge.pulse && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {badgeLabel}
            </span>
          </div>

          <TabIndicator detail={detail} current={step} onSelect={setStep} />
        </section>

        {/* 탭 본문 */}
        {step === "analysis" && (
          <AnalysisStep
            detail={detail}
            onDetailChange={handleDetailChange}
            onAdvance={advanceFromAnalysis}
          />
        )}
        {step === "students" && (
          <StudentsTab detail={detail} onDetailChange={handleDetailChange} />
        )}
      </main>
    </PageShell>
  );
}

// ── 페이지 셸 ────────────────────────────────────────────────────────────────
// 로딩/에러/본문이 동일한 배경·여백 셸을 공유하도록 고정(A8) — 분기 간 레이아웃 점프 방지.
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      {children}
    </div>
  );
}

// ── 탭 인디케이터 ───────────────────────────────────────────────────────────

function TabIndicator({
  detail,
  current,
  onSelect,
}: {
  detail: ExamAnalysisDetail;
  current: ExamWorkspaceStep;
  onSelect: (step: ExamWorkspaceStep) => void;
}) {
  return (
    <nav className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 overflow-visible px-3 py-1.5 sm:h-11 sm:flex-nowrap sm:py-0">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const complete = isStepComplete(detail, s.key);
        const count =
          s.key === "students" ? detail.students.length : undefined;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              className={
                "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (active
                  ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
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
                {complete && !active ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
              {count != null && count > 0 && (
                <span className="tabular-nums text-slate-400">{count}</span>
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
