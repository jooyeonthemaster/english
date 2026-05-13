// ============================================================================
// page-ordering — sort pages by detected page number / question number and
// cluster pages that belong to the same test booklet by exam fingerprint.
//
// Called by extraction-finalize.ts BEFORE the STEM-led grouping walk so that
// downstream grouping sees pages in the correct reading order, even when the
// user uploaded images out of order (or mixed multiple test booklets in a
// single job).
//
// All inputs are read-only snapshots; the module returns a recomputed
// ordering / cluster assignment that the caller applies. No DB writes.
// ============================================================================

import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

/** Per-page metadata distilled from OCR `pageMeta` + item-level signals. */
export interface PageMetaSummary {
  /** Original 0-based pageIndex as uploaded (input order). */
  pageIndex: number;
  /** OCR-detected page number ("1 / 8" → 1). null if not visible. */
  pageNumber: number | null;
  /** OCR-detected page total ("1 / 8" → 8). null if not visible. */
  pageTotal: number | null;
  /** OCR-detected exam code (e.g. "03", "05"). null if not visible. */
  examCode: string | null;
  /** Subject / round / school — cluster fingerprint helpers. */
  subject: string | null;
  schoolName: string | null;
  year: number | null;
  round: string | null;
  /** Question numbers visible on this page (min / max). Derived from items
   *  questionMeta.number. Used as fallback ordering signal when pageNumber
   *  is missing. */
  minQuestionNumber: number | null;
  maxQuestionNumber: number | null;
}

/** A run of pages that belong to the same test booklet. */
export interface PageCluster {
  /** Stable id for this cluster within the job (e.g. "cluster-0"). */
  clusterId: string;
  /** Cluster fingerprint as a debuggable string. */
  fingerprint: string;
  /** Pages in this cluster, in their final reading order. */
  pages: PageMetaSummary[];
}

export interface PageOrderingResult {
  /** Pages in their final order across the whole job, cluster-by-cluster. */
  orderedPages: PageMetaSummary[];
  /** Cluster groupings. Always at least one cluster (even for single-test). */
  clusters: PageCluster[];
  /** Mapping from original `pageIndex` to its assigned `clusterId` for quick
   *  lookup when downstream code walks items. */
  clusterIdByPageIndex: Map<number, string>;
  /** Mapping from original `pageIndex` to its new sort position (0-based)
   *  across the whole job. Items can be re-sorted by
   *  `(orderRank[pageIndex], item.order)` to preserve in-page sequence. */
  orderRank: Map<number, number>;
  /** Diagnostics surfaced for logging — never thrown. */
  warnings: string[];
}

// ─── Page meta summarisation ────────────────────────────────────────────────

function asNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Pull the per-page metadata out of whatever the page worker stamped. Today
 * the page worker writes structured.pageMeta onto:
 *   - `extractionPage.pageMeta` (when the new column is populated), AND
 *   - the EXAM_META item's `examMeta` (legacy path; only set on page 1).
 * Either source is honoured here so the module stays robust during the
 * transition.
 */
export function summarisePageMeta(input: {
  pageIndex: number;
  pageMeta: unknown;
  examMetaFromItems: unknown;
  items: ExtractionItemSnapshot[];
}): PageMetaSummary {
  const merged: Record<string, unknown> = {};
  for (const source of [input.examMetaFromItems, input.pageMeta]) {
    if (source && typeof source === "object" && !Array.isArray(source)) {
      Object.assign(merged, source as Record<string, unknown>);
    }
  }

  const questionNumbers = input.items
    .filter((item) => item.blockType === "QUESTION_STEM")
    .map((item) => {
      const meta = item.questionMeta as Record<string, unknown> | null;
      return asNumber(meta?.number);
    })
    .filter((n): n is number => n !== null);

  return {
    pageIndex: input.pageIndex,
    pageNumber: asNumber(merged.pageNumber),
    pageTotal: asNumber(merged.pageTotal),
    examCode: asString(merged.examCode),
    subject: asString(merged.subject),
    schoolName: asString(merged.schoolName),
    year: asNumber(merged.year),
    round: asString(merged.round),
    minQuestionNumber: questionNumbers.length > 0 ? Math.min(...questionNumbers) : null,
    maxQuestionNumber: questionNumbers.length > 0 ? Math.max(...questionNumbers) : null,
  };
}

// ─── Cluster fingerprint ────────────────────────────────────────────────────

/**
 * Build a string fingerprint identifying the test booklet this page belongs
 * to. Strongest signals first; pages with the same fingerprint cluster
 * together. Returns `__unknown__` only when ALL signals are absent — those
 * pages still cluster together (single fallback cluster).
 *
 * **Hard-learned constraint**: `pageTotal` is NOT used in the fingerprint.
 * OCR confuses the booklet's own page count (e.g. "3 / 8" footer) with the
 * upload's totalPages context, so the same booklet can emit `pageTotal=8`
 * on half its pages and `pageTotal=11` on the other half — which would
 * shred the booklet across multiple clusters. We rely on `examCode` (page-
 * stamped exam identifier) as the strongest signal, falling back to the
 * (year, round, school, subject) tuple when examCode is absent.
 */
function fingerprintFor(meta: PageMetaSummary): string {
  if (meta.examCode) {
    // examCode alone is a near-perfect signal — every page of the same
    // test booklet carries the same exam code stamped at the top.
    return `code=${meta.examCode}`;
  }
  const parts: string[] = [];
  if (meta.year !== null) parts.push(`yr=${meta.year}`);
  if (meta.round) parts.push(`rd=${meta.round}`);
  if (meta.schoolName) parts.push(`sch=${meta.schoolName}`);
  if (meta.subject) parts.push(`subj=${meta.subject}`);
  if (parts.length === 0) return "__unknown__";
  return parts.join("|");
}

// ─── Sort within a cluster ──────────────────────────────────────────────────

/**
 * Sort pages within a cluster. Priority:
 *   1) pageNumber when set on ALL pages (most reliable).
 *   2) minQuestionNumber when set on ALL pages.
 *   3) original pageIndex (= input order, last-resort fallback).
 */
function sortCluster(pages: PageMetaSummary[]): {
  sorted: PageMetaSummary[];
  basis: "pageNumber" | "minQuestionNumber" | "inputOrder";
} {
  const hasAllPageNumbers = pages.every((p) => p.pageNumber !== null);
  if (hasAllPageNumbers) {
    return {
      sorted: [...pages].sort(
        (a, b) => (a.pageNumber as number) - (b.pageNumber as number),
      ),
      basis: "pageNumber",
    };
  }
  const hasAllQuestionNumbers = pages.every(
    (p) => p.minQuestionNumber !== null,
  );
  if (hasAllQuestionNumbers) {
    return {
      sorted: [...pages].sort(
        (a, b) =>
          (a.minQuestionNumber as number) - (b.minQuestionNumber as number),
      ),
      basis: "minQuestionNumber",
    };
  }
  return {
    sorted: [...pages].sort((a, b) => a.pageIndex - b.pageIndex),
    basis: "inputOrder",
  };
}

// ─── Cluster ordering across the job ────────────────────────────────────────

/**
 * Decide the order clusters appear in across the job. Today: by the earliest
 * `pageIndex` of each cluster (= the order the user uploaded each booklet's
 * first page). This keeps the user's high-level grouping intent intact even
 * when in-cluster page order is recovered.
 */
function sortClusters(clusters: PageCluster[]): PageCluster[] {
  return [...clusters].sort((a, b) => {
    const firstA = Math.min(...a.pages.map((p) => p.pageIndex));
    const firstB = Math.min(...b.pages.map((p) => p.pageIndex));
    return firstA - firstB;
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface BuildPageOrderingInput {
  pageMetas: PageMetaSummary[];
}

/**
 * Cluster pages by exam fingerprint, then sort each cluster by the best
 * available signal. The caller receives a deterministic ordering plus a
 * pageIndex → clusterId map for downstream per-cluster processing.
 */
export function buildPageOrdering(
  input: BuildPageOrderingInput,
): PageOrderingResult {
  const warnings: string[] = [];

  // Group by fingerprint.
  const byFingerprint = new Map<string, PageMetaSummary[]>();
  for (const meta of input.pageMetas) {
    const fp = fingerprintFor(meta);
    const bucket = byFingerprint.get(fp);
    if (bucket) bucket.push(meta);
    else byFingerprint.set(fp, [meta]);
  }

  // Build clusters with in-cluster sort.
  const rawClusters: PageCluster[] = [];
  let clusterIndex = 0;
  for (const [fingerprint, pages] of byFingerprint.entries()) {
    const { sorted, basis } = sortCluster(pages);
    if (basis === "inputOrder" && pages.length > 1) {
      warnings.push(
        `cluster ${fingerprint} (${pages.length} pages) sorted by upload order — no pageNumber / questionNumber available`,
      );
    }
    rawClusters.push({
      clusterId: `cluster-${clusterIndex}`,
      fingerprint,
      pages: sorted,
    });
    clusterIndex += 1;
  }

  // Order clusters across the job by their earliest pageIndex.
  const clusters = sortClusters(rawClusters);

  // Flatten + build lookup maps.
  const orderedPages: PageMetaSummary[] = [];
  const clusterIdByPageIndex = new Map<number, string>();
  const orderRank = new Map<number, number>();
  let rank = 0;
  for (const cluster of clusters) {
    for (const page of cluster.pages) {
      orderedPages.push(page);
      clusterIdByPageIndex.set(page.pageIndex, cluster.clusterId);
      orderRank.set(page.pageIndex, rank);
      rank += 1;
    }
  }

  if (clusters.length > 1) {
    warnings.push(
      `detected ${clusters.length} test-booklet clusters in a single job — pages will be processed per cluster`,
    );
  }

  return {
    orderedPages,
    clusters,
    clusterIdByPageIndex,
    orderRank,
    warnings,
  };
}
