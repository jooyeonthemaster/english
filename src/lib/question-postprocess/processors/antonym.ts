import {
  applyReplacementsRTL,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import { getCircledNumbers, type PostProcessResult, type QuestionPostProcessData, type Replacement } from "../types";

const ANTONYM_KEYS = ["A", "B", "C", "D", "E"] as const;
const EXPECTED_MARKED_WORD_COUNT = 5;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeAntonymKey(value: unknown, fallbackIndex?: number): string {
  const text = clean(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < ANTONYM_KEYS.length
      ? ANTONYM_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < ANTONYM_KEYS.length) {
    return ANTONYM_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([A-Ea-e])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toUpperCase();

  const numberMatch = text.match(/^[\(\[]?\s*([1-5])\s*[\)\].:]?$/);
  if (numberMatch) return ANTONYM_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}

function canonicalAntonymLabel(value: unknown, fallbackIndex: number): string {
  const key = normalizeAntonymKey(value, fallbackIndex);
  return key ? `(${key})` : clean(value);
}

function collectAnswerIndices(ai: QuestionPostProcessData): number[] {
  const indices: number[] = [];
  const push = (value: unknown) => {
    const key = normalizeAntonymKey(value);
    const index = key ? ANTONYM_KEYS.indexOf(key as (typeof ANTONYM_KEYS)[number]) : -1;
    if (index >= 0 && !indices.includes(index)) indices.push(index);
  };

  if (Array.isArray(ai.correctAnswers)) {
    ai.correctAnswers.forEach(push);
  }

  const answer = clean(ai.correctAnswer);
  if (answer) {
    const matches = answer.match(/[\(\[]?\s*(?:[A-Ea-e]|[1-5]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(answer);
  }

  return indices;
}

export function processAntonym(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const markedWords = ai.markedWords as Array<{
    label: string;
    word: string;
    antonym: string;
    isIncorrectPair?: boolean;
    correctAntonym?: string;
    surroundingText?: string;
  }>;

  if (!markedWords || !Array.isArray(markedWords)) {
    return { success: false, data: ai, warnings, error: "Missing markedWords field" };
  }

  if (markedWords.length !== EXPECTED_MARKED_WORD_COUNT) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `ANTONYM must contain exactly ${EXPECTED_MARKED_WORD_COUNT} markedWords, got ${markedWords.length}`,
    };
  }

  const normalizedLabels = markedWords.map((mw, index) => canonicalAntonymLabel(mw.label, index));
  const duplicateLabel = normalizedLabels.find((label, index) => normalizedLabels.indexOf(label) !== index);
  if (duplicateLabel) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Duplicate ANTONYM marked word label: ${duplicateLabel}`,
    };
  }

  const incorrectPairs = markedWords.filter((mw) => mw.isIncorrectPair === true);
  if (incorrectPairs.length !== 1) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `ANTONYM must contain exactly one isIncorrectPair=true item, got ${incorrectPairs.length}`,
    };
  }

  const replacements: Replacement[] = [];
  const normalizedWords: Array<{
    label: string;
    word: string;
    antonym: string;
    isIncorrectPair: boolean;
    correctAntonym?: string;
  }> = [];

  for (const [index, mw] of markedWords.entries()) {
    const label = normalizedLabels[index];
    const word = clean(mw.word);
    const antonym = clean(mw.antonym);
    const correctAntonym = clean(mw.correctAntonym);
    const isIncorrectPair = mw.isIncorrectPair === true;

    if (!word || !antonym) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `ANTONYM label ${label} is missing word or antonym`,
      };
    }

    if (isIncorrectPair && !correctAntonym) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `ANTONYM incorrect pair ${label} is missing correctAntonym`,
      };
    }

    const found = findWordInPassage(passage, word, mw.surroundingText);
    if (!found) {
      warnings.push(`Word not found for label ${label}: "${word}"`);
      return {
        success: false,
        data: ai,
        warnings,
        error: `Could not locate ANTONYM word for label ${label}: "${word}"`,
      };
    }

    const sanitized = sanitizeExpressionForMarker(word);
    const newText = `__${label} ${sanitized}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });

    normalizedWords.push({
      label,
      word,
      antonym,
      isIncorrectPair,
      correctAntonym: isIncorrectPair ? correctAntonym : undefined,
    });
  }

  if (replacements.length !== EXPECTED_MARKED_WORD_COUNT) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Could not locate all ANTONYM marked words in the passage (${replacements.length}/${EXPECTED_MARKED_WORD_COUNT})`,
    };
  }

  const incorrectIndex = normalizedWords.findIndex((mw) => mw.isIncorrectPair);
  const answerIndices = collectAnswerIndices(ai);
  if (answerIndices.length !== 1 || answerIndices[0] !== incorrectIndex) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `ANTONYM correctAnswer must match the single incorrect pair option ${incorrectIndex + 1}`,
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);
  const normalizedOptions = normalizedWords.map((mw, index) => ({
    label: String(index + 1),
    text: `${mw.label} ${mw.word} - ${mw.antonym}`,
  }));

  return {
    success: true,
    data: {
      ...ai,
      correctAnswer: String(incorrectIndex + 1),
      passageWithMarkers,
      markedWords: normalizedWords,
      options: normalizedOptions,
    },
    warnings,
  };
}
