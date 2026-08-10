// ============================================================================
// 내용 일치(CONTENT_MATCH) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-order.ts / 스키마: question-schemas-mc.ts contentMatchSchema ·
//       question-ai-schemas-mc.ts buildAiContentMatchSchema
//
// ⚠ 이 유형은 PASSTHROUGH_TYPES(question-postprocess/types.ts:74) 다 —
//   **후처리가 지문 필드도 라벨도 만들어 주지 않는다.** 공통 정규화 두 가지만 탄다:
//   ① wrongOptionExplanations 배열 → Record ② 한국어 가시선지 유형의 해설 앞에
//   선지 원문을 덧붙이는 정렬(index.ts alignWrongOptionExplanationsWithVisibleOptions).
//   따라서 **어댑터가 완제품을 낸다.**
//
//  - 어댑터가 만든다: direction · matchType · options[] · correctAnswer(·correctAnswers)
//    · wrongOptionExplanations · explanation · keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**
//
// ⚠ 발문·극성·정답 개수는 **교사 설정**에서 결정론으로 합성한다. 모델에게 되받지
//   않는 이유는 §1-B 철칙 1(한 정보는 한 곳에서만)이며, 실제 효과는
//   validators/content-match.ts 의 content-match-direction-polarity(error) 를
//   구조적으로 0 으로 만드는 것이다.
// ⚠ 빈칸·어법 계열 필드(blanks·passageWithBlank·passageWithMarkers·
//   originalExpression)를 흘리지 마라 — validators/misc.ts type-foreign-field.
// ============================================================================

import type { ContentMatchPolarity } from "@/lib/question-type-generation-settings";
import { normalizeWs } from "./parser";
import { cleanMdValue } from "./decoration";
import { type MdContentMatchQuestion } from "./parser-content-match";
import type { MdLaneAdaptResult } from "./lane-types";

export interface ContentMatchAdaptOptions {
  /** 교사 설정 극성. 발문·matchType 의 유일 결정원. */
  matchType: ContentMatchPolarity;
  /** 교사 설정 정답 개수. K>=2 면 "모두 고르기" 발문 + correctAnswers 배열. */
  answerCount: number;
  /** 발문 언어(교사 설정). 해설·오답 해설은 언제나 한국어다. */
  stemLanguage?: "ko" | "en";
}

/** DB 실물·기존 fast 산출과 동일한 발문 문형(사용자 표면 무변경). */
export function contentMatchDirection(
  matchType: ContentMatchPolarity,
  answerCount: number,
  stemLanguage: "ko" | "en" = "ko",
): string {
  const isMatch = matchType === "일치";
  if (stemLanguage === "en") {
    if (answerCount >= 2) {
      return isMatch
        ? "Choose all the statements that match the passage."
        : "Choose all the statements that do not match the passage.";
    }
    return isMatch
      ? "Which of the following matches the content of the passage?"
      : "Which of the following does NOT match the content of the passage?";
  }
  if (answerCount >= 2) {
    return isMatch
      ? "다음 글의 내용과 일치하는 것을 모두 고르시오."
      : "다음 글의 내용과 일치하지 않는 것을 모두 고르시오.";
  }
  return isMatch ? "다음 글의 내용과 일치하는 것은?" : "다음 글의 내용과 일치하지 않는 것은?";
}

/** md 원문자 라벨 → 저장 축("1"~"12"). 스키마·채점·렌더가 전부 숫자 문자열 축이다. */
function digitLabel(index: number): string {
  return String(index + 1);
}

export function adaptMdContentMatchToAiQuestion(
  q: MdContentMatchQuestion,
  _passage: string,
  difficulty: string,
  opts: ContentMatchAdaptOptions,
): MdLaneAdaptResult {
  if (q.options.length < 5 || q.options.length > 12) {
    return { ok: false, error: `선지 ${q.options.length}개 (5~12개 필요)` };
  }
  const answerCount = Math.max(1, Math.round(opts.answerCount));
  if (q.answers.length !== answerCount) {
    return { ok: false, error: `정답 ${q.answers.length}개 (${answerCount}개 필요)` };
  }
  const indexByLabel = new Map(q.options.map((o, i) => [o.label, i]));
  const answerIndices: number[] = [];
  for (const answer of q.answers) {
    const index = indexByLabel.get(answer);
    if (index === undefined) return { ok: false, error: `정답 라벨(${answer})이 선지에 없음` };
    answerIndices.push(index);
  }
  answerIndices.sort((a, b) => a - b);

  // ⚠ 표면으로 나가는 값은 **전부** cleanMdValue 를 통과한다. 이 유형은 PASSTHROUGH
  //   라 후처리가 씻어 주지 않으므로, 파서를 우회하는 직접 호출 경로(도구·재시도)로
  //   장식이 들어오면 그대로 학생 화면에 출하된다(`**진술문**` · `"진술문"`).
  const options = q.options.map((option, index) => ({
    label: digitLabel(index),
    text: cleanMdValue(option.text),
  }));
  if (options.some((o) => !o.text)) return { ok: false, error: "진술문 누락" };

  // 근거 문장은 오답 해설에 붙여 교사 표면으로 내보낸다 — 이 유형의 해설은
  // "왜 그렇게 판정되는가"의 출처(지문 문장)가 있어야 검토가 가능하다.
  // (정답 자리의 근거는 게이트가 축자 대조로 이미 소비했고, 해설 2문장이 그 자리를
  //  서술하므로 중복 주입하지 않는다 — 철칙 1.)
  // 근거만은 cleanMdValue 를 통과시키지 않는다 — 게이트가 이미 **지문 축자**임을
  // 확정한 값이고, 지문 문장 자체가 따옴표에 싸여 있으면(`"Green corridors …"`)
  // 감싼 한 겹을 벗기는 순간 인용이 지문과 어긋난다. 파서 단계에서 이미 씻겼다.
  const evidenceByLabel = new Map(q.evidence.map((e) => [e.label, e.sentence.trim()]));
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    // 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이 조용히 사라진다.
    // 게이트가 먼저 막지만 어댑터 단독 호출 경로(도구·재시도)에서도 막는다.
    if (wrongByLabel.has(w.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(w.label, cleanMdValue(w.text));
  }
  const wrongOptionExplanations = q.options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !q.answers.includes(option.label))
    .map(({ option, index }) => {
      const rationale = wrongByLabel.get(option.label) ?? "";
      const evidence = evidenceByLabel.get(option.label) ?? "";
      const withEvidence =
        rationale && evidence && !normalizeWs(rationale).includes(normalizeWs(evidence))
          ? `${rationale} (근거: "${evidence}")`
          : rationale;
      return { label: digitLabel(index), explanation: withEvidence };
    })
    .filter((w) => w.explanation.length > 0);

  const correctLabels = answerIndices.map((index) => digitLabel(index));
  return {
    ok: true,
    aiQuestion: {
      direction: contentMatchDirection(opts.matchType, answerCount, opts.stemLanguage),
      matchType: opts.matchType,
      options,
      correctAnswer: correctLabels.join(", "),
      // K=1 은 구형 저장 형상 그대로 correctAnswer 단독(스키마의 correctAnswers 는
      // optional). K>=2 에서만 배열을 함께 실어 채점·셔플이 라벨 집합으로 돈다.
      ...(answerCount >= 2 ? { correctAnswers: correctLabels } : {}),
      wrongOptionExplanations,
      explanation: cleanMdValue(q.explanation),
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
