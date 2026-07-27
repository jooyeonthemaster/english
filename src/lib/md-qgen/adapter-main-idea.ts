// ============================================================================
// 요지·주장(MAIN_IDEA) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-antonym.ts / 형상 기준: question-schemas-mc.ts mainIdeaSchema
//
// ⚠ 경계 계약: MAIN_IDEA 는 PASSTHROUGH_TYPES(question-postprocess/types.ts:71) 라
//   **후처리가 지문 필드를 합성하지도, 라벨을 재부여하지도, 선지를 재생성하지도
//   않는다.** postProcessQuestion 이 하는 일은 공통 정규화 두 가지뿐이다 —
//   wrongOptionExplanations 배열→Record 변환, 그리고 VISIBLE_KOREAN_OPTION_TYPES
//   정렬(해설이 선지 문구를 담고 있지 않으면 "'{선지}' 선택지는 ..." 접두를 붙임).
//   따라서 **어댑터가 완제품을 낸다.**
//
//  - 어댑터가 만든다(= 최종 저장 형상): direction · options[] · correctAnswer
//    (K>=2 면 correctAnswers[]) · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**
//
// ⚠ 선지 라벨 축은 **"1"~"8" 숫자 문자열**이다(mainIdeaSchema options label 계약).
//   ① 로 저장하면 채점(answer-spec SIMPLE_SINGLE_CHOICE)·셔플 축이 어긋난다.
// ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression·blankAnswerMode)를
//   흘리면 validators/misc.ts 의 type-foreign-field 로 error 가 찍힌다 —
//   TYPE_SIGNATURE_FOREIGN_FIELDS.MAIN_IDEA 가 정확히 그 넷을 막는다.
// ⚠ `근거:` 줄(지문 축자 논지 문장)은 **저장하지 않는다.** md 게이트의 지문 정합
//   앵커일 뿐이고, 스키마에 없는 필드를 실으면 유형 형상이 오염된다.
// ⚠ 발문은 모델이 아니라 이 파일이 결정형으로 만든다(md 계약에 발문 줄이 없는
//   이유 — 칸 하나 = 실패 모드 하나). 극성·복수정답·언어·발문축 조합 16종이
//   검증기 정규식(gist-polarity-direction-mismatch / main-idea-direction-mismatch
//   / generic-multi-answer-direction)과 어긋날 여지를 원천 제거한다.
// ============================================================================

import { MAIN_IDEA_MD_LABELS, type MainIdeaStemAxis } from "./prompts-main-idea";
import type { MdMainIdeaQuestion } from "./parser-main-idea";
import type { MdLaneAdaptResult } from "./lane-types";

export interface MainIdeaAdaptOptions {
  /** 교사 설정 answerPolarity === "NEGATIVE" — '적절하지 않은 것' 고르기 */
  negative?: boolean;
  /** 교사 설정 stemLanguage — 발문 언어(선지 언어와 별개 축) */
  stemLanguage?: "ko" | "en";
}

/**
 * 발문 결정형 생성 — 발문축(요지·주장) × 극성 × 복수정답 × 언어 16종.
 * 각 문구는 아래 검증기 정규식을 동시에 만족하도록 고정돼 있다:
 *  - validators/topic.ts main-idea-direction-mismatch: 한국어 발문에 '요지' 또는 '주장'
 *    (영문 발문은 main idea / claim / writer)
 *  - validators/topic.ts gist-polarity-direction-mismatch: 부정 극성은 '적절하지 않은' 또는 NOT
 *  - dispatcher.ts generic-multi-answer-direction: 복수정답은 '모두' 또는 all/apply
 * 발문축은 fast 레인의 계약(question-prompts-mc.ts:481 — 글 성격에 따라 요지형/
 * 주장형 중 하나)을 md 로 옮긴 것이다. 문구 선택만 모델이 하고 문자열은 여기서 짓는다.
 */
export function buildMainIdeaMdDirection(options?: {
  stemAxis?: MainIdeaStemAxis;
  negative?: boolean;
  multi?: boolean;
  language?: "ko" | "en";
}): string {
  const claim = options?.stemAxis === "주장";
  const negative = options?.negative === true;
  const multi = options?.multi === true;
  if (options?.language === "en") {
    const object = claim ? "the writer's claim in the passage" : "the main idea of the passage";
    if (multi) {
      return negative
        ? `Choose all the statements that do NOT express ${object}.`
        : `Choose all the statements that express ${object}.`;
    }
    return negative
      ? `Which of the following does NOT express ${object}?`
      : `Which of the following best expresses ${object}?`;
  }
  const head = claim ? "다음 글에서 필자가 주장하는 바로" : "다음 글의 요지로";
  if (multi) {
    return negative
      ? `${head} 적절하지 않은 것을 모두 고르시오.`
      : `${head} 적절한 것을 모두 고르시오.`;
  }
  return negative ? `${head} 가장 적절하지 않은 것은?` : `${head} 가장 적절한 것은?`;
}

/** md 원문자 라벨 → 저장 숫자 문자열 라벨. ⑥~⑧(선지 6~8개)까지 덮는다. */
export function mainIdeaDigitLabel(label: string): string {
  const index = MAIN_IDEA_MD_LABELS.indexOf(label as (typeof MAIN_IDEA_MD_LABELS)[number]);
  return index >= 0 ? String(index + 1) : label;
}

export function adaptMdMainIdeaToAiQuestion(
  q: MdMainIdeaQuestion,
  _passage: string,
  difficulty: string,
  opts?: MainIdeaAdaptOptions,
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
    label: mainIdeaDigitLabel(option.label),
    text: option.text,
  }));
  // 저장 순서(라벨 순)로 정답을 정렬해 correctAnswer 문자열과 배열이 항상 같은 축이 된다.
  const answerLabels = q.options
    .filter((option) => answerSet.has(option.label))
    .map((option) => mainIdeaDigitLabel(option.label));

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
      label: mainIdeaDigitLabel(option.label),
      explanation: wrongByLabel.get(option.label) ?? "",
    }))
    .filter((row) => row.explanation.length > 0);

  const multi = answerLabels.length >= 2;
  return {
    ok: true,
    aiQuestion: {
      direction: buildMainIdeaMdDirection({
        stemAxis: q.stemAxis,
        negative: opts?.negative === true,
        multi,
        language: opts?.stemLanguage === "en" ? "en" : "ko",
      }),
      options,
      correctAnswer: answerLabels.join(", "),
      // 단일 정답에서는 correctAnswers 를 만들지 않는다 — fast 스키마도 K=1 이면
      // optional 이고(question-ai-schemas-mc.ts:814-820), 1원소 배열이 채점 명세
      // (answer-spec choiceSpec: 2개 이상일 때만 MULTI 승격)를 흔들 이유가 없다.
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
