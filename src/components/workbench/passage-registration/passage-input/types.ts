"use client";

import type { Annotation } from "@/components/workbench/editor";
import type { RestorationResult } from "@/app/(director)/director/workbench/generate/intake/passage-row";

/** Minimum characters before a pasted passage is considered usable. */
export const MIN_CONTENT_CHARS = 20;

/**
 * One editable passage in the unified multi-passage annotation stack on the
 * 학습지 생성 page. Carries its own teacher markings (annotations) + optional
 * AI-restoration review, and remembers the extraction draft it was loaded from
 * (sourceDraftId) so analysis UPDATES that Passage instead of forking a
 * duplicate.
 */
export interface PassageInputRow {
  localId: string;
  title: string;
  content: string;
  /** Teacher markings (vocab/grammar/syntax/sentence/examPoint). */
  annotations: Annotation[];
  /** Set after AI 복원 runs on this row. */
  restoration: RestorationResult | null;
  /** Snapshot taken before 복원 so 되돌리기 can restore text + marks together. */
  preRestoreContent: string | null;
  preRestoreAnnotations: Annotation[] | null;
  /** The extraction M1 draft this row was loaded from (자료 관리 → 불러오기). */
  sourceDraftId: string | null;
  /** Source filename label carried from the draft's job (passes into metadata). */
  source: string | null;
  /** Collapsed in the stack — the editor is lazily mounted only when expanded. */
  collapsed: boolean;
  /**
   * Bumped whenever `content`/`annotations` are replaced wholesale (load draft,
   * AI 복원, 되돌리기). Used as part of the editor's React key so it remounts and
   * re-seeds marks. Plain typing/marking does NOT bump it (no remount → no focus
   * loss).
   */
  editorSeed: number;
}

let rowSeq = 0;
/** Collision-free row id (survives HMR resets + StrictMode double-invoke). */
function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  rowSeq += 1;
  return `prow-${rowSeq}-${Math.random().toString(36).slice(2)}`;
}

export function makeEmptyRow(content = ""): PassageInputRow {
  return {
    localId: newRowId(),
    title: "",
    content,
    annotations: [],
    restoration: null,
    preRestoreContent: null,
    preRestoreAnnotations: null,
    sourceDraftId: null,
    source: null,
    collapsed: false,
    editorSeed: 0,
  };
}

/** Build a row from an extraction draft loaded via 자료 관리 → 불러오기. */
export function makeRowFromDraft(args: {
  title: string;
  content: string;
  sourceDraftId: string;
  source: string | null;
  collapsed?: boolean;
}): PassageInputRow {
  return {
    localId: newRowId(),
    title: args.title,
    content: args.content,
    annotations: [],
    restoration: null,
    preRestoreContent: null,
    preRestoreAnnotations: null,
    sourceDraftId: args.sourceDraftId,
    source: args.source,
    collapsed: args.collapsed ?? true,
    editorSeed: 0,
  };
}

/** A blank row the teacher hasn't touched — safe to drop when loading drafts. */
export function isPristineEmptyRow(row: PassageInputRow): boolean {
  return (
    row.content.trim().length === 0 &&
    row.title.trim().length === 0 &&
    row.annotations.length === 0 &&
    row.sourceDraftId === null
  );
}
