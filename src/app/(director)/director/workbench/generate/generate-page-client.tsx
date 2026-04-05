// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  X,
  Cpu,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { QuestionCard, type QuestionCardItem } from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { getCustomPrompts } from "@/actions/custom-prompts";
import {
  type PassageItem,
  type FilterOptions,
  type QueueItem,
} from "./generate-page-types";
import { PassageCardGrid } from "./passage-card-grid";
import { GenerationConfigPanel } from "./generation-config-panel";
import { BottomQueueSection } from "./bottom-queue-section";
import { useGenerationHandlers } from "./use-generation-handlers";

// ─── Component ───────────────────────────────────────────

export function GeneratePageClient({ academyId }: { academyId: string }) {
  const router = useRouter();

  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ schools: [], grades: [], semesters: [], publishers: [] });
  const [loadingPassages, setLoadingPassages] = useState(true);

  // ── Collections ──
  const [collections, setCollections] = useState<{ id: string; name: string; _count: { items: number } }[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  // ── Search/filter state ──
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Selected passage ──
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // ── Mode: auto vs manual ──
  const [genMode, setGenMode] = useState<"auto" | "manual">("auto");

  // ── Auto mode config ──
  const [autoCount, setAutoCount] = useState(1);

  // ── Manual mode config ──
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [difficulty, setDifficulty] = useState<"BASIC" | "INTERMEDIATE" | "KILLER">("INTERMEDIATE");
  const [customPrompt, setCustomPrompt] = useState("");

  // ── Saved prompts ──
  const [savedPrompts, setSavedPrompts] = useState<{ id: string; name: string; content: string }[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savePromptName, setSavePromptName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ── Session queue ──
  const [sessionQueue, setSessionQueue] = useState<QueueItem[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "unreviewed" | "reviewed" | "error">("all");

  // ── Review modal ──
  const [reviewModalId, setReviewModalId] = useState<string | null>(null);

  // ── Checkbox multi-select ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Analysis detail modal ──
  const [analysisModalPassage, setAnalysisModalPassage] = useState<any>(null);
  const [loadingAnalysisModal, setLoadingAnalysisModal] = useState(false);

  // ── Saved questions from DB (persists across page visits) ──
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSavedQuestions, setLoadingSavedQuestions] = useState(true);

  // ── Question detail modal ──
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(null);

  // ── Computed ──
  const totalQuestions = useMemo(() => Object.values(typeCounts).reduce((a, b) => a + b, 0), [typeCounts]);
  const activeTypes = useMemo(() => Object.keys(typeCounts).filter((k) => typeCounts[k] > 0), [typeCounts]);

  const filteredPassages = useMemo(() => {
    return passages.filter((p) => {
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      if (selectedCollectionId && !p.collectionItems?.some(ci => ci.collectionId === selectedCollectionId)) return false;
      return true;
    });
  }, [passages, passageSearch, filterSchool, filterGrade, filterSemester, selectedCollectionId]);

  const filteredQueue = useMemo(() => {
    if (queueFilter === "all") return sessionQueue;
    if (queueFilter === "unreviewed") return sessionQueue.filter((q) => q.status === "done");
    if (queueFilter === "reviewed") return sessionQueue.filter((q) => q.status === "reviewed");
    if (queueFilter === "error") return sessionQueue.filter((q) => q.status === "error");
    return sessionQueue;
  }, [sessionQueue, queueFilter]);

  const reviewItem = useMemo(() => sessionQueue.find((q) => q.id === reviewModalId) || null, [sessionQueue, reviewModalId]);

  const queueCounts = useMemo(() => ({
    generating: sessionQueue.filter((q) => q.status === "generating").length,
    done: sessionQueue.filter((q) => q.status === "done").length,
    reviewed: sessionQueue.filter((q) => q.status === "reviewed").length,
    error: sessionQueue.filter((q) => q.status === "error").length,
  }), [sessionQueue]);

  const activeFilterCount = [filterSchool, filterGrade, filterSemester].filter(Boolean).length;

  // ── Load passages ──
  useEffect(() => {
    setLoadingPassages(true);
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
        if (data.collections) setCollections(data.collections);
      })
      .catch(() => {})
      .finally(() => setLoadingPassages(false));
  }, [academyId]);

  // ── Load saved questions from DB ──
  const loadSavedQuestions = useCallback(async () => {
    try {
      const { getWorkbenchQuestions } = await import("@/actions/workbench");
      const result = await getWorkbenchQuestions(academyId, { page: 1, aiGenerated: true });
      if (result?.questions) {
        setSavedQuestions(result.questions as QuestionCardItem[]);
      }
    } catch { /* ignore */ }
    finally { setLoadingSavedQuestions(false); }
  }, [academyId]);
  useEffect(() => { loadSavedQuestions(); }, [loadSavedQuestions]);

  // ── Load saved prompts ──
  const loadSavedPrompts = useCallback(async () => {
    const prompts = await getCustomPrompts("QUESTION_GENERATION");
    setSavedPrompts(prompts.map((p) => ({ id: p.id, name: p.name, content: p.content })));
  }, []);
  useEffect(() => { loadSavedPrompts(); }, [loadSavedPrompts]);

  // ── Parse analysis from passage data (already loaded with list) ──
  useEffect(() => {
    if (!selectedPassage) { setAnalysisData(null); return; }
    if (selectedPassage.analysis?.analysisData) {
      try {
        const parsed = typeof selectedPassage.analysis.analysisData === "string"
          ? JSON.parse(selectedPassage.analysis.analysisData)
          : selectedPassage.analysis.analysisData;
        setAnalysisData(parsed);
      } catch {
        setAnalysisData(null);
      }
    } else {
      setAnalysisData(null);
    }
    setLoadingAnalysis(false);
  }, [selectedPassage?.id]);

  // ── Handlers ──
  const setTypeCount = useCallback((id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  }, []);

  const handleSelectPassage = useCallback((p: PassageItem) => {
    setSelectedPassage(p);
  }, []);

  // ── Checkbox toggle ──
  const toggleCheckbox = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // If exactly 1 selected, also set as selectedPassage
      if (next.size === 1) {
        const selectedId = Array.from(next)[0];
        const p = passages.find((pp) => pp.id === selectedId);
        if (p) setSelectedPassage(p);
      }
      return next;
    });
  }, [passages]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  }, [filteredPassages]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ── Open analysis detail modal ──
  const handleOpenAnalysisModal = useCallback(async (passageId: string) => {
    setLoadingAnalysisModal(true);
    try {
      const { getWorkbenchPassage } = await import("@/actions/workbench");
      const result = await getWorkbenchPassage(passageId);
      if (result) {
        setAnalysisModalPassage(result);
      } else {
        toast.error("지문 데이터를 불러올 수 없습니다.");
      }
    } catch {
      toast.error("지문 로딩 실패");
    } finally {
      setLoadingAnalysisModal(false);
    }
  }, []);

  // ── Generation handlers (extracted to hook) ──
  const { handleBatchGenerate, handleGenerate, handleSaveQuestions } = useGenerationHandlers({
    passages,
    selectedIds,
    setSelectedIds,
    genMode,
    typeCounts,
    activeTypes,
    difficulty,
    customPrompt,
    autoCount,
    selectedPassage,
    analysisData,
    totalQuestions,
    setSessionQueue,
    reviewItem,
    setReviewModalId,
    loadSavedQuestions,
  });

  // ── Can generate? ──
  const canGenerate = selectedIds.size > 0 && (genMode === "auto" ? autoCount > 0 : totalQuestions > 0);

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-slate-50">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-4 px-8 py-4 bg-white border-b border-slate-200/80 shrink-0">
        <Link
          href="/director/workbench"
          className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[18px] font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 border border-teal-100">
              <Cpu className="w-4.5 h-4.5 text-teal-600" />
            </div>
            AI 문제 생성
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {queueCounts.generating > 0 && (
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-teal-50 border border-teal-200/60">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
              <span className="text-[12px] font-semibold text-teal-700">생성중 {queueCounts.generating}</span>
            </div>
          )}
          {queueCounts.done > 0 && (
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-teal-50 border border-teal-200/60">
              <Eye className="w-3.5 h-3.5 text-teal-600" />
              <span className="text-[12px] font-semibold text-teal-700">미검토 {queueCounts.done}</span>
            </div>
          )}
          {queueCounts.reviewed > 0 && (
            <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-50 border border-emerald-200/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[12px] font-semibold text-emerald-700">완료 {queueCounts.reviewed}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main ─── */}
      <div className="flex flex-col">

      {/* ═══ TOP SECTION: 지문 카드 + 설정 (가로 2패널, 고정 높이) ═══ */}
      <div className="grid grid-cols-[1fr_420px] bg-white h-[420px]">

        {/* ═══ LEFT PANEL: Passage cards ═══ */}
        <PassageCardGrid
          passages={passages}
          filteredPassages={filteredPassages}
          filterOptions={filterOptions}
          collections={collections}
          loadingPassages={loadingPassages}
          passageSearch={passageSearch}
          setPassageSearch={setPassageSearch}
          filterSchool={filterSchool}
          setFilterSchool={setFilterSchool}
          filterGrade={filterGrade}
          setFilterGrade={setFilterGrade}
          filterSemester={filterSemester}
          setFilterSemester={setFilterSemester}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          activeFilterCount={activeFilterCount}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          selectedIds={selectedIds}
          toggleCheckbox={toggleCheckbox}
          selectAll={selectAll}
          deselectAll={deselectAll}
          genMode={genMode}
          totalQuestions={totalQuestions}
          handleBatchGenerate={handleBatchGenerate}
          handleOpenAnalysisModal={handleOpenAnalysisModal}
        />

        {/* ═══ RIGHT PANEL: Generation settings ═══ */}
        <GenerationConfigPanel
          genMode={genMode}
          setGenMode={setGenMode}
          autoCount={autoCount}
          setAutoCount={setAutoCount}
          typeCounts={typeCounts}
          setTypeCount={setTypeCount}
          setTypeCounts={setTypeCounts}
          totalQuestions={totalQuestions}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          savedPrompts={savedPrompts}
          showSavedPrompts={showSavedPrompts}
          setShowSavedPrompts={setShowSavedPrompts}
          showSaveInput={showSaveInput}
          setShowSaveInput={setShowSaveInput}
          savePromptName={savePromptName}
          setSavePromptName={setSavePromptName}
          savingPrompt={savingPrompt}
          setSavingPrompt={setSavingPrompt}
          editingPromptId={editingPromptId}
          setEditingPromptId={setEditingPromptId}
          editingName={editingName}
          setEditingName={setEditingName}
          loadSavedPrompts={loadSavedPrompts}
          canGenerate={canGenerate}
          selectedIds={selectedIds}
          handleBatchGenerate={handleBatchGenerate}
        />
      </div>

      {/* ═══ Divider ═══ */}
      <div className="h-3 bg-[#E8EAEE] shrink-0 border-y border-slate-200/60" />

      {/* ═══ BOTTOM SECTION: 생성 중 + DB 저장된 문제 ═══ */}
      <BottomQueueSection
        sessionQueue={sessionQueue}
        filteredQueue={filteredQueue}
        queueFilter={queueFilter}
        setQueueFilter={setQueueFilter}
        queueCounts={queueCounts}
        autoCount={autoCount}
        savedQuestions={savedQuestions}
        loadingSavedQuestions={loadingSavedQuestions}
        setDetailQuestion={setDetailQuestion}
      />

      </div>{/* end vertical split */}

      {/* ─── Review Modal ─── */}
      {reviewItem && (
        <QuestionReviewModal
          open={!!reviewModalId}
          onClose={() => setReviewModalId(null)}
          passageTitle={reviewItem.passageTitle}
          passageContent={reviewItem.passageContent}
          analysisData={reviewItem.analysisData}
          passageMeta={reviewItem.passageMeta}
          questions={reviewItem.questions}
          onSave={handleSaveQuestions}
          onRegenerate={() => {
            setReviewModalId(null);
            const p = passages.find((pp) => pp.id === reviewItem.passageId);
            if (p) {
              handleSelectPassage(p);
              if (reviewItem.config.mode === "manual") {
                setGenMode("manual");
                setTypeCounts(reviewItem.config.typeCounts);
              } else {
                setGenMode("auto");
              }
              setDifficulty(reviewItem.config.difficulty as any);
              setCustomPrompt(reviewItem.config.prompt);
            }
          }}
        />
      )}

      {/* ─── Question Detail Modal ─── */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setDetailQuestion(null)} />
          <div className="relative z-10 w-full max-w-[1200px] mx-4 my-4 bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 shrink-0">
              <h2 className="text-[15px] font-bold text-slate-800">문제 상세</h2>
              <button onClick={() => setDetailQuestion(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            {/* Content: 2 columns */}
            <div className="flex-1 overflow-hidden grid grid-cols-2">
              {/* Left: Passage */}
              <div className="border-r border-slate-200 overflow-y-auto">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <InteractivePassageView
                      content={detailQuestion.passage.content}
                      analysisData={(() => {
                        const p = passages.find(pp => pp.id === detailQuestion.passage?.id);
                        if (!p?.analysis?.analysisData) return null;
                        try { return typeof p.analysis.analysisData === "string" ? JSON.parse(p.analysis.analysisData) : p.analysis.analysisData; } catch { return null; }
                      })()}
                      layout="vertical"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">지문 없음</div>
                )}
              </div>
              {/* Right: Question */}
              <div className="overflow-y-auto px-6 py-5">
                <QuestionCard q={detailQuestion} num={1} readonly />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Analysis Detail Modal ─── */}
      {analysisModalPassage && (
        <PassageAnalysisModal
          open={!!analysisModalPassage}
          onClose={() => setAnalysisModalPassage(null)}
          passage={analysisModalPassage}
          initialAnalysis={
            analysisModalPassage.analysis?.analysisData
              ? (typeof analysisModalPassage.analysis.analysisData === "string"
                ? JSON.parse(analysisModalPassage.analysis.analysisData)
                : analysisModalPassage.analysis.analysisData)
              : null
          }
        />
      )}

      {/* Loading overlay for analysis modal fetch */}
      {loadingAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="bg-white rounded-xl px-6 py-4 shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
            <span className="text-[13px] text-slate-700 font-medium">지문 분석 데이터 로딩 중...</span>
          </div>
        </div>
      )}
    </div>
  );
}
