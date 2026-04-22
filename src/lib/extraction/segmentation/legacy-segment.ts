// ============================================================================
// LEGACY segmentation — main `segmentPages` entry. Extracted verbatim from
// segmentation.ts during mechanical split.
// ============================================================================

import type { ResultDraft } from "../types";
import { MIN_COMMIT_PASSAGE_LENGTH } from "../constants";
import {
  QUESTION_NUMBER_RE,
  CHOICE_LINE_RE,
  CIRCLED_INDEX,
  END_SENTENCE_RE,
} from "./legacy-patterns";
import {
  type PageOcrInput,
  emptyBucket,
  emptyExtra,
  bucketToDraft,
} from "./legacy-bucket";
import {
  splitLines,
  detectMarker,
  extractHeader,
  looksLikePassage,
} from "./legacy-detect";

export function segmentPages(pages: PageOcrInput[]): ResultDraft[] {
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const drafts: ResultDraft[] = [];
  let current = emptyBucket();
  let extra = emptyExtra();
  const strippedHeaders: string[] = [];

  const flush = () => {
    const content = current.lines.join("\n").trim();
    if (content.length >= MIN_COMMIT_PASSAGE_LENGTH) {
      // Content validator: drop buckets that look like notice/header leftovers
      // (e.g. bucket containing "◦ 문항에 따라 배점이 다르므로…" + "리딩파워 CH.3").
      // A real passage has multiple prose sentences and is not dominated by
      // bullet-prefixed notice lines or header signals.
      const check = looksLikePassage(content);
      if (check.ok) {
        drafts.push(bucketToDraft(current, drafts.length, extra));
      }
    }
    current = emptyBucket();
    extra = emptyExtra();
  };

  const touchPage = (pageIndex: number) => {
    if (!current.sourcePageIndex.includes(pageIndex)) {
      current.sourcePageIndex.push(pageIndex);
    }
  };

  sorted.forEach((page, pageOrdinal) => {
    if (!page.text || page.text.trim().length === 0) return;

    let lines = splitLines(page.text);

    // Strip exam-paper header from page 1 only. Subsequent pages are body.
    if (pageOrdinal === 0) {
      const split = extractHeader(lines);
      if (split.header.length > 0) {
        strippedHeaders.push(...split.header);
      }
      lines = split.body;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1) RANGE_MARKER or KR/EN instruction → strong boundary
      const marker = detectMarker(line);
      if (marker.isInstruction) {
        if (current.lines.length > 0) flush();
        current.markerDetected = true;
        current.questionRange = marker.range ?? current.questionRange;
        extra.sharedPassage = marker.sharedPassage;
        if (marker.keepLine) current.lines.push(line);
        touchPage(page.pageIndex);
        continue;
      }

      // 2) QUESTION_NUMBER — stronger than before. Flush when:
      //    (a) a different question number appears, OR
      //    (b) previous line was CHOICE ⑤ and this is a new numbered item
      const qnumMatch = line.match(QUESTION_NUMBER_RE);
      if (qnumMatch) {
        const n = Number(qnumMatch[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 200) {
          // Shared-passage range ([2~4]) keeps items in ONE bucket — don't flush.
          const insideSharedRange = extra.sharedPassage;
          const prevQNum = extra.lastQuestionNumber;
          const prevChoiceComplete = extra.lastChoiceIndex !== null && extra.lastChoiceIndex >= 5;

          const shouldFlush =
            !insideSharedRange &&
            current.lines.length > 0 &&
            (prevQNum !== null
              ? prevQNum !== n
              : prevChoiceComplete);

          if (shouldFlush) {
            flush();
            extra.lastQuestionNumber = n;
          } else {
            extra.lastQuestionNumber = n;
          }
          extra.lastChoiceIndex = null;
          current.lines.push(line);
          touchPage(page.pageIndex);
          continue;
        }
      }

      // 3) CHOICE line — track index for boundary detection
      const choiceMatch = line.match(CHOICE_LINE_RE);
      if (choiceMatch) {
        const idx = CIRCLED_INDEX[choiceMatch[1]] ?? null;
        extra.lastChoiceIndex = idx;
        current.lines.push(line);
        touchPage(page.pageIndex);
        continue;
      }

      // 4) Ordinary line → append
      current.lines.push(line);
      touchPage(page.pageIndex);
    }

    if (page.confidence != null) {
      current.confidenceSum += page.confidence;
      current.confidenceCount += 1;
    }

    // Between pages: if the previous line did NOT close with terminal
    // punctuation, treat the next page as a continuation. Otherwise leave
    // the loop state untouched — a marker / question number on the next
    // page will decide the boundary.
    const lastLine = current.lines[current.lines.length - 1]?.trim() ?? "";
    if (lastLine && !END_SENTENCE_RE.test(lastLine)) {
      // continuation, no flush
    }
  });

  flush();

  // Zero-draft fallback — show reviewer the raw content instead of a blank.
  if (drafts.length === 0 && sorted.some((p) => p.text.trim().length > 0)) {
    const merged = sorted
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)
      .join("\n\n");
    drafts.push({
      id: "draft_fallback",
      passageOrder: 0,
      sourcePageIndex: sorted.filter((p) => p.text.trim()).map((p) => p.pageIndex),
      title: "지문 1",
      content: merged,
      confidence: null,
      status: "DRAFT",
      meta: {
        markerDetected: false,
        confidenceNote:
          "경계 마커를 찾지 못해 전체 페이지를 하나의 지문으로 묶었습니다. 필요한 경우 직접 분할하세요.",
      },
    });
  }

  return drafts;
}
