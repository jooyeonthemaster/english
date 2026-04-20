// ============================================================================
// extraction-finalize — terminal state aggregation + segmentation.
//
// Triggered by extraction-page after the last page reaches a terminal state,
// and also by the reaper (safety net) if page-level triggering missed.
// Fully idempotent — checks job.status before mutating.
//
// Mode-aware behaviour:
//   - M1 PASSAGE_ONLY : classic regex-based passage segmentation over the
//                       per-page OCR text. Emits ExtractionResult drafts.
//   - M2 QUESTION_SET : ExtractionItem rows are already persisted by the page
//                       worker. finalize assigns groupId / parentItemId /
//                       global order, creates a SourceMaterial record, and
//                       emits one ExtractionResult per clustered passage for
//                       the legacy review UI.
//   - M4 FULL_EXAM    : Same as M2 plus: SourceMaterial uses EXAM_META blocks
//                       as primary signal, content hash spans every passage.
//   - M3 EXPLANATION  : Treated like M1 for now (feature-gated).
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import type { Prisma, ExtractionItem as ExtractionItemRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assignGroupIds,
  buildEnrichedDrafts,
  segmentPages,
  type StructuredBlockDraft,
} from "@/lib/extraction/segmentation";
import { parseSourceMeta, computeContentHash } from "@/lib/extraction/meta-parser";
import type {
  BlockType,
  ExtractionItemSnapshot,
  ExtractionItemStatus,
  ExtractionMode,
} from "@/lib/extraction/types";

type Input = { jobId: string };

type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

const TERMINAL: readonly JobStatus[] = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] as const;

export const extractionFinalizeTask = task({
  id: "extraction-finalize",
  queue: { name: "extraction-finalize", concurrencyLimit: 5 },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
    factor: 2,
    randomize: true,
  },
  async run(payload: Input) {
    const { jobId } = payload;

    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId },
      include: {
        pages: { orderBy: { pageIndex: "asc" } },
        items: { orderBy: { order: "asc" } },
      },
    });
    if (!job) throw new Error(`job not found: ${jobId}`);

    if (TERMINAL.includes(job.status as JobStatus)) {
      logger.info("finalize skipped — already terminal", {
        jobId,
        status: job.status,
      });
      return { skipped: true as const, status: job.status };
    }

    const pagesTerminal = job.pages.every(
      (p) => p.status === "SUCCESS" || p.status === "DEAD" || p.status === "SKIPPED",
    );
    if (!pagesTerminal || job.pages.length !== job.totalPages) {
      logger.info("finalize skipped — pages not all terminal", {
        jobId,
        pagesInDb: job.pages.length,
        expected: job.totalPages,
      });
      return { skipped: true as const };
    }

    const mode = (job.mode as ExtractionMode) ?? "PASSAGE_ONLY";
    const isStructured = mode === "QUESTION_SET" || mode === "FULL_EXAM";

    // Compute status
    let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
    if (job.successPages === job.totalPages) finalStatus = "COMPLETED";
    else if (job.successPages === 0) finalStatus = "FAILED";
    else finalStatus = "PARTIAL";

    let draftCount = 0;
    let sourceMaterialId: string | null = null;

    if (isStructured) {
      const result = await finalizeStructured({
        jobId,
        items: job.items,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    } else {
      const result = await finalizePlainText({
        jobId,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    }

    logger.info("finalize done", {
      jobId,
      mode,
      status: finalStatus,
      successPages: job.successPages,
      failedPages: job.failedPages,
      draftCount,
      sourceMaterialId,
    });

    return {
      status: finalStatus,
      draftCount,
      sourceMaterialId,
      successPages: job.successPages,
      failedPages: job.failedPages,
    };
  },
});

// ────────────────────────────────────────────────────────────────────────────
// M1 / legacy path — plain-text OCR → regex segmentation
// ────────────────────────────────────────────────────────────────────────────

interface PlainTextFinalizeInput {
  jobId: string;
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
  }>;
  mode: ExtractionMode;
  originalFileName: string | null;
  academyId: string;
  createdById: string;
  finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

async function finalizePlainText(input: PlainTextFinalizeInput): Promise<{
  draftCount: number;
  sourceMaterialId: string | null;
}> {
  const { jobId, pages, finalStatus } = input;

  // Run segmentation on successful pages.
  // (P1-3) Sort explicitly by pageIndex — the caller already passes pages
  // ordered, but re-sorting here keeps the invariant local and makes the
  // downstream contentHash reproducible across retries.
  const ocrInputs = [...pages]
    .filter((p) => p.status === "SUCCESS" && p.extractedText)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => ({
      pageIndex: p.pageIndex,
      text: p.extractedText ?? "",
      confidence: p.confidence,
    }));
  const drafts = segmentPages(ocrInputs);

  // SourceMaterial suggestion — only when we have at least some text.
  let sourceMaterialId: string | null = null;
  const successTexts = ocrInputs.map((p) => p.text).filter(Boolean);
  if (finalStatus !== "FAILED" && successTexts.length > 0) {
    sourceMaterialId = await ensureSourceMaterial({
      jobId,
      academyId: input.academyId,
      createdById: input.createdById,
      mode: input.mode,
      filename: input.originalFileName,
      page1Text: ocrInputs[0]?.text ?? "",
      allTexts: successTexts,
    });
  }

  await prisma.$transaction(async (tx) => {
    // Re-run safe: wipe any existing DRAFT results (user edits preserved
    // via REVIEWED / SAVED status).
    await tx.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    });
    for (const d of drafts) {
      await tx.extractionResult.create({
        data: {
          jobId,
          passageOrder: d.passageOrder,
          sourcePageIndex: d.sourcePageIndex,
          title: d.title,
          content: d.content,
          meta: (d.meta as Prisma.InputJsonValue) ?? undefined,
          confidence: d.confidence,
          status: "DRAFT",
        },
      });
    }
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      },
    });
  });

  return { draftCount: drafts.length, sourceMaterialId };
}

// ────────────────────────────────────────────────────────────────────────────
// M2 / M4 path — structured blocks → groupId / parent / SourceMaterial
// ────────────────────────────────────────────────────────────────────────────

interface StructuredFinalizeInput {
  jobId: string;
  items: ExtractionItemRow[];
  pages: Array<{
    pageIndex: number;
    status: string;
    extractedText: string | null;
    confidence: number | null;
  }>;
  mode: ExtractionMode;
  originalFileName: string | null;
  academyId: string;
  createdById: string;
  finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
}

async function finalizeStructured(input: StructuredFinalizeInput): Promise<{
  draftCount: number;
  sourceMaterialId: string | null;
}> {
  const { jobId, items, pages, finalStatus } = input;

  // ── 1) Rebuild StructuredBlockDraft[] from the DB, with deterministic per-page order.
  //
  // The page worker stored each block with `order = pageIndex * 1000 + i`,
  // so for each page we re-derive `order` as the 0-based index within the
  // page — which is what assignGroupIds() expects (and what localIdFor()
  // uses to build parentLocalId = "pageIndex:order").
  const byPage = new Map<number, ExtractionItemRow[]>();
  for (const item of items) {
    const pIdx = item.sourcePageIndex[0] ?? 0;
    const arr = byPage.get(pIdx);
    if (arr) arr.push(item);
    else byPage.set(pIdx, [item]);
  }
  // Stable sort within each page by original DB `order`, so the per-page
  // index matches the sequence the worker inserted them in.
  for (const [, arr] of byPage) {
    arr.sort((a, b) => a.order - b.order);
  }

  // Build drafts and remember the DB id at each (pageIndex, perPageOrder).
  //
  // (P1-2) The worker writes `questionMeta = { number: <n> }` exclusively.
  // Earlier drafts of finalize accepted a legacy `questionNumber` key too,
  // which masked write-side drift. We now read ONLY `number` — if a block
  // is missing it, that's a worker-side bug worth surfacing. Same rule
  // applies to choiceMeta: only `{ index, label, isAnswer }` is written,
  // never `choiceIndex`.
  const drafts: StructuredBlockDraft[] = [];
  const localIdToDbId = new Map<string, string>();
  const sortedPageIndexes = [...byPage.keys()].sort((a, b) => a - b);
  for (const pageIndex of sortedPageIndexes) {
    const pageItems = byPage.get(pageIndex) ?? [];
    pageItems.forEach((item, perPageOrder) => {
      const questionMeta = item.questionMeta as
        | { number?: unknown }
        | null;
      const choiceMeta = item.choiceMeta as
        | { index?: unknown; isAnswer?: unknown }
        | null;

      const questionNumber =
        typeof questionMeta?.number === "number"
          ? (questionMeta.number as number)
          : null;
      const choiceIndex =
        typeof choiceMeta?.index === "number"
          ? (choiceMeta.index as number)
          : null;
      const isAnswer =
        typeof choiceMeta?.isAnswer === "boolean"
          ? (choiceMeta.isAnswer as boolean)
          : null;

      const examMeta =
        item.examMeta && typeof item.examMeta === "object"
          ? (item.examMeta as Record<string, unknown>)
          : null;

      drafts.push({
        pageIndex,
        blockType: item.blockType as BlockType,
        content: item.content,
        rawText: item.rawText ?? item.content,
        confidence: item.confidence,
        questionNumber,
        choiceIndex,
        isAnswer,
        examMeta,
        order: perPageOrder,
      });
      localIdToDbId.set(`${pageIndex}:${perPageOrder}`, item.id);
    });
  }

  // ── 2) Cluster blocks into groups + resolve parentLocalId → DB id.
  const clustered = assignGroupIds(drafts);

  // Assign a stable *global* order across all blocks (page-major, then per-page
  // order). This matches how the review UI sorts.
  const withGlobalOrder = clustered.map((c, idx) => ({
    ...c,
    globalOrder: idx,
  }));

  // ── 3) SourceMaterial — derive from EXAM_META + page 1 text + filename.
  //
  // (P1-3) contentHash must be deterministic across retries. `drafts` is
  // already built by walking `sortedPageIndexes` (asc) and stable-sorted
  // within each page, so PASSAGE_BODY iteration order is already stable
  // — but we explicitly re-sort by (pageIndex, order) before concat to
  // guarantee stability even if upstream ordering drifts later. Same for
  // the fallback path that uses `pages[].extractedText`.
  const page1Text = drafts
    .filter((d) => d.pageIndex === 0)
    .map((d) => d.content)
    .join("\n");
  const allPassageTexts = drafts
    .filter((d) => d.blockType === "PASSAGE_BODY")
    .slice()
    .sort((a, b) =>
      a.pageIndex !== b.pageIndex
        ? a.pageIndex - b.pageIndex
        : a.order - b.order,
    )
    .map((d) => d.content);
  const examMetaSignals = drafts
    .filter((d) => d.blockType === "EXAM_META")
    .map((d) => ({ content: d.content, meta: d.examMeta }));

  const fallbackPageTexts = [...pages]
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => p.extractedText ?? "")
    .filter(Boolean);

  let sourceMaterialId: string | null = null;
  if (finalStatus !== "FAILED" && drafts.length > 0) {
    sourceMaterialId = await ensureSourceMaterial({
      jobId,
      academyId: input.academyId,
      createdById: input.createdById,
      mode: input.mode,
      filename: input.originalFileName,
      page1Text,
      allTexts:
        allPassageTexts.length > 0 ? allPassageTexts : fallbackPageTexts,
      examMetaSignals,
    });
  }

  // ── 4) Build ExtractionItemSnapshot[] for buildEnrichedDrafts (needs
  //       resolved parentItemId and groupId).
  const snapshotItems: ExtractionItemSnapshot[] = withGlobalOrder.map(
    (c, idx) => {
      const localId = `${c.pageIndex}:${c.order}`;
      const dbId = localIdToDbId.get(localId);
      const parentDbId = c.parentLocalId
        ? localIdToDbId.get(c.parentLocalId) ?? null
        : null;
      const originalItem = items.find((it) => it.id === dbId);
      return {
        id: dbId ?? `synthetic-${idx}`,
        jobId,
        pageId: originalItem?.pageId ?? null,
        sourcePageIndex: [c.pageIndex],
        blockType: c.blockType,
        groupId: c.groupId,
        parentItemId: parentDbId,
        order: idx,
        localOrder: null,
        title: originalItem?.title ?? null,
        content: c.content,
        rawText: c.rawText,
        // (P1-2) Round-trip the worker's canonical meta shape:
        // questionMeta = { number }, choiceMeta = { index, isAnswer }.
        // Anything else (legacy `questionNumber`, `choiceIndex`) is rejected
        // at read time above and therefore never reaches this point.
        questionMeta:
          c.questionNumber !== null
            ? { number: c.questionNumber }
            : null,
        choiceMeta:
          c.choiceIndex !== null || c.isAnswer !== null
            ? {
                index: c.choiceIndex,
                isAnswer: c.isAnswer === true,
              }
            : null,
        passageMeta:
          c.blockType === "PASSAGE_BODY"
            ? { wordCount: c.content.split(/\s+/).filter(Boolean).length }
            : null,
        examMeta: c.examMeta as Record<string, unknown> | null,
        boundingBox: null,
        confidence: c.confidence,
        needsReview:
          typeof c.confidence === "number" ? c.confidence < 0.7 : false,
        status: (originalItem?.status as ExtractionItemStatus) ?? "DRAFT",
        promotedTo: originalItem?.promotedTo ?? null,
      };
    },
  );

  const enriched = buildEnrichedDrafts(snapshotItems);

  // ── 5) Persist everything in one transaction.
  await prisma.$transaction(async (tx) => {
    // 5a) Update every ExtractionItem with groupId / parentItemId / final order.
    for (let i = 0; i < withGlobalOrder.length; i++) {
      const c = withGlobalOrder[i];
      const localId = `${c.pageIndex}:${c.order}`;
      const dbId = localIdToDbId.get(localId);
      if (!dbId) continue;
      const parentDbId = c.parentLocalId
        ? localIdToDbId.get(c.parentLocalId) ?? null
        : null;
      await tx.extractionItem.update({
        where: { id: dbId },
        data: {
          groupId: c.groupId,
          parentItemId: parentDbId,
          order: c.globalOrder,
        },
      });
    }

    // 5b) Re-run safe: wipe existing DRAFT results.
    await tx.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    });

    for (const d of enriched) {
      const resultMeta = {
        ...(d.meta ?? {}),
        groupId: d.passageItemId ?? null,
        questions: d.questions.map((q) => ({
          questionItemId: q.questionItemId,
          questionNumber: q.questionNumber,
          stem: q.stem,
          choices: q.choices.map((c) => ({
            itemId: c.itemId,
            label: c.label,
            content: c.content,
            isAnswer: c.isAnswer,
          })),
          explanation: q.explanation,
        })),
        examMeta: d.examMeta ?? null,
      } satisfies Record<string, unknown>;

      await tx.extractionResult.create({
        data: {
          jobId,
          passageOrder: d.passageOrder,
          sourcePageIndex: d.sourcePageIndex,
          title: d.title,
          content: d.content,
          meta: resultMeta as Prisma.InputJsonValue,
          confidence: d.confidence,
          status: "DRAFT",
        },
      });
    }

    // 5c) Job status + sourceMaterialId
    await tx.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      },
    });
  });

  return { draftCount: enriched.length, sourceMaterialId };
}

// ────────────────────────────────────────────────────────────────────────────
// SourceMaterial creation (shared)
// ────────────────────────────────────────────────────────────────────────────

interface EnsureSourceMaterialInput {
  jobId: string;
  academyId: string;
  createdById: string;
  mode: ExtractionMode;
  filename: string | null;
  page1Text: string;
  allTexts: string[];
  examMetaSignals?: Array<{ content: string; meta: unknown }>;
}

/**
 * Create (or reuse) a SourceMaterial record for this job.
 *
 * Re-runs of finalize are possible (retries, reaper) so we:
 *   1. If job.sourceMaterialId already set → reuse it (no-op).
 *   2. Else compute contentHash and look up any existing SourceMaterial with
 *      the same hash under the same academy. Reuse on match.
 *   3. Else create a new row.
 */
async function ensureSourceMaterial(
  input: EnsureSourceMaterialInput,
): Promise<string | null> {
  const existing = await prisma.extractionJob.findUnique({
    where: { id: input.jobId },
    select: { sourceMaterialId: true },
  });
  if (existing?.sourceMaterialId) return existing.sourceMaterialId;

  const joinedHeaderText = [
    input.page1Text,
    ...(input.examMetaSignals ?? []).map((s) => s.content),
  ]
    .filter(Boolean)
    .join("\n");
  const parsed = parseSourceMeta({
    filename: input.filename ?? undefined,
    page1Text: joinedHeaderText,
  });

  const contentHash = computeContentHash(input.allTexts);

  // De-dupe by (academyId, contentHash)
  const dup = await prisma.sourceMaterial.findFirst({
    where: { academyId: input.academyId, contentHash },
    select: { id: true },
  });
  if (dup) return dup.id;

  // Pick SourceMaterial.type — prefer parsed.type, else infer from mode.
  const materialType =
    parsed.type ?? (input.mode === "FULL_EXAM" ? "EXAM" : "OTHER");

  const created = await prisma.sourceMaterial.create({
    data: {
      academyId: input.academyId,
      createdById: input.createdById,
      type: materialType,
      title: parsed.title,
      subject: parsed.subject ?? "ENGLISH",
      grade: parsed.grade ?? null,
      semester: parsed.semester ?? null,
      year: parsed.year ?? null,
      round: parsed.round ?? null,
      examType: parsed.examType ?? null,
      publisher: parsed.publisher ?? null,
      contentHash,
    },
    select: { id: true },
  });

  return created.id;
}
