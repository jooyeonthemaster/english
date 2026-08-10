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
  /**
   * 생성 중 실시간 미리보기(SSE) — 로딩 카드에서만 채워지고 완료·실패와 함께
   * 지워진다. 고정 높이 패널로 렌더하므로 값이 자라도 카드가 밀리지 않는다.
   */
  streamPreview?: AnalysisStreamPreview;
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
  // 동일 id 가 중복될 수 있다. 어느 것을 채택할지가 중요하다:
  // 폴링 API(/api/workbench/ai-jobs?view=passage-list)는 createdAt desc 로 주므로
  // 배열 앞이 최신이다. 예전 `new Map(jobQueue.map(...))` 은 뒤 항목이 앞을 덮어
  // **가장 오래된 잡**을 채택했다 — 이미 분석한 지문을 재생성하면 과거 COMPLETED
  // 잡이 이겨 status 가 done 으로 굳고, 진행중 필터에서 빠져 로딩 카드 자체가
  // 사라졌다(26-07-25 실사고). 진행중을 우선하고, 동률이면 첫 등장(=최신)을 남긴다.
  const isActiveStatus = (s: QueuedPassageStatus) => s === "pending" || s === "analyzing";
  const jobById = new Map<string, QueuedPassage>();
  for (const item of jobQueue) {
    const prev = jobById.get(item.id);
    if (!prev) {
      jobById.set(item.id, item);
      continue;
    }
    if (!isActiveStatus(prev.status) && isActiveStatus(item.status)) {
      jobById.set(item.id, item);
    }
  }
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

/**
 * 분석 스트림 미리보기 프레임 — 문제 생성(md-stream)의 StreamPreviewPane 과
 * 동일한 모양이라 같은 컴포넌트로 렌더한다.
 */
export interface AnalysisStreamPreview {
  phase: "thinking" | "generating";
  startedAt: number;
  outputStartedAt?: number;
  tail: string;
  /** 현재 생성 단계 한글 라벨 — "전체 초안" / "어휘" / "실전 워크북" 등 */
  stage?: string;
  /**
   * 델타마다 증가하는 단조 카운터. 상위 발행 시그니처가 "내용이 바뀌었다"를
   * 값 비교 없이 감지하는 용도 — tail 은 420자에서 포화하므로 길이로는 부족하다.
   */
  tick: number;
  /** 마지막 델타 수신 시각(ms) — 폴링 재부착 시 좀비 미리보기 판별용. */
  lastDeltaAt: number;
}

async function startPassageAnalysisJob(
  passageId: string,
  promptConfig: AnalysisPromptConfig,
  options: {
    fast?: boolean;
    onPreview?: (preview: AnalysisStreamPreview) => void;
  } = { fast: true },
): Promise<PassageAnalysisJobResponse> {
  const endpoint = options.fast
    ? "/api/workbench/ai-jobs/passage-analysis/fast"
    : "/api/workbench/ai-jobs/passage-analysis";
  // fast 레인 + 미리보기 구독자가 있을 때만 SSE 를 켠다. 서버는 stream 플래그가
  // 없으면 기존 JSON 응답을 그대로 낸다(무회귀).
  const wantStream = options.fast === true && typeof options.onPreview === "function";
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
      ...(wantStream ? { stream: true } : {}),
    }),
  });

  if (!wantStream || !res.body || !res.headers.get("content-type")?.includes("event-stream")) {
    // 비스트리밍 응답(기존 경로 또는 가드 단계에서의 조기 JSON 반환)
    const data = (await res.json().catch(() => ({}))) as PassageAnalysisJobResponse;
    if (!res.ok || data.error) {
      throw new Error(data.details || data.error || "Failed to start passage analysis job.");
    }
    return data;
  }

  return consumeAnalysisStream(res.body, options.onPreview!);
}

/** SSE 본문을 읽어 미리보기를 흘리고, 마지막 done 프레임을 결과로 돌려준다. */
async function consumeAnalysisStream(
  body: ReadableStream<Uint8Array>,
  onPreview: (preview: AnalysisStreamPreview) => void,
): Promise<PassageAnalysisJobResponse> {
  const startedAt = Date.now();
  let outputStartedAt: number | undefined;
  let reasoningTail = "";
  let contentTail = "";
  let stage: string | undefined;
  let lastEmit = 0;
  let tick = 0;

  const emitPreview = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    tick += 1;
    onPreview({
      phase: outputStartedAt ? "generating" : "thinking",
      startedAt,
      outputStartedAt,
      tail: (outputStartedAt ? contentTail : reasoningTail).slice(-420),
      stage,
      tick,
      lastDeltaAt: now,
    });
  };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: PassageAnalysisJobResponse | null = null;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.t === "phase" && typeof event.label === "string") {
        // 단계가 바뀌면 패널을 사고 단계로 되감는다 — 다음 콜의 사고 시간을 다시 센다.
        stage = event.label;
        outputStartedAt = undefined;
        contentTail = "";
        reasoningTail = "";
        emitPreview(true);
      } else if (event.t === "r" && typeof event.d === "string") {
        reasoningTail = (reasoningTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "c" && typeof event.d === "string") {
        if (!outputStartedAt) outputStartedAt = Date.now();
        contentTail = (contentTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "error") {
        const err = event as { error?: string; details?: string };
        throw new Error(err.details || err.error || "Failed to start passage analysis job.");
      } else if (event.t === "done") {
        done = event as unknown as PassageAnalysisJobResponse;
      }
    }
  }

  if (!done) {
    // 서버는 저장까지 끝냈을 수 있다 — 잡 폴링이 완료 카드를 복원하므로
    // 단정적 실패가 아니라 확인 안내로 표면화한다(md-stream 과 동일 문구 계약).
    throw new Error(
      "분석 스트림이 중간에 끊겼습니다. 완료 여부는 잠시 후 목록에서 자동으로 반영됩니다.",
    );
  }
  if (done.error) {
    throw new Error(done.details || done.error);
  }
  return done;
}

/** 미리보기 프레임을 두 큐(local/job)에 동시에 반영한다. */
function makePreviewSink(
  passageId: string,
  setLocal: Dispatch<SetStateAction<QueuedPassage[]>>,
  setJob: Dispatch<SetStateAction<QueuedPassage[]>>,
) {
  return (preview: AnalysisStreamPreview) => {
    // 델타가 흐른다 = 서버가 실제로 생성 중이다. 폴링이 PROCESSING 을 확인하기
    // 전이라도 카드를 "분석 중"으로 올려 라벨과 실제 상태를 일치시킨다.
    const apply = (item: QueuedPassage): QueuedPassage => ({
      ...item,
      status: item.status === "pending" ? "analyzing" : item.status,
      streamPreview: preview,
    });
    updateQueueItem(setLocal, passageId, apply);
    updateQueueItem(setJob, passageId, apply);
  };
}

/** 완료·실패 시 미리보기를 걷어낸다 — 결과 카드에 잔상이 남지 않게. */
function clearPreview(item: QueuedPassage): QueuedPassage {
  if (!item.streamPreview) return item;
  const next = { ...item };
  delete next.streamPreview;
  return next;
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
          // 폴링은 DB 잡 행에서 항목을 새로 만든다 — 그대로 갈아끼우면 진행 중인
          // 스트리밍 미리보기가 5초마다 사라진다. 직전 항목의 preview 를 이어붙인다.
          setJobQueue((prev) => {
            const previewById = new Map(
              prev.filter((p) => p.streamPreview).map((p) => [p.id, p.streamPreview!]),
            );
            return (jobs.map(queueItemFromJob).filter(Boolean) as QueuedPassage[]).map(
              (item) => {
                const kept = previewById.get(item.id);
                // 완료·실패로 넘어간 항목은 미리보기를 들고 가지 않는다.
                // 델타가 15초 이상 끊긴 것도 버린다 — SSE 가 죽었는데(HMR·dev 재시작·
                // 게이트웨이 절단) 초 카운터만 계속 올라가는 좀비 패널 방지.
                if (
                  !kept ||
                  Date.now() - kept.lastDeltaAt > 15_000 ||
                  (item.status !== "pending" && item.status !== "analyzing")
                ) {
                  return item;
                }
                return { ...item, streamPreview: kept };
              },
            );
          });
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

      void startPassageAnalysisJob(passage.id, normalizedPromptConfig, {
        fast: true,
        onPreview: makePreviewSink(passage.id, setLocalQueue, setJobQueue),
      })
        .then((response) => {
          updateQueueItem(setLocalQueue, passage.id, (item) =>
            applyAnalysisJobResponse(clearPreview(item), response),
          );
          updateQueueItem(setJobQueue, passage.id, (item) =>
            applyAnalysisJobResponse(clearPreview(item), response),
          );
          notifyJobsChanged();
        })
        .catch((err) => {
          updateQueueItem(setLocalQueue, passage.id, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
          );
          // jobQueue 사본도 함께 정리 — 병합이 job 을 뒤에 전개하므로 여기 남은
          // 죽은 미리보기·analyzing 상태가 화면에서 이긴다(좀비 카드).
          updateQueueItem(setJobQueue, passage.id, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
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
            const response = await startPassageAnalysisJob(passage.id, promptConfig, {
              fast: true,
              onPreview: makePreviewSink(passage.id, setLocalQueue, setJobQueue),
            });
            updateQueueItem(setLocalQueue, passage.id, (item) =>
              applyAnalysisJobResponse(clearPreview(item), response),
            );
            updateQueueItem(setJobQueue, passage.id, (item) =>
              applyAnalysisJobResponse(clearPreview(item), response),
            );
            notifyJobsChanged();
            return response;
          } catch (err) {
            updateQueueItem(setLocalQueue, passage.id, (item) =>
              applyAnalysisJobError(clearPreview(item), err),
            );
            updateQueueItem(setJobQueue, passage.id, (item) =>
              applyAnalysisJobError(clearPreview(item), err),
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
      void startPassageAnalysisJob(passageId, target.promptConfig, {
        fast: true,
        onPreview: makePreviewSink(passageId, setLocalQueue, setJobQueue),
      })
        .then((response) => {
          updateQueueItem(setLocalQueue, passageId, (item) =>
            applyAnalysisJobResponse(clearPreview(item), response),
          );
          updateQueueItem(setJobQueue, passageId, (item) =>
            applyAnalysisJobResponse(clearPreview(item), response),
          );
          notifyJobsChanged();
        })
        .catch((err) => {
          updateQueueItem(setLocalQueue, passageId, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
          );
          updateQueueItem(setJobQueue, passageId, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
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
