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
import { m1SourceMatchMethod } from "@/lib/extraction/m1-draft-persistence";
import {
  restoreM1PassageBatch,
  type M1PassageRestorationResult,
} from "./_lib/m1-passage-restoration";
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
  /** True if the group contains at least one PASSAGE_BODY block. Listening
   *  problems (수능 영어 1~17번) have only QUESTION_STEM + CHOICE blocks — no
   *  passage exists on the page. We skip the grounded restoration call for
   *  those groups so the model does not hallucinate phantom passages from
   *  the audio script. */
  hasPassageBody: boolean;
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

/**
 * Build a chunk from every block in a single grouping (groupId).
 *
 * `assignGroupIds` already clusters one logical "문제" together — passage body
 * + its question stems + choices + explanation share one groupId. EXAM_META /
 * HEADER / FOOTER / DIAGRAM / NOISE land with `groupId = null` and are
 * filtered out by the caller before reaching here.
 *
 * The draft's `rawText` is the concatenation of every block in the group (in
 * `order` ascending, separated by blank lines) so the review UI shows the
 * problem as a whole — number, instruction, passage, choices — instead of
 * the passage body alone. Boundary metadata (continuesFromPrevious /
 * continuesToNext, restoredText, restorationChanges from the OCR pass) is
 * read from the anchor PASSAGE_BODY in the group, if any.
 */
function readM1PassageGroupChunk(
  groupId: string,
  groupItems: ExtractionItemSnapshot[],
): M1PassageChunk | null {
  if (groupItems.length === 0) return null;

  const ordered = [...groupItems].sort((a, b) => a.order - b.order);
  // The user-visible "문제 원문" must reproduce the entire problem the way it
  // appeared on the page. We keep:
  //   - PASSAGE_BODY / QUESTION_STEM / CHOICE / EXPLANATION (always content)
  //   - DIAGRAM — the OCR labels boxed sentences (삽입형 정답 후보 문장 등)
  //               as DIAGRAM, but the content is part of the problem text and
  //               must NOT be hidden from the teacher.
  // EXAM_META / HEADER / FOOTER / NOISE were filtered out by the caller before
  // this point, so anything that survives is fair game.
  const visible = ordered.filter((item) => item.content.trim().length > 0);
  if (visible.length === 0) return null;

  const rawText = visible
    .map((item) => item.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n")
    .trim();
  if (!rawText) return null;

  const anchor = ordered.find((item) => item.blockType === "PASSAGE_BODY") ?? null;
  const meta = anchor?.passageMeta ?? null;
  const restoredValue = meta?.restoredText;
  const restoredText =
    typeof restoredValue === "string" && restoredValue.trim().length > 0
      ? restoredValue.trim()
      : rawText;

  const sourcePageIndex = uniqueSorted(
    ordered.flatMap((item) => item.sourcePageIndex),
  );
  const changes = Array.isArray(meta?.restorationChanges)
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
          sourcePageIndex: anchor?.sourcePageIndex ?? sourcePageIndex,
        }))
    : [];

  const groupConfidences = ordered
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number");
  const confidence =
    typeof anchor?.confidence === "number"
      ? anchor.confidence
      : groupConfidences.length > 0
        ? groupConfidences.reduce((sum, value) => sum + value, 0) /
          groupConfidences.length
        : null;

  return {
    groupId,
    sourcePageIndex,
    rawText,
    restoredText,
    restorationStatus: readM1RestorationStatus(meta?.restorationStatus),
    restorationChanges: changes,
    restorationWarnings: asStringArray(meta?.restorationWarnings),
    continuesFromPrevious: meta?.continuesFromPrevious === true,
    continuesToNext: meta?.continuesToNext === true,
    confidence,
    boundaryConfidence: asNumber(meta?.boundaryConfidence),
    hasPassageBody: anchor !== null,
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
  return m1SourceMatchMethod(match, index);
}

const PASSAGE_QUESTION_TYPE_VALUES = new Set([
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "PURPOSE",
  "MOOD_TONE",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "CONDITIONAL_WRITING",
  "TEXTBOOK_DETAIL",
  "DIALOGUE_ORDER",
  "DIALOGUE_RESPONSE",
  "KOREAN_TRANSLATION",
  "ENGLISH_DEFINITION",
  "UNKNOWN",
]);

function normalizeAnalysisQuestionType(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const upper = value.toUpperCase().replace(/[\s-]+/g, "_");
  return PASSAGE_QUESTION_TYPE_VALUES.has(upper) ? upper : "UNKNOWN";
}

/**
 * Convert 1st-pass `questionMeta.analysis` payloads into the
 * `ProblemEvidenceResponse` shape that 2nd-pass `restoreM1Passage` expects.
 *
 * The 1st OCR call now performs question-type classification + answer
 * inference inline, so the 2nd-pass call no longer needs a separate Gemini
 * round-trip to compute problem evidence. We just shape the existing analysis
 * data into the response type the restoration pipeline already consumes.
 */
function buildProblemEvidenceFromItems(
  items: ExtractionItemSnapshot[],
  groupIds: Set<string>,
): import("@/lib/extraction/problem-evidence").ProblemEvidenceResponse | null {
  const questionItems = items
    .filter(
      (item) =>
        item.blockType === "QUESTION_STEM" &&
        item.groupId !== null &&
        groupIds.has(item.groupId),
    )
    .sort((a, b) => a.order - b.order);
  if (questionItems.length === 0) return null;

  const questions = questionItems.map((q) => {
    const meta =
      q.questionMeta && typeof q.questionMeta === "object"
        ? (q.questionMeta as Record<string, unknown>)
        : null;
    const analysis =
      meta?.analysis && typeof meta.analysis === "object"
        ? (meta.analysis as Record<string, unknown>)
        : null;
    const questionNumber = typeof meta?.number === "number" ? meta.number : null;
    const questionType = normalizeAnalysisQuestionType(analysis?.questionType);
    const typeLabel =
      typeof analysis?.typeLabel === "string" && analysis.typeLabel.trim()
        ? analysis.typeLabel
        : questionType;
    const answer =
      typeof analysis?.answer === "string" && analysis.answer.trim()
        ? analysis.answer
        : null;
    const answerConfidence =
      typeof analysis?.answerConfidence === "number"
        ? analysis.answerConfidence
        : null;
    const evidence = Array.isArray(analysis?.evidence)
      ? analysis.evidence.filter((e): e is string => typeof e === "string")
      : [];
    const warnings = Array.isArray(analysis?.warnings)
      ? analysis.warnings.filter((w): w is string => typeof w === "string")
      : [];
    return {
      questionNumber,
      questionType: questionType as
        | "BLANK_INFERENCE"
        | "BLANK_WORD"
        | "BLANK_SENTENCE"
        | "CONNECTOR"
        | "SENTENCE_ORDER"
        | "PARAGRAPH_ORDER"
        | "SENTENCE_INSERT"
        | "IRRELEVANT"
        | "GRAMMAR_ERROR"
        | "GRAMMAR_CORRECTION"
        | "VOCAB_CHOICE"
        | "CONTEXT_MEANING"
        | "REFERENCE"
        | "CONTENT_MATCH"
        | "TOPIC_MAIN_IDEA"
        | "TITLE"
        | "PURPOSE"
        | "MOOD_TONE"
        | "SUMMARY_COMPLETE"
        | "WORD_ORDER"
        | "SENTENCE_TRANSFORM"
        | "CONDITIONAL_WRITING"
        | "TEXTBOOK_DETAIL"
        | "DIALOGUE_ORDER"
        | "DIALOGUE_RESPONSE"
        | "KOREAN_TRANSLATION"
        | "ENGLISH_DEFINITION"
        | "UNKNOWN",
      typeLabel,
      confidence: answerConfidence ?? 0.5,
      stem: q.content,
      answer,
      answerConfidence,
      evidence,
      restorationActions: [],
      warnings,
    };
  });

  const solvedCount = questions.filter((q) => q.answer != null).length;
  const status: "SOLVED" | "PARTIAL" | "NO_QUESTIONS" =
    solvedCount === questions.length
      ? "SOLVED"
      : solvedCount > 0
        ? "PARTIAL"
        : "NO_QUESTIONS";
  const confidence =
    questions.length > 0
      ? questions.reduce((sum, q) => sum + q.confidence, 0) / questions.length
      : 0;
  return {
    status,
    confidence,
    sourceHints: [],
    questions,
    globalActions: [],
    unresolved: [],
    warnings: [],
  };
}

async function persistM1PassageDrafts(input: {
  jobId: string;
  academyId: string;
  sourceMaterialId: string | null;
  items: ExtractionItemSnapshot[];
}): Promise<{ draftCount: number; changeCount: number }> {
  // STEM-led grouping (new in 20260512.3).
  //
  // The previous PASSAGE-led approach (using `assignGroupIds`'s `groupId`)
  // had an off-by-one problem on independent sequential problems: a new
  // PASSAGE_BODY opened a new group, but the QUESTION_STEM that owned that
  // passage was still in the PREVIOUS group, leaving passage and stem
  // mismatched in every other draft.
  //
  // The new approach walks blocks in reading order (by `order`) and:
  //   - Skips EXAM_META / HEADER / FOOTER / NOISE (page chrome).
  //   - Starts a NEW bucket on every QUESTION_STEM that carries a real
  //     `questionNumber`.
  //   - Buffers QUESTION_STEMs without a number (shared instructions like
  //     "[31~34] 다음 빈칸에 들어갈 말로...") and attaches them to the next
  //     real stem.
  //   - Merges consecutive stems that share the same `sharedPassageRange`
  //     (case A: "[2~4] 다음 글을 읽고..." — one passage, multiple questions).
  //   - PASSAGE_BODY / CHOICE / EXPLANATION / DIAGRAM blocks join the current
  //     bucket (or open a new bucket if no stem has been seen yet — covers
  //     case A where the passage precedes its stems).
  const EXCLUDED_BLOCK_TYPES = new Set([
    "EXAM_META",
    "HEADER",
    "FOOTER",
    "NOISE",
  ]);
  const candidates = [...input.items]
    .filter((item) => !EXCLUDED_BLOCK_TYPES.has(item.blockType))
    .sort((a, b) => a.order - b.order);

  const readSharedRange = (
    item: ExtractionItemSnapshot,
  ): string | null => {
    if (item.blockType === "QUESTION_STEM") {
      const meta = item.questionMeta as Record<string, unknown> | null;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const range = meta.sharedPassageRange;
        if (typeof range === "string" && range.trim().length > 0) {
          return range.trim();
        }
      }
    } else if (item.blockType === "PASSAGE_BODY") {
      const pmeta = item.passageMeta as Record<string, unknown> | null;
      if (pmeta && typeof pmeta === "object" && !Array.isArray(pmeta)) {
        const range = pmeta.questionRange;
        if (typeof range === "string" && range.trim().length > 0) {
          return range.trim();
        }
      }
    }
    return null;
  };
  const readQuestionNumber = (
    item: ExtractionItemSnapshot,
  ): number | null => {
    if (item.blockType !== "QUESTION_STEM") return null;
    const meta = item.questionMeta as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const num = meta.number;
    return typeof num === "number" && Number.isFinite(num) ? num : null;
  };

  // STEM-led grouping with PASSAGE-before-STEM support.
  //
  // The OCR reading order on Korean exam pages places PASSAGE_BODY blocks
  // BEFORE the numbered QUESTION_STEM in many cases (especially blank
  // inference / 어법 / 어휘 problems where the page has [passage] above
  // [stem with blank or marker]). A naive "STEM starts a new bucket and
  // everything else gets appended" rule mis-attaches each passage to the
  // PREVIOUS question's bucket (after that question's choices have been
  // emitted but before the next stem arrives).
  //
  // To handle PASSAGE-before-STEM correctly we:
  //   - Buffer PASSAGE_BODY / shared-instruction / orphan CHOICE blocks
  //     into `pendingBlocks` until the next numbered STEM arrives.
  //   - On STEM, open a new bucket and prepend the pending blocks.
  //   - Track whether the current bucket has already received a CHOICE
  //     (`currentBucketHasChoice`). Once that flag is on, a NEW PASSAGE_BODY
  //     belongs to the NEXT problem and goes back to `pendingBlocks`
  //     instead of being appended to the current bucket. (A page-boundary
  //     continuation of the SAME passage arrives before any choice, so it
  //     still goes into the current bucket.)
  //   - `currentBucketIsSharedPassage` only flips true when the bucket
  //     opens with a PASSAGE_BODY that carries an explicit
  //     `sharedPassageRange` — that's the case A `[2~4] 다음 글을 읽고…`
  //     marker. Stem-opened buckets do not accept shared-range merging.
  const buckets: ExtractionItemSnapshot[][] = [];
  let pendingBlocks: ExtractionItemSnapshot[] = [];
  let currentBucket: ExtractionItemSnapshot[] | null = null;
  let currentSharedRange: string | null = null;
  let currentBucketIsSharedPassage = false;
  let currentBucketHasChoice = false;

  const openBucketWithStem = (
    stem: ExtractionItemSnapshot,
    stemRange: string | null,
  ): ExtractionItemSnapshot[] => {
    const bucket: ExtractionItemSnapshot[] = [];
    // pending blocks (passage / shared instructions / orphan content) go
    // in FIRST so the bucket reads like [passage, stem, choices].
    let openingPassageRange: string | null = null;
    for (const p of pendingBlocks) {
      bucket.push(p);
      if (
        openingPassageRange === null &&
        p.blockType === "PASSAGE_BODY"
      ) {
        openingPassageRange = readSharedRange(p);
      }
    }
    pendingBlocks = [];
    bucket.push(stem);
    buckets.push(bucket);
    currentSharedRange = openingPassageRange ?? stemRange;
    // Case-A guard: only treat this as a shared-passage bucket if the
    // opening PASSAGE_BODY actually carried a `sharedPassageRange` marker
    // ([2~4] style). Stem-opened buckets (no pending passage) stay
    // independent even if subsequent stems share the same range tag.
    currentBucketIsSharedPassage = openingPassageRange !== null;
    currentBucketHasChoice = false;
    return bucket;
  };

  for (const item of candidates) {
    if (item.blockType === "QUESTION_STEM") {
      const qnum = readQuestionNumber(item);
      const range = readSharedRange(item);
      if (qnum === null) {
        // Shared instruction stem ("[N~M] 다음 글을 읽고..." style, no own
        // questionNumber). Two sub-cases:
        //
        //   (a) Instruction's sharedPassageRange differs from the current
        //       bucket's range — this signals the START of a NEW problem
        //       set (e.g. Q40 finished, "[41~42]" stem arrives → Q41-42
        //       group starts). We CLOSE the current bucket and push the
        //       instruction to pendingBlocks so the next numbered stem
        //       opens a fresh bucket with this instruction prepended.
        //   (b) Instruction's range matches current range (or instruction
        //       has no range, or we're already pre-bucket) — fold into the
        //       current bucket / pending queue as before.
        const instRange = range;
        const isNewSet =
          currentBucket !== null &&
          instRange !== null &&
          instRange !== currentSharedRange;
        if (isNewSet) {
          currentBucket = null;
          currentSharedRange = null;
          currentBucketIsSharedPassage = false;
          currentBucketHasChoice = false;
          pendingBlocks.push(item);
          continue;
        }
        if (currentBucket) currentBucket.push(item);
        else pendingBlocks.push(item);
        continue;
      }
      // Real numbered stem.
      const matchesCurrentShared =
        currentBucket !== null &&
        currentSharedRange !== null &&
        range !== null &&
        range === currentSharedRange &&
        currentBucketIsSharedPassage;
      if (matchesCurrentShared && currentBucket) {
        // Case A continuation — additional stem sharing the same passage.
        currentBucket.push(item);
      } else {
        currentBucket = openBucketWithStem(item, range);
      }
      continue;
    }
    if (item.blockType === "PASSAGE_BODY") {
      // A passage arriving AFTER a choice has already been emitted in the
      // current bucket is the start of the next problem — buffer it.
      // Otherwise (no current bucket OR no choice yet in current bucket)
      // it's either an orphan opening the next bucket OR a continuation
      // of the same problem's passage (page-boundary split).
      if (currentBucket && !currentBucketHasChoice) {
        currentBucket.push(item);
      } else {
        pendingBlocks.push(item);
      }
      continue;
    }
    if (item.blockType === "CHOICE") {
      if (currentBucket) {
        currentBucket.push(item);
        currentBucketHasChoice = true;
      } else {
        // Orphan choice with no bucket yet — rare. Buffer so the next stem
        // (if any) absorbs it; otherwise it gets attached to whatever
        // bucket forms next.
        pendingBlocks.push(item);
      }
      continue;
    }
    // EXPLANATION / DIAGRAM
    if (currentBucket) {
      currentBucket.push(item);
    } else {
      pendingBlocks.push(item);
    }
  }
  // Trailing pending blocks (passage / shared instructions / orphan content)
  // with no following stem — append to the last bucket if any, otherwise
  // drop. Rare: usually a footer/header at end that already got filtered.
  if (pendingBlocks.length > 0 && buckets.length > 0) {
    buckets[buckets.length - 1].push(...pendingBlocks);
    pendingBlocks = [];
  }

  const chunks: M1PassageChunk[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    const groupId = `bucket-${i}`;
    const chunk = readM1PassageGroupChunk(groupId, buckets[i]);
    if (chunk) chunks.push(chunk);
  }

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

  // 복원 호출을 그룹별 1회씩 하지 않고 한 번에 묶어서 처리한다.
  // - Google Search 도구 호출당 과금($0.035)이 비용의 ~80%인 점을 고려해
  //   호출 수 자체를 줄이는 게 큰 효과. 10 drafts/call 로 25회→3회 수준 절감.
  // - 호출 스킵 판정(듣기/sub-question)은 그대로 유지. 호출 대상만 batch.
  //
  // 단순히 "PASSAGE_BODY 블록이 없으면 스킵" 으로 하면 빈칸 추론처럼 본문이
  // QUESTION_STEM 안에 통째로 들어간 케이스도 스킵돼서 복원이 누락된다.
  // 그래서 두 조건 중 하나라도 만족하면 복원 호출:
  //   1) 그룹에 PASSAGE_BODY 블록이 명시적으로 존재
  //   2) 또는 raw text 총 길이가 400 자 이상
  const SHORT_CONTENT_THRESHOLD = 400;

  // Pre-pass: per-group metadata 계산 + skip 판정.
  interface PrepStage1 {
    index: number;
    group: M1PassageChunk[];
    rawText: string;
    sourcePageIndex: number[];
    sourceGroupIds: Set<string>;
    questions: RestorationQuestionInput[];
    problemEvidence: ReturnType<typeof buildProblemEvidenceFromItems>;
    shouldRestore: boolean;
  }
  const stage1: PrepStage1[] = groups.map((group, index) => {
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
    const problemEvidence = buildProblemEvidenceFromItems(
      input.items,
      sourceGroupIds,
    );
    const groupHasPassage = group.some((chunk) => chunk.hasPassageBody);
    const shouldRestore =
      groupHasPassage || rawText.length >= SHORT_CONTENT_THRESHOLD;
    return {
      index,
      group,
      rawText,
      sourcePageIndex,
      sourceGroupIds,
      questions,
      problemEvidence,
      shouldRestore,
    };
  });

  // 호출 대상만 추려서 batch 호출.
  const restorationTargets = stage1.filter((s) => s.shouldRestore);
  const restorationResults = await restoreM1PassageBatch(
    restorationTargets.map((s) => ({
      academyId: input.academyId,
      rawText: s.rawText,
      questions: s.questions,
      problemEvidence: s.problemEvidence,
    })),
  );

  // 호출 대상의 결과를 stage1.index 로 다시 매핑.
  const restorationByIndex = new Map<
    number,
    M1PassageRestorationResult
  >();
  restorationTargets.forEach((s, i) => {
    restorationByIndex.set(s.index, restorationResults[i]);
  });

  // 스킵 케이스용 기본 결과.
  const buildSkippedRestoration = (
    rawText: string,
  ): M1PassageRestorationResult => ({
    restoredText: rawText,
    status: "NO_RESTORATION_NEEDED" as M1RestorationStatus,
    confidence: null,
    warnings: [],
    changes: [],
    metadata: {
      reason: "no_passage_body_and_short_content",
      rawLength: rawText.length,
      threshold: SHORT_CONTENT_THRESHOLD,
    } as Prisma.InputJsonValue,
    sourceMatches: [] as SourceMatchInput[],
  });

  const preparedGroups: PreparedM1PassageDraftGroup[] = stage1.map((s) => {
    const restoration = s.shouldRestore
      ? (restorationByIndex.get(s.index) ?? buildSkippedRestoration(s.rawText))
      : buildSkippedRestoration(s.rawText);
    const confidenceValues = s.group
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
    return {
      passageOrder: s.index,
      rawText: s.rawText,
      sourcePageIndex: s.sourcePageIndex,
      restoredText: restoration.restoredText,
      restorationStatus: restoration.status,
      confidence: restoration.confidence ?? extractionConfidence,
      warnings: [
        ...s.group.flatMap((chunk) => chunk.restorationWarnings),
        ...restoration.warnings,
      ],
      metadata: {
        chunks: s.group.map((chunk) => ({
          sourcePageIndex: chunk.sourcePageIndex,
          continuesFromPrevious: chunk.continuesFromPrevious,
          continuesToNext: chunk.continuesToNext,
          boundaryConfidence: chunk.boundaryConfidence,
        })),
        questions: s.questions.map((question) => ({
          questionNumber: question.questionNumber,
          stem: question.stem,
          choices: question.choices,
        })),
        ...restorationMetadata,
      } as Prisma.InputJsonValue,
      changes: restoration.changes.map((change) => ({
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: s.sourcePageIndex,
      })),
      sourceMatches: restoration.sourceMatches,
    };
  });

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
