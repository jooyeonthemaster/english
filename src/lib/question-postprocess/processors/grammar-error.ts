import {
  applyReplacementsRTL,
  findExpressionInPassage,
  findOcrNoisyExpressionInPassage,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import { sanitizeGrammarExplanationMeta } from "../grammar-explanation-sanitize";
import type { PostProcessResult, QuestionPostProcessData, Replacement } from "../types";

/** 문자열이면 어법 해설 메타 누설을 결정형으로 제거, 아니면 원값 유지. */
function cleanMeta(value: unknown): unknown {
  return typeof value === "string" ? sanitizeGrammarExplanationMeta(value) : value;
}

type GrammarMarkedExpression = {
  label: string;
  expression: string;
  isError: boolean;
  correction?: string;
  errorExpression?: string;
  surroundingText?: string;
  pointCode?: string;
};

type GrammarOption = {
  label: string;
  text: string;
};

const GRAMMAR_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)", "(F)", "(G)", "(H)", "(I)", "(J)"] as const;
const GRAMMAR_CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

export function processGrammarError(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const markedExpressions = ai.markedExpressions as GrammarMarkedExpression[];

  if (!markedExpressions || !Array.isArray(markedExpressions)) {
    return { success: false, data: ai, warnings, error: "Missing markedExpressions field" };
  }

  const canonicalMarkedExpressions = markedExpressions.map((me, index) => {
    const expression = normalizeString(me.expression);
    const errorExpression = normalizeString(me.errorExpression);
    let correction =
      normalizeString(me.correction) ||
      (me.isError && errorExpression && expression && errorExpression !== expression
        ? expression
        : "");
    if (
      me.isError &&
      expression &&
      correction &&
      correction !== expression &&
      !findGrammarExpression(passage, correction, me.surroundingText, false) &&
      findGrammarExpression(passage, expression, me.surroundingText, false)
    ) {
      warnings.push(
        `Correction normalized to source expression for ${canonicalGrammarLabel(me.label, index)}: "${correction}" -> "${expression}"`,
      );
      correction = expression;
    }

    return {
      ...me,
      label: canonicalGrammarLabel(me.label, index),
      expression,
      errorExpression: errorExpression || undefined,
      correction: correction || undefined,
      pointCode: canonicalGrammarPointCode(
        me.pointCode,
        getMarkedSurfaceExpression({
          ...me,
          expression,
          errorExpression: errorExpression || undefined,
          correction: correction || undefined,
        }),
      ),
    };
  });

  // ── 위치 탐색 (라벨 재부여 전에 수행 — 라벨은 지문 출현 순서를 따라야 한다) ──
  const located = canonicalMarkedExpressions.map((me) => ({
    me,
    found: locateGrammarExpression(passage, me, warnings),
  }));

  // 전부 위치를 찾았으면 수능 형식대로 (A)~ 라벨을 지문 출현 순서로 재부여한다.
  // (모델이 라벨을 출현 순서와 다르게 매긴 케이스 — 검수에서 (A)(B)(D)(C)(E) 위반 실측.)
  const modelKeyToFinalLabel = new Map<string, string>();
  if (located.every((item) => item.found)) {
    const byPosition = [...located].sort(
      (x, y) => (x.found?.index ?? 0) - (y.found?.index ?? 0),
    );
    byPosition.forEach((item, index) => {
      const finalLabel = GRAMMAR_LABELS[index] ?? item.me.label;
      const modelKey = normalizeGrammarKey(item.me.label);
      if (modelKey && finalLabel !== item.me.label) {
        warnings.push(
          `Label reordered to passage order: ${item.me.label} -> ${finalLabel}`,
        );
      }
      if (modelKey) modelKeyToFinalLabel.set(modelKey, finalLabel);
      item.me.label = finalLabel;
    });
    // 출현 순서로 markedExpressions 배열 자체도 재정렬 (옵션/라벨 순회와 일치).
    canonicalMarkedExpressions.length = 0;
    canonicalMarkedExpressions.push(...byPosition.map((item) => item.me));
    located.length = 0;
    located.push(...byPosition);
  }

  const labelByKey = buildLabelMap(canonicalMarkedExpressions, modelKeyToFinalLabel);
  const remapModelLabel = (value: unknown): string => {
    const key = normalizeGrammarKey(value);
    if (!key) return "";
    return labelByKey.get(key) ?? `(${key})`;
  };
  const rawCorrectLabel = remapModelLabel(ai.correctAnswer);
  const errorLabels = canonicalMarkedExpressions
    .filter((me) => me.isError === true)
    .map((me) => me.label);
  const correctAnswer =
    errorLabels.length > 0
      ? errorLabels.join(", ")
      : rawCorrectLabel || normalizeString(ai.correctAnswer);
  const correctAnswers = errorLabels.length > 0
    ? errorLabels
    : collectGrammarLabels(ai.correctAnswers)
        .map((label) => remapModelLabel(label) || label)
        .filter(Boolean);
  const direction = normalizeGrammarDirection(ai.direction, correctAnswers.length);

  if (errorLabels.length === 1 && rawCorrectLabel && rawCorrectLabel !== errorLabels[0]) {
    warnings.push(
      `correctAnswer normalized from ${normalizeString(ai.correctAnswer)} to the marked error label ${errorLabels[0]}`,
    );
  } else if (errorLabels.length > 1) {
    const rawCorrectLabels = collectGrammarLabels(ai.correctAnswers ?? ai.correctAnswer);
    const normalized = rawCorrectLabels.join(", ");
    if (normalized && normalized !== correctAnswer) {
      warnings.push(
        `correctAnswer normalized from ${normalized} to marked error labels ${correctAnswer}`,
      );
    }
  }

  const options = canonicalizeOptions(ai.options, canonicalMarkedExpressions);
  const wrongOptionExplanations = canonicalizeWrongOptionExplanations(
    ai.wrongOptionExplanations,
    labelByKey,
  );

  // 라벨 재부여 시 해설 본문의 "(D)" 같은 라벨 언급도 함께 재매핑 — 답지 라벨은
  // 재부여됐는데 해설 프로즈만 옛 라벨로 남아 답지-해설이 모순되는 실측 critical.
  const remapLabelMentions = (value: unknown): unknown => {
    if (modelKeyToFinalLabel.size === 0 || typeof value !== "string") return value;
    let result = value;
    for (const [key, finalLabel] of modelKeyToFinalLabel) {
      result = result.split(`(${key})`).join(`@@GLBL_${finalLabel.slice(1, -1)}@@`);
    }
    return result.replace(/@@GLBL_([A-J])@@/g, "($1)");
  };
  // 라벨 재매핑 후 어법 해설 메타 누설(출제/생성 과정 서술·내부 필드명)을
  // 결정형으로 제거한다 — 추가 LLM 호출 없이 후처리에서 청소. 게이트가 이 청소된
  // 텍스트를 검사하므로 대부분 재시도 없이 통과한다.
  const explanation = cleanMeta(normalizeGrammarExplanationSurfaceOrder(
    remapLabelMentions(ai.explanation),
    canonicalMarkedExpressions,
  ));
  const answerLogic = cleanMeta(remapLabelMentions(ai.answerLogic));
  const keyPoints = Array.isArray(ai.keyPoints)
    ? ai.keyPoints.map((point) => cleanMeta(remapLabelMentions(point)))
    : undefined;
  const remappedWrongOptionExplanations =
    wrongOptionExplanations && typeof wrongOptionExplanations === "object" && !Array.isArray(wrongOptionExplanations)
      ? Object.fromEntries(
          Object.entries(wrongOptionExplanations as Record<string, unknown>).map(
            ([key, text]) => [key, cleanMeta(remapLabelMentions(text))],
          ),
        )
      : wrongOptionExplanations;

  const replacements: Replacement[] = [];

  for (const { me, found } of located) {
    const sourceExpression = getSourceExpression(me);
    if (!found) {
      warnings.push(`Expression not found for label ${me.label}: "${sourceExpression}"`);
      continue;
    }

    const displayedExpression = getMarkedSurfaceExpression(me) || sourceExpression;
    const sanitized = sanitizeExpressionForMarker(displayedExpression);
    // 주의: 표시 형태가 원문과 동일한 isError 마킹(오류 미도입)은 여기서 막지
    // 않는다 — 지문에 오류가 인쇄된 추출/원본 재현 흐름에서는 정당한 동작이다.
    // 클린 지문 생성 흐름은 품질 게이트(grammar-error-not-mutated, 마커 제거본
    // == 원문 검사)가 거른다.
    const newText = `__${me.label} ${sanitized}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedExpressions.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked expressions in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  return {
    success: true,
    data: {
      ...ai,
      direction,
      correctAnswer,
      correctAnswers,
      markedExpressions: canonicalMarkedExpressions,
      options,
      wrongOptionExplanations: remappedWrongOptionExplanations,
      ...(typeof explanation === "string" ? { explanation } : {}),
      ...(typeof answerLogic === "string" ? { answerLogic } : {}),
      ...(keyPoints ? { keyPoints } : {}),
      passageWithMarkers,
    },
    warnings,
  };
}

function findGrammarExpression(
  passage: string,
  expression: string,
  surroundingText: string | undefined,
  strictContext: boolean,
) {
  if (isSingleTokenExpression(expression)) {
    return findWordInPassage(passage, expression, surroundingText, strictContext);
  }
  return findExpressionInPassage(passage, expression, surroundingText, strictContext);
}

/**
 * 마커 위치 탐색 — 윈도우(surroundingText) 우선.
 * 기존에는 expression 이 윈도우에 없으면 바로 전역 1번째 출현으로 폴백해서,
 * 모델이 의도한 자리(예: 중반부 "each assumes")가 아닌 첫 문장의 동형 단어에
 * 마커가 찍히는 오배치가 발생했다 (실생성 검수 critical — 해설과 밑줄이 다른
 * 문장을 가리킴). 윈도우 안에서 변형 체인(expression → correction →
 * errorExpression)을 모두 시도한 뒤에만 전역 폴백한다.
 */
function locateGrammarExpression(
  passage: string,
  me: GrammarMarkedExpression,
  warnings: string[],
) {
  const sourceExpression = getSourceExpression(me);
  const hasWindow = !!normalizeString(me.surroundingText);

  if (hasWindow) {
    let inWindow =
      findGrammarExpression(passage, sourceExpression, me.surroundingText, true) ??
      (me.isError && me.correction && me.correction !== sourceExpression
        ? findGrammarExpression(passage, me.correction, me.surroundingText, true)
        : null);
    if (!inWindow && me.isError && me.errorExpression) {
      inWindow = findGrammarExpression(passage, me.errorExpression, me.surroundingText, true);
      if (inWindow) {
        warnings.push(
          `Existing error expression matched for label ${me.label}: "${me.errorExpression}"`,
        );
      }
    }
    if (inWindow) return inWindow;
  }

  let found = findGrammarExpression(passage, sourceExpression, me.surroundingText, false);

  if (!found && me.isError && me.correction && me.correction !== sourceExpression) {
    found = findGrammarExpression(passage, me.correction, me.surroundingText, false);
  }

  if (!found && me.isError && me.errorExpression) {
    found = findGrammarExpression(passage, me.errorExpression, me.surroundingText, false);
    if (found) {
      warnings.push(
        `Existing error expression matched for label ${me.label}: "${me.errorExpression}"`,
      );
    }
  }

  if (!found) {
    const sourceVariant = findCorrectedGrammarSourceVariant(
      passage,
      sourceExpression,
      me.surroundingText,
    );
    if (sourceVariant) {
      found = sourceVariant.position;
      warnings.push(
        `Corrected source variant matched for label ${me.label}: "${sourceVariant.sourceText}" -> "${sourceExpression}"`,
      );
    }
  }

  if (!found) {
    found = findOcrNoisyExpressionInPassage(
      passage,
      sourceExpression,
      me.surroundingText,
    );
    if (found) {
      warnings.push(
        `OCR-noisy source token matched for label ${me.label}: "${sourceExpression}"`,
      );
    }
  }

  return found;
}

function findCorrectedGrammarSourceVariant(
  passage: string,
  expression: string,
  surroundingText?: string,
): { sourceText: string; position: { index: number; length: number } } | null {
  for (const sourceText of buildCorrectedGrammarSourceVariants(expression)) {
    const position = findExpressionInPassage(passage, sourceText, surroundingText);
    if (position) return { sourceText, position };
  }
  return null;
}

function buildCorrectedGrammarSourceVariants(expression: string): string[] {
  const text = normalizeString(expression);
  const variants = new Set<string>();
  const embeddedQuestion = text.match(
    /^(who|what|where|when|why|how)\s+(.+?)\s+(am|is|are|was|were|do|does|did|can|could|should|would|will|may|might|must|have|has|had)$/i,
  );
  if (embeddedQuestion) {
    variants.add(
      `${embeddedQuestion[1]} ${embeddedQuestion[3]} ${embeddedQuestion[2]}`,
    );
  }
  return [...variants].filter((variant) => variant !== text);
}

function canonicalizeOptions(
  value: unknown,
  markedExpressions: GrammarMarkedExpression[],
): GrammarOption[] {
  const options = Array.isArray(value) ? value.filter(isGrammarOptionLike) : [];

  return markedExpressions.map((markedExpression, index) => {
    const label = canonicalGrammarLabel(markedExpression.label, index);
    const matchingOption =
      options.find((option) => normalizeGrammarKey(option.label) === normalizeGrammarKey(label)) ??
      options[index];
    const displayedExpression = getMarkedSurfaceExpression(markedExpression);

    return {
      ...matchingOption,
      label,
      text: displayedExpression || normalizeString(matchingOption?.text) || label,
    };
  });
}

function normalizeGrammarDirection(value: unknown, answerCount: number): string {
  const text = normalizeString(value);
  if (answerCount >= 2) {
    return "다음 글의 밑줄 친 부분 중, 어법상 틀린 것을 모두 고르시오.";
  }
  if (!text || /모두|전부|(?:\d+|두|세|네|여러)\s*개/.test(text)) {
    return "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?";
  }
  return text;
}

function getMarkedSurfaceExpression(markedExpression: GrammarMarkedExpression): string {
  if (markedExpression.isError) {
    return normalizeString(markedExpression.errorExpression) || normalizeString(markedExpression.expression);
  }
  return normalizeString(markedExpression.expression);
}

function getSourceExpression(markedExpression: GrammarMarkedExpression): string {
  return (
    normalizeString(markedExpression.expression) ||
    normalizeString(markedExpression.correction) ||
    normalizeString(markedExpression.errorExpression)
  );
}

function normalizeGrammarExplanationSurfaceOrder(
  value: unknown,
  markedExpressions: GrammarMarkedExpression[],
): unknown {
  if (typeof value !== "string") return value;
  const text = normalizeString(value);
  if (!text) return value;

  const prefixes: string[] = [];
  for (const markedExpression of markedExpressions) {
    if (!markedExpression.isError) continue;
    const surface = getMarkedSurfaceExpression(markedExpression);
    const correction = normalizeString(markedExpression.correction) || getSourceExpression(markedExpression);
    if (!surface || !correction || normalizeComparable(surface) === normalizeComparable(correction)) {
      continue;
    }
    if (explanationMentionsSurfaceBeforeCorrection(text, markedExpression.label, surface, correction)) {
      continue;
    }
    prefixes.push(`${markedExpression.label} the displayed "${surface}" is wrong; it should be "${correction}".`);
  }

  if (prefixes.length === 0) return value;
  const prefix = prefixes.join(" ");
  if (text.startsWith(prefix)) return value;
  return `${prefix} ${text}`;
}

function explanationMentionsSurfaceBeforeCorrection(
  explanation: string,
  label: string,
  surface: string,
  correction: string,
): boolean {
  const labelKey = normalizeGrammarKey(label);
  const labelRe = labelKey ? new RegExp(`\\(${labelKey}\\)`, "i") : null;
  const labelMatch = labelRe?.exec(explanation);
  const segment = labelMatch
    ? explanation.slice(labelMatch.index, labelMatch.index + 360)
    : explanation;
  const surfaceIndex = indexOfComparableSurface(segment, surface);
  const correctionIndex = indexOfComparableSurface(segment, correction);
  return surfaceIndex >= 0 && (correctionIndex < 0 || surfaceIndex <= correctionIndex);
}

function indexOfComparableSurface(text: string, surface: string): number {
  const haystack = normalizeComparable(text);
  const needle = normalizeComparable(surface);
  return needle ? haystack.indexOf(needle) : -1;
}

function normalizeComparable(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeWrongOptionExplanations(
  value: unknown,
  labelByKey: Map<string, string>,
): unknown {
  if (!value || typeof value !== "object") return value;

  // 신규 array 형태 ([{label, expression, pointCode, explanation}, ...]) → Record<label, explanation>로 변환
  // (GRAMMAR_ERROR 한정 — 다른 유형은 기존 Record 형태 유지)
  if (Array.isArray(value)) {
    const remapped: Record<string, unknown> = {};
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const rawLabel = item.label;
      const explanation = item.explanation;
      if (typeof explanation !== "string") continue;
      const normalizedKey = normalizeGrammarKey(rawLabel);
      const canonicalKey = normalizedKey ? labelByKey.get(normalizedKey) : "";
      const finalKey = canonicalKey || normalizeString(rawLabel);
      if (!finalKey) continue;
      remapped[finalKey] = explanation;
    }
    return remapped;
  }

  // 기존 Record 형태 — 그대로 처리
  const remapped: Record<string, unknown> = {};
  for (const [key, explanation] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeGrammarKey(key);
    const canonicalKey = normalizedKey ? labelByKey.get(normalizedKey) : "";
    remapped[canonicalKey || key] = explanation;
  }
  return remapped;
}

function canonicalGrammarPointCode(value: unknown, surface: string): string | undefined {
  const code = normalizeString(value).toLowerCase();
  if (!/^[a-m]$/.test(code)) return code || undefined;
  if (grammarPointCodeSurfaceLooksCompatible(code, surface)) return code;
  return inferGrammarPointCodeFromSurface(surface) ?? code;
}

function grammarPointCodeSurfaceLooksCompatible(code: string, surface: string): boolean {
  const text = normalizeString(surface);
  if (!text) return true;
  switch (code) {
    case "b":
      return /\b(?:that|what|which|who|whom|whose|where|when|why|how|whether|whereby)\b/i.test(text);
    case "c":
      return /\b[A-Za-z]+(?:ing|ed|en)\b/i.test(text) || /\b(?:known|left|given|made|seen|found|built|written|driven|chosen|spoken|shown|born)\b/i.test(text);
    case "g":
      return /\b(?:it|its|they|them|their|theirs|themselves|itself|that|those|this|these|one|ones|he|him|his|she|her|hers|herself|himself|we|us|our|ours|you|your|yours)\b/i.test(text);
    case "k":
      return /\bto\s+[A-Za-z]/i.test(text) || /\b[A-Za-z]+ing\b/i.test(text);
    case "l":
      return /\b(?:in|on|at|by|of|to|for|from|with|without|during|while|despite|although|though|because|since|as|if|unless|before|after|until|when|whereas|whilst)\b/i.test(text) ||
        /\b(?:in spite of|due to|owing to|thanks to|because of|on account of)\b/i.test(text);
    case "m":
      return /\b(?:more|less|most|least|as|than)\b/i.test(text) ||
        /\b[A-Za-z]+(?:er|est)\b/i.test(text) ||
        /\b(?:much|many|few|little|fewer|enough|very|almost|so|too|quite)\b/i.test(text);
    default:
      return true;
  }
}

function inferGrammarPointCodeFromSurface(surface: string): string | undefined {
  const text = normalizeString(surface);
  if (!text) return undefined;
  if (/\b(?:that|what|which|who|whom|whose|where|when|why|how|whether|whereby)\b/i.test(text)) return "b";
  if (/\b(?:is|are|was|were|be|been|being|get|gets|got)\s+(?:[A-Za-z]+ed|known|made|seen|found|given|left|built|told|shown|used)\b/i.test(text)) return "e";
  if (/\b[A-Za-z]+(?:ing|ed|en)\b/i.test(text) || /\b(?:known|left|given|made|seen|found|built|written|driven|chosen|spoken|shown|born)\b/i.test(text)) return "c";
  if (/\b(?:it|its|they|them|their|theirs|themselves|itself|that|those|this|these|one|ones|he|him|his|she|her|hers|herself|himself|we|us|our|ours|you|your|yours)\b/i.test(text)) return "g";
  if (/\bto\s+[A-Za-z]/i.test(text) || /\b[A-Za-z]+ing\b/i.test(text)) return "k";
  if (/\b(?:in|on|at|by|of|to|for|from|with|without|during|while|despite|although|though|because|since|as|if|unless|before|after|until|when|whereas|whilst)\b/i.test(text)) return "l";
  if (/\b(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had|can|could|should|would|will|may|might|must|[A-Za-z]+s)\b/i.test(text)) return "a";
  return undefined;
}

function buildLabelMap(
  markedExpressions: GrammarMarkedExpression[],
  modelKeyToFinalLabel?: Map<string, string>,
): Map<string, string> {
  const labelByKey = new Map<string, string>();
  // 출현순 재정렬이 일어난 경우, 모델이 원래 쓴 라벨 키 → 최종 라벨 매핑이 우선
  // (오답해설 등 모델 출력의 라벨 참조를 새 라벨로 따라가게 한다).
  if (modelKeyToFinalLabel) {
    for (const [key, label] of modelKeyToFinalLabel) {
      labelByKey.set(key, label);
    }
  }
  markedExpressions.forEach((me, index) => {
    const key = normalizeGrammarKey(me.label) || GRAMMAR_KEYS[index] || "";
    if (key && !labelByKey.has(key)) labelByKey.set(key, me.label);
    const numericKey = GRAMMAR_KEYS[index];
    if (numericKey && !labelByKey.has(numericKey)) labelByKey.set(numericKey, me.label);
  });
  return labelByKey;
}

function canonicalGrammarLabel(value: unknown, fallbackIndex?: number): string {
  const key = normalizeGrammarKey(value);
  if (key) return `(${key})`;
  if (typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < GRAMMAR_LABELS.length) {
    return GRAMMAR_LABELS[fallbackIndex];
  }
  return normalizeString(value);
}

function collectGrammarLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => canonicalGrammarLabel(entry))
      .filter(Boolean);
  }

  const text = normalizeString(value);
  if (!text) return [];
  const labels: string[] = [];
  const regex = /[([]?\s*([A-Ja-j]|10|[1-9])\s*[)\].:]?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const label = canonicalGrammarLabel(match[1]);
    if (label) labels.push(label);
  }
  return labels;
}

function normalizeGrammarKey(value: unknown): string {
  const text = normalizeString(value);
  if (!text) return "";

  const circledIndex = GRAMMAR_CIRCLED_NUMBERS.indexOf(text as (typeof GRAMMAR_CIRCLED_NUMBERS)[number]);
  if (circledIndex >= 0) return GRAMMAR_KEYS[circledIndex] ?? "";

  const alpha = text.match(/^[([]?\s*([A-Ja-j])\s*[)\].:]?$/);
  if (alpha) return alpha[1].toUpperCase();

  const numeric = text.match(/^[([]?\s*(10|[1-9])\s*[)\].:]?$/);
  if (numeric) return GRAMMAR_KEYS[Number(numeric[1]) - 1] ?? "";

  return "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isSingleTokenExpression(expression: string): boolean {
  return /^[A-Za-z][A-Za-z'-]*$/.test(expression.trim());
}

function isGrammarOptionLike(value: unknown): value is GrammarOption {
  return typeof value === "object" && value !== null && "label" in value && "text" in value;
}
