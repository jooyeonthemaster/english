import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { summarisePageMeta, type PageMetaSummary } from "../page-ordering";

/**
 * Group snapshotItems by their cluster assignment from page-ordering.
 * Items are sorted within each cluster by `(orderRank, item.order)` so
 * downstream STEM-led grouping sees pages in their corrected order.
 */
export function groupSnapshotItemsByCluster(
  snapshotItems: ExtractionItemSnapshot[],
  ordering: {
    clusterIdByPageIndex: Map<number, string>;
    orderRank: Map<number, number>;
  },
): Map<string, ExtractionItemSnapshot[]> {
  const byCluster = new Map<string, ExtractionItemSnapshot[]>();
  for (const item of snapshotItems) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const clusterId = ordering.clusterIdByPageIndex.get(pIdx);
    if (!clusterId) continue;
    const list = byCluster.get(clusterId);
    if (list) list.push(item);
    else byCluster.set(clusterId, [item]);
  }
  // Sort each cluster's items by orderRank (page-level) then original order
  // (in-page sequence). This is what the STEM-led grouping needs.
  for (const [, list] of byCluster) {
    list.sort((a, b) => {
      const pa = ordering.orderRank.get(a.sourcePageIndex[0] ?? 0) ?? 0;
      const pb = ordering.orderRank.get(b.sourcePageIndex[0] ?? 0) ?? 0;
      if (pa !== pb) return pa - pb;
      return a.order - b.order;
    });
  }
  return byCluster;
}

/**
 * Build the per-page meta summaries that page-ordering needs. Reads from
 * the snapshot items (post-snapshot, so it sees every item's `examMeta`
 * unioned per page) and from the original ExtractionPage rows when those
 * carry a structured pageMeta column.
 */
export function collectPageMetaSummaries(
  snapshotItems: ExtractionItemSnapshot[],
  pageRows: Array<{ pageIndex: number; pageMeta?: unknown }>,
): PageMetaSummary[] {
  const itemsByPage = new Map<number, ExtractionItemSnapshot[]>();
  for (const item of snapshotItems) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const list = itemsByPage.get(pIdx);
    if (list) list.push(item);
    else itemsByPage.set(pIdx, [item]);
  }
  const pageMetaByPage = new Map<number, unknown>();
  for (const row of pageRows) {
    if (row.pageMeta) pageMetaByPage.set(row.pageIndex, row.pageMeta);
  }
  // Union all `examMeta` carriers on a page into one merged object —
  // EXAM_META blocks plus the first-item carrier we stamp on EXAM-META-less
  // pages in extraction-page.ts.
  const allPageIndexes = new Set<number>([
    ...itemsByPage.keys(),
    ...pageMetaByPage.keys(),
  ]);
  const summaries: PageMetaSummary[] = [];
  for (const pageIndex of allPageIndexes) {
    const items = itemsByPage.get(pageIndex) ?? [];
    const examMetaMerge: Record<string, unknown> = {};
    for (const item of items) {
      if (
        item.examMeta &&
        typeof item.examMeta === "object" &&
        !Array.isArray(item.examMeta)
      ) {
        Object.assign(examMetaMerge, item.examMeta as Record<string, unknown>);
      }
    }
    summaries.push(
      summarisePageMeta({
        pageIndex,
        pageMeta: pageMetaByPage.get(pageIndex) ?? null,
        examMetaFromItems: examMetaMerge,
        items,
      }),
    );
  }
  summaries.sort((a, b) => a.pageIndex - b.pageIndex);
  return summaries;
}
