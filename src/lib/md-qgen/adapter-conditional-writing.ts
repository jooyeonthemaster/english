// ============================================================================
// 조건부 영작(CONDITIONAL_WRITING) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항 형상.
//
// 경계 계약(question-postprocess/types.ts:76 · index.ts:55-61 실측):
//  이 유형은 **PASSTHROUGH** 다. 후처리가 지문 필드·라벨·발문을 하나도 만들어 주지
//  않는다(normalizeOptionsForVisibleType·alignWrongOptionExplanations… 전부 no-op).
//  → **어댑터가 100% 완제품을 낸다.**
//
//  - 어댑터가 만든다: direction · referenceSentence · conditions[] · modelAnswer ·
//    scoringCriteria[] · correctAnswer(= modelAnswer) · explanation ·
//    keyPoints[] / tags[] / difficulty
//  - 후처리가 만드는 것: 없음(스프레드 복사 + wrongOptionExplanations 정규화뿐)
//
// ⚠ `options` 키를 **아예 두지 마라**(undefined 도 금지). validateOptions 는 options 가
//    비면 즉시 return 하지만(options.ts:129), 비어 있지 않으면 correctAnswer(= 영어 문장)가
//    어떤 선지 라벨·텍스트와도 안 맞아 correct-answer-mismatch(RELAXED_BLOCKING) 가 뜬다.
// ⚠ `blanks` / `passageWithBlank` / `originalExpression` 도 흘리지 마라 —
//    dispatcher.ts:1049-1053 의 verbatim 누수 게이트가 blanks[].answer 를 훑는다.
// ⚠ keyPoints 는 빈 배열이다(정본 adapter.ts:319-322 — 합성 keyPoints 가 모델
//    오태깅을 학생 표면에 노출한 실사고). KILLER 에서 few-key-points 경고가 뜨지만
//    warning 이라 무해하고, md 레인은 품질 이슈를 차단하지 않는다.
// ============================================================================

import type { MdLaneAdaptResult } from "./lane-types";
import type { MdConditionalWritingQuestion } from "./parser-conditional-writing";

/** DB 실물·fast 산출과 동일한 발문(question-prompts-essay.ts:27 의 direction 예시). */
export const CONDITIONAL_WRITING_MD_DIRECTION =
  "다음 우리말을 주어진 조건에 맞게 영작하시오.";

export const CONDITIONAL_WRITING_MD_DIRECTION_EN =
  "Write the Korean sentence below in English, following the given conditions.";

export function adaptMdConditionalWritingToAiQuestion(
  q: MdConditionalWritingQuestion,
  difficulty: string,
): MdLaneAdaptResult {
  const referenceSentence = q.korean.trim();
  const modelAnswer = q.modelAnswer.trim();
  const conditions = q.conditions.map((c) => c.trim()).filter(Boolean);
  const scoringCriteria = q.scoringCriteria.map((c) => c.trim()).filter(Boolean);

  // 렌더 가능 판정(question-renderers.tsx:736-737)이 referenceSentence && conditions
  // 를 요구한다 — 둘 중 하나라도 비면 강사면 카드가 아예 그려지지 않는다.
  if (!referenceSentence) return { ok: false, error: "영작할 우리말 문장 없음" };
  if (conditions.length === 0) return { ok: false, error: "작성 조건 없음" };
  if (!modelAnswer) return { ok: false, error: "모범답안 없음" };

  return {
    ok: true,
    aiQuestion: {
      direction: CONDITIONAL_WRITING_MD_DIRECTION,
      referenceSentence,
      conditions,
      modelAnswer,
      // 스키마상 optional — 비면 키 자체를 싣지 않는다(빈 배열이 렌더에서 빈 상자를 만든다).
      ...(scoringCriteria.length > 0 ? { scoringCriteria } : {}),
      // 스키마 계약(question-schemas-essay.ts:12 commonAnswerField): correctAnswer 는
      // modelAnswer 와 동일하다. 두 값을 모델에게 따로 받지 않는 이유가 이것이다(철칙 1).
      correctAnswer: modelAnswer,
      explanation: q.explanation.trim(),
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
