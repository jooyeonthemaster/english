"use client";

// ============================================================================
// 문제 생성 경로 지도 (26-07-14 정리) — 새 생성 경로를 만들면 이 지도를 갱신하고,
// 반드시 mergeTeacherPointsIntoTypeSettings 로 "포인트 짚어주기"를 배선할 것.
//
// ① 워크스페이스/지문 모달 생성(주 경로): use-workspace-generation.ts
//    - 카드 푸터 "다음으로" · 지문별 생성 모달 CTA · 워크스페이스 일괄 생성 전부.
//    - teacherPoints 머지 배선됨(변형본 재바인딩 시 원본 id 폴백 포함).
// ② 내 지문함 일괄 생성(보조 경로): 이 파일의 handleBatchGenerate
//    - 워크스페이스 비활성 상태에서 지문 체크 → 우측 패널 하단 버튼.
//    - teacherPoints 머지 배선됨.
// ③ (구) handleGenerate 단일 지문 경로는 ①로 대체되어 26-07-14 제거됨.
//
// 이 파일은 경로 ②와, 모든 경로가 공유하는 유틸(createFastQuestionGenerationJob·
// buildOptimisticItem·mergeTeacherPointsIntoTypeSettings 등)을 담는다.
// ============================================================================

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  type PassageItem,
  type QueueItem,
  typeLabel,
  buildQuestionText,
} from "./generate-page-types";
import {
  mergeQuestionGenerationPlanTag,
  normalizeQuestionGenerationPlan,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import {
  getEffectiveQuestionTypeGenerationPlan,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  clampTeacherPoints,
  type TeacherPoint,
  type TeacherPointPayload,
} from "./generation-config-panel-parts/point-picker-config";
import { useTaskQueue } from "@/components/workbench/task-queue";
import {
  nextGenerationRunToken,
  scheduleFastGeneration,
} from "./fast-generation-scheduler";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { resolveSelectionToPassageIds } from "@/lib/extraction/resolve-draft-selection";

function readFastBatchConcurrency(): number {
  const raw = process.env.NEXT_PUBLIC_WORKBENCH_FAST_BATCH_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(5, Math.floor(parsed)));
}

export const FAST_BATCH_CONCURRENCY = readFastBatchConcurrency();

interface UseGenerationHandlersParams {
  passages: PassageItem[];
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  genMode: "manual" | "set";
  generationPlan: QuestionGenerationPlan;
  typeCounts: Record<string, number>;
  setTypeCounts: Dispatch<SetStateAction<Record<string, number>>>;
  activeTypes: string[];
  difficulty: string;
  customPrompt: string;
  questionTypeSettings: QuestionTypeGenerationSettings;
  /**
   * 지문별 "포인트 짚어주기" 선택(선택 주입) — passageId → typeId → TeacherPoint[].
   * 있으면 생성 요청의 questionTypeSettings[typeId] 에 wire 형태(teacherPoints)로
   * 머지된다(point-picker-design.md §2). 기존 호출부는 생략해도 동작 동일.
   */
  teacherPointsByPassage?: Record<string, Record<string, TeacherPoint[]>>;
  selectedPassage: PassageItem | null;
  analysisData: any;
  totalQuestions: number;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  reviewItem: QueueItem | null;
  setReviewModalId: (v: string | null) => void;
  loadSavedQuestions: () => void;
  onGenerationCompleted?: () => void;
  /** 검수 전 자료를 승격해 생성한 직후 '내 지문' 목록을 새로고침(선택). */
  loadPassages?: () => Promise<void> | void;
}

/**
 * 교사 지정 포인트를 해당 유형의 세부설정에 wire 형태로 머지한다(스펙 §2).
 * clampTeacherPoints(클라 캡 = 서버 클램프 단일 규칙)로 최대 12개까지 자른 뒤
 * {text, unit, tag?, note?} 만 싣는다 — 오프셋(sentenceIndex/start/end)은
 * 클라 전용·서버 미신뢰라 전송에서 제외한다. 포인트가 없거나 전부 드롭되면
 * 원래 설정을 그대로 반환한다(요청 스키마 무변경).
 */
export function mergeTeacherPointsIntoTypeSettings(
  typeId: string,
  typeSettings: unknown,
  points: readonly TeacherPoint[] | undefined,
): unknown {
  if (!points || points.length === 0) return typeSettings;
  const clamped = clampTeacherPoints(typeId, typeSettings, points);
  if (clamped.length === 0) return typeSettings;
  const teacherPoints: TeacherPointPayload[] = clamped.map((point) => ({
    text: point.text,
    unit: point.unit,
    ...(point.tag !== undefined ? { tag: point.tag } : {}),
    ...(point.note !== undefined ? { note: point.note } : {}),
  }));
  const base =
    typeSettings && typeof typeSettings === "object"
      ? (typeSettings as Record<string, unknown>)
      : {};
  return { ...base, teacherPoints };
}

function readQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags))
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

export async function createQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  questionTypeSettings,
  difficulty,
  customPrompt,
  generationPlan,
}: {
  passageId: string;
  mode: "MANUAL";
  count: number;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
}) {
  const res = await fetch("/api/workbench/ai-jobs/question-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      mode,
      count,
      questionType,
      questionTypeSettings,
      difficulty,
      customPrompt,
      generationPlan,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "문제 생성 작업을 시작하지 못했습니다.");
  }
  return data.jobId as string;
}

export async function createFastQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  questionTypeSettings,
  difficulty,
  customPrompt,
  generationPlan,
  variantIndex,
  variantCount,
  clientTempId,
}: {
  passageId: string;
  mode: "MANUAL";
  count: 1;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
  /** 같은 유형 N개 병렬 생성 중 몇 번째인지 — 서버 다양성(타깃/정답 위치 분산)용 */
  variantIndex?: number;
  variantCount?: number;
  /** 낙관적 temp 의 id — 서버 config 에 저장됐다 DB 폴링 때 되읽어 temp↔DB 1:1 매칭. */
  clientTempId?: string;
}) {
  const res = await fetch("/api/workbench/ai-jobs/question-generation/fast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      passageId,
      mode,
      count,
      questionType,
      questionTypeSettings,
      difficulty,
      customPrompt,
      generationPlan,
      variantIndex,
      variantCount,
      clientTempId,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(
      data.details || data.error || "Question generation failed.",
    );
  }
  return data as {
    jobId: string;
    status: "COMPLETED";
    questions: any[];
    questionIds?: string[];
    createdAt?: string;
    debugTiming?: Record<string, number>;
  };
}

// ── md-stream (빈칸·어법 마크다운 원큐 스트리밍) ─────────────────────────────
// 적격 요청은 md-stream 라우트로 보내 사고/본문 델타를 실시간 미리보기로 흘리고,
// 부적격(서버 400 MD_STREAM_INELIGIBLE)·네트워크 선실패는 fast 로 폴백한다.
// 서버가 적격성의 최종 권위다 — 클라 검사는 빠른 우회용 최소 집합만 본다.

const MD_STREAM_TYPES = new Set(["BLANK_INFERENCE", "GRAMMAR_ERROR"]);

export interface MdStreamPreview {
  phase: "thinking" | "generating";
  startedAt: number;
  outputStartedAt?: number;
  tail: string;
}

class MdStreamIneligibleError extends Error {
  constructor() {
    super("md-stream ineligible");
    this.name = "MdStreamIneligibleError";
  }
}

export function isMdStreamEligible(
  questionType?: string,
  questionTypeSettings?: unknown,
  generationPlan?: QuestionGenerationPlan,
): boolean {
  if (process.env.NEXT_PUBLIC_QGEN_MD_STREAM === "off") return false;
  // 26-07-22 프리미엄 md 승차(O213): 빈칸·어법은 PREMIUM 도 같은 md 원큐 구조로
  // 간다 — 차이는 서버가 플랜별 모델(PREMIUM_QGEN_MODEL_ID, 기본 flash3)을 갈아
  // 끼우는 것뿐. 단일상품 모드에서는 resolveEffectiveGenerationPlan 이 STANDARD
  // 로 클램프하므로 이 분기 자체가 무의미(무회귀).
  void generationPlan;
  if (!questionType || !MD_STREAM_TYPES.has(questionType)) return false;
  // 26-07-23: 교사 지정 포인트(포인트 짚어주기)도 md 레인 적격 — 서버가 fast
  // 동일 계약(클램프+축자 필터)으로 프롬프트 강제 + 결정론 준수 게이트를 건다.
  // (기존엔 여기서 제외돼 fast 로 빠지면서 스트리밍이 사라졌다 — 실사용 지적.)
  void questionTypeSettings;
  return true;
}

async function createMdStreamQuestionGenerationJob({
  passageId,
  mode,
  count,
  questionType,
  questionTypeSettings,
  difficulty,
  customPrompt,
  generationPlan,
  variantIndex,
  variantCount,
  clientTempId,
  onPreview,
  onServerAck,
}: {
  passageId: string;
  mode: "MANUAL";
  count: 1;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
  variantIndex?: number;
  variantCount?: number;
  clientTempId?: string;
  onPreview?: (preview: MdStreamPreview) => void;
  /** 서버 프레임을 하나라도 수신하면 호출 — 이후엔 절대 fast 폴백 금지(이중 과금 차단). */
  onServerAck?: () => void;
}) {
  const res = await fetch(
    "/api/workbench/ai-jobs/question-generation/md-stream",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        passageId,
        mode,
        count,
        questionType,
        questionTypeSettings,
        difficulty,
        customPrompt,
        generationPlan,
        variantIndex,
        variantCount,
        clientTempId,
      }),
      // 서버 무응답·저장단 hang 시 전역 동시성 슬롯이 무기한 점유되지 않게 상한.
      signal: AbortSignal.timeout(320_000),
    },
  );
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    if (data?.code === "MD_STREAM_INELIGIBLE") {
      throw new MdStreamIneligibleError();
    }
    throw new Error(
      data.details || data.error || "Question generation failed.",
    );
  }
  const startedAt = Date.now();
  let outputStartedAt: number | undefined;
  let reasoningTail = "";
  let contentTail = "";
  let lastEmit = 0;
  const emitPreview = (force = false) => {
    if (!onPreview) return;
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    onPreview({
      phase: outputStartedAt ? "generating" : "thinking",
      startedAt,
      outputStartedAt,
      tail: (outputStartedAt ? contentTail : reasoningTail).slice(-420),
    });
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: Record<string, unknown> | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
      // 어떤 프레임이든 수신 = 서버가 요청을 접수(과금 커밋 가능성) — 폴백 금지 신호.
      onServerAck?.();
      if (event.t === "meta") {
        // 첫 델타 전에도 패널을 즉시 띄운다 — 사용자가 "사고 중 0s"부터 본다.
        emitPreview(true);
      } else if (event.t === "r" && typeof event.d === "string") {
        reasoningTail = (reasoningTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "c" && typeof event.d === "string") {
        if (!outputStartedAt) outputStartedAt = Date.now();
        contentTail = (contentTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "retry") {
        // 어법 한정 게이트 반려 재생성(26-07-22) — 패널을 사고 단계로 되감는다.
        outputStartedAt = undefined;
        contentTail = "";
        reasoningTail = `기계 검사 반려 — 재설계 중…\n${String(event.reason ?? "")}`;
        emitPreview(true);
      } else if (event.t === "error") {
        throw new Error(String(event.message ?? "Question generation failed."));
      } else if (event.t === "done") {
        doneResult = event;
      }
    }
  }
  if (!doneResult) {
    // 서버는 이미 저장까지 완료했을 수 있다 — 세션 큐의 DB 폴링이 완료 카드를
    // 복원하므로, 단정적 실패가 아니라 확인 안내로 표면화한다.
    throw new Error(
      "생성 스트림이 중간에 끊겼습니다. 완료 여부는 잠시 후 생성 목록에서 자동으로 반영됩니다.",
    );
  }
  return doneResult as {
    jobId: string;
    status: "COMPLETED";
    questions: any[];
    questionIds?: string[];
    createdAt?: string;
    completedAt?: string;
    debugTiming?: Record<string, number>;
  };
}

/**
 * 스마트 라우팅 — 적격이면 md-stream(실시간 미리보기), 아니면 기존 fast.
 * 폴백 규칙: ①서버 부적격 400 ②첫 이벤트 수신 전 네트워크 실패(TypeError)만
 * fast 로 넘어간다. 그 외 오류는 서버가 이미 잡 실패·환불 처리했으므로 그대로
 * 표면화한다(이중 생성·이중 과금 방지).
 */
export async function createQuestionGenerationJobSmart(args: {
  passageId: string;
  mode: "MANUAL";
  count: 1;
  questionType?: string;
  questionTypeSettings?: unknown;
  difficulty: string;
  customPrompt?: string;
  generationPlan: QuestionGenerationPlan;
  variantIndex?: number;
  variantCount?: number;
  clientTempId?: string;
  onPreview?: (preview: MdStreamPreview) => void;
}) {
  if (
    isMdStreamEligible(
      args.questionType,
      args.questionTypeSettings,
      args.generationPlan,
    )
  ) {
    // 이중 과금 차단(적대 검수 수렴 발견): 서버는 크레딧 차감 직후 meta 프레임을
    // 보낸다 — "어떤 프레임이든" 받았다면 서버가 과금·생성을 진행 중일 수 있으므로
    // 그 이후의 실패는 절대 fast 로 폴백하지 않는다. 폴백은 서버 미접수(프레임 0)
    // 상태의 네트워크 선실패(TypeError)로만 한정한다.
    let serverAcked = false;
    try {
      return await createMdStreamQuestionGenerationJob({
        passageId: args.passageId,
        mode: args.mode,
        count: args.count,
        questionType: args.questionType,
        questionTypeSettings: args.questionTypeSettings,
        difficulty: args.difficulty,
        customPrompt: args.customPrompt,
        generationPlan: args.generationPlan,
        variantIndex: args.variantIndex,
        variantCount: args.variantCount,
        clientTempId: args.clientTempId,
        onServerAck: () => {
          serverAcked = true;
        },
        onPreview: args.onPreview,
      });
    } catch (err) {
      const networkPrefail = err instanceof TypeError && !serverAcked;
      if (!(err instanceof MdStreamIneligibleError) && !networkPrefail) {
        throw err;
      }
      // fast 폴백으로 계속.
    }
  }
  return createFastQuestionGenerationJob({
    passageId: args.passageId,
    mode: args.mode,
    count: args.count,
    questionType: args.questionType,
    questionTypeSettings: args.questionTypeSettings,
    difficulty: args.difficulty,
    customPrompt: args.customPrompt,
    generationPlan: args.generationPlan,
    variantIndex: args.variantIndex,
    variantCount: args.variantCount,
    clientTempId: args.clientTempId,
  });
}

export async function runWithConcurrency<T, R>(
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

export function buildOptimisticItem({
  jobId,
  passage,
  analysisData,
  config,
  progressKey,
  createdAt,
}: {
  jobId: string;
  passage: PassageItem;
  analysisData: any;
  config: QueueItem["config"];
  progressKey: string;
  createdAt?: string;
}): QueueItem {
  return {
    id: jobId,
    passageId: passage.id,
    passageTitle: passage.title,
    passageContent: passage.content,
    createdAt: createdAt ?? new Date().toISOString(),
    passageMeta: {
      school: passage.school?.name,
      grade: passage.grade,
      semester: passage.semester,
      unit: passage.unit,
    },
    analysisData,
    status: "generating",
    progress: { [progressKey]: "pending" },
    questions: [],
    config,
  };
}

export function replaceQueueItemInPlace(
  prev: QueueItem[],
  targetIds: string[],
  replacement: QueueItem,
): QueueItem[] {
  const targets = new Set(targetIds);
  const anchor = prev.find((item) => targets.has(item.id));
  const stableReplacement = {
    ...replacement,
    createdAt: anchor?.createdAt ?? replacement.createdAt,
  };

  if (!anchor) {
    return [stableReplacement, ...prev.filter((item) => !targets.has(item.id))];
  }

  let inserted = false;
  const next: QueueItem[] = [];
  for (const item of prev) {
    if (targets.has(item.id)) {
      if (!inserted) {
        next.push(stableReplacement);
        inserted = true;
      }
      continue;
    }
    next.push(item);
  }
  return next;
}

interface ManualGenerationUnit {
  passage: PassageItem;
  questionType: string;
  questionTypeSettings?: unknown;
  tempId: string;
  config: QueueItem["config"];
  /** 같은 지문+유형 배치(N개)에서의 인덱스 — 서버 다양성 분산용 */
  variantIndex: number;
  variantCount: number;
}

export function useGenerationHandlers({
  passages,
  selectedIds,
  setSelectedIds,
  genMode,
  generationPlan,
  typeCounts,
  setTypeCounts,
  activeTypes,
  difficulty,
  customPrompt,
  questionTypeSettings,
  teacherPointsByPassage,
  // selectedPassage·analysisData·totalQuestions 는 (구) handleGenerate 전용이었다.
  // 인터페이스는 호출부 호환을 위해 유지하되 여기서는 더 이상 읽지 않는다.
  setSessionQueue,
  reviewItem,
  setReviewModalId,
  loadSavedQuestions,
  onGenerationCompleted,
  loadPassages,
}: UseGenerationHandlersParams) {
  const { triggerRefresh } = useTaskQueue();

  const toStructuredData = useCallback((q: any) => {
    const typeId = q._typeId || q.subType;
    if (!typeId) return undefined;
    return {
      ...q,
      _typeId: typeId,
      _typeLabel: q._typeLabel || typeLabel(typeId),
    };
  }, []);

  const refreshTaskQueueSoon = useCallback(() => {
    triggerRefresh();
    window.setTimeout(triggerRefresh, 750);
    window.setTimeout(triggerRefresh, 2_000);
    window.setTimeout(triggerRefresh, 4_000);
  }, [triggerRefresh]);

  const runManualUnitsWithFastPath = useCallback(
    async (units: ManualGenerationUnit[]) => {
      if (units.length === 0) {
        return { success: 0, failed: 0 };
      }

      const batchCreatedAt = new Date().toISOString();
      setSessionQueue((prev) => [
        ...units.map((unit) =>
          buildOptimisticItem({
            jobId: unit.tempId,
            passage: unit.passage,
            analysisData: null,
            config: unit.config,
            progressKey: unit.questionType,
            createdAt: batchCreatedAt,
          }),
        ),
        ...prev,
      ]);
      refreshTaskQueueSoon();

      const results = await Promise.allSettled(
        units.map((unit) =>
          scheduleFastGeneration(async () => {
            try {
              const result = await createQuestionGenerationJobSmart({
                passageId: unit.passage.id,
                mode: "MANUAL",
                count: 1,
                questionType: unit.questionType,
                questionTypeSettings: unit.questionTypeSettings,
                difficulty,
                customPrompt: unit.config.prompt || undefined,
                generationPlan,
                variantIndex: unit.variantIndex,
                variantCount: unit.variantCount,
                clientTempId: unit.tempId,
                onPreview: (preview) =>
                  setSessionQueue((prev) =>
                    prev.map((item) =>
                      item.id === unit.tempId
                        ? { ...item, streamPreview: preview }
                        : item,
                    ),
                  ),
              });
              const doneItem = {
                ...buildOptimisticItem({
                  jobId: result.jobId,
                  passage: unit.passage,
                  analysisData: null,
                  config: unit.config,
                  progressKey: unit.questionType,
                }),
                createdAt: result.createdAt || new Date().toISOString(),
                status: "done" as const,
                progress: { [unit.questionType]: "done" as const },
                questions: Array.isArray(result.questions)
                  ? result.questions
                  : [],
                questionIds: Array.isArray(result.questionIds)
                  ? result.questionIds
                  : [],
              };
              setSessionQueue((prev) =>
                replaceQueueItemInPlace(
                  prev,
                  [unit.tempId, result.jobId],
                  doneItem,
                ),
              );
              return result;
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Question generation failed.";
              setSessionQueue((prev) =>
                prev.map((item) =>
                  item.id === unit.tempId
                    ? {
                        ...item,
                        status: "error" as const,
                        progress: { [unit.questionType]: "error" as const },
                        error: message,
                      }
                    : item,
                ),
              );
              throw err;
            }
          }),
        ),
      );

      return {
        success: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
      };
    },
    [difficulty, generationPlan, refreshTaskQueueSoon, setSessionQueue],
  );

  const enqueueJob = useCallback(
    async ({
      passage,
      mode,
      count,
      questionType,
      questionTypeSettings,
      pAnalysis,
      config,
      progressKey,
    }: {
      passage: PassageItem;
      mode: "MANUAL";
      count: number;
      questionType?: string;
      questionTypeSettings?: unknown;
      pAnalysis: any;
      config: QueueItem["config"];
      progressKey: string;
    }) => {
      const jobId = await createQuestionGenerationJob({
        passageId: passage.id,
        mode,
        count,
        questionType,
        questionTypeSettings,
        difficulty,
        customPrompt: config.prompt || undefined,
        generationPlan,
      });
      setSessionQueue((prev) => [
        buildOptimisticItem({
          jobId,
          passage,
          analysisData: pAnalysis,
          config,
          progressKey,
        }),
        ...prev,
      ]);
      refreshTaskQueueSoon();
      return jobId;
    },
    [difficulty, generationPlan, refreshTaskQueueSoon, setSessionQueue],
  );

  const handleBatchGenerate = useCallback(async () => {
    if (selectedIds.size === 0) return;
    let selectedPassages = passages.filter((p) => selectedIds.has(p.id));

    // 검수 전 자료(미승격 draft)는 실제 지문으로 승격한 뒤 생성한다.
    if (selectedPassages.some((p) => isDraftPseudoId(p.id))) {
      const { resolvedById, failedCount } = await resolveSelectionToPassageIds(
        selectedPassages.map((p) => p.id),
      );
      selectedPassages = selectedPassages
        .map((p) => {
          const realId = resolvedById[p.id];
          if (!realId) return null;
          return isDraftPseudoId(p.id)
            ? { ...p, id: realId, source: null, extractionReviewDraft: null }
            : p;
        })
        .filter(Boolean) as PassageItem[];
      if (failedCount > 0) {
        toast.warning(`${failedCount}개 자료는 지문으로 준비하지 못해 제외했어요.`);
      }
      if (selectedPassages.length === 0) return;
      void loadPassages?.();
    }

    if (genMode === "manual") {
      const units: ManualGenerationUnit[] = [];
      const runId = nextGenerationRunToken();

      for (const p of selectedPassages) {
        for (const typeId of Object.keys(typeCounts).filter(
          (k) => typeCounts[k] > 0,
        )) {
          const repeatCount = Math.max(
            0,
            Math.floor(Number(typeCounts[typeId]) || 0),
          );
          // 교사 지정 포인트는 지문 스코프로 조회해 wire 형태로 머지(스펙 §2).
          const unitTypeSettings = mergeTeacherPointsIntoTypeSettings(
            typeId,
            questionTypeSettings[typeId],
            teacherPointsByPassage?.[p.id]?.[typeId],
          );
          // 유형별 플랜 오버라이드(이원 티어 복귀, 26-07-22): 서버는 요청
          // 플랜만 진실원으로 삼고 유형별 저장 설정은 읽지 않으므로(좀비 설정
          // 함정 차단 — fast 라우트 주석), 유닛 디스패치 시점에 유형별 지정을
          // 요청 플랜으로 해석해 싣는다. 요금(2배)·모델 라우팅이 이 값을 따른다.
          const unitGenerationPlan = getEffectiveQuestionTypeGenerationPlan(
            questionTypeSettings,
            typeId,
            generationPlan,
          );
          for (let index = 0; index < repeatCount; index += 1) {
            units.push({
              passage: p,
              questionType: typeId,
              questionTypeSettings: unitTypeSettings,
              tempId: `fast:${p.id}:${typeId}:${runId}:${index}`,
              variantIndex: Math.min(index, 99),
              variantCount: Math.min(repeatCount, 99),
              config: {
                typeCounts: { [typeId]: 1 },
                questionTypeSettings: {
                  [typeId]: unitTypeSettings,
                },
                difficulty,
                prompt: customPrompt.trim(),
                mode: genMode,
                generationPlan: unitGenerationPlan,
              },
            });
          }
        }
      }

      // Generation has started — clear the configured type counts so the
      // panel is a fresh slate for the next batch. `units` already captured
      // the counts, so the in-flight generation is unaffected.
      setTypeCounts({});

      const { success, failed } = await runManualUnitsWithFastPath(units);

      setSelectedIds(new Set());
      triggerRefresh();
      if (success > 0) onGenerationCompleted?.();
      if (success > 0) {
        toast.success(
          `${success}\uac1c \ubb38\uc81c\uac00 \uc0dd\uc131\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`,
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed}\uac1c \ubb38\uc81c \uc0dd\uc131\uc774 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.`,
        );
      }
      return;
    }

    // 자동 생성 모드 제거 — 라이브러리 직접 선택 배치 생성은 '유형 지정'만
    // 지원한다. ('set'/장문 세트는 워크스페이스 흐름에서만 동작.)
  }, [
    selectedIds,
    passages,
    genMode,
    generationPlan,
    typeCounts,
    setTypeCounts,
    questionTypeSettings,
    teacherPointsByPassage,
    difficulty,
    customPrompt,
    activeTypes,
    enqueueJob,
    setSelectedIds,
    setSessionQueue,
    loadSavedQuestions,
    loadPassages,
    refreshTaskQueueSoon,
    runManualUnitsWithFastPath,
    triggerRefresh,
    onGenerationCompleted,
  ]);

  // (구) handleGenerate — 단일 선택 지문(selectedPassage) 생성 경로는 워크스페이스
  // 흐름(useWorkspaceGeneration)으로 대체되어 호출부가 사라졌고, 26-07-14 포인트
  // 배선 정리 때 죽은 코드로 확인되어 제거했다.

  const handleSaveQuestions = useCallback(
    async (questions: any[]) => {
      if (!reviewItem) return;
      try {
        const { saveGeneratedQuestions } = await import("@/actions/workbench");
        const questionsToSave = questions.map((q: any) => {
          const plan = normalizeQuestionGenerationPlan(
            q?._generationPlan ??
              reviewItem.config.generationPlan ??
              generationPlan,
          );
          const tags = mergeQuestionGenerationPlanTag(
            readQuestionTags(q?.tags),
            plan,
          );
          const enriched = { ...q, _generationPlan: plan, tags };
          return {
            passageId: reviewItem.passageId,
            type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
            subType: q._typeId || q.subType || null,
            questionText: buildQuestionText(q),
            structuredData: toStructuredData(enriched),
            options: Array.isArray(q.options) ? q.options : undefined,
            correctAnswer: q.correctAnswer || q.modelAnswer || "",
            points: 1,
            difficulty: q.difficulty || "INTERMEDIATE",
            tags,
            aiGenerated: true,
            explanation:
              typeof q.explanation === "string" ? q.explanation : undefined,
            keyPoints: Array.isArray(q.keyPoints) ? q.keyPoints : undefined,
            wrongOptionExplanations:
              q.wrongOptionExplanations &&
              typeof q.wrongOptionExplanations === "object" &&
              !Array.isArray(q.wrongOptionExplanations)
                ? q.wrongOptionExplanations
                : undefined,
          };
        });

        const result = await saveGeneratedQuestions(questionsToSave);
        if (result.success) {
          toast.success("문제관리에 저장되었습니다.");
          setSessionQueue((prev) =>
            prev.map((item) =>
              item.id === reviewItem.id
                ? { ...item, status: "reviewed" }
                : item,
            ),
          );
          setReviewModalId(null);
          loadSavedQuestions();
        } else {
          toast.error(result.error || "저장 실패");
        }
      } catch {
        toast.error("저장 중 오류가 발생했습니다.");
      }
    },
    [
      generationPlan,
      reviewItem,
      toStructuredData,
      setSessionQueue,
      setReviewModalId,
      loadSavedQuestions,
    ],
  );

  // ── 실패한 생성 다시 시도 — 그 카드에 저장된 config(같은 조건)로 재실행 ──
  // 현재 패널 설정이 아니라 item.config 의 난이도·플랜·유형·프롬프트를 그대로 쓴다.
  const retryGeneration = useCallback(
    async (item: QueueItem) => {
      const config = item.config;
      const passage: PassageItem =
        passages.find((p) => p.id === item.passageId) ??
        ({
          id: item.passageId,
          title: item.passageTitle,
          content: item.passageContent,
          school: item.passageMeta?.school
            ? { name: item.passageMeta.school }
            : undefined,
          grade: item.passageMeta?.grade ?? null,
          semester: item.passageMeta?.semester ?? null,
          unit: item.passageMeta?.unit ?? null,
        } as unknown as PassageItem);

      const typeId = Object.keys(config.typeCounts).find(
        (t) => Number(config.typeCounts[t]) > 0,
      );
      // 자동 생성 제거 — 재시도는 항상 '유형 지정'(MANUAL) 으로 동작한다.
      const progressKey = typeId ?? "manual";
      const plan = config.generationPlan ?? generationPlan;

      // 실패 카드를 그 자리에서 '생성 중'으로 되돌린다(같은 id 유지).
      setSessionQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? buildOptimisticItem({
                jobId: item.id,
                passage,
                analysisData: item.analysisData,
                config,
                progressKey,
                createdAt: item.createdAt,
              })
            : q,
        ),
      );

      try {
        const result = await createQuestionGenerationJobSmart({
          passageId: passage.id,
          mode: "MANUAL",
          count: 1,
          questionType: typeId,
          questionTypeSettings: typeId
            ? (config.questionTypeSettings as
                | Record<string, unknown>
                | undefined)?.[typeId]
            : undefined,
          difficulty: config.difficulty,
          customPrompt: config.prompt?.trim() || undefined,
          generationPlan: plan,
          clientTempId: item.id,
          onPreview: (preview) =>
            setSessionQueue((prev) =>
              prev.map((q) =>
                q.id === item.id ? { ...q, streamPreview: preview } : q,
              ),
            ),
        });
        const doneItem: QueueItem = {
          ...buildOptimisticItem({
            jobId: result.jobId,
            passage,
            analysisData: item.analysisData,
            config,
            progressKey,
          }),
          createdAt: result.createdAt || new Date().toISOString(),
          status: "done",
          progress: { [progressKey]: "done" },
          questions: Array.isArray(result.questions) ? result.questions : [],
          questionIds: Array.isArray(result.questionIds)
            ? result.questionIds
            : [],
        };
        setSessionQueue((prev) =>
          replaceQueueItemInPlace(prev, [item.id, result.jobId], doneItem),
        );
        triggerRefresh();
        onGenerationCompleted?.();
        toast.success("다시 생성했습니다.");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Question generation failed.";
        setSessionQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: "error",
                  progress: { [progressKey]: "error" },
                  error: message,
                }
              : q,
          ),
        );
        toast.error("다시 생성에 실패했습니다.");
      }
    },
    [
      passages,
      generationPlan,
      setSessionQueue,
      triggerRefresh,
      onGenerationCompleted,
    ],
  );

  return {
    handleBatchGenerate,
    handleSaveQuestions,
    retryGeneration,
  };
}
