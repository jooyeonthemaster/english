// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { ANTONYM_MARKER_COUNT_DEFAULT, ANTONYM_MARKER_COUNT_MAX, ANTONYM_MARKER_COUNT_MIN, QuestionQualitySeverity, antonymPairKey, containsLoose, containsStandaloneToken, countUnderlineMarkers, findDuplicate, findMarkers, hasInflectionalS, isRecord, isSingleEnglishToken, normalizeComparableText, normalizeLabel, normalizeText } from "../core";


export const ANTONYM_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;



export function normalizeAntonymKey(value: unknown, fallbackIndex?: number): string {
  const text = normalizeText(value);
  const fallback =
    typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < ANTONYM_KEYS.length
      ? ANTONYM_KEYS[fallbackIndex]
      : "";

  if (!text) return fallback;

  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0 && circledIndex < ANTONYM_KEYS.length) {
    return ANTONYM_KEYS[circledIndex];
  }

  const alphaMatch = text.match(/^[\(\[]?\s*([A-Ja-j])\s*[\)\].:]?$/);
  if (alphaMatch) return alphaMatch[1].toUpperCase();

  const numberMatch = text.match(/^[\(\[]?\s*(10|[1-9])\s*[\)\].:]?$/);
  if (numberMatch) return ANTONYM_KEYS[Number(numberMatch[1]) - 1];

  return fallback;
}



export function collectAntonymAnswerIndices(question: Record<string, unknown>): number[] {
  const indices: number[] = [];
  const push = (value: unknown) => {
    const key = normalizeAntonymKey(value);
    const index = ANTONYM_KEYS.indexOf(key as (typeof ANTONYM_KEYS)[number]);
    if (index >= 0 && !indices.includes(index)) indices.push(index);
  };

  if (Array.isArray(question.correctAnswers)) {
    question.correctAnswers.forEach(push);
  }

  const correctAnswerText = normalizeText(question.correctAnswer);
  if (correctAnswerText) {
    const matches = correctAnswerText.match(/[\(\[]?\s*(?:[A-Ja-j]|10|[1-9]|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
    if (matches?.length) matches.forEach(push);
    else push(correctAnswerText);
  }

  return indices;
}



// SENTENCE_INSERT: 응집 단서(지시어/대명사/연결사) 존재 여부를 표면 검사한다.
// 정관사 'the' 단독은 너무 흔해 신호로 쓰지 않는다(중립 문장 오탐 방지).
export function validateAntonymQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedPairCount: number | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markedWords = Array.isArray(question.markedWords)
    ? question.markedWords.filter(isRecord)
    : [];
  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  const expectedPairCount =
    requestedPairCount ??
    (markedWords.length >= ANTONYM_MARKER_COUNT_MIN &&
    markedWords.length <= ANTONYM_MARKER_COUNT_MAX
      ? markedWords.length
      : ANTONYM_MARKER_COUNT_DEFAULT);

  if (markedWords.length !== expectedPairCount) {
    add(
      "error",
      "antonym-marker-count",
      `ANTONYM must have exactly ${expectedPairCount} marked words, got ${markedWords.length}.`,
    );
  }

  if (!passageWithMarkers) {
    add("error", "antonym-missing-passage-markers", "ANTONYM is missing passageWithMarkers.");
    return;
  }

  const renderedMarkers = findMarkers(passageWithMarkers)
    .map((marker) => {
      const match = marker.inner.match(/^\(([A-Ja-j])\)\s*(.+)$/);
      if (!match) return null;
      return {
        key: match[1].toUpperCase(),
        word: normalizeText(match[2]),
      };
    })
    .filter((marker): marker is { key: string; word: string } => !!marker);
  const renderedByKey = new Map(renderedMarkers.map((marker) => [marker.key, marker.word]));

  if (countUnderlineMarkers(passageWithMarkers) !== expectedPairCount) {
    add(
      "error",
      "antonym-render-marker-count",
      `ANTONYM passageWithMarkers must render exactly ${expectedPairCount} underlined markers.`,
    );
  }

  if (renderedMarkers.length !== expectedPairCount) {
    add(
      "error",
      "antonym-render-label-format",
      `ANTONYM rendered markers must use __(A) word__ through __(${ANTONYM_KEYS[expectedPairCount - 1]}) word__ format.`,
    );
  }

  const labels = markedWords.map((word, index) => normalizeAntonymKey(word.label, index));
  const duplicateLabel = findDuplicate(labels.filter(Boolean));
  if (duplicateLabel) {
    add("error", "antonym-duplicate-label", `Duplicate ANTONYM marked label: (${duplicateLabel}).`);
  }

  const incorrectPairs = markedWords.filter((word) => word.isIncorrectPair === true);
  if (incorrectPairs.length !== 1) {
    add(
      "error",
      "antonym-incorrect-pair-count",
      `ANTONYM must have exactly one isIncorrectPair=true item, got ${incorrectPairs.length}.`,
    );
  }

  const answerIndices = collectAntonymAnswerIndices(question);
  if (answerIndices.length !== 1) {
    add(
      "error",
      "antonym-answer-count",
      `ANTONYM correctAnswer must point to exactly one option/label, got ${answerIndices.length}.`,
    );
  }

  const incorrectIndex = incorrectPairs[0]
    ? markedWords.indexOf(incorrectPairs[0])
    : -1;
  if (incorrectIndex >= 0 && answerIndices.length === 1 && answerIndices[0] !== incorrectIndex) {
    add(
      "error",
      "antonym-answer-label-mismatch",
      `ANTONYM correctAnswer must match the only incorrectly paired option (${incorrectIndex + 1}).`,
    );
  }

  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const optionByIndex = new Map<number, Record<string, unknown>>();
  options.forEach((option, index) => {
    const normalized = normalizeLabel(option.label);
    const numericIndex = /^(10|[1-9])$/.test(normalized)
      ? Number(normalized) - 1
      : index;
    optionByIndex.set(numericIndex, option);
  });

  for (const [index, markedWord] of markedWords.entries()) {
    const key = normalizeAntonymKey(markedWord.label, index);
    const renderedWord = renderedByKey.get(key);
    const word = normalizeText(markedWord.word);
    const pairedWord = normalizeText(markedWord.antonym);
    const correctAntonym = normalizeText(markedWord.correctAntonym);
    const isIncorrectPair = markedWord.isIncorrectPair === true;

    if (!key) {
      add("error", "antonym-label-format", "ANTONYM markedWords labels must be (A) through (E).");
      continue;
    }

    if (!word || !pairedWord) {
      add("error", "antonym-empty-pair", `ANTONYM label (${key}) is missing word or paired word.`);
      continue;
    }

    if (!renderedWord) {
      add("error", "antonym-render-missing-label", `ANTONYM passageWithMarkers is missing label (${key}).`);
    } else if (normalizeComparableText(renderedWord) !== normalizeComparableText(word)) {
      add(
        "error",
        "antonym-render-word-mismatch",
        `ANTONYM label (${key}) renders "${renderedWord}" but markedWords says "${word}".`,
      );
    }

    const option = optionByIndex.get(index);
    const optionText = normalizeText(option?.text);
    if (optionText) {
      if (!containsLoose(optionText, word) || !containsLoose(optionText, pairedWord)) {
        add(
          "error",
          "antonym-option-pair-mismatch",
          `ANTONYM option ${index + 1} must display the same word-pair as markedWords (${word} - ${pairedWord}).`,
        );
      }
    }

    if (passage && isSingleEnglishToken(word) && !containsStandaloneToken(passage, word)) {
      add("error", "antonym-word-not-source-backed", `ANTONYM word (${key}) must exist as a standalone source token.`);
    }

    if (normalizeComparableText(word) === normalizeComparableText(pairedWord)) {
      add("error", "antonym-same-word", `ANTONYM pair (${key}) repeats the same word.`);
    }

    const formIssue = findAntonymSurfaceFormIssue(word, pairedWord);
    if (formIssue) {
      add("error", "antonym-surface-form-mismatch", `ANTONYM pair (${key}) has mismatched surface forms: ${formIssue}.`);
    }

    const contestablePair = findContestableAntonymPair(word, pairedWord);
    if (contestablePair) {
      add(
        "error",
        "antonym-contestable-pair",
        `ANTONYM pair (${key}) is contestable or on the wrong semantic axis: ${contestablePair}.`,
      );
    }

    if (isIncorrectPair) {
      if (!correctAntonym) {
        add("error", "antonym-missing-correct-antonym", `Incorrect ANTONYM pair (${key}) must include correctAntonym.`);
      } else {
        if (normalizeComparableText(correctAntonym) === normalizeComparableText(pairedWord)) {
          add(
            "error",
            "antonym-incorrect-pair-not-mutated",
            `Incorrect ANTONYM pair (${key}) has the same antonym and correctAntonym.`,
          );
        }
        const correctFormIssue = findAntonymSurfaceFormIssue(word, correctAntonym);
        if (correctFormIssue) {
          add(
            "error",
            "antonym-correct-antonym-form-mismatch",
            `correctAntonym for (${key}) should match the source word form: ${correctFormIssue}.`,
          );
        }
        const badCorrectPair = findContestableAntonymPair(word, correctAntonym);
        if (badCorrectPair) {
          add(
            "error",
            "antonym-correct-antonym-contestable",
            `correctAntonym for (${key}) is still contestable: ${badCorrectPair}.`,
          );
        }
      }
    } else if (correctAntonym) {
      add("error", "antonym-nonanswer-has-correct-antonym", `Non-answer ANTONYM pair (${key}) must not include correctAntonym.`);
    }
  }
}



export function findAntonymSurfaceFormIssue(word: string, pairedWord: string): string | null {
  const source = normalizeText(word);
  const pair = normalizeText(pairedWord);
  if (!isSingleEnglishToken(source) || !isSingleEnglishToken(pair)) return null;
  const sourceLower = source.toLowerCase();
  const pairLower = pair.toLowerCase();

  const sourceS = hasInflectionalS(sourceLower);
  const pairS = hasInflectionalS(pairLower);
  if (sourceS !== pairS) {
    return `"${source}" and "${pairedWord}" do not share third-person/plural -s form`;
  }

  for (const suffix of ["ing", "ly"] as const) {
    const sourceHas = sourceLower.endsWith(suffix);
    const pairHas = pairLower.endsWith(suffix);
    if (sourceHas !== pairHas) {
      return `"${source}" and "${pairedWord}" do not share -${suffix} form`;
    }
  }

  const sourceRegularPast = sourceLower.endsWith("ed");
  const pairRegularPast = pairLower.endsWith("ed");
  const sourcePast = sourceRegularPast || IRREGULAR_PAST_FORMS.has(sourceLower);
  const pairPast = pairRegularPast || IRREGULAR_PAST_FORMS.has(pairLower);
  if ((sourceRegularPast && !pairPast) || (pairRegularPast && !sourcePast)) {
    // 26-07-06 정밀화: -ed 형이 "확립된 분사형용사"(varied 등)로 쓰인 경우,
    // 일반 형용사(uniform 등)와의 짝은 실전 정합이므로 오탐이다(실측: varied↔uniform
    // 이 strict 2회 거부 → relaxed 강등의 직접 원인). 동사 시제 불일치(exceeded↔lag
    // 류)는 화이트리스트 밖이므로 기존대로 차단 — 게이트 자체는 유지.
    const edSide = sourceRegularPast && !pairPast ? sourceLower : pairLower;
    if (!ADJECTIVAL_PARTICIPLES.has(edSide)) {
      return `"${source}" and "${pairedWord}" do not share past/participle form`;
    }
  }

  const sourceComparative = isLikelyComparativeForm(sourceLower);
  const pairComparative = isLikelyComparativeForm(pairLower);
  if (sourceComparative !== pairComparative) {
    return `"${source}" and "${pairedWord}" do not share comparative form`;
  }

  const sourceSuperlative = isLikelySuperlativeForm(sourceLower);
  const pairSuperlative = isLikelySuperlativeForm(pairLower);
  if (sourceSuperlative !== pairSuperlative) {
    return `"${source}" and "${pairedWord}" do not share superlative form`;
  }

  return null;
}



export function isLikelyComparativeForm(word: string): boolean {
  return /^(?:easier|harder|larger|smaller|bigger|longer|shorter|higher|lower|greater|lesser|better|worse|faster|slower|stronger|weaker|brighter|darker|earlier|later|older|newer)$/.test(word);
}



export function isLikelySuperlativeForm(word: string): boolean {
  return /^(?:easiest|hardest|largest|smallest|biggest|longest|shortest|highest|lowest|greatest|least|most|best|worst|fastest|slowest|strongest|weakest|brightest|darkest|earliest|latest|oldest|newest)$/.test(word);
}



// -ed 로 끝나지만 형용사로 확립되어 일반 형용사와 짝지어도 표면형 위반이 아닌
// 분사형용사 화이트리스트. 여기 없는 -ed 형(exceeded, arrived 등)은 동사 굴절로
// 간주되어 기존 past/participle 검사를 그대로 받는다.
export const ADJECTIVAL_PARTICIPLES = new Set([
  "advanced",
  "balanced",
  "biased",
  "bored",
  "celebrated",
  "complicated",
  "concentrated",
  "confused",
  "crowded",
  "dedicated",
  "delighted",
  "depressed",
  "detached",
  "detailed",
  "determined",
  "disciplined",
  "distinguished",
  "diversified",
  "educated",
  "engaged",
  "established",
  "exaggerated",
  "excited",
  "experienced",
  "informed",
  "integrated",
  "interested",
  "involved",
  "isolated",
  "limited",
  "motivated",
  "organized",
  "pleased",
  "prolonged",
  "qualified",
  "refined",
  "relaxed",
  "repeated",
  "reserved",
  "restricted",
  "satisfied",
  "skilled",
  "sophisticated",
  "specialized",
  "standardized",
  "structured",
  "talented",
  "tired",
  "unbiased",
  "unexpected",
  "uninterested",
  "unlimited",
  "unqualified",
  "varied",
]);



export const IRREGULAR_PAST_FORMS = new Set([
  "bought",
  "brought",
  "built",
  "caught",
  "chose",
  "chosen",
  "felt",
  "found",
  "gave",
  "given",
  "held",
  "kept",
  "known",
  "led",
  "left",
  "lost",
  "made",
  "paid",
  "put",
  "read",
  "ran",
  "said",
  "saw",
  "seen",
  "sent",
  "set",
  "spent",
  "stood",
  "taken",
  "taught",
  "thought",
  "told",
  "went",
  "won",
  "wrote",
  "written",
]);



export function findContestableAntonymPair(word: string, pairedWord: string): string | null {
  const rawKey = [normalizeComparableText(word), normalizeComparableText(pairedWord)].sort().join("|");
  const rawBlocked: Record<string, string> = {
    "paid|refunded": "paid and refunded are transaction-related reversals, not a clean lexical antonym pair. Prefer paid-received or spent-saved depending on context.",
    "uninterested|unproductive": "unproductive is an output/effectiveness scale; uninterested is an attitude/interest scale.",
  };
  if (rawBlocked[rawKey]) return rawBlocked[rawKey];

  const a = antonymPairKey(word);
  const b = antonymPairKey(pairedWord);
  if (!a || !b) return null;
  const key = [a, b].sort().join("|");
  const blocked: Record<string, string> = {
    "force|restrain": "force in this passage means compel; restrain can mean hold back/block, so the relation is contestable rather than a clean antonym. Prefer allow/permit/release in matching form.",
    "ignorance|mastery": "mastery is an ability/competence scale; ignorance is a knowledge-state scale. Prefer incompetence, inability, or lack of mastery.",
    "emotional|rational": "emotional contrasts with unemotional/dispassionate; rational contrasts more cleanly with irrational.",
    "clear|dim": "dim as future outlook contrasts more cleanly with bright/promising, not clear.",
    "excuse|justify": "excuse is a near-related act of explanation/defense, not a clean opposite of justify.",
    "passive|unproductive": "passive is an activity/agency scale; unproductive is an output/effectiveness scale. Prefer productive/fruitful.",
  };
  return blocked[key] ?? null;
}
