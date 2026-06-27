// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { pickSteeredPositions } from "@/lib/question-diversity";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { CandidateDiversityOptions } from "./shared";
import { IRRELEVANT_SLOT_MIN, splitPassageSentences } from "../core";



export function buildIrrelevantCandidateBlock(
  passage: string,
  requestedSlotCount = 5,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const slotCount = Math.max(IRRELEVANT_SLOT_MIN, Math.round(requestedSlotCount));
  const minimumSourceSentenceCount = IRRELEVANT_SLOT_MIN - 1;
  const eligibleSentences = sentences.slice(1);
  if (eligibleSentences.length < minimumSourceSentenceCount) {
    return [
      "## Valid IRRELEVANT source candidates",
      `- Fewer than ${minimumSourceSentenceCount} usable source sentences were detected after excluding the original first passage sentence. Do not invent source sentences.`,
    ].join("\n");
  }

  const sourceCount = slotCount - 1; // verbatim originals among the choices
  // Force the answer position to vary across items (the model otherwise always
  // lands on the middle → answer ③/ⓒ every time). Bias toward the center per
  // exam convention but genuinely rotate among ②③④.
  // 다양성 모드에서는 같은 지문의 기존 정답 위치를 피해 최소 사용 위치를 고른다.
  const targetIndex = diversity?.diversityEnabled
    ? Number(
        pickSteeredPositions(
          ["2", "3", "4"],
          diversity.usedAnswerLabels ?? [],
          diversity.variantIndex,
          1,
        )[0] ?? "3",
      ) - 1
    : (() => {
        const r = Math.random();
        return r < 0.34 ? 1 : r < 0.67 ? 2 : 3;
      })();
  const numberedEligible = eligibleSentences.map(
    (sentence, index) => `  [sentence ${index + 2}] ${sentence}`,
  );
  const lastSentenceNumber = eligibleSentences.length + 1;

  return [
    "## IRRELEVANT source sentences — pick the marked choices from here",
    "- Sentence 1 (the very first passage sentence) is the unmarked TOPIC sentence: it defines 소재 and thesis and is the reference point for relevance. Never put it in sentences[]; it stays before the choices as context.",
    `- Choose exactly ${sourceCount} sentences from the list below to be the non-answer choices. Copy each one VERBATIM (no paraphrase, merge, or split) and keep them in their original passage order.`,
    `- DISTRIBUTE the ${sourceCount} chosen sentences across the WHOLE passage body — one near the start, one or two in the middle, and one near the end (e.g. sentences like 2, ${Math.max(3, Math.round(lastSentenceNumber * 0.4))}, ${Math.max(4, Math.round(lastSentenceNumber * 0.7))}, ${lastSentenceNumber}) — so the marked choices are NOT bunched at the top. This matters most for long passages; in a short passage adjacent choices are fine.`,
    "- Write ONE new irrelevant sentence and place it BETWEEN two consecutive original sentences. The remove-and-reconnect test must pass: deleting your sentence must leave those two originals reading as one seamless, logical flow.",
    `- Output sentences[${slotCount}] in passage order: the ${sourceCount} chosen originals plus the inserted sentence at irrelevantIndex (the inserted sentence's two immediate neighbors in sentences[] are the two consecutive originals it was placed between).`,
    `- ⭐ 이번 문항의 정답 위치(고정): irrelevantIndex = ${targetIndex}. 무관문을 정확히 sentences[${targetIndex}]에 넣어 정답이 ${getCircledNumber(targetIndex)}(=${targetIndex + 1}번 선지)가 되게 하세요. 다른 위치를 쓰지 말고, 특히 항상 가운데(③)로 두지 마세요. 첫·마지막 표시 문장은 절대 금지.`,
    `- wrongOptionExplanations must include exactly ${sourceCount} entries, one for every non-answer choice.`,
    "- The inserted sentence must reuse at least two meaningful English content words from its neighbors and stay in the passage's semantic field; do not import a new setting, field, or many new concrete nouns.",
    "- It must be wrong by DISCOURSE FUNCTION (관점/평가 역전, 인과 방향 뒤집기, 범위/주어 이동, 예시→처방 전환, 하위 주제 드리프트, 과잉 일반화), not by an obviously new topic. Keep it native, neutral, and the same length/register as the source sentences; no extreme words, no blunt advice markers, no awkward grammar as the giveaway.",
    ...buildIrrelevantDifficultyGuidance(requestedDifficulty),
    `### Passage sentences (choose ${sourceCount} of these, spread out):`,
    ...numberedEligible,
  ].join("\n");
}



export function buildIrrelevantDifficultyGuidance(requestedDifficulty?: string): string[] {
  if (requestedDifficulty === "KILLER") {
    return [
      "## IRRELEVANT difficulty calibration: KILLER",
      "- Treat the current 'clear counterclaim' style as too easy. The inserted sentence must look locally acceptable on a skim.",
      "- Do NOT use giveaway opposition cues such as however, instead, rather than, might hinder, limiting academic freedom, aggressive regulations, or a simple anti-thesis statement.",
      "- Do NOT use prescriptive research-policy sentences such as researchers should prioritize their own interests, secure intellectual property rights, build sponsor partnerships, or protect academic freedom unless that exact focus already exists in the source window.",
      "- Do NOT make the intruder a recommendation to encourage researchers, build sponsor relationships, or develop stable relationships with sponsors. That is an easy advice/policy detour, not a KILLER trap.",
      "- Build the trap as ONE of these subtle shifts: an evaluation/stance reversal (positively reframe what the passage criticizes, or criticize what it praises), an actor/scope shift (this case → people in general, or this subject → a different one), a cause/effect-target swap, or a local example reframed as a general claim.",
      "- ⛔ Do NOT drift into how to MEASURE / optimize / calculate / quantify / standardize / build / develop / study the topic (procedure, evidence method, laboratory, equipment, tooling, data). Such sentences are auto-rejected. Stay a descriptive sentence about the same idea whose logic direction is wrong.",
      "- Reuse at least three meaningful content words from the chosen window, including at least one from the immediately previous or next sentence.",
      "- Keep sentence length, modality, abstraction level, and explanatory tone close to neighboring source sentences.",
      "- The sentence should become clearly removable only when the reader checks both adjacent sentences and the paragraph's conclusion.",
    ];
  }

  if (requestedDifficulty === "INTERMEDIATE") {
    return [
      "## IRRELEVANT difficulty calibration: INTERMEDIATE",
      "- This should be the default usable exam level: same topic and keywords, but a clear local focus shift.",
      "- Avoid random outside topics and avoid overly blunt advice. A mild counter-direction is acceptable only if it is not exposed by one giveaway word.",
      "- Prefer traps that borrow the passage's terms but reverse its evaluation/stance or shift its scope/actor. Do NOT drift into a measurement/procedure/administrative/tooling detail (those are auto-rejected).",
    ];
  }

  return [
    "## IRRELEVANT difficulty calibration: BASIC",
    "- Keep it readable and fair: the sentence should be passage-related but clearly off-flow after one careful read.",
    "- It may be easier than INTERMEDIATE, but it must still share the source topic and at least two meaningful keywords.",
  ];
}
