// ============================================================================
// 함축 의미 추론(IMPLIED_MEANING) 어댑터 — md 파싱 결과 → processImpliedMeaning 이
// 받는 AI 문항 형상. 순수 매핑만 한다(후처리·검증·셔플은 라우트 소관).
//
// 경계 계약(question-postprocess/processors/implied-meaning.ts 실측):
//  - 어댑터가 만든다: direction · underlinedExpression · surroundingText ·
//    options[] · correctAnswer(+correctAnswers) · wrongOptionExplanations ·
//    explanation · keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithUnderline(`__표현__` 삽입) · underlinedExpression
//    을 지문 축자 슬라이스로 재확정 · 발문 정규화 · 선지 접두 라벨 제거
//  ⚠ passageWithUnderline 을 어댑터에서 만들지 마라 — 후처리가 지문에서 위치를
//    다시 찾아 자기 손으로 만든다. 이중 생성은 충돌한다.
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리지 마라.
//  ⚠ keyPoints 합성 금지(정본 adapter.ts:319-322) — 합성문이 모델 오태깅을
//    학생 표면에 노출한 실사고가 있다. 항상 빈 배열.
// ============================================================================

import { contextAround } from "./adapter";
import { locateImpliedTarget, type MdImpliedQuestion } from "./parser-implied";
import {
  IMPLIED_MD_OPTION_COUNT_MAX,
  IMPLIED_MD_OPTION_COUNT_MIN,
} from "./prompts-implied";
import type { MdLaneAdaptResult } from "./lane-types";

/** 후처리 normalizeImpliedMeaningDirection 의 한국어 기본 발문과 동일 문자열. */
export const IMPLIED_MD_DIRECTION =
  "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?";
/** 복수 정답 발문 — "모두" 가 있어야 generic-multi-answer-direction 게이트를 통과한다. */
export const IMPLIED_MD_DIRECTION_MULTI =
  "다음 글에서 밑줄 친 부분이 함축하는 의미로 적절한 것을 모두 고르시오.";

export function adaptMdImpliedToAiQuestion(
  q: MdImpliedQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (
    q.options.length < IMPLIED_MD_OPTION_COUNT_MIN ||
    q.options.length > IMPLIED_MD_OPTION_COUNT_MAX
  ) {
    return {
      ok: false,
      error: `선지 ${q.options.length}개 (${IMPLIED_MD_OPTION_COUNT_MIN}~${IMPLIED_MD_OPTION_COUNT_MAX}개 필요)`,
    };
  }
  if (!q.expression.trim()) return { ok: false, error: "밑줄 표현 누락" };

  // md 원문자 라벨 → 프로덕션 숫자 문자열 축("1"~"N"). 저장·채점·렌더가 전부
  // 숫자 축이고, 학생 표면의 ①~ 변환은 표시 계층이 담당한다.
  const indexByLabel = new Map(q.options.map((o, i) => [o.label, i]));
  const answerIndices: number[] = [];
  for (const label of q.answers) {
    const index = indexByLabel.get(label);
    if (index === undefined) {
      return { ok: false, error: `정답 라벨(${label})이 선지에 없음` };
    }
    if (!answerIndices.includes(index)) answerIndices.push(index);
  }
  if (answerIndices.length === 0) return { ok: false, error: "정답 누락" };
  if (answerIndices.length >= q.options.length) {
    return { ok: false, error: "정답이 전 선지 — 오답이 하나도 없음" };
  }
  answerIndices.sort((a, b) => a - b);

  // surroundingText — 후처리 findExpressionInPassage 의 1순위 전략(윈도우 우선)에
  // 실릴 위치 힌트다. 게이트가 자리 유일성을 이미 강제하므로 보통 불요하지만,
  // 어댑터 단독 호출·드리프트 대비로 채운다. 못 찾으면 빈 문자열 — 엉뚱한 좌표를
  // 넘기느니 비워서 후처리의 전역 탐색에 맡긴다(정본 규약).
  const hit = locateImpliedTarget(passage, q.expression);
  const surroundingText =
    hit && hit.count === 1 ? contextAround(passage, hit.index, hit.length) : "";

  const multiAnswer = answerIndices.length >= 2;
  const wrongByLabel = new Map(q.wrong.map((w) => [w.label, w.text]));
  const answerIndexSet = new Set(answerIndices);
  const wrongOptionExplanations = q.options
    .map((opt, i) => ({ opt, i }))
    .filter(({ i }) => !answerIndexSet.has(i))
    .map(({ opt, i }) => ({
      label: String(i + 1),
      explanation: wrongByLabel.get(opt.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: multiAnswer ? IMPLIED_MD_DIRECTION_MULTI : IMPLIED_MD_DIRECTION,
      // 후처리가 지문 축자 슬라이스로 재확정한다(게이트가 축자를 이미 보장).
      underlinedExpression: q.expression,
      surroundingText,
      options: q.options.map((opt, i) => ({
        label: String(i + 1),
        text: opt.text,
      })),
      correctAnswer: answerIndices.map((i) => String(i + 1)).join(", "),
      // 단일 정답이면 correctAnswers 를 만들지 않는다 — 후처리가
      // `multiAnswer || Array.isArray(correctAnswers)` 로 배열 유지를 결정하므로,
      // 넣으면 단일 정답 문항 형상이 fast 산출과 달라진다.
      ...(multiAnswer
        ? { correctAnswers: answerIndices.map((i) => String(i + 1)) }
        : {}),
      wrongOptionExplanations,
      explanation: q.explanation,
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
