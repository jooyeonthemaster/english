// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { QuestionQualitySeverity, SENTENCE_INSERT_SLOT_MAX, SENTENCE_INSERT_SLOT_MIN, containsComparableSentence, contentTokens, findDuplicate, isRecord, normalizeComparableText, normalizeText, splitPassageSentences } from "../core";



export function sentenceInsertHasCohesiveCue(sentence: string): boolean {
  const s = ` ${sentence.toLowerCase()} `;
  if (/\b(this|that|these|those|such|it|its|they|them|their|he|she|his|her|him)\b/.test(s)) {
    return true;
  }
  if (
    /\b(however|yet|instead|nevertheless|nonetheless|therefore|thus|hence|consequently|for example|for instance|moreover|furthermore|in addition|besides|also|then|later|subsequently|afterwards?|meanwhile|on the contrary|in contrast|by contrast|similarly|likewise|as a result)\b/.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}



export function normalizeSentenceInsertGapLabel(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/(\d{1,2})/);
  return match ? match[1] : text;
}



export function countSentenceInsertGapMarkers(text: string): number {
  // Slot count is configurable (5~8); count up to the supported maximum.
  const circled = getCircledNumbers(SENTENCE_INSERT_SLOT_MAX);
  return circled.filter((marker) => text.includes(marker)).length;
}



export function findSentenceInsertVisibleSourceLeak(
  sourceSentence: string,
  passageWithMarkers: string,
): { sentence: string; score: number } | null {
  const source = normalizeText(sourceSentence);
  if (!source) return null;

  const visiblePassage = stripSentenceInsertMarkers(passageWithMarkers);
  const visibleSentences = splitPassageSentences(visiblePassage, { includeShort: true });
  let best: { sentence: string; score: number } | null = null;
  for (const sentence of visibleSentences) {
    const score = sentenceInsertSentenceSimilarity(source, sentence);
    if (!best || score > best.score) best = { sentence, score };
  }

  if (!best) return null;
  if (normalizeComparableText(best.sentence) === normalizeComparableText(source)) return best;
  return best.score >= 0.72 ? best : null;
}



export function stripSentenceInsertMarkers(text: string): string {
  return text
    .replace(/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}



export function sentenceInsertSentenceSimilarity(a: string, b: string): number {
  const normalizedA = normalizeComparableText(a).replace(/[.,!?;:]+$/g, "");
  const normalizedB = normalizeComparableText(b).replace(/[.,!?;:]+$/g, "");
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length >= 45 && normalizedB.includes(normalizedA)) return 0.95;
  if (normalizedB.length >= 45 && normalizedA.includes(normalizedB)) return 0.95;

  const tokensA = [...contentTokens(normalizedA)];
  const tokensB = [...contentTokens(normalizedB)];
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  const overlap = tokensA.filter((token) => setB.has(token)).length;
  const containment = overlap / Math.max(1, Math.min(tokensA.length, tokensB.length));
  const jaccard = overlap / Math.max(1, new Set([...tokensA, ...tokensB]).size);
  const sequence = longestCommonTokenRun(tokensA, tokensB) / Math.max(1, Math.min(tokensA.length, tokensB.length));
  return Math.max(containment, jaccard * 1.25, sequence);
}



export function longestCommonTokenRun(a: string[], b: string[]): number {
  let best = 0;
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
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



export function validateSentenceInsertQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedSlotCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 1) 마커 인덱스: 요청 개수(기본 5) · 오름차순
  const indices = Array.isArray(question.markerAfterSentenceIndices)
    ? question.markerAfterSentenceIndices.filter((n): n is number => typeof n === "number")
    : [];
  const expectedSlotCount =
    requestedSlotCount ??
    (indices.length >= SENTENCE_INSERT_SLOT_MIN && indices.length <= SENTENCE_INSERT_SLOT_MAX
      ? indices.length
      : 5);
  if (indices.length !== expectedSlotCount) {
    add(
      "warning",
      "sentence-insert-marker-count",
      `Expected ${expectedSlotCount} marker indices for SENTENCE_INSERT, got ${indices.length}.`,
    );
  } else if (!indices.every((n, i) => i === 0 || n > indices[i - 1])) {
    add(
      "warning",
      "sentence-insert-marker-order",
      "markerAfterSentenceIndices must be strictly ascending.",
    );
  }

  // 2) 주어진 문장: 존재 + 응집 단서(중립 문장 → 복수정답 위험)
  const given = normalizeText(question.givenSentence);
  if (!given) {
    add("error", "sentence-insert-missing-given", "SENTENCE_INSERT is missing givenSentence.");
  } else if (!sentenceInsertHasCohesiveCue(given)) {
    add(
      "warning",
      "sentence-insert-neutral-given",
      "The given sentence has no explicit cohesive cue (demonstrative/pronoun/connective); it may fit multiple gaps (복수정답 위험).",
    );
  }

  // 3) 정답 위치: 양끝(①·⑤) 회피 → 가운데(②③④) 권장
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  if (!passageWithMarkers) {
    add("error", "sentence-insert-missing-passage", "SENTENCE_INSERT is missing passageWithMarkers.");
  } else {
    const markerCount = countSentenceInsertGapMarkers(passageWithMarkers);
    if (markerCount !== expectedSlotCount) {
      add(
        "error",
        "sentence-insert-gap-marker-count",
        `SENTENCE_INSERT passageWithMarkers must contain exactly ${expectedSlotCount} gap markers, got ${markerCount}.`,
      );
    }
  }

  const omittedSource =
    normalizeText(question.omittedSourceSentence) ||
    normalizeText(question.sourceSentenceToOmit);
  if (omittedSource) {
    if (passage && !containsComparableSentence(passage, omittedSource)) {
      add(
        "error",
        "sentence-insert-omitted-source-not-backed",
        "sourceSentenceToOmit/omittedSourceSentence must be an original passage sentence.",
      );
    }
    if (passageWithMarkers) {
      const leak = findSentenceInsertVisibleSourceLeak(omittedSource, passageWithMarkers);
      if (leak) {
        add(
          "error",
          "sentence-insert-omitted-source-visible",
          `The omitted source sentence is still visible in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
        );
      }
    }
  } else if (given && passageWithMarkers) {
    add(
      "error",
      "sentence-insert-missing-omitted-source",
      "SENTENCE_INSERT must provide sourceSentenceToOmit/omittedSourceSentence copied from the original passage; newly invented bridge sentences are not allowed.",
    );
    const leak = findSentenceInsertVisibleSourceLeak(given, passageWithMarkers);
    if (leak && leak.score >= 0.72) {
      add(
        "error",
        "sentence-insert-given-leaks-in-passage",
        `The given sentence is still visible, or nearly visible, in passageWithMarkers: "${leak.sentence.slice(0, 100)}"`,
      );
    }
  }

  const answer = normalizeSentenceInsertGapLabel(question.correctAnswer);
  if (answer === "1" || answer === String(expectedSlotCount)) {
    add(
      "warning",
      "sentence-insert-edge-answer",
      `Correct gap is at an edge (${answer}); 가운데 위치가 변별력에 유리합니다.`,
    );
  }

  // 4) 함정 게이트: distractorTraps 가 있으면 각 결함이 비어있지 않고 서로 달라야 함
  const traps = Array.isArray(question.distractorTraps)
    ? question.distractorTraps.filter(isRecord)
    : [];
  if (traps.length > 0) {
    const flaws = traps.map((t) => normalizeText(t.fatalFlaw)).filter(Boolean);
    if (flaws.length < traps.length) {
      add(
        "warning",
        "sentence-insert-trap-empty-flaw",
        "Some distractorTraps have an empty fatalFlaw; each wrong gap needs a decisive reason.",
      );
    }
    if (findDuplicate(flaws)) {
      add(
        "warning",
        "sentence-insert-trap-duplicate-flaw",
        "distractorTraps repeat the same fatalFlaw; each trap should fail for a different reason.",
      );
    }
    if (answer && traps.some((t) => normalizeSentenceInsertGapLabel(t.gapLabel) === answer)) {
      add(
        "warning",
        "sentence-insert-trap-on-answer",
        "A distractorTrap points at the correct gap.",
      );
    }
  }
}
