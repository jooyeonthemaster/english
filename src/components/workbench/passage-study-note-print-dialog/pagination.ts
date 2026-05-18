import { getPageCategories } from "./helpers";
import type { PaginatedStudyPage, StudyNoteBlock } from "./types";

export function paginateStudyBlocks(
  blocks: StudyNoteBlock[],
  blockHeights: Map<string, number>,
  availableHeight: number,
) {
  const pages: PaginatedStudyPage[] = [];
  let currentBlocks: StudyNoteBlock[] = [];
  let usedHeight = 0;

  const flush = () => {
    if (currentBlocks.length === 0) return;
    const first = currentBlocks[0];
    pages.push({
      id: `page-${pages.length + 1}-${first.passageId}`,
      passageId: first.passageId,
      passageTitle: first.passageTitle,
      blocks: currentBlocks,
      categories: getPageCategories(currentBlocks),
    });
    currentBlocks = [];
    usedHeight = 0;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const height = blockHeights.get(block.id) || 0;
    if (block.forceNewPage && currentBlocks.length > 0) flush();
    if (block.keepWithNext && currentBlocks.length > 0) {
      const next = blocks[index + 1];
      const nextHeight = next ? blockHeights.get(next.id) || 0 : 0;
      if (usedHeight + height + nextHeight > availableHeight) flush();
    }
    if (currentBlocks.length > 0 && usedHeight + height > availableHeight) flush();
    currentBlocks.push(block);
    usedHeight += height;
  }
  flush();
  return pages;
}
