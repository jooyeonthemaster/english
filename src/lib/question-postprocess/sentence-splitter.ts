/**
 * Split English text into sentences. Handles common abbreviations,
 * decimal numbers, and quoted speech.
 */
export function splitIntoSentences(passage: string): string[] {
  // Common abbreviations that should NOT end a sentence
  const abbreviations = new Set([
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st",
    "vs", "etc", "inc", "ltd", "co", "corp",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    "vol", "dept", "est", "approx", "govt",
    "i.e", "e.g", "cf", "al",
  ]);

  const sentences: string[] = [];
  let current = "";
  let i = 0;

  while (i < passage.length) {
    const ch = passage[i];
    current += ch;

    if (ch === "." || ch === "!" || ch === "?") {
      // Check if this is a real sentence boundary

      // Look back: is this an abbreviation?
      const trimmedCurrent = current.trimEnd();
      const lastWord = trimmedCurrent
        .split(/\s+/)
        .pop()
        ?.replace(/[.!?]+$/, "")
        .toLowerCase() ?? "";

      const isAbbreviation = abbreviations.has(lastWord) ||
        // Single letter abbreviation like "U." "S." "A."
        /^[A-Z]$/.test(lastWord) ||
        // Pattern like "U.S." "U.N." "e.g." "i.e."
        /^([a-zA-Z]\.)+$/.test(trimmedCurrent.split(/\s+/).pop()?.replace(/[.!?]$/, "") ?? "");

      // Check if next char is a decimal digit (e.g., "3.14")
      const nextChar = i + 1 < passage.length ? passage[i + 1] : "";
      const isDecimal = /\d/.test(passage[i - 1] ?? "") && /\d/.test(nextChar);

      // Check if we're inside quotes
      // Simple heuristic: if the previous non-space char before the period is a quote,
      // that's fine — still a sentence boundary

      if (!isAbbreviation && !isDecimal) {
        // Look ahead: if followed by a space (or end) and then an uppercase letter, or end of text
        const rest = passage.slice(i + 1);
        const nextContentMatch = rest.match(/^\s*(["']?\s*[A-Z]|$)/);

        if (nextContentMatch || i === passage.length - 1) {
          // Consume trailing whitespace into the current sentence
          const trimmed = current.trim();
          if (trimmed.length > 0) {
            sentences.push(trimmed);
          }
          current = "";
          // Skip trailing whitespace
          i++;
          while (i < passage.length && /\s/.test(passage[i])) {
            i++;
          }
          continue;
        }
      }
    }

    i++;
  }

  // Push any remaining text
  const remaining = current.trim();
  if (remaining.length > 0) {
    sentences.push(remaining);
  }

  return sentences;
}
