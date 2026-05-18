import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import {
  buildGroundedRestorationPrompts,
  groundedRestorationResponseSchema,
  type RestorationQuestionInput,
  type SourceMatchInput,
} from "@/lib/extraction/restoration";
import {
  buildFallbackM1Restoration,
  decideRestorationStatus,
  hasUnresolvedM1ProblemArtifacts,
  type M1RestorationChangeInput,
} from "@/lib/extraction/m1-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import {
  generateStructuredTextWithTriggerFetch,
  // Grounded variant retained in the codebase but no longer invoked.
  // See _archive/grounded-restoration/README.md for revival instructions.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateGroundedStructuredTextWithTriggerFetch as _grounded_unused,
} from "../gemini-ocr";
import { findPassageSourceMatches } from "../m2-source-match";
import { checkRestorationQuality } from "../m1-restoration-quality";
import {
  buildSourceMatchInputFromGrounded,
  copyCommittedDraftChanges,
  createWholePassageChange,
  readSelectedSourceMatch,
} from "./changes";
import { baseMetadata } from "./metadata";
import {
  isPollutedExactSourceMatch,
  stripProblemMarkers,
} from "./text-utils";
import type { M1PassageRestorationResult } from "./types";

// 통합 호출 — google_search + 별도 AI 복원 + 비교까지 한 번에 하므로 평소
// passage-restoration(120s)보다 여유를 둔다.
const GROUNDED_CALL_TIMEOUT_MS = 180_000;

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
    // DB match is treated as the model's authoritative output. Still run the
    // post-hoc decision so DB rows that happen to equal raw (re-imported
    // identical material) downgrade to NO_RESTORATION_NEEDED instead of
    // being marked as restored.
    const status = decideRestorationStatus({
      rawText: input.rawText,
      restoredText,
      aiFinalStatus: "RESTORED",
    });
    const sourceMatchCard = createWholePassageChange({
      rawText: input.rawText,
      restoredText,
      changeType: "source-match",
      reason: "Restored from a near-exact same-academy committed draft (DB 원본 매칭).",
      confidence: selectedLocal.confidence,
    });
    // Inherit the matched draft's inline change rows so the review side-panel
    // shows the same evidence cards the teacher already vetted on that prior
    // run. sourceId on the SourceMatchInput holds the draft id.
    const sourceDraftId =
      typeof selectedLocal.sourceId === "string" ? selectedLocal.sourceId : null;
    const copiedChanges = sourceDraftId
      ? await copyCommittedDraftChanges(sourceDraftId)
      : [];
    return {
      restoredText,
      status,
      confidence: selectedLocal.confidence,
      changes: [...sourceMatchCard, ...copiedChanges],
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

    // AI-only restoration (no google_search tool). The grounded variant +
    // source matching pipeline lives in _archive/grounded-restoration/. The
    // existing prompt still mentions Investigation A (source lookup) — the
    // model cannot ground without the tool, so it sets sourceMatch=null
    // naturally and Investigation C falls through to "no source" path
    // (emits aiRestoration unchanged, finalMethod=QUESTION_EVIDENCE). Same
    // response schema, simpler downstream — and zero grounding fee / zero
    // RECITATION risk.
    const grounded = await generateStructuredTextWithTriggerFetch({
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
    const quality = checkRestorationQuality({
      rawText: input.rawText,
      restoredText,
      questionTypes: (input.problemEvidence?.questions ?? []).map(
        (q) => q.questionType,
      ),
    });
    const status = decideRestorationStatus({
      rawText: input.rawText,
      restoredText,
      aiFinalStatus: result.finalStatus,
      qualityShouldDowngrade: quality.shouldDowngradeStatus,
    });

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
      ...quality.warnings.map((code) => `restoration_quality:${code}`),
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
    const status = decideRestorationStatus({
      rawText: input.rawText,
      restoredText: fallback.restoredText,
      aiCallFailed: true,
    });
    return {
      restoredText: fallback.restoredText,
      status,
      confidence:
        status === "FAILED"
          ? 0
          : status === "NO_RESTORATION_NEEDED"
            ? 0.6
            : 0.5,
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
        method:
          status === "FAILED"
            ? "FAILED"
            : status === "NO_RESTORATION_NEEDED"
              ? "NO_RESTORATION_NEEDED"
              : "CODE_FALLBACK",
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
