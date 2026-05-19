"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { QueueItem } from "./generate-page-types";

interface AiJobRow {
  id: string;
  status: string;
  title: string;
  mode: string | null;
  questionType: string | null;
  requestedCount: number;
  successCount: number;
  errorMessage: string | null;
  config: unknown;
  result: unknown;
  createdAt: string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade: number | null;
    semester: string | null;
    unit: string | null;
    school: { name: string } | null;
    analysis?: { analysisData: string } | null;
  } | null;
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseAnalysis(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jobToQueueItem(job: AiJobRow): QueueItem | null {
  if (!job.passage) return null;
  const config = parseRecord(job.config);
  const result = parseRecord(job.result);
  const mode = config.mode === "MANUAL" ? "manual" : "auto";
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const progressKey = mode === "auto" ? "auto" : questionType || "manual";
  const progressValue =
    job.status === "COMPLETED" || job.status === "PARTIAL"
      ? "done"
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? "error"
        : "pending";

  return {
    id: job.id,
    passageId: job.passage.id,
    passageTitle: job.passage.title || job.title,
    passageContent: job.passage.content,
    createdAt: job.createdAt,
    passageMeta: {
      school: job.passage.school?.name,
      grade: job.passage.grade,
      semester: job.passage.semester,
      unit: job.passage.unit,
    },
    analysisData: parseAnalysis(job.passage.analysis?.analysisData),
    status:
      progressValue === "pending"
        ? "generating"
        : progressValue === "error"
          ? "error"
          : "done",
    progress: { [progressKey]: progressValue },
    questions,
    error: job.errorMessage ?? undefined,
    config: {
      typeCounts:
        mode === "manual" && questionType
          ? { [questionType]: Number(config.count ?? job.requestedCount ?? 1) }
          : {},
      difficulty:
        typeof config.difficulty === "string"
          ? config.difficulty
          : "INTERMEDIATE",
      prompt:
        typeof config.customPrompt === "string" ? config.customPrompt : "",
      mode,
      generationPlan:
        config.generationPlan === "PREMIUM" ? "PREMIUM" : "STANDARD",
    },
  };
}

export function useGenerationSessionQueue(): [
  QueueItem[],
  Dispatch<SetStateAction<QueueItem[]>>,
] {
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [dbQueue, setDbQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          "/api/workbench/ai-jobs?domain=QUESTION_GENERATION&limit=100",
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: AiJobRow[] };
        if (cancelled) return;
        setDbQueue((data.jobs ?? []).map(jobToQueueItem).filter(Boolean) as QueueItem[]);
      } catch {
        // Keep local optimistic rows visible when a poll fails.
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
    const merged: QueueItem[] = [];
    for (const item of [...dbQueue, ...localQueue]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [dbQueue, localQueue]);

  return [queue, setLocalQueue];
}
