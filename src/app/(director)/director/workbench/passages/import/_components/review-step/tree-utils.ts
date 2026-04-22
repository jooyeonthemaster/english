// ============================================================================
// Block-tree & stats pure helpers. Extracted from review-step.tsx during
// mechanical split.
// ============================================================================

import { CONFIDENCE_YELLOW } from "@/lib/extraction/constants";
import type { ExtractionItemSnapshot } from "@/lib/extraction/types";
import { firstPageOf } from "./source-draft";
import type { PageGroup, Stats, Tree, TreeNode } from "./types";

export function statsOf(items: ExtractionItemSnapshot[]): Stats {
  let passages = 0;
  let questions = 0;
  let choices = 0;
  let explanations = 0;
  let meta = 0;
  let suspects = 0;
  for (const it of items) {
    if (it.blockType === "PASSAGE_BODY") passages += 1;
    else if (it.blockType === "QUESTION_STEM") questions += 1;
    else if (it.blockType === "CHOICE") choices += 1;
    else if (it.blockType === "EXPLANATION") explanations += 1;
    else if (it.blockType === "EXAM_META") meta += 1;
    if (
      it.needsReview ||
      (it.confidence != null && it.confidence < CONFIDENCE_YELLOW)
    ) {
      suspects += 1;
    }
  }
  return { passages, questions, choices, explanations, meta, suspects };
}

export function buildTree(
  items: ExtractionItemSnapshot[],
  suspectOnly: boolean,
): Tree {
  const filtered = suspectOnly
    ? items.filter(
        (it) =>
          it.needsReview ||
          (it.confidence != null && it.confidence < CONFIDENCE_YELLOW),
      )
    : items;

  // Build parent-aware nodes (CHOICE → QUESTION_STEM, EXPLANATION → QUESTION_STEM)
  const byId = new Map<string, TreeNode>();
  for (const it of filtered) {
    byId.set(it.id, { id: it.id, item: it, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.item.parentItemId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byPage = new Map<number, TreeNode[]>();
  for (const node of roots) {
    const page = firstPageOf(node.item);
    const arr = byPage.get(page) ?? [];
    arr.push(node);
    byPage.set(page, arr);
  }

  const pages: PageGroup[] = [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pageIndex, blocks]) => ({
      pageIndex,
      blocks: blocks.sort((a, b) => a.item.order - b.item.order),
    }));
  return { pages };
}
