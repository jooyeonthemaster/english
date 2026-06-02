// ============================================================================
// 장문 세트 — render-from-spans reconstruction (pure; server + client safe)
// ============================================================================
// Rebuilds the MERGED marked passage string from a set's anchors against the
// clean displayed base — the single shared passage shown once. Because a set
// stores anchors (not the baked passageWith*), this is the only place passage
// mutation happens for set members, so no stored row carries a leaky copy.
//
// Output uses the SAME format contracts the existing renderers/exporters parse:
//   Blank:    _____ (BLANK)            matched by /_{3,}/g
//   Marker:   __(A) expr__             matched by /__([^_]+)__/g → /^\(([a-jA-J])\)\s*(.+)$/
//   Underline:__word__                 matched by /__([^_]+)__/g
// ============================================================================

import {
  applyReplacementsRTL,
  findExpressionInPassage,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "@/lib/question-postprocess/text-utils";
import {
  BLANK,
  type FoundPosition,
  type Replacement,
} from "@/lib/question-postprocess/types";
import type { Anchor, AnchorFindStrategy, SpanKind } from "./types";

const INLINE_KINDS: ReadonlySet<SpanKind> = new Set([
  "BLANK",
  "MARKER",
  "UNDERLINE",
]);

function isSingleToken(s: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(s.trim());
}

function defaultStrategyFor(kind: SpanKind): AnchorFindStrategy {
  if (kind === "MARKER") return "word";
  if (kind === "UNDERLINE") return "word";
  return "expression";
}

function locateWith(
  strategy: AnchorFindStrategy,
  base: string,
  text: string,
  surrounding?: string,
): FoundPosition | null {
  switch (strategy) {
    case "word":
      return findWordInPassage(base, text, surrounding);
    case "wordStrict":
      return findWordInPassage(base, text, surrounding, true);
    case "wordOrExpression":
      return (
        findWordInPassage(base, text, surrounding) ||
        findExpressionInPassage(base, text, surrounding)
      );
    case "grammar":
      return isSingleToken(text)
        ? findWordInPassage(base, text, surrounding)
        : findExpressionInPassage(base, text, surrounding);
    case "expression":
    default:
      return findExpressionInPassage(base, text, surrounding);
  }
}

function locate(base: string, anchor: Anchor): FoundPosition | null {
  const strategy = anchor.findStrategy ?? defaultStrategyFor(anchor.kind);
  const surrounding = anchor.surroundingText;
  let found = locateWith(strategy, base, anchor.spanText, surrounding);
  if (!found && anchor.fallbackText) {
    found = locateWith(strategy, base, anchor.fallbackText, surrounding);
  }
  return found;
}

export interface ReconstructResult {
  /** The base with all locatable anchors applied. */
  text: string;
  /** Number of anchors successfully placed. */
  located: number;
  /** Anchors whose span could not be located (→ DEGRADED). */
  missing: Anchor[];
}

/**
 * Reconstruct the merged marked passage from `anchors` against the clean `base`.
 * Structural kinds (NUMBER/CIRCLED_LETTER/BLOCK/SENTENCE) are ignored here — the
 * structural member renders the base layout itself; inline anchors apply on top.
 */
export function reconstructPassageView(
  base: string,
  anchors: Anchor[],
): ReconstructResult {
  const replacements: Replacement[] = [];
  const missing: Anchor[] = [];

  for (const anchor of anchors) {
    if (!INLINE_KINDS.has(anchor.kind)) continue;
    const found = locate(base, anchor);
    if (!found) {
      missing.push(anchor);
      continue;
    }
    const inner =
      anchor.passageForm ??
      base.slice(found.index, found.index + found.length);

    let newText: string;
    if (anchor.kind === "BLANK") {
      newText = BLANK;
    } else if (anchor.kind === "MARKER") {
      newText = `__${anchor.label ?? ""} ${sanitizeExpressionForMarker(inner)}__`;
    } else {
      newText = `__${inner}__`;
    }

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  return {
    text: applyReplacementsRTL(base, replacements),
    located: replacements.length,
    missing,
  };
}
