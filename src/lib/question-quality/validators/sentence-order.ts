// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES, SENTENCE_ORDER_MIN_PARAGRAPH_WORDS, collectCorrectAnswerLabels, countDisplaySentences, countWords, findDuplicate, isRecord, normalizeComparableText, normalizeLabel, normalizeText } from "../core";


export const SENTENCE_ORDER_PARAGRAPH_LABELS = ["(A)", "(B)", "(C)"] as const;


export const SENTENCE_ORDER_MAX_GIVEN_SENTENCES = 2;


export const SENTENCE_ORDER_MAX_GIVEN_WORDS = 70;


export const SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO = 1.9;


export const SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO = 1.3;



export function validateSentenceOrderQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const givenSentence = normalizeText(question.givenSentence);
  if (!givenSentence) {
    add("error", "sentence-order-missing-given", "SENTENCE_ORDER is missing givenSentence.");
  }

  const givenSentenceCount = countDisplaySentences(givenSentence);
  const givenWordCount = countWords(givenSentence);
  if (
    givenSentence &&
    (givenSentenceCount < 1 || givenSentenceCount > SENTENCE_ORDER_MAX_GIVEN_SENTENCES)
  ) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence must be 1-2 sentences, got ${givenSentenceCount}.`,
    );
  }
  if (givenWordCount > SENTENCE_ORDER_MAX_GIVEN_WORDS) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence is too long (${givenWordCount} words). Use only the first 1-2 sentences.`,
    );
  }
  if (/[（(]\s*[ABC]\s*[）)]/.test(givenSentence)) {
    add(
      "error",
      "sentence-order-given-too-long",
      "SENTENCE_ORDER givenSentence appears to contain paragraph labels; split given and (A)/(B)/(C) separately.",
    );
  }

  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter(isRecord)
    : [];
  if (paragraphs.length !== 3) {
    add(
      "error",
      "sentence-order-paragraph-count",
      `SENTENCE_ORDER must have exactly 3 paragraphs, got ${paragraphs.length}.`,
    );
  }

  const paragraphWordCounts: number[] = [];
  const normalizedLabels: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const expectedLabel = SENTENCE_ORDER_PARAGRAPH_LABELS[index] ?? `(${index + 1})`;
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    normalizedLabels.push(label);
    const text = normalizeText(paragraph.text);
    const sentenceCount = countDisplaySentences(text);
    const wordCount = countWords(text);
    paragraphWordCounts.push(wordCount);

    // C4-c (1) 라벨 오염: 단락 라벨에 순서 숫자(1/②)가 섞이면 정답 순서가 노출.
    const rawLabel = normalizeText(paragraph.label);
    if (/[0-9①-⑳]/.test(rawLabel)) {
      add(
        "error",
        "sentence-order-label-order-leak",
        "단락 라벨에 순서 숫자가 포함돼 정답 순서가 노출됩니다. 라벨은 (A)/(B)/(C)만 쓰세요.",
      );
    }
    // C4-c (2) 본문 선두 순서표식: 본문 앞에 순서 번호("1."·"②"·"(2)")가 붙으면 순서 노출.
    //  - bareNum: 1~2자리 숫자 + 구분자(.)·) + 뒤에 영문 → "1. The…". 소수점("3.14": 숫자 뒤
    //    또 숫자)·콜론("20: ")은 제외해 본문 수치/시각 표기 오탐 방지.
    //  - circled: 원숫자(①-⑳)/괄호숫자("(2)"/"[2]")는 구분자 없이도 순서표식 → "② Next"·"(2) Then" 포착.
    const bareNumPrefix = /^\s*[0-9]{1,2}(?![0-9])\s*[.)·]\s*(?=[A-Za-z])/;
    const circledPrefix = /^\s*(?:[①-⑳]|[(\[][0-9]{1,2}[)\]])\s*[.)·]?\s*(?=[A-Za-z])/;
    if (bareNumPrefix.test(text) || circledPrefix.test(text)) {
      add(
        "error",
        "sentence-order-text-order-prefix",
        "단락 본문 앞에 순서 번호(1./②/(2) 등)가 붙어 정답 순서가 노출됩니다. 본문은 순수 텍스트만 두세요.",
      );
    }

    if (label !== expectedLabel) {
      add(
        "error",
        "sentence-order-paragraph-labels",
        `SENTENCE_ORDER paragraph labels must be (A), (B), (C) in order; got ${normalizedLabels.join(", ")}.`,
      );
    }
    if (sentenceCount < SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES) {
      add(
        "error",
        "sentence-order-paragraph-too-short",
        `SENTENCE_ORDER paragraph ${expectedLabel} must contain at least ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES} sentences, got ${sentenceCount}.`,
      );
    }
    if (wordCount < SENTENCE_ORDER_MIN_PARAGRAPH_WORDS) {
      add(
        "error",
        "sentence-order-paragraph-too-thin",
        `SENTENCE_ORDER paragraph ${expectedLabel} is too short (${wordCount} words).`,
      );
    }
  }

  const positiveParagraphCounts = paragraphWordCounts.filter((count) => count > 0);
  if (positiveParagraphCounts.length === 3) {
    const minWords = Math.min(...positiveParagraphCounts);
    const maxWords = Math.max(...positiveParagraphCounts);
    const avgWords =
      positiveParagraphCounts.reduce((sum, count) => sum + count, 0) /
      positiveParagraphCounts.length;

    if (minWords > 0 && maxWords / minWords > SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO) {
      add(
        "error",
        "sentence-order-paragraph-imbalance",
        `SENTENCE_ORDER (A)/(B)/(C) chunks are imbalanced (${positiveParagraphCounts.join("/")} words).`,
      );
    }

    if (
      givenWordCount > 0 &&
      avgWords > 0 &&
      givenWordCount / avgWords > SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO
    ) {
      add(
        "error",
        "sentence-order-given-too-long-relative",
        `SENTENCE_ORDER givenSentence (${givenWordCount} words) is longer than the balanced A/B/C chunk average (${Math.round(avgWords)} words).`,
      );
    }
  }

  validateSentenceOrderOptions(question, add);
  validateSentenceOrderAnswerReconstruction(question, passage, add);
}



/**
 * 정답 키 재구성 게이트 (wave1) — (A)/(B)/(C) 단락은 원본 지문의 verbatim 분할이므로,
 * 주장된 정답 순열대로 단락을 늘어놓았을 때 각 단락의 "원문 내 위치"가 엄격히
 * 증가해야 한다. 아니면 정답 키가 원문 흐름과 어긋난 것(정답 무효급).
 * 단락이 정규화 후에도 원문에서 verbatim 으로 발견되지 않으면 추측하지 않고
 * sentence-order-paragraph-not-source-backed 로 차단한다. (givenSentence 는
 * 패러프레이즈가 허용되므로 대조하지 않는다.) 두 코드 모두 RELAXED_BLOCKING.
 */
export function validateSentenceOrderAnswerReconstruction(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 구두점 무관 대조 (wave5 오탐 수정): normalizeComparableText 는 곡선따옴표만
  // 접고 em-dash(—)·수평바(―)·말줄임(…)·NBSP 는 못 접는다 — sonnet-5 가 출력에서
  // 구두점을 정규화하면 verbatim 대조가 깨져 정상 문항이 전멸했다(실측 26-07-05
  // final-prem: PREMIUM 두 난이도 0생성, 베이스라인 98점 셀). 알파넘+공백만 남겨
  // 대조하면 구두점 변형은 통과시키되 단어 수준 재작성은 여전히 차단한다.
  const foldForSourceMatch = (value: string) =>
    normalizeComparableText(value)
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedPassage = foldForSourceMatch(passage ?? "");
  if (!normalizedPassage) return;

  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter(isRecord)
    : [];
  if (paragraphs.length !== 3) return; // 개수 결함은 별도 게이트가 차단.

  const positionByLabel = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    const text = foldForSourceMatch(normalizeText(paragraph.text));
    if (!/^\([ABC]\)$/.test(label) || !text) return; // 라벨/본문 결함은 별도 게이트.
    const index = normalizedPassage.indexOf(text);
    if (index < 0) {
      add(
        "error",
        "sentence-order-paragraph-not-source-backed",
        `SENTENCE_ORDER paragraph ${label} is not found in the source passage even after punctuation-insensitive normalization; paragraphs must be verbatim source splits (do not rewrite their words), so the answer key cannot be verified.`,
      );
      return;
    }
    positionByLabel.set(label, index);
  }
  if (positionByLabel.size !== 3) return; // 라벨 중복 등은 별도 게이트가 차단.

  const answerLabel = collectCorrectAnswerLabels(question)[0];
  if (!answerLabel) return;
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctOption = options.find(
    (option) => normalizeLabel(option.label) === answerLabel,
  );
  const correctOrder = parseSentenceOrderPermutation(correctOption?.text);
  if (!correctOrder) return; // 순열 형태 결함은 별도 게이트가 차단.

  const orderedPositions = correctOrder.map((label) => positionByLabel.get(label) ?? -1);
  const isStrictlyIncreasing = orderedPositions.every(
    (position, index) => index === 0 || position > orderedPositions[index - 1],
  );
  if (!isStrictlyIncreasing) {
    const sourceOrder = [...positionByLabel.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label)
      .join("-");
    add(
      "error",
      "sentence-order-answer-key-mismatch",
      `SENTENCE_ORDER answer key ${correctOrder.join("-")} does not reconstruct the source passage; reading the paragraphs in source order gives ${sourceOrder}. Fix correctAnswer to point at the option matching the source order.`,
    );
  }
}



export function validateSentenceOrderOptions(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  const optionOrders = options.map((option) =>
    parseSentenceOrderPermutation(option.text),
  );
  const invalidOptionIndex = optionOrders.findIndex((order) => !order);
  if (invalidOptionIndex >= 0) {
    add(
      "error",
      "sentence-order-option-permutation",
      `SENTENCE_ORDER option ${invalidOptionIndex + 1} is not a valid (A)/(B)/(C) permutation.`,
    );
  }

  const validOrderTexts = optionOrders
    .filter((order): order is string[] => Array.isArray(order))
    .map((order) => order.join("-"));
  const duplicateOrder = findDuplicate(validOrderTexts);
  if (duplicateOrder) {
    add(
      "error",
      "sentence-order-option-duplicates",
      `SENTENCE_ORDER has duplicate order option: ${duplicateOrder}.`,
    );
  }

  const answerLabels = collectCorrectAnswerLabels(question);
  const answerLabel = answerLabels[0];
  if (!answerLabel) return;
  const correctOption = options.find(
    (option) => normalizeLabel(option.label) === answerLabel,
  );
  if (!correctOption) return;

  const correctOrder = parseSentenceOrderPermutation(correctOption.text);
  if (!correctOrder) {
    add(
      "error",
      "sentence-order-correct-option-shape",
      "SENTENCE_ORDER correct option must be a valid (A)/(B)/(C) permutation.",
    );
    return;
  }
  if (correctOrder.join("-") === "(A)-(B)-(C)") {
    add(
      "error",
      "sentence-order-unscrambled-answer",
      "SENTENCE_ORDER correct order must not be the displayed (A)-(B)-(C) order; shuffle labels so students cannot pick the visible order.",
    );
  }
}



export function normalizeSentenceOrderParagraphLabel(value: unknown): string {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/[ABC]/);
  return match ? `(${match[0]})` : text;
}



export function parseSentenceOrderPermutation(value: unknown): string[] | null {
  const text = normalizeText(value).toUpperCase();
  const labels = [...text.matchAll(/[（(]\s*([ABC])\s*[）)]/g)].map(
    (match) => `(${match[1]})`,
  );
  if (labels.length !== 3) return null;
  const unique = new Set(labels);
  if (unique.size !== 3) return null;
  return SENTENCE_ORDER_PARAGRAPH_LABELS.every((label) => unique.has(label))
    ? labels
    : null;
}
