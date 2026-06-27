// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { QuestionQualitySeverity, REPEATED_PHRASE_STOPWORDS, VOCAB_CHOICE_MARKER_COUNT_MAX, VOCAB_CHOICE_MARKER_COUNT_MIN, containsLoose, countUnderlineMarkers, findDuplicate, findMarkers, isRecord, isSingleEnglishToken, normalizeComparableText, normalizeText, toLowerTokens } from "../core";


export const VOCAB_CHOICE_MARKER_COUNT_DEFAULT = 5;


export const VOCAB_CHOICE_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;



/**
 * 해설이 출제 변형 과정("원문의 X를 Y로 (잘못) 변형/바꿈")을 학생에게 노출하는지
 * 검출한다. 정답 단어를 정상 인용하는 해설은 통과시키고, 변형 동사가 동반될 때만 잡는다.
 */
export const EXPLANATION_META_LEAK_PATTERN =
  /['"]?[A-Za-z][A-Za-z'-]*['"]?\s*(?:을|를)\s*['"]?[A-Za-z][A-Za-z'-]*['"]?\s*(?:로|으로)\s*(?:잘못\s*)?(?:변형|바꾸|바꿔|바꾼|치환|교체)/;



export function explanationLeaksMutationProcess(explanation: string): boolean {
  if (!explanation) return false;
  return EXPLANATION_META_LEAK_PATTERN.test(explanation) || /잘못\s*변형(?:한|된|하여|해서)/.test(explanation);
}



/**
 * 어휘 적절성 정답의 원단어(치환 전 단어)가 본문 마커 밖에 또 등장하면 학생이
 * 정답을 즉답할 수 있다. 단일 내용어(길이 4+, 기능어 제외)만 검사한다.
 */
export function sourceWordVisibleOutsideMarkers(
  passageWithMarkers: string,
  sourceWord: string,
): boolean {
  const lower = sourceWord.toLowerCase();
  if (lower.length < 4 || REPEATED_PHRASE_STOPWORDS.has(lower) || !isSingleEnglishToken(lower)) {
    return false;
  }
  const stripped = passageWithMarkers.replace(/__\([a-jA-J]\)[^_]*__/g, " ");
  return toLowerTokens(stripped).includes(lower);
}



export function normalizeVocabChoiceKey(value: unknown, fallbackIndex?: number): string {
  const text = normalizeText(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < VOCAB_CHOICE_KEYS.length
      ? VOCAB_CHOICE_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < VOCAB_CHOICE_KEYS.length) {
    return VOCAB_CHOICE_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([a-jA-J])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toLowerCase();

  const numberMatch = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
  if (numberMatch) return VOCAB_CHOICE_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}



export function vocabChoiceAnswerLabelFromKey(key: string): string {
  const index = (VOCAB_CHOICE_KEYS as readonly string[]).indexOf(key);
  return index >= 0 ? String(index + 1) : key;
}



export function collectVocabChoiceAnswerKeys(question: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const push = (value: unknown) => {
    const key = normalizeVocabChoiceKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (Array.isArray(question.correctAnswers)) {
    question.correctAnswers.forEach(push);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[a-jA-J]|10|[1-9]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(correctAnswerText);
  }

  return keys;
}



export function validateVocabChoiceQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedMarkerCount: number | undefined,
  requestedAnswerCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);

  // 동의어 변형 모드: 정답이 아닌 단어도 의도적으로 원문과 다른 동의어로 표시되므로
  // "정답 외 단어는 원문 그대로" 검사를 완화한다(위치 앵커 originalWord만 본문에 존재 요구).
  const vocabVariantMode =
    normalizeText(question.vocabDisplayMode).toUpperCase() === "SYNONYM_VARIANT";

  // Expected counts: teacher-requested when provided, otherwise infer a valid
  // 5~10 count from the question itself (legacy default 5).
  const expectedMarkerCount =
    requestedMarkerCount ??
    (markedWords.length >= VOCAB_CHOICE_MARKER_COUNT_MIN &&
    markedWords.length <= VOCAB_CHOICE_MARKER_COUNT_MAX
      ? markedWords.length
      : VOCAB_CHOICE_MARKER_COUNT_DEFAULT);
  const expectedAnswerCount = requestedAnswerCount ?? 1;

  if (markedWords.length !== expectedMarkerCount) {
    add(
      "error",
      "vocab-marker-count",
      `VOCAB_CHOICE must have exactly ${expectedMarkerCount} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "vocab-missing-passage-markers", "VOCAB_CHOICE is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([a-jA-J])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toLowerCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== expectedMarkerCount) {
    add(
      "error",
      "vocab-render-marker-count",
      `VOCAB_CHOICE passageWithMarkers must render exactly ${expectedMarkerCount} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== expectedMarkerCount) {
    add(
      "error",
      "vocab-render-label-format",
      `VOCAB_CHOICE rendered markers must use __(a) word__ through __(${VOCAB_CHOICE_KEYS[expectedMarkerCount - 1]}) word__ format.`,
    );
  }

  const labels = markedWords.map((word, index) => normalizeVocabChoiceKey(word.label, index));
  const duplicateLabel = findDuplicate(labels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "vocab-duplicate-label", `Duplicate VOCAB_CHOICE marked label: (${duplicateLabel}).`);
  }

  const inappropriateWords = markedWords.filter((word) => word.isInappropriate === true);
  if (inappropriateWords.length !== expectedAnswerCount) {
    add(
      "error",
      "vocab-inappropriate-count",
      `VOCAB_CHOICE must have exactly ${expectedAnswerCount} isInappropriate=true item(s), got ${inappropriateWords.length}.`,
    );
  }

  const answerKeys = collectVocabChoiceAnswerKeys(question);
  if (answerKeys.length !== expectedAnswerCount) {
    add(
      "error",
      "vocab-answer-count",
      `VOCAB_CHOICE correctAnswer must point to exactly ${expectedAnswerCount} label(s), got ${answerKeys.length}.`,
    );
  }

  const inappropriateKeys = inappropriateWords
    .map((word) => normalizeVocabChoiceKey(word.label))
    .filter(Boolean);
  const answerSetMatches =
    inappropriateKeys.length === answerKeys.length &&
    inappropriateKeys.every((key) => answerKeys.includes(key));
  if (inappropriateKeys.length > 0 && answerKeys.length > 0 && !answerSetMatches) {
    add(
      "error",
      "vocab-answer-label-mismatch",
      `VOCAB_CHOICE correctAnswer must match the inappropriate label set (${inappropriateKeys
        .map(vocabChoiceAnswerLabelFromKey)
        .join(", ")}).`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionByKey = new Map<string, Record<string, unknown>>();
  options.forEach((option, index) => {
    const key = normalizeVocabChoiceKey(option.label, index);
    if (key) optionByKey.set(key, option);
  });

  for (const [index, markedWord] of markedWords.entries()) {
    const key = normalizeVocabChoiceKey(markedWord.label, index);
    const renderedWord = renderedByKey.get(key);
    const isInappropriate = markedWord.isInappropriate === true;
    const originalWord = normalizeText(markedWord.originalWord);
    const substituteWord = normalizeText(markedWord.substituteWord);
    const displayedWord =
      normalizeText(markedWord.word) ||
      (isInappropriate ? substituteWord : originalWord);
    const betterWord = normalizeText(markedWord.betterWord);

    if (!key) {
      add("error", "vocab-label-format", "VOCAB_CHOICE markedWords labels must be (a) through (e).");
      continue;
    }

    if (!renderedWord) {
      add("error", "vocab-render-missing-label", `VOCAB_CHOICE passageWithMarkers is missing label (${key}).`);
    } else if (
      displayedWord &&
      normalizeComparableText(renderedWord) !== normalizeComparableText(displayedWord)
    ) {
      add(
        "error",
        "vocab-render-word-mismatch",
        `VOCAB_CHOICE label (${key}) renders "${renderedWord}" but markedWords says "${displayedWord}".`,
      );
    }

    const option = optionByKey.get(key);
    const optionText = normalizeText(option?.text);
    if (
      optionText &&
      displayedWord &&
      normalizeComparableText(optionText) !== normalizeComparableText(displayedWord)
    ) {
      add(
        "error",
        "vocab-option-word-mismatch",
        `VOCAB_CHOICE option (${key}) must show the same word as the passage marker.`,
      );
    }

    if (isInappropriate) {
      const visibleWrongWord = substituteWord || displayedWord;
      const sourceCorrectWord = betterWord || originalWord;
      if (!visibleWrongWord) {
        add("error", "vocab-missing-substitute", `VOCAB_CHOICE answer (${key}) is missing the displayed wrong word.`);
      }
      if (!sourceCorrectWord) {
        add("error", "vocab-missing-better-word", `VOCAB_CHOICE answer (${key}) is missing the source-correct betterWord.`);
      }
      if (
        visibleWrongWord &&
        sourceCorrectWord &&
        normalizeComparableText(visibleWrongWord) === normalizeComparableText(sourceCorrectWord)
      ) {
        add("error", "vocab-not-mutated", `VOCAB_CHOICE answer (${key}) did not replace the source word.`);
      }
      if (
        originalWord &&
        betterWord &&
        normalizeComparableText(originalWord) !== normalizeComparableText(betterWord)
      ) {
        add("error", "vocab-better-word-mismatch", `VOCAB_CHOICE betterWord for (${key}) must equal originalWord.`);
      }
      if (
        renderedWord &&
        visibleWrongWord &&
        normalizeComparableText(renderedWord) !== normalizeComparableText(visibleWrongWord)
      ) {
        add("error", "vocab-answer-not-rendered", `VOCAB_CHOICE answer (${key}) must render the wrong substitute word.`);
      }
      if (passage && sourceCorrectWord && !containsLoose(passage, sourceCorrectWord)) {
        add(
          "error",
          "vocab-better-word-not-source-backed",
          `VOCAB_CHOICE betterWord for (${key}) must exist in the original passage.`,
        );
      }
      // (g) 원단어 잔존 누설: 치환 전 단어가 본문 마커 밖에 또 보이면 즉답 가능.
      if (sourceCorrectWord && sourceWordVisibleOutsideMarkers(passageWithMarkers, sourceCorrectWord)) {
        add(
          "error",
          "vocab-source-word-visible",
          `VOCAB_CHOICE answer (${key}) source word "${sourceCorrectWord}" still appears elsewhere in the passage, revealing the answer.`,
        );
      }
    } else if (vocabVariantMode) {
      // 변형 모드: 표시 단어는 의도된 동의어(비-verbatim)이므로 원문 일치/본문 존재
      // 검사를 건너뛰고, 위치 앵커인 originalWord만 본문에 존재하면 된다.
      if (betterWord) {
        add("error", "vocab-nonanswer-has-better-word", `VOCAB_CHOICE non-answer (${key}) must not have betterWord.`);
      }
      if (passage && originalWord && !containsLoose(passage, originalWord)) {
        add(
          "error",
          "vocab-nonanswer-source-anchor-missing",
          `VOCAB_CHOICE non-answer (${key}) source word "${originalWord}" must exist in the original passage.`,
        );
      }
    } else {
      if (betterWord) {
        add("error", "vocab-nonanswer-has-better-word", `VOCAB_CHOICE non-answer (${key}) must not have betterWord.`);
      }
      if (
        originalWord &&
        displayedWord &&
        normalizeComparableText(originalWord) !== normalizeComparableText(displayedWord)
      ) {
        add(
          "error",
          "vocab-nonanswer-not-source-word",
          `VOCAB_CHOICE non-answer (${key}) must display the original source word.`,
        );
      }
      if (passage && displayedWord && !containsLoose(passage, displayedWord)) {
        add(
          "error",
          "vocab-nonanswer-not-source-backed",
          `VOCAB_CHOICE non-answer (${key}) must exist in the original passage.`,
        );
      }
    }
  }

  if (vocabVariantMode) {
    // 누설 가드: 정답의 정답 단어(source-correct)가 다른 밑줄칸의 "표시 단어"(동의어)로
    // 우연히 노출되면 학생이 정답을 역추론할 수 있다. 기존 vocab-source-word-visible은
    // 마커 밖 본문만 검사하므로, 변형 모드에서 새로 생긴 이 벡터를 여기서 막는다.
    const answerSourceWords = markedWords
      .filter((markedWord) => markedWord.isInappropriate === true)
      .map(
        (markedWord) =>
          normalizeText(markedWord.betterWord) ||
          normalizeText(markedWord.originalWord),
      )
      .filter(Boolean);
    markedWords.forEach((markedWord, index) => {
      if (markedWord.isInappropriate === true) return;
      const shown =
        normalizeText(markedWord.word) ||
        normalizeText(markedWord.substituteWord) ||
        normalizeText(markedWord.originalWord);
      if (
        shown &&
        answerSourceWords.some(
          (answerWord) =>
            normalizeComparableText(answerWord) ===
            normalizeComparableText(shown),
        )
      ) {
        add(
          "error",
          "vocab-variant-answer-word-exposed",
          `VOCAB_CHOICE 변형 모드: 밑줄 (${normalizeVocabChoiceKey(markedWord.label, index)})의 표시 단어가 정답의 정답 단어와 같아 정답이 노출됩니다.`,
        );
      }
    });

    // 정답 외 단어가 하나도 동의어로 바뀌지 않았으면 암기 무력화 효과가 없으므로 경고한다
    // (생성 차단은 아님 — 일부 단어는 좋은 동의어가 없을 수 있음).
    const anyDisguised = markedWords.some((markedWord) => {
      if (markedWord.isInappropriate === true) return false;
      const original = normalizeText(markedWord.originalWord);
      const shown =
        normalizeText(markedWord.word) ||
        normalizeText(markedWord.substituteWord) ||
        original;
      return (
        original &&
        shown &&
        normalizeComparableText(original) !== normalizeComparableText(shown)
      );
    });
    if (!anyDisguised) {
      add(
        "warning",
        "vocab-variant-not-applied",
        "VOCAB_CHOICE 동의어 변형 모드인데 정답 외 단어가 모두 원문 그대로입니다. 암기 무력화 효과가 없습니다.",
      );
    }
  }

  // (f) 해설 메타 누출: 출제 변형 과정을 학생용 해설에 노출하지 않는다.
  if (explanationLeaksMutationProcess(normalizeText(question.explanation))) {
    add(
      "warning",
      "vocab-explanation-meta-leak",
      "VOCAB_CHOICE explanation should not narrate the mutation process (e.g. \"changed X to Y\"); explain why the word is contextually wrong instead.",
    );
  }
}
