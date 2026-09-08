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

import {
  startAdaptivePoll,
  type AdaptivePollHandle,
} from "@/lib/adaptive-poll";
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
  /**
   * 스튜디오 섹션 종량제(§3.4.1) — 부분 분석 대상 섹션 화이트리스트.
   * 부재/빈 배열이면 요청 body 에 실리지 않는다(기존 정액 경로와 바이트 동일 — §11 무회귀).
   */
  targetSections?: string[];
  /** 스튜디오 발사 귀속 모듈(§3.4.1-11). 부재 시 body 에 실리지 않는다. */
  sourceModule?: string;
  /**
   * 파이널 원페이지(PRIME_FINAL) 생성 플래그 — true 일 때만 요청 body 에 실린다
   * (부재 스프레드 = 기존 상품 경로와 바이트 동일, .tmp-final-qa/final-onepage-spec.md §1·§2).
   */
  finalOnepage?: boolean;
  /**
   * 직독직해 분석본(PRIME_READING) 생성 플래그 — finalOnepage 와 **같은 계약**:
   * true 일 때만 요청 body 에 키가 실린다(부재 스프레드 = 기존 상품 경로와 바이트
   * 동일 — §11 무회귀, docs/reading-analysis-worksheet-spec.md §5.2 B-6).
   * includeWorksheet·finalOnepage·targetSections 와는 서버(fast 라우트)가 400 으로
   * 막는 상호 배타 축이다 — 발사부는 sheetPromptFlags 가 variant 당 1키만 돌려주는
   * 것으로 조합 자체를 만들지 않는다.
   */
  readingAnalysis?: boolean;
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
    // 부분 분석 잡의 재시도(다시 시도)가 전체 5크레딧 분석으로 승격되지 않도록,
    // 잡 config 에 기록된 targetSections/sourceModule 을 복원한다(부재 시 키 생략).
    ...(Array.isArray(raw.targetSections) &&
    raw.targetSections.every((v): v is string => typeof v === "string") &&
    raw.targetSections.length > 0
      ? { targetSections: raw.targetSections }
      : {}),
    ...(typeof raw.sourceModule === "string" && raw.sourceModule
      ? { sourceModule: raw.sourceModule }
      : {}),
    // 파이널 원페이지 잡의 재시도가 기본/실전 분석으로 승격되지 않도록 잡 config
    // 에 기록된 finalOnepage 를 복원한다(true 일 때만 키 포함 — targetSections 와 동형).
    ...(raw.finalOnepage === true ? { finalOnepage: true } : {}),
    // 직독직해 분석본 잡의 재시도(다시 시도)가 기본 분석으로 승격되지 않도록
    // readingAnalysis 도 같은 규약으로 복원한다(true 일 때만 키 포함 — finalOnepage
    // 와 동형. 빠뜨리면 실패한 ◈5 직독직해 재시도가 기본 학습지를 만들고 끝난다).
    ...(raw.readingAnalysis === true ? { readingAnalysis: true } : {}),
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
  // (`ai-jobs/route.ts:121` `orderBy: { createdAt: "desc" }`) **배열 앞이 최신**이다.
  // 예전 `new Map(jobQueue.map(...))` 은 뒤 항목이 앞을 덮어 **가장 오래된 잡**을
  // 채택했다 — 이미 분석한 지문을 재생성하면 과거 COMPLETED 잡이 이겨 status 가
  // done 으로 굳고, 진행중 필터에서 빠져 로딩 카드 자체가 사라졌다(26-07-25 실사고).
  //
  // ⚠ 그 수리는 「진행중(pending/analyzing) 우선, 동률이면 최신」이었는데, 그
  //   **활성 우선**이 반대 방향의 결함을 만들었다(RCA RC-1 층②): 스테일 청소가
  //   아직 안 돈 **좀비 PROCESSING 행**(1618 실측 602.7s·668.6s 생존)이 남아
  //   있으면, 그 뒤에 새로 만들어져 이미 COMPLETED 된 잡을 좀비가 가린다 →
  //   다 만들어진 학습지가 계속 「생성 중」으로 돌고, 같은 술어를 읽는
  //   use-studio-queue 의 busy 필터가 **새 발사까지 막는다.**
  // ⇒ 채택 규칙은 「무조건 최신 1건」이다. 이것만으로 26-07-25 사고도 그대로
  //   막힌다 — 재생성하면 새 잡이 배열 맨 앞이라 진행중이 자연히 이긴다.
  //   활성 우선은 그 사고를 막는 데 **필요한 조건이 아니었고, 그 덤이 사고를 냈다.**
  // ⚠ 이 계약은 위 orderBy 에 기댄다. 폴 응답 정렬을 바꾸면 여기가 조용히 깨진다
  //   (타입 에러 0 · 콘솔 0 · 카드 상태만 틀림).
  const jobById = new Map<string, QueuedPassage>();
  for (const item of jobQueue) {
    if (!jobById.has(item.id)) jobById.set(item.id, item);
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

/**
 * 스트림이 done 프레임 없이 끊겼음을 나타내는 센티넬(RCA RC-2 처방 #7).
 *
 * 왜 전용 클래스인가: 이 시점에 서버는 **생성·과금·저장을 이미 끝냈을 수 있다**
 * (fast/route.ts 의 SSE 래퍼는 클라이언트가 끊겨도 핸들러를 계속 돌린다 —
 * `:203-206` 주석이 그 계약이다). 그런데 예전 코드는 여기서 평범한 Error 를
 * 던졌고 소비부 3곳이 그걸 `applyAnalysisJobError` 로 받아 카드를 **error 로
 * 못박았다** — 「돈은 나갔고 DB 엔 COMPLETED 인데 화면은 실패」의 직접 원인이다.
 * 더 나쁜 것은 그다음이다: 상위 완료 넛지 술어가 원래
 * `status === "done" && (prev === "pending" || prev === "analyzing")` 라서
 * 한 번 error 를 거치면(analyzing→error→done) prev 가 error 가 되어 **완료를
 * 알리는 표면이 0개**가 됐다(RCA RC-2 층⑤). 그 술어는 상위에서 따로 넓히는
 * 중이지만, **애초에 error 를 만들지 않는 것**이 근본 수리다 — 술어를 넓혀도
 * 로즈 실패 카드가 한 번 스치는 사실은 그대로이고, 그 사이 사용자는 이미
 * 「실패했다」를 본다.
 * ⇒ 절단은 「실패」가 아니라 「판정 보류」다. 유일한 판정자는 잡 폴링이다.
 */
/** 402 — 잔액 부족. 배치 발사는 첫 402 에서 남은 지문을 시작하지 않는다(아래 addManyToQueue). */
export class AnalysisInsufficientCredits extends Error {
  readonly balance: number;
  readonly required: number;
  constructor(message: string, balance: number, required: number) {
    super(message);
    this.name = "AnalysisInsufficientCredits";
    this.balance = balance;
    this.required = required;
  }
}

class AnalysisStreamTruncated extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisStreamTruncated";
  }
}

/**
 * 분석 요청 1건의 클라이언트 상한(ms).
 * 서버 `maxDuration = 300` + SSE 래퍼 하트비트([E29-1], 15초 `: hb`)를 감안한
 * 여유값이며, 같은 리포의 `use-studio-queue.ts` `AbortSignal.timeout(330_000)`
 * 과 같은 규약이다. 이것이 없으면 게이트웨이가 응답을 붙잡고 놓지 않을 때
 * fetch 가 **영원히** 매달리고, 그 카드에는 종결 수단이 아예 없다.
 * ⚠ 이 타임아웃이 만든 AbortError 는 절단과 **같은 취급**이어야 한다
 *   (RCA §4 처방 #8) — 320초를 채웠다면 서버 잡은 거의 확실히 존재하므로
 *   error 로 못박으면 위와 똑같은 오탐을 새로 만든다.
 */
const ANALYSIS_REQUEST_TIMEOUT_MS = 320_000;

/**
 * 절단·타임아웃을 「확인 중」으로 붙잡아 두는 상한(ms).
 * 이 창 안에 그 지문의 잡 행이 폴링에 한 번이라도 보이면 판정은 그 행이 한다.
 * 끝내 한 행도 안 보이면 = 잡이 아예 안 생긴 요청이므로 종결시킨다 —
 * 안 그러면 카드가 영원히 도는 **새 결함**이 된다(에러 0·콘솔 0·화면만 멈춤).
 */
const TRUNCATED_CONFIRM_WINDOW_MS = 120_000;

/** 절단·타임아웃 시의 「확인 중」 문구 — 자구는 md-stream 계약 그대로 유지한다. */
const ANALYSIS_STREAM_TRUNCATED_MESSAGE =
  "분석 스트림이 중간에 끊겼습니다. 완료 여부는 잠시 후 목록에서 자동으로 반영됩니다.";

/** 확인 창이 끝나도록 잡 행이 한 번도 안 보였을 때의 **종결** 문구. */
const ANALYSIS_CONFIRM_FAILED_MESSAGE =
  "생성 요청의 진행 상태를 확인하지 못했습니다. 목록을 새로고침해 결과를 확인해 주세요.";

/**
 * AbortSignal.timeout 이 만든 거절인가.
 * instanceof 를 쓰지 않는 이유: 브라우저는 `DOMException`, 일부 런타임·폴리필은
 * 평범한 `Error` 를 던져 클래스로 가르면 환경에 따라 조용히 새 오탐이 생긴다.
 */
function isAbortLikeError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * 분석 잡 요청 body 조립 — **export 는 계약 테스트 전용**(런타임 소비처는
 * startPassageAnalysisJob 하나). 스튜디오 부분 분석 필드(targetSections/
 * sourceModule)와 파이널 원페이지 플래그(finalOnepage)는 부재 시 스프레드가
 * 비어 기존 정액 경로와 **바이트 동일**해야 한다(§11 무회귀 — tests/unit 이
 * 이 함수를 직접 검증한다).
 */
export function buildAnalysisRequestBody(
  passageId: string,
  promptConfig: AnalysisPromptConfig,
  wantStream: boolean,
): Record<string, unknown> {
  return {
    passageId,
    customPrompt: promptConfig.customPrompt,
    focusAreas: promptConfig.focusAreas,
    targetLevel: promptConfig.targetLevel,
    generationPlan: promptConfig.generationPlan,
    analysisTone: promptConfig.analysisTone,
    includeWorksheet: promptConfig.includeWorksheet === true,
    ...(Array.isArray(promptConfig.targetSections) && promptConfig.targetSections.length > 0
      ? { targetSections: promptConfig.targetSections }
      : {}),
    ...(typeof promptConfig.sourceModule === "string" && promptConfig.sourceModule
      ? { sourceModule: promptConfig.sourceModule }
      : {}),
    ...(promptConfig.finalOnepage === true ? { finalOnepage: true } : {}),
    // 직독직해 분석본 — finalOnepage 와 동형(true 일 때만 키 존재). ⚠ additive
    // 말미 배치(stream 직전)를 지킬 것 — 부재 시 요청 바이트 무회귀가 계약이고
    // tests/unit/studio-workbench-contract 가 키 집합·순서를 바이트로 검증한다.
    ...(promptConfig.readingAnalysis === true ? { readingAnalysis: true } : {}),
    ...(wantStream ? { stream: true } : {}),
  };
}

/**
 * 분석 잡 발사 — **절단 계열을 센티넬 하나로 접는 유일한 자리**.
 *
 * `AbortSignal.timeout` 이 터지면 fetch 도, 이미 진행 중이던
 * `reader.read()`(스트림 본문)도 함께 AbortError 로 거절된다. 두 지점이 다르므로
 * 실제 요청은 아래 `runPassageAnalysisRequest` 로 내리고 감싸기는 여기서만 한다 —
 * 안 그러면 두 곳에서 같은 변환을 복제하게 되고, 한쪽만 고쳐진 채 갈린다.
 */
async function startPassageAnalysisJob(
  passageId: string,
  promptConfig: AnalysisPromptConfig,
  options: {
    fast?: boolean;
    onPreview?: (preview: AnalysisStreamPreview) => void;
  } = { fast: true },
): Promise<PassageAnalysisJobResponse> {
  try {
    return await runPassageAnalysisRequest(passageId, promptConfig, options);
  } catch (err) {
    if (isAbortLikeError(err)) {
      throw new AnalysisStreamTruncated(ANALYSIS_STREAM_TRUNCATED_MESSAGE);
    }
    throw err;
  }
}

async function runPassageAnalysisRequest(
  passageId: string,
  promptConfig: AnalysisPromptConfig,
  options: {
    fast?: boolean;
    onPreview?: (preview: AnalysisStreamPreview) => void;
  },
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
    // ⚠ 요청 **바이트**는 건드리지 않는다 — body 는 buildAnalysisRequestBody 가
    //   만든 그대로이고(§5 P6 무회귀, tests/unit/studio-workbench-contract),
    //   signal 은 요청 내용이 아니라 클라이언트 종결 수단이라 그 계약 밖이다.
    signal: AbortSignal.timeout(ANALYSIS_REQUEST_TIMEOUT_MS),
    body: JSON.stringify(buildAnalysisRequestBody(passageId, promptConfig, wantStream)),
  });

  if (!wantStream || !res.body || !res.headers.get("content-type")?.includes("event-stream")) {
    // 비스트리밍 응답(기존 경로 또는 가드 단계에서의 조기 JSON 반환)
    const data = (await res.json().catch(() => ({}))) as PassageAnalysisJobResponse;
    if (!res.ok || data.error) {
      // ⚠ [E29-5] `details` 는 zod 400 에서 **ZodIssue 배열**로 온다(fast/route.ts
      //   Invalid payload 분기). 배열을 그대로 Error 에 넘기면 message 가
      //   `String(배열)` = "[object Object]" 가 되어 교사 화면에 그 문자열이 뜬다.
      //   문자열일 때만 상세로 쓰고, 아니면 error 자구로 폴백한다.
      const detail = typeof data.details === "string" ? data.details : null;
      if (res.status === 402) {
        // 서버 사전 게이트(credit-preflight)의 한국어 자구를 그대로 카드에 싣는다.
        const body = data as unknown as { balance?: number; required?: number };
        throw new AnalysisInsufficientCredits(
          data.error || "크레딧이 부족합니다.",
          typeof body.balance === "number" ? body.balance : 0,
          typeof body.required === "number" ? body.required : 0,
        );
      }
      throw new Error(detail || data.error || "Failed to start passage analysis job.");
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
    // ⚠ 예전에는 여기서 평범한 Error 를 던졌고 소비부 3곳이 그것을 error 로
    //   못박아 **이 주석이 선언한 계약을 코드가 정면으로 배신**했다.
    //   센티넬로 바꿔 계약을 집행한다(RCA RC-2 처방 #7).
    throw new AnalysisStreamTruncated(ANALYSIS_STREAM_TRUNCATED_MESSAGE);
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
  // 폴링 핸들·진행 중 카드 수 — 아래 폴 루프(run)와 발사 감지 effect 가 공유한다.
  const pollRef = useRef<AdaptivePollHandle | null>(null);
  const localActiveRef = useRef(0);
  const prevActiveCountRef = useRef(0);
  /** 직전 폴에서 본 서버 활성 잡 유무 — 백오프 상한 결정에만 쓴다. */
  const serverActiveRef = useRef(false);

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
    const handle = startAdaptivePoll({
      activeMs: 5_000,
      // 진행 중에는 상한을 20초로 조인다(유휴는 기존 5분 그대로).
      //
      // 이 폴은 지문 본문을 지문 수만큼 싣는 **무거운** 응답이라, 진행 내내
      // 5초로 못 박으면 egress 가 그대로 몇 배가 된다(§12 폴러 1개 규칙과 같은
      // 계보의 비용 문제). 반대로 상한이 5분이면 — 상태가 안 변하는 동안
      // 5→10→20→40→80→160s 로 늘어나 **다 만들어진 학습지가 최대 2분 넘게
      // 「생성 중」으로 남는다**(26-08-18 사용자 지적의 학습지판 원인).
      // 20초 상한이 그 사이를 끊는다: 완료를 늦어도 20초 안에 관측하고,
      // 상태가 바뀌면 곧바로 5초로 되돌아간다.
      idleMs: () =>
        serverActiveRef.current || localActiveRef.current > 0
          ? 20_000
          : 5 * 60_000,
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
          // 진행 중 여부는 위 idleMs 상한(20s)이 소비한다 — 서명 자체는 순수하게
          // 유지해, 변화가 있을 때만 빠른 주기로 되돌아가게 둔다.
          serverActiveRef.current = jobs.some(
            (j) => j.status === "PENDING" || j.status === "PROCESSING",
          );
          return jobs.map((j) => `${j.id}:${j.status}`).join("|");
        } catch {
          // Best-effort polling; the local queue remains visible on errors.
          return null;
        }
      },
    });
    pollRef.current = handle;
    return () => {
      pollRef.current = null;
      handle();
    };
  }, []);

  const queue = useMemo(() => {
    return mergeQueueItems(localQueue, jobQueue);
  }, [jobQueue, localQueue]);

  const activeCount = queue.filter(
    (p) => p.status === "analyzing" || p.status === "pending",
  ).length;

  // 진행 중 카드 수 거울 + 발사/종결 즉시 폴링 — 폴링이 idleMs(5분)까지 잠들어
  // 있는 동안 발사하면 첫 서버 확인이 그만큼 늦고, 그 지연이 곧 "완료됐는데
  // 카드가 남아 있는" 시간이다. bump() 는 빠른 주기로 되돌리고 즉시 1회 폴한다.
  useEffect(() => {
    localActiveRef.current = activeCount;
  }, [activeCount]);
  useEffect(() => {
    if (prevActiveCountRef.current === activeCount) return;
    prevActiveCountRef.current = activeCount;
    pollRef.current?.bump();
  }, [activeCount]);

  // ── 절단·타임아웃 = 실패가 아니라 「판정 보류」 ─────────────────────────
  // AnalysisStreamTruncated 를 받는 3곳(addToQueue · addManyToQueue ·
  // retryAnalysis)이 공유하는 처리. 카드를 error 로 못박지 않고 analyzing 으로
  // **붙잡아** 두고, 판정은 아래 폴 루프(서버 잡 행)에 통째로 넘긴다.
  // 부수 효과로 상위 완료 넛지도 정상화된다 — 카드가 error 를 거치지 않으므로
  // 넛지 술어의 prev 가 "analyzing" 으로 남는다(RCA RC-2 층⑤의 원인 축).
  const jobQueueRef = useRef<QueuedPassage[]>([]);
  useEffect(() => {
    jobQueueRef.current = jobQueue;
  }, [jobQueue]);
  /** 확인 창 타이머 — 지문당 1개. 언마운트 시 전량 해제한다. */
  const confirmTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = confirmTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const applyStreamTruncation = useCallback(
    (passageId: string) => {
      const hold = (item: QueuedPassage): QueuedPassage => {
        const next = clearPreview(item);
        // 폴링이 이미 판정을 끝냈으면(done/error) 그것을 되돌리지 않는다 —
        // 뒤늦게 도착한 절단이 완료 카드를 다시 「생성 중」으로 되감으면
        // 그것 자체가 새 오탐이다.
        if (next.status === "done" || next.status === "error") return next;
        return { ...next, status: "analyzing", error: null };
      };
      updateQueueItem(setLocalQueue, passageId, hold);
      // jobQueue 사본도 같이 — 병합이 job 을 뒤에 전개하므로 여기 남은 죽은
      // 미리보기가 화면에서 이긴다(좀비 카드).
      updateQueueItem(setJobQueue, passageId, hold);
      notifyJobsChanged();
      // 판정자는 폴링이다 — idleMs 를 기다리지 말고 즉시 1회 확인시킨다.
      pollRef.current?.bump();

      // ⚠ 붙잡아 두기만 하면 「잡이 아예 안 생긴 요청」에서 카드가 **영원히**
      //   돈다. 확인 창 안에 그 지문의 잡 행이 폴링에 한 번도 안 보이면 종결한다.
      const timers = confirmTimersRef.current;
      const running = timers.get(passageId);
      if (running) clearTimeout(running);
      timers.set(
        passageId,
        setTimeout(() => {
          timers.delete(passageId);
          if (jobQueueRef.current.some((job) => job.id === passageId)) return;
          const giveUp = new Error(ANALYSIS_CONFIRM_FAILED_MESSAGE);
          updateQueueItem(setLocalQueue, passageId, (item) =>
            item.status === "analyzing"
              ? applyAnalysisJobError(clearPreview(item), giveUp)
              : item,
          );
          notifyJobsChanged();
        }, TRUNCATED_CONFIRM_WINDOW_MS),
      );
    },
    [notifyJobsChanged, setLocalQueue],
  );

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
          // 절단·타임아웃은 실패가 아니다 — 카드를 붙잡고 판정을 폴링에
          // 넘긴다(RCA RC-2 처방 #7·#8).
          if (err instanceof AnalysisStreamTruncated) {
            applyStreamTruncation(passage.id);
            return;
          }
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
    [applyStreamTruncation, notifyJobsChanged, setLocalQueue],
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

      // 첫 402(잔액 부족) 이후의 지문은 요청조차 보내지 않는다 — 잔액 0 에서 13지문을
      // 발사하면 13개 요청이 전부 402 로 돌아오던 낭비·소음 차단(26-09-08 전수조사).
      let stoppedBy402: AnalysisInsufficientCredits | null = null;
      void runWithConcurrency(
        prepared,
        ANALYSIS_FAST_BATCH_CONCURRENCY,
        async ({ passage, promptConfig }) => {
          try {
            if (stoppedBy402) {
              throw new Error(
                `크레딧 부족으로 시작하지 않았어요 (보유 ${stoppedBy402.balance})`,
              );
            }
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
            // 절단·타임아웃은 실패가 아니다 — 카드를 붙잡고 판정을 폴링에
            // 넘긴다(RCA RC-2 처방 #7·#8). throw 는 그대로 둔다:
            // runWithConcurrency 가 항목마다 try/catch 로 감싸
            // PromiseSettledResult 로만 수집하므로 다른 지문 발사에 전파되지
            // 않고(RCA §2-B 12), 호출부는 그 결과 배열을 읽지 않는다.
            if (err instanceof AnalysisStreamTruncated) {
              applyStreamTruncation(passage.id);
              throw err;
            }
            if (err instanceof AnalysisInsufficientCredits && !stoppedBy402) {
              stoppedBy402 = err;
            }
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
    [applyStreamTruncation, notifyJobsChanged, setLocalQueue],
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
          // 절단·타임아웃은 실패가 아니다 — 카드를 붙잡고 판정을 폴링에
          // 넘긴다(RCA RC-2 처방 #7·#8).
          if (err instanceof AnalysisStreamTruncated) {
            applyStreamTruncation(passageId);
            return;
          }
          updateQueueItem(setLocalQueue, passageId, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
          );
          updateQueueItem(setJobQueue, passageId, (item) =>
            applyAnalysisJobError(clearPreview(item), err),
          );
          notifyJobsChanged();
        });
    },
    [applyStreamTruncation, notifyJobsChanged, queue, setLocalQueue],
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
