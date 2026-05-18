import type {
  GroundedRestorationBatchItem,
  GroundedRestorationResponse,
  SourceMatchInput,
} from "@/lib/extraction/restoration";
import {
  decideRestorationStatus,
  hasUnresolvedM1ProblemArtifacts,
  type M1RestorationChangeInput,
} from "@/lib/extraction/m1-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { checkRestorationQuality } from "../m1-restoration-quality";
import {
  buildSourceMatchInputFromGrounded,
  createWholePassageChange,
} from "./changes";
import { baseMetadata } from "./metadata";
import { stripProblemMarkers } from "./text-utils";
import type {
  M1PassageRestorationResult,
  PendingGroundedTask,
} from "./types";

export function projectFromBatchItem(
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
  const quality = checkRestorationQuality({
    rawText: task.input.rawText,
    restoredText,
    questionTypes: (task.input.problemEvidence?.questions ?? []).map(
      (q) => q.questionType,
    ),
  });
  const status = decideRestorationStatus({
    rawText: task.input.rawText,
    restoredText,
    aiFinalStatus: item.finalStatus,
    qualityShouldDowngrade: quality.shouldDowngradeStatus,
  });

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
    ...quality.warnings.map((code) => `restoration_quality:${code}`),
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
