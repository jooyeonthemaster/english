"use client";

// ============================================================================
// 학생 시험 리포트 v3 — 학생 워크스페이스 셸 (스텝: 답안 수집 → 정오표 → 리포트)
//
// 분석 detail(examMap 소유) + 학생 detail 동시 로드. 상태/저장/확정/생성
// 로직은 useVerdictState 훅에 위임하고, 여기서는 로드·스텝 전환·레이아웃만 담당.
// 리포트 스텝은 기존 ReportEditor(무수정)를 report-step 이 감싼다.
// 플로우 개편(26-07-08): AI 사진 판독(E2) 배선 제거 — 답안 수집은 학생 링크와
// 직접 입력 2경로만.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  ListChecks,
  Loader2,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { startAdaptivePoll } from "@/lib/adaptive-poll";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import type { ExamAnalysisDetail, ExamStudentDetail } from "./ui-contracts";
import { useVerdictState } from "./grading/use-verdict-state";
import { ReadStep } from "./grading/read-step";
import { VerdictBoard } from "./grading/verdict-board";
import { ReportStep } from "./grading/report-step";

interface StudentWorkspaceClientProps {
  analysisId: string;
  studentId: string;
}

type Step = "read" | "verdict" | "report";

const STEP_META: { key: Step; label: string; icon: typeof ListChecks }[] = [
  { key: "read", label: "답안 수집", icon: ListChecks },
  { key: "verdict", label: "정오표 확인", icon: CheckCircle2 },
  { key: "report", label: "리포트", icon: FileText },
];

function deriveInitialStep(student: ExamStudentDetail): Step {
  if (student.reportStatus === "GENERATED") return "report";
  if (student.gradingConfirmed) return "report";
  const readDone = student.readState?.status === "READ";
  const touched = (student.responses ?? []).some((r) => r.status !== "UNKNOWN");
  if (readDone || touched) return "verdict";
  return "read";
}

export function ExamReportStudentWorkspaceClient({
  analysisId,
  studentId,
}: StudentWorkspaceClientProps) {
  const [analysis, setAnalysis] = useState<ExamAnalysisDetail | null>(null);
  const [student, setStudent] = useState<ExamStudentDetail | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [step, setStep] = useState<Step>("read");
  // 초기 스텝 소비 가드 — state 가 아닌 ref 인 이유: StrictMode 의 이중 load() 에서
  // 두 번째 호출이 스테일 클로저(stepInit=false)로 가드를 우회해, 첫 호출이
  // replaceState 로 소거한 ?step=verdict 를 재판독 실패 → read 로 덮어쓰는 레이스가
  // 실측됐다(플로우 개편 검증 라운드2). ref 는 동기 소비라 이중 호출에 면역.
  const stepInitRef = useRef(false);

  const workspaceHref = `/director/workbench/exam-report/${analysisId}`;

  const load = useCallback(async () => {
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/exam-report/analyses/${analysisId}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/exam-report/students/${studentId}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      if (aRes.status === 404 || sRes.status === 404) {
        setPhase("notFound");
        return;
      }
      if (!aRes.ok || !sRes.ok) {
        setPhase("error");
        return;
      }
      const analysisData = (await aRes.json()) as { analysis: ExamAnalysisDetail };
      const studentData = (await sRes.json()) as { student: ExamStudentDetail };
      setAnalysis(analysisData.analysis);
      setStudent(studentData.student);
      if (!stepInitRef.current) {
        stepInitRef.current = true;
        // ㉡ 선생님 직접 입력 딥링크(?step=verdict) — 학생 추가 다이얼로그의
        // "정오표에서 답안 입력" 버튼이 라벨 약속대로 정오표 스텝에 착지하게
        // 한다. 파라미터가 없으면 기존 deriveInitialStep 파생 그대로(불변),
        // examMap 미준비(정오표 진입 불가)면 파라미터를 무시한다.
        const params = new URLSearchParams(window.location.search);
        const wantsVerdict = params.get("step") === "verdict";
        const verdictOk =
          !!analysisData.analysis.examMap &&
          analysisData.analysis.examMap.questions.length > 0;
        setStep(
          wantsVerdict && verdictOk
            ? "verdict"
            : deriveInitialStep(studentData.student),
        );
        if (wantsVerdict) {
          // 소비한 파라미터는 URL 에서 제거 — 새로고침/뒤로가기 재발화 방지.
          params.delete("step");
          const qs = params.toString();
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}${qs ? `?${qs}` : ""}`,
          );
        }
      }
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [analysisId, studentId]);

  useEffect(() => {
    // 마운트 시 1회 서버 로드(외부 시스템 동기화) — setState 는 fetch 콜백에서만
    // 일어나므로 캐스케이드 렌더 우려가 없다(규칙 오탐).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // (결함수리) answerSubmittedAt 라이브 갱신 — 이 화면은 마운트 1회 로드뿐이라
  // 학생이 /a/{token} 링크로 답안을 제출해도(외부 이벤트) 답안 수집 스텝의
  // "미제출" 칩이 새로고침 전까지 영원히 갱신되지 않았다. 현재 학생의 링크가
  // 활성(answerEnabled)인데 아직 미제출인 동안 detail+student 를 어댑티브 폴링
  // (워크스페이스 B4 패턴 미러)하고, 제출되면 조건 소멸로 폴이 자연 종료된다.
  // 로컬 정오표 편집 상태는 useVerdictState 가 student.id 기준으로만 리셋하므로
  // 같은 학생의 폴 갱신이 편집 중 상태를 덮지 않는다.
  const awaitingAnswer =
    phase === "ready" &&
    student != null &&
    student.answerEnabled &&
    !student.answerSubmittedAt;
  useEffect(() => {
    if (!awaitingAnswer) return;
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 30_000,
      run: async (signal) => {
        try {
          const [aRes, sRes] = await Promise.all([
            fetch(`/api/exam-report/analyses/${analysisId}`, {
              credentials: "include",
              cache: "no-store",
              signal,
            }),
            fetch(`/api/exam-report/students/${studentId}`, {
              credentials: "include",
              cache: "no-store",
              signal,
            }),
          ]);
          if (!aRes.ok || !sRes.ok) return null;
          const analysisData = (await aRes.json()) as {
            analysis: ExamAnalysisDetail;
          };
          const studentData = (await sRes.json()) as {
            student: ExamStudentDetail;
          };
          if (signal.aborted) return null;
          setAnalysis(analysisData.analysis);
          setStudent(studentData.student);
          // 변화 없으면 서명 동일 → idleMs(30s)까지 백오프(대역폭 절약).
          return `${studentData.student.answerSubmittedAt ?? ""}:v${studentData.student.version}`;
        } catch {
          return null;
        }
      },
    });
  }, [awaitingAnswer, analysisId, studentId]);

  if (phase === "loading") {
    // 로드/에러/notFound 도 워크스페이스와 동일한 페이지 셸로 감싸 셸 플리커를 없앤다(A8).
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
              ? "학생 또는 분석을 찾을 수 없습니다."
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
              href={workspaceHref}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            >
              분석으로
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!analysis || !student) return null;

  return (
    <Workspace
      analysis={analysis}
      student={student}
      onStudentChange={setStudent}
      step={step}
      onStepChange={setStep}
      workspaceHref={workspaceHref}
    />
  );
}

// ── 내부 워크스페이스(데이터 확정 후) ────────────────────────────────────────

interface WorkspaceProps {
  analysis: ExamAnalysisDetail;
  student: ExamStudentDetail;
  onStudentChange: (next: ExamStudentDetail) => void;
  step: Step;
  onStepChange: (step: Step) => void;
  workspaceHref: string;
}

function Workspace({
  analysis,
  student,
  onStudentChange,
  step,
  onStepChange,
  workspaceHref,
}: WorkspaceProps) {
  const vs = useVerdictState({ analysis, student, onStudentChange });

  const examMapReady = useMemo(
    () => !!analysis.examMap && analysis.examMap.questions.length > 0,
    [analysis.examMap],
  );
  // 답안 수집 2경로(학생 링크·직접 입력) 개방 — examMap 만 있으면 정오표
  // 진입 가능(전 문항 UNKNOWN 프리필 + 수동/선지 입력).
  const verdictReady = examMapReady;
  const reportReady = student.gradingConfirmed || student.reportStatus !== "NONE";

  const enabled: Record<Step, boolean> = {
    read: true,
    verdict: verdictReady,
    report: reportReady,
  };

  // 답안 수집 → 정오표 진입 시 서버 리싱크 — 페이지 로드 후 학생이 링크로 제출한
  // 답안(responses/version 서버 갱신)을 반영해 첫 저장 CAS 충돌을 예방한다.
  const handleAdvanceToVerdict = useCallback(() => {
    void vs.reloadStudent();
    onStepChange("verdict");
  }, [vs, onStepChange]);

  // 헤더 카드 높이 실측 — flex-wrap 으로 가변이라 고정 오프셋을 쓸 수 없다.
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => setHeaderH(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8"
      style={{ "--ws-head-h": `${headerH}px` } as CSSProperties}
    >
      <main className="flex w-full min-w-0 flex-col gap-4">
        {/* 헤더 카드: 뒤로 + 학생명 + 스텝 탭 — 상단 고정(모바일은 셸 헤더 56px 아래).
            높이는 실측해 --ws-head-h 로 내려 하위 sticky(에디터 툴바·설정 패널)가 아래에 쌓인다. */}
        <section
          ref={headerRef}
          className="sticky top-14 z-30 rounded-lg border border-slate-200 bg-white shadow-sm md:top-0"
        >
          {/* md+ 우측 여백 — 전역 작업 목록 플로팅 버튼(fixed top-0 right-0)의 예약 코너 회피 */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 md:pr-16">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={workspaceHref}
                aria-label="분석으로 돌아가기"
                title={analysis.title}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <WorkflowPageTitle
                icon={UserRound}
                title={student.studentName}
                description={analysis.title}
              />
            </div>
            <nav className="flex items-center gap-1.5">
              {STEP_META.map((meta) => (
                <StepTab
                  key={meta.key}
                  icon={meta.icon}
                  label={meta.label}
                  active={step === meta.key}
                  disabled={!enabled[meta.key]}
                  onClick={() => enabled[meta.key] && onStepChange(meta.key)}
                />
              ))}
            </nav>
          </div>
        </section>

        {/* 스텝 콘텐츠 */}
        {step === "read" && (
          <ReadStep
            student={student}
            examMapReady={examMapReady}
            onStudentChange={onStudentChange}
            onAdvance={handleAdvanceToVerdict}
          />
        )}

        {step === "verdict" && analysis.examMap && (
          <VerdictBoard
            examMap={analysis.examMap}
            responses={vs.state.responses}
            uncertainties={student.readState?.uncertainties ?? []}
            studentId={student.id}
            sourceFiles={student.sourceFiles ?? []}
            saveState={vs.saveState}
            gradingConfirmed={vs.state.gradingConfirmed}
            confirming={vs.confirming}
            onSetStatus={vs.handlers.onSetStatus}
            onSetPartial={vs.handlers.onSetPartial}
            onReset={vs.handlers.onReset}
            onSetChoice={vs.handlers.onSetChoice}
            onMarkMany={vs.handlers.onMarkMany}
            onConfirm={vs.confirmGrading}
            onProceed={() => onStepChange("report")}
            onBack={() => onStepChange("read")}
          />
        )}

        {step === "report" && (
          <ReportStep
            analysis={analysis}
            student={student}
            onStudentChange={onStudentChange}
            generating={vs.generating}
            gradingConfirmed={vs.state.gradingConfirmed}
            dataLevel={vs.dataLevel}
            classAverage={vs.state.classAverage}
            gradeBand={vs.state.gradeBand}
            onClassAverage={vs.handlers.onClassAverage}
            onGradeBand={vs.handlers.onGradeBand}
            onGenerate={vs.generateReport}
            onBack={() => onStepChange("verdict")}
            onGoVerdict={() => onStepChange("verdict")}
          />
        )}
      </main>
    </div>
  );
}

/** 워크스페이스와 동일한 페이지 셸 — 로드/에러/notFound 상태를 감싸 배경 플리커 제거(A8). */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      {children}
    </div>
  );
}

function StepTab({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: typeof ListChecks;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : disabled
            ? "border-transparent text-slate-300"
            : "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
