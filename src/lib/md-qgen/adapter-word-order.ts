// ============================================================================
// 배열 영작(WORD_ORDER) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항 형상.
// 견본: adapter-antonym.ts · 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 경계 계약(question-postprocess/types.ts:80 · index.ts:55-61 실측):
//  - 이 유형은 **PASSTHROUGH** 다. 후처리가 지문 필드·라벨·발문을 하나도
//    만들어 주지 않는다 → **어댑터가 완제품을 낸다.**
//  - 어댑터가 만든다: direction · scrambledWords(재배열 완료) ·
//    wordBankDistractors · contextHint · modelAnswer · acceptedAnswers ·
//    correctAnswer(= modelAnswer) · explanation · keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**. `_typeId`/`_typeLabel`/`_generationPlan` 만
//    라우트가 붙인다(md-stream/route.ts).
//
// ⚠ `options` 키를 **아예 두지 마라**(undefined 도 아니라 키 부재). 서술형은
//    선지가 없어 correctAnswer 가 문장인데, options 가 비어 있지 않으면
//    validators/options.ts:196-217 이 correct-answer-mismatch(RELAXED_BLOCKING)
//    를 발화한다.
// ⚠ `blanks`/`passageWithBlank`/`originalExpression` 도 흘리지 마라 — 영작형
//    verbatim 게이트(dispatcher.ts:1049-1053)가 blanks[].answer 를 훑는다.
// ⚠ §9 #1: fast 레인은 생성 직후 reorderChipsAwayFromAnswer 를 돌리는데
//    (run-question-generation.ts:1034-1044) md 라우트에는 그 단계가 없다.
//    파서 스냅이 이미 돌렸지만, 어댑터 단독 호출·드리프트 대비로 반환 직전에
//    한 번 더 호출한다(멱등·칩 내용 불변이라 이중 호출 안전).
// ============================================================================

import { normalizeWs } from "./parser";
import { cleanMdValue } from "./decoration";
import {
  arrangeWordOrderChips,
  type MdWordOrderQuestion,
} from "./parser-word-order";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const WORD_ORDER_MD_DIRECTION =
  "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오. (쓰지 않는 단어가 포함되어 있음)";
/** 미끼가 하나도 없을 때 — 발문이 거짓말을 하지 않도록 괄호 안내를 뺀다. */
export const WORD_ORDER_MD_DIRECTION_NO_DISTRACTOR =
  "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오.";

export function adaptMdWordOrderToAiQuestion(
  q: MdWordOrderQuestion,
  difficulty: string,
): MdLaneAdaptResult {
  // ⚠ 저장·표시로 나가는 **모든 값**을 공유 cleanMdValue 에 한 번 더 통과시킨다.
  //   파서가 이미 같은 유틸의 고정점까지 정리하므로 레인 경로에서는 무동작이고
  //   (= 게이트가 본 형상과 저장되는 형상이 그대로 일치한다), 어댑터를 단독 호출
  //   하거나 게이트 반려분을 구제(salvage)로 실어 보낼 때만 발화한다. 여기가
  //   채점 correctAnswer 와 학생 화면 칩이 만들어지는 마지막 지점이라, 장식 한
  //   글자가 새면 **정답을 정확히 쓴 학생 전원이 오답**이 된다.
  const modelAnswer = cleanMdValue(q.modelAnswer);
  const chips = q.chips.map((c) => cleanMdValue(c));
  const distractors = q.distractors.map((d) => cleanMdValue(d));

  if (!modelAnswer) return { ok: false, error: "모범답안 누락" };
  if (chips.length < 2) {
    return { ok: false, error: `칩 ${chips.length}개 (2개 이상 필요)` };
  }

  // 정답 어순 누수 방어 — 파서 스냅과 **같은 함수**를 쓰므로(결정론·멱등) 게이트가
  // 검사한 배열과 저장되는 배열이 정확히 일치한다.
  const scrambledWords = arrangeWordOrderChips(chips, distractors, modelAnswer);

  // 선언 미끼는 칩 안에 실재하는 것만 싣는다. 실재하지 않는 미끼를 실으면
  // 학생 페이로드 조립(student-safe-data.ts mergeChipsWithDistractors)이 그
  // 문자열을 칩에 **추가한 뒤 알파벳 정렬**해 버려, 방금 맞춰 놓은 비-정답
  // 어순 배치가 통째로 무너진다(어순 누수 재발).
  const present = new Set(scrambledWords);
  const wordBankDistractors = distractors.filter((d) => present.has(d));

  // acceptedAnswers 계약(question-schemas-essay.ts:280-282): modelAnswer 문자열
  // 자신을 반드시 포함하고, 나머지는 "제시 칩으로 조립 가능한 등가 어순"만.
  // 멀티셋 검증은 스냅·게이트가 이미 끝냈으므로 여기서는 선두 삽입과 중복 제거만.
  const acceptedAnswers: string[] = [];
  const seen = new Set<string>();
  for (const entry of [modelAnswer, ...q.acceptedAnswers.map((a) => cleanMdValue(a))]) {
    const key = normalizeWs(entry).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    acceptedAnswers.push(entry);
  }

  const contextHint = cleanMdValue(q.contextHint);

  return {
    ok: true,
    aiQuestion: {
      direction:
        wordBankDistractors.length > 0
          ? WORD_ORDER_MD_DIRECTION
          : WORD_ORDER_MD_DIRECTION_NO_DISTRACTOR,
      scrambledWords,
      ...(wordBankDistractors.length > 0 ? { wordBankDistractors } : {}),
      ...(contextHint ? { contextHint } : {}),
      modelAnswer,
      acceptedAnswers,
      // 스키마 commonAnswerField 계약 — correctAnswer 는 modelAnswer 와 동일.
      correctAnswer: modelAnswer,
      explanation: cleanMdValue(q.explanation),
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
