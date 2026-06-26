// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { CandidateDiversityOptions, buildSurroundingWindow, filterUsedCandidates, rotateByVariantIndex } from "./shared";



export function buildReferenceCandidateBlock(
  passage: string,
  diversity?: CandidateDiversityOptions,
): string {
  // "반드시 목록에서 선택" 하드 지시가 있는 유형이라, 기사용 발생(주변 문맥)을
  // 목록에서 직접 제외해 회피 지시와의 모순을 없앤다 (전부 기사용이면 원본 유지).
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      findReferenceCandidates(passage),
      diversity?.usedTargets,
      (candidate) => candidate.surroundingText,
    ).items,
    diversity?.variantIndex,
  ).slice(0, 12);
  if (candidates.length === 0) {
    return [
      "## Valid REFERENCE target candidates",
      "- No safe standalone pronoun candidates were detected. Do not invent a pronoun location.",
    ].join("\n");
  }

  return [
    "## Valid REFERENCE target candidates",
    "- You must choose exactly one candidate from this list.",
    "- Copy underlinedPronoun and surroundingText verbatim from the chosen candidate.",
    "- The explanation and options must refer to the same sentence/window as the chosen candidate.",
    ...candidates.map((candidate, index) => (
      `${index + 1}. underlinedPronoun="${candidate.pronoun}" | surroundingText="${candidate.surroundingText}"`
    )),
  ].join("\n");
}

export function findReferenceCandidates(passage: string): Array<{ pronoun: string; surroundingText: string }> {
  const candidates: Array<{ pronoun: string; surroundingText: string }> = [];
  const pronounRegex = /\b(it|its|they|them|their|this|that|these|those|he|him|his|she|her|we|us|our|one|ones)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pronounRegex.exec(passage))) {
    const pronoun = match[0];
    const surroundingText = buildSurroundingWindow(passage, match.index, pronoun.length);
    if (surroundingText) {
      candidates.push({ pronoun, surroundingText });
    }
  }

  return candidates;
}
