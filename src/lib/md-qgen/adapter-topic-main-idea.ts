// ============================================================================
// 주제/요지(TOPIC_MAIN_IDEA) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-antonym.ts · adapter-order.ts / 계약: docs/md-qgen-type-expansion-spec.md
//
// ⚠ 이 유형은 PASSTHROUGH_TYPES(question-postprocess/types.ts:68-72)다 —
//   postProcessQuestion 이 지문 필드 합성도, 선지 재생성도, 라벨 재부여도 하지
//   않는다. 따라서 **어댑터가 완제품을 낸다.**
//    - 어댑터가 만든다: direction · options[](라벨 "1"~"N") · correctAnswer(들) ·
//      wrongOptionExplanations · explanation · keyPoints/tags/difficulty
//    - 후처리가 하는 일: wrongOptionExplanations 배열→Record 정규화와,
//      한국어 선지 유형 전용 정렬(index.ts:264-308 — 해설이 선지 텍스트를 담고
//      있지 않으면 "'<선지 텍스트>' 선택지는 …" 접두를 붙여 준다).
//      ⚠ 그 접두를 어댑터가 미리 붙이면 이중 접두가 된다 — 붙이지 마라.
//
// ⚠ 근거문장(evidence)은 **저장하지 않는다.** 게이트가 지문 정박을 검사하는 데만
//   쓰는 값이고, 스키마(question-schemas-mc.ts:134-141)에 없는 필드를 실어 보내면
//   유형 형상이 오염된다("어댑터는 순수 매핑" 규약).
// ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression·blankAnswerMode)는
//   금지 — validators/misc.ts:29 의 type-foreign-field 로 error 가 찍힌다.
// ============================================================================

import {
  TOPIC_MAIN_IDEA_MD_LABELS,
  buildTopicMainIdeaMdDirection,
  type MdGistMode,
  type MdGistPolarity,
} from "./prompts-topic-main-idea";
import type { MdTopicMainIdeaQuestion } from "./parser-topic-main-idea";
import type { MdLaneAdaptResult } from "./lane-types";

/**
 * 원문자 라벨 → 저장 축 숫자 문자열.
 * ⚠ 정본 adapter.ts 의 digitOptionLabel 을 쓰면 안 된다 — 그쪽 상수는 ①~⑤ 5개라
 *   6~8지선다(교사 설정 optionCount 최대 8)에서 원문자가 **그대로 통과**해
 *   선지 라벨과 정답 라벨이 서로 다른 축이 된다(채점 이탈). 로컬 변환을 쓴다.
 */
export function gistDigitLabel(label: string): string {
  const i = TOPIC_MAIN_IDEA_MD_LABELS.indexOf(
    label as (typeof TOPIC_MAIN_IDEA_MD_LABELS)[number],
  );
  return i >= 0 ? String(i + 1) : label;
}

export interface AdaptGistOptions {
  gistMode: MdGistMode;
  polarity: MdGistPolarity;
  /** 발문 언어(교사 설정) — 선지 언어는 gistMode 가 결정한다. */
  stemLanguage: "ko" | "en";
}

export function adaptMdTopicMainIdeaToAiQuestion(
  q: MdTopicMainIdeaQuestion,
  _passage: string,
  difficulty: string,
  opts: AdaptGistOptions,
): MdLaneAdaptResult {
  if (q.options.length < 2) {
    return { ok: false, error: `선지 ${q.options.length}개 (2개 이상 필요)` };
  }
  if (q.answers.length === 0) return { ok: false, error: "정답 누락" };
  const labelSet = new Set(q.options.map((o) => o.label));
  const missing = q.answers.filter((a) => !labelSet.has(a));
  if (missing.length > 0) {
    return { ok: false, error: `정답 라벨이 선지에 없음: ${missing.join(", ")}` };
  }
  if (q.answers.length >= q.options.length) {
    return { ok: false, error: "정답이 선지 전부 — 오답이 최소 1개는 있어야 한다" };
  }

  const options = q.options.map((o) => ({
    label: gistDigitLabel(o.label),
    text: o.text,
  }));
  const answerLabels = q.answers.map(gistDigitLabel);

  // 오답해설 라벨 축은 선지 라벨("1"~"N")과 맞춘다. 후처리가 라벨을 재부여하지
  // 않으므로 여기서 어긋나면 그대로 저장되어 카드·시험지에서 해설이 엉뚱한
  // 선지에 붙는다. 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이
  // 조용히 사라지므로(어댑터 직접 호출 경로 방어) 명시적으로 막는다.
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    if (wrongByLabel.has(w.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(w.label, w.text);
  }
  const answerSet = new Set(q.answers);
  const wrongOptionExplanations = q.options
    .filter((o) => !answerSet.has(o.label))
    .map((o) => ({
      label: gistDigitLabel(o.label),
      explanation: wrongByLabel.get(o.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: buildTopicMainIdeaMdDirection({
        gistMode: opts.gistMode,
        polarity: opts.polarity,
        answerCount: answerLabels.length,
        language: opts.stemLanguage,
      }),
      options,
      // 복수 정답은 correctAnswers 가 2개 이상일 때만 MULTI 로 승격된다
      // (exam-scoring/answer-spec.ts:127-135) — 단일 정답에서는 키를 만들지
      // 않아 기존 단일선택 채점 경로를 그대로 태운다.
      correctAnswer: answerLabels.join(", "),
      ...(answerLabels.length >= 2 ? { correctAnswers: answerLabels } : {}),
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
