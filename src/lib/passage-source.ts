/**
 * Sentinel value stored in `Passage.source` to mark a passage that was created
 * via the "직접 지문 붙여넣기" (paste raw text) flow on the question-generation
 * page — i.e. the user skipped the extraction → analysis pipeline and pasted
 * the passage text directly so they can generate questions immediately.
 *
 * The 자료 관리 list (`/director/workbench/passages`) normally shows only
 * analysis-complete passages. Direct-input passages are surfaced there too by
 * matching this sentinel, so pasted material is never "lost" even before any
 * analysis runs. See `getWorkbenchPassages` (`includeDirectInput` filter).
 */
export const DIRECT_INPUT_PASSAGE_SOURCE = "직접 입력";

/** True when a passage was created via the direct-paste flow. */
export function isDirectInputPassage(
  source: string | null | undefined,
): boolean {
  return source === DIRECT_INPUT_PASSAGE_SOURCE;
}

export interface ProblemFormDetection {
  /** True when the pasted text looks like a problem-form passage rather than a
   *  clean original (blanks, choice markers, chunk labels, inserted-error
   *  markers, etc.). Heuristic — meant to *suggest* restoration, not gate it. */
  hasArtifacts: boolean;
  /** Short Korean labels for the kinds of artifacts found, for the UI banner. */
  hints: string[];
}

/**
 * Cheap, synchronous, client-safe detector for "this pasted text is in problem
 * form, not a finished passage". Mirrors the structural markers the extraction
 * restoration pipeline strips (see src/lib/extraction/m1-restoration.ts) plus a
 * couple of high-signal Korean problem-sheet cues.
 *
 * Pure regex — no server imports — so it is safe to call in a client component
 * on every keystroke.
 */
export function detectProblemFormArtifacts(text: string): ProblemFormDetection {
  const hints: string[] = [];
  if (!text) return { hasArtifacts: false, hints };

  // Blanks: 3+ underscores, or long dashed/space runs used as a blank.
  if (/_{3,}/.test(text) || /\(\s{2,}\)/.test(text)) hints.push("빈칸");
  // Circled choice numbers ①②③ … ⑩
  if (/[①-⑳]/.test(text)) hints.push("선지 번호(①②③)");
  // Chunk/ordering labels (A)(B)(C) at sentence/line starts
  if (/(^|\n)\s*\([A-E]\)\s+/.test(text)) hints.push("문단 라벨 (A)(B)");
  // Inline referent markers (a)~(e) glued to words — "밑줄 친 (a)~(e)" 유형
  if (/\([a-e]\)\s*\S/.test(text)) hints.push("밑줄 마커 (a)~(e)");
  // Inline problem markers like @A / @word
  if (/@\s*[A-Za-z]/.test(text)) hints.push("문제 마커(@)");
  // Boxed word lists / given-sentence containers
  if (/<\s*보기\s*>/.test(text)) hints.push("<보기> 박스");
  // Score tags such as [3점] / [서답형]
  if (/\[\s*\d+\s*점\s*\]/.test(text) || /\[\s*서답형\s*\]/.test(text)) hints.push("배점/유형 태그");
  // Common Korean problem stems that imply the text is a question, not a passage
  if (/(밑줄 친|빈칸에|어법상|글의 순서|문장이 들어가기|흐름상 어색)/.test(text)) hints.push("문제 발문");

  return { hasArtifacts: hints.length > 0, hints };
}
