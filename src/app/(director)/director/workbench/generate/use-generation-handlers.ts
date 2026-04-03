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

      // Fire generation (don't await -- run in background)
      if (genMode === "auto") {
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
          autoSave(selectedPassage.id, data.questions);
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

        if (allQuestions.length > 0) {
          toast.success(`${allQuestions.length}개 문제 생성 완료`);
          autoSave(selectedPassage.id, allQuestions);
        } else {
          toast.error("문제 생성에 실패했습니다.");
        }
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

  return { handleBatchGenerate, handleGenerate, handleSaveQuestions };
}
