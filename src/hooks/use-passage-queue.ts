"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { PassageAnalysisData } from "@/types/passage-analysis";

export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
  generationPlan?: QuestionGenerationPlan;
}

export type QueuedPassageStatus =
  | "not_analyzed"
  | "pending"
  | "analyzing"
  | "done"
  | "error";

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

interface AiJobRow {
  id: string;
  status: string;
  title: string;
  errorMessage: string | null;
  config: unknown;
  createdAt: string;
  passage: QueuedPassage["passageData"] | null;
}

function wordCount(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function parseAnalysis(raw: string | null | undefined): PassageAnalysisData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PassageAnalysisData;
  } catch {
    return null;
  }
}

function promptConfigFromJobConfig(config: unknown): AnalysisPromptConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { customPrompt: "", focusAreas: [], targetLevel: "" };
  }
  const raw = config as Record<string, unknown>;
  return {
    customPrompt: typeof raw.customPrompt === "string" ? raw.customPrompt : "",
    focusAreas: Array.isArray(raw.focusAreas)
      ? raw.focusAreas.filter((v): v is string => typeof v === "string")
      : [],
    targetLevel: typeof raw.targetLevel === "string" ? raw.targetLevel : "",
    generationPlan: normalizeQuestionGenerationPlan(raw.generationPlan),
  };
}

function statusFromJob(job: AiJobRow): QueuedPassageStatus {
  if (job.status === "PENDING") return "pending";
  if (job.status === "PROCESSING") return "analyzing";
  if (job.status === "COMPLETED" || job.status === "PARTIAL") return "done";
  return "error";
}

function queueItemFromJob(job: AiJobRow): QueuedPassage | null {
  const passage = job.passage;
  if (!passage) return null;
  const analysisData = parseAnalysis(passage.analysis?.analysisData);
  return {
    id: passage.id,
    title: passage.title || job.title,
    contentPreview:
      passage.content.length > 120
        ? passage.content.slice(0, 120) + "..."
        : passage.content,
    wordCount: wordCount(passage.content),
    status: statusFromJob(job),
    analysisData,
    error: job.errorMessage,
    promptConfig: promptConfigFromJobConfig(job.config),
    createdAt: new Date(job.createdAt),
    schoolName: passage.school?.name,
    grade: passage.grade ?? undefined,
    semester: passage.semester ?? undefined,
    unit: passage.unit ?? undefined,
    publisher: passage.publisher ?? undefined,
    tags: typeof passage.tags === "string" ? safeParseTags(passage.tags) : undefined,
    passageData: {
      ...passage,
      createdAt: new Date(passage.createdAt),
      analysis: passage.analysis
        ? { ...passage.analysis, updatedAt: new Date(passage.analysis.updatedAt) }
        : null,
      questions: passage.questions.map((q) => ({
        ...q,
        createdAt: new Date(q.createdAt),
      })),
    },
  };
}

function safeParseTags(raw: string): string[] | undefined {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

async function startPassageAnalysisJob(
  passageId: string,
  promptConfig: AnalysisPromptConfig,
) {
  const res = await fetch("/api/workbench/ai-jobs/passage-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      customPrompt: promptConfig.customPrompt,
      focusAreas: promptConfig.focusAreas,
      targetLevel: promptConfig.targetLevel,
      generationPlan: promptConfig.generationPlan,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error || "Failed to start passage analysis job.");
  }
}

export function usePassageQueue(initialItems?: QueuedPassage[]) {
  const [localQueue, setLocalQueue] = useState<QueuedPassage[]>(() => initialItems || []);
  const [jobQueue, setJobQueue] = useState<QueuedPassage[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          "/api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&limit=100",
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: AiJobRow[] };
        if (cancelled) return;
        setJobQueue((data.jobs ?? []).map(queueItemFromJob).filter(Boolean) as QueuedPassage[]);
      } catch {
        // Best-effort polling; the local queue remains visible on transient errors.
      }
    };

    void load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const merged: QueuedPassage[] = [];
    for (const item of [...jobQueue, ...localQueue]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [jobQueue, localQueue]);

  const activeCount = queue.filter(
    (p) => p.status === "analyzing" || p.status === "pending",
  ).length;

  const addToQueue = useCallback(
    async (
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
      runAnalysisNow: boolean = true,
    ) => {
      const normalizedPromptConfig = {
        ...promptConfig,
        generationPlan: normalizeQuestionGenerationPlan(promptConfig.generationPlan),
      };
      const newItem: QueuedPassage = {
        id: passage.id,
        title: passage.title,
        contentPreview:
          passage.content.length > 120
            ? passage.content.slice(0, 120) + "..."
            : passage.content,
        wordCount: wordCount(passage.content),
        status: runAnalysisNow ? "pending" : "not_analyzed",
        analysisData: null,
        error: null,
        promptConfig: normalizedPromptConfig,
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

      setLocalQueue((prev) => [newItem, ...prev.filter((p) => p.id !== passage.id)]);

      if (!runAnalysisNow) return;

      try {
        await startPassageAnalysisJob(passage.id, normalizedPromptConfig);
      } catch (err) {
        setLocalQueue((prev) =>
          prev.map((p) =>
            p.id === passage.id
              ? {
                  ...p,
                  status: "error" as const,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Failed to start passage analysis job.",
                }
              : p,
          ),
        );
        throw err;
      }
    },
    [],
  );

  const retryAnalysis = useCallback(
    (passageId: string) => {
      const target = queue.find((p) => p.id === passageId);
      if (!target) return;
      setLocalQueue((prev) =>
        prev.map((p) =>
          p.id === passageId
            ? { ...p, status: "pending" as const, error: null }
            : p,
        ),
      );
      void startPassageAnalysisJob(passageId, target.promptConfig).catch((err) => {
        setLocalQueue((prev) =>
          prev.map((p) =>
            p.id === passageId
              ? {
                  ...p,
                  status: "error" as const,
                  error:
                    err instanceof Error
                      ? err.message
                      : "Failed to start passage analysis job.",
                }
              : p,
          ),
        );
      });
    },
    [queue],
  );

  const removeFromQueue = useCallback((passageId: string) => {
    setLocalQueue((prev) => prev.filter((p) => p.id !== passageId));
    setJobQueue((prev) => prev.filter((p) => p.id !== passageId));
  }, []);

  const updateAnalysisData = useCallback(
    (passageId: string, data: PassageAnalysisData) => {
      const update = (prev: QueuedPassage[]) =>
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
            : p,
        );
      setLocalQueue(update);
      setJobQueue(update);
    },
    [],
  );

  const updateQuestions = useCallback(
    (
      passageId: string,
      questions: QueuedPassage["passageData"]["questions"],
    ) => {
      const update = (prev: QueuedPassage[]) =>
        prev.map((p) =>
          p.id === passageId
            ? {
                ...p,
                passageData: { ...p.passageData, questions },
              }
            : p,
        );
      setLocalQueue(update);
      setJobQueue(update);
    },
    [],
  );

  const hasActiveAnalysis = queue.some(
    (p) => p.status === "analyzing" || p.status === "pending",
  );

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
