import { tokenList } from "./scoring";

export function cleanProblemText(text: string): string {
  return text
    .replace(/[①-⑨]/g, " ")
    .replace(/(^|\n)\s*\([A-E]\)\s+/g, "\n")
    .replace(/@\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentenceCandidates(text: string): string[] {
  const clean = cleanProblemText(text);
  const rough = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => tokenList(sentence).length >= 7);
  return rough.length > 0 ? rough : [clean];
}

export function trimQuerySentence(sentence: string): string {
  const words = sentence.split(/\s+/).filter(Boolean).slice(0, 13);
  return words.join(" ");
}
