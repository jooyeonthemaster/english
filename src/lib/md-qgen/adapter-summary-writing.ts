// ============================================================================
// 요약문 영작(SUMMARY_WRITING) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항 형상.
//
// 【후처리 경계】 이 유형은 **PASSTHROUGH** 다(question-postprocess/types.ts:79).
//   postProcessQuestion 은 지문 필드도, 라벨도, 발문도 하나 안 만들어 준다
//   (도는 것은 wrongOptionExplanations 배열→Record 변환뿐이고 이 유형엔 그 필드가
//   아예 없다). 따라서 **어댑터가 100% 완제품을 낸다.**
//
//  - 어댑터가 만든다: direction(결정론 합성값 복제) · summaryWithBlanks · koreanGloss ·
//    wordBank · wordBankDistractors(파생) · 설정 메타 8종 · blanks[] ·
//    modelAnswer(파생) · scoringCriteria · scoringMode · correctAnswer ·
//    explanation · keyPoints/tags/difficulty
//  - 후처리가 만드는 것: **없음**
//
// ⚠ `options` 키를 두지 마라 — 비어 있지 않은 options 는 correct-answer-mismatch
//   (RELAXED_BLOCKING)로 차단된다. 선지가 없는 유형이므로 키 자체를 만들지 않는다.
// ⚠ `blankGlosses` 는 v1 학생 비노출 확정(스키마 :195). 만들지 마라.
// ⚠ `firstLetterHint` 는 렌더가 blanks[].answer 에서 직접 파생한다
//   (summary-writing.ts:110-127). 실으면 같은 사실을 두 곳에서 관리하게 된다.
// ⚠ 라벨은 **"(A)" 괄호 대문자 고정**. 이 문자열이 그대로 학생 답안 입력 키가 된다
//   (answer-spec.ts:210 → grade.ts:115). "A" 로 새면 저장된 응답과 desync 된다.
// ============================================================================

import type { ResolvedSummaryWritingSettings } from "@/lib/question-type-generation-settings";
import { cleanMdValue } from "./decoration";
import { deriveSummaryWritingDistractors } from "./snap-summary-writing";
import {
  summaryWritingMdModelAnswer,
  type MdSummaryWritingQuestion,
} from "./parser-summary-writing";
import type { MdLaneAdaptResult } from "./lane-types";

/**
 * 저장·표시로 나가는 **모든 md 유래 값**의 최종 세척. 파서가 이미 같은 유틸로 씻지만,
 * 이 유형은 PASSTHROUGH 라 후처리가 한 번 더 씻어 주지 않는다 — 어댑터를 직접 부르는
 * 경로(레인 외 호출·직접 조립 입력)에서 장식이 남으면 그대로 학생 화면이다.
 * cleanMdValue 는 멱등이라 정상 값에는 아무 일도 하지 않는다(본문 강조·본문 따옴표 보존).
 * ⚠ 라벨은 세척하지 않는다 — `(A)` 는 채점 입력 키라 한 글자도 손대면 안 된다.
 */
const clean = (value: string): string => cleanMdValue(value);
const cleanList = (values: string[]): string[] => values.map(clean).filter(Boolean);

/** scoringGranularity → 스키마 scoringMode. LLM_RUBRIC 은 자동채점을 MANUAL_ONLY 로 강등한다. */
export function summaryWritingScoringMode(
  granularity: ResolvedSummaryWritingSettings["scoringGranularity"],
): "EXACT" | "LEMMA" | "LLM_RUBRIC" {
  if (granularity === "exact") return "EXACT";
  if (granularity === "rubric") return "LLM_RUBRIC";
  return "LEMMA";
}

export function adaptMdSummaryWritingToAiQuestion(
  raw: MdSummaryWritingQuestion,
  settings: ResolvedSummaryWritingSettings,
  direction: string,
  difficulty: string,
): MdLaneAdaptResult {
  // 세척을 **가장 먼저** 한다 — 아래 파생(모범답안)과 저장값이 같은 문자열이어야 한다.
  const q: MdSummaryWritingQuestion = {
    ...raw,
    summary: clean(raw.summary),
    gloss: clean(raw.gloss),
    chips: cleanList(raw.chips),
    blanks: raw.blanks.map((blank) => ({
      label: blank.label,
      answer: clean(blank.answer),
      variants: cleanList(blank.variants),
      lemmas: cleanList(blank.lemmas),
    })),
    criteria: cleanList(raw.criteria),
    explanation: clean(raw.explanation),
  };

  if (!q.summary) return { ok: false, error: "요약문 누락" };
  if (q.blanks.length === 0) return { ok: false, error: "빈칸 정답 없음" };
  if (q.blanks.some((blank) => !blank.label || !blank.answer)) {
    return { ok: false, error: "빈칸 라벨 또는 정답 누락" };
  }

  // 모범답안은 받지 않고 파생한다 — 요약문의 라벨을 정답으로 치환한 것이 정의다.
  const modelAnswer = summaryWritingMdModelAnswer(q);
  if (!modelAnswer) return { ok: false, error: "모범답안 파생 실패" };

  const chips = settings.wordBankEnabled ? q.chips : [];
  // 미끼도 받지 않고 파생한다(어느 정답에도 소비되지 않는 칩 = 미끼).
  // 파생이라 정의상 wordBank 의 부분집합이므로, 학생면의 mergeChipsWithDistractors
  // (student-safe-data.ts:88-97)가 칩을 추가·재정렬하는 일이 생기지 않는다.
  const distractors = deriveSummaryWritingDistractors(chips, q.blanks);

  const blanks = q.blanks.map((blank) => ({
    label: blank.label,
    answer: blank.answer,
    ...(blank.variants.length > 0 ? { acceptableVariants: blank.variants } : {}),
    ...(blank.lemmas.length > 0 ? { requiredLemmas: blank.lemmas } : {}),
    // 목표 단어수는 설정값의 복제다(모델에게 받지 않는다). hidden 이면 싣지 않는다.
    ...(settings.targetWordsMode !== "hidden"
      ? { targetWordCount: settings.targetWordsPerBlank }
      : {}),
  }));

  return {
    ok: true,
    aiQuestion: {
      // 발문은 buildSummaryWritingDirection 결정론 합성값. 모델 문구를 쓰지 않는다.
      direction,
      summaryWithBlanks: q.summary,
      ...(settings.glossEnabled && q.gloss ? { koreanGloss: q.gloss } : {}),
      ...(chips.length > 0 ? { wordBank: chips } : {}),
      ...(distractors.length > 0 ? { wordBankDistractors: distractors } : {}),
      // 설정 메타 — 렌더·마스킹·검증기가 읽는다(resolved 값 그대로 복제).
      wordBankPolicy: settings.wordBankUsage,
      wordBankFidelity: settings.wordBankFidelity,
      blankAssignment: settings.blankAssignment,
      clueMode: settings.clueMode,
      targetWordsMode: settings.targetWordsMode,
      connectorFrame: settings.connectorFrame,
      summarySourceMode: settings.summarySourceMode,
      sourceSentenceParaphrase: settings.sourceSentenceParaphrase,
      blanks,
      modelAnswer,
      ...(q.criteria.length > 0 ? { scoringCriteria: q.criteria } : {}),
      scoringMode: summaryWritingScoringMode(settings.scoringGranularity),
      correctAnswer: modelAnswer,
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 모델 오태깅을 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
