const HARD_BREAK_MARKER_RE =
  /^(\[[^\]]+\]|\(?[A-Ea-e]\)|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\d+\.|[-*]\s+)/;

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
  if (lines[0]?.startsWith("[조건]")) return true;
  if (lines[0]?.startsWith("[conditions]")) return true;

  const markerLines = lines.filter((line) => HARD_BREAK_MARKER_RE.test(line));
  return markerLines.length >= Math.min(2, lines.length);
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
  const normalized = normalizeBaseText(text);
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
