"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { startAdaptivePoll } from "@/lib/adaptive-poll";

import type { QueueItem } from "./generate-page-types";

interface AiJobRow {
  id: string;
  status: string;
  title: string;
  passageId?: string | null;
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
  const terminalFailure = job.status === "FAILED" || job.status === "CANCELLED";
  if (terminalFailure && !includeTerminalFailures) return null;

  const config = parseRecord(job.config);
  const result = parseRecord(job.result);
  const mode = config.mode === "MANUAL" ? "manual" : "auto";
  const questionType =
    typeof config.questionType === "string"
      ? config.questionType
      : job.questionType ?? undefined;
  const rawQuestionTypeSettings = parseRecord(config.questionTypeSettings);
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const questionIds = Array.isArray(result.questionIds)
    ? result.questionIds.filter((id): id is string => typeof id === "string")
    : [];
  const hasPassageSnapshot = !!job.passage;
  if (!hasPassageSnapshot && questions.length === 0 && !terminalFailure) {
    return null;
  }

  const passageId = job.passage?.id ?? job.passageId ?? "";
  if (!passageId) return null;

  const progressKey = mode === "auto" ? "auto" : questionType || "manual";
  const progressValue =
    job.status === "COMPLETED" || job.status === "PARTIAL"
      ? "done"
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? "error"
        : "pending";

  return {
    id: job.id,
    passageId,
    passageTitle: job.passage?.title || job.title,
    passageContent: job.passage?.content ?? "",
    createdAt: job.createdAt,
    passageMeta: {
      school: job.passage?.school?.name,
      grade: job.passage?.grade ?? null,
      semester: job.passage?.semester ?? null,
      unit: job.passage?.unit ?? null,
    },
    analysisData: parseAnalysis(job.passage?.analysis?.analysisData),
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
      questionTypeSettings:
        mode === "manual" && questionType
          ? { [questionType]: rawQuestionTypeSettings }
          : rawQuestionTypeSettings,
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

function sameQuestionTypeSettings(a: unknown, b: unknown): boolean {
  return JSON.stringify(parseRecord(a)) === JSON.stringify(parseRecord(b));
}

function sameGenerationRequest(a: QueueItem, b: QueueItem): boolean {
  return (
    a.passageId === b.passageId &&
    a.config.mode === b.config.mode &&
    a.config.difficulty === b.config.difficulty &&
    (a.config.generationPlan || "STANDARD") ===
      (b.config.generationPlan || "STANDARD") &&
    a.config.prompt === b.config.prompt &&
    sameTypeCounts(a.config.typeCounts, b.config.typeCounts) &&
    sameQuestionTypeSettings(
      a.config.questionTypeSettings,
      b.config.questionTypeSettings,
    )
  );
}

export function useGenerationSessionQueue(): [
  QueueItem[],
  Dispatch<SetStateAction<QueueItem[]>>,
] {
  const [localQueue, setLocalQueue] = useState<QueueItem[]>([]);
  const [dbQueue, setDbQueue] = useState<QueueItem[]>([]);
  // 실패 잡을 "처음 관측한" 클라이언트 시각 — 과거 실패 잡(re-roll 이전부터
  // 있던 것)이 새 temp 를 오염시키지 않게 하는 게이트. 양쪽 모두 클라이언트
  // 시계라 서버-클라이언트 시계 오차와 무관하다.
  const failedFirstSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5 * 60_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            "/api/workbench/ai-jobs?domain=QUESTION_GENERATION&limit=100&view=summary",
            { credentials: "include", cache: "no-store", signal },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { jobs?: AiJobRow[] };
          if (signal.aborted) return null;
          const jobs = data.jobs ?? [];
          const failedJobItems = jobs
            .map((job) => jobToQueueItem(job, { includeTerminalFailures: true }))
            .filter(
              (item): item is QueueItem =>
                !!item && item.status === "error",
            );

          // 실패 잡 최초 관측 시각 기록 — temp 가 생기기 전부터 보이던 실패
          // 잡은 "과거 실패"로 분류해 매칭에서 제외한다. 같은 설정 재생성
          // (re-roll)이 일상 동선이라, 직전 실패 잡이 지금 진행 중인 temp 를
          // 가짜 '실패'로 뒤집는 오염을 시간 창 없이 차단한다.
          const observedAt = Date.now();
          for (const f of failedJobItems) {
            if (!failedFirstSeenRef.current.has(f.id)) {
              failedFirstSeenRef.current.set(f.id, observedAt);
            }
          }
          // 응답에서 사라진 id 정리 (응답은 최근 100개 캡).
          if (failedFirstSeenRef.current.size > 300) {
            const liveIds = new Set(failedJobItems.map((f) => f.id));
            for (const id of failedFirstSeenRef.current.keys()) {
              if (!liveIds.has(id)) failedFirstSeenRef.current.delete(id);
            }
          }

          if (failedJobItems.length > 0) {
            setLocalQueue((prev) =>
              prev.map((item) => {
                if (
                  !isFastTempItem(item) ||
                  item.status !== "generating"
                ) {
                  return item;
                }
                const itemTime = item.createdAt
                  ? Date.parse(item.createdAt)
                  : 0;
                const failedMatch = failedJobItems.find((failed) => {
                  if (!sameGenerationRequest(item, failed)) return false;
                  // temp 가 만들어지기 전에 이미 관측된 실패 잡은 과거 실패.
                  const firstSeen = failedFirstSeenRef.current.get(failed.id);
                  return firstSeen == null || firstSeen >= itemTime;
                });
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
          // Signature: status + successCount per job → snaps back to the fast
          // cadence on any start/progress/completion, backs off when idle.
          // 진행 중(PENDING/PROCESSING) 잡이 있는 동안은 서명에 시각을 섞어 백오프를
          // 막는다 — 생성 중에는 status 가 한동안 안 변해 idleMs(5분)까지 늘어지고,
          // 그만큼 완료 반영이 늦어지기 때문. PROCESSING(실제 생성 구간)이 가장 길어
          // PENDING 만 보면 정작 긴 구간에서 폴링이 느려진다. 잡이 없으면 기존 백오프.
          const base = jobs
            .map((j) => `${j.id}:${j.status}:${j.successCount}`)
            .join("|");
          const anyActive = jobs.some(
            (j) => j.status === "PENDING" || j.status === "PROCESSING",
          );
          return anyActive ? `${base}|t${Date.now()}` : base;
        } catch {
          // Keep local optimistic rows visible when a poll fails.
          return null;
        }
      },
    });
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
