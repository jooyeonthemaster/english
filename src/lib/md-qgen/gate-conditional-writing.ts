// ============================================================================
// 조건부 영작(CONDITIONAL_WRITING) 0원 결정형 게이트.
// 파일 500줄 규약에 따라 파서에서 분리(1차 승차분 gate-order.ts 선례).
//
// 설계 원칙(§1-B 철칙 5): **게이트 메시지는 자리를 지목한다.** 이 문구가 그대로
// 재생성 프롬프트의 피드백으로 실리므로, "조건 3개 필요" 가 아니라 "조건 2번이
// 한국어가 아님: '...'" 처럼 어느 자리의 무엇이 어떻게 틀렸는지를 적는다.
//
// md 레인은 validateQuestionQuality 결과를 **차단하지 않고 기록만** 한다.
// 따라서 fast 폴백 경로에서 실차단되는 코드(RELAXED_BLOCKING)는 여기서 결정형으로
// 다시 잡아야 한다. 이 유형의 차단 코드는 두 개다:
//   - cond-writing-verbatim-answer  (모범답안이 지문 통째 복사 — SALVAGE 에서도 제외된 F급)
//   - cond-writing-condition-violated (조건 자기모순)
// 후자는 정본 검증기 validateConditionalWritingConditions 를 **그대로 호출**해
// 판정 로직을 단일 소스로 유지한다(복제하면 드리프트가 난다).
// ============================================================================

import {
  answerRunInPassage,
  containsHangul,
  containsLatinLetter,
  countWords,
  normalizeComparableText,
  summaryWritingComparableTokens,
} from "@/lib/question-quality/core";
import { validateConditionalWritingConditions } from "@/lib/question-quality/validators/conditional-writing";
import { findExplanationQuotedTokenIssue } from "@/lib/question-quality/validators/explanation-quoted-tokens";
import type { MdDifficulty } from "./prompts";
import {
  CW_MD_ANSWER_WORDS_MAX,
  CW_MD_ANSWER_WORDS_MIN,
  CW_MD_CONDITION_MAX,
  CW_MD_CONDITION_MIN,
  CW_MD_CRITERIA_MAX,
  CW_MD_CRITERIA_MIN,
} from "./prompts-conditional-writing";
import type { MdConditionalWritingQuestion } from "./parser-conditional-writing";

// ⚠ 아래 신호 정규식은 validators/conditional-writing.ts:16,19-22,25-30 의 동형 복제다.
// 그 파일은 FROZEN 이라 export 를 늘릴 수 없어 부득이 복제했다. **판정 자체는**
// validateConditionalWritingConditions 를 호출해 단일 소스로 두고, 이 복제본은
// "기계 검증 가능한 조건이 하나라도 있는가"와 "시작/끝 자리 강제"에만 쓴다.
const CW_QUOTED_TOKEN_RE = /['‘’"“”]([A-Za-z][A-Za-z' -]{0,40}?)['‘’"“”]/g;
const CW_WORD_COUNT_RANGE_RE =
  /이내|이하|이상|미만|내외|안팎|정도|최소|최대|약\s*\d|\d+\s*[~〜–-]\s*\d+/;
const CW_WORD_COUNT_EXACT_RE = /(\d{1,3})\s*(?:개의?\s*)?단어/;
const CW_FORBIDDEN_SIGNAL_RE =
  /(?:사용하지|쓰지|포함하지|넣지|포함시키지)\s*(?:말|마|않)|금지/;
const CW_MUST_USE_SIGNAL_RE =
  /반드시|포함|사용|활용|넣어|넣을|쓸\s*것|쓰시오|써야|시작|끝(?:날|나|낼|맺)|들어가/;
/**
 * 정본 검증기가 못 보는 축 — "'X'으로 시작할 것" 은 포함이 아니라 **맨 앞**이어야 한다.
 * ⚠ wave2 교정: 예전에는 조건 문자열 어디든 '시작'이 있으면 발화해서,
 * `분사구문으로 시작하고 'exhibits'를 사용할 것`(분류학 #4 + #1 결합 = KILLER 표준 산출)을
 * md 레인에서만 반려했다. 이제 **인용 토큰 바로 뒤에 붙은** 자리 신호만 본다.
 */
const CW_TOKEN_START_ADJACENT_RE = /^\s*[)）\]]?\s*(?:\(?으\)?)?(?:로|부터)\s*(?:문장을\s*)?시작/;
const CW_TOKEN_END_ADJACENT_RE =
  /^\s*[)）\]]?\s*(?:\(?으\)?)?로\s*(?:문장을\s*)?(?:끝|마무리|마치)/;
/** `'X'으로 시작하지 말 것` — 자리 지정의 부정형. 강제 축에서 빼야 한다. */
const CW_EDGE_NEGATION_RE = /(?:시작|끝내|끝나|끝맺|마무리|마치)\S{0,3}\s*(?:말|마|않)/;
/** 우리말 줄의 영어 어구(2어절 이상 연속) — 괄호 병기 누출의 결정형 지문. */
const CW_LATIN_PHRASE_RE = /[A-Za-z][A-Za-z'-]*(?:[ \t]+[A-Za-z][A-Za-z'-]*)+/;
/** 조건·채점기준에 남은 마크다운 잔재 — 그대로 시험지에 인쇄된다. */
const CW_MARKDOWN_RESIDUE_RE = /[|`]|\*\*/;

const MAX_CONDITION_CHARS = 120;
const MAX_EXPLANATION_CHARS = 400;
/** 해설이 지문의 연속 내용토큰을 이만큼 물고 오면 지문이 통째로 섞인 것이다. */
const EXPLANATION_PASSAGE_BLEED_RUN = 8;

function quotedEnglishTokens(condition: string): string[] {
  return [...condition.matchAll(CW_QUOTED_TOKEN_RE)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

/**
 * 인용 토큰 구간을 지운다. 조건 줄의 **인용 토큰만이 이 문항의 정당한 영어 노출 지점**이므로
 * (프롬프트 CW_CLOSING), 따옴표 밖의 영어는 전부 의도치 않은 누출로 본다.
 */
function stripQuotedSpans(condition: string): string {
  return condition.replace(CW_QUOTED_TOKEN_RE, " ");
}

/** 인용 토큰 **바로 뒤**에 시작/끝 자리 신호가 붙어 있는가. */
function edgeSignals(condition: string): { start: boolean; end: boolean } {
  let start = false;
  let end = false;
  for (const m of condition.matchAll(CW_QUOTED_TOKEN_RE)) {
    const after = condition.slice((m.index ?? 0) + m[0].length);
    if (CW_TOKEN_START_ADJACENT_RE.test(after)) start = true;
    if (CW_TOKEN_END_ADJACENT_RE.test(after)) end = true;
  }
  return { start, end };
}

/** 구두점·대소문자·공백을 접어 문두/문말 대조에 쓰는 형태로 만든다. */
function foldForEdge(value: string): string {
  return normalizeComparableText(value).replace(
    /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
    "",
  );
}

/** 구두점 전부 제거 — 축자 복사 대조용(대소문자·구두점 차이를 흡수). */
function foldForCopy(value: string): string {
  return normalizeComparableText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 이 조건이 기계로 판정 가능한가 — 정확 단어 수이거나, 인용된 영어 토큰 + 필수/금지
 * 신호를 갖췄을 때만 참. 범위 수식("18단어 이내")이 붙은 단어 수는 정본 검증기가
 * 건너뛰므로 여기서도 검증 가능으로 치지 않는다(두 판정이 어긋나면 게이트가 거짓말이 된다).
 */
export function isMachineCheckableCondition(condition: string): boolean {
  if (
    !CW_WORD_COUNT_RANGE_RE.test(condition) &&
    CW_WORD_COUNT_EXACT_RE.test(condition)
  ) {
    return true;
  }
  if (quotedEnglishTokens(condition).length === 0) return false;
  return (
    CW_FORBIDDEN_SIGNAL_RE.test(condition) || CW_MUST_USE_SIGNAL_RE.test(condition)
  );
}

/**
 * 조건 항목 개별 형태 검사(게이트 #7).
 * ⚠ **조기 반환보다 먼저** 호출한다(§1-B 철칙 3·5). 실측: `모범답안(예시):` 라벨이
 * 안 잡혀 영어 모범답안이 conditions[3] 로 흘러들었는데, 게이트는 조기 반환 탓에
 * "모범답안 줄을 인식할 수 없음" 한 줄만 내보냈다 — 재생성 프롬프트가 진짜 원인
 * (조건 오배치)을 영영 못 본다.
 */
function checkConditionForms(
  conditions: string[],
  modelAnswer: string,
  v: string[],
): void {
  const seen = new Set<string>();
  conditions.forEach((raw, index) => {
    const label = `조건 ${index + 1}번`;
    const condition = raw.trim();
    if (!condition) {
      v.push(`${label}이 비었음`);
      return;
    }
    if (!containsHangul(condition)) {
      v.push(`${label}이 한국어 지시문이 아님: '${condition.slice(0, 40)}'`);
    }
    if (condition.length > MAX_CONDITION_CHARS) {
      v.push(`${label}이 너무 김(${condition.length}자) — 한 줄 지시문으로 줄여라`);
    }
    if (CW_MARKDOWN_RESIDUE_RE.test(condition)) {
      v.push(
        `${label}에 마크다운 잔재가 남아 있음(받은 값: '${condition.slice(0, 40)}') — 표 파이프·백틱·별표를 지우고 \`- \` 불릿 한 줄 지시문으로 적어라`,
      );
    }
    // ★ 정답 누출(critical) — 조건은 학생에게 **그대로 보이는** 필드다(student-safe-data.ts:347-352).
    // 따옴표 밖에 모범답안의 연속 내용토큰이 3개 이상 들어오면 영작 과제가 베껴쓰기로 전락한다.
    // 실측: 조건 목록 끝의 자기검산 메모 `(예: Had it not been for the information art contains, …)`.
    const leak = modelAnswer
      ? answerRunInPassage(modelAnswer, stripQuotedSpans(condition), 3)
      : "";
    if (leak) {
      v.push(
        `${label}에 모범답안이 노출됨(겹친 구간: "${leak}") — 조건에는 학생이 써야 할 표현을 작은따옴표로 '지정'만 하고, 모범답안·검산 메모·예시 문장을 적지 마라(조건은 학생 화면에 그대로 인쇄된다)`,
      );
    }
    const key = normalizeComparableText(condition);
    if (seen.has(key)) {
      v.push(`${label}이 앞 조건과 중복: '${condition.slice(0, 40)}'`);
    }
    seen.add(key);
  });
}

export interface MdConditionalWritingGateOptions {
  difficulty?: MdDifficulty;
  /** answer-only 모드에서는 채점기준을 요구하지 않는다. */
  requireCriteria?: boolean;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdConditionalWriting(
  q: MdConditionalWritingQuestion,
  passage: string,
  options?: MdConditionalWritingGateOptions,
): string[] {
  const difficulty: MdDifficulty = options?.difficulty ?? "KILLER";
  const requireCriteria = options?.requireCriteria !== false;
  const minConditions = CW_MD_CONDITION_MIN[difficulty];
  const v: string[] = [];

  const korean = q.korean.trim();
  const modelAnswer = q.modelAnswer.trim();
  const explanation = q.explanation.trim();

  // ── #1 필드 존재 ─────────────────────────────────────────────────────────
  if (!korean) v.push("우리말 줄을 인식할 수 없음 — 영작할 한국어 문장이 비었다");
  if (!modelAnswer) {
    v.push("모범답안 줄을 인식할 수 없음 — 이 유형의 정답은 `모범답안:` 줄이 유일 진실원이다");
  }
  if (q.conditions.length === 0) {
    v.push("조건 항목이 하나도 없음 — `조건:` 아래에 `- ` 목록으로 적어라");
  }
  if (!explanation) v.push("해설 누락");
  // ── #7 조건 개별 형태 — **조기 반환보다 먼저** 돌린다(철칙 3·5). ────────────
  checkConditionForms(q.conditions, modelAnswer, v);
  // 두 축자 필드가 없으면 이후 대조가 전부 무의미하다.
  if (!korean || !modelAnswer) return v;

  // ── #2 우리말 언어 축 — 학생에게 제시되는 영작 대상은 한국어여야 한다 ──
  if (!containsHangul(korean)) {
    v.push(`우리말 줄이 한국어가 아님(받은 값: '${korean.slice(0, 50)}')`);
  }
  const koreanLeak = answerRunInPassage(modelAnswer, korean, 3);
  if (koreanLeak) {
    v.push(
      `우리말 줄에 모범답안의 영어 표현이 노출됨: "${koreanLeak}" — 우리말에는 영어를 한 글자도 쓰지 마라(괄호 병기 포함)`,
    );
  }
  // ⚠ 위 런 검사는 **4글자 이상 내용토큰 3연속**을 요구해서(core.ts:279-281,309)
  // 프롬프트가 명시한 실측 누출 형태인 '괄호 병기'를 구조적으로 못 잡는다:
  // `…없었다면(Had it not been for), …` 의 비교 토큰은 ["been"] 하나뿐이라 즉시 "" 를 돌려준다.
  // → 문자 축으로 두 겹 더 본다.
  const comparableKorean = normalizeComparableText(korean);
  const leakedQuoted = [
    ...new Set(
      q.conditions
        .flatMap(quotedEnglishTokens)
        .filter(
          (token) =>
            token.length >= 3 &&
            comparableKorean.includes(normalizeComparableText(token)),
        ),
    ),
  ];
  if (leakedQuoted.length > 0) {
    v.push(
      `우리말 줄에 조건의 인용 표현이 그대로 적혀 있음: ${leakedQuoted
        .map((token) => `"${token}"`)
        .join(", ")} — 학생이 영작해야 할 표현을 문제에 미리 인쇄하면 문항이 사라진다`,
    );
  }
  const latinPhrase = korean.match(CW_LATIN_PHRASE_RE);
  if (latinPhrase) {
    v.push(
      `우리말 줄에 영어 어구가 섞여 있음: "${latinPhrase[0].slice(0, 50)}" — 우리말에는 영어를 한 글자도 쓰지 마라(괄호 병기·인용 포함)`,
    );
  }

  // ── #3 모범답안 언어 축 ──────────────────────────────────────────────────
  if (!containsLatinLetter(modelAnswer)) {
    v.push(`모범답안이 영어 문장이 아님(받은 값: '${modelAnswer.slice(0, 50)}')`);
  }
  if (containsHangul(modelAnswer)) {
    v.push("모범답안에 한글이 섞여 있음 — 영어 완성 문장 한 줄이어야 한다");
  }
  if (/\n/.test(q.modelAnswer)) {
    v.push("모범답안이 여러 줄임 — 완성 문장 하나를 한 줄로 써라");
  }

  // ── #4 모범답안 분량 ────────────────────────────────────────────────────
  const answerWords = countWords(modelAnswer);
  if (answerWords < CW_MD_ANSWER_WORDS_MIN || answerWords > CW_MD_ANSWER_WORDS_MAX) {
    v.push(
      `모범답안이 ${answerWords}단어 — ${CW_MD_ANSWER_WORDS_MIN}~${CW_MD_ANSWER_WORDS_MAX}단어여야 한다`,
    );
  }

  // ── #5 verbatim 복사 (최강 게이트 · fast 의 cond-writing-verbatim-answer 이식) ──
  // 이 유형은 원본 지문이 문항 안에 인라인 렌더되므로(question-view.tsx
  // PASSAGE_CONTENT_SUBTYPES), 모범답안이 지문 축자면 학생이 그대로 베껴 쓴다.
  // 실측 4건(runIndex 37/38/47/48)이 이 형태로 출하돼 llm 심사 fatal 판정을 받았고,
  // SALVAGE_RELAXABLE_CODES 에서도 명시적으로 제외된 F급이다.
  if (passage) {
    const copyAnswer = foldForCopy(modelAnswer);
    if (copyAnswer && foldForCopy(passage).includes(copyAnswer)) {
      v.push(
        `모범답안이 지문 문장의 축자 복사임: "${modelAnswer.slice(0, 70)}" — 지문이 문항 안에 함께 보이므로 베껴쓰기 과제가 된다. 시제·태·구문 전환을 최소 1개 넣어 다시 설계하라`,
      );
    } else {
      const tokens = summaryWritingComparableTokens(modelAnswer);
      if (tokens.length >= 6) {
        const run = answerRunInPassage(
          modelAnswer,
          passage,
          Math.max(6, Math.ceil(tokens.length * 0.8)),
        );
        if (run) {
          v.push(
            `모범답안이 지문 문장의 사실상 통째 복사임(연속 일치: "${run}") — 시제·태·구문 전환을 최소 1개 넣어 다시 설계하라`,
          );
        }
      }
    }
  }

  // ── #6 조건 개수 ────────────────────────────────────────────────────────
  if (q.conditions.length > 0 && q.conditions.length < minConditions) {
    v.push(
      `조건 ${q.conditions.length}개 — ${difficulty} 난이도는 ${minConditions}개 이상 필요하다`,
    );
  }
  if (q.conditions.length > CW_MD_CONDITION_MAX) {
    v.push(
      `조건 ${q.conditions.length}개 — ${CW_MD_CONDITION_MAX}개 이하여야 한다(학생이 동시에 만족시킬 수 없다)`,
    );
  }

  // ── #7 은 위(조기 반환 앞)에서 이미 수행했다 — checkConditionForms 참조. ──

  // ── #8 기계 검증 가능성 — 하나도 없으면 채점이 통째로 주관이 된다 ────────
  if (q.conditions.length > 0 && !q.conditions.some(isMachineCheckableCondition)) {
    v.push(
      "조건 중에 기계로 검증 가능한 항목이 없음 — 작은따옴표로 감싼 필수/금지 영어 표현(예: 'without'을 사용하지 말 것) 또는 정확 단어 수(예: 총 18단어로 쓸 것) 조건을 최소 1개 넣어라",
    );
  }

  // ── #9 조건 실제 준수 (정본 검증기 그대로 호출) ─────────────────────────
  validateConditionalWritingConditions(
    { modelAnswer, conditions: q.conditions },
    (_severity, _code, message) => {
      v.push(`조건 위반 — ${message}`);
    },
  );

  // ── #10 시작/끝 자리 강제 (정본 검증기가 못 보는 축) ────────────────────
  // 정본은 containsLoose(부분 문자열 포함)로만 판정해서, "'Without'으로 시작할 것"
  // 인데 문장 한복판에 있는 모범답안이 통과한다. 학생 답 채점은 문두를 보므로
  // 모범답안이 그 기준을 스스로 어기면 채점 기준이 무너진다.
  const answerEdge = foldForEdge(modelAnswer);
  for (const condition of q.conditions) {
    const tokens = quotedEnglishTokens(condition);
    if (tokens.length === 0) continue;
    if (CW_FORBIDDEN_SIGNAL_RE.test(condition)) continue;
    // 자리 지정의 부정형(`'Without'으로 시작하지 말 것`)은 정본 검증기가 '반드시 사용'으로
    // 오독한다(FORBIDDEN_SIGNAL_REGEX 가 '시작하지 말'을 못 잡는다 — validators:25-26).
    // 여기서 자리 강제를 걸면 거짓 사유가 하나 더 붙으므로, 대신 **형식을 지목해** 반려한다.
    if (CW_EDGE_NEGATION_RE.test(condition)) {
      v.push(
        `조건 '${condition.slice(0, 40)}' 은 자리 지정을 부정형으로 썼다 — 기계 검증기가 이를 '반드시 그 표현을 쓸 것'으로 오독한다. 금지는 \`'…'을 사용하지 말 것\`, 자리 지정은 \`'…'으로 시작할 것\` 중 하나로만 써라`,
      );
      continue;
    }
    // 조건 안에 인용 토큰이 여러 개일 수 있으므로(`'A' 또는 'B'로 시작할 것`),
    // 자리 신호는 토큰 인접으로 판정하되 충족 여부는 관대하게 some() 으로 본다.
    const { start, end } = edgeSignals(condition);
    if (start && !tokens.some((token) => answerEdge.startsWith(foldForEdge(token)))) {
      v.push(
        `조건 '${condition.slice(0, 40)}' 은 그 표현으로 문장을 시작할 것을 요구하는데, 모범답안은 '${modelAnswer.slice(0, 32)}…' 로 시작한다`,
      );
    }
    if (end && !tokens.some((token) => answerEdge.endsWith(foldForEdge(token)))) {
      v.push(
        `조건 '${condition.slice(0, 40)}' 은 그 표현으로 문장을 끝낼 것을 요구하는데, 모범답안은 '…${modelAnswer.slice(-32)}' 로 끝난다`,
      );
    }
  }

  // ── #11 채점기준 — 이 유형은 기계 채점이 불가능(MANUAL_ONLY)하다 ────────
  // answer-spec.ts:250,271-273 — CONDITIONAL_WRITING 은 FREE_WRITING 집합이라
  // 항상 NEEDS_REVIEW 로 강등된다. 즉 사람이 손으로 채점하며, 채점기준이 곧 채점의 전부다.
  if (requireCriteria) {
    if (q.scoringCriteria.length < CW_MD_CRITERIA_MIN) {
      v.push(
        `채점기준 ${q.scoringCriteria.length}개 — ${CW_MD_CRITERIA_MIN}~${CW_MD_CRITERIA_MAX}개 필요하다(이 유형은 기계 채점이 불가능해 채점기준이 채점의 전부다)`,
      );
    } else if (q.scoringCriteria.length > CW_MD_CRITERIA_MAX) {
      v.push(
        `채점기준 ${q.scoringCriteria.length}개 — ${CW_MD_CRITERIA_MAX}개 이하여야 한다`,
      );
    }
    q.scoringCriteria.forEach((raw, index) => {
      const criterion = raw.trim();
      if (criterion && !containsHangul(criterion)) {
        v.push(`채점기준 ${index + 1}번이 한국어가 아님: '${criterion.slice(0, 40)}'`);
      }
      if (criterion && CW_MARKDOWN_RESIDUE_RE.test(criterion)) {
        v.push(
          `채점기준 ${index + 1}번에 마크다운 잔재가 남아 있음(받은 값: '${criterion.slice(0, 40)}') — 표 파이프·백틱·별표를 지우고 \`- \` 불릿 한 줄로 적어라`,
        );
      }
    });
  }

  // ── #12 해설 ────────────────────────────────────────────────────────────
  if (explanation) {
    if (!containsHangul(explanation)) {
      v.push(`해설이 한국어가 아님(받은 값: '${explanation.slice(0, 40)}')`);
    } else if (explanation.length < 30) {
      v.push(
        `해설이 ${explanation.length}자 — 조건이 어디서 충족되는지와 어떤 구문 전환을 썼는지를 담은 2문장으로 써라`,
      );
    }
    // 상한 축(wave2) — 해설 섹션은 헤딩 없는 후행 텍스트를 무제한 흡수했다. 실측으로
    // 지문 전문이 합쳐져 568자가 됐는데도 한글 포함·30자 이상이라 GATE CLEAN 이었다.
    // 파서에도 보수 가드를 넣었지만, 짧은 조각으로 쪼개져 들어오는 경우까지 여기서 막는다.
    if (explanation.length > MAX_EXPLANATION_CHARS) {
      v.push(
        `해설이 ${explanation.length}자 — ${MAX_EXPLANATION_CHARS}자 이하 딱 2문장으로 줄여라(지문·채점기준이 해설 아래로 흘러 들어왔는지 확인하라)`,
      );
    }
    if (passage) {
      const bleed = answerRunInPassage(
        explanation,
        passage,
        EXPLANATION_PASSAGE_BLEED_RUN,
      );
      if (bleed) {
        v.push(
          `해설에 지문 원문이 통째로 섞여 들어옴(연속 일치: "${bleed.slice(0, 60)}…") — 해설은 한국어 2문장이다. 해설 뒤에 지문을 다시 붙이지 마라`,
        );
      }
    }
    // 해설 인용 실재(explanation-quoted-token-missing 이식) — 해설이 따옴표로 인용한
    // 영어 조각이 문항 표면 어디에도 없으면 환각 인용이다.
    const quoted = findExplanationQuotedTokenIssue(
      {
        explanation,
        modelAnswer,
        referenceSentence: korean,
        conditions: q.conditions,
        scoringCriteria: q.scoringCriteria,
      },
      passage,
    );
    if (quoted) {
      v.push(
        `해설이 문항 어디에도 없는 영어 표현을 인용함: "${quoted.evidence.fragment}" — 모범답안·조건·지문에 실제로 있는 표현만 인용하라`,
      );
    }
  }

  return v;
}
