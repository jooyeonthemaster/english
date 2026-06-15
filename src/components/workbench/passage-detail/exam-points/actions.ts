import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { EXAM_TYPE_GROUPS } from "../constants";
import {
  buildGrammarCorrectionQuestionTextForDisplay,
  grammarCorrectionErrorSentenceForQuestionText,
} from "@/lib/grammar-correction-display";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

// Build questionText from structured fields for DB storage
export function buildQuestionText(q: any): string {
  // Structured question — combine direction + relevant content
  const parts: string[] = [];
  const isGrammarCorrection = q?._typeId === "GRAMMAR_CORRECTION" || q?.subType === "GRAMMAR_CORRECTION";
  if (isGrammarCorrection) {
    const text = buildGrammarCorrectionQuestionTextForDisplay(q);
    if (text) return text;
  }
  if (q.direction) parts.push(q.direction);
  if (q.passageWithBlank) parts.push(q.passageWithBlank);
  if (q.passageWithMarkers && !isGrammarCorrection) parts.push(q.passageWithMarkers);
  if (q.passageWithNumbers) parts.push(q.passageWithNumbers);
  if (q.passageWithUnderline) parts.push(q.passageWithUnderline);
  if (q.givenSentence) parts.push(`[주어진 문장] ${q.givenSentence}`);
  if (q.originalSentence) parts.push(`[원문] ${q.originalSentence}`);
  if (q.sentenceWithBlank) parts.push(q.sentenceWithBlank);
  if (q.summaryWithBlanks) parts.push(q.summaryWithBlanks);
  if (q.sentenceWithError && !isGrammarCorrection) parts.push(grammarCorrectionErrorSentenceForQuestionText(q));
  if (q.scrambledWords) parts.push(`[배열] ${q.scrambledWords.join(" / ")}`);
  if (q.conditions) parts.push(`[조건] ${q.conditions.join(" / ")}`);
  if (q.questionText) parts.push(q.questionText);
  return parts.join("\n\n") || "문제 텍스트 없음";
}

export interface GenerateQuestionsArgs {
  passageId: string;
  activeTypes: string[];
  typeCounts: Record<string, number>;
  generationPrompt: string;
  generationPlan: QuestionGenerationPlan;
  totalQuestions: number;
  setGenerating: Dispatch<SetStateAction<boolean>>;
  setGeneratedQuestions: Dispatch<SetStateAction<any[] | null>>;
  setGenerationProgress: Dispatch<SetStateAction<Record<string, "pending" | "done" | "error">>>;
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated tag parsing.
  }
  return rawTags
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function generateQuestions(args: GenerateQuestionsArgs) {
  const {
    passageId,
    activeTypes,
    typeCounts,
    generationPrompt,
    generationPlan,
    totalQuestions,
    setGenerating,
    setGeneratedQuestions,
    setGenerationProgress,
  } = args;

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
            generationPlan,
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
        const plan = normalizeQuestionGenerationPlan(q._generationPlan ?? generationPlan);
        const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
        allQuestions.push({
          ...q,
          _typeId: r.typeId,
          _typeLabel: r.label,
          _generationPlan: plan,
          tags,
        });
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
}

export interface SaveGeneratedQuestionsArgs {
  passageId: string;
  generatedQuestions: any[] | null;
  generationPlan: QuestionGenerationPlan;
  router: { push: (path: string) => void };
}

export async function saveGeneratedQuestionsToBank(args: SaveGeneratedQuestionsArgs) {
  const { passageId, generatedQuestions, generationPlan, router } = args;
  if (!generatedQuestions || generatedQuestions.length === 0) return;
  try {
    const { saveGeneratedQuestions } = await import("@/actions/workbench");
    const questionsToSave = generatedQuestions.map((q: any) => {
      const plan = normalizeQuestionGenerationPlan(q._generationPlan ?? generationPlan);
      const tags = mergeQuestionGenerationPlanTag(readQuestionTags(q.tags), plan);
      return {
        type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
        subType: q._typeId || q.subType || null,
        questionText: buildQuestionText(q),
        structuredData: q._typeId ? { ...q, _generationPlan: plan, tags } : undefined,
        options: Array.isArray(q.options) ? q.options : undefined,
        correctAnswer: q.correctAnswer || q.modelAnswer || "",
        points: 1,
        difficulty: q.difficulty || "INTERMEDIATE",
        tags,
        aiGenerated: true,
        explanation: q.explanation || null,
        keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : undefined,
        wrongOptionExplanations: q.wrongOptionExplanations || undefined,
      };
    });
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
}
