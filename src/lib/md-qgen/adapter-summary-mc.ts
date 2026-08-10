// ============================================================================
// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) 어댑터 — md 파싱 결과 → 프로덕션 AI
// 문항 형상. 견본: adapter-antonym.ts · adapter-combo.ts / 정본 규약: 순수 매핑만.
//
// ── 경계 계약 ────────────────────────────────────────────────────────────────
// 이 유형은 **PASSTHROUGH** 다(question-postprocess/types.ts:75). 후처리가 지문
// 파생 필드를 만들어 주지 않으므로 어댑터가 완제품을 내야 한다.
// 후처리가 해 주는 것은 딱 하나: wrongOptionExplanations 배열 → Record 정규화
// (index.ts:167). 그래서 어댑터는 배열형으로 낸다(정본 규약과 동일).
//
// 어댑터가 만든다:
//   direction · summaryWithBlanks · blanks[](label·answer) ·
//   options[](label "1"~"5" · text · blankValues[] · blankA~blankD 호환값) ·
//   correctAnswer(숫자 문자열) · wrongOptionExplanations([{label,explanation}]) ·
//   explanation · keyPoints/tags/difficulty
// 만들지 않는다: passageWith* 계열(이 유형은 지문 파생 필드가 없다) · keyPoints 합성.
//
// ⚠ 선지 라벨 축은 **숫자 문자열 "1"~"5"** 다(digitOptionLabel). 이 유형은
//   SHUFFLE_OPTION_TYPES 멤버(question-diversity.ts:518)라 저장 직전 셔플이
//   이 라벨로 정답·오답해설을 재매핑한다. 원문자 ①을 그대로 내면 정답 키가
//   통째로 어긋난다. (셔플은 옵션 객체의 모든 내용 키를 함께 옮기므로
//   blankValues·blankA/B 는 text 와 동행한다 — question-diversity.ts:652.)
// ⚠ 빈칸 정답(blanks[].answer)은 **정답 선지의 값에서 파생**한다. md 형식이
//   그것을 따로 받지 않기 때문이다(규범 §1-B 철칙 1). 그 덕에 검증기의
//   summary-mc-correct-pair-mismatch 는 구조적으로 발생할 수 없다.
// ============================================================================

import { digitOptionLabel } from "./adapter";
import {
  summaryMcAnswerValues,
  type MdSummaryMcQuestion,
} from "./parser-summary-mc";
import {
  SUMMARY_MC_MD_OPTION_COUNT,
  SUMMARY_MC_MD_VALUE_JOINER,
  summaryMcMdLabels,
} from "./prompts-summary-mc";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·fast 산출과 동일한 발문(사용자 표면 무변경 — question-prompts-mc.ts:603). */
export function summaryMcMdDirection(labels: string[]): string {
  return `다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 ${labels.join(", ")}에 들어갈 말로 가장 적절한 것은?`;
}

/** 발문 언어 설정이 en 일 때의 영어 발문(검증기 direction 프레임 검사 통과 형태). */
export function summaryMcMdDirectionEn(labels: string[]): string {
  return `Which set of words best fits blanks ${labels.join(", ")} in the one-sentence summary of the passage?`;
}

/** 옵션의 blankA~blankD 호환 필드(legacy summaryPairOptionSchema 형상 유지). */
function compatBlankFields(
  labels: string[],
  values: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  labels.forEach((label, i) => {
    const key = label.replace(/[()]/g, "").toUpperCase();
    if (/^[A-D]$/.test(key) && values[i]) out[`blank${key}`] = values[i];
  });
  return out;
}

export function adaptMdSummaryMcToAiQuestion(
  q: MdSummaryMcQuestion,
  difficulty: string,
  blankCount: number,
): MdLaneAdaptResult {
  const labels = summaryMcMdLabels(blankCount);
  if (!q.summary) return { ok: false, error: "요약문 누락" };
  if (q.options.length !== SUMMARY_MC_MD_OPTION_COUNT) {
    return {
      ok: false,
      error: `선지 ${q.options.length}개 (${SUMMARY_MC_MD_OPTION_COUNT}개 필요)`,
    };
  }
  if (!q.answer) return { ok: false, error: "정답 누락" };
  if (!q.options.some((o) => o.label === q.answer)) {
    return { ok: false, error: `정답 라벨(${q.answer})이 선지에 없음` };
  }
  for (const option of q.options) {
    if (option.values.length !== labels.length || option.values.some((v) => !v.trim())) {
      return {
        ok: false,
        error: `선지 ${option.label} 조합값 ${option.values.length}개 (빈칸 ${labels.length}개와 불일치 또는 공백)`,
      };
    }
  }

  // 빈칸 정답 = 정답 선지의 값(유일 진실원에서 파생).
  const answerValues = summaryMcAnswerValues(q);
  const blanks = labels.map((label, i) => ({ label, answer: answerValues[i] }));

  const options = q.options.map((option, i) => ({
    label: digitOptionLabel(option.label) || String(i + 1),
    // 표시 text 는 계약 리터럴로 결정론 재조립한다 — md 원문 text 의 구분자
    // 드리프트(…/.../ | )를 여기서 흡수한다(다중 빈칸 어댑터 :214 동형).
    text: option.values.join(SUMMARY_MC_MD_VALUE_JOINER),
    blankValues: labels.map((label, j) => ({ label, value: option.values[j] })),
    ...compatBlankFields(labels, option.values),
  }));

  // 오답해설 라벨 축은 선지 라벨("1"~"5")과 동일해야 한다 — 셔플이 이 라벨로
  // 해설을 이동시킨다. 본문이 빈 항목을 어댑터가 버리지 않는 것도 정본 규약이다
  // (버리면 생성 절단이 무결성 검사를 통과한 것으로 기록된다 — combo 적대검수).
  const wrongOptionExplanations = q.wrong
    .filter((w) => w.label !== q.answer)
    .map((w) => ({ label: digitOptionLabel(w.label), explanation: w.text }));

  return {
    ok: true,
    aiQuestion: {
      direction: summaryMcMdDirection(labels),
      summaryWithBlanks: q.summary,
      blanks,
      options,
      correctAnswer: digitOptionLabel(q.answer),
      wrongOptionExplanations,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 학생 표면에 출제자 노트를 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
