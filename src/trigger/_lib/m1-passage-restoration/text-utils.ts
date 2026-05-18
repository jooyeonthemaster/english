import { hasUnresolvedM1ProblemArtifacts } from "@/lib/extraction/m1-restoration";

export function normalizeComparableText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip problem-sheet chunk / referent markers that the AI sometimes leaves
 * behind in restored text. These markers are added by the exam editor on top
 * of the original source passage and must not appear in the "복원문":
 *
 *   - Chunk labels  `(A) / (B) / (C) / (D)` at paragraph starts for ordering
 *     questions (글의 순서).
 *   - Referent markers `(a) / (b) / (c) / (d) / (e)` placed in front of
 *     specific words for 밑줄 친 (a)~(e) 가리키는 대상 / 어휘 questions.
 *
 * Safety net only — the restoration prompt asks the model to remove these on
 * its own. This regex pass is a fallback for when the model leaves them in.
 *
 * Conservative — we keep the surrounding word/punctuation intact, only the
 * parenthesised marker disappears. Whitespace collapses across the removal
 * so we don't introduce double spaces.
 */
export function stripProblemMarkers(text: string): string {
  if (!text) return text;
  let cleaned = text;
  // 1) Chunk labels at paragraph starts: `(A)`, `(A) `, `(A)\n` — uppercase
  //    single letters at line start with optional surrounding spaces. Originally
  //    capped at A~D (4-chunk ordering questions) but vocabulary-choice 동의어
  //    questions can list (A)~(I) boxed sentences, and a few outliers go up to
  //    (J). [A-Z] is the safe upper bound; the line-start anchor + paren shape
  //    prevents collisions with mid-sentence parentheticals like "Group (A)".
  cleaned = cleaned.replace(/(^|\n)[ \t]*\(([A-Z])\)[ \t]*/g, "$1");
  // 2) Inline referent markers `(a) word` → `word`. Only lowercase a~e in
  //    parens. We do NOT require a preceding space so it also catches the
  //    "...has(a) been..." style that sometimes shows up. But we DO require
  //    that the surrounding context looks like word boundary so we don't
  //    eat real parenthetical clauses like "(a fact that ...)".
  //    Trick: only strip if the parenthesised letter is followed by a
  //    whitespace or punctuation immediately (i.e. it really is a marker,
  //    not the opening of a clause).
  cleaned = cleaned.replace(/\(([a-e])\)(?=\s|[,.!?:;])/g, "");
  // 3) Collapse the double spaces / orphan newlines this introduces.
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/ +(?=\n)/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned;
}

export function isPollutedExactSourceMatch(input: {
  rawText: string;
  sourceText: string;
}): boolean {
  if (!hasUnresolvedM1ProblemArtifacts(input.sourceText)) return false;
  return (
    normalizeComparableText(input.rawText) ===
    normalizeComparableText(input.sourceText)
  );
}
