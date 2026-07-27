// ============================================================================
// 반의어(ANTONYM) 어댑터 — md 파싱 결과 → processAntonym 이 받는 AI 문항 형상.
// 【신규 유형 승차의 견본(EXEMPLAR)】
//
// 경계 계약(processors/antonym.ts 실측):
//  - 어댑터가 만든다: markedWords[](label·word·antonym·isIncorrectPair·
//    correctAntonym·surroundingText) · correctAnswer(숫자 문자열) ·
//    wrongOptionExplanations · direction · explanation · keyPoints/tags/difficulty
//  - 후처리가 만든다: passageWithMarkers(`__(A) word__`) · options 전량 재생성 ·
//    라벨 정규화 · 정답 인덱스 재부여
//  ⚠ 라벨 축은 **"(A)" 대문자 고정**이다. ① 로 내면 validators/antonym.ts 와
//    question-sets/anchor-extraction.ts 가 기존 DB 문항과 함께 깨진다.
//    학생 표면의 ① 변환은 표시 계층(option-display.ts)이 담당한다.
//  ⚠ 빈칸 계열 필드(blanks·passageWithBlank·originalExpression)를 흘리면
//    validators/misc.ts 의 type-foreign-field 로 error 가 찍힌다 — 넣지 마라.
// ============================================================================

import { contextAround } from "./adapter";
import { normalizeWs } from "./parser";
import {
  INLINE_ANTONYM_MARK_RE,
  type MdAntonymQuestion,
} from "./parser-antonym";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const ANTONYM_MD_DIRECTION =
  "지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?";

export function adaptMdAntonymToAiQuestion(
  q: MdAntonymQuestion,
  passage: string,
  difficulty: string,
): MdLaneAdaptResult {
  if (q.pairs.length < 5 || q.pairs.length > 10) {
    return { ok: false, error: `어휘쌍 ${q.pairs.length}개 (5~10개 필요)` };
  }
  // 정답의 진실원은 `정답:` 줄 하나다(어법 정본과 동일 — 줄마다 O/X 를 받던
  // 중복 계약은 26-07-26 실사용 반려 2연속의 원인이라 제거했다).
  const incorrectIndex = q.pairs.findIndex((p) => p.label === q.answer);
  if (incorrectIndex < 0) return { ok: false, error: "정답 라벨이 어휘쌍에 없음" };

  // 밑줄지문에서 마커를 걷어내며 각 마커의 "깨끗한 지문" 내 위치를 계산한다 —
  // 정본 adaptMdGrammarToAiQuestion 의 재구성 위치추적과 동일 기법.
  const positions = new Map<string, { index: number; length: number }>();
  let clean = "";
  let cursor = 0;
  for (const m of q.markedPassage.matchAll(INLINE_ANTONYM_MARK_RE)) {
    const label = `(${m[1]})`;
    const shown = m[2];
    clean += q.markedPassage.slice(cursor, m.index);
    positions.set(label, { index: clean.length, length: shown.length });
    clean += shown;
    cursor = (m.index ?? 0) + m[0].length;
  }
  clean += q.markedPassage.slice(cursor);
  // 재구성본이 원문과 정합할 때만 그 좌표를 쓴다(게이트가 이미 검사하지만,
  // 어댑터 단독 호출·드리프트 대비 이중 방어).
  const useClean = clean.length > 0 && normalizeWs(clean) === normalizeWs(passage);
  const source = useClean ? clean : passage;

  const markedWords = q.pairs.map((p) => {
    const pos = positions.get(p.label);
    let index = useClean && pos ? pos.index : passage.indexOf(p.word);
    let length = pos?.length ?? p.word.length;
    if (index < 0) {
      index = -1;
      length = p.word.length;
    }
    return {
      label: p.label,
      word: p.word,
      antonym: p.antonym,
      isIncorrectPair: p.label === q.answer,
      ...(p.label === q.answer && q.correctAntonym
        ? { correctAntonym: q.correctAntonym }
        : {}),
      // 위치 확정 실패 시 빈 문자열 — 후처리 findWordInPassage 의 단어경계
      // 폴백에 맡긴다(정본 규약: 엉뚱한 좌표를 넘기느니 비운다).
      surroundingText: index >= 0 ? contextAround(source, index, length) : "",
    };
  });

  // 오답해설 라벨 축은 후처리가 재생성하는 **선지 라벨("1"~"N")** 과 맞춘다.
  const wrongByLabel = new Map(q.wrong.map((w) => [w.label, w.text]));
  const wrongOptionExplanations = q.pairs
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.label !== q.answer)
    .map(({ p, i }) => ({
      label: String(i + 1),
      explanation: wrongByLabel.get(p.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction: ANTONYM_MD_DIRECTION,
      markedWords,
      // processAntonym 은 correctAnswer 를 오류쌍 인덱스와 대조한 뒤 재부여한다.
      correctAnswer: String(incorrectIndex + 1),
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
