import {
  buildFallbackM1Restoration,
  decideRestorationStatus,
} from "@/lib/extraction/m1-restoration";
import { getExtractionAiModelName } from "@/lib/extraction/model-config";
import { baseMetadata } from "./metadata";
import type {
  M1PassageRestorationResult,
  PendingGroundedTask,
} from "./types";

export function buildFallbackResult(
  task: PendingGroundedTask,
  reason: string,
): M1PassageRestorationResult {
  const fallback = buildFallbackM1Restoration(task.input.rawText);
  const status = decideRestorationStatus({
    rawText: task.input.rawText,
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
      `Batched grounded restoration failed: ${reason}`,
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
