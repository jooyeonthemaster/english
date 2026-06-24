import { splitIntoSentences } from "../sentence-splitter";
import {
  buildCanonicalSentenceInsertOptions,
  sentenceInsertOptionMarkerIndex,
} from "@/lib/sentence-insert-options";
import { CIRCLED_NUMBERS, type PostProcessResult, type QuestionPostProcessData } from "../types";

const OMITTED_SENTENCE_SIMILARITY_THRESHOLD = 0.72;
// 표시되는(잔류) 지문 문장과 givenSentence 가 이 임계 이상으로 겹치면 정답 누설로 본다.
// 누설 케이스는 ~0.95(거의 통째 포함), 정상 어휘사슬은 ≪0.85 라 보수적으로 둔다.
const GIVEN_SENTENCE_LEAK_THRESHOLD = 0.85;
// 정답을 omission gap 으로 덮어쓰려면, 주어진 문장이 '빼낸 그 문장'(원형 또는 기능보존
// 패러프레이즈)이어야 한다. 모델이 문장 X 를 빼고 무관한 새 문장 Y 를 given 으로 쓰면
// X 의 자리 ≠ Y 의 자리이므로 override 금지(이때만 모델 자기보고 정답을 신뢰).
const ANSWER_OVERRIDE_SIMILARITY_THRESHOLD = 0.5;
const SLOT_COUNT_MIN = 5;
const SLOT_COUNT_MAX = 8;

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

  // The requested slot count is carried by the (schema-enforced) index array
  // length; legacy/default outputs carry 5.
  const slotCount = Math.min(
    SLOT_COUNT_MAX,
    Math.max(SLOT_COUNT_MIN, markerAfterSentenceIndices.length),
  );
  if (markerAfterSentenceIndices.length !== slotCount) {
    warnings.push(
      `Expected ${slotCount} marker indices, got ${markerAfterSentenceIndices.length}. ` +
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
  if (!omittedMatch) {
    return {
      success: false,
      data: ai,
      warnings,
      error:
        "SENTENCE_INSERT givenSentence must be source-backed; choose one original passage sentence to omit and provide sourceSentenceToOmit.",
    };
  }
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

  // Answer-leak guard: when the given sentence is derived from passage text but the
  // omitted source was only partially matched (or spans two sentences), a near-verbatim
  // copy can remain among the DISPLAYED sentences — duplicating the answer text and
  // trivially leaking the position. Reject so the engine regenerates a clean item.
  const leakMatch = bestSentenceSimilarityMatch(displaySentences, cleanSentence(givenSentence));
  if (leakMatch && leakMatch.score >= GIVEN_SENTENCE_LEAK_THRESHOLD) {
    return {
      success: false,
      data: ai,
      warnings,
      error:
        "SENTENCE_INSERT given sentence still overlaps a displayed passage sentence (answer leak); regenerate with the source sentence fully removed.",
    };
  }

  // Sort indices and pair with circled numbers
  const adjustedIndices = omittedMatch
    ? adjustMarkerIndicesForOmission(markerAfterSentenceIndices, omittedMatch.index)
    : markerAfterSentenceIndices;
  const sortedIndices = [...adjustedIndices].sort((a, b) => a - b);
  const uniqueSortedIndices = repairSentenceInsertMarkerIndices(
    sortedIndices,
    displaySentences.length,
    slotCount,
  );
  if (uniqueSortedIndices.length < slotCount) {
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

  // ── Answer key from the omission site (mis-key was the #1 SI defect) ──────────
  // When the given sentence was extracted from the passage (omittedMatch), the
  // correct gap is deterministically where it was removed — the marker right after
  // the sentence that now precedes that gap (display index = omittedMatch.index-1;
  // unchanged by omission adjustment because it sits before the removed sentence,
  // and a marker the model placed either just before OR just after the source both
  // collapse to this gap). The model self-reports correctAnswer but frequently
  // miscounts the marker number, so we override it with the deterministic value.
  // Freshly-authored given sentences (no omittedMatch) keep the model's answer.
  let answerOverride: string | undefined;
  const givenMatchesOmitted =
    !!omittedMatch &&
    sentenceSimilarityScore(cleanSentence(givenSentence), omittedMatch.sentence) >=
      ANSWER_OVERRIDE_SIMILARITY_THRESHOLD;
  if (omittedMatch && givenMatchesOmitted) {
    answerOverride = markerMap.get(omittedMatch.index - 1);
    if (!answerOverride) {
      return {
        success: false,
        data: ai,
        warnings,
        error:
          "SENTENCE_INSERT has no insertion marker at the removed-sentence gap; the answer cannot be keyed. Regenerate with a marker at that position.",
      };
    }
    if (
      typeof ai.correctAnswer === "string" &&
      sentenceInsertOptionMarkerIndex(ai.correctAnswer) !==
        sentenceInsertOptionMarkerIndex(answerOverride)
    ) {
      warnings.push(
        `Re-keyed SENTENCE_INSERT answer to the omission gap (${answerOverride}); model reported "${ai.correctAnswer}".`,
      );
    }
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

  // Build options from circled numbers (standard format: ①~, requested count)
  const options = buildCanonicalSentenceInsertOptions(slotCount);
  if (Array.isArray(ai.options)) {
    warnings.push("Ignored AI-provided SENTENCE_INSERT options; using canonical gap-marker options.");
  }

  return {
    success: true,
    data: {
      ...ai,
      correctAnswer: answerOverride ?? ai.correctAnswer,
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

function repairSentenceInsertMarkerIndices(
  indices: number[],
  sentenceCount: number,
  slotCount: number,
): number[] {
  const validUnique = [...new Set(indices.filter((index) => index >= 0 && index < sentenceCount))]
    .sort((a, b) => a - b);
  if (validUnique.length >= slotCount) return validUnique.slice(0, slotCount);

  const used = new Set(validUnique);
  for (let index = sentenceCount - 1; index >= 0 && validUnique.length < slotCount; index--) {
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
