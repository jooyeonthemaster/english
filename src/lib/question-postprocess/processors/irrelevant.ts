import { CIRCLED_NUMBERS, type PostProcessResult, type QuestionPostProcessData } from "../types";

export function processIrrelevant(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const sentences = ai.sentences as string[];
  const irrelevantIndex = Number(ai.irrelevantIndex);

  if (!sentences || !Array.isArray(sentences)) {
    return { success: false, data: ai, warnings, error: "Missing sentences field" };
  }

  if (sentences.length !== 5) {
    warnings.push(`Expected 5 sentences, got ${sentences.length}`);
  }

  if (!Number.isInteger(irrelevantIndex) || irrelevantIndex < 0 || irrelevantIndex >= sentences.length) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Invalid irrelevantIndex: ${ai.irrelevantIndex}`,
    };
  }

  const normalizedOptions = CIRCLED_NUMBERS.map((label) => ({
    label,
    text: label,
  }));
  const expectedAnswer = CIRCLED_NUMBERS[irrelevantIndex] ?? String(irrelevantIndex + 1);
  if (normalizeAnswerLabel(ai.correctAnswer) !== String(irrelevantIndex + 1)) {
    warnings.push(`correctAnswer realigned to irrelevantIndex ${irrelevantIndex}`);
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
      correctAnswer: expectedAnswer,
      options: normalizedOptions,
      passageWithNumbers,
    },
    warnings,
  };
}

function normalizeAnswerLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const circledMap: Record<string, string> = {
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
  };
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([1-5])[\)\].]?\s*$/, "$1")
    .trim();
}
