const HARD_BREAK_LINE_RE =
  /^\s*(?:[\u2460-\u2473\u2776-\u277f\u24f5-\u24fe]|[1-5][.)]|[A-E][.)]|\([A-E]\)|<[^>]{1,40}>|\[[^\]]{1,80}\])\s*/u;

/**
 * OCR commonly preserves the source image's physical line breaks. Those are
 * useful as raw evidence, but the review pane should read like prose and wrap
 * to the available column width. Keep explicit paragraph breaks and obvious
 * option/list rows; fold soft single-line breaks into spaces.
 */
export function formatExtractedTextForDisplay(
  text: string | null | undefined,
): string {
  const normalized = (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ");
  const paragraphs = normalized.split(/\n\s*\n+/);

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) return "";

      const out: string[] = [];
      for (const line of lines) {
        const isHardBreakLine = HARD_BREAK_LINE_RE.test(line);
        if (isHardBreakLine) {
          out.push(line);
          continue;
        }
        const lastIndex = out.length - 1;
        if (lastIndex < 0 || HARD_BREAK_LINE_RE.test(out[lastIndex])) {
          out.push(line);
        } else {
          out[lastIndex] = `${out[lastIndex]} ${line}`.replace(/[ \t]{2,}/g, " ");
        }
      }
      return out.join("\n");
    })
    .filter((paragraph) => paragraph.trim().length > 0)
    .join("\n\n")
    .trim();
}
