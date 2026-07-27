// ============================================================================
// 문장 삽입(SENTENCE_INSERT) 어댑터 — md 파싱 결과 → processSentenceInsert 가 받는
// AI 문항 형상. 견본: adapter-antonym.ts
//
// 경계 계약(processors/sentence-insert.ts 실측):
//  - 어댑터가 만든다: direction · givenSentence · sourceSentenceToOmit ·
//    markerAfterSentenceIndices · correctAnswer · wrongOptionExplanations ·
//    explanation · keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithMarkers(원 지문에서 빼낸 문장을 지우고 ①②③ 렌더) ·
//    options 전량(buildCanonicalSentenceInsertOptions) · omittedSourceSentence(Index) ·
//    correctAnswer 재키잉(추출 자리 기준)
//  ⚠ options 를 만들어 넘기지 마라 — 후처리가 "Ignored AI-provided options" 경고와
//    함께 통째로 버린다(경고 노이즈만 남는다).
//  ⚠ passageWithMarkers 를 만들지 마라 — 후처리 전담이고, 이중 생성은 충돌한다.
//  ⚠ 빈칸·어법 계열 필드(blanks·passageWithBlank·markedWords)를 흘리면
//    validators/misc.ts 의 type-foreign-field 로 error 가 찍힌다.
//
// 좌표 축 계약(핵심):
//   markerAfterSentenceIndices 는 **원 지문**(빼낸 문장을 포함한) 문장 배열 기준
//   0-based 인덱스다. 후처리가 추출 인덱스로 −1 보정해 표시 좌표로 되돌린다
//   (adjustMarkerIndicesForOmission). md 는 표시 좌표에서 계산하므로 여기서
//   역보정(+1)해 넘긴다 — 두 보정이 정확히 상쇄된다.
// ============================================================================

import {
  INSERT_CIRCLED,
  computeInsertLayout,
  insertMarkerOrdinal,
  type MdInsertQuestion,
} from "./parser-sentence-insert";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const SENTENCE_INSERT_MD_DIRECTION =
  "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?";

/** md 자리 라벨(①~⑧) → 저장 축("1"~"8"). 정본 digitOptionLabel 은 ⑤까지라 로컬 확장. */
function insertDigitLabel(label: string): string {
  const i = INSERT_CIRCLED.indexOf(label);
  return i >= 0 ? String(i + 1) : label;
}

export function adaptMdSentenceInsertToAiQuestion(
  q: MdInsertQuestion,
  passage: string,
  difficulty: string,
  /**
   * paraphrasePrefix 설정이면 학생 표시면은 **변형본**이고, 서버가 지문에서 지울
   * 문장은 **축자**다. 두 값을 분리해 싣기 때문에 "패러프레이즈 지시 ↔ 축자 대조"
   * 자기모순이 생기지 않는다(순서 유형 2단 출력과 같은 해법).
   */
  givenMode: "SOURCE_EXACT" | "PREFIX_VARIANT" = "SOURCE_EXACT",
): MdLaneAdaptResult {
  if (!q.given) return { ok: false, error: "삽입문장 누락" };
  if (!q.numberedPassage) return { ok: false, error: "번호지문 누락" };

  const layout = computeInsertLayout(q, passage);
  if (layout.marks.length < 5 || layout.marks.length > 8) {
    return { ok: false, error: `삽입 자리 마커 ${layout.marks.length}개 (5~8개 필요)` };
  }
  if (layout.omittedIndex < 0) {
    return { ok: false, error: "번호지문이 원 지문에서 문장 하나를 뺀 형태가 아님" };
  }
  if (layout.omittedIndex === 0) {
    return { ok: false, error: "지문의 첫 문장은 빼낼 수 없음" };
  }

  const answerOrdinal = insertMarkerOrdinal(q.answer);
  if (answerOrdinal < 0 || answerOrdinal >= layout.marks.length) {
    return { ok: false, error: `정답 라벨(${q.answer || "없음"})이 자리 마커 범위 밖` };
  }

  // 표시 좌표 → 원 지문 좌표 역보정. 후처리가 다시 −1 해서 표시 좌표로 되돌린다.
  const seen = new Set<number>();
  const markerAfterSentenceIndices: number[] = [];
  for (const mark of layout.marks) {
    const display = layout.afterDisplayIndex[mark.ordinal];
    if (display < 0) {
      return {
        ok: false,
        error: `자리 마커 [[${mark.ordinal + 1}]] 이 문장 경계가 아님`,
      };
    }
    if (seen.has(display)) {
      return { ok: false, error: `자리 마커 [[${mark.ordinal + 1}]] 이 앞 마커와 같은 자리` };
    }
    seen.add(display);
    markerAfterSentenceIndices.push(
      display < layout.omittedIndex ? display : display + 1,
    );
  }
  // 추출 자리에 마커가 없으면 후처리가 정답을 매기지 못하고 하드 실패한다.
  if (!seen.has(layout.omittedIndex - 1)) {
    return { ok: false, error: "빼낸 문장이 있던 자리에 마커가 없음" };
  }

  const sourceSentence = layout.sentences[layout.omittedIndex];
  const displayedGiven =
    givenMode === "PREFIX_VARIANT" && q.givenVariant ? q.givenVariant : q.given;

  // 오답해설 라벨 축은 후처리가 만드는 **선지 라벨("1"~"N")** 과 맞춘다.
  // ⚠ 중복 라벨을 Map 에 그냥 넣으면 마지막 값이 이겨 해설 1건이 조용히 사라진다.
  //   게이트가 먼저 막지만, 어댑터를 직접 부르는 경로에서도 소실이 없도록 여기서 차단.
  const wrongByLabel = new Map<string, string>();
  for (const w of q.wrong) {
    if (wrongByLabel.has(w.label)) {
      return { ok: false, error: `오답해설 라벨 중복(${w.label}) — 해설이 덮어써진다` };
    }
    wrongByLabel.set(w.label, w.text);
  }
  const wrongOptionExplanations = layout.marks
    .map((mark) => INSERT_CIRCLED[mark.ordinal])
    .filter((label) => label && label !== q.answer)
    .map((label) => ({
      label: insertDigitLabel(label),
      explanation: wrongByLabel.get(label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: SENTENCE_INSERT_MD_DIRECTION,
      givenSentence: displayedGiven,
      // 후처리가 지문에서 지울 문장 — 반드시 **원 지문 축자**여야 exact 매칭된다.
      sourceSentenceToOmit: sourceSentence,
      markerAfterSentenceIndices,
      // 후처리가 추출 자리 기준으로 재키잉하지만, md 는 이미 결정형으로 같은 값을
      // 계산해 두므로 재키잉 경고가 뜨지 않는 것이 정상이다.
      correctAnswer: String(answerOrdinal + 1),
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
