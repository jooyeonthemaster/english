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

      // lastWord 는 소문자화 + 꼬리 부호 제거가 끝난 값이다("U." → "u",
      // "U.S." → "u.s"). 26-08-22 실측 수리: 원래의 /^[A-Z]$/ 와
      // /^([a-zA-Z]\.)+$/ 는 그 정규화 때문에 절대 매치되지 않는 죽은 검사라
      // 'In the U.S. the …' 가 "In the U." 뒤에서 잘렸다.
      const isAbbreviation = abbreviations.has(lastWord) ||
        // Single letter abbreviation like "U." "S." "A."
        /^[a-z]$/.test(lastWord) ||
        // Pattern like "U.S." "U.N." "e.g." "i.e." (final dot already stripped)
        /^([a-z]\.)+[a-z]$/.test(lastWord);

      // "etc." ends a sentence when the next word starts a new one
      // (공백 + 여는따옴표? + 대문자). 26-08-22 실측:
      // '…bars, chips, fruity items, etc. These were rated…' 는 경계다.
      const etcSentenceEnd = lastWord === "etc" &&
        /^\s+[“‘"']?\s*[A-Z]/.test(passage.slice(i + 1));

      // Check if next char is a decimal digit (e.g., "3.14")
      const nextChar = i + 1 < passage.length ? passage[i + 1] : "";
      const isDecimal = /\d/.test(passage[i - 1] ?? "") && /\d/.test(nextChar);

      // Check if we're inside quotes
      // Simple heuristic: if the previous non-space char before the period is a quote,
      // that's fine — still a sentence boundary

      if ((!isAbbreviation || etcSentenceEnd) && !isDecimal) {
        // Look ahead: if followed by a space (or end) and then an uppercase letter, or end of text
        // (따옴표는 곱슬(“”‘’)·직선 모두 — 26-08-22 실측:
        //  '…over the years. “Hollywood Grammar” may sound laughable…' 경계 미분할 수리)
        const rest = passage.slice(i + 1);
        const nextContentMatch = rest.match(/^\s*(["'“”‘’]?\s*[A-Z]|$)/);

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
