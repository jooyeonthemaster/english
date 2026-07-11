"use client";

// ============================================================================
// 학생 시험 리포트 — 허브 셸
//
// 페이지 셸(-m-6 + bg-[#F4F6F9]) 위에 카드 2개를 세로 스택한다(워크벤치 표준).
//  카드1: WorkflowPageTitle 헤더 스트립 + 사진 업로드 인테이크 패널(2컬럼).
//  카드2: 분석 현황 보드 — 분석 시작 후 리다이렉트 없이 여기서 낙관 카드 +
//         라이브 진행률(폴링)로 지켜본다(문제생성 페이지 상단/하단 패턴 미러).
// resumeDraft(고아 DRAFT 이어등록)와 시험 메타 상태를 셸이 소유해 주입한다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, FileBarChart, FileClock } from "lucide-react";
import { WorkflowPageTitle } from "@/components/workbench/workflow-page-title";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  useExamReportActivity,
  type ExamReportSummaryRow,
} from "@/hooks/use-exam-report-activity";
import { defaultExamMeta, type ExamMetaValue } from "./exam-meta-form";
import {
  IntakeUploadPanel,
  type ResumeDraftTarget,
} from "./intake-upload-panel";
import { AnalysesBoard } from "./analyses-board";
import { resolveExamReportBase } from "./board-shared";

// 방금 시작한 분석이 서버에서 ANALYZING 으로 뒤집히기 전의 짧은 DRAFT 구간을
// "분석 중"으로 보정하는 유예(ms). 초과하면 실제 상태를 그대로 보여준다.
const START_COERCE_MS = 90_000;

// 인테이크 고정높이 프레임 — 학습지 생성(form-section)과 동일한 드래그 높이조절
// + localStorage 영속. 픽셀 고정 높이가 좌 작업대/우 레일의 세로 끝선 정렬 뿌리.
const PANE_STORAGE_KEY = "smoat:exam-report:pane-height";
const PANE_MIN = 500;
const PANE_DEFAULT = 700;
const PANE_MAX = 1400;

function readStoredPaneHeight(): number {
  if (typeof window === "undefined") return PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(PANE_STORAGE_KEY);
    if (!raw) return PANE_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return PANE_DEFAULT;
    return Math.min(PANE_MAX, Math.max(PANE_MIN, n));
  } catch {
    return PANE_DEFAULT;
  }
}

/** 인테이크 성공 직후 폴이 실제 행을 내려주기 전까지 보드에 띄울 낙관 행. */
function buildOptimisticRow(
  id: string,
  meta: ExamMetaValue,
  hasStudent: boolean,
): ExamReportSummaryRow {
  const now = new Date().toISOString();
  return {
    id,
    title: meta.title.trim() || "새 시험 분석",
    status: "ANALYZING",
    schoolName: meta.schoolName.trim() || null,
    grade: meta.grade.trim() || null,
    examType: meta.examType,
    studentCount: hasStudent ? 1 : 0,
    reportCount: 0,
    hasSourceFiles: true,
    progress: null,
    failedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function HubClient() {
  const pathname = usePathname();
  const hubBase = useMemo(() => resolveExamReportBase(pathname), [pathname]);

  const [meta, setMeta] = useState<ExamMetaValue>(defaultExamMeta);
  const [resumeDraft, setResumeDraft] = useState<ResumeDraftTarget | null>(null);

  // 인테이크 프레임 접기 + 높이 드래그 조절(form-section 미러).
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [paneHeight, setPaneHeight] = useState<number>(readStoredPaneHeight);

  const beginPaneResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = paneHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          PANE_MAX,
          Math.max(PANE_MIN, startHeight + (ev.clientY - startY)),
        );
        setPaneHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(PANE_STORAGE_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [paneHeight],
  );

  const resetPaneHeight = useCallback(() => {
    setPaneHeight(PANE_DEFAULT);
    try {
      window.localStorage.setItem(PANE_STORAGE_KEY, String(PANE_DEFAULT));
    } catch {
      /* ignore */
    }
  }, []);
  const { analyses, loading, error, refresh } = useExamReportActivity();
  // (director) 레이아웃 Provider 아래라 안전 — 전역 작업 큐 드로어 갱신용.
  const { triggerRefresh } = useTaskQueue();

  // 낙관 행 + 시작 시각(짧은 DRAFT 구간 보정용).
  const [optimisticRows, setOptimisticRows] = useState<ExamReportSummaryRow[]>([]);
  const startedAtRef = useRef<Map<string, number>>(new Map());

  // 폴이 실제 행을 내려주면 같은 id 의 낙관 행은 걷어낸다.
  useEffect(() => {
    if (optimisticRows.length === 0) return;
    const ids = new Set(analyses.map((r) => r.id));
    if (optimisticRows.some((o) => ids.has(o.id))) {
      setOptimisticRows((prev) => prev.filter((o) => !ids.has(o.id)));
    }
  }, [analyses, optimisticRows]);

  // 보드에 줄 행: 실제 행(방금 시작한 것의 짧은 DRAFT 는 분석 중으로 보정)
  // 앞에 아직 폴에 안 잡힌 낙관 행을 프리펜드.
  const boardRows = useMemo(() => {
    const now = Date.now();
    const started = startedAtRef.current;
    const coerced = analyses.map((r) => {
      const startedAt = started.get(r.id);
      if (
        startedAt !== undefined &&
        r.status === "DRAFT" &&
        now - startedAt < START_COERCE_MS
      ) {
        return { ...r, status: "ANALYZING" as const };
      }
      return r;
    });
    const ids = new Set(analyses.map((r) => r.id));
    return [...optimisticRows.filter((o) => !ids.has(o.id)), ...coerced];
  }, [analyses, optimisticRows]);

  // 인테이크 성공 — 낙관 행 프리펜드 + 메타/이어등록 리셋 + 폴·작업 큐 갱신.
  const handleStarted = useCallback(
    (analysisId: string, info: { hasStudent: boolean }) => {
      startedAtRef.current.set(analysisId, Date.now());
      setOptimisticRows((prev) => [
        buildOptimisticRow(analysisId, meta, info.hasStudent),
        ...prev.filter((r) => r.id !== analysisId),
      ]);
      setResumeDraft(null);
      setMeta(defaultExamMeta());
      refresh();
      // 잡 행 생성 타이밍 흡수 — 즉시 + 지연 재호출(생성 페이지 패턴 미러).
      triggerRefresh();
      window.setTimeout(triggerRefresh, 750);
      window.setTimeout(triggerRefresh, 2_000);
    },
    [meta, refresh, triggerRefresh],
  );

  // 고아 DRAFT 이어서 등록 — 인테이크 패널에 DRAFT 주입 + 상단으로 스크롤.
  const handleResumeDraft = useCallback((row: ExamReportSummaryRow) => {
    // 인테이크가 접혀 있으면 펼쳐서 이어서 등록 칩이 바로 보이게 한다.
    setFormCollapsed(false);
    setResumeDraft({ id: row.id, title: row.title });
    // (결함수리) 기존엔 칩만 세팅하고 폼은 빈 상태 — 제목 필수 검증 탓에 사용자가
    // 임시 제목을 새로 쳐야 했고, resume 경로는 createExamAnalysis 를 건너뛰므로
    // 그 입력이 저장되지 않아 폴 도착 후 카드 제목이 원래 값으로 뒤집혔다.
    // DRAFT 의 저장 메타로 프리필해 그대로 잇는다(summary 행에는 examYear/
    // semester 가 없어 그 둘은 기본값 유지 — 수정 시 패널이 updateExamMeta 로 반영).
    setMeta({
      ...defaultExamMeta(),
      title: row.title,
      schoolName: row.schoolName ?? "",
      grade: row.grade ?? "",
      examType: row.examType,
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="-m-6 min-h-[calc(100vh-56px)] min-w-0 bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="flex w-full min-w-0 flex-col gap-4">
        {/* 카드1 — 인테이크(헤더 스트립 + 고정높이 프레임 + 접기/높이조절 핸들).
            form-section(학습지 생성) 골격 미러 — 픽셀 고정 높이 프레임 아래
            전 계층이 min-h-0/flex-1 로 높이를 상속해 좌우 세로 끝선이 일치한다. */}
        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
            <WorkflowPageTitle
              icon={FileBarChart}
              title="내신 시험 분석"
              beta
              description="학교 내신 시험지를 분석해 출제 경향과 정답을 확인하고 학생 리포트를 만듭니다."
            />
            {formCollapsed ? (
              <button
                type="button"
                onClick={() => setFormCollapsed(false)}
                aria-expanded={false}
                title="시험지 등록 펼치기"
                className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
              >
                <ChevronDown className="size-3.5" aria-hidden="true" />
                <span>펼치기</span>
              </button>
            ) : null}
          </div>

          {!formCollapsed ? (
            <>
              <div className="px-4 pt-4 pb-3">
                <div
                  className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-slate-200"
                  style={{ height: `${paneHeight}px` }}
                >
                  <IntakeUploadPanel
                    meta={meta}
                    onMetaChange={setMeta}
                    resumeDraft={resumeDraft}
                    onCancelResume={() => setResumeDraft(null)}
                    onStarted={handleStarted}
                  />
                </div>
              </div>

              {/* 프레임 높이 드래그 핸들 + 접기 버튼(form-section 미러) */}
              <div className="relative pb-2.5">
                <div
                  onPointerDown={beginPaneResize}
                  onDoubleClick={resetPaneHeight}
                  role="separator"
                  aria-orientation="horizontal"
                  title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                  className="group/fhandle flex h-3 cursor-row-resize select-none items-center justify-center"
                >
                  <div className="h-0.5 w-24 rounded-full bg-slate-200 transition-colors group-hover/fhandle:bg-blue-400 group-active/fhandle:bg-blue-500" />
                </div>
                <button
                  type="button"
                  onClick={() => setFormCollapsed(true)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-expanded
                  title="시험지 등록 접기"
                  className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
                >
                  <ChevronUp className="size-3.5" aria-hidden="true" />
                  <span>접기</span>
                </button>
              </div>
            </>
          ) : null}
        </section>

        {/* 카드2 — 분석 현황 보드(낙관 카드 + 라이브 진행률) */}
        <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <FileClock className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[14px] font-bold text-slate-900">분석 현황</h2>
                <p className="text-xs text-slate-400">
                  화면을 닫아도 분석은 계속됩니다. 진행 상황은 실시간으로 갱신돼요.
                </p>
              </div>
            </div>
          </div>

          <AnalysesBoard
            rows={boardRows}
            loading={loading}
            error={error}
            workspaceBase={hubBase}
            onRefresh={refresh}
            onResumeDraft={handleResumeDraft}
            emptyHint="위에서 시험지를 등록해 첫 리포트를 만들어 보세요."
          />
        </section>
      </main>
    </div>
  );
}
