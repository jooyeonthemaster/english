// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Save,
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Trash2,
  Pencil,
  X,
  Check,
  Cpu,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Minus,
  Plus,
  Filter,
  BookOpen,
  Braces,
  Target,
  Zap,
  Settings2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuestionReviewModal } from "@/components/workbench/question-review-modal";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { QuestionCard, type QuestionCardItem } from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import {
  getCustomPrompts,
  createCustomPrompt,
  updateCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";

// ─── Constants ───────────────────────────────────────────

const EXAM_TYPE_GROUPS = [
  {
    group: "수능/모의고사 객관식",
    items: [
      { id: "BLANK_INFERENCE", label: "빈칸 추론" },
      { id: "GRAMMAR_ERROR", label: "어법 판단" },
      { id: "VOCAB_CHOICE", label: "어휘 적절성" },
      { id: "SENTENCE_ORDER", label: "글의 순서" },
      { id: "SENTENCE_INSERT", label: "문장 삽입" },
      { id: "TOPIC_MAIN_IDEA", label: "주제/요지" },
      { id: "TITLE", label: "제목 추론" },
      { id: "REFERENCE", label: "지칭 추론" },
      { id: "CONTENT_MATCH", label: "내용 일치" },
      { id: "IRRELEVANT", label: "무관한 문장" },
    ],
  },
  {
    group: "내신 서술형",
    items: [
      { id: "CONDITIONAL_WRITING", label: "조건부 영작" },
      { id: "SENTENCE_TRANSFORM", label: "문장 전환" },
      { id: "FILL_BLANK_KEY", label: "핵심 표현 빈칸" },
      { id: "SUMMARY_COMPLETE", label: "요약문 완성" },
      { id: "WORD_ORDER", label: "배열 영작" },
      { id: "GRAMMAR_CORRECTION", label: "문법 오류 수정" },
    ],
  },
  {
    group: "어휘",
    items: [
      { id: "CONTEXT_MEANING", label: "문맥 속 의미" },
      { id: "SYNONYM", label: "동의어" },
      { id: "ANTONYM", label: "반의어" },
    ],
  },
];

// ─── Types ───────────────────────────────────────────────

interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  school: { id: string; name: string } | null;
  content: string;
  analysis?: { analysisData: string } | null;
  collectionItems?: { collectionId: string }[];
}

interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
  publishers: string[];
}

type QueueStatus = "generating" | "done" | "reviewed" | "error";

interface QueueItem {
  id: string;
  passageId: string;
  passageTitle: string;
  passageContent: string;
  passageMeta: { school?: string; grade?: number | null; semester?: string | null; unit?: string | null };
  analysisData: any;
  status: QueueStatus;
  progress: Record<string, "pending" | "done" | "error">;
  questions: any[];
  config: { typeCounts: Record<string, number>; difficulty: string; prompt: string; mode: "auto" | "manual" };
}

// ─── Helpers ─────────────────────────────────────────────

function typeLabel(id: string): string {
  for (const g of EXAM_TYPE_GROUPS) {
    const found = g.items.find((i) => i.id === id);
    if (found) return found.label;
  }
  return id;
}

function buildQuestionText(q: any): string {
  const parts: string[] = [];
  if (q.direction) parts.push(q.direction);
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  if (q.passageWithMarks) parts.push(q.passageWithMarks);
  if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
  if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
  if (q.questionText) parts.push(q.questionText);
  return parts.join("\n\n") || "";
}

function countWords(t: string) { return t.trim().split(/\s+/).filter((w) => w.length > 0).length; }

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
  const [autoCount, setAutoCount] = useState(5);

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

  // ── Batch generate for selected passages ──
  const handleBatchGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const selectedPassages = passages.filter((p) => selectedIds.has(p.id));

    for (const p of selectedPassages) {
      // Parse analysis for each
      let pAnalysis: any = null;
      if (p.analysis?.analysisData) {
        try { pAnalysis = typeof p.analysis.analysisData === "string" ? JSON.parse(p.analysis.analysisData) : p.analysis.analysisData; } catch {}
      }

      const queueId = `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const config = {
        typeCounts: genMode === "manual" ? { ...typeCounts } : {},
        difficulty,
        prompt: customPrompt.trim(),
        mode: genMode,
      };

      const newItem: QueueItem = {
        id: queueId,
        passageId: p.id,
        passageTitle: p.title,
        passageContent: p.content,
        passageMeta: { school: p.school?.name, grade: p.grade, semester: p.semester, unit: p.unit },
        analysisData: pAnalysis,
        status: "generating",
        progress: genMode === "auto" ? { auto: "pending" } : Object.fromEntries(activeTypes.map((t) => [t, "pending" as const])),
        questions: [],
        config,
      };

      setSessionQueue((prev) => [newItem, ...prev]);

      // Fire generation (don't await — run in background)
      if (genMode === "auto") {
        const ac = new AbortController();
        setTimeout(() => ac.abort(), 100000); // 100s client timeout
        (async () => {
          const id = queueId; // capture for closure
          try {
            const res = await fetch("/api/ai/generate-questions-auto", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passageId: p.id, count: autoCount, difficulty, customPrompt: config.prompt || undefined }),
              signal: ac.signal,
            });
            const data = await res.json();
            if (data.error || !data.questions?.length) {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { auto: "error" } } : item));
              toast.error(`${p.title.slice(0, 20)}... — 생성 실패`);
            } else {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "done", progress: { auto: "done" }, questions: data.questions } : item));
              toast.success(`${p.title.slice(0, 20)}... — ${data.questions.length}문제 생성`);
            }
          } catch (err) {
            console.error(`[BATCH] Failed for ${p.title.slice(0, 30)}:`, err);
            setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { auto: "error" } } : item));
            toast.error(`${p.title.slice(0, 20)}... — 타임아웃 또는 오류`);
          }
        })();
      } else {
        // Manual: parallel per type
        const types = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);
        Promise.all(types.map(async (typeId) => {
          try {
            const res = await fetch("/api/ai/generate-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passageId: p.id, questionType: typeId, count: typeCounts[typeId], difficulty, customPrompt: config.prompt || undefined }),
            });
            const data = await res.json();
            setSessionQueue((prev) => prev.map((item) => item.id === queueId ? { ...item, progress: { ...item.progress, [typeId]: data.error ? "error" : "done" } } : item));
            return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
          } catch {
            setSessionQueue((prev) => prev.map((item) => item.id === queueId ? { ...item, progress: { ...item.progress, [typeId]: "error" } } : item));
            return { typeId, label: typeLabel(typeId), questions: [] };
          }
        })).then((results) => {
          const allQ: any[] = [];
          for (const r of results) for (const q of r.questions) allQ.push({ ...q, _typeId: r.typeId, _typeLabel: r.label });
          setSessionQueue((prev) => prev.map((item) => item.id === queueId ? { ...item, status: allQ.length === 0 ? "error" : "done", questions: allQ } : item));
          if (allQ.length > 0) toast.success(`${p.title.slice(0, 20)}... — ${allQ.length}문제 생성`);
        });
      }
    }

    setSelectedIds(new Set());
    toast.info(`${selectedPassages.length}개 지문 일괄 생성 시작`);
  }, [selectedIds, passages, genMode, typeCounts, activeTypes, difficulty, customPrompt, autoCount]);

  // ── Generate (auto or manual) ──
  const handleGenerate = useCallback(async () => {
    if (!selectedPassage) return;
    if (genMode === "manual" && totalQuestions === 0) return;

    const queueId = `${selectedPassage.id}-${Date.now()}`;
    const config = {
      typeCounts: genMode === "manual" ? { ...typeCounts } : {},
      difficulty,
      prompt: customPrompt.trim(),
      mode: genMode,
    };

    const newItem: QueueItem = {
      id: queueId,
      passageId: selectedPassage.id,
      passageTitle: selectedPassage.title,
      passageContent: selectedPassage.content,
      passageMeta: {
        school: selectedPassage.school?.name,
        grade: selectedPassage.grade,
        semester: selectedPassage.semester,
        unit: selectedPassage.unit,
      },
      analysisData,
      status: "generating",
      progress: genMode === "auto" ? { auto: "pending" } : Object.fromEntries(activeTypes.map((t) => [t, "pending"])),
      questions: [],
      config,
    };

    setSessionQueue((prev) => [newItem, ...prev]);

    if (genMode === "auto") {
      // ── Auto generation: single API call ──
      try {
        const res = await fetch("/api/ai/generate-questions-auto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passageId: selectedPassage.id,
            count: autoCount,
            difficulty,
            customPrompt: config.prompt || undefined,
          }),
        });
        const data = await res.json();

        if (data.error || !data.questions?.length) {
          setSessionQueue((prev) =>
            prev.map((item) => item.id === queueId ? { ...item, status: "error", progress: { auto: "error" } } : item)
          );
          toast.error(data.error || "자동 생성 실패");
        } else {
          setSessionQueue((prev) =>
            prev.map((item) => item.id === queueId ? { ...item, status: "done", progress: { auto: "done" }, questions: data.questions } : item)
          );
          toast.success(`${data.questions.length}개 문제 자동 생성 완료`);
        }
      } catch {
        setSessionQueue((prev) =>
          prev.map((item) => item.id === queueId ? { ...item, status: "error", progress: { auto: "error" } } : item)
        );
        toast.error("자동 생성 실패");
      }
    } else {
      // ── Manual generation: parallel API calls per type ──
      try {
        const promises = activeTypes.map(async (typeId) => {
          try {
            const res = await fetch("/api/ai/generate-question", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                passageId: selectedPassage.id,
                questionType: typeId,
                count: typeCounts[typeId],
                difficulty,
                customPrompt: config.prompt || undefined,
              }),
            });
            const data = await res.json();
            const status = data.error ? "error" : "done";
            setSessionQueue((prev) =>
              prev.map((item) => item.id === queueId ? { ...item, progress: { ...item.progress, [typeId]: status } } : item)
            );
            return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
          } catch {
            setSessionQueue((prev) =>
              prev.map((item) => item.id === queueId ? { ...item, progress: { ...item.progress, [typeId]: "error" } } : item)
            );
            return { typeId, label: typeLabel(typeId), questions: [] };
          }
        });

        const results = await Promise.all(promises);
        const allQuestions: any[] = [];
        for (const r of results) {
          for (const q of r.questions) {
            allQuestions.push({ ...q, _typeId: r.typeId, _typeLabel: r.label });
          }
        }

        setSessionQueue((prev) =>
          prev.map((item) =>
            item.id === queueId
              ? { ...item, status: allQuestions.length === 0 ? "error" : "done", questions: allQuestions }
              : item
          )
        );

        if (allQuestions.length > 0) toast.success(`${allQuestions.length}개 문제 생성 완료`);
        else toast.error("문제 생성에 실패했습니다.");
      } catch {
        setSessionQueue((prev) =>
          prev.map((item) => item.id === queueId ? { ...item, status: "error" } : item)
        );
        toast.error("생성 실패");
      }
    }
  }, [selectedPassage, genMode, totalQuestions, activeTypes, typeCounts, difficulty, customPrompt, autoCount]);

  // ── Save to question bank ──
  const handleSaveQuestions = useCallback(async (questions: any[]) => {
    if (!reviewItem) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");
      const questionsToSave = questions.map((q: any) => ({
        passageId: reviewItem.passageId,
        type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType: q._typeId || q.subType || null,
        questionText: buildQuestionText(q),
        options: q.options ? JSON.stringify(q.options) : null,
        correctAnswer: q.correctAnswer || q.modelAnswer || "",
        points: 1,
        difficulty: q.difficulty || "INTERMEDIATE",
        tags: q.tags ? JSON.stringify(q.tags) : null,
        explanation: q.explanation || null,
        keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
        wrongOptionExplanations: q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
      }));

      const result = await saveGeneratedQuestions(questionsToSave);
      if (result.success) {
        toast.success("문제은행에 저장되었습니다.");
        setSessionQueue((prev) =>
          prev.map((item) => item.id === reviewItem.id ? { ...item, status: "reviewed" } : item)
        );
        setReviewModalId(null);
        // Refresh saved questions list
        loadSavedQuestions();
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  }, [reviewItem]);

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
        <div className="flex flex-col overflow-hidden bg-white border-r border-slate-200/80">
          {/* Selection toolbar */}
          {selectedIds.size > 0 && (
            <div className="px-5 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex items-center gap-3">
              <span className="text-[12px] font-semibold text-blue-700">{selectedIds.size}개 선택</span>
              <div className="w-px h-4 bg-blue-200" />
              <button onClick={selectedIds.size === filteredPassages.length ? deselectAll : selectAll}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">
                {selectedIds.size === filteredPassages.length ? "선택 해제" : "전체 선택"}
              </button>
              <div className="flex-1" />
              <Button
                size="sm"
                className="h-8 text-[12px] bg-teal-600 hover:bg-teal-700 rounded-lg"
                onClick={handleBatchGenerate}
                disabled={genMode === "manual" && totalQuestions === 0}
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                {selectedIds.size}개 지문 일괄 생성
              </Button>
              <button onClick={deselectAll} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">취소</button>
            </div>
          )}

          {/* Search & filter bar */}
          <div className="px-5 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  placeholder="지문 제목 또는 내용으로 검색..."
                  value={passageSearch}
                  onChange={(e) => setPassageSearch(e.target.value)}
                  className="w-full h-9 pl-10 pr-4 text-[13px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 placeholder:text-slate-400 transition-all"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all border ${
                  showFilters || activeFilterCount > 0
                    ? "bg-teal-50 text-teal-700 border-teal-300 shadow-sm shadow-teal-100"
                    : "text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                필터{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
              <div className="flex items-center gap-1 px-2.5 h-9 rounded-lg bg-slate-50 border border-slate-200">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[12px] font-semibold text-slate-600">{filteredPassages.length}</span>
                <span className="text-[11px] text-slate-400">개</span>
              </div>
            </div>

            {showFilters && (
              <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                {filterOptions.schools.length > 0 && (
                  <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
                    className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                      filterSchool ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}>
                    <option value="">학교 전체</option>
                    {filterOptions.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {filterOptions.grades.length > 0 && (
                  <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
                    className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                      filterGrade ? "bg-teal-50 text-teal-700 border-teal-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}>
                    <option value="">학년 전체</option>
                    {filterOptions.grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
                  </select>
                )}
                <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {[{ value: "", label: "전체" }, { value: "FIRST", label: "1학기" }, { value: "SECOND", label: "2학기" }].map((s) => (
                    <button key={s.value} onClick={() => setFilterSemester(s.value)}
                      className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                        filterSemester === s.value ? "bg-white text-teal-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      }`}>{s.label}</button>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => { setFilterSchool(""); setFilterGrade(""); setFilterSemester(""); }}
                    className="text-[11px] text-teal-600 hover:text-teal-700 font-medium ml-auto flex items-center gap-1">
                    <X className="w-3 h-3" />
                    초기화
                  </button>
                )}
              </div>
            )}

            {/* Collection tabs */}
            {collections.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 overflow-x-auto">
                <button
                  onClick={() => setSelectedCollectionId("")}
                  className={`shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border ${
                    !selectedCollectionId
                      ? "bg-teal-50 text-teal-700 border-teal-300"
                      : "text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  전체 지문
                </button>
                {collections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCollectionId(selectedCollectionId === c.id ? "" : c.id)}
                    className={`shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border ${
                      selectedCollectionId === c.id
                        ? "bg-teal-50 text-teal-700 border-teal-300"
                        : "text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <FolderOpen className="w-3 h-3" />
                    {c.name}
                    <span className="text-[10px] text-slate-400">{c._count.items}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Passage card grid -- scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loadingPassages ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                <span className="text-[12px] text-slate-400">지문 불러오는 중...</span>
              </div>
            ) : filteredPassages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <FileText className="w-8 h-8 text-slate-300" />
                <span className="text-[13px] text-slate-400 font-medium">
                  {passages.length === 0 ? "등록된 지문이 없습니다" : "검색 결과가 없습니다"}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredPassages.map((p) => {
                  // Parse analysis
                  let aData: any = null;
                  if (p.analysis?.analysisData) {
                    try { aData = typeof p.analysis.analysisData === "string" ? JSON.parse(p.analysis.analysisData) : p.analysis.analysisData; } catch {}
                  }
                  const vocabCount = aData?.vocabulary?.length || 0;
                  const grammarCount = aData?.grammarPoints?.length || 0;
                  const syntaxCount = aData?.syntaxAnalysis?.length || 0;
                  const keySentenceCount = aData?.structure?.topicSentenceIndex != null ? 1 : 0;
                  const examPointCount = (aData?.examDesign?.paraphrasableSegments?.length || 0) + (aData?.examDesign?.structureTransformPoints?.length || 0);
                  const mainIdea = aData?.structure?.mainIdea;

                  const isChecked = selectedIds.has(p.id);

                  return (
                    <div
                      key={p.id}
                      className={`group relative rounded-xl border p-4 transition-all duration-200 hover:shadow-md flex flex-col ${
                        isChecked
                          ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30"
                          : "border-emerald-200 bg-white"
                      }`}
                    >
                      {/* Header with checkbox */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          {/* Checkbox */}
                          <button
                            onClick={(e) => toggleCheckbox(p.id, e)}
                            className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              isChecked
                                ? "bg-blue-600 text-white border border-blue-600"
                                : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
                            }`}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[13px] font-semibold text-slate-800 truncate">{p.title}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                              <span className="text-[10px] text-slate-400">{countWords(p.content)} words</span>
                            </div>
                          </div>
                        </div>

                        {/* Hover actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpenAnalysisModal(p.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                            title="상세 보기"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                        </div>
                      </div>

                      {/* Content preview */}
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
                        {p.content.slice(0, 200)}...
                      </p>

                      {/* Main idea + Meta + Analysis badges */}
                      <div className="mt-3 space-y-2">
                        {mainIdea && (
                          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{mainIdea}</p>
                        )}
                        {(p.school || p.grade || p.semester) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{p.school.name}</Badge>}
                            {p.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.grade}학년</Badge>}
                            {p.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.semester === "FIRST" ? "1학기" : "2학기"}</Badge>}
                          </div>
                        )}
                        {aData && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {vocabCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                <BookOpen className="w-3 h-3" /> 어휘 {vocabCount}
                              </span>
                            )}
                            {grammarCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                                <Braces className="w-3 h-3" /> 문법 {grammarCount}
                              </span>
                            )}
                            {syntaxCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                                <Braces className="w-3 h-3" /> 구문 {syntaxCount}
                              </span>
                            )}
                            {keySentenceCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                핵심문장 {keySentenceCount}
                              </span>
                            )}
                            {examPointCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                <Target className="w-3 h-3" /> 출제포인트 {examPointCount}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Detail view button — pinned to bottom */}
                      <div className="flex-1" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenAnalysisModal(p.id); }}
                        className="w-full mt-3 h-8 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-[11px] font-medium text-teal-700 hover:text-teal-800 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3 h-3" />
                        상세 보기
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL: Generation settings ═══ */}
        <div className="flex flex-col bg-white overflow-hidden">
          <div className="flex-1 overflow-y-auto">

            {/* Mode Toggle */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex bg-slate-100/80 rounded-xl p-1">
                <button
                  onClick={() => setGenMode("auto")}
                  className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                    genMode === "auto"
                      ? "bg-white text-teal-700 shadow-sm border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  자동 생성
                </button>
                <button
                  onClick={() => setGenMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-[13px] font-semibold transition-all duration-200 ${
                    genMode === "manual"
                      ? "bg-white text-teal-700 shadow-sm border border-slate-200/60"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Settings2 className="w-4 h-4" />
                  유형 지정
                </button>
              </div>
            </div>

            {/* Auto Mode Config */}
            {genMode === "auto" && (
              <div className="px-5 py-3 space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-teal-50/80 to-teal-50/30 border border-teal-200/50 p-4 space-y-4">
                  <div className="flex items-start gap-2.5">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-100/80 shrink-0 mt-0.5">
                      <Zap className="w-4 h-4 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-teal-800">AI 자동 출제</p>
                      <p className="text-[11px] text-teal-600/80 mt-1 leading-relaxed">
                        지문 분석 데이터를 기반으로 최적의 유형과 난이도를 자동 선택합니다.
                      </p>
                    </div>
                  </div>

                  {/* Question count */}
                  <div>
                    <span className="text-[11px] font-semibold text-teal-700 block mb-2">문제 수</span>
                    <div className="flex items-center gap-1.5">
                      {[3, 5, 8, 10].map((n) => (
                        <button
                          key={n}
                          onClick={() => setAutoCount(n)}
                          className={`h-9 w-11 rounded-lg text-[13px] font-bold transition-all duration-150 border ${
                            autoCount === n
                              ? "bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-200"
                              : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-600"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden ml-1">
                        <button onClick={() => setAutoCount(Math.max(1, autoCount - 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-9 h-9 flex items-center justify-center text-[13px] font-bold text-slate-700 border-x border-slate-200 bg-slate-50/50">{autoCount}</span>
                        <button onClick={() => setAutoCount(Math.min(20, autoCount + 1))} className="w-8 h-9 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
                  <div className="flex gap-2">
                    {([{ value: "BASIC", label: "기본", desc: "기초 수준" }, { value: "INTERMEDIATE", label: "중급", desc: "내신 대비" }, { value: "KILLER", label: "킬러", desc: "상위권" }] as const).map((d) => (
                      <button key={d.value} onClick={() => setDifficulty(d.value)}
                        className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                          difficulty === d.value
                            ? "bg-teal-50 text-teal-700 border-teal-300 shadow-sm shadow-teal-50"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                        }`}>{d.label}</button>
                    ))}
                  </div>
                </div>

                {/* Custom prompt */}
                <PromptSection
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
                />
              </div>
            )}

            {/* Manual Mode Config */}
            {genMode === "manual" && (
              <div className="px-5 py-3 space-y-4">
                {/* Type selection groups */}
                <div className="space-y-3">
                  {EXAM_TYPE_GROUPS.map((group) => (
                    <div key={group.group}>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">{group.group}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((item) => {
                          const count = typeCounts[item.id] || 0;
                          const active = count > 0;
                          return (
                            <div key={item.id}
                              className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                                active
                                  ? "bg-teal-50 border-teal-300 shadow-sm shadow-teal-50"
                                  : "bg-white border-slate-200 hover:border-slate-300"
                              }`}>
                              <button type="button" onClick={() => setTypeCount(item.id, count + 1)}
                                className={`h-full px-2.5 text-[11px] font-semibold transition-colors ${
                                  active ? "text-teal-700" : "text-slate-500 hover:text-teal-600"
                                }`}>
                                {item.label}
                              </button>
                              {active && (
                                <div className="flex items-center gap-0 pr-0.5 border-l border-teal-200/80">
                                  <button onClick={() => setTypeCount(item.id, count - 1)} className="w-6 h-6 flex items-center justify-center text-teal-400 hover:text-teal-600 transition-colors">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-4 text-center text-[12px] font-bold text-teal-700 tabular-nums">{count}</span>
                                  <button onClick={() => setTypeCount(item.id, count + 1)} className="w-6 h-6 flex items-center justify-center text-teal-400 hover:text-teal-600 transition-colors">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {totalQuestions > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200/60">
                      <div className="flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-[12px] font-semibold text-teal-800">총 <strong className="text-teal-700">{totalQuestions}</strong>문제</span>
                      </div>
                      <button onClick={() => setTypeCounts({})} className="text-[11px] text-teal-500 hover:text-teal-700 font-medium transition-colors">초기화</button>
                    </div>
                  )}
                </div>

                {/* Difficulty */}
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">난이도</span>
                  <div className="flex gap-2">
                    {([{ value: "BASIC", label: "기본" }, { value: "INTERMEDIATE", label: "중급" }, { value: "KILLER", label: "킬러" }] as const).map((d) => (
                      <button key={d.value} onClick={() => setDifficulty(d.value)}
                        className={`flex-1 h-9 rounded-lg text-[12px] font-semibold transition-all duration-150 border ${
                          difficulty === d.value
                            ? "bg-teal-50 text-teal-700 border-teal-300 shadow-sm shadow-teal-50"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-600"
                        }`}>{d.label}</button>
                    ))}
                  </div>
                </div>

                {/* Custom prompt */}
                <PromptSection
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
                />
              </div>
            )}
          </div>

          {/* Generate Button */}
          <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
            <Button
              className={`w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                canGenerate
                  ? "bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-200/50 hover:shadow-lg hover:shadow-teal-200/60"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
              onClick={handleBatchGenerate}
              disabled={!canGenerate}
            >
              {selectedIds.size === 0 ? (
                <span className="flex items-center gap-2">
                  <FileText className="w-4.5 h-4.5" />
                  지문을 선택하세요
                </span>
              ) : genMode === "auto" ? (
                <span className="flex items-center gap-2">
                  <Zap className="w-4.5 h-4.5" />
                  {selectedIds.size === 1 ? `${autoCount}문제 자동 생성` : `${selectedIds.size}개 지문 × ${autoCount}문제 생성`}
                </span>
              ) : totalQuestions > 0 ? (
                <span className="flex items-center gap-2">
                  <Cpu className="w-4.5 h-4.5" />
                  {selectedIds.size === 1 ? `${totalQuestions}문제 생성` : `${selectedIds.size}개 지문 × ${totalQuestions}문제 생성`}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Target className="w-4.5 h-4.5" />
                  유형을 선택하세요
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ Divider ═══ */}
      <div className="h-3 bg-[#E8EAEE] shrink-0 border-y border-slate-200/60" />

      {/* ═══ BOTTOM SECTION: 생성 중 + DB 저장된 문제 ═══ */}
      <div className="bg-[#F0F2F5]">
        <div className="px-8 pt-5 pb-8 space-y-5">

          {/* ── 현재 세션 생성 중/완료 문제 ── */}
          {sessionQueue.length > 0 && (
            <div>
              <div className="flex items-center gap-4 mb-3">
                <h3 className="text-[14px] font-bold text-slate-800">현재 세션</h3>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white border border-slate-200">
                  {(["all", "unreviewed", "reviewed", "error"] as const).map((f) => {
                    const labels = { all: "전체", unreviewed: "미검토", reviewed: "저장됨", error: "오류" };
                    const counts = { all: sessionQueue.length, unreviewed: queueCounts.done, reviewed: queueCounts.reviewed, error: queueCounts.error };
                    if (f !== "all" && counts[f] === 0) return null;
                    return (
                      <button key={f} onClick={() => setQueueFilter(f)}
                        className={`text-[11px] px-3 py-1.5 rounded-md font-semibold transition-all ${
                          queueFilter === f ? "bg-teal-50 text-teal-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        }`}>{labels[f]} {counts[f]}</button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredQueue.map((item) => {
                  // Generating: show loading card
                  if (item.status === "generating") {
                    const progressDone = Object.values(item.progress).filter(v => v === "done").length;
                    const progressTotal = Math.max(1, Object.keys(item.progress).length);
                    return (
                      <div key={item.id} className="relative rounded-xl border border-teal-300 bg-white p-4 overflow-hidden">
                        <div className="absolute -inset-px rounded-xl border-2 border-teal-400/40 animate-pulse pointer-events-none" />
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-teal-100">
                          <div className="h-full bg-gradient-to-r from-teal-400 to-teal-500 rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(8, (progressDone / progressTotal) * 100)}%` }} />
                        </div>
                        <div className="flex items-center gap-3">
                          <Loader2 className="w-5 h-5 animate-spin text-teal-500 shrink-0" />
                          <div>
                            <h4 className="text-[13px] font-bold text-slate-800 truncate">{item.passageTitle}</h4>
                            <span className="text-[11px] text-teal-500 font-medium">
                              {item.config.mode === "auto" ? `${autoCount}문제 생성 중...` : `${Object.values(item.config.typeCounts).reduce((a, b) => a + b, 0)}문제 생성 중...`}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Error: show error card
                  if (item.status === "error") {
                    return (
                      <div key={item.id} className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                          <div>
                            <h4 className="text-[13px] font-bold text-slate-800 truncate">{item.passageTitle}</h4>
                            <span className="text-[11px] text-red-500 font-medium">생성 실패</span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Done/reviewed: show each question as QuestionCard
                  return item.questions.map((q: any, qi: number) => {
                    // Convert session question to QuestionCardItem format
                    const cardItem: QuestionCardItem = {
                      id: `${item.id}-${qi}`,
                      type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
                      subType: q._typeId || q.subType || null,
                      questionText: [q.direction, q.passageWithBlank, q.passageWithMarks, q.questionText].filter(Boolean).join("\n\n"),
                      options: q.options ? JSON.stringify(q.options) : null,
                      correctAnswer: q.correctAnswer || q.modelAnswer || "",
                      difficulty: q.difficulty || "INTERMEDIATE",
                      tags: q.tags ? JSON.stringify(q.tags) : null,
                      aiGenerated: true,
                      approved: item.status === "reviewed",
                      createdAt: new Date(),
                      passage: { id: item.passageId, title: item.passageTitle, content: item.passageContent },
                      explanation: q.explanation ? {
                        id: `${item.id}-${qi}-exp`,
                        content: q.explanation,
                        keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
                        wrongOptionExplanations: q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
                      } : null,
                    };
                    return (
                      <div key={`${item.id}-${qi}`} onClick={() => setDetailQuestion(cardItem)} className="cursor-pointer">
                        <QuestionCard q={cardItem} num={qi + 1} readonly compact />
                      </div>
                    );
                  });
                })}
              </div>
            </div>
          )}

          {/* ── DB에 저장된 AI 생성 문제 ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-slate-800">
                저장된 문제 {savedQuestions.length > 0 && <span className="text-slate-400 font-normal ml-1">{savedQuestions.length}개</span>}
              </h3>
              {savedQuestions.length > 0 && (
                <Link href="/director/questions" className="text-[12px] text-teal-600 hover:text-teal-700 font-medium">
                  문제은행 전체 보기 →
                </Link>
              )}
            </div>
            {loadingSavedQuestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            ) : savedQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 opacity-60">
                <Braces className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-[13px] text-slate-400">아직 저장된 문제가 없습니다</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {savedQuestions.slice(0, 30).map((q, i) => (
                  <div key={q.id} onClick={() => setDetailQuestion(q)} className="cursor-pointer">
                    <QuestionCard q={q} num={i + 1} readonly compact />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

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

// ─── Prompt Section (shared between auto/manual) ─────────

function PromptSection({
  customPrompt, setCustomPrompt,
  savedPrompts, showSavedPrompts, setShowSavedPrompts,
  showSaveInput, setShowSaveInput,
  savePromptName, setSavePromptName,
  savingPrompt, setSavingPrompt,
  editingPromptId, setEditingPromptId,
  editingName, setEditingName,
  loadSavedPrompts,
}: {
  customPrompt: string; setCustomPrompt: (v: string) => void;
  savedPrompts: { id: string; name: string; content: string }[];
  showSavedPrompts: boolean; setShowSavedPrompts: (v: boolean) => void;
  showSaveInput: boolean; setShowSaveInput: (v: boolean) => void;
  savePromptName: string; setSavePromptName: (v: string) => void;
  savingPrompt: boolean; setSavingPrompt: (v: boolean) => void;
  editingPromptId: string | null; setEditingPromptId: (v: string | null) => void;
  editingName: string; setEditingName: (v: string) => void;
  loadSavedPrompts: () => Promise<void>;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">추가 지시사항</span>
        <div className="flex items-center gap-1.5">
          {customPrompt.trim() && !showSaveInput && (
            <button onClick={() => setShowSaveInput(true)}
              className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 px-2 py-1 rounded-md hover:bg-teal-50 transition-colors">
              <Save className="w-3 h-3" /> 저장
            </button>
          )}
          <button onClick={() => setShowSavedPrompts(!showSavedPrompts)}
            className={`text-[11px] font-semibold flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
              showSavedPrompts ? "text-teal-700 bg-teal-50 border border-teal-200" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            }`}>
            <Bookmark className="w-3 h-3" /> {savedPrompts.length}
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showSavedPrompts ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {showSaveInput && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-teal-50/80 border border-teal-200/60">
          <input placeholder="지시사항 이름" value={savePromptName} onChange={(e) => setSavePromptName(e.target.value)}
            className="flex-1 h-8 px-2.5 text-[12px] rounded-lg border border-teal-200 bg-white outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/10" autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && savePromptName.trim()) {
                setSavingPrompt(true);
                createCustomPrompt({ name: savePromptName.trim(), content: customPrompt }).then(() => {
                  toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
                });
              }
              if (e.key === "Escape") setShowSaveInput(false);
            }}
          />
          <button onClick={() => {
            if (!savePromptName.trim()) return; setSavingPrompt(true);
            createCustomPrompt({ name: savePromptName.trim(), content: customPrompt }).then(() => {
              toast.success("저장됨"); setSavePromptName(""); setShowSaveInput(false); setSavingPrompt(false); loadSavedPrompts();
            });
          }} disabled={!savePromptName.trim() || savingPrompt} className="h-8 px-3 text-[11px] font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors">
            {savingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "저장"}
          </button>
          <button onClick={() => setShowSaveInput(false)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showSavedPrompts && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          {savedPrompts.length === 0 ? (
            <div className="px-4 py-5 text-center text-[12px] text-slate-400 font-medium">저장된 지시사항이 없습니다</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto">
              {savedPrompts.map((sp) => (
                <div key={sp.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 group transition-colors">
                  {editingPromptId === sp.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 h-7 px-2 text-[12px] rounded-md border border-slate-200 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/10" autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { updateCustomPrompt(sp.id, { name: editingName }).then(() => { setEditingPromptId(null); loadSavedPrompts(); }); }
                          if (e.key === "Escape") setEditingPromptId(null);
                        }}
                      />
                      <button onClick={() => { updateCustomPrompt(sp.id, { name: editingName }).then(() => { setEditingPromptId(null); loadSavedPrompts(); }); }}
                        className="w-6 h-6 flex items-center justify-center text-emerald-500 hover:bg-emerald-50 rounded transition-colors"><Check className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setCustomPrompt(sp.content); setShowSavedPrompts(false); toast.success(`"${sp.name}" 불러옴`); }}
                        className="flex-1 text-left min-w-0">
                        <span className="text-[12px] font-medium text-slate-700 block truncate">{sp.name || "이름 없음"}</span>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => { setEditingPromptId(sp.id); setEditingName(sp.name); }}
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded transition-colors"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => { if (confirm(`"${sp.name}" 삭제?`)) deleteCustomPrompt(sp.id).then(() => { toast.success("삭제됨"); loadSavedPrompts(); }); }}
                          className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea placeholder="예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..." value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
        className="w-full min-h-[72px] px-3.5 py-2.5 text-[12px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/60 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 placeholder:text-slate-400 resize-none transition-all"
      />
    </div>
  );
}
