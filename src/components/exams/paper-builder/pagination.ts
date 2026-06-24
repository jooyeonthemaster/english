import {
  GROUP_GAP,
  ITEM_GAP,
  PAPER_SIZE_SPECS,
  PREVIEW_PAGE_WIDTH,
  TWO_COLUMN_GAP,
} from "./constants";
import {
  formatInlineMarkersForSubtype,
  formatSentenceInsertPassageMarkers,
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  splitSentenceInsertGivenBlock,
} from "./option-display";
import {
  isSummaryCompleteMc,
  isSummaryCompleteSubtype,
  splitSummaryCompleteMcQuestionText,
  summaryCompleteMcPassageForItem,
  summaryCompleteMcSummaryForItem,
} from "./summary-complete-mc-layout";
import {
  isInlineSourcePassageSubtype,
  isFlowStructuredSubtype,
  isStructuredAtomicSubtype,
  questionStemAndBody,
  structuredSegments,
} from "./question-body-layout";
import { questionHasEmbeddedPassage } from "./passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "./text-normalization";
import type {
  OptionItem,
  PaginationSettings,
  PaperGroup,
  PaperItem,
  PaperPage,
  RenderFragment,
  RenderItemPart,
  StructRowStyle,
} from "./types";
import { LINE_GAP_MAX_PX, isLineGapItem } from "./types";

// 줄당 문자 폭 보정 계수. 미리보기/다운로드 글꼴을 맑은 고딕으로 통일하면서
// 조정했다. 맑은 고딕의 라틴 글리프가 Pretendard보다 약간 넓어 한 줄에 들어가는
// 글자수가 살짝 줄어들므로, 줄바꿈 과소예측을 막기 위해 계수를 소폭 낮춘다.
// (양쪽이 같은 글꼴을 쓰므로 정확한 페이지 분할 일치는 요구되지 않음.)
const LINE_WIDTH_FUDGE = 0.99;
// 고아(orphan) 방지 최소 줄 수. 칸 경계에서 새 문항/지문이 시작할 때 최소 이만큼은
// 함께 둔다. 너무 크면(원래 8/4) 칸 하단 빈 공간이 이 값보다 작을 때 다음 문항이
// "통째로" 다음 칸/페이지로 넘어가 큰 여백이 남는다. 8→3 / 4→2 로 낮추면, 키 큰 문항
// (요약문·지문 박스 등)이 남은 공간에서 시작해 줄 단위로 쪼개지며 칸을 끝까지 채운다.
// (본문은 "(이어짐)" 마커로 분할되도록 설계돼 있어 시작 줄 수를 줄여도 잘리지 않는다.)
const MIN_QUESTION_START_LINES = 3;
const MIN_PASSAGE_START_LINES = 2;
const BOXED_PASSAGE_HORIZONTAL_INSET = 28;
// 칸 하단 안전 여백. 모든 본문이 줄 단위로 쪼개지므로 추정 오차가 작아
// 여백을 줄여 내용이 footer 근처까지 채워지도록 한다(잘림은 줄 단위 분할로 방지).
// 인쇄(window.print)가 미리보기와 1:1 균일배율로 렌더되도록 print-styles.tsx 를
// 고친 뒤에는 미리보기가 곧 인쇄 결과(WYSIWYG)이므로, 과채움이 생기면 미리보기에서
// 바로 보인다 → 가드를 44→20 으로 낮춰 본문을 footer 끝선 가까이 더 내린다.
// (지문 위주 칸은 줄 단위 추정이 정확해 under-count 가 작다. 잘림은 미리보기에서
//  즉시 확인 가능하므로, 잘리면 이 값을 다시 올린다.)
const PAGE_BOTTOM_GUARD = 20;
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
  const firstPageHeader =
    settings.firstPageHeaderPx ?? (compact ? 82 : 96);
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
    capacity: Math.max(
      420,
      contentHeight - PAGE_BOTTOM_GUARD - (settings.contentSafetyPx ?? 0),
    ),
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

// 지문이 칸 경계에서 쪼개질 때 "(다음 칸으로 이어짐 →)" 마커 자리만큼 미리 비워둔다.
// 마커는 화면 전용(no-print)이라 인쇄엔 안 나오므로 보수적으로 크게 잡을 필요가 없다.
// 값을 줄이면(18→10 / 16→9) 분할 지문이 칸 하단까지 더 채워진다.
function passageContinuationReserveHeight(settings: PaginationSettings): number {
  return settings.density === "compact" ? 9 : 10;
}

export function questionLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  return fontSize * (compact ? 1.46 : 1.58);
}

export function questionMetaHeight(settings: PaginationSettings): number {
  return settings.showQuestionMeta ? 18 : 16;
}

// --- 구조화 본문(지문 박스/요약 박스/순서 단락 등) 높이 추정 ------------------
// a4-paper-page.tsx 의 실제 렌더 박스 치수(px-2.5 py-2 border, space-y-2, ↓)를
// 모델링한다. 살짝 보수적으로 잡아 칸 경계에서 잘리지 않도록 한다.
const STRUCT_BOX_CHROME = 18; // 박스(지문/요약/given) 1개당 상하 테두리+패딩
const STRUCT_PASSAGE_TITLE_HEIGHT = 15;
const BOX_TEXT_INSET = 24; // px-2.5(20) + border(2) + 여유
const STRUCTURE_GAP = 8; // space-y-2
const HEADER_BODY_GAP = 8; // 헤더(지시문)과 본문 사이 간격
const ARROW_BLOCK_HEIGHT = 16; // ↓ 라인
const GIVEN_BOX_CHROME = 32; // SENTENCE_INSERT 주어진 문장 박스: 테두리+패딩+'주어진 문장' 라벨 줄
// 문항 1개당 추정에 잡히지 않는 렌더 여백 합(part py-0.5 + 헤더 mb-1 + 본문 mt-1 등).
// 여러 문항이 한 칸에 쌓일 때 누적 오차로 칸 경계를 넘지 않도록 보정한다.
const ITEM_RENDER_OVERHEAD = 12;

function boxLineHeight(settings: PaginationSettings): number {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  // 박스 본문 줄높이를 평문(questionLineHeight)과 통일 — a4 StructuredBody leading 과 1:1.
  return fontSize * (compact ? 1.46 : 1.58);
}

function structuredBoxChrome(style: Extract<StructRowStyle, "passage" | "summary" | "given">, settings: PaginationSettings): number {
  if (style !== "passage") return STRUCT_BOX_CHROME;
  return settings.passageStyle === "plain" ? 8 : STRUCT_BOX_CHROME;
}

function structuredPassageTitleHeight(
  item: PaperItem,
  settings: PaginationSettings,
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
): number {
  if (style !== "passage" || !settings.showPassageTitle) return 0;
  const title = normalizeInlineText(
    item.passageTitle || item.sourceQuestion.passage?.title || "",
  );
  return title ? STRUCT_PASSAGE_TITLE_HEIGHT : 0;
}

function structuredBoxTextWidth(
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
  settings: PaginationSettings,
): number {
  const { columnWidth } = pageMetrics(settings, 0);
  if (style !== "passage") return Math.max(80, columnWidth - BOX_TEXT_INSET);
  return settings.passageStyle === "boxed"
    ? Math.max(80, columnWidth - BOX_TEXT_INSET)
    : columnWidth;
}

function structuredBoxTextHeight(
  text: string,
  settings: PaginationSettings,
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
): number {
  if (!text.trim()) return 0;
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  const lines = estimateTextLines(text, structuredBoxTextWidth(style, settings), fontSize);
  return structuredBoxChrome(style, settings) + lines * boxLineHeight(settings);
}

function questionBodyAfterStem(item: PaperItem): string {
  const normalized = normalizeQuestionText(item.questionText || "");
  const blocks = normalized.split(/\n{2,}/);
  return blocks.slice(1).join("\n\n").trim();
}

// 구조화 유형(요약문/순서/주제·요지·제목·내용일치)의 헤더(지시문) 아래
// 본문 영역 높이. 헤더(번호+지시문)는 별도 question-meta 높이로 계산한다.
export function estimateStructuredBodyHeight(
  item: PaperItem,
  settings: PaginationSettings,
): number {
  const subType = item.sourceQuestion.subType;

  if (isSummaryCompleteSubtype(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const { summary: rawSummary } = splitSummaryCompleteMcQuestionText(item.questionText);
    const summary = summaryCompleteMcSummaryForItem(item, rawSummary);
    const blocks: number[] = [];
    if (passage) {
      blocks.push(
        structuredBoxTextHeight(passage, settings, "passage") +
          structuredPassageTitleHeight(item, settings, "passage"),
      );
    }
    if (isSummaryCompleteMc(subType)) blocks.push(ARROW_BLOCK_HEIGHT);
    if (summary) blocks.push(structuredBoxTextHeight(summary, settings, "summary"));
    return (
      HEADER_BODY_GAP +
      blocks.reduce((sum, h) => sum + h, 0) +
      STRUCTURE_GAP * Math.max(0, blocks.length - 1)
    );
  }

  if (isInlineSourcePassageSubtype(subType)) {
    const passage = normalizePassageText(
      item.passageContent || item.sourceQuestion.passage?.content || "",
    );
    const bodyAfterStem = questionBodyAfterStem(item);
    let height = HEADER_BODY_GAP;
    if (bodyAfterStem) {
      const { columnWidth } = pageMetrics(settings, 0);
      const fontSize = settings.density === "compact" ? 10.5 : 11.5;
      height +=
        estimateTextLines(bodyAfterStem, columnWidth, fontSize) * questionLineHeight(settings) +
        STRUCTURE_GAP;
    }
    if (passage) {
      height +=
        structuredBoxTextHeight(passage, settings, "passage") +
        structuredPassageTitleHeight(item, settings, "passage");
    }
    return height;
  }

  // SENTENCE_ORDER: [given] 박스 + (A)(B)(C) 단락(비박스) + 기타.
  const bodyText = questionBodyAfterStem(item);
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = settings.density === "compact" ? 10.5 : 11.5;
  let height =
    HEADER_BODY_GAP + estimateTextLines(bodyText, columnWidth, fontSize) * questionLineHeight(settings);
  if (/\[(?:주어진\s*문장|given)\]/i.test(bodyText)) {
    height += GIVEN_BOX_CHROME;
  }
  return height;
}

// 구조화 본문을 줄 단위 flow 블록으로 분해한다(박스/단락이 칸 경계에서 쪼개지도록).
function boxTextToLines(
  text: string,
  settings: PaginationSettings,
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
): string[] {
  const compact = settings.density === "compact";
  const fontSize = compact ? 10.5 : 11.5;
  const lines = textToLines(text, structuredBoxTextWidth(style, settings), fontSize);
  return lines.length > 0 ? lines : [""];
}

function columnTextToLines(text: string, settings: PaginationSettings): string[] {
  const lines = questionToLines(text, settings);
  return lines.length > 0 ? lines : [""];
}

function buildStructLineBlocks(
  item: PaperItem,
  group: PaperGroup,
  settings: PaginationSettings,
): FlowBlock[] {
  const boxLineH = boxLineHeight(settings);
  const textLineH = questionLineHeight(settings);
  const blocks: FlowBlock[] = [];

  structuredSegments(item).forEach((seg, segIndex) => {
    if (seg.kind === "arrow") {
      const segChrome = STRUCTURE_GAP + ARROW_BLOCK_HEIGHT;
      blocks.push({
        kind: "struct-line",
        group,
        item,
        segIndex,
        style: "arrow",
        line: "",
        isSegStart: true,
        isSegEnd: true,
        lineHeight: 0,
        segChrome,
        height: segChrome,
      });
      return;
    }

    let lines: string[];
    let style: StructRowStyle;
    let lineHeight: number;
    let segChrome: number;
    let paraLabel: string | undefined;

    if (seg.kind === "box") {
      style = seg.boxStyle;
      lines = boxTextToLines(seg.text, settings, style);
      lineHeight = boxLineH;
      segChrome = STRUCTURE_GAP + structuredBoxChrome(style, settings);
    } else if (seg.kind === "para") {
      lines = columnTextToLines(seg.text, settings);
      style = "para";
      lineHeight = textLineH;
      segChrome = STRUCTURE_GAP;
      paraLabel = seg.label;
    } else {
      lines = columnTextToLines(seg.text, settings);
      style = "text";
      lineHeight = textLineH;
      segChrome = STRUCTURE_GAP;
    }

    lines.forEach((line, lineIndex) => {
      const lineSegChrome =
        segChrome +
        (lineIndex === 0 && style === "passage"
          ? structuredPassageTitleHeight(item, settings, "passage")
          : 0);
      blocks.push({
        kind: "struct-line",
        group,
        item,
        segIndex,
        style,
        paraLabel,
        line,
        isSegStart: lineIndex === 0,
        isSegEnd: lineIndex === lines.length - 1,
        lineHeight,
        segChrome: lineSegChrome,
        height: lineHeight + (lineIndex === 0 ? lineSegChrome : 0),
      });
    });
  });

  return blocks;
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

// 지문이 문항 본문에 내장된 유형(무관한 문장·문장 삽입·어법 등)인지.
// a4-paper-page.tsx 가 이 유형의 본문에 "지문 스타일" 박스/밑줄을 그리므로,
// 줄넘김 폭과 박스 테두리 높이를 페이지네이션에도 동일하게 반영해야 한다.
function hasEmbeddedPassageBody(item: PaperItem): boolean {
  return (
    item.blockType === "question" &&
    !isStructuredAtomicSubtype(item.sourceQuestion.subType) &&
    questionHasEmbeddedPassage(item.sourceQuestion)
  );
}

// 내장 지문 본문의 줄넘김 폭: 박스 스타일이면 좌우 패딩만큼 좁아진다
// (a4-paper-page.tsx 의 px-3 ≈ BOXED_PASSAGE_HORIZONTAL_INSET).
function questionBodyToLines(
  content: string,
  settings: PaginationSettings,
  item: PaperItem,
): string[] {
  if (!content) return [];
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 10.5 : 11.5;
  const width =
    settings.passageStyle === "boxed" && hasEmbeddedPassageBody(item)
      ? Math.max(80, columnWidth - BOXED_PASSAGE_HORIZONTAL_INSET)
      : columnWidth;
  return textToLines(normalizeQuestionText(content), width, fontSize);
}

// 내장 지문 본문 박스의 상하 테두리+패딩 높이(평문=0).
function embeddedPassageBodyChrome(item: PaperItem, settings: PaginationSettings): number {
  if (!hasEmbeddedPassageBody(item)) return 0;
  return settings.passageStyle === "boxed"
    ? 24
    : settings.passageStyle === "underlined"
      ? 18
      : 0;
}

function embeddedPassageTitleHeight(item: PaperItem, settings: PaginationSettings): number {
  if (!hasEmbeddedPassageBody(item) || !settings.showPassageTitle) return 0;
  const title = normalizeInlineText(
    item.passageTitle || item.sourceQuestion.passage?.title || "",
  );
  return title ? STRUCT_PASSAGE_TITLE_HEIGHT : 0;
}

export function estimatePassageHeight(group: PaperGroup, settings: PaginationSettings): number {
  if (!group.includePassage || !group.passageContent) return 0;
  const lines = passageToLines(group.passageContent, settings);
  const includeTitle = settings.showPassageTitle && Boolean(group.passageTitle);
  return passageChromeHeight(group, settings, includeTitle) + lines.length * passageLineHeight(settings);
}

// 헤더(번호 + 지시문) 높이. 지시문은 항상 통째로 헤더에 렌더되므로
// stem 의 줄 수만큼 높이를 잡는다(본문/구조화 박스는 별도 계산).
function estimateStemHeight(item: PaperItem, settings: PaginationSettings): number {
  const { stem } = questionStemAndBody(item);
  const stemRendered = formatInlineMarkersForSubtype(stem, item.sourceQuestion.subType);
  const stemLines = questionToLines(stemRendered, settings);
  return (
    questionMetaHeight(settings) +
    Math.max(1, stemLines.length) * questionLineHeight(settings)
  );
}

export function estimateHeaderBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const subType = item.sourceQuestion.subType;
  let height = estimateStemHeight(item, settings) + ITEM_RENDER_OVERHEAD;
  if (isFlowStructuredSubtype(subType)) {
    height += estimateStructuredBodyHeight(item, settings);
  } else {
    const { body } = questionStemAndBody(item);
    const bodyRendered = formatInlineMarkersForSubtype(body, subType);
    height +=
      questionBodyToLines(bodyRendered, settings, item).length * questionLineHeight(settings);
    height += embeddedPassageBodyChrome(item, settings);
    height += embeddedPassageTitleHeight(item, settings);
    const { givenText } = splitSentenceInsertGivenBlock(bodyRendered, subType);
    if (givenText) height += GIVEN_BOX_CHROME;
  }
  return height;
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
  | {
      kind: "struct-line";
      group: PaperGroup;
      item: PaperItem;
      segIndex: number;
      style: StructRowStyle;
      paraLabel?: string;
      line: string;
      isSegStart: boolean;
      isSegEnd: boolean;
      lineHeight: number;
      segChrome: number;
      height: number;
    }
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
      // line-gap 빈 줄은 한 줄씩 일관되게 자라도록 더 큰 상한까지 그대로 반영한다.
      return isLineGapItem(item)
        ? Math.max(8, Math.min(LINE_GAP_MAX_PX, item.spacerHeight || 32))
        : Math.max(8, Math.min(160, item.spacerHeight || 32));
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
      const subType = item.sourceQuestion.subType;
      const { stem, body } = questionStemAndBody(item);
      const lineH = questionLineHeight(settings);

      const stemRendered = formatInlineMarkersForSubtype(stem, subType);
      const stemLineCount = Math.max(1, questionToLines(stemRendered, settings).length);

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
              estimateOptionBlockHeight(option, settings, item.sourceQuestion.subType, index) +
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
    }

    isFirstBlockOverall = false;
  }

  if (currentPage.some((column) => column.length > 0)) pages.push(currentPage);
  return {
    pages: pages.length > 0 ? pages : [Array.from({ length: settings.columns }, () => [])],
    overflowItems,
  };
}
