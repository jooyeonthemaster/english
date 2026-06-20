"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { startAdaptivePoll } from "@/lib/adaptive-poll";
import {
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  DEFAULT_ANALYSIS_TONE,
  normalizeAnalysisTone,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { bulkDeleteWorkbenchPassages } from "@/actions/workbench";

export interface AnalysisPromptConfig {
  customPrompt: string;
  focusAreas: string[];
  targetLevel: string;
  generationPlan?: QuestionGenerationPlan;
  analysisTone?: AnalysisTone;
  /** true 면 기본 분석에 이어 실전 학습지(06)까지 한 번에 생성한다 (+5크레딧/지문). */
  includeWorksheet?: boolean;
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
  passageId?: string | null;
  errorMessage: string | null;
  config: unknown;
  createdAt: string;
  passage: QueuedPassage["passageData"] | null;
}

interface QueuePassageInput {
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
}

interface PassageAnalysisJobResponse {
  jobId?: string;
  status?: string;
  data?: PassageAnalysisData;
  cached?: boolean;
  createdAt?: string;
  completedAt?: string;
  generationPlan?: QuestionGenerationPlan;
  error?: string;
  details?: string;
}

interface QueueStartItem {
  passage: QueuePassageInput;
  promptConfig: AnalysisPromptConfig;
}

function readAnalysisFastBatchConcurrency(): number {
  const raw = process.env.NEXT_PUBLIC_WORKBENCH_ANALYSIS_FAST_BATCH_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(1, Math.min(8, Math.floor(parsed)));
}

const ANALYSIS_FAST_BATCH_CONCURRENCY = readAnalysisFastBatchConcurrency();
const PASSAGE_QUEUE_CACHE_EVENT = "workbench:passage-queue-cache";
const DEFAULT_PASSAGE_QUEUE_CACHE_KEY = "default";

let passageQueueCache: QueuedPassage[] | null = null;
let passageQueueCacheKey = DEFAULT_PASSAGE_QUEUE_CACHE_KEY;

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
    return {
      customPrompt: "",
      focusAreas: [],
      targetLevel: "",
      analysisTone: DEFAULT_ANALYSIS_TONE,
    };
  }
  const raw = config as Record<string, unknown>;
  return {
    customPrompt: typeof raw.customPrompt === "string" ? raw.customPrompt : "",
    focusAreas: Array.isArray(raw.focusAreas)
      ? raw.focusAreas.filter((v): v is string => typeof v === "string")
      : [],
    targetLevel: typeof raw.targetLevel === "string" ? raw.targetLevel : "",
    generationPlan: normalizeQuestionGenerationPlan(raw.generationPlan),
    analysisTone: normalizeAnalysisTone(raw.analysisTone),
    includeWorksheet: raw.includeWorksheet === true,
  };
}

function statusFromJob(job: AiJobRow): QueuedPassageStatus {
  return statusFromRaw(job.status);
}

function statusFromRaw(status: string | null | undefined): QueuedPassageStatus {
  if (status === "PENDING") return "pending";
  if (status === "PROCESSING") return "analyzing";
  if (status === "COMPLETED" || status === "PARTIAL") return "done";
  if (status === "FAILED" || status === "CANCELLED") return "error";
  return "pending";
}

function normalizePromptConfig(promptConfig: AnalysisPromptConfig): AnalysisPromptConfig {
  return {
    ...promptConfig,
    focusAreas: Array.isArray(promptConfig.focusAreas)
      ? promptConfig.focusAreas
      : [],
    targetLevel: promptConfig.targetLevel ?? "",
    customPrompt: promptConfig.customPrompt ?? "",
    generationPlan: normalizeQuestionGenerationPlan(promptConfig.generationPlan),
    analysisTone: normalizeAnalysisTone(promptConfig.analysisTone),
  };
}

function buildQueueItem(
  passage: QueuePassageInput,
  promptConfig: AnalysisPromptConfig,
  runAnalysisNow: boolean,
): QueuedPassage {
  return {
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
}

function mergeQueueItems(
  localQueue: QueuedPassage[],
  jobQueue: QueuedPassage[],
): QueuedPassage[] {
  // 같은 지문(passage.id)에 대해 AI 작업이 여러 건 존재할 수 있어 jobQueue 안에
  // 동일 id 가 중복될 수 있다. Map 은 마지막 항목만 남기므로 id 당 한 건만 유지된다.
  const jobById = new Map(jobQueue.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged: QueuedPassage[] = [];

  for (const local of localQueue) {
    if (seen.has(local.id)) continue;
    seen.add(local.id);
    const job = jobById.get(local.id);
    if (!job) {
      merged.push(local);
      continue;
    }
    // The poll (`passage-list` view) refreshes status/content but stays light —
    // it never carries analysisData. So take the job's live fields, but keep the
    // seeded item's richer analysisData/analysis and never let an (unexpectedly)
    // empty poll content blank out a passage we already have text for.
    const jobAnalysisHasData = !!job.passageData.analysis?.analysisData;
    merged.push({
      ...local,
      ...job,
      createdAt: local.createdAt,
      promptConfig: local.promptConfig,
      analysisData: job.analysisData ?? local.analysisData,
      wordCount: job.wordCount || local.wordCount,
      contentPreview: job.contentPreview || local.contentPreview,
      passageData: {
        ...local.passageData,
        ...job.passageData,
        content: job.passageData.content || local.passageData.content,
        analysis: jobAnalysisHasData
          ? job.passageData.analysis
          : local.passageData.analysis ?? job.passageData.analysis,
      },
    });
  }

  for (const job of jobQueue) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    merged.push(job);
  }

  return merged;
}

function notifyPassageQueueCacheChanged(cacheKey: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PASSAGE_QUEUE_CACHE_EVENT, { detail: { cacheKey } }),
  );
}

function resolveQueueUpdate(
  previous: QueuedPassage[],
  update: SetStateAction<QueuedPassage[]>,
): QueuedPassage[] {
  return typeof update === "function"
    ? (update as (prev: QueuedPassage[]) => QueuedPassage[])(previous)
    : update;
}

function seedLocalQueue(
  initialItems: QueuedPassage[] | undefined,
  cacheKey: string,
): QueuedPassage[] {
  const initial = initialItems ?? [];
  if (!passageQueueCache || passageQueueCacheKey !== cacheKey) {
    passageQueueCacheKey = cacheKey;
    passageQueueCache = initial;
    return initial;
  }
  passageQueueCache = mergeQueueItems(passageQueueCache, initial);
  return passageQueueCache;
}

function updatePassageQueueCache(
  update: SetStateAction<QueuedPassage[]>,
  cacheKey: string,
): QueuedPassage[] {
  if (passageQueueCacheKey !== cacheKey) {
    passageQueueCacheKey = cacheKey;
    passageQueueCache = [];
  }
  const next = resolveQueueUpdate(passageQueueCache ?? [], update);
  passageQueueCache = next;
  notifyPassageQueueCacheChanged(cacheKey);
  return next;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await worker(items[currentIndex]),
        };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    runNext,
  );
  await Promise.all(workers);
  return results;
}

function applyAnalysisJobResponse(
  item: QueuedPassage,
  response: PassageAnalysisJobResponse,
): QueuedPassage {
  if (response.data) {
    return {
      ...item,
      status: "done",
      analysisData: response.data,
      error: null,
      promptConfig: {
        ...item.promptConfig,
        generationPlan: normalizeQuestionGenerationPlan(
          response.generationPlan ?? item.promptConfig.generationPlan,
        ),
      },
      passageData: {
        ...item.passageData,
        analysis: {
          id: item.passageData.analysis?.id || response.jobId || item.id,
          analysisData: JSON.stringify(response.data),
          contentHash: item.passageData.analysis?.contentHash || "",
          updatedAt: response.completedAt ? new Date(response.completedAt) : new Date(),
        },
      },
    };
  }

  return {
    ...item,
    status: statusFromRaw(response.status),
    error: null,
  };
}

function applyAnalysisJobError(
  item: QueuedPassage,
  err: unknown,
): QueuedPassage {
  return {
    ...item,
    status: "error",
    error:
      err instanceof Error
        ? err.message
        : "Failed to start passage analysis job.",
  };
}

function updateQueueItem(
  setter: Dispatch<SetStateAction<QueuedPassage[]>>,
  passageId: string,
  updater: (item: QueuedPassage) => QueuedPassage,
) {
  setter((prev) =>
    prev.map((item) => (item.id === passageId ? updater(item) : item)),
  );
}

function queueItemFromJob(job: AiJobRow): QueuedPassage | null {
  const passage = job.passage;
  if (!passage) {
    const passageId = job.passageId;
    if (!passageId) return null;
    return {
      id: passageId,
      title: job.title,
      contentPreview: "",
      wordCount: 0,
      status: statusFromJob(job),
      analysisData: null,
      error: job.errorMessage,
      promptConfig: promptConfigFromJobConfig(job.config),
      createdAt: new Date(job.createdAt),
      passageData: {
        id: passageId,
        title: job.title,
        content: "",
        grade: null,
        semester: null,
        unit: null,
        publisher: null,
        difficulty: null,
        tags: null,
        source: null,
        createdAt: new Date(job.createdAt),
        school: null,
        analysis: null,
        notes: [],
        questions: [],
      },
    };
  }
  // The `passage-list` poll view is intentionally light: it carries content +
  // scalar metadata + analysis {id,updatedAt} but OMITS questions, notes, and
  // analysis.analysisData. Read every relation defensively (??) so a lighter
  // projection can never crash, and let mergeQueueItems below restore the
  // seeded item's richer analysisData/questions when the poll omits them.
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
    // "생성일시" = the passage's own creation time (not the analysis job's).
    createdAt: new Date(passage.createdAt),
    schoolName: passage.school?.name,
    grade: passage.grade ?? undefined,
    semester: passage.semester ?? undefined,
    unit: passage.unit ?? undefined,
    publisher: passage.publisher ?? undefined,
    tags: typeof passage.tags === "string" ? safeParseTags(passage.tags) : undefined,
    passageData: {
      id: passage.id,
      title: passage.title,
      content: passage.content,
      grade: passage.grade,
      semester: passage.semester,
      unit: passage.unit,
      publisher: passage.publisher,
      difficulty: passage.difficulty,
      tags: passage.tags,
      source: passage.source,
      createdAt: new Date(passage.createdAt),
      school: passage.school,
      analysis: passage.analysis
        ? {
            id: passage.analysis.id,
            analysisData: passage.analysis.analysisData ?? "",
            contentHash: passage.analysis.contentHash ?? "",
            updatedAt: new Date(passage.analysis.updatedAt),
          }
        : null,
      notes: passage.notes ?? [],
      questions: (passage.questions ?? []).map((q) => ({
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
  options: { fast?: boolean } = { fast: true },
): Promise<PassageAnalysisJobResponse> {
  const endpoint = options.fast
    ? "/api/workbench/ai-jobs/passage-analysis/fast"
    : "/api/workbench/ai-jobs/passage-analysis";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      customPrompt: promptConfig.customPrompt,
      focusAreas: promptConfig.focusAreas,
      targetLevel: promptConfig.targetLevel,
      generationPlan: promptConfig.generationPlan,
      analysisTone: promptConfig.analysisTone,
      includeWorksheet: promptConfig.includeWorksheet === true,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as PassageAnalysisJobResponse;
  if (!res.ok || data.error) {
    throw new Error(data.details || data.error || "Failed to start passage analysis job.");
  }
  return data;
}

export function usePassageQueue(
  initialItems?: QueuedPassage[],
  options: { cacheKey?: string; onJobsChanged?: () => void } = {},
) {
  const cacheKey = options.cacheKey ?? DEFAULT_PASSAGE_QUEUE_CACHE_KEY;
  const onJobsChangedRef = useRef(options.onJobsChanged);
  const [localQueue, setLocalQueueState] = useState<QueuedPassage[]>(() =>
    seedLocalQueue(initialItems, cacheKey),
  );
  const [jobQueue, setJobQueue] = useState<QueuedPassage[]>([]);

  useEffect(() => {
    onJobsChangedRef.current = options.onJobsChanged;
  }, [options.onJobsChanged]);

  const notifyJobsChanged = useCallback(() => {
    onJobsChangedRef.current?.();
  }, []);

  const setLocalQueue = useCallback<Dispatch<SetStateAction<QueuedPassage[]>>>(
    (update) => {
      const next = updatePassageQueueCache(update, cacheKey);
      setLocalQueueState(next);
    },
    [cacheKey],
  );

  useEffect(() => {
    const syncFromCache = (event: Event) => {
      const detail = (event as CustomEvent<{ cacheKey?: string }>).detail;
      if (detail?.cacheKey !== cacheKey) return;
      if (passageQueueCache && passageQueueCacheKey === cacheKey) {
        setLocalQueueState(passageQueueCache);
      }
    };
    window.addEventListener(PASSAGE_QUEUE_CACHE_EVENT, syncFromCache);
    return () => {
      window.removeEventListener(PASSAGE_QUEUE_CACHE_EVENT, syncFromCache);
    };
  }, [cacheKey]);

  useEffect(() => {
    return startAdaptivePoll({
      activeMs: 5_000,
      idleMs: 5 * 60_000,
      run: async (signal) => {
        try {
          const res = await fetch(
            "/api/workbench/ai-jobs?domain=PASSAGE_ANALYSIS&limit=100&view=passage-list",
            { credentials: "include", cache: "no-store", signal },
          );
          if (!res.ok) return null;
          const data = (await res.json()) as { jobs?: AiJobRow[] };
          if (signal.aborted) return null;
          const jobs = data.jobs ?? [];
          setJobQueue(jobs.map(queueItemFromJob).filter(Boolean) as QueuedPassage[]);
          // Signature: status per job → fast while an analysis runs, idle after.
          return jobs.map((j) => `${j.id}:${j.status}`).join("|");
        } catch {
          // Best-effort polling; the local queue remains visible on errors.
          return null;
        }
      },
    });
  }, []);

  const queue = useMemo(() => {
    return mergeQueueItems(localQueue, jobQueue);
  }, [jobQueue, localQueue]);

  const activeCount = queue.filter(
    (p) => p.status === "analyzing" || p.status === "pending",
  ).length;

  const addToQueue = useCallback(
    async (
      passage: QueuePassageInput,
      promptConfig: AnalysisPromptConfig,
      runAnalysisNow: boolean = true,
    ) => {
      const normalizedPromptConfig = normalizePromptConfig(promptConfig);
      const newItem = buildQueueItem(
        passage,
        normalizedPromptConfig,
        runAnalysisNow,
      );

      setLocalQueue((prev) => [newItem, ...prev.filter((p) => p.id !== passage.id)]);
      notifyJobsChanged();

      if (!runAnalysisNow) return;

      void startPassageAnalysisJob(passage.id, normalizedPromptConfig)
        .then((response) => {
          updateQueueItem(setLocalQueue, passage.id, (item) =>
            applyAnalysisJobResponse(item, response),
          );
          updateQueueItem(setJobQueue, passage.id, (item) =>
            applyAnalysisJobResponse(item, response),
          );
          notifyJobsChanged();
        })
        .catch((err) => {
          updateQueueItem(setLocalQueue, passage.id, (item) =>
            applyAnalysisJobError(item, err),
          );
          notifyJobsChanged();
        });
    },
    [notifyJobsChanged, setLocalQueue],
  );

  const addManyToQueue = useCallback(
    async (items: QueueStartItem[], runAnalysisNow: boolean = true) => {
      if (items.length === 0) return { success: 0, failed: 0 };

      const prepared = items.map((item) => ({
        passage: item.passage,
        promptConfig: normalizePromptConfig(item.promptConfig),
      }));
      const ids = new Set(prepared.map((item) => item.passage.id));
      const newItems = prepared.map((item) =>
        buildQueueItem(item.passage, item.promptConfig, runAnalysisNow),
      );

      setLocalQueue((prev) => [
        ...newItems,
        ...prev.filter((item) => !ids.has(item.id)),
      ]);
      notifyJobsChanged();

      if (!runAnalysisNow) {
        return { success: prepared.length, failed: 0 };
      }

      void runWithConcurrency(
        prepared,
        ANALYSIS_FAST_BATCH_CONCURRENCY,
        async ({ passage, promptConfig }) => {
          try {
            const response = await startPassageAnalysisJob(
              passage.id,
              promptConfig,
            );
            updateQueueItem(setLocalQueue, passage.id, (item) =>
              applyAnalysisJobResponse(item, response),
            );
            updateQueueItem(setJobQueue, passage.id, (item) =>
              applyAnalysisJobResponse(item, response),
            );
            notifyJobsChanged();
            return response;
          } catch (err) {
            updateQueueItem(setLocalQueue, passage.id, (item) =>
              applyAnalysisJobError(item, err),
            );
            notifyJobsChanged();
            throw err;
          }
        },
      );

      return {
        success: prepared.length,
        failed: 0,
      };
    },
    [notifyJobsChanged, setLocalQueue],
  );

  const enqueueManyPending = useCallback(
    (items: QueueStartItem[]) => {
      if (items.length === 0) return;
      const prepared = items.map((item) => ({
        passage: item.passage,
        promptConfig: normalizePromptConfig(item.promptConfig),
      }));
      const ids = new Set(prepared.map((item) => item.passage.id));
      const newItems = prepared.map((item) =>
        buildQueueItem(item.passage, item.promptConfig, true),
      );

      setLocalQueue((prev) => [
        ...newItems,
        ...prev.filter((item) => !ids.has(item.id)),
      ]);
      notifyJobsChanged();
    },
    [notifyJobsChanged, setLocalQueue],
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
      void startPassageAnalysisJob(passageId, target.promptConfig)
        .then((response) => {
          updateQueueItem(setLocalQueue, passageId, (item) =>
            applyAnalysisJobResponse(item, response),
          );
          updateQueueItem(setJobQueue, passageId, (item) =>
            applyAnalysisJobResponse(item, response),
          );
          notifyJobsChanged();
        })
        .catch((err) => {
          updateQueueItem(setLocalQueue, passageId, (item) =>
            applyAnalysisJobError(item, err),
          );
          notifyJobsChanged();
        });
    },
    [notifyJobsChanged, queue, setLocalQueue],
  );

  // 로컬 큐(화면)에서만 제거한다. 서버 삭제는 호출자(예: 분석 모달)가 이미
  // 끝낸 뒤 UI 정리용으로 부른다 — 이 함수 자체는 DB 를 건드리지 않는다.
  const removeFromQueue = useCallback((passageId: string) => {
    setLocalQueue((prev) => prev.filter((p) => p.id !== passageId));
    setJobQueue((prev) => prev.filter((p) => p.id !== passageId));
    notifyJobsChanged();
  }, [notifyJobsChanged, setLocalQueue]);

  // 지문을 DB 에서 실제로 삭제한 뒤 화면에서도 제거한다. 서버 삭제가 성공한
  // 경우에만 로컬 큐에서 빼므로, 실패하면 카드가 그대로 남아 재시도할 수 있다.
  // (academy 스코프 삭제이므로 다른 학원 id 는 조용히 무시된다.)
  const deletePassages = useCallback(
    async (passageIds: string[]) => {
      const ids = passageIds.filter(Boolean);
      if (ids.length === 0) {
        return { success: true as const, requested: 0, deleted: 0 };
      }
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (result.success) {
        const idSet = new Set(ids);
        setLocalQueue((prev) => prev.filter((p) => !idSet.has(p.id)));
        setJobQueue((prev) => prev.filter((p) => !idSet.has(p.id)));
        notifyJobsChanged();
      }
      return result;
    },
    [notifyJobsChanged, setLocalQueue],
  );

  const updateAnalysisData = useCallback(
    (passageId: string, data: PassageAnalysisData) => {
      const update = (prev: QueuedPassage[]) =>
        prev.map((p) =>
          p.id === passageId
            ? {
                ...p,
                status: "done" as const,
                analysisData: data,
                error: null,
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
      notifyJobsChanged();
    },
    [notifyJobsChanged, setLocalQueue],
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
      notifyJobsChanged();
    },
    [notifyJobsChanged, setLocalQueue],
  );

  const hasActiveAnalysis = queue.some(
    (p) => p.status === "analyzing" || p.status === "pending",
  );

  return {
    queue,
    activeCount,
    hasActiveAnalysis,
    addToQueue,
    addManyToQueue,
    enqueueManyPending,
    retryAnalysis,
    removeFromQueue,
    deletePassages,
    updateAnalysisData,
    updateQuestions,
  };
}
