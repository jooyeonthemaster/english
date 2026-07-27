// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) 어댑터 — md 파싱 결과 → processGrammarChoiceCombo
// 가 받는 AI 문항 형상. 견본: adapter-antonym.ts / 정본 규약: 순수 매핑만.
//
// ── 경계 계약 (processors/grammar-choice-combo.ts 실측) ─────────────────────
// 어댑터가 만든다:
//   direction · slots[](label·correctExpression·wrongExpression·surroundingText·
//   pointCode) · options[](label "1"~"5" · text · slotValues) · correctAnswer(숫자
//   문자열) · wrongOptionExplanations([{label,explanation}]) · explanation ·
//   keyPoints/tags/difficulty
// 후처리가 만든다(어댑터가 절대 만들지 마라 — 이중 생성은 충돌한다):
//   passageWithMarkers(`(A) [좌 / 우]` 결정형 생성 + 해시 좌우 배치 :229-242) ·
//   슬롯 라벨의 지문 등장순 재부여(:196-209) · 해설 본문 라벨 재매핑(@@GLBL
//   :211-227) · options 라벨/텍스트/slotValues 재조립(:293-298) ·
//   correctAnswer 를 전부-올바른 조합으로 재계산(:312-332)
//
// ⚠ 선지 라벨 축은 **숫자 문자열 "1"~"5"** 다(digitOptionLabel). 후처리가
//   `cleanText(record.label) || String(i+1)` 로 그대로 쓰고, 셔플
//   (shuffleQuestionOptionsForDiversity)이 이 라벨로 정답·오답해설을 재매핑한다.
//   원문자 ①을 그대로 내면 정답 키와 오답해설 키가 통째로 어긋난다.
// ⚠ 빈칸·어법 계열 이물 필드(blanks·passageWithBlank·originalExpression·
//   markedExpressions)를 흘리면 validators/misc.ts 의 type-foreign-field 로
//   error 가 찍힌다 — 넣지 마라.
// ============================================================================

import { POINT_NAME, contextAround, digitOptionLabel } from "./adapter";
import { normalizeWs } from "./parser";
import { rebuildComboPassage, type MdComboQuestion } from "./parser-combo";
import type { MdLaneAdaptResult } from "./lane-types";

/** 후처리 정본 joiner — 선지 표시 문자열 재조립 축(grammar-choice-combo.ts:22). */
export const COMBO_OPTION_JOINER = " - ";

/** DB 실물·fast 산출과 동일한 발문(사용자 표면 무변경). */
export const COMBO_MD_DIRECTION =
  "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?";

const COMBO_MD_SLOT_COUNT = 3;
const COMBO_MD_OPTION_COUNT = 5;

export function adaptMdComboToAiQuestion(
  q: MdComboQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (q.slots.length !== COMBO_MD_SLOT_COUNT) {
    return { ok: false, error: `네모 ${q.slots.length}개 (${COMBO_MD_SLOT_COUNT}개 필요)` };
  }
  if (q.options.length !== COMBO_MD_OPTION_COUNT) {
    return { ok: false, error: `선지 ${q.options.length}개 (${COMBO_MD_OPTION_COUNT}개 필요)` };
  }
  if (!q.answer) return { ok: false, error: "정답 누락" };
  for (const slot of q.slots) {
    if (!slot.correct || !slot.wrong) {
      return { ok: false, error: `${slot.label} 후보 누락` };
    }
  }

  // 네모지문을 "올바른 표현"으로 되돌리며 각 네모의 원문 내 위치를 계산한다 —
  // 정본 adaptMdGrammarToAiQuestion 의 재구성 위치추적과 동일 기법.
  const rebuilt = rebuildComboPassage(q.markedPassage, (label, candidates) => {
    const slot = q.slots.find((s) => s.label === label);
    return slot?.correct ?? candidates[0] ?? "";
  });
  // 재구성본이 원문과 정합할 때만 그 좌표를 쓴다(게이트가 이미 검사하지만,
  // 어댑터 단독 호출·드리프트 대비 이중 방어).
  const useClean =
    rebuilt.text.length > 0 && normalizeWs(rebuilt.text) === normalizeWs(passage);
  const source = useClean ? rebuilt.text : passage;

  const slots = q.slots.map((slot) => {
    const span = rebuilt.spans.get(slot.label);
    let index = useClean && span ? span.index : passage.indexOf(slot.correct);
    const length = span?.length ?? slot.correct.length;
    if (index < 0) index = -1;
    return {
      label: slot.label,
      correctExpression: slot.correct,
      wrongExpression: slot.wrong,
      // 위치 확정 실패 시 빈 문자열 — 후처리 findExpressionInPassage 의 퍼지
      // 탐색에 맡긴다(정본 규약: 엉뚱한 좌표를 넘기느니 비운다).
      surroundingText: index >= 0 ? contextAround(source, index, length) : "",
      // 모델 오태깅 방어 — 닫힌 집합(a~m) 밖이면 기본값으로 강등(정본 :303 동형).
      pointCode: POINT_NAME[slot.code] ? slot.code : "a",
    };
  });

  const options = q.options.map((option, i) => ({
    label: digitOptionLabel(option.label) || String(i + 1),
    // 후처리가 canonical slotValues 로 다시 조립하지만(:295), 후처리를 타지 않는
    // 경로(미리보기·픽스처)에서도 표시가 성립하도록 같은 joiner 로 만들어 둔다.
    text: option.values.join(COMBO_OPTION_JOINER),
    slotValues: option.values,
  }));

  // 오답해설 라벨 축은 선지 라벨("1"~"5")과 동일해야 한다 — 후처리는 키를 그대로
  // 두고 본문 속 슬롯 라벨 언급만 재매핑하며(:334-354), 셔플은 이 라벨로 이동한다.
  // ⚠ **본문이 빈 항목을 여기서 버리지 마라**(적대검수 26-07-26). 버리면 생성 절단
  //   (`⑤ ` 라벨만 찍고 끊김)이 무결성 검사를 통과한 것으로 기록되고 선지 하나가
  //   해설 없이 저장된다. 절단은 게이트(gate-combo.ts #18 "오답해설 본문 없음")가
  //   반려하고, 어댑터는 통과한 것만 무조건 1:1 매핑한다(순수 매핑 규약).
  const wrongOptionExplanations = q.wrong
    .filter((w) => w.label !== q.answer)
    .map((w) => ({ label: digitOptionLabel(w.label), explanation: w.text }));

  return {
    ok: true,
    aiQuestion: {
      direction: COMBO_MD_DIRECTION,
      slots,
      options,
      correctAnswer: digitOptionLabel(q.answer),
      wrongOptionExplanations,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 포인트코드 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
