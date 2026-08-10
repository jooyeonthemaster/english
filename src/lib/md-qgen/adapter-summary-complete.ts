// ============================================================================
// 요약문 완성 단답형(SUMMARY_COMPLETE) 어댑터 — md 파싱 결과 → 프로덕션 AI 문항
// 형상. 견본: adapter-antonym.ts · adapter-summary-mc.ts / 정본 규약: 순수 매핑만.
//
// ── 경계 계약 (실측) ────────────────────────────────────────────────────────
// 이 유형은 **PASSTHROUGH** 다(question-postprocess/types.ts:78). 후처리가
// 지문 파생 필드·라벨·발문을 하나도 만들어 주지 않으므로 **어댑터가 완제품**을 낸다.
// 후처리가 실제로 하는 일은 wrongOptionExplanations 배열→Record 정규화 하나뿐인데,
// 이 유형은 선지가 없어 그 필드 자체가 없다.
//
// 어댑터가 만든다:
//   direction · summaryWithBlanks · blanks[](label·answer·acceptedAnswers) ·
//   correctAnswer("(A) x, (B) y") · explanation · keyPoints/tags/difficulty
// 만들지 않는다: options(‼) · passageWith* 계열 · scoringCriteria · keyPoints 합성.
//
// ⚠ `options` 키를 **아예 두지 마라**(undefined 도 아니라 키 부재). 서술형은
//   선지가 없어 correctAnswer 가 "(A) x, (B) y" 형태인데, options 가 비어 있지
//   않으면 validators/options.ts:196-217 이 correct-answer-mismatch(error,
//   RELAXED_BLOCKING)를 발화한다.
// ⚠ 라벨 축은 **"(A)" 괄호 대문자 고정**이다. 이 문자열이 그대로 학생 답안 입력
//   키이자 채점 필드 키다(answer-spec.ts:210 → grade.ts:115). "A"/"(a)" 로 내면
//   저장된 응답과 desync 된다.
// ⚠ `acceptedAnswers` 는 채점에서 **무조건 만점** 집합이다(grade.ts:50 —
//   mergeAnswerSet 이 아무 필터 없이 전량 주입). 스키마 계약대로 answer 자신을
//   선두에 강제 삽입하고, 그 밖의 원소는 게이트를 통과한 것만 싣는다.
// ============================================================================

import type { MdLaneAdaptResult } from "./lane-types";
import {
  summaryCompleteCmp,
  type MdSummaryCompleteQuestion,
} from "./parser-summary-complete";
import { summaryCompleteMdLabels } from "./prompts-summary-complete";

/** DB 실물·fast 산출과 동일한 발문(question-prompts-essay.ts:69 — 표면 무변경). */
export const SUMMARY_COMPLETE_MD_DIRECTION =
  "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 들어갈 말을 쓰시오.";

/** 발문 언어 설정이 en 일 때의 영어 발문(요약문·정답은 구조상 영어 고정). */
export function summaryCompleteMdDirectionEn(labels: string[]): string {
  const slot =
    labels.length > 1 ? `blanks ${labels.join(", ")}` : `blank ${labels[0] ?? "(A)"}`;
  return `Summarize the passage in one sentence by writing the word or phrase that belongs in ${slot}.`;
}

/** 스키마 계약: acceptedAnswers 는 answer 자신을 반드시 1개 포함한다(:112-114). */
function buildAcceptedAnswers(answer: string, accepted: string[]): string[] {
  const out = [answer];
  const seen = new Set([summaryCompleteCmp(answer)]);
  for (const raw of accepted) {
    const value = raw.trim();
    const key = summaryCompleteCmp(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function adaptMdSummaryCompleteToAiQuestion(
  q: MdSummaryCompleteQuestion,
  difficulty: string,
  blankCount: number,
): MdLaneAdaptResult {
  const labels = summaryCompleteMdLabels(blankCount);
  if (!q.summary) return { ok: false, error: "요약문 누락" };

  const byLabel = new Map(q.blanks.map((b) => [b.label, b]));
  const missing = labels.filter((label) => !byLabel.get(label)?.answer.trim());
  if (missing.length > 0) {
    return { ok: false, error: `빈칸 정답 누락: ${missing.join("")}` };
  }

  const blanks = labels.map((label) => {
    const blank = byLabel.get(label)!;
    const answer = blank.answer.trim();
    return {
      label,
      answer,
      acceptedAnswers: buildAcceptedAnswers(answer, blank.accepted),
    };
  });

  return {
    ok: true,
    aiQuestion: {
      direction: SUMMARY_COMPLETE_MD_DIRECTION,
      summaryWithBlanks: q.summary,
      blanks,
      // 프롬프트 계약(question-prompts-essay.ts:68): "(A) answer, (B) answer".
      // `정답(X):` 줄에서 **파생**한다 — 모델에게 다시 받지 않는다(철칙 1).
      correctAnswer: blanks.map((b) => `${b.label} ${b.answer}`).join(", "),
      explanation: q.explanation,
      // keyPoints 합성 금지 — 정본 adapter.ts:319-322 와 동일 근거
      // (합성문이 출제자 노트를 학생 표면에 노출한 실사고).
      keyPoints: [],
      tags: [],
      difficulty,
    },
  };
}
