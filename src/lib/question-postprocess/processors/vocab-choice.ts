import {
  applyReplacementsRTL,
  findOcrNoisyExpressionInPassage,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import { getCircledNumbers, type PostProcessResult, type QuestionPostProcessData, type Replacement } from "../types";

const VOCAB_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;
const MARKED_WORD_COUNT_MIN = 5;
const MARKED_WORD_COUNT_MAX = 10;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function comparable(value: string): string {
  return clean(value).toLowerCase();
}

function normalizeVocabKey(value: unknown, fallbackIndex?: number): string {
  const text = clean(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < VOCAB_KEYS.length
      ? VOCAB_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < VOCAB_KEYS.length) {
    return VOCAB_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([a-jA-J])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toLowerCase();

  const numberMatch = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
  if (numberMatch) return VOCAB_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}

function canonicalVocabLabel(value: unknown, fallbackIndex: number): string {
  const key = normalizeVocabKey(value, fallbackIndex);
  return key ? `(${key})` : clean(value);
}

function vocabKeyToAnswerLabel(key: string): string {
  const index = (VOCAB_KEYS as readonly string[]).indexOf(key);
  return index >= 0 ? String(index + 1) : key;
}

function canonicalVocabOptionLabel(value: unknown, fallbackIndex: number): string {
  const key = normalizeVocabKey(value, fallbackIndex);
  return key ? vocabKeyToAnswerLabel(key) : clean(value);
}

function collectAnswerKeys(ai: QuestionPostProcessData): string[] {
  const keys: string[] = [];
  const push = (value: unknown) => {
    const key = normalizeVocabKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (Array.isArray(ai.correctAnswers)) {
    ai.correctAnswers.forEach(push);
  }

  const answer = clean(ai.correctAnswer);
  if (answer) {
    const matches = answer.match(/[\(\[]?\s*(?:[a-jA-J]|10|[1-9]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(answer);
  }

  return keys;
}

export function processVocabChoice(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  // 동의어 변형 모드: 정답이 아닌 밑줄 단어도 원문과 다른 문맥상 적절한 동의어로
  // 표시해 "지문 암기"만으로는 못 풀게 한다. 위치 탐색은 항상 verbatim originalWord.
  const variantMode =
    clean(ai.vocabDisplayMode).toUpperCase() === "SYNONYM_VARIANT";

  const markedWords = ai.markedWords as Array<{
    label: string;
    originalWord: string;
    substituteWord?: string;
    isInappropriate: boolean;
    betterWord?: string;
    word?: string;
    surroundingText?: string;
  }>;

  if (!markedWords || !Array.isArray(markedWords)) {
    return { success: false, data: ai, warnings, error: "Missing markedWords field" };
  }

  if (
    markedWords.length < MARKED_WORD_COUNT_MIN ||
    markedWords.length > MARKED_WORD_COUNT_MAX
  ) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `VOCAB_CHOICE must contain ${MARKED_WORD_COUNT_MIN}~${MARKED_WORD_COUNT_MAX} markedWords, got ${markedWords.length}`,
    };
  }

  const inappropriateWords = markedWords.filter((mw) => mw.isInappropriate === true);
  if (inappropriateWords.length < 1) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "VOCAB_CHOICE must contain at least one inappropriate marked word, got 0",
    };
  }

  const normalizedLabels = markedWords.map((mw, index) => canonicalVocabLabel(mw.label, index));
  const duplicateLabel = normalizedLabels.find((label, index) => normalizedLabels.indexOf(label) !== index);
  if (duplicateLabel) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Duplicate VOCAB_CHOICE marked word label: ${duplicateLabel}`,
    };
  }

  const replacements: Replacement[] = [];
  const normalizedWords: Array<{
    label: string;
    word: string;
    originalWord: string;
    substituteWord?: string;
    isInappropriate: boolean;
    betterWord?: string;
  }> = [];

  for (const [index, mw] of markedWords.entries()) {
    const label = normalizedLabels[index];
    const isInappropriate = mw.isInappropriate === true;
    const legacyWord = clean(mw.word);
    const surroundingText = clean(mw.surroundingText);
    const providedOriginal = clean(mw.originalWord);
    const providedSubstitute = clean(mw.substituteWord);
    const providedBetter = clean(mw.betterWord);

    let originalWord = providedOriginal || (!isInappropriate ? legacyWord : "");
    let substituteWord = providedSubstitute;

    // Legacy raw outputs sometimes used word=displayedWrong and betterWord=sourceCorrect.
    // Recover only when the source correct word can be located and the displayed word cannot.
    if (isInappropriate && !originalWord && legacyWord && providedBetter) {
      const betterInPassage = findWordInPassage(passage, providedBetter, surroundingText);
      const legacyWordInPassage = findWordInPassage(passage, legacyWord, surroundingText);
      if (betterInPassage && !legacyWordInPassage) {
        originalWord = providedBetter;
        substituteWord = substituteWord || legacyWord;
        warnings.push(`Recovered legacy VOCAB_CHOICE fields for ${label}: word=substituteWord, betterWord=originalWord`);
      }
    }

    if (!originalWord) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Missing originalWord for VOCAB_CHOICE label ${label}`,
      };
    }

    if (isInappropriate) {
      if (!substituteWord) {
        return {
          success: false,
          data: ai,
          warnings,
          error: `Missing substituteWord for inappropriate VOCAB_CHOICE label ${label}`,
        };
      }
      if (comparable(substituteWord) === comparable(originalWord)) {
        return {
          success: false,
          data: ai,
          warnings,
          error: `Inappropriate VOCAB_CHOICE label ${label} was not mutated`,
        };
      }
      if (providedBetter && comparable(providedBetter) !== comparable(originalWord)) {
        return {
          success: false,
          data: ai,
          warnings,
          error: `betterWord for inappropriate VOCAB_CHOICE label ${label} must equal originalWord`,
        };
      }
    } else if (
      !variantMode &&
      substituteWord &&
      comparable(substituteWord) !== comparable(originalWord)
    ) {
      // 일반 모드에서는 정답 외 단어가 원문과 달라선 안 된다. 변형 모드에서는
      // 동의어 표시를 허용하므로 이 가드를 건너뛴다.
      return {
        success: false,
        data: ai,
        warnings,
        error: `Non-answer VOCAB_CHOICE label ${label} must not have a different substituteWord`,
      };
    }

    let found = findWordInPassage(passage, originalWord, surroundingText);
    if (!found) {
      found = findOcrNoisyExpressionInPassage(
        passage,
        originalWord,
        surroundingText,
      );
      if (found) {
        warnings.push(
          `OCR-noisy source token matched for label ${label}: "${originalWord}"`,
        );
      }
    }
    if (!found) {
      warnings.push(`Word not found for label ${label}: "${originalWord}"`);
      return {
        success: false,
        data: ai,
        warnings,
        error: `Could not locate originalWord for VOCAB_CHOICE label ${label}: "${originalWord}"`,
      };
    }

    // 정답은 부적절 단어를, 변형 모드의 정답 외 단어는 동의어(substituteWord)를,
    // 그 밖에는 원문 단어를 표시한다.
    const showsSubstitute = isInappropriate || (variantMode && !!substituteWord);
    const displaySource = showsSubstitute ? substituteWord : originalWord;
    const displayWord = sanitizeExpressionForMarker(displaySource);
    const newText = `__${label} ${displayWord}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });

    normalizedWords.push({
      label,
      word: displaySource,
      originalWord,
      substituteWord: displaySource,
      isInappropriate,
      betterWord: isInappropriate ? originalWord : undefined,
    });
  }

  if (replacements.length !== markedWords.length) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Could not locate all VOCAB_CHOICE marked words in the passage (${replacements.length}/${markedWords.length})`,
    };
  }

  // The answer set is the inappropriate label set, single or multiple.
  const inappropriateKeys = normalizedWords
    .filter((mw) => mw.isInappropriate)
    .map((mw) => normalizeVocabKey(mw.label))
    .filter(Boolean);
  const answerKeys = collectAnswerKeys(ai);
  const sameAnswerSet =
    inappropriateKeys.length > 0 &&
    answerKeys.length === inappropriateKeys.length &&
    inappropriateKeys.every((key) => answerKeys.includes(key));
  if (!sameAnswerSet) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `VOCAB_CHOICE correctAnswer must match the inappropriate label set (${inappropriateKeys
        .map(vocabKeyToAnswerLabel)
        .join(", ")})`,
    };
  }

  const canonicalAnswerLabels = inappropriateKeys.map(vocabKeyToAnswerLabel);

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);
  const wordByKey = new Map(
    normalizedWords.map((mw) => [normalizeVocabKey(mw.label), mw.word]),
  );
  const normalizedOptions = Array.isArray(ai.options)
    ? ai.options.map((option, index) => {
        if (!option || typeof option !== "object") return option;
        const record = option as Record<string, unknown>;
        const key = normalizeVocabKey(record.label, index);
        const label = canonicalVocabOptionLabel(record.label, index);
        // 모델이 보기 text에 "(a) word"처럼 라벨을 중복 포함하는 사례가 있어,
        // 표시 단어의 진실원본인 markedWords 기준으로 text를 정규화한다.
        const displayWord = wordByKey.get(key);
        return displayWord
          ? { ...record, label, text: displayWord }
          : { ...record, label };
      })
    : ai.options;

  return {
    success: true,
    data: {
      ...ai,
      correctAnswer: canonicalAnswerLabels.join(", "),
      correctAnswers:
        canonicalAnswerLabels.length > 1 ? canonicalAnswerLabels : undefined,
      passageWithMarkers,
      markedWords: normalizedWords,
      options: normalizedOptions,
    },
    warnings,
  };
}
