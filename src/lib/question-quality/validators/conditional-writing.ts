// CONDITIONAL_WRITING 기계 검증 가능한 조건 강제 게이트 (wave1).
// conditions 텍스트가 기계로 검증 가능한 제약을 명시하면 modelAnswer 가 그
// 제약을 실제로 지키는지 보수적으로 검사한다. 파싱이 불확실한(모호한) 조건은
// 절대 발화하지 않는다 — 거짓 차단 금지가 원칙.
//   (a) 정확 단어 수: "N단어(로)" / "N개의 단어" — 이내/이상/약/내외 등 범위
//       수식이 붙으면 정확 개수가 아니므로 스킵.
//   (b) 인용된 필수 사용 토큰: "'X'를 반드시 사용/포함/…" — modelAnswer 에
//       존재해야 함. 활용(어형 변화) 허용 조건을 고려해 부분 문자열 포함으로
//       느슨하게 본다(놓치는 방향의 오차만 허용).
//   (c) 인용된 금지 토큰: "'X'를 사용하지 말 것" — modelAnswer 에 없어야 함.
//       단일 토큰은 단어 경계로 판정해 부분 문자열 오탐(use⊂because)을 막는다.
import { QuestionQualitySeverity, containsLoose, containsStandaloneToken, countWords, isSingleEnglishToken, normalizeText } from "../core";



const QUOTED_ENGLISH_TOKEN_REGEX = /['‘’"“”]([A-Za-z][A-Za-z' -]{0,40}?)['‘’"“”]/g;

/** 범위/근사 수식 — 붙으면 "정확 N단어"가 아니므로 단어 수 게이트 스킵. */
const WORD_COUNT_RANGE_QUALIFIER_REGEX =
  /이내|이하|이상|미만|내외|안팎|정도|최소|최대|약\s*\d|\d+\s*[~〜–-]\s*\d+/;

const WORD_COUNT_EXACT_REGEX = /(\d{1,3})\s*(?:개의?\s*)?단어/;

/** 금지 신호 — "사용/쓰/포함/넣-지 말·마·않" 또는 "금지". */
const FORBIDDEN_SIGNAL_REGEX =
  /(?:사용하지|쓰지|포함하지|넣지|포함시키지)\s*(?:말|마|않)|금지/;

/** 필수 사용 신호 — 반드시/포함/사용/활용/넣/시작/끝/쓸 것 계열. */
const MUST_USE_SIGNAL_REGEX =
  /반드시|포함|사용|활용|넣어|넣을|쓸\s*것|쓰시오|써야|시작|끝(?:날|나|낼|맺)|들어가/;



function extractQuotedEnglishTokens(condition: string): string[] {
  const tokens: string[] = [];
  for (const match of condition.matchAll(QUOTED_ENGLISH_TOKEN_REGEX)) {
    const token = match[1]?.trim();
    if (token) tokens.push(token);
  }
  return tokens;
}



export function validateConditionalWritingConditions(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const modelAnswer = normalizeText(question.modelAnswer);
  if (!modelAnswer) return;
  const conditions = Array.isArray(question.conditions)
    ? question.conditions
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeText(item))
        .filter(Boolean)
    : [];
  if (conditions.length === 0) return;

  const answerWordCount = countWords(modelAnswer);

  for (const condition of conditions) {
    // (a) 정확 단어 수 — 범위 수식이 없을 때만 정확 개수로 해석.
    if (!WORD_COUNT_RANGE_QUALIFIER_REGEX.test(condition)) {
      const countMatch = WORD_COUNT_EXACT_REGEX.exec(condition);
      if (countMatch) {
        const expected = Number.parseInt(countMatch[1], 10);
        if (
          Number.isFinite(expected) &&
          expected > 0 &&
          answerWordCount !== expected
        ) {
          add(
            "error",
            "cond-writing-condition-violated",
            `CONDITIONAL_WRITING condition "${condition}" requires exactly ${expected} word(s), but modelAnswer has ${answerWordCount}. Rewrite modelAnswer (or the condition) so they agree.`,
          );
        }
      }
    }

    const quotedTokens = extractQuotedEnglishTokens(condition);
    if (quotedTokens.length === 0) continue;

    if (FORBIDDEN_SIGNAL_REGEX.test(condition)) {
      // (c) 금지 토큰 — 단일 토큰은 단어 경계로 판정(부분 문자열 오탐 방지).
      for (const token of quotedTokens) {
        const present = isSingleEnglishToken(token)
          ? containsStandaloneToken(modelAnswer, token)
          : containsLoose(modelAnswer, token);
        if (present) {
          add(
            "error",
            "cond-writing-condition-violated",
            `CONDITIONAL_WRITING condition "${condition}" forbids "${token}", but modelAnswer still uses it. Rewrite modelAnswer without the forbidden expression.`,
          );
        }
      }
    } else if (MUST_USE_SIGNAL_REGEX.test(condition)) {
      // (b) 필수 사용 토큰 — 어형 변화 허용 조건을 고려해 느슨한 포함으로만 판정.
      for (const token of quotedTokens) {
        if (!containsLoose(modelAnswer, token)) {
          add(
            "error",
            "cond-writing-condition-violated",
            `CONDITIONAL_WRITING condition "${condition}" requires "${token}", but modelAnswer does not contain it. Rewrite modelAnswer to actually satisfy the stated condition.`,
          );
        }
      }
    }
  }
}
