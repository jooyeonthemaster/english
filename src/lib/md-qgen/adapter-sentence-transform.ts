// ============================================================================
// 문장 전환(SENTENCE_TRANSFORM) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항 형상.
// 견본: adapter-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §8-2
//
// 경계 계약(question-postprocess/types.ts:68-82 실측):
//  - 이 유형은 **PASSTHROUGH** 다. 후처리가 만들어 주는 것이 하나도 없다
//    (normalizePostProcessResult 의 3단계가 전부 이 유형에 no-op).
//    → **어댑터가 완제품을 낸다.** "후처리가 채워주겠지"가 통하지 않는다.
//  - 어댑터가 만든다: direction · originalSentence · conditions · modelAnswer ·
//    scoringCriteria? · correctAnswer · explanation · keyPoints/tags/difficulty
//  - 라우트가 붙인다: _typeId · _typeLabel · _generationPlan (md-stream/route.ts:1069-1075)
//
// ⚠ `options` 키를 **아예 두지 마라**(undefined 도 아니라 키 부재).
//    validateOptions(validators/options.ts:129)는 options 가 비면 즉시 return 하지만,
//    비어 있지 않으면 correctAnswer(= 문장)가 어떤 선지와도 안 맞아
//    correct-answer-mismatch(RELAXED_BLOCKING)가 터진다.
// ⚠ blanks·passageWithBlank·acceptedAnswers 도 만들지 마라.
//    · blanks 를 흘리면 영작형 verbatim 게이트가 blanks[].answer 를 훑는다
//      (dispatcher.ts:1049-1053).
//    · 이 유형은 FREE_WRITING(answer-spec.ts:250,271-273)이라 채점이 MANUAL_ONLY 다.
//      acceptedAnswers 계열 필드는 계약에 없으며, 만들면 오답 흡수 사고의 씨앗이 된다.
// ⚠ 렌더 가능 판정(question-renderers.tsx:738-739)이
//    `!!q.originalSentence && !!q.conditions` 이므로 둘 중 하나라도 비면 카드가 안 그려진다.
// ============================================================================

import type { MdSentenceTransformQuestion } from "./parser-sentence-transform";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경 — ESSAY_PROMPTS:46). */
export const SENTENCE_TRANSFORM_MD_DIRECTION =
  "다음 문장을 주어진 조건에 맞게 바꾸어 쓰시오.";

/**
 * 순수 매핑만 한다(후처리·검증·셔플은 라우트 소관).
 * 지문을 받지 않는 이유: 이 유형은 지문 파생 필드를 하나도 만들지 않는다 —
 * 원문장의 지문 축자 정합은 게이트가 이미 끝냈고, 시험지의 밑줄은 저장된
 * originalSentence 로 렌더 계층이 직접 찾는다(source-passage-markers.ts).
 */
export function adaptMdSentenceTransformToAiQuestion(
  q: MdSentenceTransformQuestion,
  difficulty: string,
): MdLaneAdaptResult {
  const originalSentence = q.originalSentence.trim();
  const modelAnswer = q.modelAnswer.trim();
  const conditions = q.conditions.map((c) => c.trim()).filter(Boolean);
  const scoringCriteria = q.scoringCriteria.map((s) => s.trim()).filter(Boolean);

  if (!originalSentence) return { ok: false, error: "원문장 누락" };
  if (conditions.length === 0) return { ok: false, error: "조건 누락" };
  if (!modelAnswer) return { ok: false, error: "모범답안 누락" };

  return {
    ok: true,
    aiQuestion: {
      direction: SENTENCE_TRANSFORM_MD_DIRECTION,
      originalSentence,
      conditions,
      modelAnswer,
      // 비면 키 자체를 만들지 않는다(스키마 optional — 빈 배열을 저장해 두면
      // 렌더가 '채점 기준' 빈 박스를 그린다: question-type-renderers.tsx:489-491).
      ...(scoringCriteria.length > 0 ? { scoringCriteria } : {}),
      // 정답의 유일 진실원은 modelAnswer 다(스키마 계약 — ESSAY_PROMPTS:33
      // "correctAnswer: modelAnswer와 동일"). 별도 `정답:` 줄을 받지 않는 이유이기도 하다.
      correctAnswer: modelAnswer,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
