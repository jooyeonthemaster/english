// ============================================================================
// 요약문 영작 (SUMMARY_WRITING) — 학생 안전 직렬화 / 표시 헬퍼 (중앙화)
// ============================================================================
// 핵심 불변식 SW-LEAK-1: 정답계열 필드(modelAnswer / blanks[].answer /
//   acceptableVariants / requiredLemmas / wordBankDistractors / scoringCriteria)는
//   학생 노출 직렬화에 절대 포함하지 않는다. questionText 로 나가는 것은
//   👁학생노출 필드(summaryWithBlanks / koreanGloss / wordBank / firstLetterHint /
//   targetWordCount / connectorFrameAfter)뿐이다.
// 요약문 빈칸선·(A)(B) placeholder 처리는 SUMMARY_COMPLETE 인프라를 재사용한다.

import {
  addSummaryCompleteMcBlankLines,
  maskSummaryCompleteMcAnswers,
  type SummaryBlankAnswers,
} from "./summary-complete-mc";

export function isSummaryWriting(subType: string | null | undefined) {
  return subType === "SUMMARY_WRITING";
}

type SummaryWritingBlankLike = {
  label?: unknown;
  answer?: unknown;
  targetWordCount?: unknown;
  firstLetterHint?: unknown;
};

type SummaryWritingLike = {
  summaryWithBlanks?: unknown;
  koreanGloss?: unknown;
  blankGlosses?: unknown;
  wordBank?: unknown;
  blanks?: unknown;
  clueMode?: unknown;
  targetWordsMode?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeBlankLabel(value: unknown) {
  const raw = cleanText(value);
  if (!raw) return "";
  // 이미 "(A)" 형태면 그대로, "A" 면 괄호 부착
  if (/^\([A-Za-z]\)$/.test(raw)) return raw.toUpperCase();
  if (/^[A-Za-z]$/.test(raw)) return `(${raw.toUpperCase()})`;
  return raw;
}

function readBlankAnswerMap(q: SummaryWritingLike): SummaryBlankAnswers {
  const answers: SummaryBlankAnswers = {};
  for (const blank of asArray(q.blanks)) {
    const b = blank as SummaryWritingBlankLike & { answer?: unknown };
    const label = normalizeBlankLabel(b.label); // "(A)"
    const answer = cleanText(b.answer);
    if (!label || !answer) continue;
    const letter = label.replace(/[()]/g, "").toUpperCase();
    if (/^[A-Z]$/.test(letter)) answers[`blank${letter}`] = answer;
  }
  return answers;
}

// 단어별 채움 슬롯. 렌더러(웹/DOCX/HWPX)가 빈칸으로 인식하려면 밑줄 3개 이상이어야 한다.
const SLOT_BLANK = "____"; // 단어별 슬롯 1칸(앞글자/단어수 단서용, 고정폭)
const SINGLE_BLANK = "_____"; // 단서 없을 때 통짜 빈칸 1개

function firstAlphaLower(word: string): string {
  const m = word.match(/[A-Za-z]/);
  return m ? m[0].toLowerCase() : "";
}

/**
 * 한 빈칸의 정답을 단서 모드에 맞는 "쓰는 칸" 표현으로 변환한다.
 * - firstLetter: 단어마다 "첫글자+밑줄칸"으로 분리 → "p____ s____ d____" (실제 시험지 앞글자 단서 형식).
 * - wordCount  : 단어 수만큼 빈 밑줄칸으로 분리 → "____ ____ ____" (글자는 안 줌, 단어 수만).
 * - 그 외      : 통짜 빈칸 1개 "_____".
 * 슬롯 길이는 정답 철자 수에 비례시키지 않는다(SW-LEAK-LEN — 고정폭).
 */
function blankRenderingForClue(answer: string, clue: string): string {
  const words = answer.split(/\s+/).filter(Boolean);
  if (clue === "firstLetter" && words.length) {
    return words.map((w) => `${firstAlphaLower(w)}${SLOT_BLANK}`).join(" ");
  }
  if (clue === "wordCount" && words.length) {
    return words.map(() => SLOT_BLANK).join(" ");
  }
  return SINGLE_BLANK;
}

/**
 * 👁학생노출 요약문 — (A)(B) placeholder 를 단서 모드에 맞는 "쓰는 칸"으로 채운다.
 * 방어심도(SW-LEAK-MASK): 모델이 실수로 정답 어구를 summaryWithBlanks 에 인라인으로 적어두더라도
 *   maskSummaryCompleteMcAnswers 로 (A)/(B) 뒤 정답을 먼저 제거한다.
 * - clueMode=firstLetter → "(A) p____ s____ d____" (단어별 칸, 칸마다 앞글자). 별도 [앞글자] 줄 없음.
 * - clueMode=wordCount   → "(A) ____ ____ ____" (단어 수만큼 빈 칸).
 * - 그 외(none/skeleton)  → "(A) _____" (통짜 빈칸).
 * 목표 단어수(약 N단어)는 빈칸 옆 인라인이 아니라 발문(buildSummaryWritingDirection)에만 표기한다.
 */
export function summaryWritingMaskedSummary(q: SummaryWritingLike): string {
  const base = cleanText(q.summaryWithBlanks);
  if (!base) return "";
  const masked = maskSummaryCompleteMcAnswers(base, readBlankAnswerMap(q));
  const clue = cleanText(q.clueMode);

  if (clue === "firstLetter" || clue === "wordCount") {
    const renderByLabel = new Map<string, string>();
    for (const blank of asArray(q.blanks)) {
      const b = blank as SummaryWritingBlankLike;
      const label = normalizeBlankLabel(b.label);
      const answer = cleanText(b.answer);
      if (label) renderByLabel.set(label, blankRenderingForClue(answer, clue));
    }
    // "(A)" (+ 뒤따르는 빈칸선 있으면) → "(A) <단어별 슬롯> ". 슬롯 뒤에 공백을 붙여 다음 단어와
    // 붙지 않게 한 뒤(예: "b____that" 방지), 다중 공백 축약·구두점 앞 공백 제거로 정리한다.
    return masked
      .replace(/(\([A-Z]\))\s*(?:_{3,})?/g, (m, label: string) => {
        const slots = renderByLabel.get(label.toUpperCase()) ?? SINGLE_BLANK;
        return `${label} ${slots} `;
      })
      .replace(/ {2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  // none / skeleton / 기타 — 통짜 빈칸 1개.
  return addSummaryCompleteMcBlankLines(masked);
}

/**
 * 👁학생노출 [보기] 칩 텍스트. 미끼 포함된 wordBank 전체(셔플본). 비밀 필드 미포함.
 */
export function summaryWritingWordBankText(q: SummaryWritingLike): string {
  const words = asArray(q.wordBank).map(cleanText).filter(Boolean);
  return words.length ? words.join(" / ") : "";
}

/**
 * SW-LEAK-1: questionText 직렬화용 학생 안전 블록 배열.
 * 누수 3사이트(build-question-text.ts / question-generation-persistence.ts /
 * generate-page-types.ts)가 SUMMARY_WRITING 일 때 이 함수만 사용한다.
 * [빈칸 정답]·modelAnswer·acceptableVariants·wordBankDistractors·scoringCriteria 절대 미포함.
 */
export function summaryWritingStudentParts(q: SummaryWritingLike): string[] {
  const parts: string[] = [];

  const gloss = cleanText(q.koreanGloss);
  if (gloss) parts.push(`[해석] ${gloss}`);

  // [빈칸 해석](blankGlosses)는 v1에서 학생면에 노출하지 않는다.
  // 시각검수 결과 모델이 빈칸별 정답을 한국어로 1:1 직역해 [보기]와 결합 시 사실상 정답을
  // 노출했다(영작이 받아쓰기로 전락). 전체 의미는 [해석](koreanGloss, 레퍼런스 형식)만 제공한다.

  // [요약문] — 단서 모드가 firstLetter/wordCount 면 빈칸이 이미 단어별 슬롯(칸마다 앞글자)으로
  // 렌더되므로, 별도 [앞글자] 줄을 두지 않는다(앞글자는 쓰는 칸 안에 있어야 함 — 시각검수 피드백).
  const summary = summaryWritingMaskedSummary(q);
  if (summary) parts.push(`[요약문] ${summary}`);

  const wordBank = summaryWritingWordBankText(q);
  if (wordBank) parts.push(`[보기] ${wordBank}`);

  return parts;
}
