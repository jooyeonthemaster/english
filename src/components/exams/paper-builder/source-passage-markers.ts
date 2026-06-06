type SourcePassageMarkerQuestion = {
  subType?: string | null;
  questionText?: string | null;
  structuredData?: unknown;
};

type SourcePassageMarkerItem = {
  questionText?: string | null;
  sourceQuestion?: SourcePassageMarkerQuestion | null;
};

const SOURCE_UNDERLINE_SUBTYPES = new Set([
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
]);
const MARKED_UNDERLINE_RE = /__([^_]{3,180})__/g;
const QUOTED_UNDERLINE_RE =
  /(?:underlined|\uBC11\uC904)[^\n"'`“”‘’]{0,120}["'`“”‘’]([^"'`“”‘’]{3,180})["'`“”‘’]/gi;
const MARKER_VALUE_RE =
  /^\s*\[(?:original|source|target|underlined|underlined\s+sentence|\uC6D0\uBB38|\uB300\uC0C1\s*\uBB38\uC7A5)\]\s*(.+)$/gim;

function readStructuredData(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanupCandidate(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
    .trim();
}

function markerQuestionText(item: SourcePassageMarkerItem) {
  return [item.questionText, item.sourceQuestion?.questionText]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");
}

function markerQuestionType(item: SourcePassageMarkerItem) {
  return item.sourceQuestion?.subType || "";
}

function extractStructuredCandidates(item: SourcePassageMarkerItem) {
  const data = readStructuredData(item.sourceQuestion?.structuredData);
  if (!data) return [];

  return [
    data.originalSentence,
    data.underlinedExpression,
    data.underlinedSentence,
    data.underlinedText,
    data.targetExpression,
    data.targetPhrase,
    data.sourceText,
  ]
    .filter((value): value is string => typeof value === "string")
    .map(cleanupCandidate)
    .filter(Boolean);
}

function extractQuestionTextCandidates(text: string) {
  const candidates: string[] = [];

  for (const match of text.matchAll(MARKER_VALUE_RE)) {
    const candidate = cleanupCandidate(match[1] || "");
    if (candidate) candidates.push(candidate);
  }

  for (const match of text.matchAll(QUOTED_UNDERLINE_RE)) {
    const candidate = cleanupCandidate(match[1] || "");
    if (candidate) candidates.push(candidate);
  }

  for (const match of text.matchAll(MARKED_UNDERLINE_RE)) {
    const candidate = cleanupCandidate(match[1] || "");
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function underlineCandidatesForItem(item: SourcePassageMarkerItem) {
  if (!SOURCE_UNDERLINE_SUBTYPES.has(markerQuestionType(item))) return [];
  return [
    ...extractStructuredCandidates(item),
    ...extractQuestionTextCandidates(markerQuestionText(item)),
  ];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countDoubleUnderscores(value: string) {
  return (value.match(/__/g) || []).length;
}

function isInsideUnderlineMarkup(text: string, index: number) {
  return countDoubleUnderscores(text.slice(0, index)) % 2 === 1;
}

function findFlexibleOccurrence(text: string, candidate: string) {
  const exactIndex = text.indexOf(candidate);
  if (exactIndex >= 0) {
    return { index: exactIndex, length: candidate.length };
  }

  const pattern = candidate
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");
  if (!pattern) return null;

  const match = new RegExp(pattern, "i").exec(text);
  return match && match.index >= 0
    ? { index: match.index, length: match[0].length }
    : null;
}

function underlineFirstOccurrence(text: string, candidate: string) {
  const found = findFlexibleOccurrence(text, candidate);
  if (!found || isInsideUnderlineMarkup(text, found.index)) return text;

  return [
    text.slice(0, found.index),
    "__",
    text.slice(found.index, found.index + found.length),
    "__",
    text.slice(found.index + found.length),
  ].join("");
}

export function formatSourcePassageForQuestionItems(
  passageContent: string,
  items: SourcePassageMarkerItem[],
) {
  const candidates = Array.from(
    new Set(
      items
        .flatMap(underlineCandidatesForItem)
        .map(cleanupCandidate)
        .filter((candidate) => candidate.split(/\s+/).length >= 2),
    ),
  );

  return candidates.reduce(
    (text, candidate) => underlineFirstOccurrence(text, candidate),
    passageContent,
  );
}
