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

function jobToQueueItem(
  job: AiJobRow,
  { includeTerminalFailures = false }: { includeTerminalFailures?: boolean } = {},
): QueueItem | null {
  if (!job.passage) return null;
  const terminalFailure = job.status === "FAILED" || job.status === "CANCELLED";
  if (terminalFailure && !includeTerminalFailures) return null;

  const config = parseRecord(job.config);
  const result = parseRecord(job.result);
  const mode = config.mode === "MANUAL" ? "manual" : "auto";
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const questionIds = Array.isArray(result.questionIds)
    ? result.questionIds.filter((id): id is string => typeof id === "string")
    : [];
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
    questionIds,
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

function isFastTempItem(item: QueueItem): boolean {
  return item.id.startsWith("fast:");
}

function sameTypeCounts(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && Number(a[key]) === Number(b[key]));
}

function sameGenerationRequest(a: QueueItem, b: QueueItem): boolean {
  return (
    a.passageId === b.passageId &&
    a.config.mode === b.config.mode &&
    a.config.difficulty === b.config.difficulty &&
    (a.config.generationPlan || "STANDARD") ===
      (b.config.generationPlan || "STANDARD") &&
    a.config.prompt === b.config.prompt &&
    sameTypeCounts(a.config.typeCounts, b.config.typeCounts)
  );
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
        const jobs = data.jobs ?? [];
        const failedJobItems = jobs
          .map((job) => jobToQueueItem(job, { includeTerminalFailures: true }))
          .filter(
            (item): item is QueueItem =>
              !!item && item.status === "error",
          );

        if (failedJobItems.length > 0) {
          setLocalQueue((prev) =>
            prev.map((item) => {
              if (
                !isFastTempItem(item) ||
                item.status !== "generating"
              ) {
                return item;
              }
              const failedMatch = failedJobItems.find((failed) =>
                sameGenerationRequest(item, failed),
              );
              if (!failedMatch) return item;
              return {
                ...item,
                status: "error" as const,
                progress: failedMatch.progress,
                error: failedMatch.error,
              };
            }),
          );
        }

        setDbQueue(jobs.map((job) => jobToQueueItem(job)).filter(Boolean) as QueueItem[]);
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
    const byId = new Map<string, QueueItem>();
    const activeFastTemps = localQueue.filter(
      (item) => isFastTempItem(item) && item.status === "generating",
    );
    const completedDbItems = dbQueue.filter(
      (item) => item.status === "done" || item.status === "reviewed",
    );
    for (const item of localQueue) {
      if (
        isFastTempItem(item) &&
        completedDbItems.some((dbItem) => sameGenerationRequest(item, dbItem))
      ) {
        continue;
      }
      byId.set(item.id, item);
    }
    for (const item of dbQueue) {
      if (
        item.status === "generating" &&
        activeFastTemps.some((temp) => sameGenerationRequest(temp, item))
      ) {
        continue;
      }
      const localItem = byId.get(item.id);
      byId.set(
        item.id,
        localItem
          ? { ...item, createdAt: localItem.createdAt ?? item.createdAt }
          : item,
      );
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });
  }, [dbQueue, localQueue]);

  return [queue, setLocalQueue];
}
