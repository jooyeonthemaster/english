"use client";

import { useState, useEffect } from "react";
import {
  X,
  FileText,
  CheckCircle2,
  Loader2,
  Trash2,
  RefreshCw,
  Lightbulb,
  Undo2,
  Pencil,
  Check,
  Printer,
  FileQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SaveButton } from "@/components/ui/save-button";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { toast } from "sonner";
import { notifyCreditsChanged } from "@/lib/credits-client";
import {
  deleteWorkbenchPassage,
  updatePassageAnalysis,
  renamePassage,
} from "@/actions/workbench";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  AnalysisToneSelector,
  type AnalysisPromptConfig,
} from "./analysis-prompt-panel";
import {
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import { InteractivePassageView } from "./interactive-passage-view";
import { PrimeAnalysisView } from "./prime-analysis-view";
import type { ReportEditorToolbarState } from "./analysis-report/AnalysisReportEditor";
import { useUnsavedCloseGuard } from "@/components/shared/use-unsaved-close-guard";
import { AnalysisLoadingOverlay } from "./analysis-loading-overlay";
import { GenerationPlanSelector } from "@/components/workbench/generation-plan-selector";
import {
  getDisplayQuestionTags,
  sanitizeAiModelDisclosureText,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

// ─── Types ───────────────────────────────────────────────
interface PassageData {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  source: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: {
    id: string;
    analysisData: string;
    contentHash: string;
    updatedAt: Date;
  } | null;
  extractionReviewDraft?: {
    id: string;
    savedPassageId: string | null;
    reviewStatus: string;
    confirmedAt?: string | Date | null;
    updatedAt?: string | Date | null;
  } | null;
  notes: Array<{
    id: string;
    noteType: string;
    content: string;
    order: number;
  }>;
  questions: Array<{
    id: string;
    type: string;
    subType: string | null;
    difficulty: string;
    questionText: string;
    options: string | null;
    correctAnswer: string;
    tags: string | null;
    aiGenerated: boolean;
    approved: boolean;
    createdAt: Date;
    explanation: {
      id: string;
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
    } | null;
    _count?: { examLinks: number };
  }>;
}

interface PassageAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  passage: PassageData;
  initialAnalysis: PassageAnalysisData | null;
  initialPromptConfig?: AnalysisPromptConfig;
  onAnalysisUpdate?: (data: PassageAnalysisData) => void;
  onQuestionsUpdate?: (questions: PassageData["questions"]) => void;
  onDelete?: (passageId: string) => void;
  reviewBusy?: boolean;
  onToggleExtractionReview?: (passage: PassageData) => void;
}

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object")
    return Array.isArray(fallback) && !Array.isArray(str)
      ? fallback
      : (str as T);
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(fallback) && !Array.isArray(parsed)
      ? fallback
      : parsed;
  } catch {
    return fallback;
  }
}

// ─── Modal Component ─────────────────────────────────────
export function PassageAnalysisModal({
  open,
  onClose,
  passage,
  initialAnalysis,
  initialPromptConfig,
  onAnalysisUpdate,
  onDelete,
  reviewBusy = false,
  onToggleExtractionReview,
}: PassageAnalysisModalProps) {
  const [analysisData, setAnalysisData] = useState<PassageAnalysisData | null>(
    initialAnalysis,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  // PRIME 편집기(레이아웃)에서 끌어올린 저장 상태 — 헤더에 저장 버튼을 렌더한다.
  const [editorToolbar, setEditorToolbar] =
    useState<ReportEditorToolbarState | null>(null);
  // ── 제목 인라인 편집 (헤더 연필 버튼) ──
  const [title, setTitle] = useState(passage.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(passage.title);
  const [savingTitle, setSavingTitle] = useState(false);
  // 다른 지문으로 모달이 바뀌면 로컬 제목을 동기화한다.
  useEffect(() => {
    setTitle(passage.title);
    setEditingTitle(false);
  }, [passage.id, passage.title]);

  const startEditTitle = () => {
    setTitleDraft(title);
    setEditingTitle(true);
  };
  const cancelEditTitle = () => {
    setEditingTitle(false);
    setTitleDraft(title);
  };
  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === title) {
      cancelEditTitle();
      return;
    }
    setSavingTitle(true);
    const prev = title;
    setTitle(next); // 낙관적 반영
    setEditingTitle(false);
    try {
      const res = await renamePassage(passage.id, next);
      if (!res.success) {
        setTitle(prev);
        toast.error(res.error || "제목 수정에 실패했습니다.");
      } else {
        toast.success("제목을 변경했습니다.");
      }
    } catch (err) {
      setTitle(prev);
      toast.error(err instanceof Error ? err.message : "제목 수정에 실패했습니다.");
    } finally {
      setSavingTitle(false);
    }
  };
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // 닫기 가드 — PRIME 학습지 편집기의 실제 미저장 상태(editorToolbar.dirty)로 경고.
  const closeGuard = useUnsavedCloseGuard({
    isDirty: Boolean(editorToolbar?.dirty) || hasUnsavedChanges,
    onClose,
  });
  const [lastPromptConfig, setLastPromptConfig] =
    useState<AnalysisPromptConfig>(
      initialPromptConfig || {
        customPrompt: "",
        focusAreas: [],
        targetLevel: "",
        generationPlan: "STANDARD",
        analysisTone: DEFAULT_ANALYSIS_TONE,
      },
    );
  const [generationPlan, setGenerationPlan] = useState<QuestionGenerationPlan>(
    lastPromptConfig.generationPlan || "STANDARD",
  );
  const [analysisTone, setAnalysisTone] = useState<AnalysisTone>(
    lastPromptConfig.analysisTone || DEFAULT_ANALYSIS_TONE,
  );

  const tags: string[] = getDisplayQuestionTags(
    passage.tags ? safeParseJSON(passage.tags, []) : [],
  );
  const reviewDraft = passage.extractionReviewDraft ?? null;
  const isReviewCommitted = reviewDraft?.reviewStatus === "COMMITTED";

  // Sync when passage changes
  useEffect(() => {
    setAnalysisData(initialAnalysis);
    setHasUnsavedChanges(false);
    const nextConfig = initialPromptConfig || {
      customPrompt: "",
      focusAreas: [],
      targetLevel: "",
      generationPlan: "STANDARD" as const,
      analysisTone: DEFAULT_ANALYSIS_TONE,
    };
    setLastPromptConfig(nextConfig);
    setGenerationPlan(nextConfig.generationPlan || "STANDARD");
    setAnalysisTone(nextConfig.analysisTone || DEFAULT_ANALYSIS_TONE);
  }, [initialAnalysis, initialPromptConfig, passage.id]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGuard.requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeGuard.requestClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  // ─── Analysis ────────────────────────────────────────
  const runAnalysisWithConfig = async (config: AnalysisPromptConfig) => {
    setAnalyzing(true);
    const selectedPlan = config.generationPlan || generationPlan;
    const selectedTone = config.analysisTone || analysisTone;
    setGenerationPlan(selectedPlan);
    setAnalysisTone(selectedTone);
    setLastPromptConfig({
      ...config,
      generationPlan: selectedPlan,
      analysisTone: selectedTone,
    });
    try {
      const hasConfig =
        config.customPrompt ||
        config.focusAreas.length > 0 ||
        config.targetLevel ||
        selectedTone !== DEFAULT_ANALYSIS_TONE;
      let res: Response;
      if (hasConfig) {
        res = await fetch(`/api/ai/passage-analysis/${passage.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customPrompt: config.customPrompt,
            focusAreas: config.focusAreas,
            targetLevel: config.targetLevel,
            generationPlan: selectedPlan,
            analysisTone: selectedTone,
          }),
        });
      } else {
        const params = new URLSearchParams({
          generationPlan: selectedPlan,
          analysisTone: selectedTone,
        });
        res = await fetch(`/api/ai/passage-analysis/${passage.id}?${params}`);
      }
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setAnalysisData(json.data);
        setHasUnsavedChanges(false);
        onAnalysisUpdate?.(json.data);
        toast.success(
          json.cached
            ? "캐시된 분석을 불러왔습니다."
            : "AI 분석이 완료되었습니다.",
        );
      }
    } catch {
      toast.error("분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
      notifyCreditsChanged(); // 차감/실패환급 즉시 사이드바 반영
    }
  };

  // ─── Save edited analysis ────────────────────────────
  const handleSave = async () => {
    if (!analysisData) return;
    setSaving(true);
    try {
      const result = await updatePassageAnalysis(
        passage.id,
        JSON.stringify(analysisData),
      );
      if (result.success) {
        setHasUnsavedChanges(false);
        onAnalysisUpdate?.(analysisData);
        toast.success("분석 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete passage ──────────────────────────────────
  const handleDelete = async () => {
    if (!confirm("이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다."))
      return;
    setDeleting(true);
    const result = await deleteWorkbenchPassage(passage.id);
    if (result.success) {
      toast.success("지문이 삭제되었습니다.");
      onDelete?.(passage.id);
      onClose();
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  };

  // 헤더 메타 뱃지 — PC(제목 아래)와 모바일(헤더 둘째 줄)이 같은 목록을 공유한다.
  const hasMetaBadges = !!(
    passage.school ||
    passage.grade ||
    passage.semester ||
    passage.unit ||
    tags.length > 0
  );
  const metaBadges = (
    <>
      {passage.school && (
        <Badge variant="outline" className="text-[10px] h-5">
          {passage.school.name}
        </Badge>
      )}
      {passage.grade && (
        <Badge variant="secondary" className="text-[10px] h-5">
          {passage.grade}학년
        </Badge>
      )}
      {passage.semester && (
        <Badge variant="secondary" className="text-[10px] h-5">
          {passage.semester === "FIRST" ? "1학기" : "2학기"}
        </Badge>
      )}
      {passage.unit && (
        <Badge variant="secondary" className="text-[10px] h-5">
          {passage.unit}
        </Badge>
      )}
      {tags.map((t) => (
        <Badge
          key={t}
          variant="outline"
          className="text-[10px] h-5 text-slate-500"
        >
          {t}
        </Badge>
      ))}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => closeGuard.requestClose()}
      />

      {/* Modal container — 화면 크기에 따라 반응형으로 대부분의 영역을 채운다(상한 없음) */}
      <TooltipProvider>
        <div
          className="relative z-10 w-full mx-3 my-3 bg-[#F8FAFB] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          data-generate-tour="passage-learning-detail-modal"
        >
          {/* Analysis overlay inside modal */}
          {analyzing && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-2xl">
              <AnalysisLoadingOverlay />
            </div>
          )}

          {/* ─── Modal Header ───
              모바일(<lg)은 1줄(아이콘·제목·저장·인쇄·삭제·닫기) + 2줄(뱃지)로 나누고,
              PC(lg+)는 기존처럼 제목 아래(왼쪽 컬럼 안)에 뱃지를 둔다. */}
          <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                {editingTitle ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveTitle();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditTitle();
                        }
                      }}
                      onBlur={() => void saveTitle()}
                      disabled={savingTitle}
                      placeholder="학습지 제목"
                      className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-2 py-1 text-[16px] font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void saveTitle()}
                      disabled={savingTitle}
                      title="제목 저장"
                      aria-label="제목 저장"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-60"
                    >
                      {savingTitle ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2 className="text-[16px] font-bold text-slate-800 truncate">
                      {sanitizeAiModelDisclosureText(title)}
                    </h2>
                    <button
                      type="button"
                      onClick={startEditTitle}
                      title="제목 수정"
                      aria-label="제목 수정"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
                {/* PC(lg+) 전용 — 제목 아래 뱃지(기존 위치). 모바일은 헤더 둘째 줄로. */}
                <div className="hidden lg:flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {metaBadges}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {reviewDraft && onToggleExtractionReview ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={isReviewCommitted ? "검수취소" : "미검수"}
                  aria-label={isReviewCommitted ? "검수취소" : "미검수"}
                  className={
                    "size-8 p-0 text-xs font-bold " +
                    (isReviewCommitted
                      ? "border-emerald-500 bg-white text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      : "border-red-200/80 bg-white text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                  }
                  onClick={() => onToggleExtractionReview(passage)}
                  disabled={reviewBusy}
                >
                  {reviewBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isReviewCommitted ? (
                    <Undo2 className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              ) : null}
              {hasUnsavedChanges && (
                <SaveButton onClick={handleSave} saving={saving} iconOnly />
              )}
              {/* PRIME 편집기 저장·인쇄 — 편집기 툴바에서 이 헤더로 끌어올림. */}
              {editorToolbar ? (
                <>
                  {/* 실전 학습지 생성 — 저장 버튼 왼쪽. 가느다란 구분선으로 '생성' 과 '저장' 을 기능적으로 분리. */}
                  {!editorToolbar.worksheetHasContent ? (
                    <>
                      <button
                        type="button"
                        onClick={editorToolbar.generateWorksheet}
                        disabled={editorToolbar.worksheetBusy || editorToolbar.saving}
                        title="실전 학습지(어법 선택·어휘 빈칸·배열 + 수능추론 5문항) 추가 생성"
                        className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[11.5px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {editorToolbar.worksheetBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileQuestion className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden items-center gap-1.5 sm:inline-flex">
                          {editorToolbar.worksheetBusy ? "실전 학습지 생성 중…" : "실전 학습지 생성"}
                          {!editorToolbar.worksheetBusy && (
                            <CreditCostChip
                              amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                              className="rounded bg-blue-100 px-1 py-px text-[10px] text-blue-700"
                            />
                          )}
                        </span>
                        <span className="sm:hidden">실전 학습지</span>
                      </button>
                      <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 self-center bg-slate-200" />
                    </>
                  ) : null}
                  <SaveButton
                    onClick={editorToolbar.save}
                    saving={editorToolbar.saving}
                    disabled={!editorToolbar.dirty}
                    iconOnly
                  />
                  <button
                    type="button"
                    onClick={() =>
                      // 인쇄 전 웹폰트 로드 완료를 기다린다 — 폰트 미로드 상태로 window.print()가
                      // 실행되면 브라우저가 프린트 준비 중 폰트를 받아 스풀 시작이 지연된다.
                      void document.fonts.ready.then(() => window.print())
                    }
                    title="인쇄"
                    aria-label="인쇄"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                title="삭제"
                aria-label="삭제"
                className="size-8 p-0 border-red-200 bg-white text-xs font-semibold text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                onClick={handleDelete}
                disabled={deleting}
              >
                {/* Trash2 는 뷰박스 안 그림이 저장·인쇄 아이콘보다 작게 그려져 있어 같은
                    박스에서도 작아 보인다. 박스(w/h) 를 키우는 건 모바일 대형UI 레이어의
                    svg 크기 !important 규칙과 충돌하니, 박스는 저장·인쇄와 동일하게 두고
                    그림만 transform 으로 키워 시각 크기를 맞춘다(모바일 전용, lg: 로 PC 복원). */}
                <Trash2 className="h-3.5 w-3.5 scale-125 lg:scale-100" />
              </Button>
              <button
                onClick={() => closeGuard.requestClose()}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
          {/* 모바일(<lg) 전용 — 뱃지를 헤더 둘째 줄로 (1줄엔 제목·액션만) */}
          {hasMetaBadges && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 lg:hidden">
              {metaBadges}
            </div>
          )}
          </div>

          {/* ─── Content area — PRIME A4 (있으면) / 기존 5-layer 인터랙티브 (폴백) ─── */}
          <div className="flex-1 min-h-0">
            <PrimeAnalysisView
              passageId={passage.id}
              legacyAnalysisData={analysisData}
              passageContent={passage.content}
              onToolbarStateChange={setEditorToolbar}
            />
          </div>
        </div>
      </TooltipProvider>
      {closeGuard.dialog}
    </div>
  );
}
