// ============================================================================
// 문맥 속 의미(CONTEXT_MEANING) 어댑터 — md 파싱 결과 → processContextMeaning 이
// 받는 AI 문항 형상. 순수 매핑만 한다(후처리·검증·셔플은 라우트 소관).
//
// 경계 계약(question-postprocess/processors/context-meaning.ts 실측 — 12줄짜리
// 가장 얇은 프로세서다. 그만큼 어댑터가 완제품에 가깝게 채워야 한다):
//  - 어댑터가 만든다: direction · underlinedWord · surroundingText · options[] ·
//    correctAnswer(+correctAnswers) · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만드는 것은 **passageWithUnderline 하나뿐**이다
//    (findWordInPassage 로 자리를 찾아 `__단어__` 를 끼워 넣는다).
//  ⚠ passageWithUnderline 을 어댑터에서 만들지 마라 — 이중 생성은 충돌한다.
//  ⚠ underlinedWord 는 **지문 축자**여야 한다. 후처리가 replaceAtPosition 으로
//    이 문자열을 지문에 도로 써 넣으므로, 대소문자만 어긋나도 지문 원문이
//    모델 표기로 조용히 바뀐다(게이트가 축자를 이미 강제한다 — 이중 방어로
//    어댑터도 지문 슬라이스를 다시 확인해 싣는다).
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리지 마라 —
//    validators/misc.ts TYPE_SIGNATURE_FOREIGN_FIELDS 가 error 를 찍는다.
//  ⚠ keyPoints 합성 금지(정본 adapter.ts:319-322) — 합성문이 모델 오태깅을
//    학생 표면에 노출한 실사고가 있다. 항상 빈 배열.
// ============================================================================

import { contextAround } from "./adapter";
import {
  locateContextMeaningTarget,
  type MdContextMeaningQuestion,
} from "./parser-context-meaning";
import {
  CONTEXT_MEANING_MD_OPTION_COUNT_MAX,
  CONTEXT_MEANING_MD_OPTION_COUNT_MIN,
} from "./prompts-context-meaning";
import type { MdLaneAdaptResult } from "./lane-types";

/** fast 프롬프트가 지시하는 발문과 동일 문자열(사용자 표면·기존 DB 문항 무변경). */
export const CONTEXT_MEANING_MD_DIRECTION =
  "밑줄 친 단어의 문맥상 의미와 가장 가까운 것은?";
/** 복수 정답 발문 — "모두" 가 있어야 generic-multi-answer-direction 게이트를 통과한다. */
export const CONTEXT_MEANING_MD_DIRECTION_MULTI =
  "밑줄 친 단어의 문맥상 의미로 적절한 것을 모두 고르시오.";

export function adaptMdContextMeaningToAiQuestion(
  q: MdContextMeaningQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (
    q.options.length < CONTEXT_MEANING_MD_OPTION_COUNT_MIN ||
    q.options.length > CONTEXT_MEANING_MD_OPTION_COUNT_MAX
  ) {
    return {
      ok: false,
      error: `선지 ${q.options.length}개 (${CONTEXT_MEANING_MD_OPTION_COUNT_MIN}~${CONTEXT_MEANING_MD_OPTION_COUNT_MAX}개 필요)`,
    };
  }
  const word = q.word.trim();
  if (!word) return { ok: false, error: "밑줄 표현 누락" };

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

  // 자리 확정 — 유일할 때만 지문 축자 슬라이스를 채택하고 그 좌표로
  // surroundingText 를 만든다. 못 찾거나 모호하면 힌트를 비워 후처리의 단어경계
  // 탐색에 맡긴다(정본 규약: 엉뚱한 좌표를 넘기느니 비운다).
  const hit = locateContextMeaningTarget(passage, word);
  const unique = hit !== null && hit.count === 1;
  const underlinedWord = unique
    ? passage.slice(hit.index, hit.index + hit.length)
    : word;
  const surroundingText = unique
    ? contextAround(passage, hit.index, hit.length)
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
      direction: multiAnswer
        ? CONTEXT_MEANING_MD_DIRECTION_MULTI
        : CONTEXT_MEANING_MD_DIRECTION,
      underlinedWord,
      surroundingText,
      options: q.options.map((opt, i) => ({
        label: String(i + 1),
        text: opt.text,
      })),
      correctAnswer: answerIndices.map((i) => String(i + 1)).join(", "),
      // 단일 정답이면 correctAnswers 를 만들지 않는다 — fast 산출 형상과 동일하게
      // 두기 위해서다(배열이 붙으면 소비처가 복수정답 문항으로 취급한다).
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
