// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { splitPassageSentences as splitSharedPassageSentences } from "@/lib/passage-sentence-utils";
import { getCircledNumbers } from "@/lib/question-postprocess/types";



export type QuestionQualitySeverity = "error" | "warning";



export interface QuestionQualityIssue {
  severity: QuestionQualitySeverity;
  code: string;
  message: string;
}



/**
 * SHIP-FIRST 정책: 강사가 고른 지문+유형+난이도는 확정된 의도다. 아래 코드들은
 * "정답 무효/노출/형식 깨짐" 같은 명백한 결함이 아니라 **난이도·취향**(KILLER치고
 * 쉬움·이상적 타깃 아님·미관·학생 비노출 메타 완성도)만 가리킨다. 151개 차단코드
 * 과거 전수 감사에서 B로 분류된 목록을 현재 validity 근거로 재감사한 결과 — `validateQuestionQuality` 반환
 * 직전에 severity:'error'→'warning' 으로 강등해 strict/relaxed 양쪽에서 비차단으로
 * 만든다(삭제 아님 — 검수 UI 가시성은 _qualityWarnings 로 보존). 정답 유효성/명료성을
 * 해치는 인접 코드(implied-meaning-direct-answer-leak, irrelevant-too-many-new-terms,
 * grammar-debatable-infinitive 등)는 의도적으로 제외 — 정확한 문자열 집합으로만 강등한다.
 * 근거: docs/GENERATION-ENGINE-REDESIGN-ROADMAP.md §4 WS1. 이름과 달리 실제
 * 치환 문장을 비문으로 만드는 코드는 이 목록에서 제외하고 blocking으로 유지한다.
 */
export const SHIP_FIRST_WARNING_CODES = new Set<string>([
  "grammar-decoy-point-diversity",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "blank-killer-target-too-easy",
  "blank-target-too-small",
  "blank-target-list-like",
  "blank-paraphrase-correct-too-thin",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-giveaway-distractors",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-target-too-wide",
  "blank-paraphrase-target-trailing-function",
  "irrelevant-too-unrelated",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "sentence-order-given-too-long",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-imbalance",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-thin-reasoning-gap",
  "summary-mc-awkward-collocation",
  "summary-mc-missing-half-correct-traps",
]);



export type VisibleQuestionLanguage = "ko" | "en";



export const IRRELEVANT_SLOT_MIN = 5;


export const GRAMMAR_CORRECTION_ERROR_COUNT_MIN = 1;


export const GRAMMAR_CORRECTION_ERROR_COUNT_MAX = 5;


export const VOCAB_CHOICE_MARKER_COUNT_MIN = 5;


export const VOCAB_CHOICE_MARKER_COUNT_MAX = 10;


export const SENTENCE_INSERT_SLOT_MIN = 5;


export const SENTENCE_INSERT_SLOT_MAX = 8;


export const ANTONYM_MARKER_COUNT_DEFAULT = 5;


export const ANTONYM_MARKER_COUNT_MIN = 5;


export const ANTONYM_MARKER_COUNT_MAX = 10;


export const SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES = 2;


export const SENTENCE_ORDER_MIN_PARAGRAPH_WORDS = 24;



export function normalizeGrammarCorrectionErrorCount(errorCount: unknown): number {
  const n = typeof errorCount === "number" ? errorCount : Number(errorCount);
  if (!Number.isFinite(n)) return GRAMMAR_CORRECTION_ERROR_COUNT_MIN;
  return Math.min(
    GRAMMAR_CORRECTION_ERROR_COUNT_MAX,
    Math.max(GRAMMAR_CORRECTION_ERROR_COUNT_MIN, Math.round(n)),
  );
}



/**
 * 지문에 2회 이상 등장하는 구(3~6단어 n-gram, 최장 우선)를 수집한다.
 * 다중 빈칸에서 반복 구를 빈칸으로 잡으면 남은 출현이 정답을 누설하므로,
 * 소프트 규칙 대신 구체 목록으로 금지한다 (어법 논쟁 자리 금지 라인과 동일 패턴).
 */
export const REPEATED_PHRASE_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "at", "for", "with", "and", "or",
  "but", "is", "are", "was", "were", "be", "been", "being", "that", "this",
  "these", "those", "it", "its", "they", "their", "them", "he", "she", "his",
  "her", "we", "our", "us", "you", "your", "i", "my", "as", "by", "from",
  "not", "no", "do", "does", "did", "have", "has", "had", "will", "would",
  "can", "could", "should", "may", "might", "more", "most", "less", "than",
  "so", "if", "when", "who", "whom", "which", "what", "there", "here", "all",
  "also", "into", "about", "such", "one", "two", "very", "much", "many",
]);



export function toLowerTokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z'-]+/).filter(Boolean);
}



export function collectWrongOptionExplanations(value: unknown): Map<string, string> {
  const explanations = new Map<string, string>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const label = normalizeLabel(item.label);
      const explanation = normalizeText(item.explanation);
      if (label && explanation) explanations.set(label, explanation);
    }
    return explanations;
  }

  if (!isRecord(value)) return explanations;
  for (const [rawLabel, rawExplanation] of Object.entries(value)) {
    const label = normalizeLabel(rawLabel);
    const explanation = normalizeText(rawExplanation);
    if (label && explanation) explanations.set(label, explanation);
  }
  return explanations;
}



export function collectCorrectAnswerLabels(question: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const push = (value: unknown) => {
    const label = normalizeLabelOnly(value);
    if (label && !labels.includes(label)) labels.push(label);
  };

  if (Array.isArray(question.correctAnswers)) {
    for (const value of question.correctAnswers) push(value);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) {
      for (const match of matches) push(match);
    } else {
      push(correctAnswerText);
    }
  }

  return labels;
}



export function normalizeLabelOnly(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  if (getCircledNumbers(50).includes(text)) {
    return normalizeLabel(text);
  }
  if (/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/.test(text)) {
    return normalizeLabel(text);
  }
  return "";
}



export function hasInflectionalS(word: string): boolean {
  return (
    word.length > 3 &&
    word.endsWith("s") &&
    !/(?:ss|us|is|ous|less|ness)$/.test(word)
  );
}



export function antonymPairKey(value: string): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized || !isSingleEnglishToken(normalized)) return "";
  if (normalized.endsWith("ies")) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("ing") && normalized.length > 6) return normalized.slice(0, -3);
  if (normalized.endsWith("ed") && normalized.length > 5) return normalized.slice(0, -2);
  if (hasInflectionalS(normalized)) return normalized.slice(0, -1);
  return normalized;
}



export function countWordsForQuality(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countImpliedMeaningLexicalUnits(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) ?? []).length;
}

export function hasTrailingFunctionWord(text: string): boolean {
  const tokens = (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? []);
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  return IMPLIED_MEANING_TRAILING_FUNCTION_WORDS.has(last);
}

export const IMPLIED_MEANING_TRAILING_FUNCTION_WORDS = new Set([
  "about", "above", "across", "after", "against", "along", "among", "around",
  "as", "at", "before", "behind", "below", "beneath", "between", "beyond",
  "but", "by", "despite", "during", "for", "from", "if", "in", "inside",
  "into", "like", "near", "of", "off", "on", "onto", "or", "over", "since",
  "than", "through", "to", "toward", "towards", "under", "unless", "until",
  "upon", "while", "with", "within", "without",
]);

export function containsLoose(text: string, fragment: string): boolean {
  return normalizeComparableText(text).includes(normalizeComparableText(fragment));
}



export function hasTrailingFunctionWordBlankTarget(text: string): boolean {
  return /\b(?:will|shall|can|could|would|should|must|may|might|do|does|did|is|are|was|were|be|being|been|to)$/i.test(
    normalizeText(text),
  );
}



// ---------------------------------------------------------------------------
// 요약문 영작 (SUMMARY_WRITING) — 서술형 품질게이트 (바이블 §7 SW-GATE-*)
// 학생은 빈칸에 다단어 어구를 직접 영작한다(객관식 선지 없음, options=null).
// 정답계열(blanks[].answer / modelAnswer / acceptableVariants / wordBankDistractors
// / scoringCriteria)은 학생 노출 필드(summaryWithBlanks / koreanGloss / wordBank /
// firstLetterHint)에 새어나가면 안 된다 — 누수 게이트는 RELAXED_BLOCKING 에 포함해
// relaxed 폴백에서도 출하 금지.
// ---------------------------------------------------------------------------

/** answer/modelAnswer 누수 검사용 — 비교 가능 토큰(소문자, 길이 4+ 의미 토큰)으로 분해. */
export function summaryWritingComparableTokens(value: string): string[] {
  const normalized = normalizeComparableText(value);
  if (!normalized) return [];
  return (normalized.match(/[a-z]+(?:[-'][a-z]+)*/g) ?? []).filter(
    (token) => token.length >= 4,
  );
}



export function countLiteral(text: string, literal: string): number {
  if (!text || !literal) return 0;
  return text.split(literal).length - 1;
}



/**
 * 영작형 누수 게이트: 정답 어구의 "연속 내용토큰(≥4글자) 런"이 원본 지문에 그대로
 * 나타나는지 검사한다. 영작형(SUMMARY_WRITING / TOPIC_SENTENCE_WRITING / WORD_ORDER /
 * CONDITIONAL_WRITING)은 원본 지문이 문제 안에 INLINE 으로 함께 노출되므로, 정답이
 * 지문 문장의 verbatim/near-verbatim 이면 학생이 그대로 베껴 쓸 수 있다(영작 무력화 = 본문 답 노출).
 * 내용토큰만 비교(summaryWritingComparableTokens — 기능어/관사/전치사 등 <4글자 제외)하므로
 * 어형/관사 차이를 흡수한다. minRun(기본 3) 이상 연속 일치 시 그 어구를 반환, 없으면 "".
 * 단일·이중 내용어 공유는 paraphrase 의 자연스러운 겹침이라 허용(거짓양성 회피).
 */
export function answerRunInPassage(
  answer: string,
  passage: string,
  minRun = 3,
): string {
  const ans = summaryWritingComparableTokens(answer);
  const psg = summaryWritingComparableTokens(passage);
  if (ans.length < minRun || psg.length < minRun) return "";
  const psgSeq = ` ${psg.join(" ")} `;
  for (let len = ans.length; len >= minRun; len -= 1) {
    for (let i = 0; i + len <= ans.length; i += 1) {
      const run = ans.slice(i, i + len).join(" ");
      if (psgSeq.includes(` ${run} `)) return run;
    }
  }
  return "";
}



export function countDisplaySentences(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const splitSentences = splitSharedPassageSentences(text);
  if (splitSentences.length > 0) return splitSentences.length;
  const punctuationSentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(\[])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return Math.max(1, punctuationSentences.length);
}



export function countWords(value: string): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const words = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g);
  return words?.length ?? 0;
}



export function findMarkers(text: string): Array<{ start: number; end: number; inner: string }> {
  const markers: Array<{ start: number; end: number; inner: string }> = [];
  const regex = /__([^_]+)__/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      inner: match[1],
    });
  }
  return markers;
}



export function countUnderlineMarkers(text: string): number {
  return findMarkers(text).length;
}



export function containsStandaloneToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}



export function isSingleAbstractNounTarget(text: string): boolean {
  return /^(?:variation|diversity|complexity|simplicity|trust|efficiency|confidence|comfort|progress|order|freedom|creativity|reason|emotion|memory|feedback|logic|reasoning|value|values|calculation)$/i.test(text.trim());
}



export function isListLikeBlankTarget(text: string): boolean {
  const normalized = normalizeText(text);
  const commaCount = (normalized.match(/,/g) ?? []).length;
  return (
    normalized.includes(":") ||
    normalized.includes(";") ||
    commaCount >= 2 ||
    normalized.length > 90 ||
    countContentTokens(normalized) > 11
  );
}



export function isLowValueKillerBlankTarget(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;
  if (
    /\b(?:both|each|one another)\b.*\b(?:review|reviews|interact|interacts|communicate|communicates|share|shares)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (
    /^(?:both parties|each party|users|people|students|companies|platforms)\s+\w+(?:\s+\w+){0,3}$/.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}



export function countContentTokens(text: string): number {
  return contentTokens(text).size;
}



export function isTinyFunctionWord(value: string): boolean {
  return /^(a|an|the|it|its|is|are|was|were|be|been|in|on|at|to|of|for|as|by|or|and|but)$/i.test(value.trim());
}



export function isSingleEnglishToken(value: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(value.trim());
}



export function splitPassageSentences(
  passage: string,
  { includeShort = false }: { includeShort?: boolean } = {},
): string[] {
  const sentences = splitSharedPassageSentences(passage)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return includeShort
    ? sentences
    : sentences.filter((sentence) => sentence.length >= 20);
}



export function containsComparableSentence(passage: string, sentence: string): boolean {
  const comparablePassage = normalizeComparableText(passage);
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  return comparableSentence.length >= 20 && comparablePassage.includes(comparableSentence);
}



export function normalizeComparableText(value: string): string {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}



export const IRRELEVANT_TOKEN_STOPWORDS = new Set([
  "about",
  "above",
  "across",
  "after",
  "again",
  "against",
  "also",
  "although",
  "among",
  "because",
  "before",
  "being",
  "between",
  "could",
  "during",
  "every",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "using",
  "when",
  "where",
  "which",
  "while",
  "with",
  "within",
  "without",
  "would",
]);



export function contentTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? [];
  const content = new Set<string>();
  for (const token of tokens) {
    if (IRRELEVANT_TOKEN_STOPWORDS.has(token)) continue;
    content.add(token);
    for (const part of token.split("-")) {
      if (part.length > 3 && !IRRELEVANT_TOKEN_STOPWORDS.has(part)) content.add(part);
    }
    const stem = lightStemContentToken(token);
    if (stem !== token && !IRRELEVANT_TOKEN_STOPWORDS.has(stem)) content.add(stem);
  }
  return content;
}



export function countTokenOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}



export function lightStemContentToken(token: string): string {
  if (token.length > 7 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 6 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 6 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}



export function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circledMap: Record<string, string> = Object.fromEntries(
    getCircledNumbers(50).map((label, index) => [label, String(index + 1)]),
  );
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([A-Ja-j]|\d{1,3})[\)\].]?\s*$/, "$1")
    .toLowerCase();
}



export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}



export function containsHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}



export function containsLatinLetter(text: string): boolean {
  return /[A-Za-z]/.test(text);
}



export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}



export function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}
