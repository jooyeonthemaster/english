// ============================================================================
// 지칭 추론(REFERENCE) 어댑터 — md 파싱 결과 → processReference 가 받는 AI 문항 형상.
// 견본: adapter-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §1[7]
//
// 경계 계약(processors/reference.ts 실측 — 후처리는 단 한 가지 일만 한다):
//  - 어댑터가 만든다: direction · underlinedPronoun · surroundingText · options
//    (라벨 "1"~"5") · correctAnswer(숫자 문자열) · wrongOptionExplanations ·
//    explanation · keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithUnderline(`__pronoun__`) — **그것뿐**이다.
//    (index.ts 공통 정규화가 wrongOptionExplanations 배열→Record 변환과
//     한국어 선지 문구 정렬을 추가로 수행한다.)
//
//  ⚠ passageWithUnderline 을 어댑터가 만들면 후처리와 이중 생성이 되어 충돌한다.
//  ⚠ surroundingText 가 이 유형의 생명줄이다. 후처리는
//    findWordInPassage(..., strictContext=true) 로 **창 안의 첫 단어경계 일치**를
//    밑줄 처리하므로, 창이 우리 자리를 첫 등장으로 담고 있지 않으면 같은 대명사의
//    엉뚱한 출현에 밑줄이 그어진다. 창 계산은 parser-reference 의
//    buildReferenceContext 하나에 몰아두고 게이트와 공유한다.
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리면
//    validators/misc.ts 의 type-foreign-field 로 error 가 찍힌다 — 넣지 마라.
// ============================================================================

import { digitOptionLabel } from "./adapter";
import {
  buildReferenceContext,
  locateReferenceTarget,
  referenceTargetOf,
  type MdReferenceQuestion,
} from "./parser-reference";
import type { MdLaneAdaptResult } from "./lane-types";

/** 발문 — 표적 대명사를 인용한다. 소유격 조사 `의` 는 이형태가 없어 어떤 영단어 뒤에도 안전하다. */
export function buildReferenceDirection(pronoun: string): string {
  const target = pronoun.trim();
  if (!target) return "다음 글의 밑줄 친 부분이 가리키는 대상으로 가장 적절한 것은?";
  return `다음 글의 밑줄 친 '${target}'의 지칭 대상으로 가장 적절한 것은?`;
}

/** 발문(영어 설정) — 선지·해설은 한국어 구조 계약 그대로 유지된다. */
export function buildReferenceDirectionEn(pronoun: string): string {
  const target = pronoun.trim();
  if (!target) return "What does the underlined part in the passage refer to?";
  return `What does the underlined '${target}' in the passage refer to?`;
}

export function adaptMdReferenceToAiQuestion(
  q: MdReferenceQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (q.options.length !== 5) {
    return { ok: false, error: `선지 ${q.options.length}개 (5개 필요)` };
  }
  const answerOption = q.options.find((o) => o.label === q.answer);
  if (!answerOption) return { ok: false, error: "정답 라벨이 선지에 없음" };

  const target = referenceTargetOf(q.markedSentence);
  if (target.markCount !== 1 || !target.pronoun) {
    return { ok: false, error: `밑줄 마커 ${target.markCount}개 (정확히 1개 필요)` };
  }
  const loc = locateReferenceTarget(passage, target);
  if (!loc) return { ok: false, error: "밑줄문장이 지문에 축자로 없음" };

  // 대명사는 **원문 축자**를 싣는다(모델이 소문자로 적어도 지문의 대소문자 유지) —
  // 후처리가 `__${underlinedPronoun}__` 로 치환하므로 원문과 어긋나면 밑줄 구간의
  // 글자가 바뀌어 저장된다.
  const pronoun = passage.slice(loc.index, loc.index + loc.length);
  const surroundingText = buildReferenceContext(passage, loc.index, loc.length);

  const wrongByLabel = new Map(q.wrong.map((w) => [w.label, w.text]));
  const wrongOptionExplanations = q.options
    .filter((o) => o.label !== q.answer)
    .map((o) => ({
      label: digitOptionLabel(o.label),
      explanation: wrongByLabel.get(o.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: buildReferenceDirection(pronoun),
      underlinedPronoun: pronoun,
      surroundingText,
      options: q.options.map((o) => ({
        label: digitOptionLabel(o.label),
        text: o.text,
      })),
      correctAnswer: digitOptionLabel(q.answer),
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
