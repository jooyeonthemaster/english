import type { QuestionAnalysis, SingleItemAnalysis } from "./schema";

interface FilterIncompleteAnalysisResult {
  analysis: SingleItemAnalysis;
  removedCount: number;
  removedSummaries: string[];
}

const TOP_EDGE = 0.045;
const BOTTOM_EDGE = 0.955;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function lower(value: string): string {
  return value.toLowerCase();
}

function combinedSourceText(question: QuestionAnalysis): string {
  return [
    question.source.direction,
    question.source.passage,
    question.reproductionSpec.stemFormat,
    question.reproductionSpec.optionFormat,
    question.reproductionSpec.structureNotes,
    ...question.source.options.map((option) => `${option.label} ${option.text}`),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function bodySourceText(question: QuestionAnalysis): string {
  return [
    question.source.passage,
    ...question.source.options.map((option) => `${option.label} ${option.text}`),
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function formatSourceText(question: QuestionAnalysis): string {
  return [
    question.source.direction,
    question.reproductionSpec.stemFormat,
    question.reproductionSpec.optionFormat,
    question.reproductionSpec.structureNotes,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function diagnosticText(question: QuestionAnalysis): string {
  const completeness = question.source.completeness;
  return lower(
    [
      completeness.rationale,
      ...completeness.missingParts,
      ...question.extractionNotes,
    ]
      .map(cleanText)
      .filter(Boolean)
      .join(" "),
  );
}

function isNearPageEdge(question: QuestionAnalysis): boolean {
  const box = question.source.boundingBox;
  if (!box) return false;
  return box.y <= TOP_EDGE || box.y + box.height >= BOTTOM_EDGE;
}

function hasQuestionStart(question: QuestionAnalysis): boolean {
  const text = combinedSourceText(question);
  if (typeof question.source.questionNumber === "number") return true;
  return /(\d{1,3}\s*[.)])|\[?\s*서답형\s*\d+\s*\]?/u.test(text);
}

function expectedRomanPair(text: string): boolean {
  return /\[\s*(?:I|Ⅰ)\s*\]\s*~\s*\[\s*(?:II|Ⅱ)\s*\]/u.test(text);
}

function hasRomanPair(text: string): boolean {
  return /\[\s*(?:I|Ⅰ)\s*\]/u.test(text) && /\[\s*(?:II|Ⅱ)\s*\]/u.test(text);
}

function hasSentenceOrderLabels(text: string): boolean {
  return /\[\s*A\s*\]/u.test(text) && /\[\s*B\s*\]/u.test(text) && /\[\s*C\s*\]/u.test(text);
}

function parseLetterRange(text: string): { start: string; end: string } | null {
  const match = text.match(/\(([A-Ia-i])\)\s*~\s*\(([A-Ia-i])\)/u);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function hasLetterEndpoint(text: string, letter: string): boolean {
  return new RegExp(`\\(${letter}\\)`, "u").test(text);
}

function hasIncompleteDiagnostic(question: QuestionAnalysis): boolean {
  const text = diagnosticText(question);
  if (!text) return false;
  return [
    "incomplete",
    "requires next page",
    "requires previous page",
    "continues on the next page",
    "starts on the previous page",
    "missing choices",
    "missing options",
    "missing passage",
    "missing ending",
    "page-spanning",
    "페이지 밖",
    "다음 페이지",
    "이전 페이지",
    "앞 페이지",
    "뒤 페이지",
    "선택지 누락",
    "보기 누락",
    "지문 누락",
    "일부 누락",
    "잘림",
    "끊김",
  ].some((cue) => text.includes(cue));
}

function hasStructuralGap(question: QuestionAnalysis): boolean {
  const formatText = formatSourceText(question);
  const bodyText = bodySourceText(question);
  const optionCount = question.source.optionCount ?? question.source.options.length;
  const extractedOptionCount = question.source.options.filter(
    (option) => cleanText(option.label) || cleanText(option.text),
  ).length;

  if (
    question.classification.answerShape === "MULTIPLE_CHOICE" &&
    optionCount >= 3 &&
    extractedOptionCount > 0 &&
    extractedOptionCount < Math.min(optionCount, 5)
  ) {
    return true;
  }

  if (expectedRomanPair(formatText) && !hasRomanPair(bodyText)) {
    return true;
  }

  if (question.classification.matchedType === "SENTENCE_ORDER" && !hasSentenceOrderLabels(bodyText)) {
    return true;
  }

  const range = parseLetterRange(formatText);
  if (range && (!hasLetterEndpoint(bodyText, range.start) || !hasLetterEndpoint(bodyText, range.end))) {
    return true;
  }

  return false;
}

function shouldExcludeIncompleteQuestion(question: QuestionAnalysis): boolean {
  const completeness = question.source.completeness;
  if (
    completeness.isComplete === false ||
    completeness.requiresPreviousPage ||
    completeness.requiresNextPage
  ) {
    return true;
  }

  if (!hasQuestionStart(question) && isNearPageEdge(question)) {
    return true;
  }

  if (hasStructuralGap(question) && isNearPageEdge(question)) {
    return true;
  }

  return hasIncompleteDiagnostic(question) && isNearPageEdge(question);
}

function summarize(question: QuestionAnalysis): string {
  const qNo = question.source.questionNumber ?? "?";
  const type = question.classification.matchedType ?? "NOVEL";
  const direction = cleanText(question.source.direction).slice(0, 80);
  return `q=${qNo} type=${type} direction=${direction}`;
}

export function filterIncompleteAnalysisQuestions(
  analysis: SingleItemAnalysis,
): FilterIncompleteAnalysisResult {
  let removedCount = 0;
  const removedSummaries: string[] = [];
  const groups = analysis.groups.flatMap((group) => {
    const questions = group.questions.filter((question) => {
      const exclude = shouldExcludeIncompleteQuestion(question);
      if (exclude) {
        removedCount += 1;
        removedSummaries.push(summarize(question));
      }
      return !exclude;
    });
    return questions.length > 0 ? [{ ...group, questions }] : [];
  });

  return {
    analysis: { ...analysis, groups },
    removedCount,
    removedSummaries,
  };
}
