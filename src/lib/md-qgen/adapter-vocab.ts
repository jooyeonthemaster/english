// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) 어댑터 — md 파싱 결과 → processVocabChoice 가 받는
// AI 문항 형상. 견본: adapter-antonym.ts.
//
// ── 후처리 경계 계약 (processors/vocab-choice.ts 실측) ─────────────────────
//  어댑터가 만든다(최소 입력):
//    direction · markedWords[](label·originalWord·substituteWord·isInappropriate·
//    betterWord(정답만)·surroundingText) · options[](label "(a)"·text 표시어) ·
//    vocabDisplayMode · correctAnswer/correctAnswers · wrongOptionExplanations ·
//    explanation · keyPoints(빈 배열) · tags · difficulty
//  후처리가 만든다(어댑터가 절대 만들지 않는다 — 이중 생성은 충돌한다):
//    passageWithMarkers(`__(a) word__` 재조립, :299) ·
//    options 라벨 숫자 재부여 + text 강제 덮어쓰기(:303-316) ·
//    correctAnswer 숫자 문자열 재부여(:322) · markedWords 정규화(:257-264) ·
//    wrongOptionExplanations 배열→Record 정규화(index.ts:167)
//
//  ⚠ markedWords[].label 저장 축은 **소문자 "(a)" 고정**이다. 숫자·원문자로 내면
//    processVocabChoice 의 normalizeVocabKey 와 validators/vocab.ts 의 렌더 대조가
//    기존 DB 문항과 함께 어긋난다. 학생 표면의 ①~⑩ 변환은 표시 계층
//    (option-display.ts formatVocabChoiceUnderlineContent)이 담당한다.
//  ⚠ 빈칸·어법 계열 필드(blanks·passageWithBlank·originalExpression·
//    markedExpressions)를 흘리면 validators/misc.ts 의 type-foreign-field 로
//    error 가 찍힌다 — 넣지 마라.
// ============================================================================

import { contextAround } from "./adapter";
import { normalizeWs } from "./parser";
import { INLINE_VOCAB_MARK_RE, type MdVocabQuestion } from "./parser-vocab";
import {
  VOCAB_MD_MARKER_COUNT_MAX,
  VOCAB_MD_MARKER_COUNT_MIN,
} from "./prompts-vocab";
import type { MdLaneAdaptResult } from "./lane-types";

/** DB 실물·기존 fast 산출과 동일한 발문(사용자 표면 무변경). */
export const VOCAB_MD_DIRECTION_SINGLE =
  "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?";

/** K≥2 발문 — 개수를 노출하지 않고 "모두" 로 묶는다(설정 프롬프트 계약과 동기). */
export const VOCAB_MD_DIRECTION_MULTI =
  "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것을 모두 고르시오.";

export function adaptMdVocabToAiQuestion(
  q: MdVocabQuestion,
  passage: string,
  difficulty: string,
  synonymVariants: boolean,
): MdLaneAdaptResult {
  if (
    q.marks.length < VOCAB_MD_MARKER_COUNT_MIN ||
    q.marks.length > VOCAB_MD_MARKER_COUNT_MAX
  ) {
    return {
      ok: false,
      error: `밑줄 ${q.marks.length}개 (${VOCAB_MD_MARKER_COUNT_MIN}~${VOCAB_MD_MARKER_COUNT_MAX}개 필요)`,
    };
  }
  if (q.answers.length === 0) return { ok: false, error: "정답 누락" };
  const answerSet = new Set(q.answers);
  for (const label of answerSet) {
    if (!q.marks.some((m) => m.label === label)) {
      return { ok: false, error: `정답 라벨(${label})이 밑줄에 없음` };
    }
  }

  // 밑줄지문에서 마커를 **원형으로** 되돌리며 각 자리의 "깨끗한 지문" 내 위치를
  // 계산한다 — 정본 adaptMdGrammarToAiQuestion 의 재구성 위치추적과 동일 기법.
  // 표시어가 아니라 원형으로 되돌려야 좌표가 원 지문과 일치한다.
  const positions = new Map<string, { index: number; length: number }>();
  const originalByLabel = new Map(q.marks.map((m) => [m.label, m.original]));
  let clean = "";
  let cursor = 0;
  for (const m of q.markedPassage.matchAll(INLINE_VOCAB_MARK_RE)) {
    const label = `(${m[1]})`;
    const original = originalByLabel.get(label) ?? m[2];
    clean += q.markedPassage.slice(cursor, m.index);
    positions.set(label, { index: clean.length, length: original.length });
    clean += original;
    cursor = (m.index ?? 0) + m[0].length;
  }
  clean += q.markedPassage.slice(cursor);
  // 재구성본이 원문과 정합할 때만 그 좌표를 신뢰한다(게이트가 이미 검사하지만,
  // 어댑터 단독 호출·드리프트 대비 이중 방어).
  const useClean = clean.length > 0 && normalizeWs(clean) === normalizeWs(passage);
  const source = useClean ? clean : passage;

  const markedWords = q.marks.map((m) => {
    const isInappropriate = answerSet.has(m.label);
    const pos = positions.get(m.label);
    const index = useClean && pos ? pos.index : passage.indexOf(m.original);
    const length = pos?.length ?? m.original.length;
    return {
      label: m.label,
      // 위치 탐색 키 — 변장 여부와 무관하게 항상 지문 축자 원문 단어다.
      originalWord: m.original,
      // 표시어는 전 마커 필수(스키마 계약). SOURCE_EXACT 비정답은 원문과 동일값.
      substituteWord: m.shown,
      isInappropriate,
      // betterWord 는 정답 자리에만. 후처리가 originalWord 와 동일함을 검사한다.
      ...(isInappropriate
        ? { betterWord: q.fixes[m.label]?.trim() || m.original }
        : {}),
      // 위치 확정 실패 시 빈 문자열 — 후처리 findWordInPassage 의 단어경계
      // 폴백에 맡긴다(정본 규약: 엉뚱한 좌표를 넘기느니 비운다).
      surroundingText: index >= 0 ? contextAround(source, index, length) : "",
    };
  });

  // 오답해설 라벨 축은 학생 표면 축(①~⑩ = 1-based)과 맞춘다 — 후처리가 선지
  // 라벨을 "1"~"N" 으로 재부여하고 표시 계층이 (a)→① 로 바꾸기 때문이다.
  const wrongByLabel = new Map(q.wrong.map((w) => [w.label, w.text]));
  const wrongOptionExplanations = q.marks
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => !answerSet.has(m.label))
    .map(({ m, i }) => ({
      label: String(i + 1),
      explanation: wrongByLabel.get(m.label) ?? "",
    }))
    .filter((w) => w.explanation.length > 0);

  return {
    ok: true,
    aiQuestion: {
      direction:
        answerSet.size >= 2 ? VOCAB_MD_DIRECTION_MULTI : VOCAB_MD_DIRECTION_SINGLE,
      markedWords,
      // 라벨은 "(a)" 축 그대로 — 후처리가 숫자로 재부여하고 text 도 markedWords
      // 기준으로 덮어쓴다. 여기서 숫자로 내면 라벨 축이 두 곳에서 갈린다.
      options: q.marks.map((m) => ({ label: m.label, text: m.shown })),
      vocabDisplayMode: synonymVariants ? "SYNONYM_VARIANT" : "SOURCE_EXACT",
      correctAnswer: q.answers.join(", "),
      ...(q.answers.length > 1 ? { correctAnswers: [...q.answers] } : {}),
      wrongOptionExplanations,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거(합성문이
      // 모델 오태깅을 학생 표면에 노출한 실사고). 빈 배열 = 검증기·렌더 스킵.
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
