// ============================================================================
// itemsToDraftSummaries — build EnrichedDraft[] from ExtractionItemSnapshot[]
// for store synchronization. Extracted from review-step.tsx during mechanical
// split.
// ============================================================================

import {
  normaliseChoiceLabel,
  type EnrichedDraft,
} from "@/lib/extraction/segmentation";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

/** Build EnrichedDraft[] summaries from ExtractionItemSnapshot[] for the store. */
export function itemsToDraftSummaries(
  items: ExtractionItemSnapshot[],
): EnrichedDraft[] {
  const byGroup = new Map<string, ExtractionItemSnapshot[]>();
  for (const it of items) {
    const key = it.groupId ?? `_solo:${it.id}`;
    const arr = byGroup.get(key) ?? [];
    arr.push(it);
    byGroup.set(key, arr);
  }
  const out: EnrichedDraft[] = [];
  let order = 0;
  for (const [, group] of byGroup) {
    const hasPassage = group.some((g) => g.blockType === "PASSAGE_BODY");
    const hasQuestion = group.some((g) => g.blockType === "QUESTION_STEM");
    if (!hasPassage && !hasQuestion) continue;

    const passageBlocks = group.filter((g) => g.blockType === "PASSAGE_BODY");
    const questionBlocks = group.filter((g) => g.blockType === "QUESTION_STEM");
    const choiceBlocks = group.filter((g) => g.blockType === "CHOICE");
    const explanationBlocks = group.filter(
      (g) => g.blockType === "EXPLANATION",
    );
    const examMetaBlock = group.find((g) => g.blockType === "EXAM_META");

    const content = passageBlocks
      .map((p) => p.content)
      .join("\n\n")
      .trim();
    const pagesSet = new Set<number>();
    for (const g of group) for (const p of g.sourcePageIndex) pagesSet.add(p);

    const confidences = group
      .map((g) => g.confidence)
      .filter((c): c is number => typeof c === "number");
    const confidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null;

    const firstNonEmpty = hasPassage
      ? passageBlocks[0]?.content ?? ""
      : questionBlocks[0]?.content ?? "";
    const title =
      (passageBlocks[0]?.title ?? "") ||
      firstNonEmpty.slice(0, 40).replace(/\s+/g, " ").trim() ||
      `지문 ${order + 1}`;

    const questions = questionBlocks.map((q) => {
      const qMeta = q.questionMeta as { number?: number } | null;
      const qChoices = choiceBlocks
        .filter((c) => c.parentItemId === q.id)
        .sort((a, b) => (a.localOrder ?? 0) - (b.localOrder ?? 0))
        .map((c, i) => {
          const cMeta = c.choiceMeta as
            | { index?: number; label?: string; isAnswer?: boolean }
            | null;
          // cMeta.label은 DB에서 임의 문자열로 되돌아올 수 있으므로
          // normaliseChoiceLabel 로 `ChoiceLabelLike` 유니언에 맞춘다.
          // label 이 없으면 index / ordinal 순으로 폴백한다.
          const labelSource =
            cMeta?.label != null
              ? cMeta.label
              : cMeta?.index != null
                ? String(cMeta.index)
                : null;
          return {
            itemId: c.id,
            label: normaliseChoiceLabel(labelSource, i),
            content: c.content,
            isAnswer: cMeta?.isAnswer === true,
          };
        });
      const explainBlock = explanationBlocks.find(
        (e) => e.parentItemId === q.id,
      );
      return {
        questionItemId: q.id,
        questionNumber: qMeta?.number ?? null,
        stem: q.content,
        choices: qChoices,
        explanation: explainBlock?.content ?? null,
      };
    });

    out.push({
      passageItemId: passageBlocks[0]?.id ?? null,
      passageOrder: order++,
      sourcePageIndex: [...pagesSet].sort((a, b) => a - b),
      title,
      content: content || questionBlocks.map((q) => q.content).join("\n\n"),
      confidence,
      status: "DRAFT",
      questions,
      examMeta:
        (examMetaBlock?.examMeta as Record<string, unknown> | null) ?? null,
      meta: {
        markerDetected: hasPassage,
      },
    });
  }
  return out;
}
