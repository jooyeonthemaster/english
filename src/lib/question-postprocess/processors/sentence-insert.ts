import { splitIntoSentences } from "../sentence-splitter";
import { CIRCLED_NUMBERS, type PostProcessResult, type QuestionPostProcessData } from "../types";

export function processSentenceInsert(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const markerAfterSentenceIndices = ai.markerAfterSentenceIndices as number[];
  const givenSentence = ai.givenSentence as string;

  if (!markerAfterSentenceIndices || !Array.isArray(markerAfterSentenceIndices)) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Missing markerAfterSentenceIndices field",
    };
  }

  if (markerAfterSentenceIndices.length !== 5) {
    warnings.push(
      `Expected 5 marker indices, got ${markerAfterSentenceIndices.length}. ` +
        `Proceeding with what was provided.`,
    );
  }

  const sentences = splitIntoSentences(passage);

  if (sentences.length === 0) {
    return { success: false, data: ai, warnings, error: "Passage has no sentences" };
  }

  // Sort indices and pair with circled numbers
  const sortedIndices = [...markerAfterSentenceIndices].sort((a, b) => a - b);
  const markerMap = new Map<number, string>();

  for (let i = 0; i < sortedIndices.length && i < CIRCLED_NUMBERS.length; i++) {
    markerMap.set(sortedIndices[i], CIRCLED_NUMBERS[i]);
  }

  // Reconstruct passage with markers inserted after specified sentences
  const parts: string[] = [];
  for (let si = 0; si < sentences.length; si++) {
    parts.push(sentences[si]);
    const marker = markerMap.get(si);
    if (marker) {
      parts.push(` ${marker} `);
    } else {
      parts.push(" ");
    }
  }

  const passageWithMarkers = parts.join("").trim();

  // Build options from circled numbers (standard format: ①~⑤)
  const options = CIRCLED_NUMBERS.map((cn, i) => ({
    label: `${i + 1}`,
    text: cn,
  }));

  return {
    success: true,
    data: {
      ...ai,
      givenSentence: givenSentence || ai.givenSentence,
      passageWithMarkers,
      options: ai.options || options,
    },
    warnings,
  };
}
