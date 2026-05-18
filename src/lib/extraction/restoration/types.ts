import type { ProblemEvidenceResponse } from "../problem-evidence/schemas";
import type { RestorationQuestionInput } from "../_shared/types";

export type { RestorationQuestionInput };

export interface SourceMatchInput {
  title: string;
  sourceType: string;
  confidence: number;
  reason: string;
  content?: string;
  sourceId?: string;
  sourceRef?: string;
  publisher?: string;
  unit?: string;
  year?: number;
  metadata?: Record<string, unknown>;
}

export interface BuildRestorationPromptInput {
  problemText: string;
  questions: RestorationQuestionInput[];
  sourceMatches: SourceMatchInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
}

export interface BuildGroundedRestorationPromptInput {
  problemText: string;
  questions: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
  localSourceMatches?: SourceMatchInput[];
}

export interface BuildGroundedRestorationBatchTask {
  /** Stable per-task id (echoed back by the model). */
  id: string;
  problemText: string;
  questions: RestorationQuestionInput[];
  problemEvidence?: ProblemEvidenceResponse | null;
  localSourceMatches?: SourceMatchInput[];
}

export interface BuildGroundedRestorationBatchPromptInput {
  tasks: BuildGroundedRestorationBatchTask[];
}
