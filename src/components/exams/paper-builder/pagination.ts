import {
  A4_HEIGHT_RATIO,
  GROUP_GAP,
  ITEM_GAP,
  PREVIEW_PAGE_WIDTH,
  TWO_COLUMN_GAP,
} from "./constants";
import type {
  OptionItem,
  PaginationSettings,
  PaperGroup,
  PaperItem,
  PaperPage,
  RenderFragment,
  RenderItemPart,
} from "./types";

export function isWideGlyph(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

export function glyphUnits(char: string): number {
  if (char === " " || char === "\t") return 0.34;
  if (isWideGlyph(char)) return 1;
  if (/[A-Z0-9]/.test(char)) return 0.62;
  if (/[a-z]/.test(char)) return 0.53;
  if (/[,.;:!?'"()[\]{}<>/\\|`~_-]/.test(char)) return 0.34;
  return 0.72;
}

export function estimateTextLines(text: string, columnWidth: number, fontSize: number): number {
  const maxUnitsPerLine = Math.max(12, columnWidth / fontSize);
  const lines = text.replace(/\r/g, "").split("\n");

  return lines.reduce((total, line) => {
    if (!line.trim()) return total + 1;
    const units = Array.from(line).reduce((sum, char) => sum + glyphUnits(char), 0);
    return total + Math.max(1, Math.ceil(units / maxUnitsPerLine));
  }, 0);
}

export function pageMetrics(settings: PaginationSettings, pageIndex: number) {
  const compact = settings.density === "compact";
  const pageHeight = PREVIEW_PAGE_WIDTH * A4_HEIGHT_RATIO;
  const horizontalPadding = compact ? 68 : 84;
  const verticalPadding = compact ? 60 : 76;
  const firstPageHeader = compact ? 100 : 122;
  const followPageHeader = 28;
  const footer = 26;
  const contentHeight =
    pageHeight -
    verticalPadding -
    (pageIndex === 0 ? firstPageHeader : followPageHeader) -
    footer;
  const contentWidth = PREVIEW_PAGE_WIDTH - horizontalPadding;
  const columnWidth =
    settings.columns === 2 ? (contentWidth - TWO_COLUMN_GAP) / 2 : contentWidth;

  return {
    columnWidth,
    capacity: Math.max(520, contentHeight * 0.9),
  };
}

export function estimatePassageHeight(group: PaperGroup, settings: PaginationSettings): number {
  if (!group.includePassage || !group.passageContent) return 0;

  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const lineHeight = fontSize * (compact ? 1.46 : 1.58);
  const lines = estimateTextLines(group.passageContent, columnWidth, fontSize);
  const title = settings.showPassageTitle && group.passageTitle ? 15 : 0;
  const chrome =
    settings.passageStyle === "boxed"
      ? 24
      : settings.passageStyle === "underlined"
        ? 18
        : 8;

  return title + chrome + lines * lineHeight;
}

export function passageLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return fontSize * (compact ? 1.46 : 1.58);
}

export function passageChromeHeight(group: PaperGroup, settings: PaginationSettings, includeTitle: boolean): number {
  const titleHeight = includeTitle && settings.showPassageTitle && group.passageTitle ? 15 : 0;
  const boxChrome =
    settings.passageStyle === "boxed" ? 24 : settings.passageStyle === "underlined" ? 18 : 8;
  return titleHeight + boxChrome + 12;
}

export function passageToLines(content: string, settings: PaginationSettings): string[] {
  if (!content) return [];
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const maxUnitsPerLine = Math.max(12, columnWidth / fontSize);
  const lines: string[] = [];

  for (const paragraph of content.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    let currentUnits = 0;
    let i = 0;

    while (i < paragraph.length) {
      let nextSpace = paragraph.indexOf(" ", i);
      if (nextSpace === -1) nextSpace = paragraph.length;
      const word = paragraph.slice(i, nextSpace);
      const wordUnits = Array.from(word).reduce((sum, ch) => sum + glyphUnits(ch), 0);
      const spaceFollows = nextSpace < paragraph.length;
      const spaceUnits = spaceFollows ? glyphUnits(" ") : 0;

      if (wordUnits > maxUnitsPerLine && !currentLine) {
        // word longer than a line — break by chars
        let chunk = "";
        let chunkUnits = 0;
        for (const ch of word) {
          const u = glyphUnits(ch);
          if (chunkUnits + u > maxUnitsPerLine && chunk) {
            lines.push(chunk);
            chunk = ch;
            chunkUnits = u;
          } else {
            chunk += ch;
            chunkUnits += u;
          }
        }
        currentLine = chunk;
        currentUnits = chunkUnits;
      } else if (currentUnits + wordUnits > maxUnitsPerLine && currentLine) {
        lines.push(currentLine.trimEnd());
        currentLine = word;
        currentUnits = wordUnits;
      } else {
        currentLine += word;
        currentUnits += wordUnits;
      }

      if (spaceFollows) {
        if (currentUnits + spaceUnits <= maxUnitsPerLine) {
          currentLine += " ";
          currentUnits += spaceUnits;
        }
      }

      i = nextSpace + 1;
    }

    if (currentLine.trim()) lines.push(currentLine.trimEnd());
    else if (currentLine === "") lines.push("");
  }

  return lines;
}

export function estimateHeaderBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const lineHeight = fontSize * (compact ? 1.46 : 1.58);
  const questionLines = estimateTextLines(item.questionText, columnWidth, fontSize);
  const metaHeight = settings.showQuestionMeta ? 18 : 16;
  return metaHeight + questionLines * lineHeight + 6;
}

export function estimateOptionBlockHeight(option: OptionItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const optionLines = estimateTextLines(option.text, Math.max(80, columnWidth - 22), compact ? 10 : 11);
  return Math.max(16, optionLines * (compact ? 14.5 : 16));
}

export function estimateAnswerBlockHeight(item: PaperItem): number {
  return item.answerSpaceLines * 14 + (item.answerSpaceLines > 0 ? 8 : 0);
}

export function estimateTeacherNoteHeight(item: PaperItem, settings: PaginationSettings): number {
  return settings.template === "worksheet" && item.teacherNote ? 24 : 0;
}

type FlowBlock =
  | { kind: "passage-atom"; group: PaperGroup; allLines: string[]; height: number }
  | { kind: "passage-line"; group: PaperGroup; line: string; lineIndex: number; totalLines: number; height: number }
  | { kind: "header"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "option"; group: PaperGroup; item: PaperItem; option: OptionItem; index: number; height: number }
  | { kind: "answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "note"; group: PaperGroup; item: PaperItem; height: number };

export type PaginationResult = {
  pages: PaperPage[];
  overflowItems: Set<string>;
};

export function paginateGroups(groups: PaperGroup[], settings: PaginationSettings): PaginationResult {
  const pages: PaperPage[] = [];
  let pageIndex = 0;
  let columnIndex = 0;
  let currentPage: PaperPage = Array.from({ length: settings.columns }, () => []);
  let columnHeights = Array.from({ length: settings.columns }, () => 0);

  const passageTitleShownFor = new Set<string>();
  const headerRenderedFor = new Set<string>();
  const overflowItems = new Set<string>();

  function pushCurrentPage() {
    if (currentPage.some((column) => column.length > 0)) pages.push(currentPage);
    pageIndex += 1;
    columnIndex = 0;
    currentPage = Array.from({ length: settings.columns }, () => []);
    columnHeights = Array.from({ length: settings.columns }, () => 0);
  }

  function advanceColumn() {
    if (columnIndex < settings.columns - 1) {
      columnIndex += 1;
    } else {
      pushCurrentPage();
    }
  }

  function currentCapacity() {
    return pageMetrics(settings, pageIndex).capacity;
  }

  function ensureFragment(group: PaperGroup): RenderFragment {
    const col = currentPage[columnIndex];
    const last = col[col.length - 1];
    if (last && last.groupSourceId === group.id) return last;

    const gap = col.length > 0 ? GROUP_GAP : 0;
    const fragment: RenderFragment = {
      id: `${group.id}@p${pageIndex}c${columnIndex}n${col.length}`,
      passageTitle: group.passageTitle,
      passageContent: group.passageContent,
      includePassage: false,
      passageRenderedLines: [],
      passageStartLineIndex: 0,
      passageTotalLines: 0,
      groupSourceId: group.id,
      parts: [],
    };
    col.push(fragment);
    columnHeights[columnIndex] += gap;
    return fragment;
  }

  function ensurePart(fragment: RenderFragment, item: PaperItem): RenderItemPart {
    const last = fragment.parts[fragment.parts.length - 1];
    if (last && last.source.localId === item.localId) return last;

    const hasPassageOrParts = fragment.parts.length > 0 || fragment.passageRenderedLines.length > 0;
    const partGap = hasPassageOrParts ? ITEM_GAP : 0;
    const isFreshStart = !headerRenderedFor.has(item.localId);
    const part: RenderItemPart = {
      source: item,
      partKey: `${item.localId}@p${pageIndex}c${columnIndex}f${fragment.id}n${fragment.parts.length}`,
      showHeader: isFreshStart,
      showAnswer: false,
      options: [],
      isStart: isFreshStart,
      isContinuation: !isFreshStart,
    };
    fragment.parts.push(part);
    columnHeights[columnIndex] += partGap;
    return part;
  }

  function marginalCostForBlock(block: FlowBlock): number {
    const col = currentPage[columnIndex];
    const lastFrag = col[col.length - 1];
    const sameFragment = !!lastFrag && lastFrag.groupSourceId === block.group.id;

    let cost = block.height;

    if (!sameFragment) {
      cost += col.length > 0 ? GROUP_GAP : 0;
    }

    if (block.kind === "passage-line") {
      const isFirstLineOfFragment = !sameFragment || lastFrag!.passageRenderedLines.length === 0;
      if (isFirstLineOfFragment) {
        const includeTitle = !passageTitleShownFor.has(block.group.id);
        cost += passageChromeHeight(block.group, settings, includeTitle);
      }
    } else if (block.kind === "passage-atom") {
      // height already includes chrome
    } else {
      const item = block.item;
      const lastPart = sameFragment ? lastFrag!.parts[lastFrag!.parts.length - 1] : undefined;
      const samePart = !!lastPart && lastPart.source.localId === item.localId;
      if (!samePart) {
        const hasPassageOrParts =
          sameFragment &&
          (lastFrag!.parts.length > 0 || lastFrag!.passageRenderedLines.length > 0);
        if (hasPassageOrParts) cost += ITEM_GAP;
      }
    }

    return cost;
  }

  // Build flow blocks
  const blocks: FlowBlock[] = [];
  for (const group of groups) {
    if (group.includePassage && group.passageContent) {
      const lines = passageToLines(group.passageContent, settings);
      // Default: passage flows naturally line-by-line so it fills empty column space.
      // When keepTogether is true (currently keepWithPrev=true), treat passage as atomic
      // so the whole question moves cleanly to the next column / page.
      const keepTogether = Boolean(group.items[0]?.keepWithPrev);
      if (keepTogether) {
        const lineH = passageLineHeight(settings);
        const includeTitle = settings.showPassageTitle && Boolean(group.passageTitle);
        const chrome = passageChromeHeight(group, settings, includeTitle);
        const atomHeight = chrome + lines.length * lineH;
        blocks.push({
          kind: "passage-atom",
          group,
          allLines: lines,
          height: atomHeight,
        });
      } else {
        const lineH = passageLineHeight(settings);
        lines.forEach((line, idx) => {
          blocks.push({
            kind: "passage-line",
            group,
            line,
            lineIndex: idx,
            totalLines: lines.length,
            height: lineH,
          });
        });
      }
    }
    for (const item of group.items) {
      blocks.push({ kind: "header", group, item, height: estimateHeaderBlockHeight(item, settings) });
      item.options.forEach((option, index) => {
        blocks.push({ kind: "option", group, item, option, index, height: estimateOptionBlockHeight(option, settings) });
      });
      if (settings.showAnswerSpace && item.answerSpaceLines > 0) {
        blocks.push({ kind: "answer", group, item, height: estimateAnswerBlockHeight(item) });
      }
      if (settings.template === "worksheet" && item.teacherNote) {
        blocks.push({ kind: "note", group, item, height: estimateTeacherNoteHeight(item, settings) });
      }
    }
  }

  let isFirstBlockOverall = true;

  for (const block of blocks) {
    const group = block.group;
    const item = block.kind === "passage-line" || block.kind === "passage-atom" ? undefined : block.item;
    const isHeaderBlock = block.kind === "header";

    const itemRequestsKeepStay = !!item && !isFirstBlockOverall && Boolean(item.keepWithPrev);
    const headerForceStay = isHeaderBlock && itemRequestsKeepStay;

    // breakBefore on header block
    if (isHeaderBlock && item && !isFirstBlockOverall && !itemRequestsKeepStay) {
      if (item.breakBefore === "page") {
        if (currentPage.some((c) => c.length > 0)) pushCurrentPage();
      } else if (item.breakBefore === "column") {
        if (columnHeights[columnIndex] > 0) advanceColumn();
      }
    }

    const cost = marginalCostForBlock(block);
    const colHasContent = columnHeights[columnIndex] > 0;
    const wouldOverflow = colHasContent && columnHeights[columnIndex] + cost > currentCapacity();

    if (wouldOverflow && !headerForceStay) {
      advanceColumn();
    }

    const fragment = ensureFragment(group);

    if (block.kind === "passage-atom") {
      fragment.includePassage = true;
      fragment.passageRenderedLines = block.allLines;
      fragment.passageStartLineIndex = 0;
      fragment.passageTotalLines = block.allLines.length;
      passageTitleShownFor.add(group.id);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "passage-line") {
      const isFirstLineOfFragment = fragment.passageRenderedLines.length === 0;
      if (isFirstLineOfFragment) {
        const includeTitle = !passageTitleShownFor.has(group.id);
        const chrome = passageChromeHeight(group, settings, includeTitle);
        columnHeights[columnIndex] += chrome;
        fragment.includePassage = true;
        fragment.passageStartLineIndex = block.lineIndex;
        fragment.passageTotalLines = block.totalLines;
        if (includeTitle) passageTitleShownFor.add(group.id);
      }
      fragment.passageRenderedLines.push(block.line);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "header") {
      const part = ensurePart(fragment, item!);
      if (!headerRenderedFor.has(item!.localId)) {
        headerRenderedFor.add(item!.localId);
        columnHeights[columnIndex] += block.height;
        if (headerForceStay && columnHeights[columnIndex] > currentCapacity()) {
          overflowItems.add(item!.localId);
        }
      }
      void part;
    } else if (block.kind === "option") {
      const part = ensurePart(fragment, item!);
      part.options.push({ option: block.option, originalIndex: block.index });
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "answer") {
      const part = ensurePart(fragment, item!);
      part.showAnswer = true;
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "note") {
      ensurePart(fragment, item!);
      columnHeights[columnIndex] += block.height;
    }

    isFirstBlockOverall = false;
  }

  if (currentPage.some((column) => column.length > 0)) pages.push(currentPage);
  return {
    pages: pages.length > 0 ? pages : [Array.from({ length: settings.columns }, () => [])],
    overflowItems,
  };
}
