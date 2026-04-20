// ============================================================================
// Bulk extraction client-side state store (Zustand).
//
// The /passages/import page uses this to coordinate between its sub-panels
// (mode-select → upload → processing → review → done). Keeping it in Zustand
// (vs useState on the page) lets deep child components subscribe selectively
// without prop-drilling.
// ============================================================================

"use client";

import { create } from "zustand";
import type {
  ClientPageSlot,
  ExtractionItemSnapshot,
  ExtractionJobStatus,
  ExtractionPageStatus,
  JobSnapshot,
  ResultDraft,
  SourceMaterialSnapshot,
} from "./types";
import type { ExtractionMode } from "./modes";
import type { ParsedSourceMeta } from "./meta-parser";
import type { EnrichedDraft } from "./segmentation";
import { revokeSlotUrls } from "./pdf-splitter";

/**
 * Result payload returned by `/api/extraction/jobs/:id/commit`.
 *
 * Captured by the review-step right after a successful commit so that the
 * done-step can deep-link into follow-up actions (문제 생성 / 시험 조립 /
 * 반 배포 등) with real entity IDs rather than re-querying. Fields beyond
 * the M1-required pair are reserved for mode-specific commit responses
 * (M2/M4 will populate `createdQuestionIds` / `createdExamId` /
 * `sourceMaterialId`).
 */
export interface LastCommitResult {
  createdPassageIds: string[];
  createdQuestionIds?: string[];
  createdBundleIds?: string[];
  createdExamId?: string | null;
  sourceMaterialId?: string | null;
  collectionId?: string | null;
  /**
   * Server-returned ids for rows that were KEPT (not re-overwritten) because
   * the teacher had already edited them since the last commit. Surfaced as a
   * "유지되었습니다" toast + in the DoneStep hero summary.
   */
  skippedPassageIds?: string[];
  /** Same as `skippedPassageIds` but for Question rows (M2/M4). */
  skippedQuestionIds?: string[];
  /**
   * Upstream warning code. Currently only one value — emitted when the
   * server detects a duplicate SourceMaterial and merges into it instead of
   * creating a fresh one.
   */
  warning?: "DUPLICATE_SOURCE_MATERIAL";
}

export type ExtractionPhase =
  | "mode-select" // first screen — choose M1~M4
  | "idle"
  | "preparing" // splitting PDF / accepting images
  | "uploading" // uploading page blobs to Supabase
  | "starting" // POSTing /start
  | "processing" // SSE is live
  | "reviewing" // user inspects results
  | "committing" // POST /commit in progress
  | "done"
  | "error";

export interface PageRuntime {
  pageIndex: number;
  status: ExtractionPageStatus;
  attemptCount: number;
  extractedText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  imageUrl: string | null;
}

interface ExtractionStoreState {
  phase: ExtractionPhase;
  jobId: string | null;
  error: string | null;

  // Mode (chosen on the very first screen)
  mode: ExtractionMode | null;

  // Upload bookkeeping
  sourceName: string | null;
  sourceType: "PDF" | "IMAGES" | null;
  slots: ClientPageSlot[];
  splitProgress: { pageIndex?: number; totalPages?: number } | null;
  uploadProgress: { uploaded: number; total: number } | null;

  // Server-side runtime state (hydrated from SSE / initial snapshot)
  job: JobSnapshot | null;
  pages: Map<number, PageRuntime>;

  // Review-step data
  /** Legacy passage-only drafts — kept because the existing review-step UI
   *  (M1 pipeline) still consumes them. */
  drafts: ResultDraft[];
  /** Block-level extraction items (M2/M4 review surface). */
  items: ExtractionItemSnapshot[];
  /** Passage-centric drafts built from `items` via `buildEnrichedDrafts`. */
  enrichedDrafts: EnrichedDraft[];
  /** Client-side auto-parsed source material metadata
   *  (filename + page-1 header; see `meta-parser.ts`). */
  sourceMeta: ParsedSourceMeta | null;
  /** Server-side SourceMaterial row once finalize has created it. */
  sourceMaterial: SourceMaterialSnapshot | null;

  // Review-step selection (shared between BlockTree / Viewer / Editor panels)
  selectedItemId: string | null;
  focusedPageIndex: number | null;

  /** Commit API response — populated by review-step right after /commit succeeds. */
  lastCommitResult: LastCommitResult | null;
  /** UTC ISO timestamp captured when the `done` phase transitions (used for elapsed time). */
  completedAt: string | null;

  // Actions
  setPhase: (p: ExtractionPhase) => void;
  setError: (msg: string | null) => void;
  setMode: (mode: ExtractionMode | null) => void;
  setSource: (name: string, type: "PDF" | "IMAGES") => void;
  setSlots: (slots: ClientPageSlot[]) => void;
  setSplitProgress: (p: { pageIndex?: number; totalPages?: number } | null) => void;
  setUploadProgress: (p: { uploaded: number; total: number } | null) => void;
  setJobId: (id: string | null) => void;
  applySnapshot: (snap: JobSnapshot) => void;
  upsertPage: (page: PageRuntime) => void;
  updateJobStatus: (args: {
    status: ExtractionJobStatus;
    successPages: number;
    failedPages: number;
    pendingPages: number;
    creditsConsumed: number;
  }) => void;
  setDrafts: (drafts: ResultDraft[]) => void;
  updateDraft: (id: string, patch: Partial<ResultDraft>) => void;
  removeDraft: (id: string) => void;
  setItems: (items: ExtractionItemSnapshot[]) => void;
  updateItem: (id: string, patch: Partial<ExtractionItemSnapshot>) => void;
  setEnrichedDrafts: (drafts: EnrichedDraft[]) => void;
  setSourceMeta: (m: ParsedSourceMeta | null) => void;
  setSourceMaterial: (sm: SourceMaterialSnapshot | null) => void;
  setSelectedItemId: (id: string | null) => void;
  setFocusedPageIndex: (index: number | null) => void;
  setLastCommitResult: (result: LastCommitResult | null) => void;
  setCompletedAt: (iso: string | null) => void;
  reset: () => void;
}

const EMPTY_PAGES = new Map<number, PageRuntime>();

export const useExtractionStore = create<ExtractionStoreState>((set, get) => ({
  phase: "mode-select",
  jobId: null,
  error: null,
  mode: null,
  sourceName: null,
  sourceType: null,
  slots: [],
  splitProgress: null,
  uploadProgress: null,
  job: null,
  pages: EMPTY_PAGES,
  drafts: [],
  items: [],
  enrichedDrafts: [],
  sourceMeta: null,
  sourceMaterial: null,
  selectedItemId: null,
  focusedPageIndex: null,
  lastCommitResult: null,
  completedAt: null,

  setPhase: (p) => set({ phase: p }),
  setError: (msg) => set({ error: msg, phase: msg ? "error" : get().phase }),
  setMode: (mode) => set({ mode }),
  setSource: (name, type) => set({ sourceName: name, sourceType: type }),

  setSlots: (slots) => {
    const prev = get().slots;
    if (prev !== slots && prev.length > 0) revokeSlotUrls(prev);
    set({ slots });
  },

  setSplitProgress: (p) => set({ splitProgress: p }),
  setUploadProgress: (p) => set({ uploadProgress: p }),
  setJobId: (id) => set({ jobId: id }),

  applySnapshot: (snap) => {
    const next = new Map<number, PageRuntime>();
    for (const p of snap.pages) next.set(p.pageIndex, { ...p });
    set({ job: snap, pages: next });
  },

  upsertPage: (p) => {
    const next = new Map(get().pages);
    const existing = next.get(p.pageIndex);
    next.set(p.pageIndex, { ...existing, ...p });
    set({ pages: next });
  },

  updateJobStatus: ({ status, successPages, failedPages, pendingPages, creditsConsumed }) => {
    const job = get().job;
    if (!job) return;
    set({
      job: { ...job, status, successPages, failedPages, pendingPages, creditsConsumed },
    });
  },

  setDrafts: (drafts) => set({ drafts }),
  updateDraft: (id, patch) =>
    set({ drafts: get().drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) }),
  removeDraft: (id) => set({ drafts: get().drafts.filter((d) => d.id !== id) }),

  setItems: (items) => set({ items }),
  updateItem: (id, patch) =>
    set({
      items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }),
  setEnrichedDrafts: (enrichedDrafts) => set({ enrichedDrafts }),
  setSourceMeta: (sourceMeta) => set({ sourceMeta }),
  setSourceMaterial: (sourceMaterial) => set({ sourceMaterial }),
  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
  setFocusedPageIndex: (focusedPageIndex) => set({ focusedPageIndex }),
  setLastCommitResult: (lastCommitResult) => set({ lastCommitResult }),
  setCompletedAt: (completedAt) => set({ completedAt }),

  reset: () => {
    const prev = get().slots;
    if (prev.length > 0) revokeSlotUrls(prev);
    set({
      phase: "mode-select",
      jobId: null,
      error: null,
      mode: null,
      sourceName: null,
      sourceType: null,
      slots: [],
      splitProgress: null,
      uploadProgress: null,
      job: null,
      pages: EMPTY_PAGES,
      drafts: [],
      items: [],
      enrichedDrafts: [],
      sourceMeta: null,
      sourceMaterial: null,
      selectedItemId: null,
      focusedPageIndex: null,
      lastCommitResult: null,
      completedAt: null,
    });
  },
}));
