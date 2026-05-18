import { randomUUID } from "node:crypto";
import { logger } from "@trigger.dev/sdk/v3";
import type { Prisma } from "@prisma/client";
import type {
  ExtractionItemSnapshot,
  M1RestorationStatus,
} from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import type { M1PassageRestorationResult } from "../../m1-passage-restoration";
import { restoreM1PassageBatch } from "../../m1-passage-restoration";
import { M1_LOCAL_DB_EXACT_THRESHOLD } from "../types";
import { sourceMatchMethod } from "./readers";
import { buildStage1, type PrepStage1 } from "./stage1";
import { buildStemLedChunks } from "./stem-grouping";
import { SHORT_CONTENT_THRESHOLD } from "./constants";

export interface PersistM1PassageDraftsInput {
  jobId: string;
  academyId: string;
  sourceMaterialId: string | null;
  items: ExtractionItemSnapshot[];
  /**
   * Number to add to every draft's passageOrder. Used by the cluster-aware
   * caller to keep `(jobId, passageOrder)` unique across multiple clusters
   * processed in the same job. Defaults to 0 (single-cluster legacy behaviour).
   */
  passageOrderOffset?: number;
  /**
   * When true (default), this call wipes every DRAFT row for the job before
   * inserting — the original single-cluster semantics. The cluster-aware
   * caller passes `false` for every cluster after the first so subsequent
   * clusters append instead of clobbering earlier clusters' drafts.
   */
  clearExistingDrafts?: boolean;
  /**
   * When true, the grounded-restoration phase (Phase B) is returned as a
   * detached Promise instead of being awaited inside this function. The
   * caller is responsible for awaiting it. Use this to run multiple
   * clusters' restorations in parallel: keep Phase A (deleteMany + initial
   * INSERTs) serial per cluster, but fan out Phase B.
   *
   * `restorationPromise` resolves with the changeCount contributed by that
   * cluster's restoration so the caller can accumulate it after the join.
   * When restoration is deferred, the synchronous `changeCount` returned
   * here is 0 (no batches have completed yet).
   */
  deferRestoration?: boolean;
}

export interface PersistM1PassageDraftsResult {
  draftCount: number;
  changeCount: number;
  restorationPromise: Promise<number> | null;
}

export async function persistM1PassageDrafts(
  input: PersistM1PassageDraftsInput,
): Promise<PersistM1PassageDraftsResult> {
  const passageOrderOffset = input.passageOrderOffset ?? 0;
  const clearExistingDrafts = input.clearExistingDrafts ?? true;
  const deferRestoration = input.deferRestoration ?? false;

  // STEM-led grouping (the bucket-builder above) already keeps a single
  // passage on one bucket even when it spans a page boundary (continuation
  // PASSAGE_BODY blocks join `currentBucket` until a new STEM appears). The
  // earlier "merge consecutive chunks when continuesFromPrevious / to-next
  // is set" pass was a leftover from the PASSAGE-led grouping era — under
  // STEM-led, two consecutive chunks always represent two DIFFERENT problems,
  // so merging them collapses unrelated questions (e.g. Q16 + Q17 with a
  // mis-stamped `continuesToNext=true` on Q16's body). Each chunk now stays
  // its own group.
  const chunks = buildStemLedChunks(input.items);
  if (chunks.length === 0) {
    if (clearExistingDrafts) {
      await prisma.extractionM1PassageDraft.deleteMany({
        where: { jobId: input.jobId, reviewStatus: "DRAFT" },
      });
    }
    return { draftCount: 0, changeCount: 0, restorationPromise: null };
  }
  const groups = chunks.map((chunk) => [chunk]);

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
  const stage1 = buildStage1(groups);

  // 호출 대상만 추려둔다. 실제 호출은 Phase A INSERT 직후에 시작.
  const restorationTargets = stage1.filter((s) => s.shouldRestore);

  // ─── Phase A: PENDING 상태로 draft 들을 즉시 INSERT ──────────────────────
  const { initialDraftRows, draftIdByOrder, extractionConfidenceByOrder } =
    buildInitialDraftRows(input, passageOrderOffset, stage1);

  await prisma.$transaction(
    async (tx) => {
      if (clearExistingDrafts) {
        await tx.extractionM1PassageDraft.deleteMany({
          where: { jobId: input.jobId, reviewStatus: "DRAFT" },
        });
      }
      if (initialDraftRows.length > 0) {
        // `skipDuplicates: true` is the safety net for the rare double-fire
        // case where a second finalize task starts before the first one's
        // status=COMPLETED write is visible — both attempts try to insert
        // the same (jobId, passageOrder) and Prisma surfaces a unique-
        // constraint violation. With skipDuplicates the second attempt
        // silently no-ops on conflicts, the first attempt's rows remain
        // canonical, and the UI no longer reports a false "save failed".
        await tx.extractionM1PassageDraft.createMany({
          data: initialDraftRows,
          skipDuplicates: true,
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  // ─── Phase B: per-batch UPDATE as restoration results arrive ────────────
  let changeCount = 0;
  const applyRestorationResult = async (
    stageIndex: number,
    restoration: M1PassageRestorationResult,
  ) => {
    const draftId = draftIdByOrder.get(stageIndex);
    if (!draftId) return;
    const target = stage1[stageIndex];
    if (!target) return;

    const extractionConfidence =
      extractionConfidenceByOrder.get(stageIndex) ?? null;
    const restorationMetadata =
      restoration.metadata &&
      typeof restoration.metadata === "object" &&
      !Array.isArray(restoration.metadata)
        ? (restoration.metadata as Record<string, unknown>)
        : {};
    const mergedMetadata: Record<string, unknown> = {
      chunks: target.group.map((chunk) => ({
        sourcePageIndex: chunk.sourcePageIndex,
        continuesFromPrevious: chunk.continuesFromPrevious,
        continuesToNext: chunk.continuesToNext,
        boundaryConfidence: chunk.boundaryConfidence,
      })),
      questions: target.questions.map((question) => ({
        questionNumber: question.questionNumber,
        stem: question.stem,
        choices: question.choices,
      })),
      ...restorationMetadata,
    };
    const mergedWarnings = [
      ...target.group.flatMap((chunk) => chunk.restorationWarnings),
      ...restoration.warnings,
    ];

    const changeRows: Prisma.ExtractionM1PassageDraftChangeCreateManyInput[] =
      restoration.changes.map((change) => ({
        passageDraftId: draftId,
        sentenceOrder: change.sentenceOrder ?? null,
        before: change.before,
        after: change.after,
        changeType: change.changeType ?? null,
        reason: change.reason ?? null,
        confidence: change.confidence ?? null,
        sourcePageIndex: target.sourcePageIndex,
      }));
    const sourceMatchRows: Prisma.ExtractionM1PassageSourceMatchCreateManyInput[] =
      restoration.sourceMatches.map((match, matchIndex) => ({
        passageDraftId: draftId,
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
          matchIndex === 0 &&
          match.confidence >= M1_LOCAL_DB_EXACT_THRESHOLD,
        metadata: (match.metadata ?? {}) as Prisma.InputJsonValue,
      }));

    changeCount += changeRows.length;

    await prisma.$transaction(
      async (tx) => {
        await tx.extractionM1PassageDraft.update({
          where: { id: draftId },
          data: {
            restoredText: restoration.restoredText,
            teacherText: restoration.restoredText,
            restorationStatus: restoration.status,
            confidence: restoration.confidence ?? extractionConfidence,
            warnings:
              mergedWarnings.length > 0
                ? (mergedWarnings as Prisma.InputJsonValue)
                : undefined,
            metadata: mergedMetadata as Prisma.InputJsonValue,
          },
        });
        if (changeRows.length > 0) {
          await tx.extractionM1PassageDraftChange.createMany({
            data: changeRows,
          });
        }
        if (sourceMatchRows.length > 0) {
          await tx.extractionM1PassageSourceMatch.createMany({
            data: sourceMatchRows,
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  };

  let restorationPromise: Promise<number> | null = null;
  if (restorationTargets.length > 0) {
    // Phase B: grounded restoration. Wrapped in an async IIFE so the caller
    // can either await it inline (single-cluster legacy) or detach it for
    // parallel execution across clusters (`deferRestoration=true`).
    const work = (async (): Promise<number> => {
      await restoreM1PassageBatch(
        restorationTargets.map((s) => ({
          academyId: input.academyId,
          rawText: s.rawText,
          questions: s.questions,
          problemEvidence: s.problemEvidence,
        })),
        {
          onBatchComplete: async (inputIndices, batchResults) => {
            for (let i = 0; i < inputIndices.length; i += 1) {
              const target = restorationTargets[inputIndices[i]];
              if (!target) continue;
              try {
                await applyRestorationResult(target.index, batchResults[i]);
              } catch (err) {
                logger.warn("m1 draft incremental update failed", {
                  jobId: input.jobId,
                  passageOrder: target.index,
                  err: err instanceof Error ? err.message : String(err),
                });
              }
            }
          },
        },
      );
      return changeCount;
    })();
    if (deferRestoration) {
      restorationPromise = work;
    } else {
      await work;
    }
  }

  return {
    draftCount: groups.length,
    changeCount: deferRestoration ? 0 : changeCount,
    restorationPromise,
  };
}

interface BuildInitialDraftRowsResult {
  initialDraftRows: Prisma.ExtractionM1PassageDraftCreateManyInput[];
  draftIdByOrder: Map<number, string>;
  extractionConfidenceByOrder: Map<number, number | null>;
}

function buildInitialDraftRows(
  input: PersistM1PassageDraftsInput,
  passageOrderOffset: number,
  stage1: PrepStage1[],
): BuildInitialDraftRowsResult {
  const extractionConfidenceByOrder = new Map<number, number | null>();
  const draftIdByOrder = new Map<number, string>();
  const initialDraftRows: Prisma.ExtractionM1PassageDraftCreateManyInput[] =
    stage1.map((s) => {
      const id = randomUUID();
      draftIdByOrder.set(s.index, id);
      const confidenceValues = s.group
        .map((chunk) => chunk.confidence)
        .filter((value): value is number => typeof value === "number");
      const extractionConfidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((sum, value) => sum + value, 0) /
            confidenceValues.length
          : null;
      extractionConfidenceByOrder.set(s.index, extractionConfidence);
      const chunkWarnings = s.group.flatMap(
        (chunk) => chunk.restorationWarnings,
      );
      const pendingStatus: M1RestorationStatus = s.shouldRestore
        ? "PENDING"
        : "NO_RESTORATION_NEEDED";
      const skippedByTypeFilter =
        !s.shouldRestore && s.typeSkipBody.length > 0;
      // For type-filter skips we replace the displayed text with the clean
      // body (PASSAGE_BODY content with problem markers stripped). For the
      // legacy stub-skip path (no passage / too short), keep rawText so the
      // visibility filter behaves exactly as before.
      const displayedText = skippedByTypeFilter ? s.typeSkipBody : s.rawText;
      const pendingMetadata: Record<string, unknown> = {
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
        ...(s.shouldRestore
          ? { restoration: { phase: "PENDING" } }
          : skippedByTypeFilter
            ? {
                reason: "type_no_restoration_needed",
                questionTypes: s.questionTypes,
                rawLength: s.rawText.length,
              }
            : {
                reason: "no_passage_body_and_short_content",
                rawLength: s.rawText.length,
                threshold: SHORT_CONTENT_THRESHOLD,
              }),
      };
      return {
        id,
        jobId: input.jobId,
        sourceMaterialId: input.sourceMaterialId,
        passageOrder: s.index + passageOrderOffset,
        sourcePageIndex: s.sourcePageIndex,
        title: s.purePassageTitle,
        rawText: s.rawText,
        restoredText: displayedText,
        teacherText: displayedText,
        restorationStatus: pendingStatus,
        reviewStatus: "DRAFT",
        confidence: extractionConfidence,
        warnings:
          chunkWarnings.length > 0
            ? (chunkWarnings as Prisma.InputJsonValue)
            : undefined,
        metadata: pendingMetadata as Prisma.InputJsonValue,
      };
    });
  return { initialDraftRows, draftIdByOrder, extractionConfidenceByOrder };
}
