// @ts-nocheck
"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  type PassageItem,
  type QueueItem,
  typeLabel,
  buildQuestionText,
} from "./generate-page-types";

// ─── Types ───────────────────────────────────────────

interface UseGenerationHandlersParams {
  passages: PassageItem[];
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  genMode: "auto" | "manual";
  typeCounts: Record<string, number>;
  activeTypes: string[];
  difficulty: string;
  customPrompt: string;
  autoCount: number;
  selectedPassage: PassageItem | null;
  analysisData: any;
  totalQuestions: number;
  setSessionQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  reviewItem: QueueItem | null;
  setReviewModalId: (v: string | null) => void;
  loadSavedQuestions: () => void;
}

// ─── Hook ────────────────────────────────────────────

export function useGenerationHandlers({
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
}: UseGenerationHandlersParams) {

  // ── Auto-save generated questions to DB ──
  const autoSave = useCallback(async (passageId: string, questions: any[]) => {
    if (!questions.length) return;
    try {
      const { saveGeneratedQuestions } = await import("@/actions/workbench");
      const questionsToSave = questions.map((q: any) => ({
        passageId,
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
      await saveGeneratedQuestions(questionsToSave);
      loadSavedQuestions();
    } catch (err) {
      console.error("[AUTO-SAVE] Failed:", err);
    }
  }, [loadSavedQuestions]);

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

      const config = {
        typeCounts: genMode === "manual" ? { ...typeCounts } : {},
        difficulty,
        prompt: customPrompt.trim(),
        mode: genMode,
      };

      // Fire generation (don't await -- run in background)
      if (genMode === "auto") {
        const queueId = `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newItem: QueueItem = {
          id: queueId,
          passageId: p.id,
          passageTitle: p.title,
          passageContent: p.content,
          passageMeta: { school: p.school?.name, grade: p.grade, semester: p.semester, unit: p.unit },
          analysisData: pAnalysis,
          status: "generating",
          progress: { auto: "pending" },
          questions: [],
          config,
        };
        setSessionQueue((prev) => [newItem, ...prev]);
        (async () => {
          const id = queueId;
          try {
            const res = await fetch("/api/ai/generate-questions-auto", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passageId: p.id, count: autoCount, difficulty, customPrompt: config.prompt || undefined }),
            });
            const data = await res.json();
            if (data.error || !data.questions?.length) {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { auto: "error" } } : item));
              toast.error(`${p.title.slice(0, 20)}... — 생성 실패`);
            } else {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "done", progress: { auto: "done" }, questions: data.questions } : item));
              toast.success(`${p.title.slice(0, 20)}... — ${data.questions.length}문제 생성`);
              autoSave(p.id, data.questions);
            }
          } catch (err) {
            console.error(`[BATCH] Failed for ${p.title.slice(0, 30)}:`, err);
            setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { auto: "error" } } : item));
            toast.error(`${p.title.slice(0, 20)}... — 네트워크 오류`);
          }
        })();
      } else {
        // Manual: separate queue item per type, each fires independently
        const types = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);
        for (const typeId of types) {
          const typeQueueId = `${p.id}-${typeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const typeItem: QueueItem = {
            id: typeQueueId,
            passageId: p.id,
            passageTitle: p.title,
            passageContent: p.content,
            passageMeta: { school: p.school?.name, grade: p.grade, semester: p.semester, unit: p.unit },
            analysisData: pAnalysis,
            status: "generating",
            progress: { [typeId]: "pending" },
            questions: [],
            config: { ...config, typeCounts: { [typeId]: typeCounts[typeId] } },
          };
          setSessionQueue((prev) => [typeItem, ...prev]);

          (async () => {
            const id = typeQueueId;
            try {
              const res = await fetch("/api/ai/generate-question", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ passageId: p.id, questionType: typeId, count: typeCounts[typeId], difficulty, customPrompt: config.prompt || undefined }),
              });
              const data = await res.json();
              if (data.error || !data.questions?.length) {
                setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { [typeId]: "error" } } : item));
                toast.error(`${typeLabel(typeId)} 생성 실패`);
              } else {
                const questions = data.questions.map((q: any) => ({ ...q, _typeId: typeId, _typeLabel: typeLabel(typeId) }));
                setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "done", progress: { [typeId]: "done" }, questions } : item));
                toast.success(`${typeLabel(typeId)} ${questions.length}문제 생성`);
                autoSave(p.id, questions);
              }
            } catch {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { [typeId]: "error" } } : item));
              toast.error(`${typeLabel(typeId)} 네트워크 오류`);
            }
          })();
        }
      }
    }

    setSelectedIds(new Set());
    toast.info(`${selectedPassages.length}개 지문 일괄 생성 시작`);
  }, [selectedIds, passages, genMode, typeCounts, activeTypes, difficulty, customPrompt, autoCount]);

  // ── Generate (auto or manual) ──
  const handleGenerate = useCallback(async () => {
    if (!selectedPassage) return;
    if (genMode === "manual" && totalQuestions === 0) return;

    const config = {
      typeCounts: genMode === "manual" ? { ...typeCounts } : {},
      difficulty,
      prompt: customPrompt.trim(),
      mode: genMode,
    };

    if (genMode === "auto") {
      const queueId = `${selectedPassage.id}-${Date.now()}`;
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
        progress: { auto: "pending" },
        questions: [],
        config,
      };
      setSessionQueue((prev) => [newItem, ...prev]);
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
          autoSave(selectedPassage.id, data.questions);
        }
      } catch {
        setSessionQueue((prev) =>
          prev.map((item) => item.id === queueId ? { ...item, status: "error", progress: { auto: "error" } } : item)
        );
        toast.error("자동 생성 실패");
      }
    } else {
      // ── Manual generation: separate queue item per type ──
      for (const typeId of activeTypes) {
        const typeQueueId = `${selectedPassage.id}-${typeId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const typeItem: QueueItem = {
          id: typeQueueId,
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
          progress: { [typeId]: "pending" },
          questions: [],
          config: { ...config, typeCounts: { [typeId]: typeCounts[typeId] } },
        };
        setSessionQueue((prev) => [typeItem, ...prev]);

        // Fire independently (no await)
        (async () => {
          const id = typeQueueId;
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
            if (data.error || !data.questions?.length) {
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { [typeId]: "error" } } : item));
              toast.error(`${typeLabel(typeId)} 생성 실패`);
            } else {
              const questions = data.questions.map((q: any) => ({ ...q, _typeId: typeId, _typeLabel: typeLabel(typeId) }));
              setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "done", progress: { [typeId]: "done" }, questions } : item));
              toast.success(`${typeLabel(typeId)} ${questions.length}문제 생성`);
              autoSave(selectedPassage.id, questions);
            }
          } catch {
            setSessionQueue((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", progress: { [typeId]: "error" } } : item));
            toast.error(`${typeLabel(typeId)} 네트워크 오류`);
          }
        })();
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

  return { handleBatchGenerate, handleGenerate, handleSaveQuestions };
}
