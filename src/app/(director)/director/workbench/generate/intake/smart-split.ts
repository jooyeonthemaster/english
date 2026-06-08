// Deterministic splitter for a pasted blob that may contain several passages.
//
// Conservative by design: it only proposes 2+ chunks when there is a STRONG,
// explicit signal, and every chunk clears MIN_CHUNK_CHARS. Otherwise it returns
// the original text as a single chunk with confident=false, so the UI keeps it
// as one 지문 rather than mangling a single passage that merely has paragraph
// breaks. The user always confirms the split before it is applied.

export const MIN_CHUNK_CHARS = 20;

export interface SplitResult {
  chunks: string[];
  /** True only for explicit markers (numbered / "PASSAGE n"). Blank-gap is weak. */
  confident: boolean;
  reason: "passage-marker" | "numbered" | "blank-gap" | "none";
}

function normalize(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function viable(chunks: string[]): string[] {
  return chunks.map((c) => c.trim()).filter((c) => c.length >= MIN_CHUNK_CHARS);
}

/** Strip a leading list marker like "1." / "2)" from the start of a chunk. */
function stripLeadingMarker(chunk: string): string {
  return chunk.replace(/^[ \t]*\d{1,3}\s*[.)]\s+/, "").trim();
}

const MARKER_LINE = /^[ \t]*(?:passage|지문)\s*#?\s*\d+\s*[.):\-]?[ \t]*$/gim;
const NUMBERED_LINE = /^[ \t]*(\d{1,3})\s*[.)]\s+\S/;

/**
 * Inspect a pasted blob and decide whether it holds multiple passages.
 * Order of signals (strongest first): explicit "PASSAGE n / 지문 n" header
 * lines → numbered line-starts (≥2) → double-blank-line gaps (weak).
 */
export function splitPastedPassages(raw: string): SplitResult {
  const text = normalize(raw);
  if (!text) return { chunks: [], confident: false, reason: "none" };

  // 1) Explicit "PASSAGE 1" / "지문 1" header lines.
  MARKER_LINE.lastIndex = 0;
  if (MARKER_LINE.test(text)) {
    MARKER_LINE.lastIndex = 0;
    const parts = text.split(MARKER_LINE);
    const chunks = viable(parts);
    if (chunks.length >= 2) {
      return { chunks, confident: true, reason: "passage-marker" };
    }
  }

  // 2) Numbered line-starts ("1. ...", "2) ..."), at least two of them. Split
  //    before each marker line; strip the marker token from each resulting
  //    chunk so the passage text itself stays clean.
  const lines = text.split("\n");
  const boundaries: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (NUMBERED_LINE.test(lines[i])) boundaries.push(i);
  }
  if (boundaries.length >= 2) {
    const segments: string[] = [];
    const preamble = lines.slice(0, boundaries[0]).join("\n").trim();
    if (preamble.length >= MIN_CHUNK_CHARS) segments.push(preamble);
    for (let k = 0; k < boundaries.length; k += 1) {
      const from = boundaries[k];
      const to = k + 1 < boundaries.length ? boundaries[k + 1] : lines.length;
      segments.push(stripLeadingMarker(lines.slice(from, to).join("\n")));
    }
    const chunks = viable(segments);
    if (chunks.length >= 2) {
      return { chunks, confident: true, reason: "numbered" };
    }
  }

  // 3) Double-blank-line gaps (2+ empty lines). Weak signal — paragraphs inside
  //    one passage are usually separated by a single blank line.
  const byGap = viable(text.split(/\n[ \t]*\n[ \t]*\n+/));
  if (byGap.length >= 2) {
    return { chunks: byGap, confident: false, reason: "blank-gap" };
  }

  return { chunks: [text], confident: false, reason: "none" };
}
