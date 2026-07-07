// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { CandidateDiversityOptions, buildSurroundingWindow, filterUsedCandidates, rotateByVariantIndex } from "./shared";
import { ANTONYM_MARKER_COUNT_DEFAULT, ANTONYM_MARKER_COUNT_MAX, ANTONYM_MARKER_COUNT_MIN, antonymPairKey, normalizeComparableText } from "../core";



export type AntonymLexiconEntry = {
  word: string;
  correctAntonym: string;
  suggestedWrongPair: string;
  pos: "adjective" | "adverb" | "noun" | "verb";
  note: string;
  avoidPairs?: string[];
  priority?: number;
};



export type AntonymCandidate = AntonymLexiconEntry & {
  sourceWord: string;
  surroundingText: string;
  index: number;
};



export const ANTONYM_SAFE_LEXICON: AntonymLexiconEntry[] = [
  { word: "common", correctAntonym: "rare", suggestedWrongPair: "ordinary", pos: "adjective", note: "frequency scale", priority: 9 },
  { word: "rare", correctAntonym: "common", suggestedWrongPair: "unusual", pos: "adjective", note: "frequency scale", priority: 8 },
  { word: "good", correctAntonym: "bad", suggestedWrongPair: "beneficial", pos: "adjective", note: "evaluation scale", priority: 6 },
  { word: "bad", correctAntonym: "good", suggestedWrongPair: "poor", pos: "adjective", note: "evaluation scale", priority: 6 },
  { word: "past", correctAntonym: "future", suggestedWrongPair: "previous", pos: "adjective", note: "time direction", priority: 8 },
  { word: "future", correctAntonym: "past", suggestedWrongPair: "coming", pos: "adjective", note: "time direction", priority: 8 },
  { word: "dim", correctAntonym: "bright", suggestedWrongPair: "dark", pos: "adjective", note: "outlook/brightness scale", avoidPairs: ["clear"], priority: 9 },
  { word: "bright", correctAntonym: "dim", suggestedWrongPair: "clear", pos: "adjective", note: "outlook/brightness scale", priority: 7 },
  { word: "doomed", correctAntonym: "promising", suggestedWrongPair: "fated", pos: "adjective", note: "prospect scale", priority: 7 },
  { word: "everyday", correctAntonym: "extraordinary", suggestedWrongPair: "ordinary", pos: "adjective", note: "ordinariness scale", priority: 6 },
  { word: "unproductive", correctAntonym: "productive", suggestedWrongPair: "ineffective", pos: "adjective", note: "output/effectiveness scale", avoidPairs: ["passive", "uninterested"], priority: 10 },
  { word: "productive", correctAntonym: "unproductive", suggestedWrongPair: "effective", pos: "adjective", note: "output/effectiveness scale", priority: 8 },
  { word: "failing", correctAntonym: "succeeding", suggestedWrongPair: "struggling", pos: "adjective", note: "success/failure scale in matching -ing form", priority: 9 },
  { word: "rational", correctAntonym: "irrational", suggestedWrongPair: "logical", pos: "adjective", note: "reasonableness scale", avoidPairs: ["emotional"], priority: 10 },
  { word: "new", correctAntonym: "old", suggestedWrongPair: "recent", pos: "adjective", note: "age/time scale", priority: 6 },
  { word: "hardest", correctAntonym: "easiest", suggestedWrongPair: "toughest", pos: "adjective", note: "superlative difficulty scale", priority: 9 },
  { word: "easiest", correctAntonym: "hardest", suggestedWrongPair: "simplest", pos: "adjective", note: "superlative difficulty scale", priority: 8 },
  { word: "significant", correctAntonym: "insignificant", suggestedWrongPair: "important", pos: "adjective", note: "importance scale", priority: 7 },
  { word: "easier", correctAntonym: "harder", suggestedWrongPair: "simpler", pos: "adjective", note: "comparative difficulty scale", priority: 8 },
  { word: "harder", correctAntonym: "easier", suggestedWrongPair: "tougher", pos: "adjective", note: "comparative difficulty scale", priority: 8 },
  { word: "present", correctAntonym: "absent", suggestedWrongPair: "available", pos: "adjective", note: "presence/absence scale", priority: 8 },
  { word: "internal", correctAntonym: "external", suggestedWrongPair: "inner", pos: "adjective", note: "inside/outside scale", priority: 7 },
  { word: "true", correctAntonym: "false", suggestedWrongPair: "real", pos: "adjective", note: "truth-value scale", priority: 6 },
  { word: "specific", correctAntonym: "general", suggestedWrongPair: "particular", pos: "adjective", note: "specificity scale", priority: 7 },
  { word: "multiple", correctAntonym: "single", suggestedWrongPair: "several", pos: "adjective", note: "number scale", priority: 6 },
  { word: "heavy", correctAntonym: "light", suggestedWrongPair: "weighty", pos: "adjective", note: "weight scale", priority: 6 },
  { word: "full", correctAntonym: "empty", suggestedWrongPair: "complete", pos: "adjective", note: "capacity scale", priority: 7 },
  { word: "empty", correctAntonym: "full", suggestedWrongPair: "blank", pos: "adjective", note: "capacity scale", priority: 7 },
  { word: "simple", correctAntonym: "complex", suggestedWrongPair: "easy", pos: "adjective", note: "complexity scale", priority: 7 },
  { word: "complex", correctAntonym: "simple", suggestedWrongPair: "complicated", pos: "adjective", note: "complexity scale", priority: 7 },
  { word: "visible", correctAntonym: "invisible", suggestedWrongPair: "noticeable", pos: "adjective", note: "visibility scale", priority: 7 },
  { word: "strong", correctAntonym: "weak", suggestedWrongPair: "powerful", pos: "adjective", note: "strength scale", priority: 7 },
  { word: "weak", correctAntonym: "strong", suggestedWrongPair: "fragile", pos: "adjective", note: "strength scale", priority: 7 },
  { word: "increase", correctAntonym: "decrease", suggestedWrongPair: "raise", pos: "verb", note: "quantity-change scale", priority: 8 },
  { word: "increased", correctAntonym: "decreased", suggestedWrongPair: "raised", pos: "verb", note: "quantity-change scale in matching past form", priority: 8 },
  { word: "increases", correctAntonym: "decreases", suggestedWrongPair: "raises", pos: "verb", note: "quantity-change scale in matching -s form", priority: 8 },
  { word: "expanded", correctAntonym: "contracted", suggestedWrongPair: "enlarged", pos: "verb", note: "size-change scale in matching past form", priority: 8 },
  { word: "strengthened", correctAntonym: "weakened", suggestedWrongPair: "reinforced", pos: "verb", note: "strength-change scale in matching past form", priority: 8 },
  { word: "accepted", correctAntonym: "rejected", suggestedWrongPair: "approved", pos: "verb", note: "acceptance scale in matching past form", priority: 8 },
  { word: "protected", correctAntonym: "exposed", suggestedWrongPair: "guarded", pos: "verb", note: "protection/exposure scale in matching past form", priority: 8 },
  { word: "spent", correctAntonym: "saved", suggestedWrongPair: "paid", pos: "verb", note: "resource-use scale in matching past form", priority: 7 },
  { word: "stay", correctAntonym: "leave", suggestedWrongPair: "remain", pos: "verb", note: "location/continuation scale", priority: 7 },
  { word: "persist", correctAntonym: "quit", suggestedWrongPair: "continue", pos: "verb", note: "continuation scale", priority: 7 },
  { word: "gain", correctAntonym: "lose", suggestedWrongPair: "obtain", pos: "verb", note: "gain/loss scale", priority: 7 },
  { word: "loss", correctAntonym: "gain", suggestedWrongPair: "defeat", pos: "noun", note: "gain/loss noun scale", priority: 6 },
  { word: "defeat", correctAntonym: "victory", suggestedWrongPair: "failure", pos: "noun", note: "outcome scale", priority: 8 },
  { word: "admission", correctAntonym: "denial", suggestedWrongPair: "confession", pos: "noun", note: "acknowledgment scale", priority: 6 },
  { word: "contrast", correctAntonym: "similarity", suggestedWrongPair: "comparison", pos: "noun", note: "relation scale", priority: 6 },
  { word: "often", correctAntonym: "rarely", suggestedWrongPair: "frequently", pos: "adverb", note: "frequency scale", priority: 8 },
];



export function buildAntonymCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  pairCount?: number,
  diversity?: CandidateDiversityOptions,
): string {
  const markerCount =
    typeof pairCount === "number" &&
    pairCount >= ANTONYM_MARKER_COUNT_MIN &&
    pairCount <= ANTONYM_MARKER_COUNT_MAX
      ? Math.round(pairCount)
      : ANTONYM_MARKER_COUNT_DEFAULT;
  const allCandidates = findAntonymCandidates(passage, requestedDifficulty);
  const { items: usableCandidates, exhausted: usedExhausted } = filterUsedCandidates(
    allCandidates,
    diversity?.usedTargets,
    (candidate) => `${candidate.sourceWord} ${candidate.correctAntonym}`,
  );
  const candidates = rotateByVariantIndex(
    usableCandidates,
    diversity?.variantIndex,
  ).slice(0, 12);
  const safeCountRule =
    candidates.length >= markerCount
      ? `- Use ${markerCount} marked source words from this safe list whenever possible. At minimum, ${markerCount - 1} of the ${markerCount} markedWords should come from this list.`
      : `- Use every relevant safe candidate below first. If fewer than ${markerCount} are available, add your own only when the pair is equally clean and source-backed.`;

  const candidateLines = candidates.length
    ? candidates.map((candidate, index) => {
        const avoidPairs = candidate.avoidPairs?.length
          ? ` | forbiddenPairs="${candidate.avoidPairs.join(", ")}"`
          : "";
        return `${index + 1}. sourceWord="${candidate.sourceWord}" | correctAntonym="${candidate.correctAntonym}" | suggestedWrongPair="${candidate.suggestedWrongPair}" | pos="${candidate.pos}" | note="${candidate.note}"${avoidPairs} | surroundingText="${candidate.surroundingText}"`;
      })
    : ["- No high-confidence automatic pair was found. Use only same-POS, same-form, same-axis pairs; do not use relation-only pairs."];

  return [
    "## ANTONYM target planning guardrail",
    safeCountRule,
    // 안전 쌍이 전부 기사용이면 "회피 + 목록 강제"가 동시에 성립 불가 —
    // 재사용을 명시적으로 허용해 모순 지시를 해소한다.
    usedExhausted
      ? "- 이 지문의 안전 쌍은 모두 이전 문항에서 사용되었습니다. 재사용을 허용하되, 잘못된 쌍의 위치와 오답 설계를 이전 문항과 다르게 구성하세요."
      : "",
    "- For the four non-answer options, use correctAntonym exactly as the displayed antonym — after checking it against the word's sense IN THIS PASSAGE (context-sense rule below).",
    "- ⚠️ Context-sense rule: this list maps each word's MOST FREQUENT sense. If the passage uses the word in a different sense (e.g., 'common' in 'share a common root' means shared, not frequent), the listed correctAntonym is contextually wrong — never ship it as a correct pair there. That very mismatch, however, is the best raw material for the single incorrect pair (wrong-axis trap).",
    "- Never use both directions of the same pair as separate options, such as good-bad and bad-good in one item.",
    ...(requestedDifficulty === "KILLER" || requestedDifficulty === "INTERMEDIATE"
      ? [
          "- Answer design (the single incorrect pair) at this difficulty — a CONTEXT trap, never a flashcard giveaway:",
          "  1) Best: wrong-axis polysemy trap — pick a source word whose passage sense differs from its everyday sense, display a legitimate dictionary antonym of the everyday sense (looks antonym-like at a glance), and set correctAntonym to the antonym of the passage sense. Example: 'common' used as shared → display \"common - rare\" (plausible but wrong axis) with correctAntonym=\"separate\".",
          "  2) Acceptable: a same-field neighbor of the correct antonym whose nuance/degree/direction is off, so the pair only fails when re-read against the passage.",
          "  3) 🚫 Forbidden as the answer: transparent synonym displays that any student spots without reading the passage (true - real, big - large, good - beneficial), and ultra-basic words (true/good/bad/new/long/same/old) as the answer word — they reduce the item to a vocabulary flashcard. Such words may fill at most 1-2 clean distractor pairs.",
          requestedDifficulty === "KILLER"
            ? "- KILLER distractor calibration: the four correct pairs stay clean and unambiguous, but do not fill them all with primary-school dictionary pairs (long-short, oldest-newest, same-different) — at most one such pair; prefer passage-anchored content words in matching form so eliminating them still requires reading."
            : "- INTERMEDIATE distractor calibration: correct pairs stay clean, but at least two should be passage-anchored content words (not primary-school pairs), so the item is not solvable purely from word knowledge.",
        ]
      : [
          "- For the single answer option, choose one safe sourceWord and display its suggestedWrongPair as antonym; still fill correctAntonym with the real correctAntonym.",
          "- Do not invent near-miss pairs when a suggestedWrongPair is available. This prevents vague pairs such as force-restrain or unproductive-passive from appearing.",
          "- BASIC calibration: use the clearest pairs from the list and avoid obscure vocabulary.",
        ]),
    "### Safe source-backed ANTONYM pairs",
    ...candidateLines,
    "### Global forbidden ANTONYM pairs",
    "- force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, paid-refunded",
  ].filter(Boolean).join("\n");
}



export function findAntonymCandidates(
  passage: string,
  requestedDifficulty?: string,
): AntonymCandidate[] {
  const seenWords = new Set<string>();
  const seenAxes = new Set<string>();
  const candidates: AntonymCandidate[] = [];

  for (const entry of ANTONYM_SAFE_LEXICON) {
    const match = findStandaloneTokenMatch(passage, entry.word);
    if (!match) continue;

    const wordKey = normalizeComparableText(entry.word);
    const axisKey = [antonymPairKey(entry.word), antonymPairKey(entry.correctAntonym)]
      .filter(Boolean)
      .sort()
      .join("|");
    if (seenWords.has(wordKey) || (axisKey && seenAxes.has(axisKey))) continue;
    seenWords.add(wordKey);
    if (axisKey) seenAxes.add(axisKey);

    candidates.push({
      ...entry,
      sourceWord: match.word,
      surroundingText: buildSurroundingWindow(passage, match.index, match.word.length),
      index: match.index,
    });
  }

  return candidates.sort((a, b) => (
    antonymCandidateScore(b, requestedDifficulty) -
    antonymCandidateScore(a, requestedDifficulty)
  ));
}



export function antonymCandidateScore(
  candidate: AntonymCandidate,
  requestedDifficulty?: string,
): number {
  const base = candidate.priority ?? 5;
  const lengthBonus = Math.min(3, Math.floor(candidate.sourceWord.length / 4));
  const killerBonus =
    requestedDifficulty === "KILLER" && /scale|superlative|matching|outlook|reasonableness/i.test(candidate.note)
      ? 2
      : 0;
  const basicPenalty =
    requestedDifficulty === "BASIC" && candidate.sourceWord.length > 12
      ? 2
      : 0;
  return base + lengthBonus + killerBonus - basicPenalty;
}



export function findStandaloneTokenMatch(
  text: string,
  token: string,
): { word: string; index: number } | null {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  const match = regex.exec(text);
  if (!match) return null;
  return { word: match[0], index: match.index };
}
