import type { Prisma } from "@prisma/client";
import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import type {
  GroundedRestorationResponse,
  SourceMatchInput,
} from "@/lib/extraction/restoration";

export function baseMetadata(input: {
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
