import {
  getCircledNumbers,
  type PostProcessResult,
  type QuestionPostProcessData,
} from "../types";
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

function stripLeadingChoiceMarker(value: string): string {
  const trimmed = value.trim();
  const circled = getCircledNumbers(50).find((label) => trimmed.startsWith(label));
  if (circled) {
    return trimmed
      .slice(circled.length)
      .replace(/^[\s.．、:：-]+/, "")
      .trim();
  }

  return trimmed
    .replace(/^\s*(?:\((?:[1-9]|[1-4]\d|50)\)|(?:[1-9]|[1-4]\d|50)[.)])\s+/, "")
    .replace(/^\s*(?:[1-9]|[1-4]\d|50)\s+(?=[A-Z"'])/, "")
    .trim();
}

export function processIrrelevant(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const sentences = ai.sentences as string[];
  let irrelevantIndex = Number(ai.irrelevantIndex);

  if (!sentences || !Array.isArray(sentences)) {
    return { success: false, data: ai, warnings, error: "Missing sentences field" };
  }

  if (sentences.length < 5) {
    warnings.push(`Expected at least 5 sentences, got ${sentences.length}`);
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
  const repairedSentences = sentences.map((sentence) =>
    typeof sentence === "string" ? stripLeadingChoiceMarker(sentence) : sentence,
  );

  if (irrelevantIndex === 0 || irrelevantIndex === repairedSentences.length - 1) {
    const targetIndex =
      irrelevantIndex === 0 ? 1 : Math.max(1, repairedSentences.length - 2);
    const [insertedSentence] = repairedSentences.splice(irrelevantIndex, 1);
    repairedSentences.splice(targetIndex, 0, insertedSentence);
    warnings.push(
      `IRRELEVANT inserted sentence was placed at an edge; moved to numbered slot ${targetIndex + 1}`,
    );
    irrelevantIndex = targetIndex;
  }

  const availableNumberedSourceCount = Math.max(0, passageSentences.length - 1);
  if (repairedSentences.length - 1 > availableNumberedSourceCount) {
    const introIndex = repairedSentences.findIndex(
      (sentence, index) =>
        index !== irrelevantIndex &&
        normalize(sentence) === normalize(passageSentences[0] ?? ""),
    );
    if (introIndex >= 0) {
      repairedSentences.splice(introIndex, 1);
      if (introIndex < irrelevantIndex) {
        irrelevantIndex -= 1;
      }
      warnings.push(
        "IRRELEVANT source list included the original first passage sentence; removed it from numbered choices",
      );
    }
  }

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

  // Locate each non-irrelevant slot inside the original passage so the chosen
  // sentences can be marked IN PLACE — spread across the whole passage — rather
  // than forced into a contiguous block at the top. The per-slot repair above
  // already snapped each non-answer slot to its verbatim original.
  const sourcePassageIndexBySlot = new Map<number, number>();
  for (let i = 0; i < repairedSentences.length; i++) {
    if (i === irrelevantIndex) continue;
    const match = bestSingleSentenceMatch(repairedSentences[i], passageSentences);
    if (match.idx > 0 && match.score <= 0.2) {
      repairedSentences[i] = passageSentences[match.idx];
      sourcePassageIndexBySlot.set(i, match.idx);
    }
  }
  // Sources must be distinct and in ascending passage order to reconstruct the
  // passage in place; otherwise fall back to a contiguous block after the intro.
  const locatedSlots = Array.from(sourcePassageIndexBySlot.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  const locatedPassageIndices = locatedSlots.map(([, pIdx]) => pIdx);
  const allSourcesLocated =
    sourcePassageIndexBySlot.size === repairedSentences.length - 1 &&
    new Set(locatedPassageIndices).size === locatedPassageIndices.length &&
    locatedPassageIndices.every(
      (pIdx, index) => index === 0 || pIdx > locatedPassageIndices[index - 1],
    );

  // Answer choices stay numbered (① ② ③ …); each number maps to the circled
  // letter (ⓐ ⓑ ⓒ …) that marks its sentence inside the passage — the 내신
  // 변형형 layout from the reference.
  const numbers = getCircledNumbers(repairedSentences.length);
  const normalizedOptions = numbers.map((label, i) => ({
    label,
    text: numbers[i] ?? label,
  }));
  const expectedAnswer = numbers[irrelevantIndex] ?? String(irrelevantIndex + 1);
  const wrongOptionExplanations = alignIrrelevantWrongOptionExplanations(
    ai.wrongOptionExplanations,
    numbers,
    irrelevantIndex,
  );
  if (normalizeAnswerLabel(ai.correctAnswer) !== String(irrelevantIndex + 1)) {
    warnings.push(`correctAnswer realigned to irrelevantIndex ${irrelevantIndex}`);
  }

  const passageWithNumbers = allSourcesLocated
    ? buildSpreadMarkedPassage(
        passageSentences,
        repairedSentences,
        irrelevantIndex,
        sourcePassageIndexBySlot,
        numbers,
      )
    : buildFallbackMarkedPassage(repairedSentences, passageSentences, numbers);

  return {
    success: true,
    data: {
      ...ai,
      sentences: repairedSentences,
      correctAnswer: expectedAnswer,
      options: normalizedOptions,
      wrongOptionExplanations,
      passageWithNumbers,
    },
    warnings,
  };
}

/**
 * Reconstruct the FULL passage with the 5 chosen sentences marked with circled
 * letters ⓐ–ⓔ and underlined (`__…__`), each at its ORIGINAL position so the
 * marked sentences spread naturally across the whole passage (no top-clustering).
 * The inserted irrelevant sentence is placed right after the source that
 * precedes it, so removing it reconnects two consecutive originals seamlessly.
 * Every other sentence — intro, gaps between marks, and trailing context — stays
 * plain and verbatim. Stored under `passageWithNumbers` for backward compat.
 */
function buildSpreadMarkedPassage(
  passageSentences: string[],
  slots: string[],
  irrelevantIndex: number,
  sourcePassageIndexBySlot: Map<number, number>,
  markers: string[],
): string {
  const slotByPassageIndex = new Map<number, number>();
  for (const [slot, pIdx] of sourcePassageIndexBySlot) {
    slotByPassageIndex.set(pIdx, slot);
  }
  // Insert the irrelevant sentence right after the source that precedes it.
  const insertAfter = sourcePassageIndexBySlot.get(irrelevantIndex - 1);

  let markerCursor = 0;
  const mark = (text: string) =>
    `${markers[markerCursor++] ?? ""} __${stripLeadingChoiceMarker(text.trim())}__`.trim();

  const out: string[] = [];
  for (let i = 0; i < passageSentences.length; i++) {
    out.push(
      slotByPassageIndex.has(i)
        ? mark(passageSentences[i])
        : passageSentences[i].trim(),
    );
    if (i === insertAfter) {
      out.push(mark(slots[irrelevantIndex]));
    }
  }
  return out.filter(Boolean).join(" ");
}

/** Fallback when the source sentences cannot be located verbatim in the passage:
 *  intro + a contiguous lettered/underlined block of all five slots. */
function buildFallbackMarkedPassage(
  slots: string[],
  passageSentences: string[],
  markers: string[],
): string {
  const intro = passageSentences[0]?.trim() ?? "";
  const block = slots.map(
    (sentence, index) =>
      `${markers[index] ?? ""} __${stripLeadingChoiceMarker(sentence.trim())}__`.trim(),
  );
  return [intro, ...block].filter(Boolean).join(" ");
}

function alignIrrelevantWrongOptionExplanations(
  raw: unknown,
  markers: string[],
  irrelevantIndex: number,
): Record<string, string> {
  const existing = readWrongOptionExplanationMap(raw);
  const aligned: Record<string, string> = {};

  for (let index = 0; index < markers.length; index += 1) {
    if (index === irrelevantIndex) continue;
    const numericLabel = String(index + 1);
    const marker = markers[index];
    aligned[marker] =
      existing[numericLabel] ||
      existing[marker] ||
      "이 문장은 원문 흐름에 포함된 문장으로, 앞뒤 내용과 자연스럽게 이어지므로 무관한 문장이 아닙니다.";
  }

  return aligned;
}

function readWrongOptionExplanationMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const label = normalizeAnswerLabel(record.label);
      const explanation =
        typeof record.explanation === "string" ? record.explanation.trim() : "";
      if (label && explanation) out[label] = explanation;
    }
    return out;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [label, explanation] of Object.entries(raw)) {
    const normalizedLabel = normalizeAnswerLabel(label);
    if (typeof explanation === "string" && normalizedLabel && explanation.trim()) {
      out[normalizedLabel] = explanation.trim();
    }
  }
  return out;
}

function normalizeAnswerLabel(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  const circledMap: Record<string, string> = Object.fromEntries(
    getCircledNumbers(50).map((label, index) => [label, String(index + 1)]),
  );
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?(\d{1,3})[\)\].]?\s*$/, "$1")
    .trim();
}
