import { formatGrammarCorrectionCorrectAnswerForStoredQuestion } from "./grammar-correction-display";
import { getCircledNumber } from "./question-postprocess/types";

type StoredQuestionCorrectAnswerLike = {
  subType?: unknown;
  _typeId?: unknown;
  typeId?: unknown;
  correctAnswer?: unknown;
  correctAnswers?: unknown;
  structuredData?: unknown;
};

const VOCAB_CHOICE_KEYS = "abcdefghij";
const CIRCLED_NUMBER_PATTERN = "\u2460-\u2473\u3251-\u325F\u32B1-\u32BF";

function normalizeDisplayString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function circledNumberIndex(value: string): number | null {
  const codePoint = value.codePointAt(0);
  if (codePoint === undefined || value.length === 0) return null;
  if (codePoint >= 0x2460 && codePoint <= 0x2473) return codePoint - 0x2460;
  if (codePoint >= 0x3251 && codePoint <= 0x325f) return codePoint - 0x3251 + 20;
  if (codePoint >= 0x32b1 && codePoint <= 0x32bf) return codePoint - 0x32b1 + 35;
  return null;
}

function vocabChoiceAnswerIndex(value: unknown): number | null {
  const text = normalizeDisplayString(value);
  if (!text) return null;

  const circledIndex = circledNumberIndex(text);
  if (circledIndex !== null && circledIndex >= 0 && circledIndex < VOCAB_CHOICE_KEYS.length) {
    return circledIndex;
  }

  const alpha = text.match(/^[\(\[]?\s*([a-jA-J])\s*[\)\].:]?$/);
  if (alpha) {
    const index = VOCAB_CHOICE_KEYS.indexOf(alpha[1].toLowerCase());
    return index >= 0 ? index : null;
  }

  const numeric = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    return index >= 0 && index < VOCAB_CHOICE_KEYS.length ? index : null;
  }

  return null;
}

function pushVocabChoiceAnswerLabel(labels: string[], value: unknown) {
  const index = vocabChoiceAnswerIndex(value);
  if (index === null) return;

  const label = String(index + 1);
  if (!labels.includes(label)) labels.push(label);
}

function collectVocabChoiceAnswerLabels(value: unknown, labels: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectVocabChoiceAnswerLabels(item, labels));
    return;
  }

  const text = normalizeDisplayString(value);
  if (!text) return;

  const tokenPattern = new RegExp(
    `(?:^|[\\s,;/])([\\(\\[]?\\s*(?:[a-jA-J]|10|[1-9]|[${CIRCLED_NUMBER_PATTERN}])\\s*[\\)\\].:]?)(?=$|[\\s,;/])`,
    "g",
  );
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text))) {
    pushVocabChoiceAnswerLabel(labels, match[1]);
    matched = true;
  }

  if (!matched) {
    pushVocabChoiceAnswerLabel(labels, text);
  }
}

export function formatVocabChoiceCorrectAnswer(
  correctAnswer: unknown,
  correctAnswers?: unknown,
): string {
  const labels: string[] = [];
  collectVocabChoiceAnswerLabels(correctAnswers, labels);
  collectVocabChoiceAnswerLabels(correctAnswer, labels);

  if (labels.length > 0) return labels.join(", ");
  return normalizeDisplayString(correctAnswer);
}

function storedQuestionType(question: StoredQuestionCorrectAnswerLike): string {
  return normalizeDisplayString(question.subType || question._typeId || question.typeId);
}

// 어법 판단(GRAMMAR_ERROR) 정답 라벨을 시험지/지문 마커와 동일한 원형숫자로 통일한다.
// 지문 마커는 ①②③(원형)인데 정답표는 (A)/(C) 알파벳으로 나와 불일치가 났다(정답표 오독).
// (A)~(J) 괄호 라벨만 ①~⑩ 로 변환하며, 이미 원형(③)이거나 라벨이 아닌 텍스트는 그대로 둔다.
const GRAMMAR_ALPHA_LABELS = "ABCDEFGHIJ";
function circleGrammarAnswerLabels(text: string): string {
  return text.replace(/\(([A-Ja-j])\)/g, (full, letter: string) => {
    const index = GRAMMAR_ALPHA_LABELS.indexOf(letter.toUpperCase());
    return index >= 0 ? getCircledNumber(index) : full;
  });
}

export function formatStoredQuestionCorrectAnswer(
  question: StoredQuestionCorrectAnswerLike,
): string {
  if (storedQuestionType(question) === "VOCAB_CHOICE") {
    return formatVocabChoiceCorrectAnswer(
      question.correctAnswer,
      question.correctAnswers,
    );
  }

  if (storedQuestionType(question) === "GRAMMAR_ERROR") {
    const raw =
      normalizeDisplayString(question.correctAnswer) ||
      (Array.isArray(question.correctAnswers)
        ? question.correctAnswers.map((v) => normalizeDisplayString(v)).filter(Boolean).join(", ")
        : "");
    return circleGrammarAnswerLabels(raw);
  }

  return formatGrammarCorrectionCorrectAnswerForStoredQuestion(question);
}
