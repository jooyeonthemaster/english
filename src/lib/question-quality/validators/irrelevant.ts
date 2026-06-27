// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { IRRELEVANT_SLOT_MIN, QuestionQualitySeverity, containsComparableSentence, containsStandaloneToken, contentTokens, countTokenOverlap, isRecord, normalizeComparableText, normalizeLabel, normalizeText, splitPassageSentences } from "../core";



export function validateIrrelevantQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  requestedSlotCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.map((sentence: unknown) => normalizeText(sentence))
    : [];
  const slotCount = sentences.length;
  const expectedSlotCount =
    typeof requestedSlotCount === "number" && Number.isFinite(requestedSlotCount)
      ? Math.max(IRRELEVANT_SLOT_MIN, Math.round(requestedSlotCount))
      : IRRELEVANT_SLOT_MIN;
  if (slotCount !== expectedSlotCount) {
    add("error", "irrelevant-sentence-count", `IRRELEVANT must have exactly ${expectedSlotCount} marked sentences, got ${slotCount}.`);
    return;
  }

  if (sentences.some((sentence) => !sentence)) {
    add("error", "empty-irrelevant-sentence", "IRRELEVANT contains an empty numbered sentence.");
    return;
  }

  const irrelevantIndex = Number(question.irrelevantIndex);
  if (!Number.isInteger(irrelevantIndex) || irrelevantIndex < 0 || irrelevantIndex >= slotCount) {
    add("error", "irrelevant-index-range", `irrelevantIndex must be an integer from 0 to ${slotCount - 1}.`);
    return;
  }
  if (irrelevantIndex === 0 || irrelevantIndex === slotCount - 1) {
    add(
      "error",
      "irrelevant-index-edge",
      "IRRELEVANT answer cannot be the first or last numbered sentence.",
    );
  }

  const expectedAnswer = String(irrelevantIndex + 1);
  if (normalizeLabel(question.correctAnswer) !== expectedAnswer) {
    add(
      "error",
      "irrelevant-answer-index-mismatch",
      `correctAnswer must point to irrelevantIndex ${irrelevantIndex}; expected option ${expectedAnswer}.`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionLabels = options.map((option) => normalizeLabel(option.label));
  const expectedLabels = Array.from({ length: slotCount }, (_, index) => String(index + 1));
  if (optionLabels.length === slotCount && optionLabels.some((label, index) => label !== expectedLabels[index])) {
    add(
      "warning",
      "irrelevant-option-labels",
      `IRRELEVANT options should be ordered ①~${getCircledNumber(slotCount - 1)}.`,
    );
  }

  if (!passage) return;

  const sourceSlots = sentences
    .map((sentence, index) => ({ sentence, slotIndex: index }))
    .filter(({ slotIndex }) => slotIndex !== irrelevantIndex);
  const sourceSentences = sourceSlots.map(({ sentence }) => sentence);
  const passageSentences = splitPassageSentences(passage, { includeShort: true });
  const usedPassageSentenceIndices = new Set<number>();
  const matchedSourceSlots: Array<{ slotIndex: number; passageIndex: number }> = [];

  for (const { sentence: sourceSentence, slotIndex } of sourceSlots) {
    const passageIndex = findComparablePassageSentenceIndex(
      passageSentences,
      sourceSentence,
      usedPassageSentenceIndices,
    );
    if (passageIndex === -1) {
      add(
        "error",
        "irrelevant-source-not-verbatim",
        `A non-answer sentence is not copied verbatim from the passage: ${sourceSentence.slice(0, 80)}`,
      );
    } else {
      usedPassageSentenceIndices.add(passageIndex);
      matchedSourceSlots.push({ slotIndex, passageIndex });
      if (passageIndex === 0) {
        add(
          "error",
          "irrelevant-source-first-sentence",
          "The original first passage sentence must not appear as a numbered choice in IRRELEVANT questions.",
        );
      }
    }
  }

  if (matchedSourceSlots.length === slotCount - 1) {
    const orderedMatches = matchedSourceSlots
      .slice()
      .sort((a, b) => a.slotIndex - b.slotIndex);
    const passageIndices = orderedMatches.map((match) => match.passageIndex);
    const isOriginalOrder = passageIndices.every(
      (passageIndex, index) =>
        index === 0 || passageIndex > passageIndices[index - 1],
    );

    // The marked source sentences may be SPREAD across the passage (they no
    // longer have to be a contiguous early block), but they must keep their
    // original passage order so the inserted sentence sits between two real
    // consecutive neighbors and the remove-and-reconnect test stays valid.
    if (!isOriginalOrder) {
      add(
        "error",
        "irrelevant-source-order",
        "The non-answer sentences must appear in their original passage order.",
      );
    }
  }

  const insertedSentence = sentences[irrelevantIndex];
  if (containsComparableSentence(passage, insertedSentence)) {
    add(
      "error",
      "irrelevant-answer-from-source",
      "The answer sentence appears verbatim in the original passage; it should be the inserted sentence.",
    );
  }

  const insertedTokens = contentTokens(insertedSentence);
  const sourceTokens = contentTokens(sourceSentences.join(" "));
  const passageTokens = contentTokens(passage);
  const sourceOverlap = countTokenOverlap(insertedTokens, sourceTokens);
  const passageOverlap = countTokenOverlap(insertedTokens, passageTokens);
  const sourceOverlapRatio = sourceOverlap / Math.max(1, insertedTokens.size);
  const adjacentSentences = [
    sentences[irrelevantIndex - 1],
    sentences[irrelevantIndex + 1],
  ].filter((sentence): sentence is string => !!sentence);
  const adjacentOverlap = countTokenOverlap(
    insertedTokens,
    contentTokens(adjacentSentences.join(" ")),
  );

  if (passageOverlap < 2 || sourceOverlap < 2) {
    add(
      "error",
      "irrelevant-too-unrelated",
      "The inserted sentence has too little lexical overlap with the passage/source flow and will read as an obvious unrelated sentence.",
    );
  }

  if (requestedDifficulty === "KILLER" && sourceOverlapRatio < 0.18) {
    add(
      "error",
      "irrelevant-too-many-new-terms",
      "The inserted sentence introduces too many new meaningful terms instead of staying close to the source flow.",
    );
  } else if (requestedDifficulty === "KILLER" && sourceOverlapRatio < 0.25) {
    add(
      "warning",
      "irrelevant-new-term-heavy",
      "The inserted sentence is somewhat heavy on new terms; prefer more source-window vocabulary.",
    );
  }

  if (requestedDifficulty === "KILLER" && adjacentOverlap < 1) {
    add(
      "warning",
      "irrelevant-weak-local-trap",
      "KILLER IRRELEVANT should share at least one meaningful keyword with a neighboring sentence.",
    );
  }

  const averageSourceLength =
    sourceSentences.reduce((sum, sentence) => sum + sentence.length, 0) /
    Math.max(1, sourceSentences.length);
  if (
    averageSourceLength > 0 &&
    (insertedSentence.length < averageSourceLength * 0.45 ||
      insertedSentence.length > averageSourceLength * 1.8)
  ) {
    add(
      "warning",
      "irrelevant-style-length-mismatch",
      "The inserted sentence length is noticeably different from the source sentences.",
    );
  }

  if (requestedDifficulty === "KILLER") {
    if (/\ballow(?:s|ed|ing)?\s+\w+\s+to\s+active\b/i.test(insertedSentence)) {
      add(
        "error",
        "irrelevant-inserted-ungrammatical",
        "The inserted sentence contains awkward or ungrammatical English.",
      );
    }

    const extremeCue = findNewExtremeCue(insertedSentence, passage);
    if (extremeCue) {
      add(
        "error",
        "irrelevant-obvious-extreme-cue",
        `The inserted sentence uses an obvious extreme cue not present in the passage: ${extremeCue}.`,
      );
    }

    const counterclaimCue = findNewCounterclaimCue(insertedSentence, passage);
    if (counterclaimCue) {
      add(
        "error",
        "irrelevant-obvious-counterclaim-cue",
        `KILLER IRRELEVANT should not be exposed by an explicit counterclaim cue: ${counterclaimCue}.`,
      );
    }

    const prescriptiveCue = findPrescriptiveGiveawayCue(insertedSentence);
    if (prescriptiveCue) {
      add(
        "error",
        "irrelevant-prescriptive-giveaway",
        `KILLER IRRELEVANT should not be exposed by a blunt advice/policy cue: ${prescriptiveCue}.`,
      );
    }

    // Generic "agent + must/should/need to" advice dropped into a purely
    // descriptive passage is a register tell — unless the passage itself already
    // gives advice in that modal register.
    const adviceCue =
      /\b(?:designers?|managers?|users?|students?|teachers?|people|companies|individuals?|readers?|scientists?|researchers?|one|we|you)\s+(?:must|should|need\s+to|have\s+to|ought\s+to)\b/i;
    const passageHasAdviceRegister = /\b(?:must|should|ought\s+to)\b/i.test(passage);
    if (adviceCue.test(insertedSentence) && !passageHasAdviceRegister) {
      add(
        "error",
        "irrelevant-prescriptive-advice",
        "The inserted sentence gives direct advice (agent + must/should/need to) that is out of register for the descriptive passage.",
      );
    }

    // Methodology / procedure / measurement drift — the most common Gemini tell:
    // the inserted sentence pivots from the passage's idea into "to measure/
    // optimize/calculate X you need a procedure/equipment/tool". Passage-gated.
    const methodologyDriftPatterns: Array<[string, RegExp]> = [
      ["procedure/process requires", /\b(?:the\s+)?(?:procedure|process|method|technique|protocol|system|approach)\s+(?:requires|involves|demands|entails|relies\s+on|depends\s+on)\b/i],
      ["it is essential/necessary to", /\bit\s+is\s+(?:essential|necessary|crucial|vital|important|imperative)\s+to\b/i],
      ["methodology gerund lead", /^(?:in\s+\w+,?\s+|while\s+[^,]+,\s+)?(?:measuring|optimi[sz]ing|calculating|quantifying|standardi[sz]ing|categori[sz]ing|catalogu?ing|indexing|monitoring|storing|organi[sz]ing|tracking)\b/i],
      ["to measure/optimize/...", /\bto\s+(?:measure|optimi[sz]e|calculate|quantify|standardi[sz]e|categori[sz]e|monitor|index|catalog|track)\b/i],
      ["measure/track the precise/exact", /\b(?:measure|track|calculate|monitor|quantify)\s+(?:the\s+)?(?:precise|exact|accurate)\b/i],
      ["requires precise/sufficient/advanced", /\brequires?\s+(?:the\s+)?(?:precise|exact|sufficient|accurate|advanced|specialized|highly|careful)\b/i],
      ["laboratory/equipment drift", /\b(?:laborator|lab)\w*\s+(?:equipment|procedures?|techniques?|settings?)\b/i],
      ["automated tracking/tooling", /\bautomat(?:ed|ically)\s+(?:track|monitor|catalog|index|record)\w*\b/i],
      ["develop/build tools/equipment", /\b(?:develop|building|build|design|implement|install)\w*\s+\w*\s*(?:tools?|equipment|software|systems?|infrastructure|mechanisms?|tutorials?|dashboards?|devices?)\b/i],
    ];
    const methodologyDrift = methodologyDriftPatterns.find(
      ([, re]) => re.test(insertedSentence) && !re.test(passage),
    );
    if (methodologyDrift) {
      add(
        "error",
        "irrelevant-methodology-drift",
        `The inserted sentence drifts into a methodology/procedure/measurement/tooling sub-topic, a recognizable AI-generator tell: ${methodologyDrift[0]}.`,
      );
    }

    const externalCue = findAbsentExternalSettingCue(insertedSentence, passage);
    if (externalCue) {
      add(
        "error",
        "irrelevant-absent-external-setting",
        `The inserted sentence imports an external setting absent from the passage: ${externalCue}.`,
      );
    }
  }
}



export function findComparablePassageSentenceIndex(
  passageSentences: string[],
  sentence: string,
  usedIndices: Set<number>,
): number {
  const comparableSentence = normalizeComparableText(sentence).replace(/[.!?]+$/, "");
  if (comparableSentence.length < 2) return -1;

  for (let index = 0; index < passageSentences.length; index += 1) {
    if (usedIndices.has(index)) continue;
    const comparablePassageSentence = normalizeComparableText(
      passageSentences[index],
    ).replace(/[.!?]+$/, "");
    if (
      comparablePassageSentence === comparableSentence ||
      comparablePassageSentence.includes(comparableSentence) ||
      comparableSentence.includes(comparablePassageSentence)
    ) {
      return index;
    }
  }

  return -1;
}



export function findNewExtremeCue(sentence: string, passage: string): string | null {
  const cues = [
    "always", "never", "everyone", "everybody", "completely", "entirely",
    "guarantees", "guarantee", "guaranteed", "ensures",
  ];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
}



export function findNewCounterclaimCue(sentence: string, passage: string): string | null {
  const cuePatterns: Array<[string, RegExp]> = [
    ["however", /\bhowever\b/i],
    ["instead", /\binstead\b/i],
    ["rather than", /\brather\s+than\b/i],
    ["by contrast", /\bby\s+contrast\b/i],
    ["on the contrary", /\bon\s+the\s+contrary\b/i],
    ["nevertheless", /\bnevertheless\b/i],
    ["nonetheless", /\bnonetheless\b/i],
  ];

  for (const [label, pattern] of cuePatterns) {
    if (pattern.test(sentence) && !pattern.test(passage)) return label;
  }

  const backlashPatterns: Array<[string, RegExp]> = [
    [
      "regulation backlash",
      /\b(?:aggressive|excessive|burdensome|strict)\s+(?:regulations?|rules?|requirements?|disclosures?)\b/i,
    ],
    [
      "hinder research",
      /\b(?:hinder|hinders|hindered|hindering|limit|limits|limited|limiting|restrict|restricts|restricted|restricting)\b[\s\S]{0,80}\b(?:research|science|scientific|progress|innovation|freedom)\b/i,
    ],
    [
      "academic freedom",
      /\bacademic\s+freedom\b/i,
    ],
    [
      "intellectual property",
      /\bintellectual\s+property(?:\s+rights?)?\b/i,
    ],
    [
      "own academic interests",
      /\bown\s+academic\s+interests\b/i,
    ],
    [
      "sponsor relationships",
      /\b(?:sponsor|sponsors|funding\s+sponsors)\b[\s\S]{0,60}\brelationships?\b|\brelationships?\b[\s\S]{0,60}\b(?:sponsor|sponsors|funding\s+sponsors)\b/i,
    ],
  ];

  for (const [label, pattern] of backlashPatterns) {
    if (pattern.test(sentence) && !pattern.test(passage)) return label;
  }

  return null;
}



export function findPrescriptiveGiveawayCue(sentence: string): string | null {
  const patterns: Array<[string, RegExp]> = [
    ["to maximize", /^\s*to\s+maximize\b/i],
    ["should actively", /\bshould\s+actively\b/i],
    ["should prioritize", /\bshould\s+prioritize\b/i],
    ["should secure", /\bshould\s+secure\b/i],
    ["should protect", /\bshould\s+protect\b/i],
    ["should build", /\bshould\s+build\b/i],
    ["should focus on", /\bshould\s+(?:focus|concentrate|work)\s+on\b/i],
    ["encourage researchers", /\bencourage\s+researchers\b/i],
    ["develop sponsor relationships", /\bdevelop\s+[\s\S]{0,50}\brelationships?\s+with\s+[\s\S]{0,20}\bsponsors?\b/i],
    ["must avoid", /\bmust\s+avoid\b/i],
    ["ought to", /\bought\s+to\b/i],
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(sentence)) return label;
  }
  return null;
}



export function findAbsentExternalSettingCue(sentence: string, passage: string): string | null {
  const cues = [
    "advertising",
    "advertisement",
    "application",
    "apps",
    "class",
    "classes",
    "device",
    "devices",
    "digital",
    "photo",
    "photos",
    "restaurant",
    "restaurants",
    "school",
    "shopping",
    "software",
    "sports",
    "technologies",
    "technology",
    "traffic",
    "vehicle",
    "vehicles",
    "weather",
  ];
  for (const cue of cues) {
    if (containsStandaloneToken(sentence, cue) && !containsStandaloneToken(passage, cue)) {
      return cue;
    }
  }
  return null;
}
