"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { PassageAnalysisData } from "@/types/passage-analysis";

// ─── Types ───────────────────────────────────────────────
export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
}

export type QueuedPassageStatus = "pending" | "analyzing" | "done" | "error";

export interface QueuedPassage {
  id: string;
  title: string;
  contentPreview: string;
  wordCount: number;
  status: QueuedPassageStatus;
  analysisData: PassageAnalysisData | null;
  error: string | null;
  promptConfig: AnalysisPromptConfig;
  createdAt: Date;
  schoolName?: string;
  grade?: number;
  semester?: string;
  unit?: string;
  publisher?: string;
  tags?: string[];
  // Full passage data for modal
  passageData: {
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
  };
}

const MAX_CONCURRENT_ANALYSIS = 3;

// ─── Hook ────────────────────────────────────────────────
export function usePassageQueue(initialItems?: QueuedPassage[]) {
  const [queue, setQueue] = useState<QueuedPassage[]>(initialItems || []);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const analysisInProgress = useRef<Set<string>>(new Set());

  // Count active analysis
  const activeCount = queue.filter((p) => p.status === "analyzing").length;

  // Process pending items when slots open
  const processPending = useCallback(() => {
    setQueue((prev) => {
      const active = prev.filter((p) => p.status === "analyzing").length;
      if (active >= MAX_CONCURRENT_ANALYSIS) return prev;

      const slotsAvailable = MAX_CONCURRENT_ANALYSIS - active;
      const pending = prev.filter(
        (p) => p.status === "pending" && !analysisInProgress.current.has(p.id)
      );

      if (pending.length === 0) return prev;

      const toStart = pending.slice(0, slotsAvailable);
      const toStartIds = new Set(toStart.map((p) => p.id));

      // Mark as analyzing
      const updated = prev.map((p) =>
        toStartIds.has(p.id) ? { ...p, status: "analyzing" as const } : p
      );

      // Fire off analysis for each
      toStart.forEach((p) => {
        analysisInProgress.current.add(p.id);
        runAnalysis(p.id, p.promptConfig);
      });

      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run analysis for a single passage (fire-and-forget)
  const runAnalysis = useCallback(
    async (passageId: string, config: AnalysisPromptConfig) => {
      const controller = new AbortController();
      abortControllers.current.set(passageId, controller);

      try {
        const hasConfig =
          config.customPrompt || config.focusAreas.length > 0 || config.targetLevel;

        const url = `/api/ai/passage-analysis/${passageId}`;
        let res: Response;

        if (hasConfig) {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customPrompt: config.customPrompt,
              focusAreas: config.focusAreas,
              targetLevel: config.targetLevel,
            }),
            signal: controller.signal,
          });
        } else {
          res = await fetch(url, { signal: controller.signal });
        }

        const json = await res.json();

        if (json.error) {
          setQueue((prev) =>
            prev.map((p) =>
              p.id === passageId
                ? { ...p, status: "error" as const, error: json.error }
                : p
            )
          );
        } else {
          setQueue((prev) =>
            prev.map((p) =>
              p.id === passageId
                ? {
                    ...p,
                    status: "done" as const,
                    analysisData: json.data,
                    passageData: {
                      ...p.passageData,
                      analysis: {
                        id: passageId,
                        analysisData: JSON.stringify(json.data),
                        contentHash: "",
                        updatedAt: new Date(),
                      },
                    },
                  }
                : p
            )
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setQueue((prev) =>
          prev.map((p) =>
            p.id === passageId
              ? {
                  ...p,
                  status: "error" as const,
                  error: err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.",
                }
              : p
          )
        );
      } finally {
        abortControllers.current.delete(passageId);
        analysisInProgress.current.delete(passageId);
      }
    },
    []
  );

  // Process pending whenever queue changes
  useEffect(() => {
    const timer = setTimeout(processPending, 100);
    return () => clearTimeout(timer);
  }, [queue, processPending]);

  // Add passage to queue
  const addToQueue = useCallback(
    (
      passage: {
        id: string;
        title: string;
        content: string;
        schoolId?: string;
        schoolName?: string;
        grade?: number;
        semester?: string;
        unit?: string;
        publisher?: string;
        tags?: string[];
        source?: string;
        difficulty?: string;
      },
      promptConfig: AnalysisPromptConfig,
      runAnalysisNow: boolean = true
    ) => {
      const words = passage.content
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;

      const newItem: QueuedPassage = {
        id: passage.id,
        title: passage.title,
        contentPreview:
          passage.content.length > 120
            ? passage.content.slice(0, 120) + "..."
            : passage.content,
        wordCount: words,
        status: runAnalysisNow ? "pending" : "done",
        analysisData: null,
        error: null,
        promptConfig,
        createdAt: new Date(),
        schoolName: passage.schoolName,
        grade: passage.grade,
        semester: passage.semester,
        unit: passage.unit,
        publisher: passage.publisher,
        tags: passage.tags,
        passageData: {
          id: passage.id,
          title: passage.title,
          content: passage.content,
          grade: passage.grade ?? null,
          semester: passage.semester ?? null,
          unit: passage.unit ?? null,
          publisher: passage.publisher ?? null,
          difficulty: passage.difficulty ?? null,
          tags: passage.tags ? JSON.stringify(passage.tags) : null,
          source: passage.source ?? null,
          createdAt: new Date(),
          school: passage.schoolName
            ? { id: passage.schoolId || "", name: passage.schoolName, type: "" }
            : null,
          analysis: null,
          notes: [],
          questions: [],
        },
      };

      setQueue((prev) => [newItem, ...prev]);
    },
    []
  );

  // Retry failed analysis
  const retryAnalysis = useCallback(
    (passageId: string) => {
      setQueue((prev) =>
        prev.map((p) =>
          p.id === passageId
            ? { ...p, status: "pending" as const, error: null }
            : p
        )
      );
    },
    []
  );

  // Remove from queue
  const removeFromQueue = useCallback((passageId: string) => {
    const controller = abortControllers.current.get(passageId);
    if (controller) {
      controller.abort();
      abortControllers.current.delete(passageId);
    }
    analysisInProgress.current.delete(passageId);
    setQueue((prev) => prev.filter((p) => p.id !== passageId));
  }, []);

  // Update analysis data after modal edit
  const updateAnalysisData = useCallback(
    (passageId: string, data: PassageAnalysisData) => {
      setQueue((prev) =>
        prev.map((p) =>
          p.id === passageId
            ? {
                ...p,
                analysisData: data,
                passageData: {
                  ...p.passageData,
                  analysis: {
                    id: p.passageData.analysis?.id || passageId,
                    analysisData: JSON.stringify(data),
                    contentHash: p.passageData.analysis?.contentHash || "",
                    updatedAt: new Date(),
                  },
                },
              }
            : p
        )
      );
    },
    []
  );

  // Update questions list after generation
  const updateQuestions = useCallback(
    (passageId: string, questions: QueuedPassage["passageData"]["questions"]) => {
      setQueue((prev) =>
        prev.map((p) =>
          p.id === passageId
            ? {
                ...p,
                passageData: { ...p.passageData, questions },
              }
            : p
        )
      );
    },
    []
  );

  // Check if any analysis is active (for beforeunload)
  const hasActiveAnalysis = queue.some(
    (p) => p.status === "analyzing" || p.status === "pending"
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllers.current.forEach((c) => c.abort());
      abortControllers.current.clear();
    };
  }, []);

  return {
    queue,
    activeCount,
    hasActiveAnalysis,
    addToQueue,
    retryAnalysis,
    removeFromQueue,
    updateAnalysisData,
    updateQuestions,
  };
}
