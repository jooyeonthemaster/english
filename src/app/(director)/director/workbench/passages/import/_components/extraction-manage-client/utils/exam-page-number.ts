// ============================================================================
// exam-page-number — extract the booklet's own page number (e.g. "1 / 8" → 1)
// from the ExtractionItem rows returned by the job-detail API.
//
// The finalize pipeline stamps `pageMeta` onto an EXAM_META block when one
// exists, and otherwise onto the first item of each page. So we look for the
// first item per page that carries an `examMeta.pageNumber` and use that.
// Pages where OCR couldn't read a page number simply have no entry — callers
// fall back to the upload-order pageIndex in that case.
// ============================================================================

interface ExamMetaShape {
  pageNumber?: number | null;
}

export function buildExamPageNumberMap(
  items: Array<{ sourcePageIndex: number[]; examMeta: unknown }> | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!items) return map;
  for (const item of items) {
    const meta = item.examMeta as ExamMetaShape | null;
    const pn = typeof meta?.pageNumber === "number" ? meta.pageNumber : null;
    if (pn === null) continue;
    const pIdx = item.sourcePageIndex?.[0];
    if (typeof pIdx !== "number") continue;
    if (!map.has(pIdx)) map.set(pIdx, pn);
  }
  return map;
}
