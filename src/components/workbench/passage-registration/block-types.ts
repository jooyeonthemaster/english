import type { Annotation } from "@/components/workbench/editor";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import { getDraftDisplayTitle } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/utils/title";

/**
 * One passage in the multi-passage center editor. The center column holds a
 * scrollable, collapsible stack of these — each can be filled from an
 * extraction draft (left grid) or typed/pasted manually, then all of them are
 * analyzed together by "분석 시작".
 *
 * Metadata that is shared across every passage (school/grade/semester/unit/
 * publisher/tags/prompt) lives in the options column, NOT here. Only the
 * per-passage fields are stored on the block.
 */
export interface PassageBlock {
  /** Stable local id (not the server passage id — that's created at analyze). */
  id: string;
  title: string;
  content: string;
  annotations: Annotation[];
  imageFile: File | null;
  imagePreview: string | null;
  /** Source label (e.g. the source draft's file name). */
  source: string;
  /** The extraction draft this block was loaded from, if any. */
  sourceDraftId: string | null;
  /** Collapsed = body hidden, only the header row visible. */
  collapsed: boolean;
}

let blockSeq = 0;
function nextBlockId(): string {
  blockSeq += 1;
  return `block-${blockSeq}-${blockSeq * 2654435761}`;
}

export function makeEmptyBlock(): PassageBlock {
  return {
    id: nextBlockId(),
    title: "",
    content: "",
    annotations: [],
    imageFile: null,
    imagePreview: null,
    source: "",
    sourceDraftId: null,
    collapsed: false,
  };
}

export function makeDraftBlock(draft: M1PassageDraftWithJob): PassageBlock {
  const text =
    draft.teacherText?.trim() ||
    draft.restoredText?.trim() ||
    draft.rawText?.trim() ||
    "";
  const title = draft.title?.trim() || getDraftDisplayTitle(draft);
  const source =
    draft.job?.displayName?.trim() || draft.job?.originalFileName?.trim() || "";
  return {
    id: nextBlockId(),
    title,
    content: text,
    annotations: [],
    imageFile: null,
    imagePreview: null,
    source,
    sourceDraftId: draft.id,
    collapsed: false,
  };
}

export function makePassageBlock(passage: {
  title?: string | null;
  content?: string | null;
  source?: string | null;
}): PassageBlock {
  const content = passage.content?.trim() || "";
  const title =
    passage.title?.trim() ||
    content.split(/[.\n]/)[0]?.slice(0, 60) ||
    "지문";
  return {
    id: nextBlockId(),
    title,
    content,
    annotations: [],
    imageFile: null,
    imagePreview: null,
    source: passage.source?.trim() || "",
    sourceDraftId: null,
    collapsed: false,
  };
}

export function blockHasContent(b: PassageBlock): boolean {
  return b.content.trim().length > 0 || b.imageFile !== null;
}

export function blockWordCount(b: PassageBlock): number {
  return b.content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
