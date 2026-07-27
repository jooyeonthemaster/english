// ============================================================================
// 문장 전환(SENTENCE_TRANSFORM) 0원 결정형 게이트 — LLM 콜 없음. 빈 배열이면 클린.
// 견본: gate-topic.ts / parser-antonym.ts 의 gateMdAntonym
// 계약 문서: docs/md-qgen-type-expansion-spec.md §1-B (철칙 3·5)
//
// md 레인은 validateQuestionQuality 결과를 **차단하지 않고 기록만** 한다
// (md-stream/route.ts:1080-1099). 그래서 fast 레인에서 실제로 문항을 죽이는 검사는
// 이 게이트가 결정형으로 대신 잡아야 한다. 이식한 것:
//   · transform-answer-not-transformed (dispatcher.ts:2557-2569, error·RELAXED 미등재)
//   · killer-needs-multiple-conditions (dispatcher.ts:2541-2545, warning → 여기선 반려)
//   · explanation-quoted-token-missing (dispatcher.ts:840-843, strict 전용 error)
//   · 조건 기계 강제 (validators/conditional-writing.ts:45-111 — fast 는 CW 에만 걸지만
//     조건 문장 형상이 동일하므로 ST 에도 같은 보수 규칙을 적용한다)
//
// 🚫 answerRunInPassage(영작형 verbatim 누수) 는 **이식하지 않는다.** 정본이
//    SENTENCE_TRANSFORM 을 그 게이트에서 명시적으로 제외했다(dispatcher.ts:1038 —
//    "원문 변형이 정답이라 부분 겹침이 본질적"). 대신 훨씬 좁고 확실한 검사를 쓴다:
//    모범답안 문장이 지문에 **통째로** 들어 있으면 반려(#6).
//
// ⚠ 게이트 메시지는 반드시 자리를 지목한다(철칙 5) — 이 문구가 그대로 재생성
//   프롬프트의 피드백으로 실린다.
// ============================================================================

import {
  containsLoose,
  containsStandaloneToken,
  countWords,
  isSingleEnglishToken,
  normalizeComparableText,
  normalizeText,
} from "@/lib/question-quality/core";
import { findExplanationQuotedTokenIssue } from "@/lib/question-quality/validators/explanation-quoted-tokens";
import {
  PARAGRAPH_BREAK_RE,
  foldForTransformMatch,
  locateSentenceInPassage,
  type MdSentenceTransformQuestion,
} from "./parser-sentence-transform";
import {
  SENTENCE_TRANSFORM_MD_CONDITION_RANGE,
  SENTENCE_TRANSFORM_MD_SCORING_MAX,
  SENTENCE_TRANSFORM_MD_SCORING_MIN,
} from "./prompts-sentence-transform";
import type { MdDifficulty } from "./prompts";

export interface SentenceTransformGateOptions {
  /** 난이도 — 조건 개수 하한(KILLER 2개)을 결정한다 */
  difficulty?: MdDifficulty;
  /** answer-only 모드에서는 채점기준을 요구하지 않는다 */
  requireScoringCriteria?: boolean;
}

const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;
const SENTENCE_END_RE = /[.!?]["'’”)\]]*$/;

/** 원문장 최소 단어 수 — 이보다 짧으면 전환할 손잡이가 없다. */
const ORIGINAL_MIN_WORDS = 6;
/**
 * 원문장 최대 단어 수. 지문 절반을 통째로 집어오는 드리프트 차단(프롬프트도 같은 지시).
 * 학생이 손으로 다시 써야 하는 문장이라 이 이상은 문항으로 성립하지 않는다.
 */
const ORIGINAL_MAX_WORDS = 60;
/** 모범답안 최소 단어 수 — 절단형·구 단위 답 차단. */
const MODEL_MIN_WORDS = 5;
const CONDITION_MIN_CHARS = 3;
const CONDITION_MAX_CHARS = 120;

// ── 조건 기계 강제 (validators/conditional-writing.ts 의 정규식 그대로) ─────────
const QUOTED_ENGLISH_TOKEN_REGEX = /['‘’"“”]([A-Za-z][A-Za-z' -]{0,40}?)['‘’"“”]/g;
const WORD_COUNT_RANGE_QUALIFIER_REGEX =
  /이내|이하|이상|미만|내외|안팎|정도|최소|최대|약\s*\d|\d+\s*[~〜–-]\s*\d+/;
/**
 * 정확 단어 수 조건 — **전체 범위 한정어가 앞에 붙은 것만** 잡는다.
 *
 * ⚠ 26-07-26 웨이브2 오반려: 종전 `/(\d{1,3})\s*(?:개의?\s*)?단어/` 는 범위 한정이 없어
 *   `전치사구는 4단어로 만들 것`·`분사구는 4단어로 만들 것` 같은 **문장 일부**를 가리키는
 *   조건까지 "모범답안 전체가 4단어여야 한다"로 읽고 정상 문항을 반려했다. 문장 전환
 *   유형에서 '일부를 N단어로'는 '총 N단어로'보다 오히려 자연스러운 조건이고, 프롬프트의
 *   전환 축 3(절 압축)·5(품사 전환)가 그 형태를 유도한다. 이 게이트의 선언 원칙이
 *   "파싱이 모호한 조건은 절대 발화하지 않는다"이므로 전체 범위가 명시된 것만 판정한다
 *   (프롬프트가 가르치는 형태도 `"총 N단어로 쓸 것"` 하나뿐이다).
 */
const WORD_COUNT_WHOLE_SCOPE_EXACT_REGEX =
  /(?:총|전체|전부|모두|통틀어|문장\s*(?:을|은|를|는|으로|로)|답안?\s*(?:을|은|를|는|으로|로))\s*(?:정확히\s*)?(\d{1,3})\s*(?:개의?\s*)?단어/;
const FORBIDDEN_SIGNAL_REGEX =
  /(?:사용하지|쓰지|포함하지|넣지|포함시키지)\s*(?:말|마|않)|금지/;
const MUST_USE_SIGNAL_REGEX =
  /반드시|포함|사용|활용|넣어|넣을|쓸\s*것|쓰시오|써야|시작|끝(?:날|나|낼|맺)|들어가/;

/**
 * 문자열 안의 **문장 경계 개수**(마지막 종결부호는 세지 않는다).
 * `... afternoon. Alternatively the canopy ...` → 1.
 *
 * 약어·이니셜(`U.S.` `Dr.` `e.g.`)과 소수점은 세지 않는다 — 거짓 반려 금지가 원칙이다.
 */
function countInnerSentenceBoundaries(value: string): number {
  const text = String(value ?? "").trim();
  let count = 0;
  // 종결부호 + (닫는 따옴표) + 공백 + 새 문장 시작(대문자·따옴표·여는 괄호)
  for (const m of text.matchAll(/([.!?])["'’”)\]]*\s+(?=[A-Z"“'‘(])/g)) {
    const head = text.slice(0, m.index);
    if (m[1] === ".") {
      // "the U.S." / "J.R." 류 이니셜
      if (/(?:^|[\s("'])(?:[A-Za-z]\.)*[A-Za-z]$/.test(head)) continue;
      // 관습 약어
      if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|Fig|No|Inc|Ltd|Co)$/i.test(head)) continue;
    }
    count += 1;
  }
  return count;
}

/**
 * 해설이 문장 중간에서 끊겼는가. 종결부호로도, 한국어 종결어미로도 끝나지 않으면 절단이다.
 * (파서가 줄바꿈된 해설을 잇도록 고쳤지만, 인용 줄이 해설의 **마지막**에 오면 이어 붙일
 *  한국어가 없어 여전히 조사에서 끊긴다 — 그 잔여를 여기서 자리 지목형으로 잡는다.)
 */
const EXPLANATION_COMPLETE_RE = /(?:[.!?]["'’”)\]]*|다|까|요|죠|음|임)$/;

/** 구두점·대소문자·공백을 걷어낸 비교형 — dispatcher.ts:2558-2561 과 동일 계산. */
function stripForTransformCompare(value: string): string {
  return normalizeComparableText(normalizeText(value))
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface QuotedToken {
  token: string;
  /** 조건 문자열에서 이 인용이 시작하는 위치 */
  start: number;
  /** 이 인용이 끝나는 위치 — 역할 판정 구간의 시작점 */
  end: number;
}

function extractQuotedEnglishTokens(condition: string): QuotedToken[] {
  const tokens: QuotedToken[] = [];
  for (const match of condition.matchAll(QUOTED_ENGLISH_TOKEN_REGEX)) {
    const token = match[1]?.trim();
    if (token && match.index !== undefined) {
      tokens.push({ token, start: match.index, end: match.index + match[0].length });
    }
  }
  return tokens;
}

type TokenRole = "forbidden" | "required" | "unknown";

/**
 * 인용 토큰 하나하나의 **역할**을 가른다.
 *
 * ⚠ 26-07-26 웨이브2 critical: 종전에는 조건 한 줄에 신호가 하나라도 있으면 그 줄의
 *   **모든** 인용 토큰에 같은 역할을 적용했다. 그래서 프롬프트가 직접 가르치는 전환 축
 *   6번(`접속사↔전치사구(because↔because of …)`)이 통째로 오반려됐다:
 *     · `'because'를 쓰지 말고 'Due to'를 사용할 것` → 'Due to' 까지 금지로 판정
 *     · `'because' 대신 'Due to'를 사용할 것`        → 'because' 까지 필수로 판정
 *   md 레인은 게이트 반려 = 1회 재생성 후 실패+환불이고, 반려 문구가 그대로 재생성
 *   피드백으로 실려 모델을 원문장 쪽으로 되돌리므로(그러면 #4 전환 미이행이 발화)
 *   한 번 걸리면 회복 경로가 없었다.
 *
 * 판정 규칙: 토큰의 역할은 **그 토큰 바로 뒤부터 다음 인용 토큰 전까지**의 어절이 정한다
 * (한국어는 `'X'를 쓰지 말고` 처럼 신호가 대상 뒤에 온다). 그 구간에 신호가 없으면
 * `unknown` — 검사하지 않는다. 놓치는 방향의 오차만 남기는 것이 이 게이트의 원칙이다.
 *
 * 단, 인용 토큰이 하나뿐이면 종전대로 **조건 줄 전체**로 판정한다(`금지 어휘: 'X'` 처럼
 * 신호가 토큰 앞에 오는 형태를 잃지 않기 위함 — 기존 검출력 무회귀).
 */
function resolveTokenRoles(condition: string, quoted: QuotedToken[]): TokenRole[] {
  if (quoted.length === 1) {
    if (FORBIDDEN_SIGNAL_REGEX.test(condition)) return ["forbidden"];
    if (MUST_USE_SIGNAL_REGEX.test(condition)) return ["required"];
    return ["unknown"];
  }
  return quoted.map((q, i) => {
    // 이 토큰 뒤부터 다음 인용이 시작되기 전까지가 이 토큰을 지배하는 어절 구간이다.
    const scope = condition.slice(q.end, quoted[i + 1]?.start ?? condition.length);
    if (FORBIDDEN_SIGNAL_REGEX.test(scope)) return "forbidden";
    if (MUST_USE_SIGNAL_REGEX.test(scope)) return "required";
    return "unknown";
  });
}

/**
 * 조건이 명시한 기계 검증 가능한 제약을 모범답안이 실제로 지키는지 검사한다.
 * 파싱이 모호한 조건은 **절대 발화하지 않는다** — 거짓 반려 금지가 원칙이다.
 */
function conditionComplianceIssues(q: MdSentenceTransformQuestion): string[] {
  const modelAnswer = normalizeText(q.modelAnswer);
  if (!modelAnswer) return [];
  const issues: string[] = [];
  const answerWordCount = countWords(modelAnswer);

  for (const raw of q.conditions) {
    const condition = normalizeText(raw);
    if (!condition) continue;

    // (a) 정확 단어 수 — 범위 수식(이내/이상/약N/N~M)이 붙으면 정확 개수가 아니므로 스킵.
    //     전체 범위 한정어(총/전체/문장을/답안을)가 명시된 조건만 모범답안 전체와 대조한다.
    if (!WORD_COUNT_RANGE_QUALIFIER_REGEX.test(condition)) {
      const countMatch = WORD_COUNT_WHOLE_SCOPE_EXACT_REGEX.exec(condition);
      const expected = countMatch ? Number.parseInt(countMatch[1], 10) : Number.NaN;
      if (Number.isFinite(expected) && expected > 0 && answerWordCount !== expected) {
        issues.push(
          `조건 '${condition}' 은 정확히 ${expected}단어를 요구하는데 모범답안은 ${answerWordCount}단어다 — 모범답안이나 조건 중 하나를 고쳐 맞춰라`,
        );
      }
    }

    const quoted = extractQuotedEnglishTokens(condition);
    if (quoted.length === 0) continue;

    const roles = resolveTokenRoles(condition, quoted);
    quoted.forEach(({ token }, i) => {
      if (roles[i] === "forbidden") {
        // (c) 금지 토큰 — 단일 토큰은 단어 경계로 판정(use ⊂ because 류 오탐 방지).
        const present = isSingleEnglishToken(token)
          ? containsStandaloneToken(modelAnswer, token)
          : containsLoose(modelAnswer, token);
        if (present) {
          issues.push(
            `조건 '${condition}' 은 '${token}' 사용을 금지하는데 모범답안이 아직 쓰고 있다`,
          );
        }
      } else if (roles[i] === "required") {
        // (b) 필수 토큰 — 어형 변화를 허용해 느슨한 포함으로만 판정(놓치는 방향의 오차만).
        if (!containsLoose(modelAnswer, token)) {
          issues.push(
            `조건 '${condition}' 이 요구한 '${token}' 이 모범답안에 없다 — 조건을 실제로 충족하도록 다시 써라`,
          );
        }
      }
    });
  }
  return issues;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdSentenceTransform(
  q: MdSentenceTransformQuestion,
  passage: string,
  options?: SentenceTransformGateOptions,
): string[] {
  const difficulty: MdDifficulty = options?.difficulty ?? "KILLER";
  const range = SENTENCE_TRANSFORM_MD_CONDITION_RANGE[difficulty];
  const requireScoring = options?.requireScoringCriteria !== false;
  const v: string[] = [];

  // ── #1 원문장 — 이 유형의 최강 불변식. 축자가 아니면 시험지 밑줄이 사라진다. ──
  if (!q.originalSentence) {
    v.push("원문장 누락 — '원문장:' 줄에 지문 문장 하나를 축자로 옮겨라");
  } else {
    const located = locateSentenceInPassage(passage, q.originalSentence);
    if (!located) {
      v.push(
        `원문장이 지문에 축자로 없음: '${q.originalSentence.slice(0, 70)}' — 지문 문장을 한 글자도 바꾸지 말고 그대로 옮겨라`,
      );
    } else {
      if (located.count > 1) {
        v.push(
          `원문장이 지문에 ${located.count}회 등장 — 밑줄 자리가 모호하니 지문에서 한 번만 나오는 문장을 골라라: '${q.originalSentence.slice(0, 50)}'`,
        );
      }
      if (located.verbatim !== q.originalSentence) {
        v.push(
          `원문장이 지문 축자와 표기가 다름 — 지문 원문은 '${located.verbatim.slice(0, 70)}'`,
        );
      }
      if (!located.startsAtSentenceBoundary) {
        v.push(
          `원문장이 문장 중간에서 시작함 — 문장 처음부터 통째로 옮겨라: '${q.originalSentence.slice(0, 50)}'`,
        );
      }
      if (!located.endsAtSentenceBoundary) {
        v.push(
          `원문장이 문장 끝(마침표·물음표·느낌표)으로 끝나지 않음 — 절만 잘라 오지 말고 문장을 통째로 옮겨라`,
        );
      }
      // 접기 좌표는 `\n\n` 을 공백 하나로 접으므로 문단을 넘는 구간도 매칭에 성공한다.
      // 그 값을 저장하면 시험지 조판(stripOriginalBlock — `\n{2,}` 분할 후 `[원문]`
      // 블록만 제거)이 무력화되어 원문 뒷부분이 조건 박스 위에 고아 텍스트로 인쇄된다.
      if (PARAGRAPH_BREAK_RE.test(located.verbatim)) {
        v.push(
          `원문장이 지문의 문단 경계(빈 줄)를 넘어 걸쳐 있음 — 한 문단 안의 문장 하나만 골라라: '${q.originalSentence.slice(0, 50)}'`,
        );
      }
    }
    // '문장 하나' 불변식 — 학생 지면의 밑줄과 정답의 범위가 어긋나지 않게 한다.
    const originalSentenceBreaks = countInnerSentenceBoundaries(q.originalSentence);
    if (originalSentenceBreaks > 0) {
      v.push(
        `원문장이 ${originalSentenceBreaks + 1}개 문장임 — 전환 대상은 문장 하나여야 한다(밑줄 범위와 모범답안의 범위가 어긋난다): '${q.originalSentence.slice(0, 60)}'`,
      );
    }
    const originalWords = countWords(q.originalSentence);
    if (originalWords > 0 && originalWords < ORIGINAL_MIN_WORDS) {
      v.push(
        `원문장이 ${originalWords}단어로 너무 짧아 전환할 손잡이가 없음 — ${ORIGINAL_MIN_WORDS}단어 이상인 문장을 골라라`,
      );
    }
    if (originalWords > ORIGINAL_MAX_WORDS) {
      v.push(
        `원문장이 ${originalWords}단어로 너무 김 — ${ORIGINAL_MAX_WORDS}단어 이하인 문장 하나를 골라라(학생이 손으로 다시 써야 한다)`,
      );
    }
    if (HANGUL_RE.test(q.originalSentence)) {
      v.push("원문장에 한국어가 섞임 — 지문 영어 문장을 그대로 옮겨야 한다");
    }
  }

  // ── #2 조건 ────────────────────────────────────────────────────────────────
  if (q.conditions.length === 0) {
    v.push("조건 누락 — '조건:' 아래에 '- ' 목록으로 전환 조건을 써라");
  } else if (q.conditions.length < range.min) {
    v.push(
      difficulty === "KILLER"
        ? `조건 ${q.conditions.length}개 — KILLER 는 서로 다른 축의 조건이 ${range.min}개 이상 필요하다`
        : `조건 ${q.conditions.length}개 (${range.min}개 이상 필요)`,
    );
  } else if (q.conditions.length > range.max) {
    v.push(`조건 ${q.conditions.length}개 (${range.max}개 이하로 줄여라)`);
  }
  const seenConditions = new Set<string>();
  q.conditions.forEach((c, i) => {
    const label = `조건 ${i + 1}`;
    if (c.length < CONDITION_MIN_CHARS) {
      v.push(`${label} 이 비었거나 너무 짧음: '${c}'`);
      return;
    }
    if (c.length > CONDITION_MAX_CHARS) {
      v.push(`${label} 이 너무 김(${c.length}자) — 한 줄 한 조건으로 줄여라: '${c.slice(0, 40)}…'`);
    }
    if (!HANGUL_RE.test(c)) {
      v.push(`${label} 에 한국어가 없음 — 조건은 한국어 한 줄로 쓴다: '${c.slice(0, 40)}'`);
    }
    const key = normalizeComparableText(c);
    if (seenConditions.has(key)) v.push(`${label} 이 앞 조건과 중복: '${c.slice(0, 40)}'`);
    seenConditions.add(key);
  });

  // ── #3 모범답안 존재·형상 ─────────────────────────────────────────────────
  if (!q.modelAnswer) {
    v.push("모범답안 누락 — '모범답안:' 줄이 이 문항 정답의 유일한 진실원이다");
  } else {
    if (HANGUL_RE.test(q.modelAnswer)) {
      v.push(`모범답안에 한국어가 섞임 — 영어 완성 문장 한 줄만 써라: '${q.modelAnswer.slice(0, 50)}'`);
    } else if (!LATIN_RE.test(q.modelAnswer)) {
      v.push("모범답안에 영문이 없음 — 영어 완성 문장을 써라");
    }
    const modelWords = countWords(q.modelAnswer);
    if (modelWords > 0 && modelWords < MODEL_MIN_WORDS) {
      v.push(`모범답안이 ${modelWords}단어로 너무 짧음 — 완성된 문장으로 써라: '${q.modelAnswer}'`);
    }
    if (!SENTENCE_END_RE.test(q.modelAnswer.trim())) {
      v.push(
        `모범답안이 문장부호로 끝나지 않음(절단형 의심) — 완성 문장으로 끝맺어라: '${q.modelAnswer.slice(-40)}'`,
      );
    }
    // 형식 계약이 '영어 완성 문장 한 줄'이므로 문장이 둘 이상이면 결정형으로 잡힌다.
    // 모델이 대안 답안·부연을 덧붙이는 드리프트가 여기서 걸린다 — 이 유형은 채점이
    // MANUAL_ONLY 라 강사가 이 값을 그대로 채점 기준으로 읽는다(오염되면 회복 불가).
    const modelSentenceBreaks = countInnerSentenceBoundaries(q.modelAnswer);
    if (modelSentenceBreaks > 0) {
      v.push(
        `모범답안이 ${modelSentenceBreaks + 1}개 문장임 — 영어 완성 문장 **한 줄**만 써라(대안 답안·부연 금지): '${q.modelAnswer.slice(0, 60)}'`,
      );
    }
  }

  // ── #4 전환 이행 — transform-answer-not-transformed 이식(fast error) ───────
  const strippedOriginal = stripForTransformCompare(q.originalSentence);
  const strippedModel = stripForTransformCompare(q.modelAnswer);
  if (strippedOriginal && strippedModel && strippedOriginal === strippedModel) {
    v.push(
      "모범답안이 원문장과 (구두점·대소문자 제외) 동일 — 요청한 전환이 적용되지 않았다. 조건이 지시한 전환을 실제로 수행하라",
    );
  }

  // ── #5 모범답안 지문 통째 존재 금지 ──────────────────────────────────────
  // 이 유형은 지문이 문항과 함께 학생에게 인라인 노출된다
  // (taking-parts/question-view.tsx:34-48 PASSAGE_CONTENT_SUBTYPES). 전환 결과가
  // 지문 어딘가에 이미 있으면 학생은 전환하지 않고 베껴 쓴다.
  if (q.modelAnswer && passage) {
    const foldedModel = foldForTransformMatch(q.modelAnswer);
    if (foldedModel.length >= 20 && foldForTransformMatch(passage).includes(foldedModel)) {
      v.push(
        `모범답안이 지문에 그대로 들어 있음 — 학생이 베껴 쓸 수 있다: '${q.modelAnswer.slice(0, 60)}'`,
      );
    }
  }

  // ── #6 조건 기계 강제 ─────────────────────────────────────────────────────
  v.push(...conditionComplianceIssues(q));

  // ── #7 채점기준 ──────────────────────────────────────────────────────────
  if (requireScoring) {
    if (q.scoringCriteria.length < SENTENCE_TRANSFORM_MD_SCORING_MIN) {
      v.push(
        `채점기준 ${q.scoringCriteria.length}개 (${SENTENCE_TRANSFORM_MD_SCORING_MIN}개 이상 필요 — 만점 형태와 0점 형태를 최소한 구분하라)`,
      );
    } else if (q.scoringCriteria.length > SENTENCE_TRANSFORM_MD_SCORING_MAX) {
      v.push(`채점기준 ${q.scoringCriteria.length}개 (${SENTENCE_TRANSFORM_MD_SCORING_MAX}개 이하로 줄여라)`);
    }
    const seenScoring = new Set<string>();
    q.scoringCriteria.forEach((s, i) => {
      if (s.length < CONDITION_MIN_CHARS) {
        v.push(`채점기준 ${i + 1} 이 비었거나 너무 짧음: '${s}'`);
        return;
      }
      const key = normalizeComparableText(s);
      if (seenScoring.has(key)) v.push(`채점기준 ${i + 1} 이 앞 항목과 중복: '${s.slice(0, 40)}'`);
      seenScoring.add(key);
    });
  }

  // ── #8 해설 ──────────────────────────────────────────────────────────────
  if (!q.explanation) {
    v.push("해설 누락 — '해설:' 줄에 딱 2문장으로 써라");
  } else {
    if (q.explanation.length < 20) {
      v.push(`해설이 너무 짧음: '${q.explanation}'`);
    }
    if (!HANGUL_RE.test(q.explanation)) {
      v.push("해설에 한국어가 없음 — 해설은 한국어(합니다체)로 쓴다");
    }
    // 절단 탐지 — 종전 유일한 검사가 '길이 20자'였던 탓에, 줄바꿈된 해설이 조사에서
    // 끊긴 비문(47자·한국어 포함)이 CLEAN 으로 통과해 학생 표면까지 출하됐다.
    if (!EXPLANATION_COMPLETE_RE.test(q.explanation.trim())) {
      v.push(
        `해설이 문장 중간에서 끊김 — 합니다체 문장으로 끝맺어라(끝부분: '${q.explanation.trim().slice(-30)}')`,
      );
    }
    // 해설이 따옴표로 인용한 12자+ 영어 조각이 문항 표면·지문에 실재하는지
    // (환각 인용 차단). 정본 게이트를 그대로 호출해 판정 축을 하나로 유지한다.
    const quoted = findExplanationQuotedTokenIssue(
      {
        originalSentence: q.originalSentence,
        conditions: q.conditions,
        modelAnswer: q.modelAnswer,
        scoringCriteria: q.scoringCriteria,
        explanation: q.explanation,
      },
      passage,
    );
    if (quoted) {
      v.push(
        `해설이 문항·지문에 없는 영어 표현을 인용함(환각 인용): '${quoted.evidence.fragment}'`,
      );
    }
  }

  return v;
}
