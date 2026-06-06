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
import { checkRestorationQuality } from "../m1-restoration-quality";
import {
  buildSourceMatchInputFromGrounded,
  createWholePassageChange,
} from "./changes";
import { baseMetadata } from "./metadata";
import { stripProblemMarkers } from "./text-utils";
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

  // 크롭-네이티브 재설계 — 로컬 DB 조회(findPassageSourceMatches) 제거. 1슬롯=1지문
  // 자체 크롭 모델에선 "같은 시험지 재추출 캐시"의 가치가 낮고, 복원 호출마다 academy
  // 전체 draft를 키워드 스캔하던 DB 왕복이 병목이었다. 이제 항상 AI 복원으로 직행한다.
  const usableLocalMatches: SourceMatchInput[] = [];

  // ── 단일 AI 복원 호출 ──────────────────────────────────────────────────
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
          localDb: "DISABLED",
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
          localDb: "DISABLED",
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
