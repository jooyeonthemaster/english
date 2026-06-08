export type SummaryBlankAnswers = {
  blankA?: string;
  blankB?: string;
  [key: string]: string | undefined;
};

type SummaryOptionPair = {
  blankA: string;
  blankB: string;
  values?: SummaryBlankAnswers;
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

function labelKey(label: unknown) {
  const normalized = normalizeLabel(label).toUpperCase();
  if (!normalized) return "";
  if (/^[A-Z]$/.test(normalized)) return `blank${normalized}`;
  return normalized;
}

function labelFromKey(key: string) {
  const match = key.match(/^blank([A-Z])$/i);
  return match ? match[1].toUpperCase() : key.toUpperCase();
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
  return value.replace(/^\(?[A-Z]\)?\s*[:.)-]?\s*/i, "").trim();
}

function readBlankValues(value: unknown): SummaryBlankAnswers {
  const answers: SummaryBlankAnswers = {};
  if (!Array.isArray(value)) return answers;

  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = labelKey(item.label);
    const answer = cleanText(item.value ?? item.answer);
    if (!key || !answer) continue;
    answers[key] = answer;
  }
  return answers;
}

function mergeAnswers(...sources: SummaryBlankAnswers[]): SummaryBlankAnswers {
  const merged: SummaryBlankAnswers = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value && !merged[key]) merged[key] = value;
    }
  }
  return merged;
}

export function readSummaryPairOption(option: unknown): SummaryOptionPair {
  if (!isRecord(option)) return { blankA: "", blankB: "", values: {} };

  const explicitValues = readBlankValues(option.blankValues);

  const explicitA = cleanText(option.blankA);
  const explicitB = cleanText(option.blankB);
  const explicitLetterValues: SummaryBlankAnswers = {};
  for (const [key, value] of Object.entries(option)) {
    if (!/^blank[A-Z]$/i.test(key)) continue;
    const cleaned = cleanText(value);
    if (cleaned) explicitLetterValues[`blank${key.slice(5).toUpperCase()}`] = cleaned;
  }
  if (
    explicitA ||
    explicitB ||
    Object.keys(explicitValues).length > 0 ||
    Object.keys(explicitLetterValues).length > 0
  ) {
    const values = mergeAnswers(explicitValues, explicitLetterValues);
    return {
      blankA: values.blankA || explicitA,
      blankB: values.blankB || explicitB,
      values,
    };
  }

  const text = cleanText(option.text);
  if (!text) return { blankA: "", blankB: "", values: {} };

  const parts = text
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|[-\u2013\u2014]{2,}|\/)\s*/g)
    .map(stripBlankLabel)
    .filter(Boolean);
  const values: SummaryBlankAnswers = {};
  parts.forEach((part, index) => {
    values[`blank${String.fromCharCode(65 + index)}`] = part;
  });
  return {
    blankA: parts[0] || "",
    blankB: parts.slice(1).join(" ") || "",
    values,
  };
}

function readAnswersFromBlanks(blanks: unknown): SummaryBlankAnswers {
  const answers: SummaryBlankAnswers = {};
  if (!Array.isArray(blanks)) return answers;

  for (const blank of blanks) {
    if (!isRecord(blank)) continue;
    const key = labelKey(blank.label);
    const answer = cleanText(blank.answer);
    if (!key || !answer) continue;
    answers[key] = answer;
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

  return mergeAnswers(fromBlanks, fromCorrectOption.values || {});
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeAnswerAfterMarker(text: string, marker: string, answer: string) {
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
  for (const [key, answer] of Object.entries(answers)) {
    if (!answer) continue;
    next = removeAnswerAfterMarker(next, labelFromKey(key), answer);
  }
  return next.replace(/(\([A-Z]\))\s{2,}/g, "$1 ").replace(/\s+([,.!?;:])/g, "$1").trim();
}

export function addSummaryCompleteMcBlankLines(summary: string) {
  return (summary || "")
    .replace(/(\([A-Z]\))\s*(?:_{3,}|(?:\.|\u2026|\?){2,}|[-\u2013\u2014]{2,})?/g, "$1 _____ ")
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
