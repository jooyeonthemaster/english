import type { Prisma } from "@prisma/client";
import type { ProblemEvidenceResponse } from "@/lib/extraction/problem-evidence";
import type {
  RestorationQuestionInput,
  SourceMatchInput,
} from "@/lib/extraction/restoration";
import type {
  M1RestorationChangeInput,
  M1RestorationStatus,
} from "@/lib/extraction/m1-restoration";

export interface M1PassageRestorationResult {
  restoredText: string;
  status: M1RestorationStatus;
  confidence: number | null;
  changes: M1RestorationChangeInput[];
  warnings: string[];
  metadata: Prisma.InputJsonValue;
  sourceMatches: SourceMatchInput[];
}

export interface RestoreBatchInput {
  academyId: string;
  rawText: string;
  questions?: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
}

/**
 * Progressive-disclosure hook. Fired as soon as a chunk of results becomes
 * ready — Stage-1 LocalDB hits arrive together, then each Stage-2 grounded
 * batch resolves on its own schedule (parallel). Used by `persistM1PassageDrafts`
 * to UPDATE per-passage draft rows the moment their restoration lands, so the
 * teacher UI fills in passages as they complete instead of waiting for the
 * slowest batch.
 *
 * `inputIndices` are positions in the original `inputs` array passed to
 * `restoreM1PassageBatch`; `results[i]` corresponds to `inputs[inputIndices[i]]`.
 */
export interface RestoreBatchCallbacks {
  onBatchComplete?: (
    inputIndices: number[],
    results: M1PassageRestorationResult[],
  ) => void | Promise<void>;
}

export interface PendingGroundedTask {
  index: number;
  taskId: string;
  input: RestoreBatchInput;
  questions: RestorationQuestionInput[];
  problemEvidence: ProblemEvidenceResponse | null;
  usableLocalMatches: SourceMatchInput[];
  pollutedExactLocalMatch: boolean;
  localMatches: SourceMatchInput[];
}

export const LOCAL_DB_EXACT_THRESHOLD = 0.9;
