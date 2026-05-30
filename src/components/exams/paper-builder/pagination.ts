import {
  GROUP_GAP,
  ITEM_GAP,
  PAPER_SIZE_SPECS,
  PREVIEW_PAGE_WIDTH,
  TWO_COLUMN_GAP,
} from "./constants";
import {
  formatSentenceInsertPassageMarkers,
  optionDisplayTextForSubtype,
  splitSentenceInsertGivenBlock,
} from "./option-display";
import { normalizePassageText, normalizeQuestionText } from "./text-normalization";
import type {
  OptionItem,
  PaginationSettings,
  PaperGroup,
  PaperItem,
  PaperPage,
  RenderFragment,
  RenderItemPart,
} from "./types";

// 줄당 문자 폭 보정 계수. 미리보기/다운로드 글꼴을 맑은 고딕으로 통일하면서
// 조정했다. 맑은 고딕의 라틴 글리프가 Pretendard보다 약간 넓어 한 줄에 들어가는
// 글자수가 살짝 줄어들므로, 줄바꿈 과소예측을 막기 위해 계수를 소폭 낮춘다.
// (양쪽이 같은 글꼴을 쓰므로 정확한 페이지 분할 일치는 요구되지 않음.)
const LINE_WIDTH_FUDGE = 1.05;
const MIN_QUESTION_START_LINES = 8;
const MIN_PASSAGE_START_LINES = 4;
const BOXED_PASSAGE_HORIZONTAL_INSET = 28;
const PAGE_BOTTOM_GUARD = 70;
const OPTION_BLOCK_TOP_GAP = 6;
const OPTION_ROW_GAP = 4;

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

function maxUnitsPerLine(columnWidth: number, fontSize: number): number {
  return Math.max(10, (columnWidth / fontSize) * LINE_WIDTH_FUDGE);
}

function wrapParagraph(paragraph: string, maxUnits: number): string[] {
  const lines: string[] = [];
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

    if (wordUnits > maxUnits && !currentLine) {
      let chunk = "";
      let chunkUnits = 0;
      for (const ch of word) {
        const unit = glyphUnits(ch);
        if (chunkUnits + unit > maxUnits && chunk) {
          lines.push(chunk);
          chunk = ch;
          chunkUnits = unit;
        } else {
          chunk += ch;
          chunkUnits += unit;
        }
      }
      currentLine = chunk;
      currentUnits = chunkUnits;
    } else if (currentUnits + wordUnits > maxUnits && currentLine) {
      lines.push(currentLine.trimEnd());
      currentLine = word;
      currentUnits = wordUnits;
    } else {
      currentLine += word;
      currentUnits += wordUnits;
    }

    if (spaceFollows && currentUnits + spaceUnits <= maxUnits) {
      currentLine += " ";
      currentUnits += spaceUnits;
    }

    i = nextSpace + 1;
  }

  if (currentLine.trim()) lines.push(currentLine.trimEnd());
  else if (currentLine === "") lines.push("");
  return lines;
}

function textToLines(text: string, columnWidth: number, fontSize: number): string[] {
  if (!text.trim()) return [];
  const maxUnits = maxUnitsPerLine(columnWidth, fontSize);
  const lines: string[] = [];

  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(paragraph.trim(), maxUnits));
  }

  return lines;
}

export function estimateTextLines(text: string, columnWidth: number, fontSize: number): number {
  return Math.max(1, textToLines(text, columnWidth, fontSize).length);
}

export function pageMetrics(settings: PaginationSettings, pageIndex: number) {
  const compact = settings.density === "compact";
  const paperSpec = PAPER_SIZE_SPECS[settings.paperSize];
  const pageWidth = Math.round(PREVIEW_PAGE_WIDTH * paperSpec.widthRatio);
  const pageHeight = pageWidth * paperSpec.heightRatio;
  // 전체 여백 축소(5차): a4-paper-page.tsx 의 새 px 패딩과 1:1 일치시킨다.
  //   comfortable px-[34px] py-[28px] → H=68, V=56 / compact px-[28px] py-[24px] → H=56, V=48.
  //   좌우 패딩(=칸 폭)이 미리보기·HWPX·DOCX 와 동일해야 줄넘김이 일치한다.
  const horizontalPadding = compact ? 56 : 68;
  const verticalPadding = compact ? 48 : 56;
  const firstPageHeader = compact ? 82 : 96;
  const followPageHeader = 24;
  const footer = 24;
  const contentHeight =
    pageHeight -
    verticalPadding -
    (pageIndex === 0 ? firstPageHeader : followPageHeader) -
    footer;
  const contentWidth = pageWidth - horizontalPadding;
  const columnWidth =
    settings.columns === 2 ? (contentWidth - TWO_COLUMN_GAP) / 2 : contentWidth;

  return {
    columnWidth,
    capacity: Math.max(420, contentHeight - PAGE_BOTTOM_GUARD),
  };
}

export function passageLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return fontSize * (compact ? 1.46 : 1.58);
}

function passageContentWidth(settings: PaginationSettings): number {
  const { columnWidth } = pageMetrics(settings, 0);
  if (settings.passageStyle !== "boxed") return columnWidth;
  return Math.max(80, columnWidth - BOXED_PASSAGE_HORIZONTAL_INSET);
}

function passageContinuationReserveHeight(settings: PaginationSettings): number {
  return settings.density === "compact" ? 16 : 18;
}

export function questionLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return fontSize * (compact ? 1.46 : 1.58);
}

export function questionMetaHeight(settings: PaginationSettings): number {
  return settings.showQuestionMeta ? 18 : 16;
}

export function passageChromeHeight(
  group: PaperGroup,
  settings: PaginationSettings,
  includeTitle: boolean,
  reserveContinuation = false,
): number {
  const titleHeight = includeTitle && settings.showPassageTitle && group.passageTitle ? 15 : 0;
  const boxChrome =
    settings.passageStyle === "boxed" ? 24 : settings.passageStyle === "underlined" ? 18 : 8;
  return (
    titleHeight +
    boxChrome +
    12 +
    (reserveContinuation ? passageContinuationReserveHeight(settings) : 0)
  );
}

export function passageToLines(content: string, settings: PaginationSettings): string[] {
  if (!content) return [];
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return textToLines(normalizePassageText(content), passageContentWidth(settings), fontSize);
}

export function questionToLines(content: string, settings: PaginationSettings): string[] {
  if (!content) return [];
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  return textToLines(normalizeQuestionText(content), columnWidth, fontSize);
}

export function estimatePassageHeight(group: PaperGroup, settings: PaginationSettings): number {
  if (!group.includePassage || !group.passageContent) return 0;
  const lines = passageToLines(group.passageContent, settings);
  const includeTitle = settings.showPassageTitle && Boolean(group.passageTitle);
  return passageChromeHeight(group, settings, includeTitle) + lines.length * passageLineHeight(settings);
}

export function estimateHeaderBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const renderedQuestionText = formatSentenceInsertPassageMarkers(
    item.questionText,
    item.sourceQuestion.subType,
  );
  const lines = questionToLines(renderedQuestionText, settings);
  const { givenText } = splitSentenceInsertGivenBlock(
    renderedQuestionText,
    item.sourceQuestion.subType,
  );
  return (
    questionMetaHeight(settings) +
    lines.length * questionLineHeight(settings) +
    (givenText ? 10 : 0) +
    6
  );
}

export function estimateOptionBlockHeight(
  option: OptionItem,
  settings: PaginationSettings,
  subType?: string | null,
  optionIndex = 0,
): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const displayText = optionDisplayTextForSubtype(subType, optionIndex, option.text);
  const optionLines = estimateTextLines(displayText, Math.max(80, columnWidth - 22), compact ? 10 : 11);
  return Math.max(16, optionLines * (compact ? 14.5 : 16));
}

export function estimateAnswerBlockHeight(item: PaperItem): number {
  return item.answerSpaceLines * 14 + (item.answerSpaceLines > 0 ? 8 : 0);
}

export function estimateObjectiveAnswerBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const slots = Math.max(0, Math.min(10, item.objectiveAnswerSlots || 0));
  if (slots <= 0 || item.options.length === 0) return 0;
  const texts = item.objectiveAnswerTexts || [];
  return Array.from({ length: slots }).reduce<number>((sum, _, slotIndex) => {
    const optionIndex = item.options.length + slotIndex;
    return (
      sum +
      estimateOptionBlockHeight(
        { label: String(optionIndex + 1), text: texts[slotIndex] || "" },
        settings,
        item.sourceQuestion.subType,
        optionIndex,
      ) +
      (slotIndex === 0 ? OPTION_BLOCK_TOP_GAP : OPTION_ROW_GAP)
    );
  }, 0);
}

export function estimateTeacherNoteHeight(item: PaperItem, settings: PaginationSettings): number {
  return settings.template === "worksheet" && item.teacherNote ? 24 : 0;
}

type FlowBlock =
  | { kind: "custom"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "passage-atom"; group: PaperGroup; allLines: string[]; height: number }
  | { kind: "passage-line"; group: PaperGroup; line: string; lineIndex: number; totalLines: number; height: number }
  | {
      kind: "question-meta";
      group: PaperGroup;
      item: PaperItem;
      firstLine: string | null;
      totalLines: number;
      height: number;
    }
  | { kind: "question-line"; group: PaperGroup; item: PaperItem; line: string; lineIndex: number; totalLines: number; height: number }
  | { kind: "option"; group: PaperGroup; item: PaperItem; option: OptionItem; index: number; height: number }
  | { kind: "objective-answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "answer"; group: PaperGroup; item: PaperItem; height: number }
  | { kind: "note"; group: PaperGroup; item: PaperItem; height: number };

export type PaginationResult = {
  pages: PaperPage[];
  overflowItems: Set<string>;
};

function itemForBlock(block: FlowBlock): PaperItem | undefined {
  return block.kind === "passage-line" || block.kind === "passage-atom"
    ? undefined
    : block.item;
}

function estimateCustomBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const bodyFontSize =
    item.blockFontSize === "lg" ? 14 : item.blockFontSize === "sm" ? 10 : 11.5;

  switch (item.blockType) {
    case "section":
      return 38 + estimateTextLines(item.blockTitle || item.blockText || " ", columnWidth, 15) * 12;
    case "text":
      return 20 + estimateTextLines(item.blockText || " ", columnWidth, bodyFontSize) * (compact ? 14 : 16);
    case "divider":
      return 18 + Math.max(1, item.dividerThickness);
    case "spacer":
      return Math.max(8, Math.min(160, item.spacerHeight || 32));
    case "image":
      return Math.max(80, Math.min(260, (columnWidth * Math.max(20, Math.min(100, item.imageWidth || 70))) / 140));
    case "question":
    default:
      return 0;
  }
}

export function paginateGroups(groups: PaperGroup[], settings: PaginationSettings): PaginationResult {
  const pages: PaperPage[] = [];
  let pageIndex = 0;
  let columnIndex = 0;
  let currentPage: PaperPage = Array.from({ length: settings.columns }, () => []);
  let columnHeights = Array.from({ length: settings.columns }, () => 0);

  const passageTitleShownFor = new Set<string>();
  const headerRenderedFor = new Set<string>();
  const overflowItems = new Set<string>();
  const passageContinuationReserveFragments = new Set<string>();

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
      usesSentenceInsertMarkers: group.items.some(
        (item) => item.sourceQuestion.subType === "SENTENCE_INSERT",
      ),
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
      showObjectiveAnswer: false,
      showCustomBlock: false,
      questionRenderedLines: [],
      questionStartLineIndex: 0,
      questionTotalLines: 0,
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
        cost += passageChromeHeight(
          block.group,
          settings,
          includeTitle,
          block.lineIndex + 1 < block.totalLines,
        );
      }
      return cost;
    }

    if (block.kind === "passage-atom") return cost;

    if (block.kind === "custom") return cost;

    const item = block.item;
    const lastPart = sameFragment ? lastFrag!.parts[lastFrag!.parts.length - 1] : undefined;
    const samePart = !!lastPart && lastPart.source.localId === item.localId;
    if (!samePart) {
      const hasPassageOrParts =
        sameFragment &&
        (lastFrag!.parts.length > 0 || lastFrag!.passageRenderedLines.length > 0);
      if (hasPassageOrParts) cost += ITEM_GAP;
    }
    return cost;
  }

  function minimumQuestionStartCost(block: FlowBlock, blockIndex: number): number {
    if (block.kind !== "question-meta") return marginalCostForBlock(block);

    const targetHeight =
      questionMetaHeight(settings) +
      questionLineHeight(settings) *
        Math.min(Math.max(block.totalLines, 1), MIN_QUESTION_START_LINES);
    let itemStartHeight = block.height;

    for (let index = blockIndex + 1; index < blocks.length; index += 1) {
      const nextBlock = blocks[index];
      const nextItem = itemForBlock(nextBlock);
      if (nextItem?.localId !== block.item.localId) break;
      itemStartHeight += nextBlock.height;
      if (itemStartHeight >= targetHeight) break;
    }

    return marginalCostForBlock(block) + Math.max(0, itemStartHeight - block.height);
  }

  function minimumPassageStartCost(block: FlowBlock, blockIndex: number): number {
    if (block.kind !== "passage-line") return marginalCostForBlock(block);

    const col = currentPage[columnIndex];
    const lastFrag = col[col.length - 1];
    const sameFragment = !!lastFrag && lastFrag.groupSourceId === block.group.id;
    const startsNewPassageFragment =
      !sameFragment || lastFrag!.passageRenderedLines.length === 0;

    if (!startsNewPassageFragment) return marginalCostForBlock(block);

    const targetLines = Math.min(
      block.totalLines - block.lineIndex,
      MIN_PASSAGE_START_LINES,
    );
    let passageStartHeight = block.height;

    for (let index = blockIndex + 1; index < blocks.length; index += 1) {
      const nextBlock = blocks[index];
      if (nextBlock.kind !== "passage-line" || nextBlock.group.id !== block.group.id) {
        break;
      }
      passageStartHeight += nextBlock.height;
      if (nextBlock.lineIndex - block.lineIndex + 1 >= targetLines) break;
    }

    return marginalCostForBlock(block) + Math.max(0, passageStartHeight - block.height);
  }

  const blocks: FlowBlock[] = [];
  for (const group of groups) {
    if (group.items[0]?.blockType !== "question") {
      const item = group.items[0];
      blocks.push({
        kind: "custom",
        group,
        item,
        height: estimateCustomBlockHeight(item, settings),
      });
      continue;
    }

    if (group.includePassage && group.passageContent) {
      const usesSentenceInsertMarkers = group.items.some(
        (item) => item.sourceQuestion.subType === "SENTENCE_INSERT",
      );
      const renderedPassageContent = formatSentenceInsertPassageMarkers(
        group.passageContent,
        usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
      );
      const lines = passageToLines(renderedPassageContent, settings);
      const keepTogether = Boolean(group.items[0]?.keepWithPrev);
      if (keepTogether) {
        const includeTitle = settings.showPassageTitle && Boolean(group.passageTitle);
        blocks.push({
          kind: "passage-atom",
          group,
          allLines: lines,
          height: passageChromeHeight(group, settings, includeTitle) + lines.length * passageLineHeight(settings),
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
      const renderedQuestionText = formatSentenceInsertPassageMarkers(
        item.questionText,
        item.sourceQuestion.subType,
      );
      const questionLines = questionToLines(renderedQuestionText, settings);
      const { givenText } = splitSentenceInsertGivenBlock(
        renderedQuestionText,
        item.sourceQuestion.subType,
      );
      const lineH = questionLineHeight(settings);
      blocks.push({
        kind: "question-meta",
        group,
        item,
        firstLine: questionLines[0] ?? null,
        totalLines: questionLines.length,
        height:
          questionMetaHeight(settings) +
          (questionLines.length > 0 ? lineH : 0) +
          (givenText ? 10 : 0),
      });
      questionLines.slice(1).forEach((line, offset) => {
        const index = offset + 1;
        blocks.push({
          kind: "question-line",
          group,
          item,
          line,
          lineIndex: index,
          totalLines: questionLines.length,
          height: lineH,
        });
      });
      item.options.forEach((option, index) => {
        blocks.push({
          kind: "option",
          group,
          item,
          option,
          index,
          height:
            estimateOptionBlockHeight(option, settings, item.sourceQuestion.subType, index) +
            (index === 0 ? OPTION_BLOCK_TOP_GAP : OPTION_ROW_GAP),
        });
      });
      if (
        settings.showAnswerSpace &&
        item.options.length > 0 &&
        item.objectiveAnswerSlots > 0
      ) {
        blocks.push({
          kind: "objective-answer",
          group,
          item,
          height: estimateObjectiveAnswerBlockHeight(item, settings),
        });
      }
      if (settings.showAnswerSpace && item.answerSpaceLines > 0) {
        blocks.push({ kind: "answer", group, item, height: estimateAnswerBlockHeight(item) });
      }
      if (settings.template === "worksheet" && item.teacherNote) {
        blocks.push({ kind: "note", group, item, height: estimateTeacherNoteHeight(item, settings) });
      }
    }
  }

  let isFirstBlockOverall = true;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const group = block.group;
    const item = itemForBlock(block);
    const isQuestionStartBlock = block.kind === "question-meta";
    const isStartBlock = isQuestionStartBlock || block.kind === "custom";
    const itemRequestsKeepStay = !!item && !isFirstBlockOverall && Boolean(item.keepWithPrev);
    const headerForceStay = isStartBlock && itemRequestsKeepStay;

    if (isStartBlock && item && !isFirstBlockOverall && !itemRequestsKeepStay) {
      if (item.breakBefore === "page") {
        if (currentPage.some((column) => column.length > 0)) pushCurrentPage();
      } else if (item.breakBefore === "column") {
        if (columnHeights[columnIndex] > 0) advanceColumn();
      }
    }

    let cost = marginalCostForBlock(block);
    let colHasContent = columnHeights[columnIndex] > 0;
    const wouldCreateQuestionOrphan =
      colHasContent &&
      isQuestionStartBlock &&
      !headerForceStay &&
      columnHeights[columnIndex] + minimumQuestionStartCost(block, blockIndex) > currentCapacity();
    const wouldCreatePassageOrphan =
      colHasContent &&
      block.kind === "passage-line" &&
      columnHeights[columnIndex] + minimumPassageStartCost(block, blockIndex) > currentCapacity();

    if (wouldCreateQuestionOrphan || wouldCreatePassageOrphan) {
      advanceColumn();
      cost = marginalCostForBlock(block);
      colHasContent = columnHeights[columnIndex] > 0;
    }

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
        const reserveContinuation = block.lineIndex + 1 < block.totalLines;
        const chrome = passageChromeHeight(
          group,
          settings,
          includeTitle,
          reserveContinuation,
        );
        columnHeights[columnIndex] += chrome;
        fragment.includePassage = true;
        fragment.passageStartLineIndex = block.lineIndex;
        fragment.passageTotalLines = block.totalLines;
        if (reserveContinuation) {
          passageContinuationReserveFragments.add(fragment.id);
        }
        if (includeTitle) passageTitleShownFor.add(group.id);
      }
      fragment.passageRenderedLines.push(block.line);
      columnHeights[columnIndex] += block.height;
      if (
        block.lineIndex + 1 >= block.totalLines &&
        passageContinuationReserveFragments.has(fragment.id)
      ) {
        columnHeights[columnIndex] -= passageContinuationReserveHeight(settings);
        passageContinuationReserveFragments.delete(fragment.id);
      }
    } else if (block.kind === "custom") {
      const part = ensurePart(fragment, block.item);
      part.showHeader = false;
      part.showCustomBlock = true;
      headerRenderedFor.add(block.item.localId);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "question-meta") {
      const part = ensurePart(fragment, block.item);
      if (!headerRenderedFor.has(block.item.localId)) {
        headerRenderedFor.add(block.item.localId);
        part.showHeader = true;
        if (block.firstLine !== null) {
          part.questionRenderedLines.push(block.firstLine);
          part.questionStartLineIndex = 0;
          part.questionTotalLines = block.totalLines;
        }
        columnHeights[columnIndex] += block.height;
        if (headerForceStay && columnHeights[columnIndex] > currentCapacity()) {
          overflowItems.add(block.item.localId);
        }
      }
    } else if (block.kind === "question-line") {
      const part = ensurePart(fragment, block.item);
      if (part.questionRenderedLines.length === 0) {
        part.questionStartLineIndex = block.lineIndex;
        part.questionTotalLines = block.totalLines;
      }
      part.questionRenderedLines.push(block.line);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "option") {
      const part = ensurePart(fragment, block.item);
      part.options.push({ option: block.option, originalIndex: block.index });
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "objective-answer") {
      const part = ensurePart(fragment, block.item);
      part.showObjectiveAnswer = true;
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "answer") {
      const part = ensurePart(fragment, block.item);
      part.showAnswer = true;
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "note") {
      ensurePart(fragment, block.item);
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
