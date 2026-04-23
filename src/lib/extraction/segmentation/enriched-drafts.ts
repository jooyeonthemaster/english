// ============================================================================
// Enriched-draft materialisation — `buildEnrichedDrafts`. Extracted verbatim
// from segmentation.ts during mechanical split.
// ============================================================================

import type { ExtractionItemSnapshot } from "../types";
import { GROUP_RELEVANT } from "./structured-types";
import type { EnrichedDraft, GroupBucket } from "./enriched-types";
import {
  buildChoiceLabel,
  coerceChoiceIndex,
  coerceIsAnswer,
  coerceQuestionNumber,
  mapItemStatusToDraftStatus,
  averageConfidence,
  uniqueSortedPages,
  newBucket,
  applyOrphanExamMeta,
} from "./enriched-helpers";

/**
 * Build passage-centric EnrichedDraft[] from ExtractionItemSnapshot[].
 *
 * Grouping:
 *   - PASSAGE_BODY acts as group anchor; each groupId maps to one draft.
 *   - QUESTION_STEM rows with the same groupId become `draft.questions[]`.
 *   - CHOICE rows bind to their QUESTION_STEM via `parentItemId`; if missing,
 *     they fall back to the first stem in the group.
 *   - EXPLANATION binds the same way.
 *   - EXAM_META items are aggregated into the first draft's `examMeta`.
 *   - Group-less items (HEADER/FOOTER/DIAGRAM/NOISE) are ignored.
 *   - Questions without a PASSAGE_BODY in the same group still produce a
 *     draft (passageItemId = null) — rare M2 edge case.
 */
export function buildEnrichedDrafts(
  items: ExtractionItemSnapshot[],
): EnrichedDraft[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const buckets = new Map<string, GroupBucket>();
  const orphanExamMeta: ExtractionItemSnapshot[] = [];

  // First pass: place each item into a bucket by groupId (or exam-meta sink).
  for (const item of sorted) {
    if (item.blockType === "EXAM_META") {
      orphanExamMeta.push(item);
      continue;
    }
    if (!GROUP_RELEVANT.has(item.blockType)) continue;
    const key = item.groupId ?? `__solo__:${item.id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = newBucket(key, item.order);
      buckets.set(key, bucket);
    }

    switch (item.blockType) {
      case "PASSAGE_BODY":
        bucket.passages.push(item);
        break;
      case "QUESTION_STEM":
        bucket.stems.push(item);
        break;
      case "CHOICE":
        if (item.parentItemId) {
          const list = bucket.choicesByStemId.get(item.parentItemId) ?? [];
          list.push(item);
          bucket.choicesByStemId.set(item.parentItemId, list);
        } else {
          bucket.orphanChoices.push(item);
        }
        break;
      case "EXPLANATION":
        if (item.parentItemId) {
          bucket.explanationByStemId.set(item.parentItemId, item);
        } else if (!bucket.orphanExplanation) {
          bucket.orphanExplanation = item;
        }
        break;
      default:
        break;
    }
  }

  // Second pass: materialize drafts, sorted by firstOrder ascending.
  const ordered = [...buckets.values()].sort(
    (a, b) => a.firstOrder - b.firstOrder,
  );

  const drafts: EnrichedDraft[] = [];
  ordered.forEach((bucket, index) => {
    // Need at least a passage OR at least one question OR an orphan choice
    // (fallback placeholder) to emit a draft.
    const hasOrphanChoices = bucket.orphanChoices.length > 0;
    if (
      bucket.passages.length === 0 &&
      bucket.stems.length === 0 &&
      !hasOrphanChoices
    ) {
      return;
    }

    const passageBlocks = [...bucket.passages].sort((a, b) => a.order - b.order);
    const anchorPassage = passageBlocks[0] ?? null;
    const mergedPassageContent = passageBlocks
      .map((passage) => passage.content.trim())
      .filter((content) => content.length > 0)
      .join("\n\n");
    const stemsSorted = [...bucket.stems].sort((a, b) => a.order - b.order);

    // P0-3 FIX: orphan choices with NO stem in the group → create a synthetic
    // placeholder question so the choices are not dropped. We emit a virtual
    // `questionItemId = "orphan:<bucketGroupId>"` which the UI can treat as a
    // "choices without stem" card (review step will show an explicit note).
    let syntheticPlaceholder:
      | { id: string; content: string; order: number; status: ExtractionItemSnapshot["status"] }
      | null = null;
    if (stemsSorted.length === 0 && hasOrphanChoices) {
      syntheticPlaceholder = {
        id: `orphan-stem:${bucket.groupId}`,
        content: "(문항 본문이 감지되지 않았습니다. 선택지만 추출되었습니다.)",
        order: bucket.orphanChoices[0].order,
        status: "DRAFT",
      };
    }

    // Resolve orphan choices → attach to the first stem if any, else to the
    // synthetic placeholder.
    const anchorStemId =
      stemsSorted.length > 0
        ? stemsSorted[0].id
        : syntheticPlaceholder
          ? syntheticPlaceholder.id
          : null;
    if (bucket.orphanChoices.length > 0 && anchorStemId) {
      const existing = bucket.choicesByStemId.get(anchorStemId) ?? [];
      bucket.choicesByStemId.set(anchorStemId, [
        ...existing,
        ...bucket.orphanChoices,
      ]);
      bucket.orphanChoices = [];
    }
    if (bucket.orphanExplanation && anchorStemId) {
      if (!bucket.explanationByStemId.has(anchorStemId)) {
        bucket.explanationByStemId.set(anchorStemId, bucket.orphanExplanation);
      }
      bucket.orphanExplanation = null;
    }

    // Build the iteration list — real stems plus the synthetic placeholder
    // (if present). Placeholders are type-narrowed in the map below.
    type StemLike =
      | { real: true; item: ExtractionItemSnapshot }
      | {
          real: false;
          id: string;
          content: string;
          order: number;
          status: ExtractionItemSnapshot["status"];
        };
    const stemLikes: StemLike[] =
      stemsSorted.length > 0
        ? stemsSorted.map((s) => ({ real: true as const, item: s }))
        : syntheticPlaceholder
          ? [
              {
                real: false as const,
                id: syntheticPlaceholder.id,
                content: syntheticPlaceholder.content,
                order: syntheticPlaceholder.order,
                status: syntheticPlaceholder.status,
              },
            ]
          : [];

    const questions: EnrichedDraft["questions"] = stemLikes.map((s) => {
      const stemId = s.real ? s.item.id : s.id;
      const stemContent = s.real ? s.item.content : s.content;
      const questionNumber = s.real ? coerceQuestionNumber(s.item) : null;
      const stemChoices = [
        ...(bucket.choicesByStemId.get(stemId) ?? []),
      ].sort((a, b) => {
        const ai = coerceChoiceIndex(a) ?? a.order;
        const bi = coerceChoiceIndex(b) ?? b.order;
        return ai - bi;
      });
      const explanation = bucket.explanationByStemId.get(stemId);
      return {
        questionItemId: stemId,
        questionNumber,
        stem: stemContent,
        choices: stemChoices.map((choice, i) => ({
          itemId: choice.id,
          label: buildChoiceLabel(coerceChoiceIndex(choice), i),
          content: choice.content,
          isAnswer: coerceIsAnswer(choice),
        })),
        explanation: explanation ? explanation.content : null,
      };
    });

    // Anchor item — used for status mapping. Prefer passage, then first real
    // stem. When neither exists (orphan-choice-only bucket), fall back to
    // DRAFT status.
    const anchorStatus: ExtractionItemSnapshot["status"] = anchorPassage
      ? anchorPassage.status
      : stemsSorted.length > 0
        ? stemsSorted[0].status
        : "DRAFT";

    // Gather every real item in the bucket (for page / confidence aggregation).
    // Synthetic placeholder rows are excluded (they have no pages or
    // confidence); their attached orphan choices are added separately.
    const allItems: ExtractionItemSnapshot[] = [
      ...passageBlocks,
      ...stemsSorted,
      ...stemsSorted.flatMap((s) => bucket.choicesByStemId.get(s.id) ?? []),
      ...stemsSorted
        .map((s) => bucket.explanationByStemId.get(s.id))
        .filter((v): v is ExtractionItemSnapshot => Boolean(v)),
      ...(syntheticPlaceholder
        ? bucket.choicesByStemId.get(syntheticPlaceholder.id) ?? []
        : []),
    ];

    const pages = uniqueSortedPages(
      allItems.flatMap((i) => i.sourcePageIndex ?? []),
    );

    const confidence = averageConfidence(allItems.map((i) => i.confidence));

    const title =
      anchorPassage?.title ??
      (questions[0]?.questionNumber != null
        ? `[${questions[0].questionNumber}]번 문제 세트`
        : `지문 ${index + 1}`);

    const draft: EnrichedDraft = {
      passageItemId: anchorPassage ? anchorPassage.id : null,
      passageOrder: index,
      sourcePageIndex: pages,
      title,
      content: mergedPassageContent,
      confidence,
      status: mapItemStatusToDraftStatus(anchorStatus),
      questions,
      examMeta: null,
      meta: {
        markerDetected: passageBlocks.some((passageBlock) =>
          Boolean(
            (passageBlock.passageMeta as Record<string, unknown> | null)
              ?.markerDetected,
          ),
        ),
        mergedFromPages: pages.length > 1 ? pages : undefined,
        confidenceNote: anchorPassage
          ? undefined
          : syntheticPlaceholder
            ? "문항 본문이 감지되지 않아 선택지만 묶었습니다. 문항을 추가하거나 병합하세요."
            : "지문 블록이 감지되지 않아 문제만 묶였습니다. 지문을 추가하거나 병합하세요.",
      },
    };

    drafts.push(draft);
  });

  applyOrphanExamMeta(drafts, orphanExamMeta);

  return drafts;
}
