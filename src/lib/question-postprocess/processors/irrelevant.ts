import { CIRCLED_NUMBERS, type PostProcessResult, type QuestionPostProcessData } from "../types";
import { splitPassageSentences } from "@/lib/passage-sentence-utils";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00ad]/g, "")
    .replace(/[\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?"'()\-]/g, "")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function bestSingleSentenceMatch(slot: string, pool: string[]): { idx: number; score: number; orig: string } {
  const target = normalize(slot);
  let best = { idx: -1, score: Infinity, orig: "" };
  for (let i = 0; i < pool.length; i++) {
    const cand = normalize(pool[i]);
    if (!cand) continue;
    const dist = levenshtein(target, cand);
    const score = dist / Math.max(target.length, cand.length, 1);
    if (score < best.score) best = { idx: i, score, orig: pool[i] };
  }
  return best;
}

function findPrefixSentence(slot: string, pool: string[]): { idx: number; orig: string } | null {
  const slotNorm = normalize(slot);
  if (!slotNorm) return null;
  let best: { idx: number; orig: string; len: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    const cand = pool[i];
    const candNorm = normalize(cand);
    if (!candNorm) continue;
    if (slotNorm.startsWith(candNorm) && (best === null || candNorm.length > best.len)) {
      best = { idx: i, orig: cand, len: candNorm.length };
    }
  }
  return best ? { idx: best.idx, orig: best.orig } : null;
}

// "Inverse fusion": the AI returned a slot that is a *prefix* of an original
// passage sentence (because the original itself was a run-on sentence with a
// missing period). Expand the slot back to the full original sentence so the
// student sees verbatim source text.
function findOriginalContainingSlot(slot: string, pool: string[]): { idx: number; orig: string } | null {
  const slotNorm = normalize(slot);
  if (!slotNorm) return null;
  let best: { idx: number; orig: string; len: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    const cand = pool[i];
    const candNorm = normalize(cand);
    if (!candNorm) continue;
    if (candNorm.startsWith(slotNorm) && candNorm.length > slotNorm.length) {
      if (best === null || candNorm.length < best.len) {
        // prefer the shortest containing original (tightest expansion)
        best = { idx: i, orig: cand, len: candNorm.length };
      }
    }
  }
  return best ? { idx: best.idx, orig: best.orig } : null;
}

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

  if (sentences.length < 5 || sentences.length > 10) {
    warnings.push(`Expected 5~10 sentences, got ${sentences.length}`);
  }

  if (!Number.isInteger(irrelevantIndex) || irrelevantIndex < 0 || irrelevantIndex >= sentences.length) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Invalid irrelevantIndex: ${ai.irrelevantIndex}`,
    };
  }

  // ── Verbatim-snap repair ────────────────────────────────────────────────
  // Each non-irrelevant slot must contain exactly ONE original passage sentence.
  // If a slot has fused 2+ original sentences (sentence fusion), or has drifted
  // due to paraphrase/punctuation change, snap it back to the single best
  // matching passage sentence.
  const passageSentences = splitPassageSentences(passage);
  const repairedSentences = sentences.slice();

  for (let i = 0; i < repairedSentences.length; i++) {
    if (i === irrelevantIndex) continue;
    const slot = repairedSentences[i];
    if (typeof slot !== "string" || !slot.trim()) continue;

    const prefix = findPrefixSentence(slot, passageSentences);
    const expand = findOriginalContainingSlot(slot, passageSentences);
    const match = bestSingleSentenceMatch(slot, passageSentences);

    const slotNorm = normalize(slot);
    const matchNorm = normalize(match.orig);
    const lengthRatio = matchNorm.length > 0 ? slotNorm.length / matchNorm.length : 1;

    if (prefix && slotNorm.length > normalize(prefix.orig).length * 1.15) {
      // Slot starts with an original sentence but continues into another → fusion
      warnings.push(
        `IRRELEVANT slot ${i + 1} fused multiple original sentences; repaired to single sentence "${prefix.orig.slice(0, 60)}..."`,
      );
      repairedSentences[i] = prefix.orig;
    } else if (match.score === 0) {
      // Exact match — keep as-is
    } else if (expand && match.score > 0.05) {
      // AI returned a prefix of an original run-on sentence (original passage
      // had a missing period). Expand to full original so user sees verbatim.
      warnings.push(
        `IRRELEVANT slot ${i + 1} was a prefix of a longer original sentence; expanded to full original`,
      );
      repairedSentences[i] = expand.orig;
    } else if (match.score <= 0.05) {
      // Near-exact (whitespace/punctuation noise only) — snap to canonical original
      repairedSentences[i] = match.orig;
    } else if (lengthRatio > 1.25 && match.score <= 0.4) {
      // Long slot that loosely contains/matches a single passage sentence → likely fusion
      warnings.push(
        `IRRELEVANT slot ${i + 1} likely fuses passage sentences (length ratio ${lengthRatio.toFixed(2)}); repaired`,
      );
      repairedSentences[i] = match.orig;
    } else if (match.score <= 0.2) {
      // Minor paraphrase / punctuation drift → snap back to verbatim
      warnings.push(
        `IRRELEVANT slot ${i + 1} drifted from original (score ${match.score.toFixed(3)}); snapped to verbatim`,
      );
      repairedSentences[i] = match.orig;
    } else {
      // Neither close match nor clean prefix → leave as-is but warn
      warnings.push(
        `IRRELEVANT slot ${i + 1} has no close passage match (best score ${match.score.toFixed(3)}); kept AI text`,
      );
    }
  }

  const markers = CIRCLED_NUMBERS.slice(0, repairedSentences.length);
  const normalizedOptions = markers.map((label) => ({
    label,
    text: label,
  }));
  const expectedAnswer = markers[irrelevantIndex] ?? String(irrelevantIndex + 1);
  if (normalizeAnswerLabel(ai.correctAnswer) !== String(irrelevantIndex + 1)) {
    warnings.push(`correctAnswer realigned to irrelevantIndex ${irrelevantIndex}`);
  }

  const numbered = repairedSentences
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
      sentences: repairedSentences,
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
    "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
    "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
  };
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?(\d{1,2})[\)\].]?\s*$/, "$1")
    .trim();
}
