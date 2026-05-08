// ============================================================================
// extraction-finalize — terminal state aggregation + segmentation.
//
// Triggered by extraction-page after the last page reaches a terminal state,
// and also by the reaper (safety net) if page-level triggering missed.
// Fully idempotent — checks job.status before mutating.
//
// Mode-aware behaviour:
//   - M1 PASSAGE_ONLY : structured page OCR + passage-centric grouping. If the
//                       model fails to emit any PASSAGE_BODY blocks, finalize
//                       falls back to the legacy regex segmenter over the
//                       per-page OCR text so the review UI is never blank.
//   - M2 QUESTION_SET : ExtractionItem rows are already persisted by the page
//                       worker. finalize assigns groupId / parentItemId /
//                       global order, creates a SourceMaterial record, and
//                       emits one ExtractionResult per clustered passage for
//                       the legacy review UI.
//   - M4 FULL_EXAM    : Same as M2 plus: SourceMaterial uses EXAM_META blocks
//                       as primary signal, content hash spans every passage.
//   - M3 EXPLANATION  : Uses the legacy plain-text segmenter for now.
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import { randomUUID } from "node:crypto";
import type { Prisma, ExtractionItem as ExtractionItemRow } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assignGroupIds,
  buildEnrichedDrafts,
  segmentPages,
  type StructuredBlockDraft,
} from "@/lib/extraction/segmentation";
import { parseSourceMeta, computeContentHash } from "@/lib/extraction/meta-parser";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import type {
  BlockType,
  ExtractionItemSnapshot,
  ExtractionItemStatus,
  ExtractionMode,
} from "@/lib/extraction/types";
import type {
  RestorationQuestionInput,
  SourceMatchInput,
} from "@/lib/extraction/m2-restoration";
import { restoreM1Passage } from "./_lib/m1-passage-restoration";
import { persistM2ExtractionDrafts } from "./_lib/m2-draft-pipeline";

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
    const isStructured = usesStructuredExtraction(mode);

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
      const originalQuestionMeta =
        originalItem?.questionMeta &&
        typeof originalItem.questionMeta === "object"
          ? (originalItem.questionMeta as Record<string, unknown>)
          : null;
      const originalChoiceMeta =
        originalItem?.choiceMeta && typeof originalItem.choiceMeta === "object"
          ? (originalItem.choiceMeta as Record<string, unknown>)
          : null;
      const originalPassageMeta =
        originalItem?.passageMeta &&
        typeof originalItem.passageMeta === "object"
          ? (originalItem.passageMeta as Record<string, unknown>)
          : null;
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
          c.questionNumber !== null || originalQuestionMeta
            ? {
                ...(originalQuestionMeta ?? {}),
                ...(c.questionNumber !== null ? { number: c.questionNumber } : {}),
              }
            : null,
        choiceMeta:
          c.choiceIndex !== null || c.isAnswer !== null || originalChoiceMeta
            ? {
                ...(originalChoiceMeta ?? {}),
                index: c.choiceIndex,
                isAnswer: c.isAnswer === true,
              }
            : null,
        passageMeta:
          c.blockType === "PASSAGE_BODY"
            ? {
                ...(originalPassageMeta ?? {}),
                wordCount: c.content.split(/\s+/).filter(Boolean).length,
              }
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
  const structuredPassageCount = snapshotItems.filter(
    (item) => item.blockType === "PASSAGE_BODY",
  ).length;
  const useLegacyFallback =
    input.mode === "PASSAGE_ONLY" &&
    (structuredPassageCount === 0 ||
      enriched.every((draft) => draft.content.trim().length === 0));
  const legacyFallbackDrafts = useLegacyFallback
    ? segmentPages(
        [...pages]
          .filter((p) => p.status === "SUCCESS" && p.extractedText)
          .sort((a, b) => a.pageIndex - b.pageIndex)
          .map((p) => ({
            pageIndex: p.pageIndex,
            text: p.extractedText ?? "",
            confidence: p.confidence,
          })),
      )
    : [];
  const structuredDraftsForResults =
    input.mode === "PASSAGE_ONLY"
      ? enriched.filter((draft) => {
          if (draft.content.trim().length > 0) return true;
          return draft.questions.some(
            (q) => q.choices.length > 0 || q.explanation !== null,
          );
        })
      : enriched;

  const itemUpdateOps = withGlobalOrder.flatMap((c) => {
    const localId = `${c.pageIndex}:${c.order}`;
    const dbId = localIdToDbId.get(localId);
    if (!dbId) return [];
    const parentDbId = c.parentLocalId
      ? localIdToDbId.get(c.parentLocalId) ?? null
      : null;
    return [
      prisma.extractionItem.update({
        where: { id: dbId },
        data: {
          groupId: c.groupId,
          parentItemId: parentDbId,
          order: c.globalOrder,
        },
      }),
    ];
  });

  const resultRows: Prisma.ExtractionResultCreateManyInput[] =
    useLegacyFallback
      ? legacyFallbackDrafts.map((d) => ({
          jobId,
          passageOrder: d.passageOrder,
          sourcePageIndex: d.sourcePageIndex,
          title: d.title,
          content: d.content,
          meta: {
            ...(d.meta ?? {}),
            structuredFallback: true,
          } as Prisma.InputJsonValue,
          confidence: d.confidence,
          status: "DRAFT",
        }))
      : structuredDraftsForResults.map((d, index) => {
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

          return {
            jobId,
            passageOrder: index,
            sourcePageIndex: d.sourcePageIndex,
            title: d.title,
            content: d.content,
            meta: resultMeta as Prisma.InputJsonValue,
            confidence: d.confidence,
            status: "DRAFT",
          };
        });

  const persistOps: Prisma.PrismaPromise<unknown>[] = [
    ...itemUpdateOps,
    prisma.extractionResult.deleteMany({
      where: { jobId, status: "DRAFT" },
    }),
  ];
  if (resultRows.length > 0) {
    persistOps.push(prisma.extractionResult.createMany({ data: resultRows }));
  }
  persistOps.push(
    prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        ...(sourceMaterialId ? { sourceMaterialId } : {}),
      },
    }),
  );

  await prisma.$transaction(persistOps);

  if (input.mode === "PASSAGE_ONLY") {
    try {
      const m1DraftResult = await persistM1PassageDrafts({
        jobId,
        academyId: input.academyId,
        sourceMaterialId,
        items: snapshotItems,
      });
      logger.info("m1 draft pipeline done", {
        jobId,
        ...m1DraftResult,
      });
    } catch (err) {
      logger.error("m1 draft pipeline failed", {
        jobId,
        err: err instanceof Error ? err.message : String(err),
      });
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          errorSummary: JSON.stringify({
            m1DraftPipeline: err instanceof Error ? err.message : String(err),
          }),
        },
      });
    }
  }

  if (input.mode === "QUESTION_SET") {
    try {
      const m2DraftResult = await persistM2ExtractionDrafts({
        jobId,
        academyId: input.academyId,
        sourceMaterialId,
        drafts: structuredDraftsForResults,
      });
      logger.info("m2 draft pipeline done", {
        jobId,
        ...m2DraftResult,
      });
    } catch (err) {
      logger.error("m2 draft pipeline failed", {
        jobId,
        err: err instanceof Error ? err.message : String(err),
      });
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          errorSummary: JSON.stringify({
            m2DraftPipeline: err instanceof Error ? err.message : String(err),
          }),
        },
      });
    }
  }

  return {
    draftCount: useLegacyFallback
      ? legacyFallbackDrafts.length
      : structuredDraftsForResults.length,
    sourceMaterialId,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SourceMaterial creation (shared)
// ────────────────────────────────────────────────────────────────────────────

// ----------------------------------------------------------------------------
// M1 passage drafts - raw/restored pairs for the new passage extraction room.
// ----------------------------------------------------------------------------

type M1RestorationStatus =
  | "RESTORED"
  | "NO_RESTORATION_NEEDED"
  | "PARTIAL"
  | "FAILED";

interface M1RestorationChange {
  sentenceOrder: number | null;
  before: string;
  after: string;
  changeType: string | null;
  reason: string | null;
  confidence: number | null;
  sourcePageIndex: number[];
}

interface M1PassageChunk {
  groupId: string | null;
  sourcePageIndex: number[];
  rawText: string;
  restoredText: string;
  restorationStatus: M1RestorationStatus;
  restorationChanges: M1RestorationChange[];
  restorationWarnings: string[];
  continuesFromPrevious: boolean;
  continuesToNext: boolean;
  confidence: number | null;
  boundaryConfidence: number | null;
}

interface PreparedM1PassageDraftGroup {
  passageOrder: number;
  rawText: string;
  sourcePageIndex: number[];
  restoredText: string;
  restorationStatus: M1RestorationStatus;
  confidence: number | null;
  warnings: string[];
  metadata: Prisma.InputJsonValue;
  changes: M1RestorationChange[];
  sourceMatches: SourceMatchInput[];
}

const LOCAL_DB_EXACT_THRESHOLD = 0.9;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readM1RestorationStatus(value: unknown): M1RestorationStatus {
  if (
    value === "RESTORED" ||
    value === "NO_RESTORATION_NEEDED" ||
    value === "PARTIAL" ||
    value === "FAILED"
  ) {
    return value;
  }
  return "RESTORED";
}

function readM1PassageChunk(item: ExtractionItemSnapshot): M1PassageChunk | null {
  if (item.blockType !== "PASSAGE_BODY") return null;
  const rawText = item.content.trim();
  if (!rawText) return null;

  const meta = item.passageMeta ?? {};
  const restoredValue = meta.restoredText;
  const restoredText =
    typeof restoredValue === "string" && restoredValue.trim().length > 0
      ? restoredValue.trim()
      : rawText;
  const changes = Array.isArray(meta.restorationChanges)
    ? meta.restorationChanges
        .filter((change): change is Record<string, unknown> => {
          return change !== null && typeof change === "object";
        })
        .map((change) => ({
          sentenceOrder: asNumber(change.sentenceOrder),
          before: typeof change.before === "string" ? change.before : "",
          after: typeof change.after === "string" ? change.after : "",
          changeType:
            typeof change.changeType === "string" ? change.changeType : null,
          reason: typeof change.reason === "string" ? change.reason : null,
          confidence: asNumber(change.confidence),
          sourcePageIndex: item.sourcePageIndex,
        }))
    : [];

  return {
    groupId: item.groupId,
    sourcePageIndex: item.sourcePageIndex,
    rawText,
    restoredText,
    restorationStatus: readM1RestorationStatus(meta.restorationStatus),
    restorationChanges: changes,
    restorationWarnings: asStringArray(meta.restorationWarnings),
    continuesFromPrevious: meta.continuesFromPrevious === true,
    continuesToNext: meta.continuesToNext === true,
    confidence: item.confidence,
    boundaryConfidence: asNumber(meta.boundaryConfidence),
  };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function buildRestorationQuestions(
  items: ExtractionItemSnapshot[],
  groupIds: Set<string>,
): RestorationQuestionInput[] {
  const questionItems = items
    .filter(
      (item) =>
        item.blockType === "QUESTION_STEM" &&
        item.groupId !== null &&
        groupIds.has(item.groupId),
    )
    .sort((a, b) => a.order - b.order);

  return questionItems.map((question, index) => {
    const questionNumber =
      typeof question.questionMeta?.number === "number"
        ? question.questionMeta.number
        : null;
    const choices = items
      .filter((item) => {
        if (item.blockType !== "CHOICE") return false;
        if (item.parentItemId === question.id) return true;
        return (
          item.groupId === question.groupId &&
          item.order > question.order &&
          item.order < (questionItems[index + 1]?.order ?? Number.POSITIVE_INFINITY)
        );
      })
      .sort((a, b) => a.order - b.order)
      .map((choice, choiceIndex) => ({
        label:
          typeof choice.choiceMeta?.label === "string"
            ? choice.choiceMeta.label
            : String(choiceIndex + 1),
        content: choice.content,
        isAnswer: choice.choiceMeta?.isAnswer === true,
      }));

    return {
      questionNumber,
      stem: question.content,
      choices,
      explanation: null,
    };
  });
}

function sourceMatchMethod(match: SourceMatchInput, index: number): string {
  const exact = index === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD;
  if (match.sourceType === "WEB_PAGE") {
    return exact ? "WEB_SEARCH" : "WEB_SEARCH_CANDIDATE";
  }
  return exact ? "LOCAL_DB" : "LOCAL_DB_CANDIDATE";
}

async function persistM1PassageDrafts(input: {
  jobId: string;
  academyId: string;
  sourceMaterialId: string | null;
  items: ExtractionItemSnapshot[];
}): Promise<{ draftCount: number; changeCount: number }> {
  const chunks = input.items
    .map(readM1PassageChunk)
    .filter((chunk): chunk is M1PassageChunk => chunk !== null);

  if (chunks.length === 0) {
    await prisma.extractionM1PassageDraft.deleteMany({
      where: { jobId: input.jobId, reviewStatus: "DRAFT" },
    });
    return { draftCount: 0, changeCount: 0 };
  }

  const groups: M1PassageChunk[][] = [];
  for (const chunk of chunks) {
    const previousGroup = groups[groups.length - 1];
    const previousChunk = previousGroup?.[previousGroup.length - 1];
    if (
      previousGroup &&
      previousChunk &&
      (chunk.continuesFromPrevious || previousChunk.continuesToNext)
    ) {
      previousGroup.push(chunk);
      continue;
    }
    groups.push([chunk]);
  }

  const preparedGroups: PreparedM1PassageDraftGroup[] = [];
  for (const [index, group] of groups.entries()) {
    const rawText = group.map((chunk) => chunk.rawText).join("\n\n").trim();
    const sourcePageIndex = uniqueSorted(
      group.flatMap((chunk) => chunk.sourcePageIndex),
    );
    const sourceGroupIds = new Set(
      group
        .map((chunk) => chunk.groupId)
        .filter((groupId): groupId is string => groupId !== null),
    );
    const questions = buildRestorationQuestions(input.items, sourceGroupIds);
    const restoration = await restoreM1Passage({
      academyId: input.academyId,
      rawText,
      questions,
    });
    const confidenceValues = group
      .map((chunk) => chunk.confidence)
      .filter((value): value is number => typeof value === "number");
    const extractionConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, value) => sum + value, 0) /
          confidenceValues.length
        : null;
    const restorationMetadata =
      restoration.metadata &&
      typeof restoration.metadata === "object" &&
      !Array.isArray(restoration.metadata)
        ? (restoration.metadata as Record<string, unknown>)
        : {};

    preparedGroups.push({
      passageOrder: index,
      rawText,
      sourcePageIndex,
      restoredText: restoration.restoredText,
      restorationStatus: restoration.status,
      confidence: restoration.confidence ?? extractionConfidence,
      warnings: [
        ...group.flatMap((chunk) => chunk.restorationWarnings),
        ...restoration.warnings,
      ],
      metadata: {
        chunks: group.map((chunk) => ({
          sourcePageIndex: chunk.sourcePageIndex,
          continuesFromPrevious: chunk.continuesFromPrevious,
          continuesToNext: chunk.continuesToNext,
          boundaryConfidence: chunk.boundaryConfidence,
        })),
        questions: questions.map((question) => ({
          questionNumber: question.questionNumber,
          stem: question.stem,
          choices: question.choices,
        })),
        ...restorationMetadata,
      } as Prisma.InputJsonValue,
      changes: [
        ...restoration.changes.map((change) => ({
          sentenceOrder: change.sentenceOrder ?? null,
          before: change.before,
          after: change.after,
          changeType: change.changeType ?? null,
          reason: change.reason ?? null,
          confidence: change.confidence ?? null,
          sourcePageIndex,
        })),
      ],
      sourceMatches: restoration.sourceMatches,
    });
  }

  let changeCount = 0;
  const draftRows: Prisma.ExtractionM1PassageDraftCreateManyInput[] = preparedGroups.map(
    (prepared) => ({
      id: randomUUID(),
      jobId: input.jobId,
      sourceMaterialId: input.sourceMaterialId,
      passageOrder: prepared.passageOrder,
      sourcePageIndex: prepared.sourcePageIndex,
      title: null,
      rawText: prepared.rawText,
      restoredText: prepared.restoredText,
      teacherText: prepared.restoredText,
      restorationStatus: prepared.restorationStatus,
      reviewStatus: "DRAFT",
      confidence: prepared.confidence,
      warnings:
        prepared.warnings.length > 0
          ? (prepared.warnings as Prisma.InputJsonValue)
          : undefined,
      metadata: prepared.metadata,
    }),
  );
  const draftIdByOrder = new Map(
    draftRows.map((row) => [row.passageOrder, row.id] as const),
  );
  const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
    preparedGroups.flatMap((prepared) => {
      const passageDraftId = draftIdByOrder.get(prepared.passageOrder);
      if (!passageDraftId) return [];
      changeCount += prepared.changes.length;
      return prepared.changes.map((change) => ({
        passageDraftId,
        sentenceOrder: change.sentenceOrder,
        before: change.before,
        after: change.after,
        changeType: change.changeType,
        reason: change.reason,
        confidence: change.confidence,
        sourcePageIndex: change.sourcePageIndex,
      }));
    });
  const sourceMatchRows: Prisma.ExtractionM1PassageSourceMatchCreateManyInput[] =
    preparedGroups.flatMap((prepared) => {
      const passageDraftId = draftIdByOrder.get(prepared.passageOrder);
      if (!passageDraftId) return [];
      return prepared.sourceMatches.map((match, matchIndex) => ({
        passageDraftId,
        sourceType: match.sourceType,
        sourceId: match.sourceId ?? null,
        sourceRef: match.sourceRef ?? null,
        title: match.title,
        publisher: match.publisher ?? null,
        unit: match.unit ?? null,
        year: match.year ?? null,
        confidence: match.confidence,
        method: sourceMatchMethod(match, matchIndex),
        reason: match.reason,
        selected:
          matchIndex === 0 && match.confidence >= LOCAL_DB_EXACT_THRESHOLD,
        metadata: (match.metadata ?? {}) as Prisma.InputJsonValue,
      }));
    });

  await prisma.$transaction(
    async (tx) => {
      await tx.extractionM1PassageDraft.deleteMany({
        where: { jobId: input.jobId, reviewStatus: "DRAFT" },
      });
      await tx.extractionM1PassageDraft.createMany({ data: draftRows });
      if (changeRows.length > 0) {
        await tx.extractionM1PassageDraftChange.createMany({ data: changeRows });
      }
      if (sourceMatchRows.length > 0) {
        await tx.extractionM1PassageSourceMatch.createMany({
          data: sourceMatchRows,
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  return { draftCount: groups.length, changeCount };
}

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
