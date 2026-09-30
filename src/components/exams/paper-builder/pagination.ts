import { GROUP_GAP, ITEM_GAP } from "./constants";
import { formatInlineMarkersForSubtype, formatSentenceInsertPassageMarkers, shouldRenderOptionListForSubtype, splitSentenceInsertGivenBlock } from "./option-display";
import { isFlowStructuredSubtype, isGichulLetterOptionItem, questionStemAndBody } from "./question-body-layout";
import { isLineGapItem, LINE_GAP_MAX_PX, BLOCK_PX_PER_PT, type PaginationSettings, type PaperGroup, type PaperItem, type PaperPage, type RenderFragment, type RenderItemPart } from "./types";
import { DEFAULT_IMAGE_ASPECT, imageAspectFromDataUrl } from "@/lib/image-dims";
import type { FlowBlock, PaginationKeepSettings, PaginationResult } from "./pagination-types";
import { forcedPerPageEnabled, keepOptionGroupsEnabled, keptRunEnd, keptRunHeadFreshCost, keptRunTailHeight } from "./pagination-keep";
import { estimateMultiBlankOptionHeights } from "./multi-blank-grid-metrics";
import { buildExplanationRows } from "./explanation-content";
import { appendExplanationUnit, layoutExplanationUnits } from "./explanation-layout";
import { GIVEN_BOX_CHROME, QUESTION_BODY_TOP_GAP, continuationPartChrome, itemRenderOverhead, questionStemPointsSuffix, stemLineCount, textMetricsOf, MIN_PASSAGE_START_LINES, MIN_QUESTION_START_LINES, OPTION_BLOCK_TOP_GAP, OPTION_ROW_GAP, buildStructLineBlocks, embeddedPassageBodyChrome, estimateAnswerBlockHeight, estimateExplanationBlockHeight, estimateObjectiveAnswerBlockHeight, estimateOptionBlockHeight, estimateTeacherNoteHeight, estimateTextLines, multiBlankOptionsHeaderHeight, pageMetrics, passageChromeHeight, passageContinuationReserveHeight, passageLineHeight, passageToLines, questionBodyToLines, questionLineHeight, questionMetaHeight, resolveItemFontPx } from "./pagination-metrics";

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
      return (
        38 +
        estimateTextLines(
          item.blockTitle || item.blockText || " ",
          columnWidth,
          sectionFontSize,
          textMetricsOf(settings),
        ) *
          sectionLineH
      );
    }
    case "text":
      return (
        20 +
        estimateTextLines(item.blockText || " ", columnWidth, bodyFontSize, textMetricsOf(settings)) *
          (ptPx ? ptPx * 1.4 : compact ? 14 : 16)
      );
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

export function paginateGroups(
  groups: PaperGroup[],
  settings: PaginationSettings & PaginationKeepSettings,
): PaginationResult {
  const pages: PaperPage[] = [];
  let pageIndex = 0;
  let columnIndex = 0;
  let currentPage: PaperPage = Array.from({ length: settings.columns }, () => []);
  let columnHeights = Array.from({ length: settings.columns }, () => 0);
  // 「쪽당 N문제」 강제 배치 — 해설 포함 모드에서는 끈다(forcedPerPageEnabled, HWPX 와 같은 정책 · E1).
  const forcedPerPage = forcedPerPageEnabled(settings);
  // forcedPerPage 전용: 현재 페이지에 이미 배치된 "문항(문제)" 개수.
  // 지문 묶음은 한 덩어리로 유지하되, 한 페이지가 columns(=쪽당 문제 수)개를
  // 넘지 않도록 제한하는 데 쓴다.
  let pageQuestionCount = 0;
  // 칸별 배치 블록 수·페이지별 추정치(실측 넘침 가드용 — PaginationResult.columns).
  let columnBlockCounts = Array.from({ length: settings.columns }, () => 0);
  const columnsInfo: NonNullable<PaginationResult["columns"]> = [];

  const passageTitleShownFor = new Set<string>();
  const headerRenderedFor = new Set<string>();
  const overflowItems = new Set<string>();
  const passageContinuationReserveFragments = new Set<string>();

  function recordPage() {
    const baseCapacity = pageMetrics(settings, pageIndex).capacity;
    pages.push(currentPage);
    columnsInfo.push({
      used: [...columnHeights],
      capacity: Array.from({ length: settings.columns }, () => baseCapacity),
      blocks: [...columnBlockCounts],
    });
  }

  function pushCurrentPage() {
    if (currentPage.some((column) => column.length > 0)) recordPage();
    pageIndex += 1;
    columnIndex = 0;
    currentPage = Array.from({ length: settings.columns }, () => []);
    columnHeights = Array.from({ length: settings.columns }, () => 0);
    columnBlockCounts = Array.from({ length: settings.columns }, () => 0);
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
    if (forcedPerPage) return Number.POSITIVE_INFINITY;
    // 실측 넘침 가드 보정 — 키는 **렌더** 페이지 index(= 이 페이지가 들어갈 pages 자리)다.
    const adjust = settings.columnCapacityAdjust?.[`${pages.length}:${columnIndex}`] ?? 0;
    return pageMetrics(settings, pageIndex).capacity - adjust;
  }

  // advanceColumn() 뒤 칸의 용량(currentCapacity 와 같은 규칙) — 선지 묶음이 빈 다음 칸에 들어가는지 볼 때 쓴다.
  function nextColumnCapacity() {
    if (columnIndex < settings.columns - 1) {
      const adjust = settings.columnCapacityAdjust?.[`${pages.length}:${columnIndex + 1}`] ?? 0;
      return pageMetrics(settings, pageIndex).capacity - adjust;
    }
    const renderPage = pages.length + (currentPage.some((column) => column.length > 0) ? 1 : 0);
    const adjust = settings.columnCapacityAdjust?.[`${renderPage}:0`] ?? 0;
    return pageMetrics(settings, pageIndex + 1).capacity - adjust;
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
    // 이어지는 조각은 머리에 「(N번 계속)」 라벨이 붙는다 — 그 자리를 함께 예약한다.
    const continuationChrome = isFreshStart ? 0 : continuationPartChrome(settings);
    const part: RenderItemPart = {
      source: item,
      partKey: `${item.localId}@p${pageIndex}c${columnIndex}f${fragment.id}n${fragment.parts.length}`,
      showHeader: isFreshStart,
      showAnswer: false,
      showObjectiveAnswer: false,
      showCustomBlock: false,
      showExplanation: false,
      estHeight: 0,
      questionRenderedLines: [],
      questionStartLineIndex: 0,
      questionTotalLines: 0,
      structRows: [],
      options: [],
      isStart: isFreshStart,
      isContinuation: !isFreshStart,
    };
    fragment.parts.push(part);
    columnHeights[columnIndex] += partGap + continuationChrome;
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
      if (!sameStructPart && headerRenderedFor.has(block.item.localId)) {
        structCost += continuationPartChrome(settings);
      }
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
      // 헤더를 이미 앞 칸에서 그린 문항이면 이 조각 머리에 「(N번 계속)」 라벨이 붙는다.
      if (headerRenderedFor.has(item.localId)) cost += continuationPartChrome(settings);
      // 해설 조각이 문항 조각 맨 처음에 놓이면 첫 행의 위 여백을 그리지 않는다(exam-explanation-block).
      if (block.kind === "explanation" && block.unit) cost -= block.unit.topGap;
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
        // 각주 줄("* word: 뜻")은 지문 마지막 줄과 한 블록으로 묶는다 — 줄 단위 흐름에서 각주만 다음 칸/쪽으로
        // 밀려 각주 한 줄짜리 백지 페이지가 생겼다(기출 전수 렌더 실측). 묶인 줄은 "\n" 으로 이어 pre-line 렌더에서 줄바꿈된다.
        const packed: { line: string; height: number }[] = [];
        for (const line of lines) {
          const prev = packed[packed.length - 1];
          if (prev && /^\s*[*＊]\s*[A-Za-z]/.test(line)) {
            prev.line = `${prev.line}\n${line}`;
            prev.height += lineH;
          } else {
            packed.push({ line, height: lineH });
          }
        }
        packed.forEach((p, idx) => {
          blocks.push({
            kind: "passage-line",
            group,
            line: p.line,
            lineIndex: idx,
            totalLines: packed.length,
            height: p.height,
          });
        });
      }
    }

    for (const item of group.items) {
      const subType = item.sourceQuestion.subType;
      const { stem, body } = questionStemAndBody(item);
      const fontPx = resolveItemFontPx(item, settings);
      const lineH = questionLineHeight(settings, fontPx);

      // 발문은 헤더에 통째로 렌더된다 — 「[3점]」 꼬리까지 포함해 실제 그려지는 문자열로 줄 수를 센다.
      const stemRendered =
        formatInlineMarkersForSubtype(stem, subType) +
        questionStemPointsSuffix(item, stem, settings.showQuestionMeta);
      const stemLines = stemLineCount(item, stemRendered, settings, fontPx);

      const structured = isFlowStructuredSubtype(subType);
      const bodyRendered = structured ? "" : formatInlineMarkersForSubtype(body, subType);
      const bodyLines = structured ? [] : questionBodyToLines(bodyRendered, settings, item);
      const givenText = structured
        ? ""
        : splitSentenceInsertGivenBlock(bodyRendered, subType).givenText;
      const structBlocks = structured ? buildStructLineBlocks(item, group, settings) : [];

      // 헤더(번호 + 지시문)는 항상 통째로 렌더 → stem 줄 수만큼 높이를 잡는다.
      // 본문(평문 지문 / 구조화 박스)은 별도 줄 블록으로 흘려보내 칸 경계에서 쪼갠다.
      // 본문(평문 p.mt-1 / 구조화 div.mt-1)이 붙으면 그 위 여백 4px 을 더한다(exam-font 모드 실측).
      const hasBodyBelowHeader = structured ? structBlocks.length > 0 : bodyLines.length > 0;
      const metaHeight =
        itemRenderOverhead(settings) +
        questionMetaHeight(settings) +
        stemLines * lineH +
        (hasBodyBelowHeader && textMetricsOf(settings) === "exam-font" ? QUESTION_BODY_TOP_GAP : 0) +
        (structured ? 0 : givenText ? GIVEN_BOX_CHROME : 0) +
        (structured ? 0 : embeddedPassageBodyChrome(item, settings));

      blocks.push({
        kind: "question-meta",
        group,
        item,
        // firstLine 은 더 이상 헤더 표시에 쓰지 않는다(지시문은 item 에서 직접 렌더).
        firstLine: null,
        // 고아(orphan) 방지 계산용 — 지시문 + 본문 줄 수 기준.
        totalLines: stemLines + bodyLines.length + structBlocks.length,
        height: metaHeight,
      });
      // 각주 줄("* word: 뜻")은 본문 마지막 줄과 한 블록으로 묶는다(줄 단위 흐름에서 각주만 다음 칸/쪽으로 밀리는 것 방지 —
      // 기출 전수 렌더 실측). 묶인 줄은 "\n" 으로 이어져 pre-line 렌더에서 줄바꿈된다.
      const packedBody: { line: string; extra: number }[] = [];
      for (const line of bodyLines) {
        const prev = packedBody[packedBody.length - 1];
        if (prev && /^\s*[*＊]\s*[A-Za-z]/.test(line)) { prev.line = `${prev.line}\n${line}`; prev.extra += 1; }
        else packedBody.push({ line, extra: 0 });
      }
      packedBody.forEach((p, index) => {
        blocks.push({
          kind: "question-line",
          group,
          item,
          line: p.line,
          lineIndex: index,
          totalLines: packedBody.length,
          height: lineH * (1 + p.extra),
        });
      });
      structBlocks.forEach((structBlock) => blocks.push(structBlock));
      // 은행 장문 세트 42/44 는 선지가 「① (a) … ⑤ (e)」 **한 줄**로 렌더된다(a4-paper-page
      // gichulLetterOptions) — 5줄로 잡으면 4줄이 헛되이 예약되고, 칸 경계에서 5조각이
      // 갈라지면 한 줄 배치가 두 동강 난다. 첫 선지에만 한 줄 높이를 주고 나머지는 0 으로
      // 둬 원자적으로 같은 조각에 남게 한다(비용 0 인 블록은 절대 넘치지 않는다).
      const gichulLetterOptions = isGichulLetterOptionItem(item);
      // 다중 빈칸 조합 선지(컬럼 헤더 그리드)는 값이 좁은 열 안에서 접혀 인라인 추정과 크게 다르다
      // — 그리드 트랙 크기를 재현한 행 높이를 쓴다(multi-blank-grid-metrics.ts). null 이면 종전 추정.
      const multiBlankHeights =
        !gichulLetterOptions && settings.multiBlankOptionLayout !== "inline"
          ? estimateMultiBlankOptionHeights(item, settings)
          : null;
      if (shouldRenderOptionListForSubtype(subType) || gichulLetterOptions) {
        item.options.forEach((option, index) => {
          blocks.push({
            kind: "option",
            group,
            item,
            option,
            index,
            height: multiBlankHeights
              ? multiBlankHeights[index]
              : gichulLetterOptions
              ? index === 0
                ? questionLineHeight(settings, item.blockFontPt != null ? fontPx : undefined) +
                  OPTION_BLOCK_TOP_GAP
                : 0
              :
              estimateOptionBlockHeight(
                option,
                settings,
                item.sourceQuestion.subType,
                index,
                // 선택지 기본 글꼴(10/11)은 본문(10.5/11.5)과 달라, pt 가 실제 지정된
                // 경우에만 스케일을 넘긴다(미지정 시 기존 분할 그대로 — 회귀 0).
                item.blockFontPt != null ? fontPx : undefined,
              ) +
              (index === 0 ? OPTION_BLOCK_TOP_GAP : OPTION_ROW_GAP) +
              // 다중 빈칸(BLANK_INFERENCE) 컬럼 헤더 행 — 렌더(a4-paper-page)는
              // 첫 선지(①)가 배치된 조각에 헤더를 그리므로 첫 선지 블록에만 더한다
              // (블록은 원자 단위라 헤더+① 이 같은 칸에 함께 배치됨이 보장된다).
              (index === 0
                ? multiBlankOptionsHeaderHeight(
                    item,
                    settings,
                    item.blockFontPt != null ? fontPx : undefined,
                  )
                : 0),
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
      // 해설 포함 PDF: 각 문항 뒤에 인라인 정답·해설. exam-font(미리보기 · 인쇄)는 렌더 줄 단위 흐름 단위로 나눠
      // 칸 · 쪽 경계에서 갈라지게 한다(한 칸보다 긴 해설이 종이 끝에서 잘리던 PRINT-R3). legacy 는 종전 원자 블록.
      if (settings.includeAnswers) {
        if (textMetricsOf(settings) === "exam-font") {
          const units = layoutExplanationUnits(
            buildExplanationRows(item),
            pageMetrics(settings, 0).columnWidth,
            settings.density === "compact",
          );
          for (const unit of units) blocks.push({ kind: "explanation", group, item, height: unit.height, unit });
        } else {
          blocks.push({ kind: "explanation", group, item, height: estimateExplanationBlockHeight(item, settings) });
        }
      }
    }
  }

  let isFirstBlockOverall = true;
  let forcedGroupId: string | null = null;
  // 선지 묶음(pagination-keep.ts) — 머리를 놓은 칸에 묶음 전체가 들어갔으면 이 index 까지는 칸을 넘기지 않는다.
  const keepOptions = keepOptionGroupsEnabled(settings);
  let keepStayUntil = -1;

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
    if (forcedPerPage) {
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

    // 선지 묶음 머리: 이 칸에 묶음이 다 안 들어가고 빈 다음 칸에는 들어가면 머리 앞에서 넘긴다.
    // 한 칸보다 긴 묶음은 넘기지 않고 종전처럼 블록 단위로 흘린다(EXAM-PAPER-MODEL §9 예외).
    const runEnd = keepOptions && blockIndex > keepStayUntil ? keptRunEnd(blocks, blockIndex) : -1;
    if (runEnd > blockIndex && columnHeights[columnIndex] > 0 && !headerForceStay) {
      const tail = keptRunTailHeight(blocks, blockIndex, runEnd);
      if (
        columnHeights[columnIndex] + marginalCostForBlock(block) + tail > currentCapacity() &&
        keptRunHeadFreshCost(block, settings) + tail <= nextColumnCapacity()
      ) {
        advanceColumn();
      }
    }
    const keepStay = blockIndex <= keepStayUntil;

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

    if (wouldOverflow && !headerForceStay && !keepStay) {
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
      part.estHeight = (part.estHeight ?? 0) + block.height;
      part.showHeader = false;
      part.showCustomBlock = true;
      headerRenderedFor.add(block.item.localId);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "question-meta") {
      const part = ensurePart(fragment, block.item);
      part.estHeight = (part.estHeight ?? 0) + block.height;
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
      part.estHeight = (part.estHeight ?? 0) + block.height;
      if (part.questionRenderedLines.length === 0) {
        part.questionStartLineIndex = block.lineIndex;
        part.questionTotalLines = block.totalLines;
      }
      part.questionRenderedLines.push(block.line);
      columnHeights[columnIndex] += block.height;
    } else if (block.kind === "struct-line") {
      const part = ensurePart(fragment, block.item);
      part.estHeight = (part.estHeight ?? 0) + block.height;
      const segInPart = part.structRows.some((row) => row.segIndex === block.segIndex);
      if (!segInPart) columnHeights[columnIndex] += block.segChrome;
      part.structRows.push({
        segIndex: block.segIndex,
        style: block.style,
        paraLabel: block.paraLabel,
        line: block.line,
        isSegStart: block.isSegStart,
        isSegEnd: block.isSegEnd,
        isSourceLineStart: block.isSourceLineStart,
      });
      columnHeights[columnIndex] += block.lineHeight;
    } else if (block.kind === "option") {
      const part = ensurePart(fragment, block.item);
      part.estHeight = (part.estHeight ?? 0) + block.height;
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
      const lastPart = fragment.parts[fragment.parts.length - 1];
      const atPartStart = !lastPart || lastPart.source.localId !== block.item.localId;
      const part = ensurePart(fragment, block.item);
      part.showExplanation = true;
      let height = block.height;
      if (block.unit) {
        if (atPartStart) height -= block.unit.topGap;
        part.explanation ??= { containerStart: false, atPartStart, pieces: [] };
        appendExplanationUnit(part.explanation, block.unit);
        part.explanation.estHeight = (part.explanation.estHeight ?? 0) + height;
        part.estHeight = (part.estHeight ?? 0) + height;
      }
      columnHeights[columnIndex] += height;
    }

    if (runEnd > blockIndex) {
      const fits =
        columnHeights[columnIndex] + keptRunTailHeight(blocks, blockIndex, runEnd) <= currentCapacity();
      keepStayUntil = fits ? runEnd : -1;
    }

    columnBlockCounts[columnIndex] += 1;
    isFirstBlockOverall = false;
  }

  if (currentPage.some((column) => column.length > 0)) recordPage();
  return {
    pages: pages.length > 0 ? pages : [Array.from({ length: settings.columns }, () => [])],
    overflowItems,
    columns: columnsInfo,
  };
}
