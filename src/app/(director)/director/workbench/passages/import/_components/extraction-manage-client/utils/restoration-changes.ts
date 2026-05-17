import { diffWords } from "diff";

import type { M1PassageDraftChangeSnapshot } from "@/lib/extraction/types";

/** evidenceType values used by the AI restoration prompt — see
 *  m2-restoration.ts `restorationChangeSchema`. These tag *sentence-level*
 *  edits that are meaningful to surface as individual cards. Whole-passage
 *  changes ("grounded-restoration", "exam-annotation", "whitespace") cover
 *  the entire body and aren't useful as inline cards.
 *
 *  "source-match" is a whole-body change but we *do* surface it as a card —
 *  it tells the teacher the passage was matched against a previously
 *  approved version in the academy's DB, which is high-signal context they
 *  shouldn't have to dig through audit logs for. It's filtered out of the
 *  inline body highlight (see `isHighlightableChange`) so it doesn't paint
 *  the whole passage rose. */
const INLINE_EVIDENCE_TYPES = new Set([
  "VOCAB",
  "GRAMMAR",
  "BLANK",
  "INSERTION",
  "ORDERING",
  "SUMMARY",
  "OTHER",
  "source-match",
]);

/** Whole-body change types that get a card but no inline body highlight —
 *  highlighting the entire passage is visually noisy and overwhelms the real
 *  sentence-level edits. */
const WHOLE_BODY_EVIDENCE_TYPES = new Set(["source-match"]);

export function isHighlightableChange(change: InlineRestorationChange) {
  return !WHOLE_BODY_EVIDENCE_TYPES.has(change.changeType ?? "");
}

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
      // Whole-body cards (source-match) are intentionally allowed to span
      // the entire passage — they tell the teacher the draft was matched
      // against a known DB record. Skip the size guard.
      if (WHOLE_BODY_EVIDENCE_TYPES.has(ct)) return true;
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

export interface HighlightedSegment {
  text: string;
  /** Set for change-based marks (interactive — drives hover/click sync with
   *  the side panel). null for plain text and word-diff overlay segments. */
  changeId: string | null;
  /** True for word-diff overlay marks that fill in around change-based spans
   *  (non-interactive). Surfaces raw-only stems / restored-only inserts the
   *  AI prompt didn't bother to emit as individual change rows — keeps raw
   *  and restored views visually parity even without inline changes. */
  diffOverlay: boolean;
}

/** Combine change-based highlights with a word-diff overlay so the two
 *  comparison panes always show the user where raw and restored differ —
 *  even in regions the AI didn't emit a sentence-level change for.
 *
 *  Priority order (highest first):
 *    1. Change-based spans (from `mapChangesToOffsets`) — interactive marks.
 *    2. Word-diff overlay (non-interactive) for host-only words (raw side =
 *       raw-only stems / Korean instructions, restored side = AI-inserted
 *       content). Filtered against (1) so we never double-highlight.
 *    3. Plain text in the gaps.
 *
 *  This keeps the prior "fallback to word-diff when no changes exist" behavior
 *  intact (callers pass `changes: []` and still get the same result) and
 *  *also* augments the change-based path so the raw pane's Korean stems and
 *  options light up the way they do in NO_RESTORATION drafts. */
export function buildHighlightedSegments({
  hostText,
  otherText,
  changes,
  side,
}: {
  hostText: string;
  otherText: string;
  changes: InlineRestorationChange[];
  /** "raw" → hostText is rawText, mark host-only spans rose.
   *  "restored" → hostText is teacherText, mark host-only spans amber. */
  side: "raw" | "restored";
}): HighlightedSegment[] {
  if (!hostText) return [];

  // 1. Change-based spans (interactive).
  const changeKey = side === "raw" ? "before" : "after";
  const changeSpans = mapChangesToOffsets(
    hostText,
    changes.map((c) => ({ id: c.id, text: c[changeKey] })),
  );

  // 2. Word-diff overlay — host-only words (rendered non-interactive).
  // diffWords(base, target) → added = target-only, removed = base-only.
  // We always want host-only segments highlighted, so base = otherText.
  const diffSpans: ChangeOffsetSpan[] = [];
  if (otherText) {
    const diff = diffWords(otherText, hostText);
    let offset = 0;
    for (const part of diff) {
      // Parts marked `removed` exist only in `otherText` and don't appear in
      // hostText, so they contribute no host offset.
      if (part.removed) continue;
      const length = part.value.length;
      if (part.added && part.value.trim().length > 0) {
        diffSpans.push({
          changeId: "__diff__",
          start: offset,
          end: offset + length,
        });
      }
      offset += length;
    }
  }

  // 3. Drop diff overlays that overlap an interactive change span — change-
  //    based marks always win, and we don't want a visual stutter at the
  //    boundary.
  const filteredDiffSpans = diffSpans.filter((d) => {
    for (const c of changeSpans) {
      if (c.start < d.end && c.end > d.start) return false;
    }
    return true;
  });

  // 4. Merge + sort all spans, then walk hostText turning into segments.
  type Span = ChangeOffsetSpan & { kind: "change" | "diff" };
  const allSpans: Span[] = [
    ...changeSpans.map((s) => ({ ...s, kind: "change" as const })),
    ...filteredDiffSpans.map((s) => ({ ...s, kind: "diff" as const })),
  ].sort((a, b) => a.start - b.start);

  const segments: HighlightedSegment[] = [];
  let cursor = 0;
  for (const span of allSpans) {
    if (span.start > cursor) {
      segments.push({
        text: hostText.slice(cursor, span.start),
        changeId: null,
        diffOverlay: false,
      });
    }
    segments.push({
      text: hostText.slice(span.start, span.end),
      changeId: span.kind === "change" ? span.changeId : null,
      diffOverlay: span.kind === "diff",
    });
    cursor = span.end;
  }
  if (cursor < hostText.length) {
    segments.push({
      text: hostText.slice(cursor),
      changeId: null,
      diffOverlay: false,
    });
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
  "source-match": {
    label: "DB 원본 매칭",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

export function describeEvidenceType(changeType: string | null) {
  if (!changeType) return EVIDENCE_TYPE_LABELS.OTHER;
  return EVIDENCE_TYPE_LABELS[changeType] ?? EVIDENCE_TYPE_LABELS.OTHER;
}
