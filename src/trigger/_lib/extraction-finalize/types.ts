import type {
  ExtractionItemSnapshot,
  M1RestorationStatus,
} from "@/lib/extraction/types";

export type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export const TERMINAL: readonly JobStatus[] = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;

export interface M1RestorationChange {
  sentenceOrder: number | null;
  before: string;
  after: string;
  changeType: string | null;
  reason: string | null;
  confidence: number | null;
  sourcePageIndex: number[];
}

export interface M1PassageChunk {
  groupId: string | null;
  sourcePageIndex: number[];
  rawText: string;
  restoredText: string;
  restorationStatus: M1RestorationStatus;
  restorationChanges: M1RestorationChange[];
  restorationWarnings: string[];
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
  confidence: number | null;
  boundaryConfidence: number | null;
  /** True if the group contains at least one PASSAGE_BODY block. Listening
   *  problems (수능 영어 1~17번) have only QUESTION_STEM + CHOICE blocks — no
   *  passage exists on the page. We skip the grounded restoration call for
   *  those groups so the model does not hallucinate phantom passages from
   *  the audio script. */
  hasPassageBody: boolean;
  /** Items that belong to this chunk (= the bucket from STEM-led grouping).
   *  Carried forward so downstream callers (buildRestorationQuestions /
   *  buildProblemEvidenceFromItems) can identify the chunk's items by `id`
   *  rather than the legacy PASSAGE-led `groupId` (which is set by
   *  `assignGroupIds` and unrelated to the STEM-led bucket). */
  items: ExtractionItemSnapshot[];
}

export const M1_LOCAL_DB_EXACT_THRESHOLD = 0.9;
