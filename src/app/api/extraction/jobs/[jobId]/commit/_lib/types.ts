import type { Prisma } from "@prisma/client";
import type {
  M1CommitRequest,
  M2CommitRequest,
} from "@/lib/extraction/zod-schemas";

// Commit-time error codes — keep colocated so the tests and the client can
// assert against a single source of truth.
export const ERR_NOT_IMPLEMENTED = "NOT_IMPLEMENTED";
export const ERR_CROSS_TENANT = "CROSS_TENANT_ITEM_CONFLICT";
export const ERR_PROMOTE_ITEM_MISSING = "PROMOTE_ITEM_MISSING";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TxClient = Prisma.TransactionClient;

export type SourceMaterialMeta = NonNullable<M1CommitRequest["sourceMaterial"]>;

export type PassageInput = M1CommitRequest["passages"][number];
export type QuestionInput = M2CommitRequest["questions"][number];

export interface JobLike {
  id: string;
  academyId: string;
  createdById: string;
  originalFileName: string | null;
  originalFileUrl: string | null;
  sourceMaterialId: string | null;
  status: string;
}

export interface CommitSummary {
  createdPassageIds: string[];
  createdQuestionIds: string[];
  createdBundleIds: string[];
  createdExamId: string | null;
  sourceMaterialId: string | null;
  collectionId: string | null;
  examCollectionId: string | null;
  /**
   * Ids of existing Passage rows that were *reused* (not overwritten) on
   * re-commit because `overwriteExisting` was false/omitted. The UI should
   * surface this list as "kept your edits".
   */
  skippedPassageIds: string[];
  /** Same as skippedPassageIds but for Question rows. */
  skippedQuestionIds: string[];
  warning?: "DUPLICATE_SOURCE_MATERIAL";
}

// ─── Transaction timeouts ───────────────────────────────────────────────────
// M4 commits span: N passages + N questions + bundles + exam + two collections
// Default $transaction timeout (5s) is dangerously tight for N > ~20, so we
// widen it across every commit path. maxWait gives callers a bit more slack
// before Postgres starts rejecting the transaction start.
const TX_TIMEOUT_MS = 30_000;
const TX_MAX_WAIT_MS = 5_000;
export const TX_OPTIONS = { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS } as const;

// ─── Domain error helpers ───────────────────────────────────────────────────
// Thrown from inside $transaction callbacks to bubble up as a 400 response.
// The outer catch converts CommitPayloadError → errorResponse().
export class CommitPayloadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CommitPayloadError";
  }
}

/**
 * Signals that the requested commit mode is structurally valid (Zod accepted
 * it) but the server-side commit path has not been implemented yet. Surfaced
 * as `501 Not Implemented` so clients can distinguish "bad request" (400)
 * from "server doesn't do this yet". Currently thrown for M3 (EXPLANATION).
 */
export class CommitNotImplementedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommitNotImplementedError";
  }
}

export interface RouteContext {
  params: Promise<{ jobId: string }>;
}
