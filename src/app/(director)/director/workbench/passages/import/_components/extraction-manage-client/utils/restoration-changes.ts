import type { M1PassageDraftChangeSnapshot } from "@/lib/extraction/types";

/** evidenceType values used by the AI restoration prompt — see
 *  m2-restoration.ts `restorationChangeSchema`. These tag *sentence-level*
 *  edits that are meaningful to surface as individual cards. Whole-passage
 *  changes ("source-match", "grounded-restoration", "exam-annotation",
 *  "whitespace") cover the entire body and aren't useful as inline cards. */
const INLINE_EVIDENCE_TYPES = new Set([
  "VOCAB",
  "GRAMMAR",
  "BLANK",
  "INSERTION",
  "ORDERING",
  "SUMMARY",
  "OTHER",
]);

export interface InlineRestorationChange {
  id: string;
  sentenceOrder: number | null;
  before: string;
  after: string;
  changeType: string | null;
  reason: string | null;
  confidence: number | null;
}

/** Pull out sentence-level changes — the ones worth showing as inline cards.
 *  Filters in two passes:
 *    1. changeType must be on the evidence-type whitelist.
 *    2. neither before nor after may span (effectively) the whole body —
 *       guards against AI changes that wrap the entire passage in a single
 *       row, which would defeat the highlight-by-substring approach. */
export function selectInlineChanges(
  changes: M1PassageDraftChangeSnapshot[],
  rawText: string,
  restoredText: string,
): InlineRestorationChange[] {
  const wholePassageThreshold = 0.8;
  const rawLen = rawText.length;
  const restoredLen = restoredText.length;
  return changes
    .filter((c) => {
      const ct = c.changeType ?? "";
      if (!INLINE_EVIDENCE_TYPES.has(ct)) return false;
      const beforeRatio = rawLen > 0 ? c.before.length / rawLen : 0;
      const afterRatio = restoredLen > 0 ? c.after.length / restoredLen : 0;
      if (beforeRatio >= wholePassageThreshold) return false;
      if (afterRatio >= wholePassageThreshold) return false;
      return true;
    })
    .map((c) => ({
      id: c.id,
      sentenceOrder: c.sentenceOrder,
      before: c.before,
      after: c.after,
      changeType: c.changeType,
      reason: c.reason,
      confidence: c.confidence,
    }));
}

export interface ChangeOffsetSpan {
  changeId: string;
  start: number;
  end: number;
}

/** Find each change's `text` (either `before` for raw, or `after` for
 *  restored) in the host string. We walk the changes in order and consume
 *  from a moving cursor so the same substring appearing twice gets matched
 *  to different cards. Changes that can't be located in the host string
 *  are skipped silently (they still appear in the side panel — just without
 *  an inline highlight).
 *
 *  The first pass walks left-to-right respecting `cursor`. Anything that
 *  fails (target appears earlier in the text than the cursor, or not at all)
 *  retries from offset 0 — that recovers when changes are listed out of
 *  document order. Overlapping spans are dropped on the second pass. */
export function mapChangesToOffsets(
  text: string,
  changes: { id: string; text: string }[],
): ChangeOffsetSpan[] {
  if (!text || changes.length === 0) return [];
  const spans: ChangeOffsetSpan[] = [];
  let cursor = 0;
  for (const c of changes) {
    if (!c.text) continue;
    let idx = text.indexOf(c.text, cursor);
    if (idx === -1) idx = text.indexOf(c.text);
    if (idx === -1) continue;
    spans.push({ changeId: c.id, start: idx, end: idx + c.text.length });
    cursor = idx + c.text.length;
  }
  // Drop spans that overlap a previously-accepted span — keep the earlier
  // one so the substring matched first wins.
  spans.sort((a, b) => a.start - b.start);
  const accepted: ChangeOffsetSpan[] = [];
  let lastEnd = -1;
  for (const span of spans) {
    if (span.start < lastEnd) continue;
    accepted.push(span);
    lastEnd = span.end;
  }
  return accepted;
}

export interface TextSegment {
  text: string;
  changeId: string | null;
}

/** Slice the host text into alternating plain / highlighted segments. The
 *  caller renders each segment as a `<span>` or `<mark data-change-id>`. */
export function segmentText(
  text: string,
  spans: ChangeOffsetSpan[],
): TextSegment[] {
  if (spans.length === 0) return [{ text, changeId: null }];
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ text: text.slice(cursor, span.start), changeId: null });
    }
    segments.push({
      text: text.slice(span.start, span.end),
      changeId: span.changeId,
    });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), changeId: null });
  }
  return segments;
}

const EVIDENCE_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  VOCAB: {
    label: "어휘",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  GRAMMAR: {
    label: "어법",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  BLANK: {
    label: "빈칸",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  INSERTION: {
    label: "문장삽입",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  },
  ORDERING: {
    label: "순서",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  SUMMARY: {
    label: "요약",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  OTHER: {
    label: "기타",
    className: "bg-slate-50 text-slate-700 ring-slate-200",
  },
};

export function describeEvidenceType(changeType: string | null) {
  if (!changeType) return EVIDENCE_TYPE_LABELS.OTHER;
  return EVIDENCE_TYPE_LABELS[changeType] ?? EVIDENCE_TYPE_LABELS.OTHER;
}
