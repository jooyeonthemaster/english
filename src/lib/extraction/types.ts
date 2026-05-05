// ============================================================================
// Shared types for the bulk extraction pipeline.
// Kept as plain string-union types (matching the Prisma schema column values)
// so both server and client can use them without a Prisma import.
// ============================================================================

import type { BlockType } from "./block-types";
import type { ExtractionMode } from "./modes";

// Re-exports — consumers can import everything from "@/lib/extraction/types".
export type { BlockType } from "./block-types";
export type { ExtractionMode } from "./modes";

export type ExtractionSourceType = "PDF" | "IMAGES";

export type ExtractionEngine = "direct" | "trigger";

export type ExtractionJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type ExtractionPageStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "DEAD"
  | "SKIPPED";

export type ExtractionResultStatus = "DRAFT" | "REVIEWED" | "SAVED" | "SKIPPED";

/** Error taxonomy — emitted by classifyGeminiError() and consumed by the UI. */
export type ExtractionErrorCode =
  | "GEMINI_AUTH"
  | "GEMINI_RATE_LIMIT"
  | "GEMINI_SERVER"
  | "GEMINI_TIMEOUT"
  | "INVALID_IMAGE"
  | "SAFETY_BLOCKED"
  | "EMPTY_OUTPUT"
  | "STORAGE_FETCH"
  | "INSUFFICIENT_CREDITS"
  | "NETWORK"
  | "PARSE_ERROR"
  | "UNKNOWN";

/** ExtractionItem.status — granular block promotion lifecycle. */
export type ExtractionItemStatus =
  | "DRAFT"
  | "REVIEWED"
  | "PROMOTED"
  | "SKIPPED"
  | "MERGED";

export interface ExtractionErrorClassification {
  code: ExtractionErrorCode;
  retryable: boolean;
  userMessage: string;
}

/** Page slot the UI tracks between "upload" and "processing" states. */
export interface ClientPageSlot {
  pageIndex: number;
  blob: Blob;
  previewUrl: string; // objectURL, revoke on unmount
  bytes: number;
  width: number;
  height: number;
}

/** Server-side snapshot of a job page (returned by GET /jobs/:id). */
export interface JobPageSnapshot {
  pageIndex: number;
  status: ExtractionPageStatus;
  attemptCount: number;
  extractedText: string | null;
  confidence: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  imageUrl: string | null; // signed download URL (may be null if expired)
}

export interface JobSnapshot {
  id: string;
  academyId: string;
  createdById: string;
  sourceType: ExtractionSourceType;
  originalFileName: string | null;
  status: ExtractionJobStatus;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  creditsConsumed: number;
  creditsRefunded: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pages: JobPageSnapshot[];
  /** Extraction mode (M1~M4). Optional for backward compatibility with legacy jobs. */
  mode?: ExtractionMode;
  /** SourceMaterial id once finalized. Null until extraction-finalize runs. */
  sourceMaterialId?: string | null;
}

/** Single extracted passage in the review UI. */
export interface ResultDraft {
  id: string;
  passageOrder: number;
  sourcePageIndex: number[];
  title: string;
  content: string;
  confidence: number | null;
  status: ExtractionResultStatus;
  meta: {
    markerDetected?: boolean;
    mergedFromPages?: number[];
    confidenceNote?: string;
  } | null;
}

/** Server-side snapshot of one ExtractionItem row (review UI feed). */
export interface ExtractionItemSnapshot {
  id: string;
  jobId: string;
  pageId: string | null;
  sourcePageIndex: number[];
  blockType: BlockType;
  groupId: string | null;
  parentItemId: string | null;
  order: number;
  localOrder: number | null;
  title: string | null;
  content: string;
  rawText: string | null;
  questionMeta: Record<string, unknown> | null;
  choiceMeta: Record<string, unknown> | null;
  passageMeta: Record<string, unknown> | null;
  examMeta: Record<string, unknown> | null;
  boundingBox: {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
  confidence: number | null;
  needsReview: boolean;
  status: ExtractionItemStatus;
  /** URN — "Passage:xxx" / "Question:xxx" etc. Null until promoted. */
  promotedTo: string | null;
}

/** Server-side snapshot of a SourceMaterial row. */
export interface SourceMaterialSnapshot {
  id: string;
  academyId: string;
  schoolId: string | null;
  type: string;
  title: string;
  subtitle: string | null;
  subject: string | null;
  grade: number | null;
  semester: string | null;
  year: number | null;
  round: string | null;
  examType: string | null;
  publisher: string | null;
  contentHash: string | null;
}

/** Event payload over SSE stream. */
export type StreamEvent =
  | { type: "snapshot"; job: JobSnapshot }
  | {
      type: "page-update";
      pageIndex: number;
      status: ExtractionPageStatus;
      attemptCount: number;
      extractedText: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      latencyMs: number | null;
    }
  | {
      type: "job-update";
      status: ExtractionJobStatus;
      successPages: number;
      failedPages: number;
      pendingPages: number;
      creditsConsumed: number;
    }
  | { type: "done"; status: ExtractionJobStatus }
  | { type: "error"; message: string };
