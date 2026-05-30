export type SummaryBlankAnswers = {
  blankA?: string;
  blankB?: string;
};

type SummaryOptionPair = {
  blankA: string;
  blankB: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLabel(value: unknown) {
  const raw = cleanText(value);
  const circled: Record<string, string> = {
    "\u2460": "1",
    "\u2461": "2",
    "\u2462": "3",
    "\u2463": "4",
    "\u2464": "5",
  };
  return (circled[raw] || raw)
    .replace(/^[\(\[\s]+|[\)\]\s]+$/g, "")
    .trim();
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stripBlankLabel(value: string) {
  return value.replace(/^\(?[AB]\)?\s*[:.)-]?\s*/i, "").trim();
}

export function readSummaryPairOption(option: unknown): SummaryOptionPair {
  if (!isRecord(option)) return { blankA: "", blankB: "" };

  const explicitA = cleanText(option.blankA);
  const explicitB = cleanText(option.blankB);
  if (explicitA || explicitB) return { blankA: explicitA, blankB: explicitB };

  const text = cleanText(option.text);
  if (!text) return { blankA: "", blankB: "" };

  const parts = text
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|[-\u2013\u2014]{2,}|\/)\s*/g)
    .map(stripBlankLabel)
    .filter(Boolean);
  return {
    blankA: parts[0] || "",
    blankB: parts.slice(1).join(" ") || "",
  };
}

function readAnswersFromBlanks(blanks: unknown): SummaryBlankAnswers {
  const answers: SummaryBlankAnswers = {};
  if (!Array.isArray(blanks)) return answers;

  for (const blank of blanks) {
    if (!isRecord(blank)) continue;
    const label = normalizeLabel(blank.label).toUpperCase();
    const answer = cleanText(blank.answer);
    if (!answer) continue;
    if (label === "A") answers.blankA = answer;
    if (label === "B") answers.blankB = answer;
  }
  return answers;
}

export function readSummaryBlankAnswersFromQuestionLike(
  source: unknown,
  fallbackOptions?: unknown,
  fallbackCorrectAnswer?: unknown,
): SummaryBlankAnswers {
  const sourceRecord = isRecord(source) ? source : {};
  const structured = isRecord(sourceRecord.structuredData)
    ? sourceRecord.structuredData
    : sourceRecord;

  const fromBlanks = readAnswersFromBlanks(structured.blanks);
  if (fromBlanks.blankA && fromBlanks.blankB) return fromBlanks;

  const options =
    parseJsonArray(structured.options).length > 0
      ? parseJsonArray(structured.options)
      : parseJsonArray(sourceRecord.options).length > 0
        ? parseJsonArray(sourceRecord.options)
        : parseJsonArray(fallbackOptions);
  const correctLabel = normalizeLabel(
    structured.correctAnswer ?? sourceRecord.correctAnswer ?? fallbackCorrectAnswer,
  );

  const correctOption = options.find((option) => {
    if (!isRecord(option)) return false;
    return normalizeLabel(option.label) === correctLabel;
  });
  const fromCorrectOption = readSummaryPairOption(correctOption);

  return {
    blankA: fromBlanks.blankA || fromCorrectOption.blankA,
    blankB: fromBlanks.blankB || fromCorrectOption.blankB,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeAnswerAfterMarker(text: string, marker: "A" | "B", answer: string) {
  const cleanedAnswer = cleanText(answer);
  if (!cleanedAnswer) return text;

  const answerPattern = cleanedAnswer.split(/\s+/).map(escapeRegExp).join("\\s+");
  const markerPattern = `(\\(${marker}\\)\\s*(?:[:=\\-]\\s*)?)`;
  return text.replace(
    new RegExp(`${markerPattern}${answerPattern}(?=\\s|[,.!?;:)]|$)`, "i"),
    "$1",
  );
}

export function maskSummaryCompleteMcAnswers(
  summary: string,
  answers: SummaryBlankAnswers,
) {
  let next = summary || "";
  next = removeAnswerAfterMarker(next, "A", answers.blankA || "");
  next = removeAnswerAfterMarker(next, "B", answers.blankB || "");
  return next.replace(/(\([AB]\))\s{2,}/g, "$1 ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

export function addSummaryCompleteMcBlankLines(summary: string) {
  return (summary || "")
    .replace(/(\([AB]\))(?!\s*_{3,})/g, "$1 _____")
    .replace(/_{6,}/g, "_____")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

export function formatSummaryCompleteMcSummaryForDisplay(
  summary: string,
  answers: SummaryBlankAnswers,
) {
  return addSummaryCompleteMcBlankLines(
    maskSummaryCompleteMcAnswers(summary, answers),
  );
}
