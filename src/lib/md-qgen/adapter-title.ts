// ============================================================================
// 제목 추론(TITLE) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-antonym.ts / 형상 기준: question-schemas-mc.ts titleSchema
//
// ⚠ 경계 계약: TITLE 은 PASSTHROUGH_TYPES(question-postprocess/types.ts:73) 라
//   **후처리가 지문 필드를 합성하지도, 라벨을 재부여하지도, 선지를 재생성하지도
//   않는다.** postProcessQuestion 은 공통 정규화 두 가지만 태운다 —
//   wrongOptionExplanations 배열→Record 변환, options 는 이 유형에서 무변경.
//   따라서 **어댑터가 완제품을 낸다.**
//
//  - 어댑터가 만든다(= 최종 저장 형상): direction · options[] · correctAnswer
//    (K>=2 면 correctAnswers[]) · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**
//
// ⚠ 선지 라벨 축은 **"1"~"8" 숫자 문자열**이다(titleSchema options label "1"~"5"
//   계약 · 원문자 표시는 렌더러가 optionDisplayLabel 로 담당). ① 로 저장하지 마라.
// ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression·blankAnswerMode)를
//   흘리면 validators/misc.ts 의 type-foreign-field 로 error 가 찍힌다 —
//   TYPE_SIGNATURE_FOREIGN_FIELDS.TITLE 이 정확히 그 넷을 막는다.
// ⚠ 발문은 모델이 아니라 이 파일이 결정형으로 만든다. md 계약에 direction 줄이
//   없는 이유이며(칸 하나 = 실패 모드 하나), 극성·복수정답·언어 조합 8종이
//   validators 의 정규식(gist-polarity / generic-multi-answer-direction /
//   title-direction-foreign)과 어긋날 여지를 원천 제거한다.
// ============================================================================

import { TITLE_MD_CIRCLED } from "./prompts-title";
import type { MdTitleQuestion } from "./parser-title";
import type { MdLaneAdaptResult } from "./lane-types";

export interface TitleAdaptOptions {
  /** 교사 설정 answerPolarity === "NEGATIVE" — '적절하지 않은 것' 고르기 */
  negative?: boolean;
  /** 교사 설정 stemLanguage — 발문 언어(선지 언어와 별개 축) */
  stemLanguage?: "ko" | "en";
}

/**
 * 발문 결정형 생성 — 극성 × 복수정답 × 언어 8종.
 * 각 문구는 아래 검증기 정규식을 동시에 만족하도록 고정돼 있다:
 *  - validators/misc.ts title-direction-foreign: 빈칸·순서 발문 어휘 미포함
 *  - validators/topic.ts gist-polarity-direction-mismatch: 부정형은 '적절하지 않은' / NOT
 *  - dispatcher.ts generic-multi-answer-direction: 복수정답은 '모두' 또는 all/apply
 */
export function buildTitleMdDirection(options?: {
  negative?: boolean;
  multi?: boolean;
  language?: "ko" | "en";
}): string {
  const negative = options?.negative === true;
  const multi = options?.multi === true;
  if (options?.language === "en") {
    if (multi) {
      return negative
        ? "Choose all the titles that are NOT appropriate for the passage."
        : "Choose all the appropriate titles for the passage.";
    }
    return negative
      ? "Which of the following is NOT an appropriate title for the passage?"
      : "Which of the following is the most appropriate title for the passage?";
  }
  if (multi) {
    return negative
      ? "다음 글의 제목으로 적절하지 않은 것을 모두 고르시오."
      : "다음 글의 제목으로 적절한 것을 모두 고르시오.";
  }
  return negative
    ? "다음 글의 제목으로 가장 적절하지 않은 것은?"
    : "다음 글의 제목으로 가장 적절한 것은?";
}

/** md 원문자 라벨 → 저장 숫자 문자열 라벨. ⑥~⑧(optionCount 6~8)까지 덮는다. */
export function titleDigitLabel(label: string): string {
  const index = TITLE_MD_CIRCLED.indexOf(label);
  return index >= 0 ? String(index + 1) : label;
}

export function adaptMdTitleToAiQuestion(
  q: MdTitleQuestion,
  _passage: string,
  difficulty: string,
  opts?: TitleAdaptOptions,
): MdLaneAdaptResult {
  if (q.options.length < 4 || q.options.length > 8) {
    return { ok: false, error: `선지 ${q.options.length}개 (4~8개 필요)` };
  }
  if (q.answers.length === 0) return { ok: false, error: "정답 라벨 누락" };
  if (q.answers.length >= q.options.length) {
    return { ok: false, error: "오답이 하나도 없음 — 정답 개수가 선지 개수와 같다" };
  }

  const labelSet = new Set(q.options.map((option) => option.label));
  const missing = q.answers.filter((label) => !labelSet.has(label));
  if (missing.length > 0) {
    return { ok: false, error: `정답 라벨이 선지에 없음: ${missing.join(", ")}` };
  }
  if (q.options.some((option) => !option.text.trim())) {
    return { ok: false, error: "빈 선지가 있음" };
  }

  const answerSet = new Set(q.answers);
  const options = q.options.map((option) => ({
    label: titleDigitLabel(option.label),
    text: option.text,
  }));
  // 저장 순서(라벨 순)로 정답을 정렬해 correctAnswer 문자열과 배열이 항상 같은 축이 된다.
  const answerLabels = q.options
    .filter((option) => answerSet.has(option.label))
    .map((option) => titleDigitLabel(option.label));

  // 오답해설 라벨 축은 선지 라벨("1"~"N")과 맞춘다. 후처리가 없으므로 여기서
  // 어긋나면 그대로 저장되어 카드·시험지에서 해설이 엉뚱한 선지에 붙는다.
  // ⚠ 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이 조용히 사라지고
  //   1건은 엉뚱한 내용으로 덮인다. 게이트가 집합 검사로 먼저 막지만, 어댑터를
  //   직접 부르는 경로(재시도·도구)에서도 조용한 소실이 없도록 한 번 더 막는다.
  const wrongByLabel = new Map<string, string>();
  for (const row of q.wrong) {
    if (wrongByLabel.has(row.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${row.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(row.label, row.text);
  }
  const wrongOptionExplanations = q.options
    .filter((option) => !answerSet.has(option.label))
    .map((option) => ({
      label: titleDigitLabel(option.label),
      explanation: wrongByLabel.get(option.label) ?? "",
    }))
    .filter((row) => row.explanation.length > 0);

  const multi = answerLabels.length >= 2;
  return {
    ok: true,
    aiQuestion: {
      direction: buildTitleMdDirection({
        negative: opts?.negative === true,
        multi,
        language: opts?.stemLanguage === "en" ? "en" : "ko",
      }),
      options,
      correctAnswer: answerLabels.join(", "),
      // 단일 정답에서는 correctAnswers 를 만들지 않는다 — fast 스키마도 K=1 이면
      // optional 이고, 빈 배열/1원소 배열이 셔플·채점 축을 흔들 이유가 없다.
      ...(multi ? { correctAnswers: answerLabels } : {}),
      wrongOptionExplanations,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
