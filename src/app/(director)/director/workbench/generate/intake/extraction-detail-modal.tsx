"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  FileText,
  GraduationCap,
  Loader2,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { savePassageAnnotations, updateWorkbenchPassage } from "@/actions/workbench";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { AnalysisReportEditor } from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { PassageAnnotationEditor, type Annotation } from "@/components/workbench/editor";
import { AnalysisToneSelector } from "@/components/workbench/analysis-prompt-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import type { PassageItem } from "../generate-page-types";
import {
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { PassageCompare } from "../../passages/import/_components/extraction-manage-client/components/passage-compare";
import { OriginalProblemBox } from "../../passages/import/_components/extraction-manage-client/components/original-problem-box";
import { RestorationBadge } from "../../passages/import/_components/extraction-manage-client/components/restoration-badge";
import type { M1PassageDraftWithJob } from "../../passages/import/_components/extraction-manage-client/types";

function reportDraftStorageKey(passageId: string) {
  return `smoat.generate.extractionDetail.primeReportDraft.${passageId}`;
}

function readTemporaryReportDraft(passageId: string): AnalysisReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(reportDraftStorageKey(passageId));
    return raw ? (JSON.parse(raw) as AnalysisReport) : null;
  } catch {
    return null;
  }
}

function writeTemporaryReportDraft(passageId: string, report: AnalysisReport) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reportDraftStorageKey(passageId), JSON.stringify(report));
  } catch {
    // Temporary persistence is best-effort; editing should continue even if storage is full.
  }
}

function clearTemporaryReportDraft(passageId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(reportDraftStorageKey(passageId));
  } catch {
    // ignore
  }
}

interface ExtractionDetailModalProps {
  passage: PassageItem;
  onClose: () => void;
  onPassageAnalyzed?: (passageId: string) => void | Promise<void>;
  reviewBusy?: boolean;
  onToggleExtractionReview?: (passage: PassageItem) => void;
}

/**
 * Read-only "지문 전체 보기" for the generate page — reuses the extraction page's
 * wide compare modal (원문/복원문 + 복원 근거 패널 + 추출 원본 이미지 토글). Looks up
 * the M1 draft behind the committed Passage by savedPassageId; when none exists
 * (legacy import) it falls back to a plain content view. View-only: no edit /
 * 재복원 / 검수 actions (those live on the 자료 추출 page).
 */
export function ExtractionDetailModal({
  passage,
  onClose,
  onPassageAnalyzed,
  reviewBusy = false,
  onToggleExtractionReview,
}: ExtractionDetailModalProps) {
  const [draft, setDraft] = useState<M1PassageDraftWithJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [studyMode, setStudyMode] = useState(true);
  const [editorTitle, setEditorTitle] = useState(passage.title || "지문");
  const [editorContent, setEditorContent] = useState(passage.content || "");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [analysisTone, setAnalysisTone] =
    useState<AnalysisTone>(DEFAULT_ANALYSIS_TONE);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [activeReportJobId, setActiveReportJobId] = useState<string | null>(null);
  const [reportJobError, setReportJobError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<AnalysisReport | null>(null);
  const [reportEditorOpen, setReportEditorOpen] = useState(false);

  const sourceLabel =
    draft?.job?.displayName?.trim() ||
    draft?.job?.originalFileName?.trim() ||
    passage.source ||
    "";
  const analysisCreditCost = CREDIT_COSTS.PASSAGE_ANALYSIS;
  const reviewDraft = passage.extractionReviewDraft ?? null;
  const isReviewCommitted = reviewDraft?.reviewStatus === "COMMITTED";

  const openReportEditor = useCallback(() => {
    setReportEditorOpen(true);
  }, []);

  const closeReportEditor = useCallback(() => {
    setReportEditorOpen(false);
  }, []);

  const handleReportDraftChange = useCallback(
    (report: AnalysisReport, state?: { dirty?: boolean }) => {
      setGeneratedReport(report);
      if (state?.dirty) {
        writeTemporaryReportDraft(passage.id, report);
      }
    },
    [passage.id],
  );

  const handleReportSaved = useCallback(
    (saved: AnalysisReport) => {
      setGeneratedReport(saved);
      clearTemporaryReportDraft(passage.id);
      void onPassageAnalyzed?.(passage.id);
    },
    [onPassageAnalyzed, passage.id],
  );

  // ESC to close + body scroll lock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reportEditorOpen) return;
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [reportEditorOpen, onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/extraction/m1-passages?savedPassageId=${encodeURIComponent(
            passage.id,
          )}&view=list&limit=1`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        const found =
          Array.isArray(data?.drafts) && data.drafts.length > 0
            ? (data.drafts[0] as M1PassageDraftWithJob)
            : null;
        if (!cancelled) setDraft(found);
      } catch {
        if (!cancelled) setDraft(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passage.id]);

  useEffect(() => {
    const nextText =
      draft?.teacherText?.trim() ||
      draft?.restoredText?.trim() ||
      draft?.rawText?.trim() ||
      passage.content ||
      "";
    setEditorContent(nextText);
    setEditorTitle(passage.title || draft?.title || "지문");
    setAnnotations([]);
  }, [draft, passage.content, passage.title]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [reportRes, jobsRes] = await Promise.all([
          fetch(`/api/workbench/passage-reports/prime/${passage.id}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(
            "/api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&limit=50&view=summary",
            { credentials: "include", cache: "no-store" },
          ),
        ]);

        const reportData = await reportRes.json().catch(() => ({}));
        if (!cancelled && reportData?.report) {
          setGeneratedReport(
            readTemporaryReportDraft(passage.id) ??
              (reportData.report as AnalysisReport),
          );
        }

        const jobsData = await jobsRes.json().catch(() => ({}));
        const activeJob = Array.isArray(jobsData?.jobs)
          ? jobsData.jobs.find(
              (job: { id?: string; passageId?: string; status?: string }) =>
                job.passageId === passage.id &&
                (job.status === "PENDING" || job.status === "PROCESSING"),
            )
          : null;
        if (!cancelled && activeJob?.id) {
          setActiveReportJobId(activeJob.id);
          setAnalysisRunning(true);
        }
      } catch {
        // Existing report/job lookup is best-effort context for this modal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passage.id]);

  useEffect(() => {
    if (!activeReportJobId) return;
    let cancelled = false;
    let completedToastShown = false;

    const poll = async () => {
      try {
        const res = await fetch(
          "/api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&limit=50&view=summary",
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        const job = Array.isArray(data?.jobs)
          ? data.jobs.find(
              (candidate: { id?: string }) => candidate.id === activeReportJobId,
            )
          : null;
        if (cancelled || !job) return;

        if (job.status === "COMPLETED") {
          const reportRes = await fetch(
            `/api/workbench/passage-reports/prime/${passage.id}`,
            { credentials: "include", cache: "no-store" },
          );
          const reportData = await reportRes.json().catch(() => ({}));
          if (cancelled) return;

          if (reportData?.report) {
            setGeneratedReport(reportData.report as AnalysisReport);
            clearTemporaryReportDraft(passage.id);
            openReportEditor();
            setReportJobError(null);
          } else {
            setReportJobError("생성은 완료되었지만 학습자료를 불러오지 못했습니다. 잠시 후 다시 열어주세요.");
          }
          setActiveReportJobId(null);
          setAnalysisRunning(false);
          await onPassageAnalyzed?.(passage.id);
          notifyCreditsChanged();
          if (reportData?.report && !completedToastShown) {
            toast.success("신형 학습자료 생성이 완료되었습니다.");
            completedToastShown = true;
          }
          return;
        }

        if (job.status === "FAILED" || job.status === "CANCELLED") {
          const message =
            typeof job.errorMessage === "string" && job.errorMessage.trim()
              ? job.errorMessage
              : "학습자료 생성에 실패했습니다.";
          setActiveReportJobId(null);
          setAnalysisRunning(false);
          setReportJobError(message);
          notifyCreditsChanged();
          toast.error(message);
          return;
        }

        setAnalysisRunning(true);
      } catch {
        // Keep polling through transient network failures.
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeReportJobId, onPassageAnalyzed, openReportEditor, passage.id]);

  async function handleRunInlineAnalysis() {
    const title = editorTitle.trim() || passage.title || "지문";
    const content = editorContent.trim();
    if (content.length < 20) {
      toast.error("지문이 너무 짧습니다. 최소 20자 이상 필요합니다.");
      return;
    }

    setAnalysisRunning(true);
    try {
      const updateResult = await updateWorkbenchPassage(passage.id, {
        title,
        content,
        schoolId: passage.school?.id,
        grade: passage.grade ?? undefined,
        semester: passage.semester ?? undefined,
        unit: passage.unit ?? undefined,
        publisher: passage.publisher ?? undefined,
        difficulty: passage.difficulty ?? undefined,
        source: sourceLabel || passage.source || undefined,
      });
      if (!updateResult.success) {
        throw new Error(updateResult.error || "지문을 저장하지 못했습니다.");
      }

      const annotationResult = await savePassageAnnotations(
        passage.id,
        annotations.map((annotation) => ({
          id: annotation.id,
          type: annotation.type,
          text: annotation.text,
          memo: annotation.memo,
          from: annotation.from,
          to: annotation.to,
        })),
      );
      if (!annotationResult.success) {
        throw new Error(annotationResult.error || "필기를 저장하지 못했습니다.");
      }

      const res = await fetch("/api/workbench/ai-jobs/passage-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({
          passageId: passage.id,
          customPrompt,
          focusAreas: [],
          targetLevel: "",
          analysisTone,
          forcePrimeReport: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error || !data?.jobId) {
        throw new Error(data?.error || "학습자료 생성 작업을 시작하지 못했습니다.");
      }

      setActiveReportJobId(data.jobId as string);
      setReportJobError(null);
      clearTemporaryReportDraft(passage.id);
      setAnalysisRunning(true);
      toast.success("학습자료 생성을 백그라운드에서 시작했습니다. 창을 닫아도 계속 진행됩니다.");
    } catch (err) {
      setAnalysisRunning(false);
      toast.error(
        err instanceof Error ? err.message : "학습자료 생성 중 오류가 발생했습니다.",
      );
    } finally {
      notifyCreditsChanged();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 xl:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-bold text-slate-900">
                {reportEditorOpen
                  ? generatedReport?.meta.titleKo || editorTitle || "지문 학습자료"
                  : passage.title || "지문"}
              </h2>
              {draft ? (
                <RestorationBadge status={draft.restorationStatus} />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {reportEditorOpen
                ? "팝업 안에서 학습자료 편집 중 · 뒤로가면 복원문 마킹 단계로 돌아갑니다"
                : draft?.job?.originalFileName
                  ? `출처 ${draft.job.originalFileName}`
                  : "추출·입력된 지문"}
            </p>
          </div>
          {reportEditorOpen ? (
            <button
              type="button"
              onClick={closeReportEditor}
              className="ml-2 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              뒤로가기
            </button>
          ) : studyMode ? (
            <button
              type="button"
              onClick={() => setStudyMode(false)}
              disabled={analysisRunning}
              className="ml-2 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              복원 비교
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStudyMode(true)}
              disabled={loading || !draft}
              title={!loading && !draft ? "연결된 추출 원본이 없어 이 팝업에서는 바로 분석할 수 없습니다." : undefined}
              className="ml-2 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <GraduationCap className="size-3.5" aria-hidden="true" />
              )}
              학습자료 생성
            </button>
          )}
          {reviewDraft && onToggleExtractionReview ? (
            <button
              type="button"
              onClick={() => onToggleExtractionReview(passage)}
              disabled={reviewBusy}
              title={
                isReviewCommitted
                  ? "자료관리 검수완료를 취소합니다"
                  : "자료관리 검수완료로 표시합니다"
              }
              className={
                "ml-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                (isReviewCommitted
                  ? "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                  : "border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700")
              }
            >
              {reviewBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : isReviewCommitted ? (
                <Undo2 className="size-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              {isReviewCommitted ? "검수취소" : "검수완료"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            reportEditorOpen ? "p-0" : "p-5 xl:p-6"
          }`}
        >
          {generatedReport && reportEditorOpen ? (
            <div className="min-h-0 flex-1 overflow-hidden bg-[#F4F6F9]">
              <AnalysisReportEditor
                passageId={passage.id}
                initialReport={generatedReport}
                onDraftChange={handleReportDraftChange}
                onSaved={handleReportSaved}
                onExit={closeReportEditor}
              />
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-slate-400">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="text-[13px]">불러오는 중…</span>
            </div>
          ) : draft && studyMode ? (
            <InlineStudyAnalysisWorkspace
              draft={draft}
              title={editorTitle}
              content={editorContent}
              annotations={annotations}
              customPrompt={customPrompt}
              analysisTone={analysisTone}
              analysisRunning={analysisRunning}
              analysisCreditCost={analysisCreditCost}
              reportJobError={reportJobError}
              onTitleChange={setEditorTitle}
              onContentChange={setEditorContent}
              onAnnotationsChange={setAnnotations}
              onCustomPromptChange={setCustomPrompt}
              onAnalysisToneChange={setAnalysisTone}
              onRunAnalysis={handleRunInlineAnalysis}
              onOpenResult={openReportEditor}
              hasGeneratedReport={!!generatedReport}
              hasActiveReportJob={!!activeReportJobId}
            />
          ) : draft ? (
            // Read-only: no onRerestore → 재복원 버튼 숨김; onTextChange는 no-op.
            <PassageCompare draft={draft} onTextChange={() => {}} />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-5">
              <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
                {passage.content || "내용이 없습니다."}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineStudyAnalysisWorkspace({
  draft,
  title,
  content,
  annotations,
  customPrompt,
  analysisTone,
  analysisRunning,
  analysisCreditCost,
  reportJobError,
  hasGeneratedReport,
  hasActiveReportJob,
  onTitleChange,
  onContentChange,
  onAnnotationsChange,
  onCustomPromptChange,
  onAnalysisToneChange,
  onRunAnalysis,
  onOpenResult,
}: {
  draft: M1PassageDraftWithJob;
  title: string;
  content: string;
  annotations: Annotation[];
  customPrompt: string;
  analysisTone: AnalysisTone;
  analysisRunning: boolean;
  analysisCreditCost: number;
  reportJobError: string | null;
  hasGeneratedReport: boolean;
  hasActiveReportJob: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  onCustomPromptChange: (value: string) => void;
  onAnalysisToneChange: (value: AnalysisTone) => void;
  onRunAnalysis: () => void;
  onOpenResult: () => void;
}) {
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const hasContent = content.trim().length >= 20;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)_320px]">
      <OriginalProblemBox
        draft={draft}
        changes={[]}
        hoveredChangeId={hoveredChangeId}
        activeChangeId={activeChangeId}
        onHoverChange={setHoveredChangeId}
        onSelectChange={setActiveChangeId}
      />

      <div className="flex min-h-0 flex-col rounded-lg border border-blue-200 bg-white shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-blue-100 px-4">
          <div className="min-w-0">
            <span className="text-[13px] font-bold text-slate-900">복원문</span>
            <span className="ml-2 text-[11px] font-semibold text-blue-500">
              마킹 {annotations.length}
            </span>
          </div>
          {hasActiveReportJob ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              생성 중
            </span>
          ) : hasGeneratedReport ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-600">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              생성 완료
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2">
          <Input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="h-8 border-slate-200 text-[12.5px] font-semibold"
            placeholder="제목"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PassageAnnotationEditor
            content={content}
            onContentChange={onContentChange}
            annotations={annotations}
            onAnnotationsChange={onAnnotationsChange}
            showAnnotationHint
            placeholder="복원문을 확인하고 텍스트를 드래그해 핵심 어휘, 어법, 읽기 포인트, 출제 포인트를 마킹하세요."
          />
        </div>
      </div>

      <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
          <span className="flex size-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <Sparkles className="size-3.5" aria-hidden="true" />
          </span>
          <span className="text-[13px] font-bold text-slate-900">학습자료 생성</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <AnalysisToneSelector
            value={analysisTone}
            onChange={onAnalysisToneChange}
            compact
          />
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase text-slate-500">
              선생님의 노하우
            </span>
            <Textarea
              value={customPrompt}
              onChange={(event) => onCustomPromptChange(event.target.value)}
              className="min-h-[120px] flex-1 resize-none border-slate-200 text-[12px] leading-relaxed placeholder:text-slate-300"
              spellCheck={false}
              placeholder="예: 빈칸 출제 가능한 논리 전환, 관계대명사, 핵심 어휘를 중심으로 분석"
            />
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-slate-100 p-3">
          {reportJobError ? (
            <p className="rounded-md bg-rose-50 px-2.5 py-2 text-[11px] font-semibold leading-relaxed text-rose-600">
              {reportJobError}
            </p>
          ) : null}
          {hasGeneratedReport ? (
            <Button
              type="button"
              variant="outline"
              onClick={onOpenResult}
              className="h-9 w-full rounded-lg border-emerald-200 text-[12.5px] font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              학습자료 다시 열기
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={onRunAnalysis}
            disabled={analysisRunning || !hasContent}
            className="h-10 w-full rounded-lg bg-blue-600 text-[12.5px] font-bold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {analysisRunning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="size-4" aria-hidden="true" />
            )}
            {analysisRunning ? "백그라운드 생성 중..." : "학습자료 생성"}
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">
              {analysisCreditCost.toLocaleString("ko-KR")} 크레딧
            </span>
          </Button>
        </div>
      </aside>
    </div>
  );
}
