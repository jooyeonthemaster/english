import type { Prisma } from "@prisma/client";
import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import {
  buildGroundedRestorationPrompts,
  buildGroundedRestorationBatchPrompts,
  groundedRestorationResponseSchema,
  groundedRestorationBatchResponseSchema,
  type GroundedRestorationResponse,
  type GroundedRestorationBatchItem,
  type RestorationQuestionInput,
  type SourceMatchInput,
} from "@/lib/extraction/m2-restoration";
import {
  buildFallbackM1Restoration,
  hasUnresolvedM1ProblemArtifacts,
  type M1RestorationChangeInput,
  type M1RestorationStatus,
} from "@/lib/extraction/m1-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { generateGroundedStructuredTextWithTriggerFetch } from "./gemini-ocr";
import { findPassageSourceMatches } from "./m2-source-match";

// 통합 호출 — google_search + 별도 AI 복원 + 비교까지 한 번에 하므로 평소
// passage-restoration(120s)보다 여유를 둔다.
const GROUNDED_CALL_TIMEOUT_MS = 180_000;
const LOCAL_DB_EXACT_THRESHOLD = 0.9;

export interface M1PassageRestorationResult {
  restoredText: string;
  status: M1RestorationStatus;
  confidence: number | null;
  changes: M1RestorationChangeInput[];
  warnings: string[];
  metadata: Prisma.InputJsonValue;
  sourceMatches: SourceMatchInput[];
}

function normalizeComparableText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip problem-sheet chunk / referent markers that the AI sometimes leaves
 * behind in restored text. These markers are added by the exam editor on top
 * of the original source passage and must not appear in the "복원문":
 *
 *   - Chunk labels  `(A) / (B) / (C) / (D)` at paragraph starts for ordering
 *     questions (글의 순서).
 *   - Referent markers `(a) / (b) / (c) / (d) / (e)` placed in front of
 *     specific words for 밑줄 친 (a)~(e) 가리키는 대상 / 어휘 questions.
 *
 * Safety net only — the restoration prompt asks the model to remove these on
 * its own. This regex pass is a fallback for when the model leaves them in.
 *
 * Conservative — we keep the surrounding word/punctuation intact, only the
 * parenthesised marker disappears. Whitespace collapses across the removal
 * so we don't introduce double spaces.
 */
function stripProblemMarkers(text: string): string {
  if (!text) return text;
  let cleaned = text;
  // 1) Chunk labels at paragraph starts: `(A)`, `(A) `, `(A)\n` — only
  //    uppercase A~D, only at line start, with optional surrounding spaces.
  //    Doesn't touch `(A)` mid-sentence (rare but possible — e.g. "Group (A)").
  cleaned = cleaned.replace(/(^|\n)[ \t]*\(([A-D])\)[ \t]*/g, "$1");
  // 2) Inline referent markers `(a) word` → `word`. Only lowercase a~e in
  //    parens. We do NOT require a preceding space so it also catches the
  //    "...has(a) been..." style that sometimes shows up. But we DO require
  //    that the surrounding context looks like word boundary so we don't
  //    eat real parenthetical clauses like "(a fact that ...)".
  //    Trick: only strip if the parenthesised letter is followed by a
  //    whitespace or punctuation immediately (i.e. it really is a marker,
  //    not the opening of a clause).
  cleaned = cleaned.replace(/\(([a-e])\)(?=\s|[,.!?:;])/g, "");
  // 3) Collapse the double spaces / orphan newlines this introduces.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/ +(?=\n)/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned;
}

function isPollutedExactSourceMatch(input: {
  rawText: string;
  sourceText: string;
}): boolean {
  if (!hasUnresolvedM1ProblemArtifacts(input.sourceText)) return false;
  return (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.sourceText)
  );
}

function createWholePassageChange(input: {
  rawText: string;
  restoredText: string;
  changeType: string;
  reason: string;
  confidence: number | null;
}): M1RestorationChangeInput[] {
  if (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.restoredText)
  ) {
    return [];
  }
  return [
    {
      sentenceOrder: null,
      before: input.rawText,
      after: input.restoredText,
      changeType: input.changeType,
      reason: input.reason,
      confidence: input.confidence,
    },
  ];
}

function readSelectedSourceMatch(matches: SourceMatchInput[]): SourceMatchInput | null {
  const top = matches[0];
  if (!top?.content || top.confidence < LOCAL_DB_EXACT_THRESHOLD) return null;
  return top;
}

function mapFinalStatus(
  status: GroundedRestorationResponse["finalStatus"],
): M1RestorationStatus {
  if (status === "RESTORED") return "RESTORED";
  if (status === "PARTIAL") return "PARTIAL";
  return "FAILED";
}

function buildSourceMatchInputFromGrounded(
  match: GroundedRestorationResponse["sourceMatch"],
): SourceMatchInput | null {
  if (!match || !match.content?.trim()) return null;
  return {
    title: match.title || match.url || "출처 후보",
    sourceType: "WEB_PAGE",
    confidence: match.confidence,
    reason: match.reason || "Gemini grounded source match",
    content: match.content,
    sourceRef: match.url ?? undefined,
    publisher: match.publisher ?? undefined,
    year: match.year ?? undefined,
    metadata: {
      provider: "GEMINI_GROUNDED_RESTORATION",
      url: match.url ?? null,
    },
  };
}

function baseMetadata(input: {
  method: string;
  stages: Record<string, string>;
  model?: string | null;
  problemEvidence?: ProblemEvidenceResponse | null;
  sourceMatch?: SourceMatchInput | null;
  groundedResponse?: GroundedRestorationResponse | null;
}): Prisma.InputJsonValue {
  return {
    problemEvidence: input.problemEvidence ?? null,
    restoration: {
      pipeline: "m1-grounded-restoration-v1",
      method: input.method,
      stages: input.stages,
      model: input.model ?? null,
      sourceMatch: input.sourceMatch
        ? {
            sourceId: input.sourceMatch.sourceId ?? null,
            sourceType: input.sourceMatch.sourceType,
            sourceRef: input.sourceMatch.sourceRef ?? null,
            title: input.sourceMatch.title,
            confidence: input.sourceMatch.confidence,
            reason: input.sourceMatch.reason,
          }
        : null,
      aiRestoration: input.groundedResponse?.aiRestoration ?? null,
      comparison: input.groundedResponse?.comparison ?? null,
      finalMethod: input.groundedResponse?.finalMethod ?? null,
      finalStatus: input.groundedResponse?.finalStatus ?? null,
    },
  } as Prisma.InputJsonValue;
}

/**
 * Restore one passage group (M1 PASSAGE_ONLY mode).
 *
 * Two-stage pipeline:
 *   1. Local DB lookup — same-academy Passage table keyword search. If the top
 *      candidate ≥ 0.9 and isn't polluted with leftover problem artifacts,
 *      return immediately as RESTORED with that candidate's content. No AI
 *      call.
 *   2. Single grounded restoration call — google_search tool attached, JSON
 *      response, asks the model to perform (a) source matching via search,
 *      (b) AI restoration from problem evidence only, and (c) comparison +
 *      final pick — all in one call. Replaces the previous separate
 *      problem-evidence / source-grounding / AI-restoration calls.
 *   3. On any failure, fall back to the regex-only fallback.
 *
 * `problemEvidence` is now expected to come pre-computed from the 1st-pass
 * OCR response (passed in by the caller). When null, the model is instructed
 * to infer evidence from the raw text on its own — degraded but functional.
 */
export async function restoreM1Passage(input: {
  academyId: string;
  rawText: string;
  questions?: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
}): Promise<M1PassageRestorationResult> {
  const questions = input.questions ?? [];
  const problemEvidence = input.problemEvidence ?? null;

  // ── Stage 1: local DB exact match ───────────────────────────────────────
  const localMatches = await findPassageSourceMatches({
    academyId: input.academyId,
    problemText: input.rawText,
  });
  const selectedLocal = readSelectedSourceMatch(localMatches);
  const pollutedExactLocalMatch =
    selectedLocal?.content &&
    isPollutedExactSourceMatch({
      rawText: input.rawText,
      sourceText: selectedLocal.content,
    });

  if (
    selectedLocal?.content &&
    !pollutedExactLocalMatch &&
    !hasUnresolvedM1ProblemArtifacts(selectedLocal.content)
  ) {
    const restoredText = selectedLocal.content.trim();
    return {
      restoredText,
      status: "RESTORED",
      confidence: selectedLocal.confidence,
      changes: createWholePassageChange({
        rawText: input.rawText,
        restoredText,
        changeType: "source-match",
        reason: "Restored from a near-exact same-academy Passage database match.",
        confidence: selectedLocal.confidence,
      }),
      warnings: [],
      metadata: baseMetadata({
        method: "LOCAL_DB",
        stages: { localDb: "MATCHED", grounded: "SKIPPED_LOCAL_DB_HIT" },
        problemEvidence,
        sourceMatch: selectedLocal,
      }),
      sourceMatches: localMatches,
    };
  }

  // Local matches that survived basic sanity (non-polluted) become hints we
  // pass into the grounded call; the model may quote them but the core source
  // search is the model's google_search call.
  const usableLocalMatches = localMatches.filter((match) => {
    if (!match.content) return true;
    if (hasUnresolvedM1ProblemArtifacts(match.content)) return false;
    return !isPollutedExactSourceMatch({
      rawText: input.rawText,
      sourceText: match.content,
    });
  });

  // ── Stage 2: single grounded restoration call ──────────────────────────
  try {
    const prompts = buildGroundedRestorationPrompts({
      problemText: input.rawText,
      questions,
      problemEvidence,
      localSourceMatches: usableLocalMatches,
    });

    const grounded = await generateGroundedStructuredTextWithTriggerFetch({
      stage: "passage-restoration",
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      timeoutInMs: GROUNDED_CALL_TIMEOUT_MS,
      schema: groundedRestorationResponseSchema,
    });

    const result = grounded.object;
    const groundedSourceMatch = buildSourceMatchInputFromGrounded(
      result.sourceMatch ?? null,
    );

    const allSourceMatches: SourceMatchInput[] = [
      ...usableLocalMatches,
      ...(groundedSourceMatch ? [groundedSourceMatch] : []),
    ].sort((a, b) => b.confidence - a.confidence);

    // Final restored text — prefer the model's own pick. If empty, fall back
    // to whichever investigation produced text.
    const candidateFinal = result.finalRestoredText.trim();
    const candidateAi = result.aiRestoration.restoredText.trim();
    const candidateSource = groundedSourceMatch?.content?.trim() ?? "";
    const restoredText = stripProblemMarkers(
      candidateFinal || candidateSource || candidateAi || input.rawText,
    );

    const unresolvedArtifacts = hasUnresolvedM1ProblemArtifacts(restoredText);
    const status: M1RestorationStatus = unresolvedArtifacts
      ? "PARTIAL"
      : mapFinalStatus(result.finalStatus);

    const aiChanges: M1RestorationChangeInput[] =
      result.aiRestoration.changes.map((change) => ({
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.evidenceType,
        reason: change.reason,
        confidence: change.confidence,
      }));

    const warnings = [
      ...result.warnings,
      ...(unresolvedArtifacts
        ? [
            "Restored text still contains problem-sheet markers; teacher review is required.",
          ]
        : []),
    ];

    const finalMethodLabel =
      result.finalMethod === "SOURCE_MATCH"
        ? groundedSourceMatch
          ? "GROUNDED_SOURCE_MATCH"
          : usableLocalMatches.length > 0
            ? "LOCAL_DB_CANDIDATE"
            : "SOURCE_MATCH"
        : result.finalMethod === "MIXED"
          ? "GROUNDED_MIXED"
          : result.finalMethod === "QUESTION_EVIDENCE"
            ? "AI_RESTORE_FROM_EVIDENCE"
            : "FAILED";

    return {
      restoredText,
      status,
      confidence:
        result.finalMethod === "SOURCE_MATCH" && groundedSourceMatch
          ? groundedSourceMatch.confidence
          : result.aiRestoration.confidence,
      changes:
        aiChanges.length > 0
          ? aiChanges
          : createWholePassageChange({
              rawText: input.rawText,
              restoredText,
              changeType: "grounded-restoration",
              reason: "Restored via grounded single-call pipeline.",
              confidence: result.aiRestoration.confidence,
            }),
      warnings,
      metadata: baseMetadata({
        method: finalMethodLabel,
        stages: {
          localDb:
            usableLocalMatches.length > 0
              ? "CANDIDATES_ONLY"
              : pollutedExactLocalMatch
                ? "POLLUTED_EXACT_MATCH_REJECTED"
                : "NO_MATCH",
          grounded: groundedSourceMatch ? "SOURCE_FOUND" : "NO_SOURCE",
        },
        model: getExtractionAiModelName("passage-restoration"),
        problemEvidence,
        sourceMatch: groundedSourceMatch ?? usableLocalMatches[0] ?? null,
        groundedResponse: result,
      }),
      sourceMatches: allSourceMatches,
    };
  } catch (err) {
    const fallback = buildFallbackM1Restoration(input.rawText);
    const status: M1RestorationStatus =
      fallback.status === "NO_RESTORATION_NEEDED" &&
      hasUnresolvedM1ProblemArtifacts(input.rawText)
        ? "FAILED"
        : fallback.status;
    return {
      restoredText: fallback.restoredText,
      status,
      confidence: status === "FAILED" ? 0 : 0.5,
      changes: fallback.changes,
      warnings: [
        `Grounded restoration failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        ...(status === "FAILED"
          ? [
              "Restoration evidence was insufficient; manual teacher restoration is required.",
            ]
          : []),
      ],
      metadata: baseMetadata({
        method: status === "FAILED" ? "FAILED" : "CODE_FALLBACK",
        stages: {
          localDb:
            usableLocalMatches.length > 0
              ? "CANDIDATES_ONLY"
              : pollutedExactLocalMatch
                ? "POLLUTED_EXACT_MATCH_REJECTED"
                : "NO_MATCH",
          grounded: "FAILED",
        },
        model: getExtractionAiModelName("passage-restoration"),
        problemEvidence,
        sourceMatch: usableLocalMatches[0] ?? null,
      }),
      sourceMatches: usableLocalMatches,
    };
  }
}

// ─── Batched grounded restoration ────────────────────────────────────────────
//
// `restoreM1Passage` 를 N 회 호출하는 대신, localDb 단계는 그대로 per-item 으로
// 돌리되 grounded 단계만 10개 단위 배치로 묶는다. Google Search 도구 과금이
// 호출 수에 비례($0.035/query)하기 때문에 호출 수를 줄이는 게 비용 측면에서
// 가장 큰 효과를 가진다.
//
// 흐름:
//   1. 각 입력에 대해 localDb 매칭을 병렬로 시도. 매칭된 입력은 즉시 결과로
//      확정 (grounded 호출 대상에서 제외).
//   2. 남은 입력들을 BATCH_SIZE 단위로 묶어 batch grounded 호출.
//   3. 응답의 각 result 를 id 로 매핑해서 원래 입력 순서대로 재조립.
//   4. batch 가 실패하면 fallback 으로 각 입력별 regex 기반 복원 결과 반환.

// Gemini 3 Flash Preview 의 per-candidate output token 한계는 generationConfig
// 의 maxOutputTokens 설정과 별개로 8192 로 강제됨 (preview 단계 제약). 한 호출에
// 10 drafts 를 묶으면 평균 ~900 tokens/draft × 10 = ~9K 로 한계 초과 → 응답이
// 잘려서 candidates[0].finishReason="MAX_TOKENS" 로 전체 batch 실패.
// 5 drafts 로 줄이면 평균 ~4.5K 출력 토큰으로 안전 마진 (~8K 한계 대비).
// 호출 수는 25 → 5 회로 늘지만 여전히 single-call 대비 80% 감소.
const BATCH_SIZE = 5;
const BATCH_GROUNDED_CALL_TIMEOUT_MS = 300_000;

interface RestoreBatchInput {
  academyId: string;
  rawText: string;
  questions?: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
}

interface PendingGroundedTask {
  index: number;
  taskId: string;
  input: RestoreBatchInput;
  questions: RestorationQuestionInput[];
  problemEvidence: ProblemEvidenceResponse | null;
  usableLocalMatches: SourceMatchInput[];
  pollutedExactLocalMatch: boolean;
  localMatches: SourceMatchInput[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function projectFromBatchItem(
  task: PendingGroundedTask,
  item: GroundedRestorationBatchItem,
): M1PassageRestorationResult {
  // batch item 을 단일 호출 결과와 동일한 shape 으로 변환한다. 기존 후처리
  // 로직(buildSourceMatchInputFromGrounded / mapFinalStatus / etc) 을 그대로
  // 재활용해 동작 분기를 일관되게 유지.
  const groundedSourceMatch = buildSourceMatchInputFromGrounded(
    item.sourceMatch ?? null,
  );
  const allSourceMatches: SourceMatchInput[] = [
    ...task.usableLocalMatches,
    ...(groundedSourceMatch ? [groundedSourceMatch] : []),
  ].sort((a, b) => b.confidence - a.confidence);

  const candidateFinal = item.finalRestoredText.trim();
  const candidateAi = item.aiRestoration.restoredText.trim();
  const candidateSource = groundedSourceMatch?.content?.trim() ?? "";
  const restoredText = stripProblemMarkers(
    candidateFinal || candidateSource || candidateAi || task.input.rawText,
  );

  const unresolvedArtifacts = hasUnresolvedM1ProblemArtifacts(restoredText);
  const status: M1RestorationStatus = unresolvedArtifacts
    ? "PARTIAL"
    : mapFinalStatus(item.finalStatus);

  const aiChanges: M1RestorationChangeInput[] =
    item.aiRestoration.changes.map((change) => ({
      sentenceOrder: change.sentenceOrder ?? null,
      before: change.before,
      after: change.after,
      changeType: change.evidenceType,
      reason: change.reason,
      confidence: change.confidence,
    }));

  const warnings = [
    ...item.warnings,
    ...(unresolvedArtifacts
      ? [
          "Restored text still contains problem-sheet markers; teacher review is required.",
        ]
      : []),
  ];

  const finalMethodLabel =
    item.finalMethod === "SOURCE_MATCH"
      ? groundedSourceMatch
        ? "GROUNDED_SOURCE_MATCH"
        : task.usableLocalMatches.length > 0
          ? "LOCAL_DB_CANDIDATE"
          : "SOURCE_MATCH"
      : item.finalMethod === "MIXED"
        ? "GROUNDED_MIXED"
        : item.finalMethod === "QUESTION_EVIDENCE"
          ? "AI_RESTORE_FROM_EVIDENCE"
          : "FAILED";

  // batch item 을 GroundedRestorationResponse 모양으로 맞춰서 메타데이터 헬퍼에
  // 전달. id 만 제거하고 동일 shape 임.
  const responseLikeShape: GroundedRestorationResponse = {
    sourceMatch: item.sourceMatch ?? null,
    aiRestoration: item.aiRestoration,
    comparison: item.comparison ?? null,
    finalRestoredText: item.finalRestoredText,
    finalStatus: item.finalStatus,
    finalMethod: item.finalMethod,
    warnings: item.warnings,
  };

  return {
    restoredText,
    status,
    confidence:
      item.finalMethod === "SOURCE_MATCH" && groundedSourceMatch
        ? groundedSourceMatch.confidence
        : item.aiRestoration.confidence,
    changes:
      aiChanges.length > 0
        ? aiChanges
        : createWholePassageChange({
            rawText: task.input.rawText,
            restoredText,
            changeType: "grounded-restoration",
            reason: "Restored via batched grounded pipeline.",
            confidence: item.aiRestoration.confidence,
          }),
    warnings,
    metadata: baseMetadata({
      method: finalMethodLabel,
      stages: {
        localDb:
          task.usableLocalMatches.length > 0
            ? "CANDIDATES_ONLY"
            : task.pollutedExactLocalMatch
              ? "POLLUTED_EXACT_MATCH_REJECTED"
              : "NO_MATCH",
        grounded: groundedSourceMatch ? "SOURCE_FOUND" : "NO_SOURCE",
        batch: "BATCH",
      },
      model: getExtractionAiModelName("passage-restoration"),
      problemEvidence: task.problemEvidence,
      sourceMatch: groundedSourceMatch ?? task.usableLocalMatches[0] ?? null,
      groundedResponse: responseLikeShape,
    }),
    sourceMatches: allSourceMatches,
  };
}

function buildFallbackResult(
  task: PendingGroundedTask,
  reason: string,
): M1PassageRestorationResult {
  const fallback = buildFallbackM1Restoration(task.input.rawText);
  const status: M1RestorationStatus =
    fallback.status === "NO_RESTORATION_NEEDED" &&
    hasUnresolvedM1ProblemArtifacts(task.input.rawText)
      ? "FAILED"
      : fallback.status;
  return {
    restoredText: fallback.restoredText,
    status,
    confidence: status === "FAILED" ? 0 : 0.5,
    changes: fallback.changes,
    warnings: [
      `Batched grounded restoration failed: ${reason}`,
      ...(status === "FAILED"
        ? [
            "Restoration evidence was insufficient; manual teacher restoration is required.",
          ]
        : []),
    ],
    metadata: baseMetadata({
      method: status === "FAILED" ? "FAILED" : "CODE_FALLBACK",
      stages: {
        localDb:
          task.usableLocalMatches.length > 0
            ? "CANDIDATES_ONLY"
            : task.pollutedExactLocalMatch
              ? "POLLUTED_EXACT_MATCH_REJECTED"
              : "NO_MATCH",
        grounded: "FAILED",
        batch: "BATCH_FALLBACK",
      },
      model: getExtractionAiModelName("passage-restoration"),
      problemEvidence: task.problemEvidence,
      sourceMatch: task.usableLocalMatches[0] ?? null,
    }),
    sourceMatches: task.usableLocalMatches,
  };
}

export async function restoreM1PassageBatch(
  inputs: RestoreBatchInput[],
): Promise<M1PassageRestorationResult[]> {
  if (inputs.length === 0) return [];

  // Stage 1: per-input localDb 매칭을 병렬로 실행.
  const stageOne = await Promise.all(
    inputs.map(async (input, index) => {
      const questions = input.questions ?? [];
      const problemEvidence = input.problemEvidence ?? null;
      const localMatches = await findPassageSourceMatches({
        academyId: input.academyId,
        problemText: input.rawText,
      });
      const selectedLocal = readSelectedSourceMatch(localMatches);
      const pollutedExactLocalMatch = Boolean(
        selectedLocal?.content &&
          isPollutedExactSourceMatch({
            rawText: input.rawText,
            sourceText: selectedLocal.content,
          }),
      );
      let immediate: M1PassageRestorationResult | null = null;
      if (
        selectedLocal?.content &&
        !pollutedExactLocalMatch &&
        !hasUnresolvedM1ProblemArtifacts(selectedLocal.content)
      ) {
        const restoredText = selectedLocal.content.trim();
        immediate = {
          restoredText,
          status: "RESTORED",
          confidence: selectedLocal.confidence,
          changes: createWholePassageChange({
            rawText: input.rawText,
            restoredText,
            changeType: "source-match",
            reason:
              "Restored from a near-exact same-academy Passage database match.",
            confidence: selectedLocal.confidence,
          }),
          warnings: [],
          metadata: baseMetadata({
            method: "LOCAL_DB",
            stages: { localDb: "MATCHED", grounded: "SKIPPED_LOCAL_DB_HIT" },
            problemEvidence,
            sourceMatch: selectedLocal,
          }),
          sourceMatches: localMatches,
        };
      }
      const usableLocalMatches = localMatches.filter((match) => {
        if (!match.content) return true;
        if (hasUnresolvedM1ProblemArtifacts(match.content)) return false;
        return !isPollutedExactSourceMatch({
          rawText: input.rawText,
          sourceText: match.content,
        });
      });
      return {
        index,
        immediate,
        pending: immediate
          ? null
          : ({
              index,
              taskId: `task-${index + 1}`,
              input,
              questions,
              problemEvidence,
              usableLocalMatches,
              pollutedExactLocalMatch,
              localMatches,
            } as PendingGroundedTask),
      };
    }),
  );

  const results: (M1PassageRestorationResult | null)[] = new Array(
    inputs.length,
  ).fill(null);
  const pendingTasks: PendingGroundedTask[] = [];
  for (const row of stageOne) {
    if (row.immediate) {
      results[row.index] = row.immediate;
    } else if (row.pending) {
      pendingTasks.push(row.pending);
    }
  }

  if (pendingTasks.length === 0) {
    return results.map(
      (r, i) => r ?? buildFallbackResult(
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
        "no_pending_tasks_filler",
      ),
    );
  }

  // Stage 2: 남은 task 들을 BATCH_SIZE 단위로 묶어서 grounded 호출.
  const batches = chunkArray(pendingTasks, BATCH_SIZE);

  const batchResultsList: GroundedRestorationBatchItem[][] = await Promise.all(
    batches.map(async (batch) => {
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
        const grounded = await generateGroundedStructuredTextWithTriggerFetch({
          stage: "passage-restoration",
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
          timeoutInMs: BATCH_GROUNDED_CALL_TIMEOUT_MS,
          schema: groundedRestorationBatchResponseSchema,
        });
        return grounded.object.results;
      } catch (err) {
        // 이 배치 전체 실패 — 호출자 쪽에서 batch 별로 fallback 처리.
        const message = err instanceof Error ? err.message : String(err);
        return batch.map(
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
            warnings: [`batch_call_failed: ${message}`],
          }),
        );
      }
    }),
  );

  // batch item 들을 task id 로 매핑. 모델이 순서를 어겼거나 id 가 빠진 경우엔
  // 순서 기준 fallback (batch 내 순서).
  for (let bi = 0; bi < batches.length; bi += 1) {
    const batch = batches[bi];
    const batchItems = batchResultsList[bi];
    const itemsById = new Map<string, GroundedRestorationBatchItem>();
    for (const item of batchItems) {
      if (item.id && item.id !== "__FAILED__") itemsById.set(item.id, item);
    }
    for (let ti = 0; ti < batch.length; ti += 1) {
      const task = batch[ti];
      const item = itemsById.get(task.taskId) ?? batchItems[ti] ?? null;
      if (!item || item.id === "__FAILED__") {
        const reason =
          item?.warnings.find((w) => w.startsWith("batch_call_failed")) ??
          "batch_item_missing";
        results[task.index] = buildFallbackResult(task, reason);
        continue;
      }
      results[task.index] = projectFromBatchItem(task, item);
    }
  }

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
