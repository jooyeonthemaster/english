"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  FileText,
  Save,
  Loader2,
  Trash2,
  RefreshCw,
  Layers,
  ChevronDown,
  ExternalLink,
  Target,
  BookOpen,
  Lightbulb,
  LayoutList,
  Languages,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import {
  deleteWorkbenchPassage,
  updatePassageAnalysis,
} from "@/actions/workbench";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  AnalysisPromptPanel,
  type AnalysisPromptConfig,
} from "./analysis-prompt-panel";
import { InteractivePassageView } from "./interactive-passage-view";
import { AnalysisLoadingOverlay } from "./analysis-loading-overlay";
import { StructuredQuestionRenderer } from "./question-renderers";
import Link from "next/link";

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
}

// ─── Exam Type Groups (from detail client) ───────────────
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

const Q_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
};

const Q_SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론", GRAMMAR_ERROR: "어법 판단", VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_INSERT: "문장 삽입", SENTENCE_ORDER: "글의 순서", TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론", REFERENCE: "지칭 추론", CONTENT_MATCH: "내용 일치",
  IRRELEVANT: "무관한 문장", CONDITIONAL_WRITING: "조건부 영작", SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸", SUMMARY_COMPLETE: "요약문 완성", WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정", CONTEXT_MEANING: "문맥 속 의미", SYNONYM: "동의어", ANTONYM: "반의어",
};

const Q_DIFF: Record<string, { label: string; cls: string }> = {
  BASIC: { label: "기본", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", cls: "bg-red-50 text-red-700 border-red-200" },
};

function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object") return Array.isArray(fallback) && !Array.isArray(str) ? fallback : (str as T);
  if (typeof str !== "string") return fallback;
  try { const parsed = JSON.parse(str); return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed; }
  catch { return fallback; }
}

// ─── Modal Component ─────────────────────────────────────
export function PassageAnalysisModal({
  open,
  onClose,
  passage,
  initialAnalysis,
  initialPromptConfig,
  onAnalysisUpdate,
  onQuestionsUpdate,
  onDelete,
}: PassageAnalysisModalProps) {
  const router = useRouter();
  const [analysisData, setAnalysisData] = useState<PassageAnalysisData | null>(initialAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<"analysis" | "questions" | "generate">("analysis");
  const [lastPromptConfig, setLastPromptConfig] = useState<AnalysisPromptConfig>(
    initialPromptConfig || { customPrompt: "", focusAreas: [], targetLevel: "" }
  );

  // Question generation state
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});

  const tags: string[] = passage.tags ? safeParseJSON(passage.tags, []) : [];

  // Sync when passage changes
  useEffect(() => {
    setAnalysisData(initialAnalysis);
    setHasUnsavedChanges(false);
  }, [initialAnalysis, passage.id]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (hasUnsavedChanges) {
          if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hasUnsavedChanges, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  // ─── Analysis ────────────────────────────────────────
  const runAnalysisWithConfig = async (config: AnalysisPromptConfig) => {
    setAnalyzing(true);
    setLastPromptConfig(config);
    try {
      const hasConfig = config.customPrompt || config.focusAreas.length > 0 || config.targetLevel;
      let res: Response;
      if (hasConfig) {
        res = await fetch(`/api/ai/passage-analysis/${passage.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customPrompt: config.customPrompt,
            focusAreas: config.focusAreas,
            targetLevel: config.targetLevel,
          }),
        });
      } else {
        res = await fetch(`/api/ai/passage-analysis/${passage.id}`);
      }
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        setAnalysisData(json.data);
        setHasUnsavedChanges(false);
        onAnalysisUpdate?.(json.data);
        toast.success(json.cached ? "캐시된 분석을 불러왔습니다." : "AI 분석이 완료되었습니다.");
      }
    } catch {
      toast.error("분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Save edited analysis ────────────────────────────
  const handleSave = async () => {
    if (!analysisData) return;
    setSaving(true);
    try {
      const result = await updatePassageAnalysis(passage.id, JSON.stringify(analysisData));
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
    if (!confirm("이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다.")) return;
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

  // ─── Question generation ─────────────────────────────
  const setTypeCount = (id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  };

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const activeTypes = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);

  const typeLabel = (id: string) => {
    for (const g of EXAM_TYPE_GROUPS) {
      const found = g.items.find((i) => i.id === id);
      if (found) return found.label;
    }
    return id;
  };

  function buildQuestionText(q: any): string {
    const parts: string[] = [];
    if (q.direction) parts.push(q.direction);
    if (q.passageWithBlank) parts.push(q.passageWithBlank);
    if (q.passageWithMarks) parts.push(q.passageWithMarks);
    if (q.passageWithNumbers) parts.push(q.passageWithNumbers);
    if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
    if (q.givenSentence) parts.push(`[주어진 문장] ${q.givenSentence}`);
    if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
    if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
    if (q.summaryWithBlanks) parts.push(q.summaryWithBlanks);
    if (q.sentenceWithError) parts.push(q.sentenceWithError);
    if (q.scrambledWords) parts.push(`[배열] ${q.scrambledWords.join(" / ")}`);
    if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
    if (q.questionText) parts.push(q.questionText);
    return parts.join("\n\n") || "문제 텍스트 없음";
  }

  const handleGenerate = async () => {
    if (totalQuestions === 0) {
      toast.error("최소 1개 이상의 문제 유형과 개수를 선택해주세요.");
      return;
    }
    setGenerating(true);
    setGeneratedQuestions(null);

    const progress: Record<string, "pending" | "done" | "error"> = {};
    activeTypes.forEach((t) => { progress[t] = "pending"; });
    setGenerationProgress({ ...progress });

    try {
      const promises = activeTypes.map(async (typeId) => {
        try {
          const res = await fetch("/api/ai/generate-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              passageId: passage.id,
              questionType: typeId,
              count: typeCounts[typeId],
              difficulty: "INTERMEDIATE",
              customPrompt: generationPrompt.trim() || undefined,
            }),
          });
          const data = await res.json();
          setGenerationProgress((prev) => ({ ...prev, [typeId]: data.error ? "error" : "done" }));
          if (data.error) return { typeId, label: typeLabel(typeId), questions: [], error: data.error };
          return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
        } catch {
          setGenerationProgress((prev) => ({ ...prev, [typeId]: "error" }));
          return { typeId, label: typeLabel(typeId), questions: [], error: "요청 실패" };
        }
      });

      const results = await Promise.all(promises);
      const allQuestions: any[] = [];
      for (const r of results) {
        for (const q of r.questions) {
          allQuestions.push({ ...q, _typeId: r.typeId, _typeLabel: r.label });
        }
      }

      setGeneratedQuestions(allQuestions);
      const successCount = allQuestions.length;
      const errorTypes = results.filter((r) => r.error).map((r) => r.label);
      if (successCount > 0) toast.success(`${successCount}개 문제가 생성되었습니다.`);
      if (errorTypes.length > 0) toast.error(`일부 유형 생성 실패: ${errorTypes.join(", ")}`);
    } catch {
      toast.error("문제 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveQuestions = async () => {
    if (!generatedQuestions || generatedQuestions.length === 0) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");
      const questionsToSave = generatedQuestions.map((q: any) => ({
        type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType: q._typeId || q.subType || undefined,
        questionText: buildQuestionText(q),
        options: q.options || undefined,
        correctAnswer: q.correctAnswer || q.modelAnswer || "",
        points: 1,
        difficulty: q.difficulty || "INTERMEDIATE",
        tags: q.tags || undefined,
        explanation: q.explanation || undefined,
        keyPoints: q.keyPoints || undefined,
        wrongOptionExplanations: q.wrongOptionExplanations || undefined,
        passageId: passage.id,
        aiGenerated: true,
      }));
      const result = await saveGeneratedQuestions(questionsToSave);
      if (result.success) {
        toast.success("문제 은행에 저장되었습니다.");
        // Update parent's questions list
        onQuestionsUpdate?.([...passage.questions, ...questionsToSave.map((q: any, i: number) => ({
          id: `temp-${Date.now()}-${i}`,
          type: q.type,
          subType: q.subType,
          difficulty: q.difficulty,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          tags: q.tags,
          aiGenerated: true,
          approved: false,
          createdAt: new Date(),
          explanation: null,
        }))]);
        setGeneratedQuestions(null);
        setTypeCounts({});
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (hasUnsavedChanges) {
            if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
          } else {
            onClose();
          }
        }}
      />

      {/* Modal container — full width with padding */}
      <div className="relative z-10 w-full max-w-[1440px] mx-4 my-4 bg-[#F8FAFB] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Analysis overlay inside modal */}
        {analyzing && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-2xl">
            <AnalysisLoadingOverlay />
          </div>
        )}

        {/* ─── Modal Header ─── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <FileText className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-slate-800 truncate">
                {passage.title}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
                  <Badge key={t} variant="outline" className="text-[10px] h-5 text-slate-500">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasUnsavedChanges && (
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                저장
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/director/workbench/passages/${passage.id}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                상세 페이지로 이동
              </TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-xs"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              삭제
            </Button>
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) onClose();
                } else {
                  onClose();
                }
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ─── Tab navigation ─── */}
        <div className="flex items-center gap-1 px-6 pt-3 pb-0 bg-white border-b border-slate-100 shrink-0">
          {[
            { id: "analysis" as const, label: "지문 분석", icon: BookOpen },
            { id: "generate" as const, label: "문제 생성", icon: Layers },
            { id: "questions" as const, label: `연결된 문제 (${passage.questions.length})`, icon: LayoutList },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "text-blue-600 border-blue-600 bg-blue-50/50"
                  : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Content area ─── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <TooltipProvider>
            {/* Analysis Tab */}
            {activeTab === "analysis" && (
              <div className="space-y-5">
                {analysisData ? (
                  <>
                    <InteractivePassageView
                      content={passage.content}
                      analysisData={analysisData}
                    />
                    <AnalysisPromptPanel
                      onRunAnalysis={runAnalysisWithConfig}
                      analyzing={analyzing}
                      hasExistingAnalysis={true}
                      initialConfig={lastPromptConfig}
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                      <Lightbulb className="w-7 h-7 text-blue-400" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-slate-700 mb-1">
                      아직 분석되지 않았습니다
                    </h3>
                    <p className="text-[13px] text-slate-400 mb-5 max-w-sm">
                      AI 분석을 실행하면 어휘, 문법, 구문, 출제 포인트 등을 자동으로 분석합니다.
                    </p>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() =>
                        runAnalysisWithConfig(lastPromptConfig)
                      }
                      disabled={analyzing}
                    >
                      {analyzing ? (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1.5" />
                      )}
                      AI 분석 실행
                      <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded">5 크레딧</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Generate Questions Tab */}
            {activeTab === "generate" && (
              <div className="max-w-3xl space-y-5">
                {!analysisData ? (
                  <div className="text-center py-12">
                    <p className="text-[13px] text-slate-400">먼저 AI 분석을 실행해주세요.</p>
                  </div>
                ) : (
                  <>
                    {/* Type groups with per-type counters */}
                    <div className="space-y-4">
                      {EXAM_TYPE_GROUPS.map((group) => (
                        <div key={group.group}>
                          <span className="text-[11px] font-semibold text-slate-400 tracking-wider">
                            {group.group}
                          </span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {group.items.map((item) => {
                              const count = typeCounts[item.id] || 0;
                              const active = count > 0;
                              return (
                                <div
                                  key={item.id}
                                  className={`inline-flex items-center h-8 rounded-lg border transition-all duration-150 ${
                                    active
                                      ? "bg-blue-50 border-blue-300"
                                      : "bg-white border-slate-200 hover:border-slate-300"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setTypeCount(item.id, count + 1)}
                                    className={`h-full px-2.5 text-[12px] font-medium transition-colors ${
                                      active ? "text-blue-700" : "text-slate-500 hover:text-blue-600"
                                    }`}
                                  >
                                    {item.label}
                                  </button>
                                  {active && (
                                    <div className="flex items-center gap-0.5 pr-1 border-l border-blue-200">
                                      <button
                                        type="button"
                                        onClick={() => setTypeCount(item.id, count - 1)}
                                        className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold"
                                      >
                                        -
                                      </button>
                                      <span className="w-4 text-center text-[12px] font-bold text-blue-700">
                                        {count}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setTypeCount(item.id, count + 1)}
                                        className="w-6 h-6 flex items-center justify-center text-blue-400 hover:text-blue-600 text-[14px] font-bold"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total counter */}
                    {totalQuestions > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                        <span className="text-[13px] font-medium text-blue-800">
                          총 <strong>{totalQuestions}</strong>문제
                          <span className="text-blue-500 ml-2 text-[11px]">
                            ({activeTypes.length}개 유형)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setTypeCounts({})}
                          className="text-[11px] text-blue-500 hover:text-blue-700 font-medium"
                        >
                          초기화
                        </button>
                      </div>
                    )}

                    {/* Prompt */}
                    <textarea
                      placeholder="추가 지시사항 (선택) — 예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..."
                      value={generationPrompt}
                      onChange={(e) => setGenerationPrompt(e.target.value)}
                      className="w-full min-h-[56px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
                      spellCheck={false}
                    />

                    {/* Generate button */}
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 h-10"
                      onClick={handleGenerate}
                      disabled={generating || totalQuestions === 0}
                    >
                      {generating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          문제 생성 중... ({totalQuestions}문제)
                        </>
                      ) : (
                        <>
                          <Layers className="w-4 h-4 mr-1.5" />
                          {totalQuestions > 0 ? `${totalQuestions}문제 생성하기` : "유형과 개수를 선택하세요"}
                          {totalQuestions > 0 && (
                            <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded">
                              {activeTypes.length * 2} 크레딧
                            </span>
                          )}
                        </>
                      )}
                    </Button>

                    {/* Generation progress */}
                    {generating && activeTypes.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <Separator />
                        <span className="text-xs font-medium text-slate-500">생성 진행 상황</span>
                        <div className="flex flex-wrap gap-2">
                          {activeTypes.map((typeId) => {
                            const label = typeLabel(typeId);
                            const status = generationProgress[typeId];
                            return (
                              <span
                                key={typeId}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                                  status === "done"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : status === "error"
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
                                }`}
                              >
                                {label} x{typeCounts[typeId]}
                                {status === "pending" && (
                                  <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Generated questions result */}
                    {generatedQuestions && generatedQuestions.length > 0 && (
                      <div className="space-y-4 pt-2">
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">
                            생성된 문제 ({generatedQuestions.length}개)
                          </span>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs"
                            onClick={handleSaveQuestions}
                          >
                            <Save className="w-3.5 h-3.5 mr-1" />
                            문제 은행에 저장
                          </Button>
                        </div>
                        {(() => {
                          const groups: Record<string, any[]> = {};
                          generatedQuestions.forEach((q: any) => {
                            const label = q._typeLabel || "기타";
                            if (!groups[label]) groups[label] = [];
                            groups[label].push(q);
                          });
                          let globalIdx = 0;
                          return Object.entries(groups).map(([label, qs]) => (
                            <div key={label} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-bold text-slate-700">{label}</span>
                                <span className="text-[10px] text-slate-400">{qs.length}문제</span>
                              </div>
                              {qs.map((q: any) => {
                                const idx = globalIdx++;
                                return <StructuredQuestionRenderer key={idx} question={q} index={idx} />;
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Connected Questions Tab */}
            {activeTab === "questions" && (
              <div>
                {passage.questions.length === 0 ? (
                  <div className="text-center py-12">
                    <LayoutList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-[13px] text-slate-400">아직 연결된 문제가 없습니다.</p>
                    <p className="text-[12px] text-slate-400 mt-1">
                      &quot;문제 생성&quot; 탭에서 문제를 생성해보세요.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {passage.questions.map((q, idx) => (
                      <ModalQuestionCard key={q.id} q={q} num={idx + 1} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

// ─── Question Card (self-contained for modal) ────────────
function ModalQuestionCard({
  q,
  num,
}: {
  q: PassageAnalysisModalProps["passage"]["questions"][0];
  num: number;
}) {
  const [showExplanation, setShowExplanation] = useState(false);
  const options = safeParseJSON<{ label: string; text: string }[]>(q.options, []);
  const tags = safeParseJSON<string[]>(q.tags, []);
  const keyPoints = safeParseJSON<string[]>(q.explanation?.keyPoints, []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-slate-400 mr-1">{num}.</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
            {Q_TYPE_LABELS[q.type] || q.type}
          </span>
          {q.subType && (
            <span className="text-[10px] text-slate-500">
              {Q_SUBTYPE_LABELS[q.subType] || q.subType}
            </span>
          )}
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              Q_DIFF[q.difficulty]?.cls || "bg-slate-100 text-slate-500"
            }`}
          >
            {Q_DIFF[q.difficulty]?.label || q.difficulty}
          </span>
          {q.approved && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
              승인
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
          {q.questionText}
        </p>
      </div>

      {options.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {options.map((opt, i) => {
            const isCorrect =
              q.correctAnswer === opt.label ||
              q.correctAnswer === opt.text ||
              q.correctAnswer === String(i + 1);
            return (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] ${
                  isCorrect ? "bg-emerald-50 text-emerald-800 font-medium" : "text-slate-600"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    isCorrect ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                {opt.text || opt.label}
              </div>
            );
          })}
        </div>
      )}

      {options.length === 0 && q.correctAnswer && (
        <div className="px-4 pb-3">
          <div className="px-3 py-2 rounded-lg bg-emerald-50 text-[13px] text-emerald-800 font-medium">
            정답: {q.correctAnswer}
          </div>
        </div>
      )}

      {q.explanation && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[12px] text-blue-600 font-medium hover:bg-slate-50 transition-colors"
          >
            해설 보기
            <ChevronDown className={`w-3 h-3 transition-transform ${showExplanation ? "rotate-180" : ""}`} />
          </button>
          {showExplanation && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                {q.explanation.content}
              </p>
              {keyPoints.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500">핵심 포인트</span>
                  {keyPoints.map((kp, i) => (
                    <p key={i} className="text-[11px] text-slate-500 pl-2 border-l-2 border-blue-200">
                      {kp}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
