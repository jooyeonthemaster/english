type GrammarCorrectionLike = {
  passageWithUnderline?: unknown;
  passageWithMarkers?: unknown;
  underlinedSegments?: unknown;
  errorParts?: unknown;
  sentenceWithError?: unknown;
  errorPart?: unknown;
  correctedParts?: unknown;
  correctedPart?: unknown;
  correctAnswer?: unknown;
  direction?: unknown;
};

type GrammarCorrectionQuestionTextLike = {
  subType?: unknown;
  questionText?: unknown;
  structuredData?: unknown;
};

type GrammarCorrectionStoredQuestionLike = {
  subType?: unknown;
  _typeId?: unknown;
  typeId?: unknown;
  correctAnswer?: unknown;
  structuredData?: unknown;
};

type GrammarCorrectionQuestionTextOptions = {
  includeAnswerSlots?: boolean;
};

type GrammarCorrectionSegmentForDisplay = {
  label: string;
  errorPart: string;
  correctedPart: string;
};

const GRAMMAR_CORRECTION_LABELS = Array.from(
  { length: 10 },
  (_, index) => `(${String.fromCharCode(65 + index)})`,
);

const GRAMMAR_CORRECTION_ANSWER_BLANK = "____________________________";

export function grammarCorrectionLabel(index: number): string {
  return GRAMMAR_CORRECTION_LABELS[index] || `(${index + 1})`;
}

export function markGrammarCorrectionErrorPart(
  sentenceWithError: unknown,
  errorPart: unknown,
): string {
  const sentence = normalizeDisplayString(sentenceWithError);
  const target = normalizeDisplayString(errorPart);
  if (!sentence || !target) return sentence;

  const range = findDisplayRange(sentence, target);
  if (!range) return sentence;

  const surface = sentence.slice(range.index, range.index + range.length);
  return `${sentence.slice(0, range.index)}__${surface}__${sentence.slice(
    range.index + range.length,
  )}`;
}

export function grammarCorrectionErrorSentenceForQuestionText(
  question: GrammarCorrectionLike,
): string {
  const passageWithUnderline = normalizeDisplayString(question.passageWithUnderline);
  if (passageWithUnderline) {
    return labelGrammarCorrectionPassage(
      passageWithUnderline,
      readGrammarCorrectionSegmentsForDisplay(question),
    );
  }

  const passageWithMarkers = normalizeDisplayString(question.passageWithMarkers);
  if (passageWithMarkers) {
    return labelGrammarCorrectionPassage(
      passageWithMarkers,
      readGrammarCorrectionSegmentsForDisplay(question),
    );
  }

  return markGrammarCorrectionErrorPart(
    question.sentenceWithError,
    question.errorPart,
  );
}

export function formatGrammarCorrectionCorrectAnswer(
  question: GrammarCorrectionLike,
): string {
  const segments = readGrammarCorrectionSegmentsForDisplay(question);
  if (segments.length > 0) {
    // 오류가 하나면 빈칸이 하나뿐이라 라벨(A)이 불필요 — 고친 표현만 보인다("what").
    // 여러 개면 어느 빈칸의 답인지 구분되도록 라벨을 유지한다("(A) x, (B) y").
    if (segments.length === 1) {
      return normalizeDisplayString(segments[0].correctedPart);
    }
    return segments
      .map((segment) => [segment.label, segment.correctedPart].filter(Boolean).join(" "))
      .join(", ");
  }

  return normalizeDisplayString(question.correctAnswer);
}

// 카드·상세모달 화면 표시 전용: "틀린부분 → 고친부분"(예: "easily → easy"). 취소선 없이 파란 글씨용.
// 단일 구간이면 라벨 없음, 다중이면 "(A) e1 → c1, (B) e2 → c2". 정답표/저장 correctAnswer 는
// formatGrammarCorrectionCorrectAnswer(고친 부분만) 유지 — 화살표 표기는 여기서만.
export function formatGrammarCorrectionChange(
  question: GrammarCorrectionLike,
): string {
  const segments = readGrammarCorrectionSegmentsForDisplay(question);
  if (segments.length === 0) return normalizeDisplayString(question.correctAnswer);
  return segments
    .map((segment) => {
      const change =
        segment.errorPart && segment.correctedPart
          ? `${segment.errorPart} → ${segment.correctedPart}`
          : segment.correctedPart;
      return [segment.label, change].filter(Boolean).join(" ");
    })
    .join(", ");
}

export function formatGrammarCorrectionCorrectAnswerForStoredQuestion(
  question: GrammarCorrectionStoredQuestionLike,
): string {
  const fallback = normalizeDisplayString(question.correctAnswer);
  // 세트 멤버는 subType 대신 typeId(=q.subType 매핑)를 실어오므로 세 필드를 모두 본다
  // (storedQuestionType 과 동일 규약). `||` 사용 — 빈 문자열 subType 에도 안전하게 폴백.
  const resolvedType = normalizeDisplayString(
    question.subType || question._typeId || question.typeId,
  );
  if (resolvedType !== "GRAMMAR_CORRECTION") return fallback;
  return formatGrammarCorrectionCorrectAnswer(
    readStructuredData(question.structuredData),
  ) || fallback;
}

export function buildGrammarCorrectionAnswerSlots(
  question: GrammarCorrectionLike,
): string {
  const segments = readGrammarCorrectionSegmentsForDisplay(question);
  if (segments.length === 0) return "";
  return segments
    .map((segment) => [segment.label, GRAMMAR_CORRECTION_ANSWER_BLANK].filter(Boolean).join(" "))
    .join("\n");
}

export function buildGrammarCorrectionQuestionTextForDisplay(
  question: GrammarCorrectionLike,
  options: GrammarCorrectionQuestionTextOptions = {},
): string {
  const includeAnswerSlots = options.includeAnswerSlots !== false;
  const direction = normalizeDisplayString(question.direction);
  const markedPassage = grammarCorrectionErrorSentenceForQuestionText(question);
  const answerSlots = includeAnswerSlots
    ? buildGrammarCorrectionAnswerSlots(question)
    : "";

  return [direction, markedPassage, answerSlots].filter(Boolean).join("\n\n");
}

export function countGrammarCorrectionErrorMarkers(text: string): number {
  return (text.match(/__[^_]+__/g) ?? []).length;
}

export function repairGrammarCorrectionQuestionText(
  question: GrammarCorrectionQuestionTextLike,
  options: GrammarCorrectionQuestionTextOptions = {},
): string {
  const questionText = typeof question.questionText === "string" ? question.questionText : "";
  if (question.subType !== "GRAMMAR_CORRECTION") {
    return questionText;
  }

  const structuredData = readStructuredData(question.structuredData);
  const passageWithUnderline = normalizeDisplayString(structuredData.passageWithUnderline);
  if (passageWithUnderline.includes("__")) {
    return buildGrammarCorrectionQuestionTextForDisplay(
      {
        ...structuredData,
        direction:
          normalizeDisplayString(structuredData.direction) ||
          questionText.split(/\n{2,}/)[0]?.trim() ||
          "",
      },
      options,
    );
  }

  const passageWithMarkers = normalizeDisplayString(structuredData.passageWithMarkers);
  if (passageWithMarkers.includes("__")) {
    return buildGrammarCorrectionQuestionTextForDisplay(
      {
        ...structuredData,
        passageWithUnderline: passageWithMarkers,
        direction:
          normalizeDisplayString(structuredData.direction) ||
          questionText.split(/\n{2,}/)[0]?.trim() ||
          "",
      },
      options,
    );
  }

  return questionText;
}

export function repairLegacyGrammarCorrectionErrorSentence(
  question: GrammarCorrectionQuestionTextLike,
): string {
  const questionText = typeof question.questionText === "string" ? question.questionText : "";
  if (question.subType !== "GRAMMAR_CORRECTION" || questionText.includes("__")) {
    return questionText;
  }

  const structuredData = readStructuredData(question.structuredData);
  const markedSentence = grammarCorrectionErrorSentenceForQuestionText(structuredData);
  const rawSentence = normalizeDisplayString(structuredData.sentenceWithError);
  if (!markedSentence || !markedSentence.includes("__") || markedSentence === rawSentence) {
    return questionText;
  }

  const direction =
    normalizeDisplayString(structuredData.direction) ||
    questionText.split(/\n{2,}/)[0]?.trim() ||
    "";
  return [direction, markedSentence].filter(Boolean).join("\n\n");
}

function normalizeDisplayString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readGrammarCorrectionSegmentsForDisplay(
  question: GrammarCorrectionLike,
): GrammarCorrectionSegmentForDisplay[] {
  const rawSegments = Array.isArray(question.underlinedSegments)
    ? question.underlinedSegments
    : [];
  const errorParts = Array.isArray(question.errorParts)
    ? question.errorParts.map(normalizeDisplayString)
    : [];
  const correctedParts = Array.isArray(question.correctedParts)
    ? question.correctedParts.map(normalizeDisplayString)
    : [];

  const segments = rawSegments
    .filter((item): item is Record<string, unknown> => (
      typeof item === "object" &&
      item !== null &&
      !Array.isArray(item)
    ))
    .filter((item) => item.isError !== false)
    .map((item, index) => ({
      label: normalizeGrammarCorrectionLabel(item.label, index),
      errorPart:
        normalizeDisplayString(item.errorPart) ||
        errorParts[index] ||
        (index === 0 ? normalizeDisplayString(question.errorPart) : ""),
      correctedPart:
        normalizeDisplayString(item.correctedPart) ||
        correctedParts[index] ||
        (index === 0 ? normalizeDisplayString(question.correctedPart) : ""),
    }))
    .filter((item) => item.correctedPart);

  const resolved = segments.length > 0
    ? segments
    : (() => {
        const correctedPart = normalizeDisplayString(question.correctedPart || question.correctAnswer);
        if (!correctedPart) return [];
        return [{
          label: grammarCorrectionLabel(0),
          errorPart: normalizeDisplayString(question.errorPart),
          correctedPart,
        }];
      })();

  // 오류 구간이 하나뿐이면 (A) 라벨을 비운다 — 단일 구간은 라벨이 불필요(2개 이상만 (A)(B)(C) 부여).
  if (resolved.length === 1) return [{ ...resolved[0], label: "" }];
  return resolved;
}

function normalizeGrammarCorrectionLabel(value: unknown, index: number): string {
  const text = normalizeDisplayString(value);
  if (/^\([A-J]\)$/i.test(text)) return text.toUpperCase();
  if (/^[A-J]$/i.test(text)) return `(${text.toUpperCase()})`;
  return grammarCorrectionLabel(index);
}

function labelGrammarCorrectionPassage(
  passageWithUnderline: string,
  segments: GrammarCorrectionSegmentForDisplay[],
): string {
  let markerIndex = 0;
  return passageWithUnderline.replace(/__([^_]+)__/g, (full, inner: string) => {
    const trimmed = inner.trim();
    const existing = trimmed.match(/^\(([A-Ja-j])\)\s+(.+)$/);
    // 오류 구간이 하나면 라벨 없이 본문만 — 이미 구워진 (A)도 떼어낸다(단일 구간 라벨 제거).
    if (segments.length === 1) {
      return `__${existing ? existing[2] : trimmed}__`;
    }
    if (existing) {
      const normalizedLabel = `(${existing[1].toUpperCase()})`;
      return `__${normalizedLabel} ${existing[2]}__`;
    }

    const label = segments[markerIndex]?.label || grammarCorrectionLabel(markerIndex);
    markerIndex += 1;
    return `__${label} ${trimmed}__`;
  });
}

function readStructuredData(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function findDisplayRange(
  sentence: string,
  target: string,
): { index: number; length: number } | null {
  const exact = findDirectRange(sentence, target);
  if (exact) return exact;

  const lower = findDirectRange(sentence.toLowerCase(), target.toLowerCase());
  if (lower) return lower;

  return findWhitespaceTolerantRange(sentence, target);
}

function findDirectRange(
  sentence: string,
  target: string,
): { index: number; length: number } | null {
  let index = sentence.indexOf(target);
  while (index !== -1) {
    if (hasTokenBoundaries(sentence, index, target.length)) {
      return { index, length: target.length };
    }
    index = sentence.indexOf(target, index + 1);
  }
  return null;
}

function findWhitespaceTolerantRange(
  sentence: string,
  target: string,
): { index: number; length: number } | null {
  const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
  const normalizedTarget = target.replace(/\s+/g, " ").trim();
  const normalizedIndex = normalizedSentence
    .toLowerCase()
    .indexOf(normalizedTarget.toLowerCase());
  if (normalizedIndex === -1) return null;

  const start = mapNormalizedIndexToOriginal(sentence, normalizedIndex);
  const end = mapNormalizedIndexToOriginal(
    sentence,
    normalizedIndex + normalizedTarget.length,
  );
  if (start === null || end === null || end <= start) return null;
  if (!hasTokenBoundaries(sentence, start, end - start)) return null;
  return { index: start, length: end - start };
}

function mapNormalizedIndexToOriginal(
  original: string,
  normalizedIndex: number,
): number | null {
  let originalIndex = 0;
  let normalizedPosition = 0;

  while (originalIndex < original.length && /\s/.test(original[originalIndex])) {
    originalIndex++;
  }

  let previousWasSpace = false;
  while (originalIndex < original.length && normalizedPosition < normalizedIndex) {
    const char = original[originalIndex];
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        normalizedPosition++;
        previousWasSpace = true;
      }
      originalIndex++;
    } else {
      normalizedPosition++;
      previousWasSpace = false;
      originalIndex++;
    }
  }

  return normalizedPosition === normalizedIndex ? originalIndex : null;
}

function hasTokenBoundaries(text: string, index: number, length: number): boolean {
  return !isWordChar(text[index - 1]) && !isWordChar(text[index + length]);
}

function isWordChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_]/.test(char);
}
