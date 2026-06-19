import { normalizePassageText, normalizeQuestionText } from "./text-normalization";
import type { PaperItem } from "./types";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";

const SUMMARY_MARKER_RE = /\[(?:\uc694\uc57d\ubb38|summary)\]/i;
const BLANK_ANSWERS_RE = /\s*\[(?:\ube48\uce78\s*\uc815\ub2f5|blank answers)\][\s\S]*$/i;
const ARROW_RE = /([\s\S]*?)(?:\s*)(?:\u2193|\u2192|->|=>)(?:\s*)([\s\S]*)$/;

export function isSummaryCompleteMc(subType: string | null | undefined) {
  return subType === "SUMMARY_COMPLETE_MC";
}

export function isSummaryComplete(subType: string | null | undefined) {
  return subType === "SUMMARY_COMPLETE";
}

export function isSummaryCompleteSubtype(subType: string | null | undefined) {
  return isSummaryCompleteMc(subType) || isSummaryComplete(subType);
}

// 요약문 영작(SUMMARY_WRITING). 시험지 경로에서도 SUMMARY_COMPLETE 와 동일하게
// "지시문(stem) + 구조화 본문(요약 박스 등)"으로 다루되, 정답계열은 questionText 에
// 애초에 직렬화되지 않으므로(이미 안전 직렬화됨) 정답 제거 로직이 불필요하다.
export function isSummaryWritingSubtype(subType: string | null | undefined) {
  return subType === "SUMMARY_WRITING";
}

// 마커는 반드시 "블록/라인 시작"에 앵커한다((^|\n)\s* 프리픽스). 발문(stem)이
// 옵션에 따라 인라인 리터럴 [해석]/[보기] 를 본문에 포함하므로(buildSummaryWritingDirection),
// 앵커 없는 .match() 의 "첫 출현" 매칭은 발문 안의 인라인 마커를 진짜 박스 마커로 오인해
// stem 이 잘리고 박스가 전부 뒤섞인다. (^|\n) 앵커 + 발문 선분리(splitFirstParagraphStem)로
// 이중 방어한다 — 직렬화 형태가 항상 "발문\n\n[해석]..." 구조이므로 안전하다.
const SW_GLOSS_MARKER_RE = /(^|\n)\s*\[(?:해석|gloss)\]/i; // [해석]
const SW_BLANK_GLOSS_MARKER_RE = /(^|\n)\s*\[(?:빈칸\s*해석)\]/i; // [빈칸 해석]
const SW_SUMMARY_MARKER_RE = /(^|\n)\s*\[(?:요약문|summary)\]/i; // [요약문]
const SW_WORDBANK_MARKER_RE = /(^|\n)\s*\[(?:보기|word\s*bank)\]/i; // [보기]
const SW_FIRSTLETTER_MARKER_RE = /(^|\n)\s*\[(?:앞글자|first\s*letter)\]/i; // [앞글자]
// 블록 시작에 SUMMARY_WRITING 마커가 있는지 판정용(발문 블록 vs 마커 블록 구분).
const ANY_SW_MARKER_RE = /^\s*\[(?:해석|gloss|빈칸\s*해석|요약문|summary|보기|word\s*bank|앞글자|first\s*letter)\]/i;

export type SummaryWritingSections = {
  stem: string;
  gloss: string; // [해석]
  blankGloss: string; // [빈칸 해석]
  summary: string; // [요약문] — 이미 빈칸선 처리됨
  wordBank: string; // [보기]
  firstLetter: string; // [앞글자]
};

function cleanupSummarySection(text: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

/**
 * SUMMARY_WRITING 의 questionText 를 섹션으로 분해한다.
 * 형태: "발문\n\n[해석] ...\n\n[빈칸 해석] ...\n\n[요약문] ...\n\n[보기] ...\n\n[앞글자] ...".
 * 각 마커는 선택적이며, 정답계열([빈칸 정답]/modelAnswer 등)은 애초에 직렬화되지 않는다.
 */
export function splitSummaryWritingQuestionText(text: string): SummaryWritingSections {
  const normalized = normalizeQuestionText(text || "");
  const empty: SummaryWritingSections = {
    stem: "",
    gloss: "",
    blankGloss: "",
    summary: "",
    wordBank: "",
    firstLetter: "",
  };
  if (!normalized) return empty;

  type MarkerSpec = { key: keyof SummaryWritingSections; re: RegExp };
  const markerSpecs: MarkerSpec[] = [
    { key: "gloss", re: SW_GLOSS_MARKER_RE },
    { key: "blankGloss", re: SW_BLANK_GLOSS_MARKER_RE },
    { key: "summary", re: SW_SUMMARY_MARKER_RE },
    { key: "wordBank", re: SW_WORDBANK_MARKER_RE },
    { key: "firstLetter", re: SW_FIRSTLETTER_MARKER_RE },
  ];

  // 1차 방어: 발문(첫 \n\n 블록)을 먼저 stem 으로 떼어내고, 남은 본문에 대해서만 마커를
  // 탐색한다. 직렬화 형태가 항상 "발문\n\n[해석]..." 이므로 발문 안의 인라인 [해석]/[보기]
  // 리터럴이 마커 탐색 대상에서 원천 제외된다.
  const { stem: firstParagraphStem, body } = splitFirstParagraphForSummaryWriting(normalized);

  // 2차 방어: 본문에서 마커를 "블록/라인 시작"에 앵커해 탐색한다(인라인 리터럴 무시).
  // match.index 는 (^|\n) 캡처 시작이고, end(=index+match[0].length)는 마커 직후를 가리키므로
  // 본문 슬라이스(slice(end, nextStart))가 정확히 마커 뒤 내용만 담는다.
  const hits = markerSpecs
    .map((spec) => {
      const match = body.match(spec.re);
      return match && match.index !== undefined
        ? { key: spec.key, start: match.index, end: match.index + match[0].length }
        : null;
    })
    .filter((hit): hit is { key: keyof SummaryWritingSections; start: number; end: number } => hit !== null)
    .sort((a, b) => a.start - b.start);

  if (hits.length === 0) {
    // 마커가 전혀 없으면(발문만 있거나 비정형) 발문 전체를 stem 으로.
    return { ...empty, stem: firstParagraphStem || splitFirstParagraphStem(normalized) };
  }

  const result: SummaryWritingSections = { ...empty };
  // 발문(첫 블록) + 첫 마커 이전에 남은 본문 조각(있다면)을 모두 stem 에 합친다.
  const stemTail = cleanupSummarySection(body.slice(0, hits[0].start));
  result.stem = [firstParagraphStem, stemTail].filter(Boolean).join(" ").trim();

  hits.forEach((hit, index) => {
    const nextStart = hits[index + 1]?.start ?? body.length;
    result[hit.key] = cleanupSummarySection(body.slice(hit.end, nextStart));
  });

  return result;
}

// 발문(첫 \n\n 블록)을 stem 으로, 나머지를 body 로 분리한다.
// 단, 첫 블록 자체가 마커 블록이면(발문이 비어 direction 없이 직렬화된 경우) stem 은 비우고
// 전체를 body 로 둔다 — 마커 블록을 stem 으로 잘못 흡수해 박스를 잃지 않도록.
function splitFirstParagraphForSummaryWriting(normalized: string): { stem: string; body: string } {
  const blocks = normalized.split(/\n{2,}/);
  const firstBlock = (blocks[0] || "").trim();
  if (firstBlock && ANY_SW_MARKER_RE.test(firstBlock)) {
    return { stem: "", body: normalized };
  }
  return {
    stem: cleanupSummarySection(firstBlock),
    body: blocks.slice(1).join("\n\n"),
  };
}

// stem 만 필요할 때(마커가 전혀 없을 때)의 안전한 첫 단락 추출.
function splitFirstParagraphStem(normalized: string) {
  const blocks = normalized.split(/\n{2,}/);
  return cleanupSummarySection(blocks[0] || normalized);
}

export function splitSummaryCompleteMcQuestionText(text: string) {
  const normalized = normalizeQuestionText((text || "").replace(BLANK_ANSWERS_RE, ""));
  if (!normalized) return { stem: "", summary: "" };

  const markerMatch = normalized.match(
    new RegExp(`([\\s\\S]*?)\\s*${SUMMARY_MARKER_RE.source}\\s*([\\s\\S]*)$`, "i"),
  );
  if (markerMatch) {
    return {
      stem: cleanupSummaryStem(markerMatch[1]),
      summary: cleanupSummaryText(markerMatch[2]),
    };
  }

  const bracketLabelMatch = normalized.match(/^([\s\S]*?\?)\s*\[[^\]\n]{1,24}\]\s*([A-Z][\s\S]*)$/);
  if (bracketLabelMatch) {
    return {
      stem: cleanupSummaryStem(bracketLabelMatch[1]),
      summary: cleanupSummaryText(bracketLabelMatch[2]),
    };
  }

  const arrowMatch = normalized.match(ARROW_RE);
  if (arrowMatch) {
    return {
      stem: cleanupSummaryStem(arrowMatch[1]),
      summary: cleanupSummaryText(arrowMatch[2]),
    };
  }

  const fallbackMatch = normalized.match(/^([\s\S]*?\?)(?:\s+)([A-Z][\s\S]*)$/);
  if (fallbackMatch) {
    return {
      stem: cleanupSummaryStem(fallbackMatch[1]),
      summary: cleanupSummaryText(fallbackMatch[2]),
    };
  }

  return { stem: cleanupSummaryStem(normalized), summary: "" };
}

export function summaryCompleteMcPassageForItem(item: PaperItem) {
  return normalizePassageText(item.passageContent || item.sourceQuestion.passage?.content || "");
}

export function summaryCompleteMcSummaryForItem(item: PaperItem, summary: string) {
  const answers = readSummaryBlankAnswersFromQuestionLike(
    item.sourceQuestion,
    item.options,
    item.correctAnswer || item.sourceQuestion.correctAnswer,
  );
  return formatSummaryCompleteMcSummaryForDisplay(summary, answers);
}

export function summaryCompleteMcDisplayTextForItem(item: PaperItem) {
  if (!isSummaryCompleteMc(item.sourceQuestion.subType)) return item.questionText;

  const { stem, summary } = splitSummaryCompleteMcQuestionText(item.questionText);
  const passage = summaryCompleteMcPassageForItem(item);
  const maskedSummary = summaryCompleteMcSummaryForItem(item, summary);
  return [stem, passage, "\u2193", maskedSummary].filter((part) => part.trim()).join("\n\n");
}

function cleanupSummaryStem(text: string) {
  return text.replace(SUMMARY_MARKER_RE, "").replace(/\s+/g, " ").trim();
}

function cleanupSummaryText(text: string) {
  return text.replace(SUMMARY_MARKER_RE, "").replace(/\s+/g, " ").trim();
}
