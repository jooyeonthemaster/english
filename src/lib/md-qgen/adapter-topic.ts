// ============================================================================
// 주제 추론(TOPIC) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-antonym.ts · adapter-order.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// ⚠ 경계 계약: TOPIC 은 **PASSTHROUGH_TYPES**(question-postprocess/types.ts:70)라
//   후처리가 지문 필드를 만들지도, 선지를 재생성하지도, 라벨을 재부여하지도 않는다.
//   공통 정규화 두 가지만 탄다 —
//     ① wrongOptionExplanations 배열 → Record (question-wrong-option-explanations)
//     ② TOPIC 은 VISIBLE_KOREAN_OPTION_TYPES 라, 오답 해설이 선지 문구를 포함하지
//        않으면 후처리가 `'{선지}' 선택지는 {해설}` 형태로 앞머리를 붙인다
//        (question-postprocess/index.ts:303). 그래서 오답 해설은 **그 앞머리에
//        이어 붙여도 자연스러운 서술**로 쓰게 프롬프트가 지시한다.
//   → 즉 **어댑터가 완제품을 낸다.** 여기서 어긋난 것은 아무도 고쳐 주지 않는다.
//
//  - 어댑터가 만든다: direction · options[] · correctAnswer(+correctAnswers) ·
//    wrongOptionExplanations · explanation · keyPoints/tags/difficulty
//  - 후처리가 만드는 것: 없음(위 공통 정규화 2건 제외)
//
// ⚠ 라벨 축은 **숫자 문자열 "1"~"N"** 이다(topicSchema optionSchema + DB 실물).
//    md 의 ①~⑧ 은 내부 축일 뿐이고, 학생 표면의 원문자는 렌더러가 붙인다.
// ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression·blankAnswerMode)를
//    흘리면 validators/misc.ts TYPE_SIGNATURE_FOREIGN_FIELDS.TOPIC 이 error 로 찍는다.
//    지문 필드(passageWith*)도 만들지 마라 — 이 유형은 지문을 변형하지 않는다.
// ============================================================================

import { TOPIC_PARSE_LABELS, topicLabelIndex, type MdTopicQuestion } from "./parser-topic";
import type { MdLaneAdaptResult } from "./lane-types";

/** md 선지 라벨(①~⑧) → 저장 라벨("1"~"8"). 해석 불가는 빈 문자열. */
export function topicDigitLabel(label: string): string {
  const index = topicLabelIndex(label);
  return index >= 0 ? String(index + 1) : "";
}

export function adaptMdTopicToAiQuestion(
  q: MdTopicQuestion,
  _passage: string,
  difficulty: string,
  opts: { direction: string },
): MdLaneAdaptResult {
  if (q.options.length < 4 || q.options.length > TOPIC_PARSE_LABELS.length) {
    return { ok: false, error: `선지 ${q.options.length}개 (4~8개 필요)` };
  }
  if (q.answers.length === 0) return { ok: false, error: "정답 라벨 누락" };

  // 라벨 축 확정 — 배열 순서가 아니라 **원문자 라벨**이 자리를 정한다(직접 호출
  // 경로에서 순서가 흔들려도 저장 라벨이 어긋나지 않게).
  const ordered = [...q.options].sort(
    (a, b) => topicLabelIndex(a.label) - topicLabelIndex(b.label),
  );
  const options: { label: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const o of ordered) {
    const label = topicDigitLabel(o.label);
    if (!label) return { ok: false, error: `선지 라벨을 해석할 수 없음: '${o.label}'` };
    if (seen.has(label)) {
      return { ok: false, error: `선지 라벨 중복(${o.label}) — 저장 라벨이 겹친다` };
    }
    if (!o.text.trim()) return { ok: false, error: `${o.label} 선지 텍스트 누락` };
    seen.add(label);
    options.push({ label, text: o.text.trim() });
  }

  const answerLabels: string[] = [];
  for (const a of [...q.answers].sort((x, y) => topicLabelIndex(x) - topicLabelIndex(y))) {
    const label = topicDigitLabel(a);
    if (!label || !seen.has(label)) {
      return { ok: false, error: `정답 라벨(${a})이 선지에 없음` };
    }
    if (!answerLabels.includes(label)) answerLabels.push(label);
  }

  // 오답 해설 라벨 축도 선지 라벨("1"~"N")과 맞춘다. 후처리가 없으므로 여기서
  // 어긋나면 그대로 저장되어 카드·시험지에서 해설이 엉뚱한 선지에 붙는다.
  // ⚠ 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이 조용히 사라진다 —
  //   게이트가 먼저 막지만 어댑터 직접 호출 경로에서도 조용한 소실이 없게 막는다.
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    if (wrongByLabel.has(w.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(w.label, w.text);
  }
  const wrongOptionExplanations = ordered
    .filter((o) => !q.answers.includes(o.label))
    .map((o) => ({
      label: topicDigitLabel(o.label),
      explanation: (wrongByLabel.get(o.label) ?? "").trim(),
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: opts.direction,
      options,
      // 복수 정답이면 스키마 계약대로 배열도 함께 싣는다(", " join 문자열 + 배열).
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
