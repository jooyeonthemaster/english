// ============================================================================
// LEGACY segmentation — bucket shapes + bucketToDraft conversion.
// Extracted verbatim from segmentation.ts during mechanical split.
// ============================================================================

import type { ResultDraft } from "../types";

export interface PageOcrInput {
  pageIndex: number;
  text: string; // may be empty when page failed
  confidence?: number | null;
}

export interface Bucket {
  sourcePageIndex: number[];
  lines: string[];
  questionRange: string | null; // e.g. "20~24"
  markerDetected: boolean;
  confidenceSum: number;
  confidenceCount: number;
}

export function emptyBucket(): Bucket {
  return {
    sourcePageIndex: [],
    lines: [],
    questionRange: null,
    markerDetected: false,
    confidenceSum: 0,
    confidenceCount: 0,
  };
}

export interface BucketExtra {
  /** True when this bucket was opened by a RANGE_MARKER whose trailing text
   *  is a SHARED-PASSAGE instruction ("다음 글을 읽고..."). When true, a single
   *  passage is shared across multiple question numbers. */
  sharedPassage: boolean;
  /** Last QUESTION_NUMBER observed while filling this bucket. Used to detect
   *  transitions (1. → 2.) that should flush the bucket when no RANGE_MARKER
   *  is present. */
  lastQuestionNumber: number | null;
  /** Last CHOICE index observed (1~9). Used with lastQuestionNumber to detect
   *  "⑤ ends → new question" transitions cleanly. */
  lastChoiceIndex: number | null;
}

export function emptyExtra(): BucketExtra {
  return {
    sharedPassage: false,
    lastQuestionNumber: null,
    lastChoiceIndex: null,
  };
}

export function bucketToDraft(
  bucket: Bucket,
  order: number,
  extra: BucketExtra,
): ResultDraft {
  const content = bucket.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = bucket.questionRange
    ? extra.sharedPassage
      ? `[${bucket.questionRange}]번 공유 지문`
      : `${bucket.questionRange.split("~")[0]}번 지문`
    : extra.lastQuestionNumber !== null
      ? `${extra.lastQuestionNumber}번 지문`
      : `지문 ${order + 1}`;
  const confidence = bucket.confidenceCount
    ? bucket.confidenceSum / bucket.confidenceCount
    : null;

  return {
    id: `draft_${order}_${bucket.sourcePageIndex.join("_") || "empty"}`,
    passageOrder: order,
    sourcePageIndex: [...bucket.sourcePageIndex].sort((a, b) => a - b),
    title,
    content,
    confidence,
    status: "DRAFT",
    meta: {
      markerDetected: bucket.markerDetected,
      mergedFromPages:
        bucket.sourcePageIndex.length > 1
          ? [...bucket.sourcePageIndex].sort((a, b) => a - b)
          : undefined,
      confidenceNote: bucket.markerDetected
        ? extra.sharedPassage
          ? "공유 지문 마커가 탐지되어 자동 분할되었습니다."
          : "경계 마커가 탐지되어 자동 분할되었습니다."
        : extra.lastQuestionNumber !== null
          ? "문제 번호 변경으로 자동 분할되었습니다."
          : "마커가 없어 페이지 단위로 묶었습니다. 병합·분할이 필요한지 확인하세요.",
    },
  };
}
