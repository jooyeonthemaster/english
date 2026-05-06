const ABBREVIATIONS = new Set([
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "e.g.",
  "i.e.",
  "etc.",
  "vs.",
]);

function isLikelyAbbreviation(fragment: string): boolean {
  const words = fragment.trim().split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase();
  if (!last) return false;
  return ABBREVIATIONS.has(last) || /^[A-Z]\.$/.test(last);
}

export function splitEnglishSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char !== "." && char !== "?" && char !== "!") continue;

    const next = clean[i + 1];
    const fragment = clean.slice(start, i + 1);
    if (char === "." && isLikelyAbbreviation(fragment)) continue;
    if (next && !/\s|["')\]]/.test(next)) continue;

    const sentence = fragment.trim();
    if (sentence) sentences.push(sentence);
    start = i + 1;
  }

  const tail = clean.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}
