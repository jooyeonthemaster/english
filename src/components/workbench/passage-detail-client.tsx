"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Sparkles,
  FileText,
  BookOpen,
  Languages,
  Lightbulb,
  LayoutList,
  Target,
  Loader2,
  RefreshCw,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { deleteWorkbenchPassage, updatePassageAnalysis } from "@/actions/workbench";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  AnalysisPromptPanel,
  type AnalysisPromptConfig,
} from "./analysis-prompt-panel";
import { EditableSentences } from "./editable-sentences";
import { EditableVocabulary } from "./editable-vocabulary";
import { EditableGrammar } from "./editable-grammar";
import { EditableStructure } from "./editable-structure";
import { StructuredQuestionRenderer } from "./question-renderers";

interface PassageDetailProps {
  autoAnalyze?: boolean;
  initialPrompt?: string;
  initialFocus?: string[];
  initialLevel?: string;
  passage: {
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
      aiGenerated: boolean;
      approved: boolean;
    }>;
  };
}

const VOCAB_DIFFICULTY: Record<string, { label: string; color: string }> = {
  basic: { label: "기본", color: "bg-emerald-100 text-emerald-700" },
  intermediate: { label: "심화", color: "bg-blue-100 text-blue-700" },
  advanced: { label: "고난도", color: "bg-red-100 text-red-700" },
};

export function PassageDetailClient({ passage, autoAnalyze, initialPrompt, initialFocus, initialLevel }: PassageDetailProps) {
  const router = useRouter();
  const [analysisData, setAnalysisData] = useState<PassageAnalysisData | null>(
    passage.analysis ? JSON.parse(passage.analysis.analysisData) : null
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastPromptConfig, setLastPromptConfig] =
    useState<AnalysisPromptConfig>({
      customPrompt: initialPrompt || "",
      focusAreas: initialFocus || [],
      targetLevel: initialLevel || "",
    });
  const autoAnalyzeTriggered = useRef(false);

  const tags: string[] = passage.tags ? JSON.parse(passage.tags) : [];

  // --- Analysis with prompt config ---
  const runAnalysisWithConfig = useCallback(
    async (config: AnalysisPromptConfig) => {
      setAnalyzing(true);
      setLastPromptConfig(config);
      try {
        const hasConfig =
          config.customPrompt ||
          config.focusAreas.length > 0 ||
          config.targetLevel;

        let res: Response;
        if (hasConfig) {
          // POST with custom parameters — always fresh
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
          // GET — uses cache
          res = await fetch(`/api/ai/passage-analysis/${passage.id}`);
        }

        const json = await res.json();
        if (json.error) {
          toast.error(json.error);
        } else {
          setAnalysisData(json.data);
          setHasUnsavedChanges(false);
          toast.success(
            json.cached
              ? "캐시된 분석을 불러왔습니다."
              : "AI 분석이 완료되었습니다."
          );
        }
      } catch {
        toast.error("분석 중 오류가 발생했습니다.");
      } finally {
        setAnalyzing(false);
      }
    },
    [passage.id]
  );

  // --- Quick re-analysis (no prompt panel) ---
  const runQuickAnalysis = useCallback(async () => {
    await runAnalysisWithConfig(lastPromptConfig);
  }, [runAnalysisWithConfig, lastPromptConfig]);

  // Auto-analyze on mount if coming from create page with autoAnalyze=true
  useEffect(() => {
    if (autoAnalyze && !autoAnalyzeTriggered.current && !analysisData) {
      autoAnalyzeTriggered.current = true;
      runAnalysisWithConfig(lastPromptConfig);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save edited analysis ---
  async function handleSave() {
    if (!analysisData) return;
    setSaving(true);
    try {
      const result = await updatePassageAnalysis(
        passage.id,
        JSON.stringify(analysisData)
      );
      if (result.success) {
        setHasUnsavedChanges(false);
        toast.success("분석 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // --- Update helpers that track dirty state ---
  function updateSentences(sentences: PassageAnalysisData["sentences"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, sentences });
    setHasUnsavedChanges(true);
  }

  function updateVocabulary(vocabulary: PassageAnalysisData["vocabulary"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, vocabulary });
    setHasUnsavedChanges(true);
  }

  function updateGrammarPoints(
    grammarPoints: PassageAnalysisData["grammarPoints"]
  ) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, grammarPoints });
    setHasUnsavedChanges(true);
  }

  function updateStructure(structure: PassageAnalysisData["structure"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, structure });
    setHasUnsavedChanges(true);
  }

  // --- Delete passage ---
  async function handleDelete() {
    if (!confirm("이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다."))
      return;
    setDeleting(true);
    const result = await deleteWorkbenchPassage(passage.id);
    if (result.success) {
      toast.success("지문이 삭제되었습니다.");
      router.push("/director/workbench/passages");
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/director/workbench/passages">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                {passage.title}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {passage.school && (
                  <Badge variant="outline" className="text-xs">
                    {passage.school.name}
                  </Badge>
                )}
                {passage.grade && (
                  <Badge variant="secondary" className="text-xs">
                    {passage.grade}학년
                  </Badge>
                )}
                {passage.semester && (
                  <Badge variant="secondary" className="text-xs">
                    {passage.semester === "FIRST" ? "1학기" : "2학기"}
                  </Badge>
                )}
                {passage.unit && (
                  <Badge variant="secondary" className="text-xs">
                    {passage.unit}
                  </Badge>
                )}
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="outline"
                    className="text-xs text-slate-500"
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Button
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                분석 저장
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              삭제
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
              onClick={() => {
                // Scroll to exam points section and click the tab
                const pointsTab = document.querySelector('[data-state][id*="trigger-points"]') as HTMLButtonElement;
                if (pointsTab) {
                  pointsTab.click();
                  pointsTab.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }}
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              문제 생성
            </Button>
          </div>
        </div>

        {/* Top: Passage text + AI prompt panel side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
          {/* Left: Passage text */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  지문 원문
                </CardTitle>
                <span className="text-xs text-slate-400">
                  {passage.content.trim().split(/\s+/).length} words
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm leading-[1.8] text-slate-700 whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                {analysisData
                  ? analysisData.sentences.map((sentence, idx) => {
                      const vocabsInSentence =
                        analysisData.vocabulary.filter(
                          (v) => v.sentenceIndex === idx
                        );
                      const grammarsInSentence =
                        analysisData.grammarPoints.filter(
                          (g) => g.sentenceIndex === idx
                        );

                      return (
                        <span key={idx} className="inline">
                          {renderHighlightedSentence(
                            sentence.english,
                            vocabsInSentence,
                            grammarsInSentence
                          )}{" "}
                        </span>
                      );
                    })
                  : passage.content}
              </div>
            </CardContent>
          </Card>

          {/* Right: AI prompt panel */}
          <div className="space-y-4">
            <AnalysisPromptPanel
              onRunAnalysis={runAnalysisWithConfig}
              analyzing={analyzing}
              hasExistingAnalysis={!!analysisData}
              initialConfig={lastPromptConfig}
            />

            {/* Question count */}
            {passage.questions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    연결된 문제 ({passage.questions.length}개)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {passage.questions.slice(0, 5).map((q) => (
                    <Link
                      key={q.id}
                      href={`/director/questions/${q.id}`}
                      className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 text-sm"
                    >
                      <Badge variant="outline" className="text-[10px]">
                        {q.type === "MULTIPLE_CHOICE" ? "객관식" : q.type}
                      </Badge>
                      <span className="text-slate-600 truncate flex-1">
                        {q.questionText.slice(0, 50)}...
                      </span>
                      {q.aiGenerated && (
                        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                      )}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Bottom: Analysis results (full width) */}
        <div className="space-y-4">

            {!analysisData ? (
              <Card className="flex items-center justify-center">
                <CardContent className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-4">
                    <Sparkles className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    AI 분석 실행
                  </h3>
                  <p className="text-sm text-slate-500 mb-2 max-w-xs mx-auto">
                    위의 설정 패널에서 분석 옵션을 선택한 후 실행하세요.
                  </p>
                  <p className="text-xs text-slate-400">
                    또는 기본 설정으로 바로 분석을 시작할 수 있습니다.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI 분석 결과
                      {hasUnsavedChanges && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-600 border-amber-200"
                        >
                          수정됨
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {hasUnsavedChanges && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSave}
                          disabled={saving}
                          className="text-xs text-blue-600"
                        >
                          {saving ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          저장
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={runQuickAnalysis}
                        disabled={analyzing}
                        className="text-xs"
                      >
                        {analyzing ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3 mr-1" />
                        )}
                        재분석
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="sentences">
                    <TabsList className="grid grid-cols-5 w-full">
                      <TabsTrigger value="sentences" className="text-xs">
                        <Languages className="w-3 h-3 mr-1" />
                        문장
                      </TabsTrigger>
                      <TabsTrigger value="vocab" className="text-xs">
                        <BookOpen className="w-3 h-3 mr-1" />
                        어휘
                      </TabsTrigger>
                      <TabsTrigger value="grammar" className="text-xs">
                        <Lightbulb className="w-3 h-3 mr-1" />
                        문법
                      </TabsTrigger>
                      <TabsTrigger value="structure" className="text-xs">
                        <LayoutList className="w-3 h-3 mr-1" />
                        구조
                      </TabsTrigger>
                      <TabsTrigger value="points" className="text-xs">
                        <Target className="w-3 h-3 mr-1" />
                        출제
                      </TabsTrigger>
                    </TabsList>

                    {/* Sentences tab — editable */}
                    <TabsContent value="sentences" className="mt-4 space-y-1">
                      <EditableSentences
                        sentences={analysisData.sentences}
                        onUpdate={updateSentences}
                        passageId={passage.id}
                      />
                    </TabsContent>

                    {/* Vocabulary tab — editable */}
                    <TabsContent value="vocab" className="mt-4">
                      <EditableVocabulary
                        vocabulary={analysisData.vocabulary}
                        onUpdate={updateVocabulary}
                      />
                    </TabsContent>

                    {/* Grammar tab — editable */}
                    <TabsContent value="grammar" className="mt-4">
                      <EditableGrammar
                        grammarPoints={analysisData.grammarPoints}
                        onUpdate={updateGrammarPoints}
                        passageId={passage.id}
                      />
                    </TabsContent>

                    {/* Structure tab — editable */}
                    <TabsContent value="structure" className="mt-4 space-y-4">
                      <EditableStructure
                        structure={analysisData.structure}
                        onUpdate={updateStructure}
                      />
                    </TabsContent>

                    {/* Exam points tab — editable + question generation prompt */}
                    <TabsContent value="points" className="mt-4">
                      <ExamPointsEditor
                        keyPoints={analysisData.structure.keyPoints}
                        onUpdate={(newPoints) => {
                          updateStructure({
                            ...analysisData.structure,
                            keyPoints: newPoints,
                          });
                        }}
                        passageId={passage.id}
                      />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Exam Points Editor — editable key points + generation prompt
// ---------------------------------------------------------------------------

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

function ExamPointsEditor({
  keyPoints,
  onUpdate,
  passageId,
}: {
  keyPoints: string[];
  onUpdate: (points: string[]) => void;
  passageId: string;
}) {
  const router = useRouter();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newPoint, setNewPoint] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(keyPoints[idx]);
  };

  const confirmEdit = () => {
    if (editingIdx === null) return;
    const updated = [...keyPoints];
    updated[editingIdx] = editValue.trim();
    onUpdate(updated.filter(Boolean));
    setEditingIdx(null);
    setEditValue("");
  };

  const removePoint = (idx: number) => {
    onUpdate(keyPoints.filter((_, i) => i !== idx));
  };

  const addPoint = () => {
    if (!newPoint.trim()) return;
    onUpdate([...keyPoints, newPoint.trim()]);
    setNewPoint("");
  };

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

  // Parallel per-type API calls
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});

  const handleGenerate = async () => {
    if (totalQuestions === 0) {
      toast.error("최소 1개 이상의 문제 유형과 개수를 선택해주세요.");
      return;
    }
    setGenerating(true);
    setGeneratedQuestions(null);

    // Initialize progress
    const progress: Record<string, "pending" | "done" | "error"> = {};
    activeTypes.forEach((t) => { progress[t] = "pending"; });
    setGenerationProgress({ ...progress });

    // Find label for type
    const typeLabel = (id: string) => {
      for (const g of EXAM_TYPE_GROUPS) {
        const found = g.items.find((i) => i.id === id);
        if (found) return found.label;
      }
      return id;
    };

    try {
      // Fire all type-specific requests in parallel
      const promises = activeTypes.map(async (typeId) => {
        try {
          const res = await fetch("/api/ai/generate-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              passageId,
              questionType: typeId,
              count: typeCounts[typeId],
              difficulty: "INTERMEDIATE",
              customPrompt: generationPrompt.trim() || undefined,
            }),
          });
          const data = await res.json();
          setGenerationProgress((prev) => ({ ...prev, [typeId]: data.error ? "error" : "done" }));
          if (data.error) {
            return { typeId, label: typeLabel(typeId), questions: [], error: data.error };
          }
          return { typeId, label: typeLabel(typeId), questions: data.questions || [] };
        } catch {
          setGenerationProgress((prev) => ({ ...prev, [typeId]: "error" }));
          return { typeId, label: typeLabel(typeId), questions: [], error: "요청 실패" };
        }
      });

      const results = await Promise.all(promises);

      // Flatten into grouped structure
      const allQuestions: any[] = [];
      for (const r of results) {
        for (const q of r.questions) {
          allQuestions.push({ ...q, _typeId: r.typeId, _typeLabel: r.label });
        }
      }

      setGeneratedQuestions(allQuestions);
      const successCount = allQuestions.length;
      const errorTypes = results.filter((r) => r.error).map((r) => r.label);

      if (successCount > 0) {
        toast.success(`${successCount}개 문제가 생성되었습니다.`);
      }
      if (errorTypes.length > 0) {
        toast.error(`일부 유형 생성 실패: ${errorTypes.join(", ")}`);
      }
    } catch {
      toast.error("문제 생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  // Build questionText from structured fields for DB storage
  function buildQuestionText(q: any): string {
    // Structured question — combine direction + relevant content
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

  // Save generated questions to question bank
  const handleSaveQuestions = async () => {
    if (!generatedQuestions || generatedQuestions.length === 0) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");
      const questionsToSave = generatedQuestions.map((q: any) => ({
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
      const result = await saveGeneratedQuestions(questionsToSave.map((q: any) => ({ ...q, passageId })));
      if (result.success) {
        toast.success("문제 은행에 저장되었습니다.");
        router.push("/director/questions");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Editable key points */}
      <div className="space-y-2">
        {keyPoints.map((point, idx) => (
          <div
            key={idx}
            className="group flex items-start gap-3 p-3 rounded-lg bg-amber-50/80 border border-amber-100/80 hover:border-amber-200 transition-colors"
          >
            <Target className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            {editingIdx === idx ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={confirmEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEdit();
                  if (e.key === "Escape") setEditingIdx(null);
                }}
                className="flex-1 text-sm text-slate-700 bg-white px-2 py-0.5 rounded border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            ) : (
              <p
                className="flex-1 text-sm text-slate-700 cursor-pointer hover:text-slate-900"
                onClick={() => startEdit(idx)}
                title="클릭하여 편집"
              >
                {point}
              </p>
            )}
            <button
              onClick={() => removePoint(idx)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0"
              title="삭제"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* Add new point */}
        <div className="flex items-center gap-2">
          <input
            placeholder="출제 포인트 추가..."
            value={newPoint}
            onChange={(e) => setNewPoint(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addPoint(); }
            }}
            className="flex-1 h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300"
          />
          <button
            onClick={addPoint}
            disabled={!newPoint.trim()}
            className="h-9 px-3 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-40 transition-colors"
          >
            추가
          </button>
        </div>
      </div>

      <Separator />

      {/* Question type selection + generation prompt */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-900">문제 생성</span>
          {totalQuestions > 0 && (
            <span className="text-[11px] text-blue-600 font-medium">총 {totalQuestions}문제</span>
          )}
        </div>

        {/* Type groups with per-type counters */}
        <div className="space-y-4">
          {EXAM_TYPE_GROUPS.map((group) => (
            <div key={group.group}>
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider">{group.group}</span>
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
                          <span className="w-4 text-center text-[12px] font-bold text-blue-700">{count}</span>
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
          className="w-full min-h-[56px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
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
              <Sparkles className="w-4 h-4 mr-1.5" />
              {totalQuestions > 0 ? `${totalQuestions}문제 생성하기` : "유형과 개수를 선택하세요"}
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
                const label = EXAM_TYPE_GROUPS.flatMap((g) => g.items).find((i) => i.id === typeId)?.label || typeId;
                const status = generationProgress[typeId];
                return (
                  <span key={typeId} className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                    status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    status === "error" ? "bg-red-50 text-red-600 border-red-200" :
                    "bg-blue-50 text-blue-600 border-blue-200 animate-pulse"
                  }`}>
                    {status === "done" ? "v " : status === "error" ? "x " : ""}
                    {label} x{typeCounts[typeId]}
                    {status === "pending" && <Loader2 className="w-3 h-3 ml-1 inline animate-spin" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Generated questions result — grouped by type */}
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

            {/* Group by _typeLabel */}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline highlight renderer (unchanged from original)
// ---------------------------------------------------------------------------
function renderHighlightedSentence(
  text: string,
  vocabs: Array<{ word: string; meaning: string }>,
  grammars: Array<{ textFragment: string; pattern: string }>
) {
  interface Segment {
    start: number;
    end: number;
    type: "vocab" | "grammar";
    label: string;
  }

  const segments: Segment[] = [];

  for (const g of grammars) {
    const idx = text.toLowerCase().indexOf(g.textFragment.toLowerCase());
    if (idx !== -1) {
      segments.push({
        start: idx,
        end: idx + g.textFragment.length,
        type: "grammar",
        label: g.pattern,
      });
    }
  }

  for (const v of vocabs) {
    const regex = new RegExp(`\\b${escapeRegex(v.word)}\\b`, "i");
    const match = regex.exec(text);
    if (match) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = segments.some(
        (s) => start < s.end && end > s.start
      );
      if (!overlaps) {
        segments.push({ start, end, type: "vocab", label: v.meaning });
      }
    }
  }

  segments.sort((a, b) => a.start - b.start);

  if (segments.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const seg of segments) {
    if (seg.start > cursor) {
      parts.push(text.slice(cursor, seg.start));
    }
    if (seg.start < cursor) continue;

    const highlighted = text.slice(seg.start, seg.end);
    if (seg.type === "grammar") {
      parts.push(
        <span
          key={`g-${seg.start}`}
          className="underline decoration-blue-400 decoration-2 underline-offset-4 cursor-help"
          title={seg.label}
        >
          {highlighted}
        </span>
      );
    } else {
      parts.push(
        <span
          key={`v-${seg.start}`}
          className="underline decoration-amber-400 decoration-dashed decoration-2 underline-offset-4 cursor-help"
          title={seg.label}
        >
          {highlighted}
        </span>
      );
    }
    cursor = seg.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
