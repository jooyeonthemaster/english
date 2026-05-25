// Shared sentence splitting for passages. Used by IRRELEVANT post-processor
// and by API routes for slot-count validation.

// Match a sentence ending with . ! ? optionally followed by closing
// quotes/brackets (curly or straight), so quoted sentences are kept whole.
const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+[\u201D\u2019")\]]*(?=\s|$)/g;

export function splitPassageSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const matches = cleaned.match(SENTENCE_SPLIT_RE);
  return matches ? matches.map((s) => s.trim()) : [cleaned];
}

export function countPassageSentences(text: string): number {
  return splitPassageSentences(text).length;
}
