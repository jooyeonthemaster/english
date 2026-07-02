import { GROUP_GAP, ITEM_GAP } from "./constants";
import { formatInlineMarkersForSubtype, formatSentenceInsertPassageMarkers, shouldRenderOptionListForSubtype, splitSentenceInsertGivenBlock } from "./option-display";
import { isFlowStructuredSubtype, questionStemAndBody } from "./question-body-layout";
import { isLineGapItem, LINE_GAP_MAX_PX, BLOCK_PX_PER_PT, type PaginationSettings, type PaperGroup, type PaperItem, type PaperPage, type RenderFragment, type RenderItemPart } from "./types";
import { DEFAULT_IMAGE_ASPECT, imageAspectFromDataUrl } from "@/lib/image-dims";
import type { FlowBlock, PaginationResult } from "./pagination-types";
import { GIVEN_BOX_CHROME, ITEM_RENDER_OVERHEAD, MIN_PASSAGE_START_LINES, MIN_QUESTION_START_LINES, OPTION_BLOCK_TOP_GAP, OPTION_ROW_GAP, buildStructLineBlocks, embeddedPassageBodyChrome, estimateAnswerBlockHeight, estimateExplanationBlockHeight, estimateObjectiveAnswerBlockHeight, estimateOptionBlockHeight, estimateTeacherNoteHeight, estimateTextLines, pageMetrics, passageChromeHeight, passageContinuationReserveHeight, passageLineHeight, passageToLines, questionBodyToLines, questionLineHeight, questionMetaHeight, questionToLines, resolveItemFontPx } from "./pagination-metrics";

export type {
  PaginationResult,
} from "./pagination-types";
export {
  estimateAnswerBlockHeight,
  estimateHeaderBlockHeight,
  estimateObjectiveAnswerBlockHeight,
  estimateOptionBlockHeight,
  estimatePassageHeight,
  estimateStructuredBodyHeight,
  estimateTeacherNoteHeight,
  estimateTextLines,
  glyphUnits,
  isWideGlyph,
  pageMetrics,
  passageChromeHeight,
  passageLineHeight,
  passageToLines,
  questionLineHeight,
  questionMetaHeight,
  questionToLines,
} from "./pagination-metrics";
function itemForBlock(block: FlowBlock): PaperItem | undefined {
  return block.kind === "passage-line" || block.kind === "passage-atom"
    ? undefined
    : block.item;
}

function estimateCustomBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  // 숫자 pt 가 지정되면 미리보기 px 로 환산해 줄 폭·줄높이에 반영(미지정 시 기존 sm/md/lg).
  const ptPx =
    typeof item.blockFontPt === "number" && Number.isFinite(item.blockFontPt)
      ? item.blockFontPt * BLOCK_PX_PER_PT
      : null;
  const bodyFontSize =
    ptPx ?? (item.blockFontSize === "lg" ? 14 : item.blockFontSize === "sm" ? 10 : 11.5);

  switch (item.blockType) {
    case "section": {
      const sectionFontSize = ptPx ?? 15;
      const sectionLineH = ptPx ? ptPx * 1.4 : 12;
      return 38 + estimateTextLines(item.blockTitle || item.blockText || " ", columnWidth, sectionFontSize) * sectionLineH;
    }
    case "text":
      return 20 + estimateTextLines(item.blockText || " ", columnWidth, bodyFontSize) * (ptPx ? ptPx * 1.4 : compact ? 14 : 16);
    case "divider":
      return 18 + Math.max(1, item.dividerThickness);
    case "spacer":
      // line-gap 빈 줄은 한 줄씩 일관되게 자라도록 더 큰 상한까지 그대로 반영한다.
      return isLineGapItem(item)
        ? Math.max(8, Math.min(LINE_GAP_MAX_PX, item.spacerHeight || 32))
        : Math.max(8, Math.min(160, item.spacerHeight || 32));
    case "image": {
      // 실제 렌더 높이 = 표시 폭(칸폭×imageWidth%) × 종횡비(자연 height/width).
      // 종횡비를 data URL 헤더에서 직접 읽어 추정 높이를 실제와 맞춘다 → 남은 공간에
      // 안 들어가면 배치 루프가 다음 칸/페이지로 통째로 넘긴다(미리보기와 일치).
      // 한 페이지(칸)보다 큰 아주 긴 이미지는 페이지 내용 높이로 제한(렌더에서 축소)되므로
      // 추정도 같은 상한을 적용해, 어디에도 안 들어가 넘치는 일이 없게 한다.
      const widthPct = Math.max(20, Math.min(100, item.imageWidth || 70));
      const dispW = (columnWidth * widthPct) / 100;
      const aspect = imageAspectFromDataUrl(item.imageDataUrl) ?? DEFAULT_IMAGE_ASPECT;
      const captionH = item.imageAlt ? 14 : 0;
      const cap = pageMetrics(settings, 1).capacity;
      return Math.min(cap, Math.max(40, dispW * aspect + captionH + 8));
    }
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
  // forceTwoPerPage 전용: 현재 페이지에 이미 배치된 "문항(문제)" 개수.
  // 지문 묶음은 한 덩어리로 유지하되, 한 페이지가 columns(=쪽당 문제 수)개를
  // 넘지 않도록 제한하는 데 쓴다.
  let pageQuestionCount = 0;

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
    pageQuestionCount = 0;
  }

  function advanceColumn() {
    if (columnIndex < settings.columns - 1) {
      columnIndex += 1;
    } else {
      pushCurrentPage();
    }
  }

  function currentCapacity() {
    // 강제 2문제/페이지 모드: 칸 용량을 무한으로 둬 자동 분할·오버플로 advance 를
    // 모두 비활성화하고, 그룹 경계에서만 칸을 넘긴다(아래 루프).
    if (settings.forceTwoPerPage) return Number.POSITIVE_INFINITY;
    return pageMetrics(settings, pageIndex).capacity;
  }

  function ensureFragment(group: PaperGroup): RenderFragment {
    const col = currentPage[columnIndex];
    const last = col[col.length - 1];
    if (last && last.groupSourceId === group.id) return last;

    // line-gap 빈 줄 묶음은 블록 사이 기본 여백(GROUP_GAP)을 더하지 않는다 — 렌더의
    // -mt-4 상쇄와 1:1로 맞춰 엔터 한 번이 항상 한 줄 높이만 차지하게 한다.
    const isLineGapGroup =
      group.items.length === 1 && isLineGapItem(group.items[0]);
    const gap = col.length > 0 && !isLineGapGroup ? GROUP_GAP : 0;
    const fragment: RenderFragment = {
      id: `${group.id}@p${pageIndex}c${columnIndex}n${col.length}`,
      passageTitle: group.passageTitle,
      passageContent: group.passageContent,
      includePassage: false,
      setPrompt: group.setPrompt,
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
      showExplanation: false,
      questionRenderedLines: [],
      questionStartLineIndex: 0,
      questionTotalLines: 0,
      structRows: [],
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

    // line-gap 빈 줄 묶음은 GROUP_GAP 을 더하지 않는다(ensureFragment 와 동일 규칙).
    const isLineGapGroup =
      block.group.items.length === 1 && isLineGapItem(block.group.items[0]);
    if (!sameFragment) {
      cost += col.length > 0 && !isLineGapGroup ? GROUP_GAP : 0;
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

    if (block.kind === "struct-line") {
      const lastStructPart = sameFragment
        ? lastFrag!.parts[lastFrag!.parts.length - 1]
        : undefined;
      const sameStructPart =
        !!lastStructPart && lastStructPart.source.localId === block.item.localId;
      let structCost = block.lineHeight;
      if (!sameFragment) {
        structCost += col.length > 0 ? GROUP_GAP : 0;
      } else if (!sameStructPart) {
        const hasPassageOrParts =
          lastFrag!.parts.length > 0 || lastFrag!.passageRenderedLines.length > 0;
        if (hasPassageOrParts) structCost += ITEM_GAP;
      }
      // 박스/단락 세그먼트가 현재 part 에서 처음 등장하면 박스 여백을 더한다
      // (칸 경계에서 이어질 때 새 박스의 테두리/패딩 반영).
      const segInPart =
        sameStructPart && lastStructPart!.structRows.some((row) => row.segIndex === block.segIndex);
      if (!segInPart) structCost += block.segChrome;
      return structCost;
    }

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
        const includeTitle = true;
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
      const subType = item.sourceQuestion.subType;
      const { stem, body } = questionStemAndBody(item);
      const fontPx = resolveItemFontPx(item, settings);
      const lineH = questionLineHeight(settings, fontPx);

      const stemRendered = formatInlineMarkersForSubtype(stem, subType);
      const stemLineCount = Math.max(1, questionToLines(stemRendered, settings, fontPx).length);

      const structured = isFlowStructuredSubtype(subType);
      const bodyRendered = structured ? "" : formatInlineMarkersForSubtype(body, subType);
      const bodyLines = structured ? [] : questionBodyToLines(bodyRendered, settings, item);
      const givenText = structured
        ? ""
        : splitSentenceInsertGivenBlock(bodyRendered, subType).givenText;
      const structBlocks = structured ? buildStructLineBlocks(item, group, settings) : [];

      // 헤더(번호 + 지시문)는 항상 통째로 렌더 → stem 줄 수만큼 높이를 잡는다.
      // 본문(평문 지문 / 구조화 박스)은 별도 줄 블록으로 흘려보내 칸 경계에서 쪼갠다.
      const metaHeight =
        ITEM_RENDER_OVERHEAD +
        questionMetaHeight(settings) +
        stemLineCount * lineH +
        (structured ? 0 : givenText ? GIVEN_BOX_CHROME : 0) +
        (structured ? 0 : embeddedPassageBodyChrome(item, settings));

      blocks.push({
        kind: "question-meta",
        group,
        item,
        // firstLine 은 더 이상 헤더 표시에 쓰지 않는다(지시문은 item 에서 직접 렌더).
        firstLine: null,
        // 고아(orphan) 방지 계산용 — 지시문 + 본문 줄 수 기준.
        totalLines: stemLineCount + bodyLines.length + structBlocks.length,
        height: metaHeight,
      });
      bodyLines.forEach((line, index) => {
        blocks.push({
          kind: "question-line",
          group,
          item,
          line,
          lineIndex: index,
          totalLines: bodyLines.length,
          height: lineH,
        });
      });
      structBlocks.forEach((structBlock) => blocks.push(structBlock));
      if (shouldRenderOptionListForSubtype(subType)) {
        item.options.forEach((option, index) => {
          blocks.push({
            kind: "option",
            group,
            item,
            option,
            index,
            height:
              estimateOptionBlockHeight(
                option,
                settings,
                item.sourceQuestion.subType,
                index,
                // 선택지 기본 글꼴(10/11)은 본문(10.5/11.5)과 달라, pt 가 실제 지정된
                // 경우에만 스케일을 넘긴다(미지정 시 기존 분할 그대로 — 회귀 0).
                item.blockFontPt != null ? fontPx : undefined,
              ) +
              (index === 0 ? OPTION_BLOCK_TOP_GAP : OPTION_ROW_GAP),
          });
        });
      }
      if (
        settings.showAnswerSpace &&
        shouldRenderOptionListForSubtype(subType) &&
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
      // 해설 포함 PDF: 각 문항 뒤에 인라인 정답·해설 블록(원자 단위)을 더한다.
      if (settings.includeAnswers) {
        blocks.push({
          kind: "explanation",
          group,
          item,
          height: estimateExplanationBlockHeight(item, settings),
        });
      }
    }
  }

  let isFirstBlockOverall = true;
  let forcedGroupId: string | null = null;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const group = block.group;
    const item = itemForBlock(block);
    const isQuestionStartBlock = block.kind === "question-meta";
    const isStartBlock = isQuestionStartBlock || block.kind === "custom";
    const itemRequestsKeepStay = !!item && !isFirstBlockOverall && Boolean(item.keepWithPrev);
    const headerForceStay = isStartBlock && itemRequestsKeepStay;

    // 강제 2문제/페이지 모드: 새 "문항 그룹"이 시작될 때마다 칸/페이지 경계를
    // 정한다. 지문 묶음(한 그룹에 여러 문제)은 한 덩어리로 유지하되, 한 페이지의
    // 문제 수가 columns(쪽당 문제 수)를 넘지 않도록 제한한다.
    //  - 그룹의 문제 수를 더했을 때 페이지 예산을 넘기면 새 페이지로 넘긴다.
    //  - 예산 안에 들어가면 같은 페이지의 다음 칸으로 넘긴다.
    //  - 그룹 하나가 예산보다 크면(예: 지문 묶음 3문제) 그 페이지에는 그 묶음만
    //    배치된다(분리 금지).
    // (섹션/구분선 등 비문항 블록은 칸을 차지하지 않도록 트리거하지 않는다.)
    if (settings.forceTwoPerPage) {
      const isQuestionGroup = block.group.items[0]?.blockType === "question";
      if (isQuestionGroup && block.group.id !== forcedGroupId) {
        const groupQuestionCount = block.group.items.filter(
          (groupItem) => groupItem.blockType === "question",
        ).length;
        if (!isFirstBlockOverall) {
          if (
            pageQuestionCount > 0 &&
            pageQuestionCount + groupQuestionCount > settings.columns
          ) {
            pushCurrentPage();
          } else {
            advanceColumn();
          }
        }
        pageQuestionCount += groupQuestionCount;
        forcedGroupId = block.group.id;
      }
    }

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
    } else if (block.kind === "struct-line") {
      const part = ensurePart(fragment, block.item);
      const segInPart = part.structRows.some((row) => row.segIndex === block.segIndex);
      if (!segInPart) columnHeights[columnIndex] += block.segChrome;
      part.structRows.push({
        segIndex: block.segIndex,
        style: block.style,
        paraLabel: block.paraLabel,
        line: block.line,
        isSegStart: block.isSegStart,
        isSegEnd: block.isSegEnd,
      });
      columnHeights[columnIndex] += block.lineHeight;
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
    } else if (block.kind === "explanation") {
      const part = ensurePart(fragment, block.item);
      part.showExplanation = true;
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
