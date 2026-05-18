import { CIRCLED_NUMBERS, type PostProcessResult } from "../types";

export function processIrrelevant(
  passage: string,
  ai: Record<string, any>,
): PostProcessResult {
  const warnings: string[] = [];

  const sentences = ai.sentences as string[];

  if (!sentences || !Array.isArray(sentences)) {
    return { success: false, data: ai, warnings, error: "Missing sentences field" };
  }

  if (sentences.length !== 5) {
    warnings.push(`Expected 5 sentences, got ${sentences.length}`);
  }

  // Prefix each sentence with its circled number marker
  const numbered = sentences
    .map((sent, i) => {
      const marker = i < CIRCLED_NUMBERS.length ? CIRCLED_NUMBERS[i] : `(${i + 1})`;
      return `${marker} ${sent.trim()}`;
    })
    .join(" ");

  const passageWithNumbers = numbered;

  return {
    success: true,
    data: {
      ...ai,
      passageWithNumbers,
    },
    warnings,
  };
}
