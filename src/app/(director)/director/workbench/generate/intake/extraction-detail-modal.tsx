"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { updateWorkbenchPassage } from "@/actions/workbench";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { AnalysisReportEditor } from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import type { PassageItem } from "../generate-page-types";
import { OriginalProblemBox } from "../../passages/import/_components/extraction-manage-client/components/original-problem-box";
import { RestorationBadge } from "../../passages/import/_components/extraction-manage-client/components/restoration-badge";
import { RestorationChangesPanel } from "../../passages/import/_components/extraction-manage-client/components/restoration-changes-panel";
import type { M1PassageDraftWithJob } from "../../passages/import/_components/extraction-manage-client/types";
import { formatExtractedTextForDisplay } from "../../passages/import/_components/extraction-manage-client/utils/display-text";
import {
  isHighlightableChange,
  mapChangesToOffsets,
  selectInlineChanges,
} from "../../passages/import/_components/extraction-manage-client/utils/restoration-changes";

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
    window.localStorage.setItem(
      reportDraftStorageKey(passageId),
      JSON.stringify(report),
    );
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
  /** 제목/복원문 저장 직후 호출 — 부모가 카드 목록을 제자리 갱신할 수 있게. */
  onPassageSaved?: (
    passageId: string,
    updated: { title: string; content: string },
  ) => void;
  reviewBusy?: boolean;
  onToggleExtractionReview?: (passage: PassageItem) => void;
  /** 지문 삭제 — 제공된 경우에만 헤더에 삭제 버튼을 노출한다. */
  deleteBusy?: boolean;
  onDelete?: (passage: PassageItem) => void;
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
  onPassageSaved,
  reviewBusy = false,
  onToggleExtractionReview,
  deleteBusy = false,
  onDelete,
}: ExtractionDetailModalProps) {
  const [draft, setDraft] = useState<M1PassageDraftWithJob | null>(null);
  const [loading, setLoading] = useState(true);
  const displayPassageContent = useMemo(
    () => formatExtractedTextForDisplay(passage.content || ""),
    [passage.content],
  );
  const [editorTitle, setEditorTitle] = useState(passage.title || "지문");
  const [editorContent, setEditorContent] = useState(passage.content || "");
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeReportJobId, setActiveReportJobId] = useState<string | null>(
    null,
  );
  // 학습자료 생성은 이 모달에서 더 이상 시작하지 않지만, 다른 화면에서 시작된
  // 생성 잡은 폴링으로 완료를 감지해 생성된 학습자료를 열어준다.
  const [, setReportJobError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<AnalysisReport | null>(
    null,
  );
  const [reportEditorOpen, setReportEditorOpen] = useState(false);

  const sourceLabel =
    draft?.job?.displayName?.trim() ||
    draft?.job?.originalFileName?.trim() ||
    passage.source ||
    "";

  // 기출 지문에서 담은 지문은 직접-입력 계보를 재사용하므로 job 라벨은 "직접 붙여넣은
  // 지문"으로 같지만, draft.metadata.source 로 기출임을 구분해 출처 표기를 바꾼다.
  const isExamPassage =
    !!draft &&
    typeof draft.metadata === "object" &&
    draft.metadata !== null &&
    (draft.metadata as { source?: unknown }).source === "EXAM_PASSAGE";
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
    // Passage.content 우선 — 이 모달의 "저장"은 Passage 를 갱신하므로,
    // 다시 열었을 때도 저장본이 보여야 한다. (draft.teacherText 는 승급
    // 시점의 복원문이라 저장 후에는 한 세대 뒤일 수 있다.)
    const nextText =
      passage.content ||
      draft?.teacherText?.trim() ||
      draft?.restoredText?.trim() ||
      draft?.rawText?.trim() ||
      "";
    setEditorContent(nextText);
    setEditorTitle(passage.title || draft?.title || "지문");
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
              (candidate: { id?: string }) =>
                candidate.id === activeReportJobId,
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
            setReportJobError(
              "생성은 완료되었지만 학습자료를 불러오지 못했습니다. 잠시 후 다시 열어주세요.",
            );
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

  /** 제목·복원문을 Passage 에 저장한다. 검증 실패 시 toast 후 null. */
  async function persistPassageEdits(): Promise<{
    title: string;
    content: string;
  } | null> {
    const title = editorTitle.trim() || passage.title || "지문";
    const content = editorContent.trim();
    if (content.length < 20) {
      toast.error("지문이 너무 짧습니다. 최소 20자 이상 필요합니다.");
      return null;
    }

    const updateResult = await updateWorkbenchPassage(passage.id, {
      title,
      content,
      schoolId: passage.school?.id,
      grade: passage.grade ?? undefined,
      semester: passage.semester ?? undefined,
      unit: passage.unit ?? undefined,
      publisher: passage.publisher ?? undefined,
      difficulty: passage.difficulty ?? undefined,
      // 기존 source 를 보존한다 — sourceLabel(추출 잡 파일명)로 덮어쓰면
      // '직접 입력' 마커 등이 사라져 배지·필터가 깨진다. source 가 비어있을
      // 때만 잡 파일명으로 채운다.
      source: passage.source || sourceLabel || undefined,
    });
    if (!updateResult.success) {
      throw new Error(updateResult.error || "지문을 저장하지 못했습니다.");
    }

    return { title, content };
  }

  /** 학습자료 생성 없이 제목/복원문 수정만 저장. */
  async function handleSaveEdits() {
    if (saving || analysisRunning) return;
    setSaving(true);
    try {
      const saved = await persistPassageEdits();
      if (!saved) return;
      onPassageSaved?.(passage.id, saved);
      toast.success("지문이 저장되었습니다.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "지문 저장 중 오류가 발생했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 mx-4 my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-[1760px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFB] shadow-2xl"
        data-generate-tour="passage-learning-detail-modal"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 xl:px-6">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-bold text-slate-900">
                {reportEditorOpen
                  ? generatedReport?.meta.titleKo ||
                    editorTitle ||
                    "지문 학습자료"
                  : editorTitle.trim() || passage.title || "지문"}
              </h2>
              {draft ? (
                <RestorationBadge status={draft.restorationStatus} />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {reportEditorOpen
                ? "팝업 안에서 학습자료 편집 중 · 뒤로가면 복원문 편집 단계로 돌아갑니다"
                : isExamPassage
                  ? "출처 기출 지문"
                  : draft?.job?.originalFileName
                    ? `출처 ${draft.job.originalFileName}`
                    : "추출·입력된 지문"}
            </p>
          </div>
          {onDelete && !reportEditorOpen ? (
            <button
              type="button"
              onClick={() => onDelete(passage)}
              disabled={deleteBusy}
              className="ml-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleteBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              삭제
            </button>
          ) : null}
          {reportEditorOpen ? (
            <button
              type="button"
              onClick={closeReportEditor}
              className="ml-2 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              뒤로가기
            </button>
          ) : draft ? (
            // 복원문 섹션에 있던 저장 버튼을 창 오른쪽 위로 옮김.
            <button
              type="button"
              onClick={handleSaveEdits}
              disabled={
                saving || analysisRunning || editorContent.trim().length < 20
              }
              title="제목·복원문 수정 내용을 저장합니다 (학습자료 생성 없이)"
              className="ml-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-3.5" aria-hidden="true" />
              )}
              저장
            </button>
          ) : null}
          {reviewDraft && onToggleExtractionReview ? (
            <button
              type="button"
              onClick={() => onToggleExtractionReview(passage)}
              disabled={reviewBusy}
              aria-pressed={isReviewCommitted}
              aria-label={isReviewCommitted ? "검수완료" : "검수필요"}
              title={
                isReviewCommitted
                  ? "검수완료 — 누르면 검수를 취소합니다"
                  : "검수필요 — 누르면 검수완료로 표시합니다"
              }
              className={
                "ml-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-3 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-70 " +
                (isReviewCommitted
                  ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                  : "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
              }
            >
              {reviewBusy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              {isReviewCommitted ? "검수완료" : "미검수"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
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
          ) : draft ? (
            <InlineStudyAnalysisWorkspace
              draft={draft}
              title={editorTitle}
              content={editorContent}
              onTitleChange={setEditorTitle}
              onContentChange={setEditorContent}
              hasActiveReportJob={!!activeReportJobId}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-5">
              <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
                {displayPassageContent || "내용이 없습니다."}
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
  hasActiveReportJob,
  onTitleChange,
  onContentChange,
}: {
  draft: M1PassageDraftWithJob;
  title: string;
  content: string;
  hasActiveReportJob: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
}) {
  const [hoveredChangeId, setHoveredChangeId] = useState<string | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);

  // ─── 복원 근거 (원문/복원문 형광펜 + 변경 카드) ───
  // 자료 추출 페이지의 PassageCompare 와 동일하게 draft.changes 로부터 인라인
  // 변경 목록을 만들어, 원문 패널 형광펜과 우측 복원 근거 카드를 동기화한다.
  // teacherText 기준으로 계산(원본 복원 의미 보존) — 라이브 편집은 추적하지 않음.
  const displayTeacherText = useMemo(
    () => formatExtractedTextForDisplay(draft.teacherText),
    [draft.teacherText],
  );
  const inlineChanges = useMemo(
    () =>
      selectInlineChanges(
        draft.changes ?? [],
        draft.rawText,
        displayTeacherText,
      ),
    [draft.changes, draft.rawText, displayTeacherText],
  );
  const highlightableChanges = useMemo(
    () => inlineChanges.filter(isHighlightableChange),
    [inlineChanges],
  );
  const orphanChangeIds = useMemo(() => {
    if (highlightableChanges.length === 0) return new Set<string>();
    const spans = mapChangesToOffsets(
      displayTeacherText,
      highlightableChanges.map((c) => ({ id: c.id, text: c.after })),
    );
    const matched = new Set(spans.map((s) => s.changeId));
    const orphans = new Set<string>();
    for (const change of highlightableChanges) {
      if (!matched.has(change.id)) orphans.add(change.id);
    }
    return orphans;
  }, [highlightableChanges, displayTeacherText]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.92fr)]">
      <OriginalProblemBox
        draft={draft}
        changes={highlightableChanges}
        hoveredChangeId={hoveredChangeId}
        activeChangeId={activeChangeId}
        onHoverChange={setHoveredChangeId}
        onSelectChange={setActiveChangeId}
        sourceType={draft.job?.sourceType}
      />

      <div className="flex min-h-0 flex-col rounded-lg border border-blue-200 bg-white shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-blue-100 px-4">
          <div className="min-w-0">
            <span className="text-[13px] font-bold text-slate-900">복원문</span>
          </div>
          {hasActiveReportJob ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              생성 중
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
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Textarea
            value={content}
            onChange={(event) => onContentChange(event.target.value)}
            className="min-h-full resize-none border-slate-200 text-[14.5px] leading-7 text-slate-800"
            spellCheck={false}
            placeholder="복원문을 확인하고 필요하면 수정하세요."
          />
        </div>
      </div>

      <RestorationChangesPanel
        changes={inlineChanges}
        orphanChangeIds={orphanChangeIds}
        hoveredChangeId={hoveredChangeId}
        activeChangeId={activeChangeId}
        onHoverChange={setHoveredChangeId}
        onSelectChange={setActiveChangeId}
        restorationStatus={draft.restorationStatus}
      />
    </div>
  );
}
