// ============================================================================
// 무관한 문장(IRRELEVANT) 어댑터 — md 파싱 결과 → processIrrelevant 가 받는 AI 형상.
// 견본(EXEMPLAR): adapter-antonym.ts
//
// 경계 계약(question-postprocess/processors/irrelevant.ts 실측):
//  - 어댑터가 만든다: direction · sentences[] · irrelevantIndex ·
//    correctAnswer(숫자 문자열) · wrongOptionExplanations · explanation ·
//    keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithNumbers(원문 위치에 ①~⑩ + `__밑줄__` 렌더) ·
//    options 전량 재생성(라벨=텍스트=원문자) · correctAnswer 재부여 ·
//    wrongOptionExplanations 원문자 키 정렬 · 엣지 재배치 · 축자 스냅
//  ⚠ `options` 와 `passageWithNumbers` 를 **만들지 마라** — 후처리가 전량
//    재생성하므로 이중 생성이고, 어긋나면 마킹 desync 검증기가 error 를 찍는다.
//  ⚠ `sentences[]` 는 무관 문장을 포함한 번호 순서 그대로다(지문 등장 순).
//    비정답은 지문 축자여야 한다 — 게이트가 이미 보증한 상태로 들어온다.
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리지 마라.
// ============================================================================

import type { MdIrrelevantQuestion } from "./parser-irrelevant";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const IRRELEVANT_MD_DIRECTION = "다음 글에서 전체 흐름과 관계 없는 문장은?";

export const IRRELEVANT_ADAPT_SLOT_MIN = 5;
export const IRRELEVANT_ADAPT_SLOT_MAX = 10;

export function adaptMdIrrelevantToAiQuestion(
  q: MdIrrelevantQuestion,
  _passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (
    q.slots.length < IRRELEVANT_ADAPT_SLOT_MIN ||
    q.slots.length > IRRELEVANT_ADAPT_SLOT_MAX
  ) {
    return {
      ok: false,
      error: `번호 문장 ${q.slots.length}개 (${IRRELEVANT_ADAPT_SLOT_MIN}~${IRRELEVANT_ADAPT_SLOT_MAX}개 필요)`,
    };
  }
  // 정답의 진실원은 `정답:` 줄 하나다(마커에 O/X 를 받는 중복 계약을 만들지 않았다).
  const irrelevantIndex = q.slots.findIndex((s) => s.label === q.answer);
  if (irrelevantIndex < 0) {
    return { ok: false, error: "정답 번호가 번호 문장에 없음" };
  }
  // 첫/마지막 슬롯이면 후처리가 가운데로 강제 이동시키며 경고를 남긴다 —
  // 그 재배치는 md 설계(무관 문장이 물려 있는 자리)를 깨므로 여기서 막는다.
  if (irrelevantIndex === 0 || irrelevantIndex === q.slots.length - 1) {
    return { ok: false, error: "정답이 첫/마지막 번호 — 무관 문장은 가운데여야 한다" };
  }
  const sentences = q.slots.map((s) => s.text);
  if (sentences.some((s) => !s.trim())) {
    return { ok: false, error: "빈 번호 문장이 있음" };
  }

  // 오답해설 라벨 축은 후처리가 읽는 **숫자 문자열("1"~"N")** 이다
  // (alignIrrelevantWrongOptionExplanations 가 String(index+1) 로 조회한 뒤
  //  원문자 키로 재정렬한다). 원문자로 내면 조회가 빗나가 기본 문구로 덮인다.
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    if (!wrongByLabel.has(w.label)) wrongByLabel.set(w.label, w.text);
  }
  const wrongOptionExplanations = q.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ index }) => index !== irrelevantIndex)
    .map(({ slot, index }) => ({
      label: String(index + 1),
      explanation: wrongByLabel.get(slot.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: IRRELEVANT_MD_DIRECTION,
      sentences,
      irrelevantIndex,
      // 후처리가 irrelevantIndex 로 재정렬하지만, 어긋나면 경고를 남기므로 맞춰 보낸다.
      correctAnswer: String(irrelevantIndex + 1),
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
