import { splitIntoSentences } from "../sentence-splitter";
import { buildCanonicalSentenceInsertOptions } from "@/lib/sentence-insert-options";
import { CIRCLED_NUMBERS, type PostProcessResult, type QuestionPostProcessData } from "../types";

const OMITTED_SENTENCE_SIMILARITY_THRESHOLD = 0.72;

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

  const omittedMatch = findSourceSentenceToOmit(
    sentences,
    givenSentence,
    ai.sourceSentenceToOmit as string | undefined,
  );
  if (omittedMatch && omittedMatch.index === 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "SENTENCE_INSERT cannot omit the first source sentence; choose a later sentence.",
    };
  }

  const displaySentences = omittedMatch
    ? sentences.filter((_, index) => index !== omittedMatch.index)
    : sentences;
  if (omittedMatch) {
    warnings.push(
      `Removed omitted SENTENCE_INSERT source sentence ${omittedMatch.index + 1} from displayed passage.`,
    );
  }

  // Sort indices and pair with circled numbers
  const adjustedIndices = omittedMatch
    ? adjustMarkerIndicesForOmission(markerAfterSentenceIndices, omittedMatch.index)
    : markerAfterSentenceIndices;
  const sortedIndices = [...adjustedIndices].sort((a, b) => a - b);
  const uniqueSortedIndices = repairSentenceInsertMarkerIndices(
    sortedIndices,
    displaySentences.length,
  );
  if (uniqueSortedIndices.length < 5) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "SENTENCE_INSERT does not have enough valid marker positions after omitted source sentence removal.",
    };
  }
  if (uniqueSortedIndices.length !== sortedIndices.length) {
    warnings.push("Repaired SENTENCE_INSERT marker indices after omitted source sentence removal.");
  }
  const markerMap = new Map<number, string>();

  for (let i = 0; i < uniqueSortedIndices.length && i < CIRCLED_NUMBERS.length; i++) {
    const sentenceIndex = uniqueSortedIndices[i];
    if (sentenceIndex < 0 || sentenceIndex >= displaySentences.length) continue;
    markerMap.set(sentenceIndex, CIRCLED_NUMBERS[i]);
  }

  // Reconstruct passage with markers inserted after specified sentences
  const parts: string[] = [];
  for (let si = 0; si < displaySentences.length; si++) {
    parts.push(displaySentences[si]);
    const marker = markerMap.get(si);
    if (marker) {
      parts.push(` ${marker} `);
    } else {
      parts.push(" ");
    }
  }

  const passageWithMarkers = parts.join("").trim();

  // Build options from circled numbers (standard format: ①~⑤)
  const options = buildCanonicalSentenceInsertOptions(5);
  if (Array.isArray(ai.options)) {
    warnings.push("Ignored AI-provided SENTENCE_INSERT options; using canonical gap-marker options.");
  }

  return {
    success: true,
    data: {
      ...ai,
      givenSentence: givenSentence || ai.givenSentence,
      sourceSentenceToOmit: omittedMatch?.sentence ?? ai.sourceSentenceToOmit,
      omittedSourceSentence: omittedMatch?.sentence,
      omittedSourceSentenceIndex: omittedMatch?.index,
      passageWithMarkers,
      options,
    },
    warnings,
  };
}

function adjustMarkerIndicesForOmission(indices: number[], omittedIndex: number): number[] {
  return indices.map((index) => (index >= omittedIndex ? index - 1 : index));
}

function repairSentenceInsertMarkerIndices(indices: number[], sentenceCount: number): number[] {
  const validUnique = [...new Set(indices.filter((index) => index >= 0 && index < sentenceCount))]
    .sort((a, b) => a - b);
  if (validUnique.length >= 5) return validUnique.slice(0, 5);

  const used = new Set(validUnique);
  for (let index = sentenceCount - 1; index >= 0 && validUnique.length < 5; index--) {
    if (used.has(index)) continue;
    validUnique.push(index);
    used.add(index);
  }

  return validUnique.sort((a, b) => a - b);
}

function findSourceSentenceToOmit(
  sentences: string[],
  givenSentence: string,
  explicitSourceSentence?: string,
): { index: number; sentence: string; score: number } | null {
  const explicit = cleanSentence(explicitSourceSentence);
  if (explicit) {
    const exactIndex = sentences.findIndex((sentence) =>
      normalizeComparableSentence(sentence) === normalizeComparableSentence(explicit),
    );
    if (exactIndex >= 0) {
      return { index: exactIndex, sentence: sentences[exactIndex], score: 1 };
    }

    const explicitMatch = bestSentenceSimilarityMatch(sentences, explicit);
    if (explicitMatch && explicitMatch.score >= 0.6) return explicitMatch;
  }

  const given = cleanSentence(givenSentence);
  if (!given) return null;

  const exactGivenIndex = sentences.findIndex((sentence) =>
    normalizeComparableSentence(sentence) === normalizeComparableSentence(given),
  );
  if (exactGivenIndex >= 0) {
    return { index: exactGivenIndex, sentence: sentences[exactGivenIndex], score: 1 };
  }

  const inferredMatch = bestSentenceSimilarityMatch(sentences, given);
  return inferredMatch && inferredMatch.score >= OMITTED_SENTENCE_SIMILARITY_THRESHOLD
    ? inferredMatch
    : null;
}

function bestSentenceSimilarityMatch(
  sentences: string[],
  sentence: string,
): { index: number; sentence: string; score: number } | null {
  let best: { index: number; sentence: string; score: number } | null = null;
  for (const [index, candidate] of sentences.entries()) {
    const score = sentenceSimilarityScore(sentence, candidate);
    if (!best || score > best.score) {
      best = { index, sentence: candidate, score };
    }
  }
  return best;
}

function sentenceSimilarityScore(a: string, b: string): number {
  const normalizedA = normalizeComparableSentence(a);
  const normalizedB = normalizeComparableSentence(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length >= 45 && normalizedB.includes(normalizedA)) return 0.95;
  if (normalizedB.length >= 45 && normalizedA.includes(normalizedB)) return 0.95;

  const tokensA = contentTokens(normalizedA);
  const tokensB = contentTokens(normalizedB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((token) => setB.has(token)).length;
  const containment = overlap / Math.max(1, Math.min(tokensA.length, tokensB.length));
  const jaccard = overlap / Math.max(1, new Set([...tokensA, ...tokensB]).size);
  const sequence = longestCommonTokenRun(tokensA, tokensB) / Math.max(1, Math.min(tokensA.length, tokensB.length));
  return Math.max(containment, jaccard * 1.25, sequence);
}

function longestCommonTokenRun(a: string[], b: string[]): number {
  let best = 0;
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        best = Math.max(best, dp[i][j]);
      }
    }
  }
  return best;
}

function cleanSentence(value: string | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeComparableSentence(value: string): string {
  return cleanSentence(value)
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[.,!?;:]+$/g, "")
    .toLowerCase();
}

function contentTokens(value: string): string[] {
  const stop = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "because",
    "but",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "were",
    "with",
  ]);
  return (value.match(/[a-z][a-z'-]*/gi) ?? [])
    .map((token) => token.toLowerCase().replace(/^'+|'+$/g, ""))
    .filter((token) => token.length >= 3 && !stop.has(token));
}
