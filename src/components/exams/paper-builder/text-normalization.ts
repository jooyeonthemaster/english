const HARD_BREAK_MARKER_RE =
  /^(\[[^\]]+\]|\(?[A-Ea-e]\)|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\d+\.|[-*]\s+)/;
const ANSWER_METADATA_BLOCK_RE =
  /^\s*\[(?:blank answers|\uBE48\uCE78\s*\uC815\uB2F5)\]\s*/i;
const INTERNAL_METADATA_BLOCK_RE =
  /^\s*\[(?:target|context|\uB300\uC0C1\s*\uB2E8\uC5B4|\uBB38\uB9E5)\]\s*/i;
const MATCH_TYPE_METADATA_SPAN_RE =
  /\s*\[(?:type|match\s*type|\uC720\uD615)\s*:\s*[^\]]+\]\s*/gi;

const LEGACY_QUESTION_SECTION_LABELS: Record<string, string> = {
  reference: "영작할 우리말",
  original: "원문",
  condition: "조건",
  conditions: "조건",
  "word order": "배열 단어",
  hint: "힌트",
};

export function normalizeQuestionSectionMarkers(text: string): string {
  return text.replace(
    /(^|\n)[ \t]*\[(reference|original|conditions?|word order|hint)\][ \t]*(\n?)/gi,
    (_match, lineStart: string, rawMarker: string, trailingNewline: string) => {
      const label = LEGACY_QUESTION_SECTION_LABELS[rawMarker.toLowerCase()];
      const separator = label === "조건" || trailingNewline ? "\n" : " ";
      return `${lineStart}[${label}]${separator}`;
    },
  );
}

function normalizeBaseText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function collapseProseLineBreaks(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function shouldKeepLineBreaks(block: string): boolean {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return false;
  if (lines[0]?.startsWith("[\uC870\uAC74]")) return true;
  if (lines[0]?.startsWith("[conditions]")) return true;

  const markerLines = lines.filter((line) => HARD_BREAK_MARKER_RE.test(line));
  return markerLines.length >= Math.min(2, lines.length);
}

function stripInternalMetadataBlocks(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block &&
        !INTERNAL_METADATA_BLOCK_RE.test(block) &&
        !ANSWER_METADATA_BLOCK_RE.test(block),
    )
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .map((line) => line.replace(MATCH_TYPE_METADATA_SPAN_RE, " ").trim())
        .filter(Boolean)
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function normalizePassageText(text: string): string {
  const normalized = normalizeBaseText(text);
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map(collapseProseLineBreaks)
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeQuestionText(text: string): string {
  const normalized = stripInternalMetadataBlocks(
    normalizeQuestionSectionMarkers(normalizeBaseText(text)),
  );
  if (!normalized) return "";

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (!shouldKeepLineBreaks(trimmed)) return collapseProseLineBreaks(trimmed);
      return trimmed
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function normalizeInlineText(text: string): string {
  return normalizeBaseText(text).replace(/[ \t]{2,}/g, " ");
}
