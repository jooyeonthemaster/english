import {
  buildGroundedRestorationBatchPrompts,
  groundedRestorationBatchResponseSchema,
  type GroundedRestorationBatchItem,
} from "@/lib/extraction/restoration";
import { generateStructuredTextWithTriggerFetch } from "../gemini-ocr";
import { buildFallbackResult } from "./fallback";
import { projectFromBatchItem } from "./project-batch-item";
import type {
  M1PassageRestorationResult,
  PendingGroundedTask,
  RestoreBatchCallbacks,
  RestoreBatchInput,
} from "./types";

// ─── Batched grounded restoration ────────────────────────────────────────────
//
// `restoreM1Passage` 를 N 회 호출하는 대신, localDb 단계는 그대로 per-item 으로
// 돌리되 grounded 단계만 N개 단위 배치로 묶는다. Google Search 도구 과금이
// 호출 수에 비례($0.035/query)하기 때문에 호출 수를 줄이는 게 비용 측면에서
// 가장 큰 효과를 가진다.
//
// 흐름:
//   1. 각 입력에 대해 localDb 매칭을 병렬로 시도. 매칭된 입력은 즉시 결과로
//      확정 (grounded 호출 대상에서 제외).
//   2. 남은 입력들을 BATCH_SIZE 단위로 묶어 batch grounded 호출.
//   3. 응답의 각 result 를 id 로 매핑해서 원래 입력 순서대로 재조립.
//   4. batch 가 실패하면 fallback 으로 각 입력별 regex 기반 복원 결과 반환.

// Gemini Flash 의 per-candidate output token 한계는 generationConfig
// 의 maxOutputTokens 설정과 별개로 8192 로 강제됨 (preview 단계 제약). 한 호출에
// 10 drafts 를 묶으면 평균 ~900 tokens/draft × 10 = ~9K 로 한계 초과 → 응답이
// 잘려서 candidates[0].finishReason="MAX_TOKENS" 로 전체 batch 실패.
// 5 drafts 로 줄이면 평균 ~4.5K 출력 토큰으로 안전 마진 (~8K 한계 대비).
// 호출 수는 25 → 5 회로 늘지만 여전히 single-call 대비 80% 감소.
const BATCH_SIZE = 5;
/**
 * Retry split size when a full BATCH_SIZE call returns empty/failed grounded
 * output. The Gemini Flash per-candidate output cap is model-specific —
 * with the AI-primary + variant-classification prompt the full batch can
 * occasionally bump into that cap and return EMPTY_OUTPUT (finishReason
 * unknown / MAX_TOKENS). Splitting the failed batch into chunks of this size
 * roughly halves the per-call output budget and recovers reliably.
 *
 * 3 = empirically safe under the current prompt: a 5-batch split yields 3+2,
 * both well under the cap. One retry layer only — sub-batches that still
 * fail fall through to the per-task fallback.
 */
const BATCH_RETRY_SPLIT_SIZE = 3;
const BATCH_GROUNDED_CALL_TIMEOUT_MS = 300_000;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function restoreM1PassageBatch(
  inputs: RestoreBatchInput[],
  callbacks?: RestoreBatchCallbacks,
): Promise<M1PassageRestorationResult[]> {
  if (inputs.length === 0) return [];

  const notify = async (
    inputIndices: number[],
    batchResults: M1PassageRestorationResult[],
  ) => {
    if (!callbacks?.onBatchComplete || inputIndices.length === 0) return;
    try {
      await callbacks.onBatchComplete(inputIndices, batchResults);
    } catch {
      /* callback failures must not abort the rest of the pipeline */
    }
  };

  // 크롭-네이티브 재설계 — 로컬 DB 조회(findPassageSourceMatches) 제거. 모든 입력을
  // 곧장 AI 복원(pending)으로 보낸다. 이전엔 입력마다 academy 전체 COMMITTED draft를
  // 키워드 스캔하는 DB 왕복이 있었고(크롭 N개면 N회 병렬), 1슬롯=1지문 자체 크롭
  // 모델에선 "같은 시험지 재추출 캐시"의 가치가 낮아 제거한다.
  const results: (M1PassageRestorationResult | null)[] = new Array(
    inputs.length,
  ).fill(null);
  const pendingTasks: PendingGroundedTask[] = inputs.map((input, index) => ({
    index,
    taskId: `task-${index + 1}`,
    input,
    questions: input.questions ?? [],
    problemEvidence: input.problemEvidence ?? null,
    usableLocalMatches: [],
    pollutedExactLocalMatch: false,
    localMatches: [],
  }));

  // Stage 2: 남은 task 들을 BATCH_SIZE 단위로 묶어서 grounded 호출. Each batch
  // is dispatched in parallel but its onBatchComplete callback fires as soon
  // as that single batch resolves — so the teacher UI sees passages fill in
  // batch-by-batch rather than waiting for the slowest batch.
  const batches = chunkArray(pendingTasks, BATCH_SIZE);

  /**
   * Attempt a single grounded call for `batch`. Returns the parsed items on
   * success, or `null` to signal the caller it should retry. Network / model
   * failures and empty-output (EMPTY_OUTPUT) both return null so the caller
   * can choose to split-retry. Note: a successful call may still return
   * task-level FAILED items inside `batchItems` — those are NOT retried.
   */
  const tryGroundedCall = async (
    batch: PendingGroundedTask[],
  ): Promise<{ items: GroundedRestorationBatchItem[] } | { error: string }> => {
    try {
      const prompts = buildGroundedRestorationBatchPrompts({
        tasks: batch.map((t) => ({
          id: t.taskId,
          problemText: t.input.rawText,
          questions: t.questions,
          problemEvidence: t.problemEvidence,
          localSourceMatches: t.usableLocalMatches,
        })),
      });
      // AI-only batched restoration (no google_search tool). Mirrors the
      // single-call swap above — see _archive/grounded-restoration/README.md.
      const grounded = await generateStructuredTextWithTriggerFetch({
        stage: "passage-restoration",
        systemPrompt: prompts.systemPrompt,
        userPrompt: prompts.userPrompt,
        timeoutInMs: BATCH_GROUNDED_CALL_TIMEOUT_MS,
        schema: groundedRestorationBatchResponseSchema,
      });
      return { items: grounded.object.results };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  /**
   * Apply a batch's items to `results` and notify the caller. Items missing
   * or marked `__FAILED__` fall through to per-task `buildFallbackResult`.
   */
  const applyBatchItems = async (
    batch: PendingGroundedTask[],
    batchItems: GroundedRestorationBatchItem[],
  ) => {
    const itemsById = new Map<string, GroundedRestorationBatchItem>();
    for (const item of batchItems) {
      if (item.id && item.id !== "__FAILED__") itemsById.set(item.id, item);
    }
    const batchIndices: number[] = [];
    const batchResults: M1PassageRestorationResult[] = [];
    for (let ti = 0; ti < batch.length; ti += 1) {
      const task = batch[ti];
      const item = itemsById.get(task.taskId) ?? batchItems[ti] ?? null;
      let projected: M1PassageRestorationResult;
      if (!item || item.id === "__FAILED__") {
        const reason =
          item?.warnings.find((w) => w.startsWith("batch_call_failed")) ??
          "batch_item_missing";
        projected = buildFallbackResult(task, reason);
      } else {
        projected = projectFromBatchItem(task, item);
      }
      results[task.index] = projected;
      batchIndices.push(task.index);
      batchResults.push(projected);
    }
    await notify(batchIndices, batchResults);
  };

  const runBatch = async (batch: PendingGroundedTask[]) => {
    const outcome = await tryGroundedCall(batch);
    if ("items" in outcome) {
      await applyBatchItems(batch, outcome.items);
      return;
    }

    // First call failed (network error / EMPTY_OUTPUT / parse error).
    // If the batch is larger than the retry split size, halve the output
    // budget pressure by splitting and retrying each sub-batch ONCE.
    // 5-task batches become 3+2; sub-batches that still fail fall through
    // to per-task buildFallbackResult below.
    if (batch.length > BATCH_RETRY_SPLIT_SIZE) {
      const subBatches = chunkArray(batch, BATCH_RETRY_SPLIT_SIZE);
      await Promise.all(
        subBatches.map(async (sub) => {
          const subOutcome = await tryGroundedCall(sub);
          if ("items" in subOutcome) {
            await applyBatchItems(sub, subOutcome.items);
            return;
          }
          await applyBatchItems(
            sub,
            sub.map(
              (): GroundedRestorationBatchItem => ({
                id: "__FAILED__",
                sourceMatch: null,
                aiRestoration: {
                  status: "FAILED",
                  method: "FAILED",
                  restoredText: "",
                  confidence: 0,
                  sentences: [],
                  changes: [],
                  unresolvedMarkers: [],
                },
                comparison: null,
                finalRestoredText: "",
                finalStatus: "FAILED",
                finalMethod: "FAILED",
                warnings: [
                  `batch_call_failed: ${subOutcome.error} (after split retry)`,
                ],
              }),
            ),
          );
        }),
      );
      return;
    }

    // Batch already at/under split size — fall through to per-task fallback.
    await applyBatchItems(
      batch,
      batch.map(
        (): GroundedRestorationBatchItem => ({
          id: "__FAILED__",
          sourceMatch: null,
          aiRestoration: {
            status: "FAILED",
            method: "FAILED",
            restoredText: "",
            confidence: 0,
            sentences: [],
            changes: [],
            unresolvedMarkers: [],
          },
          comparison: null,
          finalRestoredText: "",
          finalStatus: "FAILED",
          finalMethod: "FAILED",
          warnings: [`batch_call_failed: ${outcome.error}`],
        }),
      ),
    );
  };

  await Promise.all(batches.map(runBatch));

  return results.map((r, i) =>
    r ??
    buildFallbackResult(
      {
        index: i,
        taskId: `task-${i + 1}`,
        input: inputs[i],
        questions: inputs[i].questions ?? [],
        problemEvidence: inputs[i].problemEvidence ?? null,
        usableLocalMatches: [],
        pollutedExactLocalMatch: false,
        localMatches: [],
      },
      "result_slot_empty",
    ),
  );
}
