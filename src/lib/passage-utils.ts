import { createHash } from "crypto";
import type {
  TextSegment,
  VocabItem,
  GrammarPoint,
} from "@/types/passage-analysis";

/**
 * Generate MD5 hash of passage content for change detection.
 */
export function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

interface HighlightRange {
  start: number;
  end: number;
  type: "vocab" | "grammar";
  data: VocabItem | GrammarPoint;
}

/**
 * Build an array of text segments (plain / vocab / grammar) from a sentence.
 * Grammar highlights take visual priority. Vocab highlights can nest inside.
 * If a textFragment or word is not found in the sentence, it is gracefully skipped.
 */
export function buildTextSegments(
  sentenceText: string,
  vocabItems: VocabItem[],
  grammarPoints: GrammarPoint[]
): TextSegment[] {
  const ranges: HighlightRange[] = [];

  // Find grammar highlight positions
  for (const gp of grammarPoints) {
    const idx = sentenceText
      .toLowerCase()
      .indexOf(gp.textFragment.toLowerCase());
    if (idx === -1) continue;
    ranges.push({
      start: idx,
      end: idx + gp.textFragment.length,
      type: "grammar",
      data: gp,
    });
  }

  // Find vocab highlight positions
  for (const vi of vocabItems) {
    // Match whole word boundary with case-insensitive search
    const regex = new RegExp(`\\b${escapeRegex(vi.word)}\\b`, "i");
    const match = regex.exec(sentenceText);
    if (!match) continue;

    const start = match.index;
    const end = start + match[0].length;

    // Skip if this vocab is entirely inside a grammar range
    const insideGrammar = ranges.some(
      (r) => r.type === "grammar" && start >= r.start && end <= r.end
    );
    if (insideGrammar) {
      // Still add it — we'll handle nesting in the render phase
      ranges.push({ start, end, type: "vocab", data: vi });
    } else {
      // Skip if overlaps with another non-grammar range
      const overlaps = ranges.some(
        (r) => r.type === "vocab" && start < r.end && end > r.start
      );
      if (!overlaps) {
        ranges.push({ start, end, type: "vocab", data: vi });
      }
    }
  }

  // Sort by start position, grammar first when equal
  ranges.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.type === "grammar" ? -1 : 1;
  });

  // Build segments — handle simple non-overlapping case
  const segments: TextSegment[] = [];
  let cursor = 0;

  // Process only top-level (non-nested) ranges
  const topRanges = ranges.filter((r) => {
    if (r.type === "vocab") {
      // Check if nested inside grammar
      return !ranges.some(
        (g) =>
          g.type === "grammar" &&
          g !== r &&
          r.start >= g.start &&
          r.end <= g.end
      );
    }
    return true;
  });

  for (const range of topRanges) {
    // Add plain text before this range
    if (range.start > cursor) {
      segments.push({
        type: "plain",
        text: sentenceText.slice(cursor, range.start),
      });
    }

    if (range.start < cursor) continue; // Skip overlapping

    segments.push({
      type: range.type,
      text: sentenceText.slice(range.start, range.end),
      data: range.data,
    });

    cursor = range.end;
  }

  // Add remaining plain text
  if (cursor < sentenceText.length) {
    segments.push({
      type: "plain",
      text: sentenceText.slice(cursor),
    });
  }

  // If no segments were created (no highlights matched), return the full sentence
  if (segments.length === 0) {
    return [{ type: "plain", text: sentenceText }];
  }

  return segments;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
