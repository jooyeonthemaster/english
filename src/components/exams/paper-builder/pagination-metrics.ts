import { PAPER_SIZE_SPECS, PREVIEW_PAGE_WIDTH, TWO_COLUMN_GAP } from "./constants";
import { formatInlineMarkersForSubtype, optionDisplayTextForSubtype, splitSentenceInsertGivenBlock } from "./option-display";
import { isSummaryCompleteMc, isSummaryCompleteSubtype, splitSummaryCompleteMcQuestionText, summaryCompleteMcPassageForItem, summaryCompleteMcSummaryForItem } from "./summary-complete-mc-layout";
import { isFlowStructuredSubtype, isInlineSourcePassageSubtype, isStructuredAtomicSubtype, questionStemAndBody, structuredSegments } from "./question-body-layout";
import { questionHasEmbeddedPassage } from "./passage-policy";
import { normalizeInlineText, normalizePassageText, normalizeQuestionText } from "./text-normalization";
import type { OptionItem, PaginationSettings, PaperGroup, PaperItem, StructRowStyle } from "./types";
import { BLOCK_PX_PER_PT } from "./types";
import { buildExplanationRows } from "./explanation-content";
import type { FlowBlock } from "./pagination-types";
// 줄당 문자 폭 보정 계수. 본문 글꼴을 맑은 고딕으로 통일한 뒤, 미리보기 추정 줄 수가
// 실제 브라우저 맑은 고딕 렌더보다 1줄씩 많게 나와(문항 높이 과대추정 → 1단이 일찍 차서
// 다음 칸으로 일찍 넘어감) 칸이 덜 채워졌다. 실측상 1.05 에서 추정 줄 수 == 브라우저
// 줄 수(맑은 고딕)로 일치한다(HWPX 빌더의 값과 동일). 0.99→1.05 로 올려 칸을 끝까지 채운다.
export const LINE_WIDTH_FUDGE = 1.05;

// 고아(orphan) 방지 최소 줄 수. 칸 경계에서 새 문항/지문이 시작할 때 최소 이만큼은
// 함께 둔다. 너무 크면(원래 8/4) 칸 하단 빈 공간이 이 값보다 작을 때 다음 문항이
// "통째로" 다음 칸/페이지로 넘어가 큰 여백이 남는다. 8→3 / 4→2 로 낮추면, 키 큰 문항
// (요약문·지문 박스 등)이 남은 공간에서 시작해 줄 단위로 쪼개지며 칸을 끝까지 채운다.
// (본문은 "(이어짐)" 마커로 분할되도록 설계돼 있어 시작 줄 수를 줄여도 잘리지 않는다.)
export const MIN_QUESTION_START_LINES = 3;

export const MIN_PASSAGE_START_LINES = 2;

export const BOXED_PASSAGE_HORIZONTAL_INSET = 28;

// 칸 하단 안전 여백. 모든 본문이 줄 단위로 쪼개지므로 추정 오차가 작아
// 여백을 줄여 내용이 footer 근처까지 채워지도록 한다(잘림은 줄 단위 분할로 방지).
// 인쇄(window.print)가 미리보기와 1:1 균일배율로 렌더되도록 print-styles.tsx 를
// 고친 뒤에는 미리보기가 곧 인쇄 결과(WYSIWYG)이므로, 과채움이 생기면 미리보기에서
// 바로 보인다 → 가드를 44→20 으로 낮춰 본문을 footer 끝선 가까이 더 내린다.
// (지문 위주 칸은 줄 단위 추정이 정확해 under-count 가 작다. 잘림은 미리보기에서
//  즉시 확인 가능하므로, 잘리면 이 값을 다시 올린다.)
export const PAGE_BOTTOM_GUARD = 20;

export const OPTION_BLOCK_TOP_GAP = 6;

export const OPTION_ROW_GAP = 4;

// 장문 세트(43~45) 멤버인지 — sourceQuestion.setId 존재 여부.
// paper-item-utils.isSetMemberItem 과 동일 판정(여기선 import 사이클·JSX 의존 회피용 로컬 복제).
export function isSetMemberItem(item: PaperItem): boolean {
  return item.blockType === "question" && Boolean(item.sourceQuestion.setId);
}

// 본문 글꼴 크기(미리보기 px). 페이지네이션은 모든 길이를 "미리보기 px" 단위로 계산하므로
// 밀도 기본값도 px(comfortable 11.5 / compact 10.5)로 둔다.
function densityFontPx(settings: PaginationSettings): number {
  return settings.density === "compact" ? 10.5 : 11.5;
}
function densityLineMult(settings: PaginationSettings): number {
  return settings.density === "compact" ? 1.46 : 1.58;
}
// 문항/블록별 글꼴 크기(미리보기 px)를 해석한다. blockFontPt(pt)가 지정되면 px 로 환산하고,
// 없으면 밀도 기본 px 를 쓴다. a4-paper-page 의 화면 렌더(컨테이너 fontSize)와 1:1 로 맞춰
// 미리보기·페이지분할·HWPX(같은 paginateGroups 재사용)가 같은 줄 수/높이를 갖게 한다.
export function resolveItemFontPx(
  item: { blockFontPt: number | null } | null | undefined,
  settings: PaginationSettings,
): number {
  const pt = item?.blockFontPt;
  return typeof pt === "number" && Number.isFinite(pt)
    ? pt * BLOCK_PX_PER_PT
    : densityFontPx(settings);
}

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

export function maxUnitsPerLine(columnWidth: number, fontSize: number): number {
  return Math.max(10, (columnWidth / fontSize) * LINE_WIDTH_FUDGE);
}

// 줄바꿈 폭은 "화면/출력에 보이는 글자" 기준이어야 한다. 보기 마커 원문(__(a) word__)은
// 화면에선 "① word"(밑줄)로 짧게 렌더되므로, 원문 그대로 폭을 세면 실제보다 넓게 잡혀
// 줄 수가 부풀려진다 → 문항 높이 과대추정 → 칸이 일찍 차서 다음 문항/분할이 위로 밀린다
// (1단이 일찍 끝나 보이는 원인). 단어 단위로 표시형으로 환산해 폭만 보정한다(빈칸 _____ 은
// 그대로). 마커는 단어 경계를 바꾸지 않으므로 줄 구성/단어 수에는 영향 없다.
function displayWordForWidth(word: string): string {
  if (/^_+$/.test(word)) return word;
  return word.replace(/^__\(([a-jA-J])\)\s*/, "①").replace(/__/g, "");
}

function wordWidthUnits(word: string): number {
  let units = 0;
  for (const ch of displayWordForWidth(word)) units += glyphUnits(ch);
  return units;
}

export function wrapParagraph(paragraph: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let currentLine = "";
  let currentUnits = 0;
  let i = 0;

  while (i < paragraph.length) {
    let nextSpace = paragraph.indexOf(" ", i);
    if (nextSpace === -1) nextSpace = paragraph.length;
    const word = paragraph.slice(i, nextSpace);
    const wordUnits = wordWidthUnits(word);
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

export function textToLines(text: string, columnWidth: number, fontSize: number): string[] {
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

export function passageContentWidth(settings: PaginationSettings): number {
  const { columnWidth } = pageMetrics(settings, 0);
  if (settings.passageStyle !== "boxed") return columnWidth;
  return Math.max(80, columnWidth - BOXED_PASSAGE_HORIZONTAL_INSET);
}

// 지문이 칸 경계에서 쪼개질 때 "(다음 칸으로 이어짐 →)" 마커 자리만큼 미리 비워둔다.
// 마커는 화면 전용(no-print)이라 인쇄엔 안 나오므로 보수적으로 크게 잡을 필요가 없다.
// 값을 줄이면(18→10 / 16→9) 분할 지문이 칸 하단까지 더 채워진다.
export function passageContinuationReserveHeight(settings: PaginationSettings): number {
  return settings.density === "compact" ? 9 : 10;
}

export function questionLineHeight(
  settings: PaginationSettings,
  fontPx?: number,
): number {
  const fontSize = fontPx ?? densityFontPx(settings);
  return fontSize * densityLineMult(settings);
}

export function questionMetaHeight(settings: PaginationSettings): number {
  return settings.showQuestionMeta ? 18 : 16;
}

// --- 구조화 본문(지문 박스/요약 박스/순서 단락 등) 높이 추정 ------------------
// a4-paper-page.tsx 의 실제 렌더 박스 치수(px-2.5 py-2 border, space-y-2, ↓)를
// 모델링한다. 살짝 보수적으로 잡아 칸 경계에서 잘리지 않도록 한다.
export const STRUCT_BOX_CHROME = 18; // 박스(지문/요약/given) 1개당 상하 테두리+패딩
export const STRUCT_PASSAGE_TITLE_HEIGHT = 15;

export const BOX_TEXT_INSET = 24; // px-2.5(20) + border(2) + 여유
export const STRUCTURE_GAP = 8; // space-y-2
export const HEADER_BODY_GAP = 8; // 헤더(지시문)과 본문 사이 간격
export const ARROW_BLOCK_HEIGHT = 16; // ↓ 라인
export const GIVEN_BOX_CHROME = 32; // SENTENCE_INSERT 주어진 문장 박스: 테두리+패딩+'주어진 문장' 라벨 줄
// 문항 1개당 추정에 잡히지 않는 렌더 여백 합(part py-0.5 + 헤더 mb-1 + 본문 mt-1 등).
// 여러 문항이 한 칸에 쌓일 때 누적 오차로 칸 경계를 넘지 않도록 보정한다.
export const ITEM_RENDER_OVERHEAD = 12;

export function boxLineHeight(settings: PaginationSettings, fontPx?: number): number {
  const fontSize = fontPx ?? densityFontPx(settings);
  // 박스 본문 줄높이를 평문(questionLineHeight)과 통일 — a4 StructuredBody leading 과 1:1.
  return fontSize * densityLineMult(settings);
}

export function structuredBoxChrome(style: Extract<StructRowStyle, "passage" | "summary" | "given">, settings: PaginationSettings): number {
  if (style !== "passage") return STRUCT_BOX_CHROME;
  return settings.passageStyle === "plain" ? 8 : STRUCT_BOX_CHROME;
}

export function structuredPassageTitleHeight(
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

export function structuredBoxTextWidth(
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
  settings: PaginationSettings,
): number {
  const { columnWidth } = pageMetrics(settings, 0);
  if (style !== "passage") return Math.max(80, columnWidth - BOX_TEXT_INSET);
  return settings.passageStyle === "boxed"
    ? Math.max(80, columnWidth - BOX_TEXT_INSET)
    : columnWidth;
}

export function structuredBoxTextHeight(
  text: string,
  settings: PaginationSettings,
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
  fontPx?: number,
): number {
  if (!text.trim()) return 0;
  const fontSize = fontPx ?? densityFontPx(settings);
  const lines = estimateTextLines(text, structuredBoxTextWidth(style, settings), fontSize);
  return structuredBoxChrome(style, settings) + lines * boxLineHeight(settings, fontPx);
}

export function questionBodyAfterStem(item: PaperItem): string {
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
  const fontPx = resolveItemFontPx(item, settings);

  if (isSummaryCompleteSubtype(subType)) {
    const passage = summaryCompleteMcPassageForItem(item);
    const { summary: rawSummary } = splitSummaryCompleteMcQuestionText(item.questionText);
    const summary = summaryCompleteMcSummaryForItem(item, rawSummary);
    const blocks: number[] = [];
    if (passage) {
      blocks.push(
        structuredBoxTextHeight(passage, settings, "passage", fontPx) +
          structuredPassageTitleHeight(item, settings, "passage"),
      );
    }
    if (isSummaryCompleteMc(subType)) blocks.push(ARROW_BLOCK_HEIGHT);
    if (summary) blocks.push(structuredBoxTextHeight(summary, settings, "summary", fontPx));
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
      height +=
        estimateTextLines(bodyAfterStem, columnWidth, fontPx) * questionLineHeight(settings, fontPx) +
        STRUCTURE_GAP;
    }
    if (passage) {
      height +=
        structuredBoxTextHeight(passage, settings, "passage", fontPx) +
        structuredPassageTitleHeight(item, settings, "passage");
    }
    return height;
  }

  // SENTENCE_ORDER: [given] 박스 + (A)(B)(C) 단락(비박스) + 기타.
  const bodyText = questionBodyAfterStem(item);
  const { columnWidth } = pageMetrics(settings, 0);
  let height =
    HEADER_BODY_GAP + estimateTextLines(bodyText, columnWidth, fontPx) * questionLineHeight(settings, fontPx);
  if (/\[(?:주어진\s*문장|given)\]/i.test(bodyText)) {
    height += GIVEN_BOX_CHROME;
  }
  return height;
}

// 구조화 본문을 줄 단위 flow 블록으로 분해한다(박스/단락이 칸 경계에서 쪼개지도록).
export function boxTextToLines(
  text: string,
  settings: PaginationSettings,
  style: Extract<StructRowStyle, "passage" | "summary" | "given">,
  fontPx?: number,
): string[] {
  const fontSize = fontPx ?? densityFontPx(settings);
  const lines = textToLines(text, structuredBoxTextWidth(style, settings), fontSize);
  return lines.length > 0 ? lines : [""];
}

export function columnTextToLines(
  text: string,
  settings: PaginationSettings,
  fontPx?: number,
): string[] {
  const lines = questionToLines(text, settings, fontPx);
  return lines.length > 0 ? lines : [""];
}

export function buildStructLineBlocks(
  item: PaperItem,
  group: PaperGroup,
  settings: PaginationSettings,
): FlowBlock[] {
  const fontPx = resolveItemFontPx(item, settings);
  const boxLineH = boxLineHeight(settings, fontPx);
  const textLineH = questionLineHeight(settings, fontPx);
  const blocks: FlowBlock[] = [];

  // 장문 세트 멤버도 자기완결(self-contained)로 렌더한다 — 각 멤버의 마킹 지문은
  // makePaperItem 의 materializeSetMember 가 본문/passageContent 에 복원해 주입하므로,
  // 여기서는 일반 문항과 동일하게 모든 구조 세그먼트를 그대로 흘려보낸다.
  const segments = structuredSegments(item);

  segments.forEach((seg, segIndex) => {
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
      lines = boxTextToLines(seg.text, settings, style, fontPx);
      lineHeight = boxLineH;
      segChrome = STRUCTURE_GAP + structuredBoxChrome(style, settings);
    } else if (seg.kind === "para") {
      lines = columnTextToLines(seg.text, settings, fontPx);
      style = "para";
      lineHeight = textLineH;
      segChrome = STRUCTURE_GAP;
      paraLabel = seg.label;
    } else {
      lines = columnTextToLines(seg.text, settings, fontPx);
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

export function questionToLines(
  content: string,
  settings: PaginationSettings,
  fontPx?: number,
): string[] {
  if (!content) return [];
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = fontPx ?? densityFontPx(settings);
  return textToLines(normalizeQuestionText(content), columnWidth, fontSize);
}

// 지문이 문항 본문에 내장된 유형(무관한 문장·문장 삽입·어법 등)인지.
// a4-paper-page.tsx 가 이 유형의 본문에 "지문 스타일" 박스/밑줄을 그리므로,
// 줄넘김 폭과 박스 테두리 높이를 페이지네이션에도 동일하게 반영해야 한다.
export function hasEmbeddedPassageBody(item: PaperItem): boolean {
  return (
    item.blockType === "question" &&
    !isStructuredAtomicSubtype(item.sourceQuestion.subType) &&
    questionHasEmbeddedPassage(item.sourceQuestion)
  );
}

// 내장 지문 본문의 줄넘김 폭: 박스 스타일이면 좌우 패딩만큼 좁아진다
// (a4-paper-page.tsx 의 px-3 ≈ BOXED_PASSAGE_HORIZONTAL_INSET).
export function questionBodyToLines(
  content: string,
  settings: PaginationSettings,
  item: PaperItem,
): string[] {
  if (!content) return [];
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = resolveItemFontPx(item, settings);
  const width =
    settings.passageStyle === "boxed" && hasEmbeddedPassageBody(item)
      ? Math.max(80, columnWidth - BOXED_PASSAGE_HORIZONTAL_INSET)
      : columnWidth;
  return textToLines(normalizeQuestionText(content), width, fontSize);
}

// 내장 지문 본문 박스의 상하 테두리+패딩 높이(평문=0).
export function embeddedPassageBodyChrome(item: PaperItem, settings: PaginationSettings): number {
  if (!hasEmbeddedPassageBody(item)) return 0;
  return settings.passageStyle === "boxed"
    ? 24
    : settings.passageStyle === "underlined"
      ? 18
      : 0;
}

export function embeddedPassageTitleHeight(item: PaperItem, settings: PaginationSettings): number {
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
export function estimateStemHeight(item: PaperItem, settings: PaginationSettings): number {
  const { stem } = questionStemAndBody(item);
  const fontPx = resolveItemFontPx(item, settings);
  const stemRendered = formatInlineMarkersForSubtype(stem, item.sourceQuestion.subType);
  const stemLines = questionToLines(stemRendered, settings, fontPx);
  return (
    questionMetaHeight(settings) +
    Math.max(1, stemLines.length) * questionLineHeight(settings, fontPx)
  );
}

export function estimateHeaderBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const subType = item.sourceQuestion.subType;
  const fontPx = resolveItemFontPx(item, settings);
  let height = estimateStemHeight(item, settings) + ITEM_RENDER_OVERHEAD;
  if (isFlowStructuredSubtype(subType)) {
    height += estimateStructuredBodyHeight(item, settings);
  } else {
    const { body } = questionStemAndBody(item);
    const bodyRendered = formatInlineMarkersForSubtype(body, subType);
    height +=
      questionBodyToLines(bodyRendered, settings, item).length * questionLineHeight(settings, fontPx);
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
  fontPx?: number,
): number {
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const displayText = optionDisplayTextForSubtype(subType, optionIndex, option.text);
  // 선택지는 화면에서 문항 컨테이너 글꼴을 상속한다. 문항 pt 가 지정되면 선택지 줄 폭·
  // 줄높이도 같은 크기로 스케일해 미리보기와 분할이 어긋나지 않게 한다(미지정 시 기존 10/11).
  const optionFontPx = fontPx ?? (compact ? 10 : 11);
  const optionLines = estimateTextLines(displayText, Math.max(80, columnWidth - 22), optionFontPx);
  return Math.max(16, optionLines * optionFontPx * 1.45);
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

// 인라인 정답·해설 블록(해설 포함 PDF) 높이 추정 — exam-explanation-block.tsx 의 실제
// 렌더(글꼴/패딩/들여쓰기)를 모델링한다. 약간 보수적으로 잡아 칸 경계에서 잘리지 않게 한다.
export function estimateExplanationBlockHeight(item: PaperItem, settings: PaginationSettings): number {
  const rows = buildExplanationRows(item);
  const compact = settings.density === "compact";
  const { columnWidth } = pageMetrics(settings, 0);
  const fontSize = compact ? 9.5 : 10;
  const lineH = fontSize * 1.5;

  let height = 10; // 문제와 구분되는 상단 여백
  for (const row of rows) {
    if (row.type === "answer") {
      // 정답 배지(테두리 박스): 한 줄 + 박스 패딩/테두리
      height += lineH + 14;
    } else if (row.type === "label") {
      height += lineH + 6;
    } else if (row.type === "text") {
      height += estimateTextLines(row.text, columnWidth - 8, fontSize) * lineH + 2;
    } else if (row.type === "bullet") {
      height += estimateTextLines(`• ${row.text}`, columnWidth - 16, fontSize) * lineH + 2;
    } else {
      height += estimateTextLines(`${row.label} ${row.text}`, columnWidth - 16, fontSize) * lineH + 2;
    }
  }
  return Math.ceil(height);
}
