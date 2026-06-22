import { applyReplacementsRTL, findExpressionInPassage, sanitizeExpressionForMarker } from "../text-utils";
import { sanitizeGrammarExplanationMeta } from "../grammar-explanation-sanitize";
import type { PostProcessResult, QuestionPostProcessData, Replacement } from "../types";

/** 문자열이면 어법 해설 메타 누설을 결정형으로 제거, 아니면 원값 유지. */
function cleanMeta(value: unknown): unknown {
  return typeof value === "string" ? sanitizeGrammarExplanationMeta(value) : value;
}

// ============================================================================
// 네모 어법 (GRAMMAR_CHOICE_COMBO)
// 지문 안 (A)/(B)/(C) 세 곳을 "(A) [후보1 / 후보2]" 평문 네모로 치환하고,
// 5지선다 조합 선지(slotValues)를 결정형으로 검증한다.
// 슬롯 라벨은 지문 등장순으로 재부여하며(다중빈칸 선례), 재부여 시 선지의
// slotValues 재배열과 해설 본문의 라벨 언급 재매핑(grammar-error 선례)을
// 함께 수행한다.
// ============================================================================

const COMBO_SLOT_LABELS = ["(A)", "(B)", "(C)"] as const;
const COMBO_SLOT_COUNT = 3;
const COMBO_OPTION_COUNT = 5;
const COMBO_OPTION_JOINER = " - ";

type ComboSlotInput = {
  label?: string;
  correctExpression?: string;
  wrongExpression?: string;
  surroundingText?: string;
  pointCode?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function comparableText(value: string): string {
  return value.toLowerCase();
}

function normalizeSlotLetter(value: unknown): string {
  const text = cleanText(value);
  const match = /^[\(\[]?([A-Ca-c])[\)\].]?$/.exec(text);
  return match ? match[1].toUpperCase() : "";
}

/**
 * 네모 안 후보 표시 순서. 모델이 정답을 항상 앞에 놓는 패턴 누수를 막기 위해
 * 후보 문자열 기반 결정적 해시로 좌/우를 고른다 (재실행해도 동일 출력).
 */
function correctCandidateFirst(correct: string, wrong: string): boolean {
  let hash = 0;
  const combined = `${correct}|${wrong}`;
  for (let i = 0; i < combined.length; i += 1) hash = (hash + combined.charCodeAt(i)) % 997;
  return hash % 2 === 0;
}

function isWordChar(ch: string): boolean {
  // 글자/숫자만 단어문자로 본다. 하이픈·아포스트로피를 포함하면 "well-being"의
  // "well"만 매치됐을 때 "-being"까지 확장해 치환으로 삭제(데이터 손실)될 수 있다.
  // 글자만 보면 진짜 버그(매치 안쪽의 남은 글자 "...]ning")는 그대로 해결되고,
  // 하이픈/아포스트로피 경계에서는 멈춰 인접 텍스트를 삼키지 않는다.
  return /[A-Za-z0-9]/.test(ch);
}

/**
 * 네모 치환 스팬을 단어 경계까지 확장한다.
 *
 * findExpressionInPassage 가 후보보다 짧은 길이를 돌려주는 경우(정규화/퍼지/OCR
 * 매칭, 또는 모델 후보가 지문 단어 형태와 미세하게 다른 경우) 단어의 일부 글자가
 * 네모 밖에 남아 "(A) [x / y]ning" 처럼 스펠링이 괄호 밖으로 새는 버그가 난다.
 * 매치의 양끝이 단어 한가운데(앞/뒤 문자가 모두 단어문자)면 그 단어의 나머지
 * 글자까지 포함하도록 경계를 넓혀 항상 온전한 단어(들)를 네모로 치환한다.
 * 공백·구두점에서는 멈추므로 인접 단어를 삼키지 않는다.
 */
export function expandMatchToWordBoundaries(
  passage: string,
  index: number,
  length: number,
): { index: number; length: number } {
  let start = index;
  let end = index + length;
  while (start > 0 && isWordChar(passage[start - 1]) && isWordChar(passage[start])) {
    start -= 1;
  }
  while (end < passage.length && isWordChar(passage[end - 1]) && isWordChar(passage[end])) {
    end += 1;
  }
  return { index: start, length: end - start };
}

export function processGrammarChoiceCombo(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const rawSlots = Array.isArray(ai.slots)
    ? (ai.slots as ComboSlotInput[]).filter((slot) => slot && typeof slot === "object")
    : [];
  if (rawSlots.length !== COMBO_SLOT_COUNT) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `GRAMMAR_CHOICE_COMBO must contain exactly ${COMBO_SLOT_COUNT} slots, got ${rawSlots.length}`,
    };
  }

  // 각 슬롯의 원문(올바른) 표현을 지문에서 위치 탐색. 세 슬롯이 전부 정답 키를
  // 구성하므로 하나라도 실패하면 전체 실패(VOCAB_CHOICE식 하드 실패).
  const located: Array<{
    index: number;
    length: number;
    correct: string;
    wrong: string;
    pointCode?: string;
    modelLetter: string;
    originalIndex: number;
  }> = [];
  for (const [slotIndex, slot] of rawSlots.entries()) {
    const correct = cleanText(slot.correctExpression);
    const wrong = cleanText(slot.wrongExpression);
    if (!correct || !wrong) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO slot ${slotIndex + 1} is missing correctExpression/wrongExpression`,
      };
    }
    if (comparableText(correct) === comparableText(wrong)) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO slot ${slotIndex + 1} was not mutated: "${correct}"`,
      };
    }
    // '/'나 대괄호가 후보에 들어가면 "(A) [x / y]" 네모 표기가 모호해진다.
    if (/[/\[\]]/.test(correct) || /[/\[\]]/.test(wrong)) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO slot ${slotIndex + 1} candidates must not contain '/', '[' or ']'`,
      };
    }

    const surrounding = cleanText(slot.surroundingText);
    let found = findExpressionInPassage(passage, correct, surrounding);
    if (!found) {
      // 추출/원본 재현 흐름에서는 지문에 오답 후보가 인쇄되어 있을 수 있다 —
      // grammar-error의 errorExpression 폴백과 동일한 관용 + 경고.
      found = findExpressionInPassage(passage, wrong, surrounding);
      if (found) {
        warnings.push(
          `Slot ${slotIndex + 1} correctExpression not found; matched wrongExpression in passage instead (source-replay flow?)`,
        );
      }
    }
    if (!found) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO slot expression not found in passage: "${correct.slice(0, 80)}"`,
      };
    }
    // 단어 경계까지 확장 — 스펠링이 네모 밖으로 새는 버그 방지.
    const expanded = expandMatchToWordBoundaries(passage, found.index, found.length);
    located.push({
      index: expanded.index,
      length: expanded.length,
      correct,
      wrong,
      pointCode: typeof slot.pointCode === "string" ? slot.pointCode : undefined,
      modelLetter: normalizeSlotLetter(slot.label) || String.fromCharCode(65 + slotIndex),
      originalIndex: slotIndex,
    });
  }

  const overlapping = located.some((a, i) =>
    located.some(
      (b, j) => i !== j && a.index < b.index + b.length && b.index < a.index + a.length,
    ),
  );
  if (overlapping) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "GRAMMAR_CHOICE_COMBO slots overlap in the passage; choose separated expressions.",
    };
  }

  // 라벨은 지문 등장순으로 재부여.
  const passageOrder = located
    .slice()
    .sort((a, b) => a.index - b.index);
  if (passageOrder.some((entry, index) => entry.originalIndex !== index)) {
    warnings.push("Reordered combo slot labels to follow passage order.");
  }

  const normalizedSlots = passageOrder.map((entry, index) => ({
    label: COMBO_SLOT_LABELS[index],
    correctExpression: entry.correct,
    wrongExpression: entry.wrong,
    pointCode: entry.pointCode,
  }));

  // 재부여로 라벨이 바뀐 슬롯의 해설 본문 언급을 재매핑 (@@GLBL 센티널 2단계 —
  // 순차 치환은 (A)↔(B) 맞교환에서 연쇄 오염됨).
  const modelKeyToFinalLabel = new Map<string, string>();
  passageOrder.forEach((entry, index) => {
    const finalLabel = COMBO_SLOT_LABELS[index];
    if (entry.modelLetter && `(${entry.modelLetter})` !== finalLabel) {
      modelKeyToFinalLabel.set(entry.modelLetter, finalLabel);
    }
  });
  const remapLabelMentions = (value: unknown): unknown => {
    if (modelKeyToFinalLabel.size === 0 || typeof value !== "string") return value;
    let result = value;
    for (const [key, finalLabel] of modelKeyToFinalLabel) {
      result = result.split(`(${key})`).join(`@@GLBL_${finalLabel.slice(1, -1)}@@`);
    }
    return result.replace(/@@GLBL_([A-C])@@/g, "($1)");
  };

  // 네모 치환: "(A) [좌 / 우]" 평문 — 렌더러 특수 마커 불필요.
  const replacements: Replacement[] = passageOrder.map((entry, index) => {
    const correct = sanitizeExpressionForMarker(entry.correct);
    const wrong = sanitizeExpressionForMarker(entry.wrong);
    const [left, right] = correctCandidateFirst(entry.correct, entry.wrong)
      ? [correct, wrong]
      : [wrong, correct];
    return {
      position: entry.index,
      originalLength: entry.length,
      newText: `${COMBO_SLOT_LABELS[index]} [${left} / ${right}]`,
    };
  });
  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  // 조합 선지 검증 — slotValues를 지문 등장순으로 재배열하고, 각 값이 해당
  // 슬롯의 두 후보 중 하나인지 결정형으로 확인. 표기 미세 차이는 후보의
  // 정본 문자열로 정규화한다.
  const rawOptions = Array.isArray(ai.options) ? ai.options : [];
  if (rawOptions.length !== COMBO_OPTION_COUNT) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `GRAMMAR_CHOICE_COMBO must have exactly ${COMBO_OPTION_COUNT} options, got ${rawOptions.length}`,
    };
  }
  const normalizedOptions: Array<{ label: string; text: string; slotValues: string[] }> = [];
  for (const [optionIndex, option] of rawOptions.entries()) {
    if (!option || typeof option !== "object") {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO option ${optionIndex + 1} is not an object`,
      };
    }
    const record = option as Record<string, unknown>;
    const values = Array.isArray(record.slotValues) ? record.slotValues.map(cleanText) : [];
    if (values.length !== COMBO_SLOT_COUNT || values.some((value) => !value)) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `GRAMMAR_CHOICE_COMBO option ${optionIndex + 1} must provide ${COMBO_SLOT_COUNT} non-empty slotValues`,
      };
    }
    const reordered = passageOrder.map((entry) => values[entry.originalIndex]);
    const canonical: string[] = [];
    for (const [slotIndex, value] of reordered.entries()) {
      const slot = normalizedSlots[slotIndex];
      if (comparableText(value) === comparableText(slot.correctExpression)) {
        canonical.push(slot.correctExpression);
      } else if (comparableText(value) === comparableText(slot.wrongExpression)) {
        canonical.push(slot.wrongExpression);
      } else {
        return {
          success: false,
          data: ai,
          warnings,
          error: `GRAMMAR_CHOICE_COMBO option ${optionIndex + 1} value "${value}" matches neither candidate of slot ${slot.label}`,
        };
      }
    }
    normalizedOptions.push({
      label: cleanText(record.label) || String(optionIndex + 1),
      text: canonical.join(COMBO_OPTION_JOINER),
      slotValues: canonical,
    });
  }

  const comboKeys = normalizedOptions.map((option) =>
    option.slotValues.map(comparableText).join("|"),
  );
  if (new Set(comboKeys).size !== comboKeys.length) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "GRAMMAR_CHOICE_COMBO options repeat the same slotValues combination",
    };
  }

  // 정답 = 세 슬롯 모두 올바른 표현인 유일한 조합.
  const allCorrectKey = normalizedSlots
    .map((slot) => comparableText(slot.correctExpression))
    .join("|");
  const allCorrectOptions = normalizedOptions.filter(
    (_, index) => comboKeys[index] === allCorrectKey,
  );
  if (allCorrectOptions.length !== 1) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `GRAMMAR_CHOICE_COMBO must have exactly 1 all-correct option, got ${allCorrectOptions.length}`,
    };
  }
  const correctLabel = cleanText(ai.correctAnswer);
  if (allCorrectOptions[0].label !== correctLabel) {
    warnings.push(
      `correctAnswer "${correctLabel}" did not point at the all-correct combination; auto-fixed to "${allCorrectOptions[0].label}".`,
    );
  }

  // 오답 해설의 키/label 은 선지 라벨("1"~"5")이라 그대로 두고, 본문 속
  // 슬롯 라벨 언급만 재매핑한다. AI 원출력(배열 [{label, explanation}])과
  // Record 형태(정규화 이후 재처리 경로) 둘 다 지원.
  const wrongOptionExplanations = ai.wrongOptionExplanations;
  let remappedWrongOptionExplanations = wrongOptionExplanations;
  if (Array.isArray(wrongOptionExplanations)) {
    remappedWrongOptionExplanations = wrongOptionExplanations.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? {
            ...(item as Record<string, unknown>),
            explanation: cleanMeta(remapLabelMentions((item as Record<string, unknown>).explanation)),
          }
        : item,
    );
  } else if (wrongOptionExplanations && typeof wrongOptionExplanations === "object") {
    remappedWrongOptionExplanations = Object.fromEntries(
      Object.entries(wrongOptionExplanations as Record<string, unknown>).map(
        ([key, text]) => [key, cleanMeta(remapLabelMentions(text))],
      ),
    );
  }

  return {
    success: true,
    data: {
      ...ai,
      slots: normalizedSlots,
      options: normalizedOptions,
      correctAnswer: allCorrectOptions[0].label,
      passageWithMarkers,
      // 어법 해설 메타 누설을 결정형으로 청소(추가 LLM 호출 없음).
      explanation: cleanMeta(remapLabelMentions(ai.explanation)),
      answerLogic: cleanMeta(remapLabelMentions(ai.answerLogic)),
      keyPoints: Array.isArray(ai.keyPoints)
        ? ai.keyPoints.map((point) => cleanMeta(remapLabelMentions(point)))
        : ai.keyPoints,
      wrongOptionExplanations: remappedWrongOptionExplanations,
    },
    warnings,
  };
}
