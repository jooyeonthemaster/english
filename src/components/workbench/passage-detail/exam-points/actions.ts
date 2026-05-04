import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { EXAM_TYPE_GROUPS } from "../constants";

// Build questionText from structured fields for DB storage
export function buildQuestionText(q: any): string {
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

export interface GenerateQuestionsArgs {
  passageId: string;
  activeTypes: string[];
  typeCounts: Record<string, number>;
  generationPrompt: string;
  totalQuestions: number;
  setGenerating: Dispatch<SetStateAction<boolean>>;
  setGeneratedQuestions: Dispatch<SetStateAction<any[] | null>>;
  setGenerationProgress: Dispatch<SetStateAction<Record<string, "pending" | "done" | "error">>>;
}

export async function generateQuestions(args: GenerateQuestionsArgs) {
  const {
    passageId,
    activeTypes,
    typeCounts,
    generationPrompt,
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
}

export interface SaveGeneratedQuestionsArgs {
  passageId: string;
  generatedQuestions: any[] | null;
  router: { push: (path: string) => void };
}

export async function saveGeneratedQuestionsToBank(args: SaveGeneratedQuestionsArgs) {
  const { passageId, generatedQuestions, router } = args;
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
}
