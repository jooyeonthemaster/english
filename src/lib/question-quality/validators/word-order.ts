// WORD_ORDER 재구성 게이트 (wave1) — 제시 칩(scrambledWords)에서 선언된 미끼
// (wordBankDistractors)를 뺀 토큰 멀티셋이 modelAnswer 의 토큰을 전부 덮어야
// 학생이 정답 문장을 조립할 수 있다 (TSW 의 tsw-scrambled-reconstruct 와 동일
// 철학·정규화). "부족"만 결함으로 본다 — 잉여 칩은 프롬프트가 허용하는 미끼
// (INTERMEDIATE 0~1개·KILLER 포함)라 WORD_ORDER 스키마에 선언 필드가 없어도
// 정상이며, 미끼 누락과 구분이 불안정하므로 차단하지 않는다.
import { QuestionQualitySeverity, normalizeComparableText, normalizeText } from "../core";



/** 정규화 토큰 — normalizeComparableText(소문자·공백 정규화) 후 단어/숫자 단위. */
export function wordOrderComparableTokens(value: string): string[] {
  const normalized = normalizeComparableText(value);
  if (!normalized) return [];
  return normalized.match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}



export function validateWordOrderReconstruction(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const modelAnswer = normalizeText(question.modelAnswer);
  const chips = Array.isArray(question.scrambledWords)
    ? question.scrambledWords.filter((chip): chip is string => typeof chip === "string")
    : [];
  if (!modelAnswer || chips.length === 0) return;

  const declaredDistractors = Array.isArray(question.wordBankDistractors)
    ? question.wordBankDistractors.filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  const available = new Map<string, number>();
  for (const chip of chips) {
    for (const token of wordOrderComparableTokens(chip)) {
      available.set(token, (available.get(token) ?? 0) + 1);
    }
  }
  for (const distractor of declaredDistractors) {
    for (const token of wordOrderComparableTokens(distractor)) {
      const count = available.get(token) ?? 0;
      if (count > 0) available.set(token, count - 1);
    }
  }

  const missing: string[] = [];
  for (const token of wordOrderComparableTokens(modelAnswer)) {
    const count = available.get(token) ?? 0;
    if (count > 0) {
      available.set(token, count - 1);
    } else {
      missing.push(token);
    }
  }

  if (missing.length > 0) {
    add(
      "error",
      "word-order-unreconstructable",
      `WORD_ORDER chips cannot reassemble modelAnswer: token(s) ${[...new Set(missing)]
        .slice(0, 8)
        .map((token) => `"${token}"`)
        .join(", ")} are required by the answer but missing from scrambledWords (minus declared distractors). Split modelAnswer verbatim into the chips so every answer word is available.`,
    );
  }
}
