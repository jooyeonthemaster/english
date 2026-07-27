// ============================================================================
// 글의 순서(SENTENCE_ORDER) 어댑터 — md 파싱 결과 → 저장 AI 문항 형상.
// 견본: adapter-antonym.ts / 필드표: docs/md-qgen-recon-synthesis.md §3-C6
//
// ⚠ 경계 계약이 다른 유형과 근본적으로 다르다: SENTENCE_ORDER 는
//   PASSTHROUGH_TYPES(question-postprocess/types.ts:67) 라 **후처리가 전혀 없다.**
//   postProcessQuestion 은 라벨 재부여도, 선지 재생성도, 지문 필드 합성도 하지
//   않고 그대로 통과시킨다(공통 정규화 두 가지만 탄다 —
//   wrongOptionExplanations 배열→Record, options 는 이 유형에서 무변경).
//   따라서 **어댑터가 완제품을 낸다.**
//
//  - 어댑터가 만든다(= 최종 저장 형상): direction · givenSentence · paragraphs[]
//    · options[] · correctAnswer · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**
//
// ⚠ paragraphs[].label 은 반드시 리터럴 "(A)"/"(B)"/"(C)" 다.
//    · validators/sentence-order.ts:151 이 rawLabel 축자 대조로 반려한다
//    · DOCX 역파싱(question-body-layout.ts:286 sentenceOrderSegmentsFromQuestionText)
//      은 buildGeneratedQuestionText 가 만든 "(A) 본문" 줄을 다시 쪼갠다 —
//      라벨 문자열이 다르면 **화면은 멀쩡한데 인쇄물만 깨진다**(정찰 R6).
// ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)나 passageWith*
//    계열을 흘리지 마라 — validators/misc.ts 의 type-foreign-field 로 찍힌다.
// ============================================================================

import { digitOptionLabel } from "./adapter";
import {
  orderDisplayParagraphs,
  orderPermutationText,
  type MdOrderQuestion,
} from "./parser-order";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const SENTENCE_ORDER_MD_DIRECTION =
  "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?";

export function adaptMdSentenceOrderToAiQuestion(
  q: MdOrderQuestion,
  _passage: string,
  difficulty: string,
  /**
   * 단락 변형(prefixVariationCount>=1)이면 변형본이 있는 라벨은 **변형본을** 싣는다.
   * 축자 줄(q.paragraphs[].text)은 게이트가 무손실 분할·정답 도출을 검사하는 데 쓰이고,
   * 학생 표면·저장 형상은 이 함수가 고른 쪽이다 — 이 2단 분리가 "첫 문장 패러프레이즈
   * 지시 ↔ 축자 게이트" 자기모순(정찰 X3)의 해법이다.
   * givenSentence 는 어떤 모드에서도 축자다(변형은 단락에만 건다).
   */
  paragraphMode: "SOURCE_EXACT" | "PARAGRAPH_VARIANT" = "SOURCE_EXACT",
): MdLaneAdaptResult {
  if (q.paragraphs.length !== 3) {
    return { ok: false, error: `단락 ${q.paragraphs.length}개 (3개 필요)` };
  }
  const expected = ["(A)", "(B)", "(C)"];
  if (q.paragraphs.map((p) => p.label).join("") !== expected.join("")) {
    return { ok: false, error: "단락 라벨이 (A)(B)(C) 순서가 아님" };
  }
  if (q.options.length !== 5 || q.options.some((o) => o.order.length !== 3)) {
    return { ok: false, error: "선지 5개 · (A)(B)(C) 순열이 아님" };
  }
  const answerIndex = q.options.findIndex((o) => o.label === q.answer);
  if (answerIndex < 0) return { ok: false, error: "정답 라벨이 선지에 없음" };

  if (!q.given) return { ok: false, error: "주어진 글 누락" };
  // 변형본이 있는 라벨만 갈아 끼운다(없으면 축자). 라벨 순서·개수 계약은 게이트 #11 이
  // 이미 집행했고, 여기서는 "있으면 표시본, 없으면 축자"라는 결정만 한다.
  // ⚠ 선택 로직은 orderDisplayParagraphs **한 곳**에만 둔다 — 게이트의 표시면 재집행
  //   (#4·#5·#10)과 여기가 어긋나면 검사한 면과 저장되는 면이 달라진다.
  const paragraphs =
    paragraphMode === "PARAGRAPH_VARIANT"
      ? orderDisplayParagraphs(q)
      : q.paragraphs.map((p) => ({ label: p.label, text: p.text }));
  if (paragraphs.some((p) => !p.text)) return { ok: false, error: "단락 본문 누락" };

  // 선지 텍스트는 모델 원문이 아니라 파싱된 순열에서 결정론 재조립한다 —
  // 저장 문자열이 항상 parseSentenceOrderPermutation(검증기·렌더러 공용) 과
  // 1:1 로 맞물리고, 모델이 붙인 사족(근거 문구)이 선지에 새지 않는다.
  const options = q.options.map((o) => ({
    label: digitOptionLabel(o.label),
    text: orderPermutationText(o.order),
  }));

  // 오답해설 라벨 축은 선지 라벨("1"~"5") 과 맞춘다. 후처리가 없으므로 여기서
  // 어긋나면 그대로 저장되어 카드·시험지에서 해설이 엉뚱한 선지에 붙는다.
  // ⚠ 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이 조용히 사라지고
  //   1건은 엉뚱한 내용으로 덮인다. 게이트 #12 가 집합 검사로 먼저 막지만, 어댑터를
  //   직접 부르는 경로(재시도·도구)에서도 조용한 소실이 없도록 여기서 한 번 더 막는다.
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    if (wrongByLabel.has(w.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(w.label, w.text);
  }
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
      direction: SENTENCE_ORDER_MD_DIRECTION,
      givenSentence: q.given,
      paragraphs,
      options,
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
