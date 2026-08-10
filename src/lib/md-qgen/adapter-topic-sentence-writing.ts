// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항 형상.
// 견본(EXEMPLAR): adapter-antonym.ts
//
// 경계 계약(question-postprocess/types.ts:81 실측):
//  - 이 유형은 **PASSTHROUGH** 다. 후처리가 만들어 주는 것이 하나도 없다
//    (normalizePostProcessResult 의 3단계가 전부 이 유형에 no-op).
//    → **어댑터가 100% 완제품을 낸다.**
//  - ⚠ `options` 키를 **아예 두지 마라**(undefined 도 아니라 키 부재).
//    비어 있지 않은 options 가 있으면 validateOptions 가 correctAnswer(=문장)와
//    선지를 대조해 correct-answer-mismatch(RELAXED_BLOCKING)를 발화한다.
//  - ⚠ 모드 XOR: 반대 모드 필드를 아예 넣지 않는다. 둘 다 채우면 tsw-mode-xor error.
//  - ⚠ blanks[].label 은 "(A)" 괄호 대문자 고정 — 이 문자열이 곧 학생 답안 키
//    (StudentInput.texts[key], answer-spec.ts:210)다. "A"/"(a)" 로 내면 desync.
//  - ⚠ 위험 #1: fast 레인이 생성 직후 하는 reshuffleTopicSentenceWritingChips 를
//    md 라우트는 하지 않는다 → 어댑터가 반환 직전에 직접 호출한다(멱등·칩불변).
//  - keyPoints 합성 금지(정본 adapter.ts:319-322 와 동일 근거).
//  - requiredLemmas 는 만들지 않는다: TSW 채점 textMode 가 항상 VARIANTS 라
//    (answer-spec.ts:316-329) lemmas 가 조회되지 않는다(grade.ts:50-56).
// ============================================================================

import { reshuffleTopicSentenceWritingChips } from "@/lib/topic-sentence-writing";
import type { MdTswQuestion } from "./parser-topic-sentence-writing";
import type { TswMdShape } from "./prompts-topic-sentence-writing";
import type { MdLaneAdaptResult } from "./lane-types";

export function adaptMdTopicSentenceWritingToAiQuestion(
  q: MdTswQuestion,
  difficulty: string,
  shape: TswMdShape,
  /** 결정론 합성 발문 — resolved.topicSentenceWritingDirection 그대로(AI 문구 금지). */
  direction: string,
): MdLaneAdaptResult {
  if (!q.modelAnswer) {
    return { ok: false, error: "모범답안이 비어 있음" };
  }
  if (q.mode === "scrambled") {
    if (q.chips.length < 2) {
      return { ok: false, error: `배열 재료 ${q.chips.length}개 (2개 이상 필요)` };
    }
  } else {
    if (!q.topic) return { ok: false, error: "주제문(빈칸판) 누락" };
    if (q.blanks.length === 0) return { ok: false, error: "빈칸 정답 없음" };
    if (q.blanks.some((blank) => !blank.label || !blank.answer)) {
      return { ok: false, error: "빈칸 라벨·정답 누락" };
    }
  }

  const aiQuestion: Record<string, unknown> = {
    direction,
    mode: q.mode,
    topicForm: shape.topicForm,
    ...(q.hint ? { koreanGloss: q.hint } : {}),
    // 모드 XOR — 반대 모드 필드는 키 자체를 만들지 않는다.
    ...(q.mode === "scrambled"
      ? { scrambledWords: [...q.chips] }
      : { summaryWithBlanks: q.topic, wordBank: [...q.chips] }),
    ...(q.distractors.length > 0 ? { wordBankDistractors: [...q.distractors] } : {}),
    // 메타(설정 복제) — 렌더 마스킹·검증기가 읽는다.
    clueMode: shape.clueMode,
    wordBankFidelity: shape.fidelity,
    blankAssignment: shape.blankAssignment,
    sourceMode: shape.sourceMode,
    sourceSentenceParaphrase: shape.sourceSentenceParaphrase,
    ...(q.mode === "cloze"
      ? {
          blanks: q.blanks.map((blank) => ({
            label: blank.label,
            answer: blank.answer,
            ...(blank.variants.length > 0
              ? { acceptableVariants: [...blank.variants] }
              : {}),
          })),
        }
      : {}),
    modelAnswer: q.modelAnswer,
    ...(q.mode === "scrambled" && q.acceptedVariants.length > 0
      ? { acceptableVariants: [...q.acceptedVariants] }
      : {}),
    ...(q.scoringCriteria.length > 0 ? { scoringCriteria: [...q.scoringCriteria] } : {}),
    // 스키마 계약: correctAnswer 는 modelAnswer 와 동기화한다.
    correctAnswer: q.modelAnswer,
    explanation: q.explanation,
    keyPoints: [],
    tags: [],
    difficulty,
  };

  // 위험 #1 방어 — fast 레인의 결정론 칩 재배열을 여기서 집행한다. 스냅이 이미
  // 같은 변환을 적용했으므로 멱등 no-op 이지만, 어댑터 단독 호출 경로까지 덮는다.
  return { ok: true, aiQuestion: reshuffleTopicSentenceWritingChips(aiQuestion) };
}
