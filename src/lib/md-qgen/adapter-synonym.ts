// ============================================================================
// 동의어(SYNONYM) 어댑터 — md 파싱 결과 → processSynonym 이 받는 AI 문항 형상.
// 순수 매핑만 한다(후처리·검증·셔플은 라우트 소관).
//
// 경계 계약(question-postprocess/processors/synonym.ts 실측 — 51줄 전문 정독):
//  - 어댑터가 만든다: direction · targetWord · contextSentence · options[] ·
//    correctAnswer(+correctAnswers) · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithUnderline(`__targetWord__` 삽입 — findWordInPassage
//    → findExpressionInPassage 순으로 위치를 스스로 찾는다) ·
//    선지 텍스트 정제(sanitizeSingleVocabOptionText: 라벨 접두·괄호 뜻풀이 제거) ·
//    wrongOptionExplanations Record 정규화
//  ⚠ passageWithUnderline 을 어댑터에서 만들지 마라 — 후처리가 자기 손으로 만든다.
//    이중 생성은 충돌한다(정본 규약).
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리지 마라 —
//    validators/misc.ts:31 의 TYPE_SIGNATURE_FOREIGN_FIELDS.SYNONYM 이 그 셋을
//    type-foreign-field error 로 찍는다.
//  ⚠ keyPoints 합성 금지(정본 adapter.ts:319-322) — 합성문이 모델 오태깅을 학생
//    표면에 노출한 실사고가 있다. 항상 빈 배열.
// ============================================================================

import {
  locateSynonymTarget,
  synonymContextSentence,
  type MdSynonymQuestion,
} from "./parser-synonym";
import {
  SYNONYM_MD_OPTION_COUNT_MAX,
  SYNONYM_MD_OPTION_COUNT_MIN,
} from "./prompts-synonym";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const SYNONYM_MD_DIRECTION =
  "다음 밑줄 친 단어의 의미와 가장 유사한 것은?";
/** 복수 정답 발문 — "모두" 가 있어야 generic-multi-answer-direction 게이트를 통과한다. */
export const SYNONYM_MD_DIRECTION_MULTI =
  "다음 밑줄 친 단어의 의미와 가장 유사한 것을 모두 고르시오.";

export function adaptMdSynonymToAiQuestion(
  q: MdSynonymQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (
    q.options.length < SYNONYM_MD_OPTION_COUNT_MIN ||
    q.options.length > SYNONYM_MD_OPTION_COUNT_MAX
  ) {
    return {
      ok: false,
      error: `선지 ${q.options.length}개 (${SYNONYM_MD_OPTION_COUNT_MIN}~${SYNONYM_MD_OPTION_COUNT_MAX}개 필요)`,
    };
  }
  const target = q.target.trim();
  if (!target) return { ok: false, error: "대상 단어 누락" };

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

  // contextSentence — 모델에게 받지 않고 **지문에서 잘라 낸다**(철칙 1: 진실원은
  // 지문 하나). 후처리 findWordInPassage 의 1순위 전략(윈도우 우선 탐색)에 실리고,
  // passageWithUnderline 이 없는 폴백 렌더에서는 이 문장이 학생 표면이 된다.
  // 자리를 유일하게 확정하지 못하면 빈 문자열 — 엉뚱한 좌표를 넘기느니 비워서
  // 후처리의 전역 단어경계 탐색에 맡긴다(정본 규약).
  const hit = locateSynonymTarget(passage, target);
  const contextSentence =
    hit && hit.count === 1
      ? synonymContextSentence(passage, hit.index, hit.length)
      : "";

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
      direction: multiAnswer ? SYNONYM_MD_DIRECTION_MULTI : SYNONYM_MD_DIRECTION,
      // 게이트가 지문 축자를 이미 보장한다 — 후처리는 이 값으로 밑줄 자리를 찾는다.
      targetWord: target,
      contextSentence,
      options: q.options.map((opt, i) => ({
        label: String(i + 1),
        text: opt.text,
      })),
      correctAnswer: answerIndices.map((i) => String(i + 1)).join(", "),
      // 단일 정답이면 correctAnswers 를 만들지 않는다 — 단일 정답 문항 형상을
      // fast 산출과 동일하게 유지하기 위함(정본 어댑터 규약).
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
