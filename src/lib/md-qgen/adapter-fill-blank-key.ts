// ============================================================================
// 핵심 표현 빈칸(FILL_BLANK_KEY) 어댑터 — md 파싱 결과 → processFillBlankKey 가
// 받는 AI 문항 형상. 견본: adapter-antonym.ts
//
// 후처리 경계 계약 (processors/fill-blank-key.ts 실측 :4-53):
//  - 어댑터가 만든다: direction · sentenceWithBlank · answer · acceptedAnswers ·
//    correctAnswer · explanation · keyPoints/tags/difficulty
//  - 후처리가 만든다: **passageWithBlank** (answer + sentenceWithBlank 로 지문
//    위치를 탐색해 원지문의 그 스팬만 _____ 로 치환, :29-49).
//  ⚠ 어댑터가 passageWithBlank 를 만들면 후처리 산출과 이중 생성되어 충돌한다.
//    지문 탐색은 후처리 전담이므로 이 어댑터는 passage 를 아예 받지 않는다.
//  ⚠ `options` 키를 두지 마라(undefined 도 아니라 **키 부재**) — validateOptions
//    (validators/options.ts:196-217)가 correct-answer-mismatch(RELAXED_BLOCKING)를
//    발화한다. 서술형은 선지가 없다.
//  ⚠ blanks·markedWords·originalExpression 등 타 유형 필드도 흘리지 마라.
//
// acceptedAnswers 계약 (question-schemas-essay.ts:96-98):
//   이 유형만 예외로 **표기 변형만** 허용한다 — 동의어·패러프레이즈·관계사 치환
//   (in which↔where)은 금지. 지문에 없는 표현을 쓴 학생이 만점을 받기 때문이다
//   (grade.ts:50 은 집합에 든 문자열이면 무조건 CORRECT). 표기 변형은 축약형·
//   대소문자·아포스트로피뿐이고 셋 다 결정론으로 파생 가능하므로, 모델에게 받지
//   않고 **여기서 만든다**. 그 결과 오답 흡수 사고가 구조적으로 불가능해진다.
//   · 대소문자·스마트따옴표·문말 구두점 → exam-scoring normalizeText 가 이미 흡수
//     (normalize.ts:84-96)하므로 변형을 만들 필요가 없다.
//   · 축약형만 실제 표면 차이로 남으므로 아래 표로 양방향 생성한다.
// ============================================================================

import { normalizeText as normalizeGradeText } from "@/lib/exam-scoring/normalize";
import type { MdLaneAdaptResult } from "./lane-types";
import {
  cleanFillBlankKeyValue,
  type MdFillBlankKeyQuestion,
} from "./parser-fill-blank-key";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const FILL_BLANK_KEY_MD_DIRECTION =
  "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오.";

export const FILL_BLANK_KEY_MD_DIRECTION_EN =
  "Write the expression from the passage that best fits the blank.";

/** 축약↔전개 쌍. 좌=전개형, 우=축약형. 양방향으로 변형을 만든다. */
const CONTRACTION_PAIRS: readonly (readonly [string, string])[] = [
  ["it is", "it's"],
  ["that is", "that's"],
  ["there is", "there's"],
  ["here is", "here's"],
  ["he is", "he's"],
  ["she is", "she's"],
  ["what is", "what's"],
  ["who is", "who's"],
  ["they are", "they're"],
  ["we are", "we're"],
  ["you are", "you're"],
  ["they have", "they've"],
  ["we have", "we've"],
  ["you have", "you've"],
  ["they will", "they'll"],
  ["we will", "we'll"],
  ["it will", "it'll"],
  ["do not", "don't"],
  ["does not", "doesn't"],
  ["did not", "didn't"],
  ["is not", "isn't"],
  ["are not", "aren't"],
  ["was not", "wasn't"],
  ["were not", "weren't"],
  ["has not", "hasn't"],
  ["have not", "haven't"],
  ["had not", "hadn't"],
  ["will not", "won't"],
  ["would not", "wouldn't"],
  ["could not", "couldn't"],
  ["should not", "shouldn't"],
  ["must not", "mustn't"],
  ["cannot", "can't"],
  ["can not", "can't"],
] as const;

/** 최대 파생 수 — 허용 집합이 비대해지면 채점 표면이 흐려진다. */
const MAX_DERIVED_VARIANTS = 4;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 아포스트로피 표기(' / ’)를 둘 다 받는 단어경계 정규식. */
function formRegex(form: string): RegExp {
  const body = escapeRe(form).replace(/'/g, "['’]").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "gi");
}

/**
 * 정답의 **표기 변형**만 결정론으로 만든다(의미 변형은 절대 만들지 않는다).
 * 정답 자신은 여기 포함하지 않는다 — 호출부가 선두에 싣는다.
 */
export function deriveOrthographicVariants(answer: string): string[] {
  const base = answer.trim();
  if (!base) return [];
  const out: string[] = [];
  const seen = new Set<string>([normalizeGradeText(base)]);
  for (const [long, short] of CONTRACTION_PAIRS) {
    if (out.length >= MAX_DERIVED_VARIANTS) break;
    for (const [from, to] of [
      [long, short],
      [short, long],
    ] as const) {
      const re = formRegex(from);
      if (!re.test(base)) continue;
      const variant = base.replace(formRegex(from), to);
      const key = normalizeGradeText(variant);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(variant);
      if (out.length >= MAX_DERIVED_VARIANTS) break;
    }
  }
  return out;
}

/**
 * 채점 허용 집합 조립. 순서 계약: **정답이 항상 선두**(스키마 :59 "answer 문자열은
 * 반드시 그대로 1개 포함"). 이어서 결정론 파생본, 마지막으로 스냅을 통과한
 * 모델 제공 표기 변형(드리프트 흡수분).
 */
export function buildFillBlankKeyAcceptedAnswers(
  answer: string,
  extras: string[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [answer, ...deriveOrthographicVariants(answer), ...extras]) {
    const value = candidate.trim();
    if (!value) continue;
    const key = normalizeGradeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function adaptMdFillBlankKeyToAiQuestion(
  q: MdFillBlankKeyQuestion,
  difficulty: string,
): MdLaneAdaptResult {
  // 저장 표면으로 나가는 마지막 관문 — 값은 예외 없이 공유 장식 정리를 통과한다
  // (cleanFillBlankKeyValue = decoration.ts cleanMdValue + 빈칸 마커 보존).
  // 파서가 이미 씻지만 여기서도 씻는다: 이 유형은 PASSTHROUGH 라 후처리가 값을
  // 다시 씻어 주지 않아, 장식이 한 번 새면 학생·강사 표면까지 그대로 간다.
  const sentenceWithBlank = cleanFillBlankKeyValue(q.sentenceWithBlank);
  const answer = cleanFillBlankKeyValue(q.answer);

  if (!sentenceWithBlank) return { ok: false, error: "빈칸문장 누락" };
  if (!answer) return { ok: false, error: "정답 누락" };
  if (!/_{3,}/.test(sentenceWithBlank)) {
    return { ok: false, error: "빈칸문장에 빈칸 마커(_____)가 없음" };
  }

  return {
    ok: true,
    aiQuestion: {
      direction: FILL_BLANK_KEY_MD_DIRECTION,
      sentenceWithBlank,
      answer,
      acceptedAnswers: buildFillBlankKeyAcceptedAnswers(
        answer,
        q.acceptedAnswers.map((raw) => cleanFillBlankKeyValue(raw)),
      ),
      // 스키마 :99 commonAnswerField — 이 유형의 correctAnswer 는 answer 사본이다.
      correctAnswer: answer,
      explanation: cleanFillBlankKeyValue(q.explanation),
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
