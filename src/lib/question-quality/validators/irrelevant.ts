// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumber } from "@/lib/question-postprocess/types";
import { IRRELEVANT_SLOT_MIN, QuestionQualitySeverity, collectWrongOptionExplanations, containsComparableSentence, containsStandaloneToken, contentTokens, countTokenOverlap, isRecord, normalizeComparableText, normalizeLabel, normalizeText, splitPassageSentences } from "../core";



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

  // ── 정답 라벨 단일 진실원 교차검증 (wave2: irrelevant-answer-desync) ────────
  // 후처리(processIrrelevant)가 correctAnswer/options/wrongOptionExplanations 를
  // irrelevantIndex 로 강제 재정렬하므로 위 index-mismatch 게이트는 후처리 뒤엔
  // 절대 발화하지 않는다. 그러나 해설/keyPoints "산문"에 남은 모델의 원래(틀린)
  // 원형숫자 주장은 재정렬되지 않아 그대로 출하됐다(베이스라인 실측 runIndex 29:
  // 정답 ③인데 해설이 "무관한 문장인 ②번 문장(…삽입문 인용…)" — llm 심사 15점).
  // 결정론 검증 가능한 표면만 잡는다: (a) "무관한 문장" 단서에 인접한 원형숫자,
  // (b) 원형숫자 바로 뒤에 삽입문 verbatim 인용이 따라오는 경우, (c) 오답 해설
  // 맵이 정답 라벨을 포함, (d) 렌더된 지문의 정답 마커가 삽입문을 감싸지 않음.
  validateIrrelevantAnswerDesync(question, sentences, irrelevantIndex, add);

  // T10 번호 마킹 형식 무결성 게이트 — 렌더된 ①~⑤ 마킹의 연속성·형식 정합(개수·번호
  // 연속·스팬↔문장 대응) 결정형 검증. 마킹 문장이 지문에 spread 되는 것(비인접)은 현
  // 계약(buildSpreadMarkedPassage)상 정상이므로 검사하지 않는다.
  for (const finding of findIrrelevantMarkingFormatIssues(question.passageWithNumbers, sentences)) {
    add("error", finding.code, finding.message);
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

  // wave2: 0.18~0.25 "경고 밴드"를 error 로 승격. 베이스라인 실측(runIndex 30,
  // KILLER)에서 창작 삽입문("became obsolete… new pigments…")이 정확히 이 밴드에
  // 떨어져 irrelevant-new-term-heavy 경고만 받고 출하됐고 llm 심사가 fatal 판정.
  // 비-정답 문장 fabrication 은 irrelevant-source-not-verbatim 이 잡지만, 삽입문
  // 자체의 어휘 드리프트를 막는 게이트는 이것뿐이므로 밴드를 차단으로 합친다.
  if (requestedDifficulty === "KILLER" && sourceOverlapRatio < 0.25) {
    add(
      "error",
      "irrelevant-too-many-new-terms",
      "The inserted sentence introduces too many new meaningful terms instead of staying close to the source flow.",
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



// 원형숫자(①~⑳) 문자 클래스 — 해설 산문 스캔용.
const CIRCLED_DIGIT_CLASS = "[\\u2460-\\u2473]";

/**
 * wave2 게이트: 해설/keyPoints/오답해설/렌더 지문이 주장하는 "무관한 문장" 위치가
 * 단일 진실원(irrelevantIndex → 정답 라벨)과 일치하는지 결정론 교차검증.
 * 산문 의미 해석은 하지 않는다 — verbatim 인용·명시 단서 인접 원형숫자만 잡아
 * 거짓양성을 배제한다(보수 원칙).
 */
export function validateIrrelevantAnswerDesync(
  question: Record<string, unknown>,
  sentences: string[],
  irrelevantIndex: number,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const expectedLabel = String(irrelevantIndex + 1);
  const claims: string[] = [];

  const proseTexts = [
    normalizeText(question.explanation),
    ...(Array.isArray(question.keyPoints)
      ? question.keyPoints.map((point: unknown) => normalizeText(point))
      : []),
  ]
    .filter(Boolean)
    .join("\n");

  // (a) "무관한 문장" 단서 + 인접 원형숫자 (단서→숫자 순서).
  const forwardCue = new RegExp(
    `(?:무관한?\\s*문장|(?:전체\\s*)?흐름과\\s*관계\\s*없는\\s*문장|흐름\\s*무관\\s*문장)\\s*(?:인|은|는|이|:)?\\s*["'“‘(\\[]?\\s*(${CIRCLED_DIGIT_CLASS})`,
    "g",
  );
  for (const match of proseTexts.matchAll(forwardCue)) {
    if (normalizeLabel(match[1]) !== expectedLabel) {
      claims.push(`explanation asserts the intruder is ${match[1]}`);
    }
  }
  // (a') 원형숫자 → 짧은 창(16자) 안의 "무관/벗어나" 단서 (숫자→단서 순서).
  const reverseCue = new RegExp(
    `(${CIRCLED_DIGIT_CLASS})\\s*번?\\s*(?:문장)?\\s*[이가은는]?\\s*[^${CIRCLED_DIGIT_CLASS.slice(1, -1)}.!?]{0,16}(?:무관|흐름[을에]?서?\\s*벗어나)`,
    "g",
  );
  for (const match of proseTexts.matchAll(reverseCue)) {
    if (normalizeLabel(match[1]) !== expectedLabel) {
      claims.push(`explanation marks ${match[1]} as off-flow`);
    }
  }

  // (b) 원형숫자 바로 뒤 창(다음 원형숫자 전까지)에 삽입문 verbatim 인용이 있는데
  //     그 숫자가 정답 라벨이 아니면, 해설이 삽입문을 다른 번호로 지목한 것이다.
  const insertedSentence = sentences[irrelevantIndex] ?? "";
  const insertedPrefix = normalizeComparableText(insertedSentence).slice(0, 40);
  if (insertedPrefix.length >= 20) {
    const circledRe = new RegExp(CIRCLED_DIGIT_CLASS, "g");
    for (const match of proseTexts.matchAll(circledRe)) {
      const label = normalizeLabel(match[0]);
      if (label === expectedLabel || match.index === undefined) continue;
      const rest = proseTexts.slice(match.index + match[0].length);
      const nextCircled = rest.search(new RegExp(CIRCLED_DIGIT_CLASS));
      const window = normalizeComparableText(
        nextCircled >= 0 ? rest.slice(0, nextCircled) : rest.slice(0, 400),
      );
      if (window.includes(insertedPrefix)) {
        claims.push(`explanation quotes the inserted sentence under ${match[0]}`);
      }
    }
  }

  // (c) 오답 해설 맵이 정답 라벨을 포함하면 라벨 체계가 어긋난 것.
  const wrongExplanations = collectWrongOptionExplanations(question.wrongOptionExplanations);
  if (wrongExplanations.has(expectedLabel)) {
    claims.push("wrongOptionExplanations covers the answer label");
  }

  // (d) 렌더된 지문: 정답 위치의 마커가 감싼 문장이 삽입문과 다르면 렌더 desync.
  const passageWithNumbers = normalizeText(question.passageWithNumbers);
  if (passageWithNumbers && insertedSentence) {
    const spans = [
      ...passageWithNumbers.matchAll(
        new RegExp(`(${CIRCLED_DIGIT_CLASS})\\s*__(.+?)__`, "g"),
      ),
    ];
    if (spans.length === sentences.length) {
      const spanComparable = normalizeComparableText(spans[irrelevantIndex]?.[2] ?? "")
        .replace(/[.!?]+$/, "");
      const insertedComparable = normalizeComparableText(insertedSentence).replace(/[.!?]+$/, "");
      if (spanComparable && insertedComparable && spanComparable !== insertedComparable) {
        claims.push("the rendered marker at the answer position does not wrap the inserted sentence");
      }
    }
  }

  if (claims.length > 0) {
    add(
      "error",
      "irrelevant-answer-desync",
      `IRRELEVANT answer references disagree with irrelevantIndex ${irrelevantIndex} (option ${expectedLabel}): ${claims.join("; ")}. correctAnswer, the inserted-sentence position, and every circled-number claim in explanation/keyPoints must agree.`,
    );
  }
}



/**
 * T10 번호 마킹 형식 무결성 게이트 — 렌더된 passageWithNumbers 의 번호 마킹이 형식적으로
 * 온전한지 결정형 검증(실측 결함 FORMAT-NONCONSECUTIVE-MARKING 계열, campaign-20260716
 * P004·P009). 잡는 세 파손:
 *  (1) 스팬 개수 ≠ sentences 개수 — 번호 문장이 통째로 누락/과다 렌더.
 *  (2) 번호 비연속 — 원형숫자가 ①..N 유일·오름차순 연속이 아님(②를 건너뛰는 등).
 *  (3) 스팬↔문장 desync — n번 스팬 텍스트가 sentences[n] 과 어긋남(마킹이 다른 문장을 감쌈).
 *
 * "①~⑤ 문장이 지문에서 서로 인접해야 한다"는 강한 해석은 채택하지 않는다 — 현 계약
 * (buildSpreadMarkedPassage)이 마킹 문장을 원문 위치에 spread 하는 것을 의도하며, DB 실측
 * 수락 IRRELEVANT 의 ~80% 가 이 spread(비인접) 형태다. 그 축을 차단하면 오탐 80%. 따라서
 * "번호 마킹의 연속성"은 스팬 사이 인접이 아니라 "번호 자체의 연속·형식 정합"으로 좁힌다
 * (첫 문장 무마커 컨텍스트 등 기존 계약과 정합). __마킹__ 렌더가 아니면(스팬 2개 미만)
 * 분석 불가로 침묵. error(strict 차단). W2-D 정정(26-07-18, 지휘관 판정): 번호 마킹
 * 형식 파손(개수/연속/스팬↔문장 desync)은 선지↔지문 렌더 파손·정답 노출급이라 F급
 * 무결성 결함 — RELAXED_BLOCKING_QUALITY_CODES 에 등재해 전 레인 차단한다.
 */
export interface IrrelevantMarkingFinding {
  code:
    | "irrelevant-marking-count-mismatch"
    | "irrelevant-nonconsecutive-marking"
    | "irrelevant-marking-sentence-desync";
  message: string;
  evidence: Record<string, unknown>;
}

const IRRELEVANT_MARKED_SPAN_RE = /([①-⑳])\s*__([\s\S]+?)__/g;

export function findIrrelevantMarkingFormatIssues(
  passageWithNumbers: unknown,
  sentences: string[],
): IrrelevantMarkingFinding[] {
  const rendered = normalizeText(passageWithNumbers);
  if (!rendered || sentences.length === 0) return [];
  const spans = [...rendered.matchAll(IRRELEVANT_MARKED_SPAN_RE)];
  if (spans.length < 2) return []; // __마킹__ 렌더가 아니면 분석 불가 → 침묵(구형/타포맷).

  const findings: IrrelevantMarkingFinding[] = [];

  // (1) 마킹 스팬 개수 == 선지 문장 개수.
  if (spans.length !== sentences.length) {
    findings.push({
      code: "irrelevant-marking-count-mismatch",
      message: `IRRELEVANT rendered ${spans.length} numbered sentence spans but has ${sentences.length} choice sentences; every numbered sentence must render exactly once.`,
      evidence: { renderedSpans: spans.length, sentences: sentences.length },
    });
  }

  // (2) 원형숫자가 ①..N 유일·오름차순 연속인지(번호 마킹 연속성).
  const numbers = spans.map((match) => (match[1].codePointAt(0) ?? 0) - 0x2460 + 1);
  const consecutive = numbers.every((n, index) => n === index + 1);
  if (!consecutive) {
    findings.push({
      code: "irrelevant-nonconsecutive-marking",
      message: `IRRELEVANT circled numbers must be ①..${getCircledNumber(spans.length - 1)} in unbroken order; rendered marking sequence is ${spans.map((match) => match[1]).join("")}.`,
      evidence: { renderedNumbers: numbers },
    });
  }

  // (3) 각 스팬 텍스트가 대응 sentences[i] 와 정합(마킹이 다른 문장을 감싸면 desync).
  const comparable = (value: string) =>
    normalizeComparableText(value).replace(/[.!?]+\s*$/, "").trim();
  const pairCount = Math.min(spans.length, sentences.length);
  for (let i = 0; i < pairCount; i += 1) {
    const spanText = comparable(spans[i][2]);
    const sentenceText = comparable(sentences[i]);
    if (!spanText || !sentenceText) continue;
    if (
      spanText !== sentenceText &&
      !spanText.includes(sentenceText) &&
      !sentenceText.includes(spanText)
    ) {
      findings.push({
        code: "irrelevant-marking-sentence-desync",
        message: `IRRELEVANT numbered span ${spans[i][1]} does not wrap choice sentence ${i + 1}; the rendered marking is out of sync with sentences[].`,
        evidence: {
          index: i,
          span: spans[i][2].slice(0, 80),
          sentence: sentences[i].slice(0, 80),
        },
      });
      break; // 첫 desync 한 건만 대표 보고.
    }
  }
  return findings;
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
