import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  LineRuleType,
  PageNumber,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from "docx";
import { bdr, noBorders, NONE, thinBox } from "./borders";
import { COLOR, FONT, KR_FONT, bodyFontForTemplate } from "./styles";
import { parseFormattedText } from "./parse-formatted-text";
import { buildAnswerKeyTable } from "./build-answer-key";
import { safeParseJSON } from "./helpers";
import {
  formatInlineMarkersForSubtype,
  formatSentenceInsertPassageMarkers,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
  splitSentenceInsertGivenBlock,
} from "@/components/exams/paper-builder/option-display";
import {
  questionHasEmbeddedPassage,
  shouldForceSourcePassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { LINE_GAP_MARKER } from "@/components/exams/paper-builder/types";
import { normalizeQuestionText } from "@/components/exams/paper-builder/text-normalization";
import { sentenceOrderSegmentsFromQuestionText } from "@/components/exams/paper-builder/question-body-layout";
import {
  isSummaryCompleteMc,
  isSummaryCompleteSubtype,
  splitSummaryCompleteMcQuestionText,
} from "@/components/exams/paper-builder/summary-complete-mc-layout";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import { isSummaryWriting } from "@/lib/summary-writing";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { DEFAULT_IMAGE_ASPECT, imageDimsFromDataUrl } from "@/lib/image-dims";
import type { DocChild, ExamQuestionData, ParsedOption } from "./types";

// 템플릿(세리프/산세리프)에 따라 본문 글꼴이 달라진다. buildBuilderExamDocument 시작 시
// settings.template 로 1회 설정하고(동기 빌드라 레이스 없음) 모든 텍스트 런에서 사용한다.
let bodyFont: string = KR_FONT;

/*
 * 빌더 미리보기(A4PaperPage)와 1:1로 매칭되는 시험지 DOCX 빌더.
 * - 1페이지 상단: 로고 + (소제목/큰제목) | (학교/반/이름) 박스
 * - 그 아래: 안내문(왼쪽) | 날짜(오른쪽)
 * - 본문: 1단/2단 + 지문(boxed/underlined/plain) + 문항번호[점·유형] + 옵션 + 답란
 * - 푸터: - N / M -
 * - 2페이지 이후 상단 미니헤더: 제목 - N / M
 */

const SUBTYPE_LABELS_DOCX: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  GRAMMAR_CHOICE_COMBO: "네모 어법",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC: "주제 추론",
  MAIN_IDEA: "요지/주장",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  IMPLIED_MEANING: "함축 의미 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  SUMMARY_COMPLETE_MC: "요약문 완성(객관식)",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  SUMMARY_WRITING: "요약문 영작",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
  CUSTOM: "커스텀",
  CUSTOM_LAYOUT: "커스텀",
};

// 미리보기 px 기준값 → docx half-point.
// 미리보기 text-[11.5px] ≈ 본문 10pt, [10.5px] ≈ 9.5pt
const SIZE_TITLE = 44;        // 22pt (미리보기 h2 28px → 28×0.78325=21.9pt)
const SIZE_TITLE_COMPACT = 34; // 17pt (compact 22px)
const SIZE_SUBTITLE = 14;     // 7pt (subtitle 9px)
const SIZE_INFO = 16;         // 8pt (학교/반/이름)
const SIZE_INSTRUCTIONS = 16; // 8pt
// 미리보기 a4-paper-page 의 px 폰트를 가상 A4(760px=210mm) 스케일로 물리 pt 환산:
//   pt = px × (210/760) / (25.4/72) = px × 0.78325,  half-pt = px × 1.5665.
// 번호 13px→20, compact 12px→19 / 본문·지시문·선지 11.5px→18, compact 10.5px→16.
const SIZE_QNUM = 20;         // 10pt (미리보기 번호 13px)
const SIZE_QNUM_COMPACT = 19; // 9.5pt (compact 12px)
const SIZE_META = 14;         // 7pt (미리보기 메타 9px)
const SIZE_BODY = 18;         // 9pt (미리보기 본문 11.5px)
const SIZE_BODY_COMPACT = 16; // 8pt (compact 10.5px)
const SIZE_OPTION = 17;       // 8.5pt (미리보기 선지 text-[11px] → 11×0.78325=8.6pt)
const SIZE_OPTION_COMPACT = 16; // 8pt (compact text-[10px])
const SIZE_PASSAGE_TITLE = 14; // 7pt
const SIZE_CONTINUED = 16;    // 8pt
const SIZE_FOOTER = 16;       // 8pt
const SIZE_ANSWER_LABEL = 16; // 8pt
const SIZE_ANSWER_VALUE = 22; // 11pt
const SIZE_EXPLAIN_LABEL = 16; // 8pt
const SIZE_EXPLAIN_BODY = 18; // 9pt

// 미리보기 본문 행간(leading)과 1:1 로 맞춘다. a4-paper-page:
//   comfortable leading-[1.58], compact leading-[1.46].
const BODY_LINE_HEIGHT = 1.58;
const BODY_LINE_HEIGHT_COMPACT = 1.46;
// CSS line-height(고정 행간)를 그대로 재현하려면 EXACT 행간을 써야 한다.
// (AUTO/multiple 은 글꼴 고유 leading 이 더해져 더 벌어진다.)
// line(트윕) = pt × lineHeight × 20,  pt = halfPt / 2.
function exactLineSpacing(halfPt: number, lineHeight: number) {
  return { line: Math.round((halfPt / 2) * lineHeight * 20), lineRule: LineRuleType.EXACT };
}

function mmToDxa(value: number) {
  return Math.round((value / 25.4) * 1440);
}

const DOCX_PAPER_SIZES = {
  A4: { width: mmToDxa(210), height: mmToDxa(297) },
  B4: { width: mmToDxa(257), height: mmToDxa(364) },
} as const;

export interface BuilderHeader {
  subtitle?: string;
  schoolName?: string;
  className?: string;
  studentNameLabel?: string;
  instructions?: string;
  academyLogoDataUrl?: string | null;
}

export interface BuilderLayout {
  paperSize?: "A4" | "B4";
  columns?: 1 | 2;
  density?: "comfortable" | "compact";
  showAnswerSpace?: boolean;
  showPassageTitle?: boolean;
  showQuestionMeta?: boolean;
  passageStyle?: "boxed" | "underlined" | "plain";
  pageNumberStyle?: "center" | "outside" | "none";
}

export interface BuilderItem {
  localId?: string;
  blockType?: "question";
  questionId: string;
  orderNum?: number;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: Array<{ label: string; text: string }>;
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
}

export type BuilderBlockType = "question" | "text" | "section" | "divider" | "spacer" | "image";

export interface BuilderBlock extends Omit<Partial<BuilderItem>, "blockType"> {
  localId: string;
  blockType: BuilderBlockType;
  breakBefore?: "auto" | "column" | "page";
  keepWithPrev?: boolean;
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: "left" | "center" | "right";
  blockFontSize?: "sm" | "md" | "lg";
  blockBold?: boolean;
  blockItalic?: boolean;
  blockFontPt?: number | null;
  blockAccentColor?: string;
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
}

export interface BuilderSettings {
  source: string;
  version?: number;
  template?: string;
  layout?: BuilderLayout;
  header?: BuilderHeader;
  items: BuilderItem[];
  blocks?: BuilderBlock[];
}

interface BuilderItemResolved extends BuilderItem {
  // 문항 단위 서식(블록 서식 툴바) — 미리보기와 동일하게 다운로드에도 반영.
  blockFontPt?: number | null;
  blockBold?: boolean;
  blockItalic?: boolean;
  blockAlign?: "left" | "center" | "right";
  sourceQuestion: ExamQuestionData["question"];
}

function normalizePrintableTitle(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizePrintableTitle(item.passageTitle);
  const sourceTitle = normalizePrintableTitle(item.sourceQuestion.passage?.title);
  return savedTitle || sourceTitle;
}

function firstQuestionLineForHeader(questionText: string, subType: string | null | undefined): string {
  const { beforeText } = splitSentenceInsertGivenBlock(questionText, subType);
  const sourceText = beforeText || questionText;
  return sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function dataUrlToImage(dataUrl: string | null | undefined):
  | { buffer: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number }
  | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const buf = Buffer.from(match[2], "base64");
  const type: "png" | "jpg" | "gif" | "bmp" =
    mime === "png" ? "png" : mime === "gif" ? "gif" : mime === "bmp" ? "bmp" : "jpg";
  // 실제 자연 크기를 헤더에서 읽어 종횡비를 정확히 한다(미상이면 정사각 폴백).
  const dims = imageDimsFromDataUrl(dataUrl);
  return { buffer: buf, type, width: dims?.width ?? 64, height: dims?.height ?? 64 };
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

// =============================================================================
// 페이지 헤더 (1페이지 상단)
// =============================================================================

function buildPage1Header(
  header: BuilderHeader,
  title: string,
  compact: boolean,
): DocChild[] {
  const subtitle = header.subtitle?.trim() || "";
  const studentNameLabel = header.studentNameLabel?.trim() || "이름";
  const schoolName = header.schoolName?.trim() || "";
  const className = header.className?.trim() || "";
  const instructions = header.instructions?.trim() || "";
  const logoImg = dataUrlToImage(header.academyLogoDataUrl ?? null);

  const titleSize = compact ? SIZE_TITLE_COMPACT : SIZE_TITLE;

  // 왼쪽: [로고] + [소제목 / 큰제목]
  const leftCellChildren: Paragraph[] = [];
  if (subtitle) {
    leftCellChildren.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: subtitle.toUpperCase(),
            font: bodyFont,
            size: SIZE_SUBTITLE,
            bold: true,
            color: COLOR.gray,
            characterSpacing: 25, // 미리보기 tracking-[0.18em] @9px ≈ 1.27pt
          }),
        ],
      }),
    );
  }
  leftCellChildren.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: title,
          font: bodyFont,
          size: titleSize,
          bold: true,
          color: COLOR.black,
        }),
      ],
    }),
  );

  // 로고가 있으면 별도 셀로 분리하여 왼쪽 정렬
  const leftCells: TableCell[] = [];
  if (logoImg) {
    leftCells.push(
      new TableCell({
        borders: noBorders(),
        verticalAlign: VerticalAlign.TOP,
        width: { size: 740, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 160 },
        children: [
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new ImageRun({
                data: logoImg.buffer,
                transformation: { width: 44, height: 44 },
                type: logoImg.type,
              }),
            ],
          }),
        ],
      }),
    );
  }
  leftCells.push(
    new TableCell({
      borders: noBorders(),
      verticalAlign: VerticalAlign.TOP,
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: leftCellChildren,
    }),
  );

  const leftTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: NONE, bottom: NONE, left: NONE, right: NONE,
      insideHorizontal: NONE, insideVertical: NONE,
    },
    rows: [new TableRow({ children: leftCells })],
  });

  // 오른쪽: 학교 / 반 / 이름 (각 줄에 하단 보더, 라벨 / 값)
  const rightCellChildren = buildInfoBlock({
    studentNameLabel,
    schoolName,
    className,
  });

  // 상단 박스: 좌측(소제목+제목) | 우측(학교/반/이름) — 가장 아래에 두꺼운 보더
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [6800, 2900],
    borders: {
      top: NONE, left: NONE, right: NONE,
      insideHorizontal: NONE, insideVertical: NONE,
      bottom: bdr(BorderStyle.SINGLE, 12, COLOR.black),
    },
    rows: [
      new TableRow({
        children: [
          // 상단 여백 축소(5차): 미리보기 헤더가 items-start(TOP) 이므로 BOTTOM→TOP 으로
          // 바꿔 제목/학생정보가 위로 붙게 한다. 하단 셀 마진도 140→60 으로 축소.
          new TableCell({
            borders: { top: NONE, left: NONE, right: NONE, bottom: NONE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 60, left: 0, right: 120 },
            width: { size: 6800, type: WidthType.DXA },
            children: [leftTable],
          }),
          new TableCell({
            borders: { top: NONE, left: NONE, right: NONE, bottom: NONE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 60, left: 120, right: 0 },
            width: { size: 2900, type: WidthType.DXA },
            children: rightCellChildren,
          }),
        ],
      }),
    ],
  });

  const result: DocChild[] = [headerTable];

  // 안내문 + 날짜 줄
  if (instructions) {
    result.push(
      new Paragraph({
        spacing: { before: 60, after: 120 },
        children: [
          new TextRun({
            text: instructions,
            font: bodyFont,
            size: SIZE_INSTRUCTIONS,
            color: COLOR.gray,
          }),
        ],
      }),
    );
  } else {
    result.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  }

  return result;
}

function buildInfoBlock(opts: {
  studentNameLabel: string;
  schoolName: string;
  className: string;
}): DocChild[] {
  const { studentNameLabel, schoolName, className } = opts;

  const rowsData: Array<{ label: string; value: string }> = [
    { label: "학교", value: schoolName },
    { label: "반", value: className },
    { label: studentNameLabel || "이름", value: "" },
  ];

  const rows = rowsData.map(
    (row) =>
      new TableRow({
        height: { value: 220, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            borders: {
              top: NONE, left: NONE, right: NONE,
              bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            },
            width: { size: 30, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 10, bottom: 30, left: 0, right: 80 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: row.label,
                    font: bodyFont,
                    size: SIZE_INFO,
                    color: COLOR.darkGray,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: {
              top: NONE, left: NONE, right: NONE,
              bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            },
            width: { size: 70, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 10, bottom: 30, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: row.value || " ",
                    font: bodyFont,
                    size: SIZE_INFO,
                    bold: Boolean(row.value),
                    color: COLOR.black,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
  );

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: NONE, bottom: NONE, left: NONE, right: NONE,
        insideHorizontal: NONE, insideVertical: NONE,
      },
      rows,
    }),
  ];
}

// =============================================================================
// 지문
// =============================================================================

function buildPassage(opts: {
  passageTitle: string;
  passageContent: string;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  compact: boolean;
  usesSentenceInsertMarkers: boolean;
}): DocChild[] {
  const {
    passageTitle,
    passageContent,
    passageStyle,
    showPassageTitle,
    compact,
    usesSentenceInsertMarkers,
  } = opts;
  if (!passageContent.trim()) return [];

  const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;

  const titlePara: Paragraph | null =
    showPassageTitle && passageTitle.trim()
      ? new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: passageTitle.toUpperCase(),
              font: bodyFont,
              size: SIZE_PASSAGE_TITLE,
              bold: true,
              color: COLOR.darkGray,
              characterSpacing: 20,
            }),
          ],
        })
      : null;

  const renderedPassageContent = formatSentenceInsertPassageMarkers(
    passageContent,
    usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
  );
  const lines = renderedPassageContent.split("\n");
  const bodyParas = lines.map((line, idx) => {
    const trimmed = line.trim();
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: {
        after: idx < lines.length - 1 ? 40 : 0,
        ...exactLineSpacing(bodySize, lh),
      },
      children:
        trimmed.length === 0
          ? [new TextRun({ text: " ", font: FONT, size: bodySize })]
          : parseFormattedText(trimmed, { font: FONT, size: bodySize }),
    });
  });

  const innerChildren: Paragraph[] = [];
  if (titlePara) innerChildren.push(titlePara);
  innerChildren.push(...bodyParas);

  void passageStyle;
  return [...innerChildren, new Paragraph({ spacing: { after: 120 } })];
}

function buildPassageTitleParagraph(
  passageTitle: string,
  showPassageTitle: boolean,
): Paragraph | null {
  if (!showPassageTitle || !passageTitle.trim()) return null;
  return new Paragraph({
    spacing: { before: 20, after: 30 },
    children: [
      new TextRun({
        text: passageTitle.toUpperCase(),
        font: KR_FONT,
        size: SIZE_PASSAGE_TITLE,
        bold: true,
        color: COLOR.darkGray,
        characterSpacing: 20,
      }),
    ],
  });
}

// 주어진 문장 블록([주어진 문장]/[given]) 추출 — 문장삽입/순서 공용.
function extractGivenBlock(text: string, subType: string): { given: string; rest: string } {
  if (subType !== "SENTENCE_INSERT" && subType !== "SENTENCE_ORDER") {
    return { given: "", rest: text };
  }
  const re = /(?:^|\n)[ \t]*\[(?:주어진\s*문장|given)\][ \t]*([\s\S]*?)(?=\n\n|$)/i;
  const m = re.exec(text);
  if (!m || m.index === undefined) return { given: "", rest: text };
  const given = (m[1] ?? "").trim();
  const rest = `${text.slice(0, m.index)}\n${text.slice(m.index + m[0].length)}`
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
  return { given, rest };
}

function stripOriginalBlock(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block && !/^\[(?:original|\uC6D0\uBB38)\]\s*/i.test(block))
    .join("\n\n")
    .trim();
}

function shouldPlaceInlinePassageBeforeBody(subType: string): boolean {
  return (
    subType === "CONDITIONAL_WRITING" ||
    subType === "WORD_ORDER" ||
    subType === "SENTENCE_TRANSFORM"
  );
}

function buildGivenBox(text: string, bodySize: number, lh: number): DocChild[] {
  return [
    new Paragraph({
      spacing: { before: 40, after: 30 },
      children: [
        new TextRun({
          text: "주어진 문장",
          font: bodyFont,
          size: SIZE_META,
          bold: true,
          color: COLOR.gray,
          characterSpacing: 10,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 80, ...exactLineSpacing(bodySize, lh) },
      // 본문(주어진 문장 내용)은 일반체 — 라벨("주어진 문장")만 굵게(미리보기와 동일).
      children: parseFormattedText(text, { font: bodyFont, size: bodySize, bold: false }),
    }),
  ];
}

// =============================================================================
// 요약문 영작 (SUMMARY_WRITING) — questionText 블록 파싱
// =============================================================================
// 직렬화 형태(SW-LEAK-1, summaryWritingStudentParts):
//   {direction}\n\n[해석] ...\n\n[빈칸 해석] (A) ...\n\n[요약문] (A) _____ , ...\n\n[보기] w1 / w2\n\n[앞글자] (A) p s d
// 정답계열([빈칸 정답]/modelAnswer 등)은 직렬화에 미포함이므로 여기서 절대 등장하지 않는다.

interface SummaryWritingDocBlocks {
  gloss: string;        // [해석] (회색 slate)
  blankGloss: string;   // [빈칸 해석] (회색 slate)
  summary: string;      // [요약문] ((A)(B) 마커 + 빈칸선)
  wordBank: string;     // [보기] (칩/인라인)
  firstLetters: string; // [앞글자] (작은 회색)
}

function parseSummaryWritingBlocks(questionText: string): SummaryWritingDocBlocks {
  const blocks = questionText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const result: SummaryWritingDocBlocks = {
    gloss: "",
    blankGloss: "",
    summary: "",
    wordBank: "",
    firstLetters: "",
  };
  const take = (block: string, marker: string) =>
    block.slice(marker.length).replace(/^\s*/, "").trim();
  for (const block of blocks) {
    if (block.startsWith("[해석]")) result.gloss = take(block, "[해석]");
    else if (block.startsWith("[빈칸 해석]")) result.blankGloss = take(block, "[빈칸 해석]");
    else if (block.startsWith("[요약문]")) result.summary = take(block, "[요약문]");
    else if (block.startsWith("[보기]")) result.wordBank = take(block, "[보기]");
    else if (block.startsWith("[앞글자]")) result.firstLetters = take(block, "[앞글자]");
  }
  return result;
}

// =============================================================================
// 문항 (번호 + 메타 + 본문 + 옵션 + 답란)
// =============================================================================

function buildQuestionBlock(
  item: BuilderItemResolved,
  layout: BuilderLayout,
  includeAnswers: boolean,
): DocChild[] {
  const result: DocChild[] = [];
  const compact = layout.density === "compact";
  const showMeta = layout.showQuestionMeta === true;
  const showAnswerSpace = layout.showAnswerSpace !== false && !includeAnswers;

  const orderNum = item.orderNum ?? 0;
  const points = item.points ?? 1;
  const subType = item.sourceQuestion.subType || "";
  const subTypeLabel = subType ? SUBTYPE_LABELS_DOCX[subType] || subType : "";
  const questionText = normalizeQuestionText(
    formatInlineMarkersForSubtype(
      item.questionText ?? item.sourceQuestion.questionText ?? "",
      subType,
    ),
  ).trim();
  const parsedOptions = (item.options ?? safeParseOptions(item.sourceQuestion.options)).filter(
    (o) => o && (o.text || "").length >= 0,
  );
  const options = shouldRenderOptionListForSubtype(subType) ? parsedOptions : [];

  // 문항 단위 글자 크기(pt)·굵게·기울임 — 미리보기 컨테이너 글꼴 상속과 동일하게,
  // 본문/번호/선지 크기를 같은 비율로 확대·축소한다(DOCX size 는 half-point = pt*2).
  const baseBodyHalf = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const fontScale =
    typeof item.blockFontPt === "number" && item.blockFontPt > 0
      ? (item.blockFontPt * 2) / baseBodyHalf
      : 1;
  const qNumSize = Math.round((compact ? SIZE_QNUM_COMPACT : SIZE_QNUM) * fontScale);
  const bodySize = Math.round(baseBodyHalf * fontScale);
  const optionSize = Math.round((compact ? SIZE_OPTION_COMPACT : SIZE_OPTION) * fontScale);
  const qBold = item.blockBold ?? false;
  const qItalic = item.blockItalic ?? false;
  const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const summaryComplete = isSummaryCompleteSubtype(subType);
  const summaryMc = isSummaryCompleteMc(subType);
  const summaryWriting = isSummaryWriting(subType);
  const showPassageTitle = layout.showPassageTitle === true;
  const passageTitle = printablePassageTitle(item);
  const passageContent = (item.passageContent ?? item.sourceQuestion.passage?.content ?? "").trim();
  const hasEmbeddedSourcePassage = questionHasEmbeddedPassage({
    ...item.sourceQuestion,
    questionText,
    passage: { content: passageContent },
  });
  const inlineSourcePassage =
    shouldRenderSourcePassageInsideQuestion(subType) && !summaryMc && !hasEmbeddedSourcePassage;
  const inlinePassageContent = passageContent
    ? formatSourcePassageForQuestionItems(passageContent, [item]).trim()
    : "";
  const summaryPartsForHeader = summaryComplete
    ? splitSummaryCompleteMcQuestionText(questionText)
    : null;
  const genericHeaderQuestionText = !summaryPartsForHeader
    ? firstQuestionLineForHeader(questionText, subType)
    : "";
  const headerQuestionText =
    summaryPartsForHeader?.stem || genericHeaderQuestionText;
  const embeddedPassageTitle =
    hasEmbeddedSourcePassage && !summaryWriting
      ? buildPassageTitleParagraph(passageTitle, showPassageTitle)
      : null;
  if (embeddedPassageTitle) result.push(embeddedPassageTitle);

  // 번호 + 메타 + 본문 한 단락 (번호 굵게, 메타 작게, 본문은 새 줄에서 시작)
  const headerRuns: TextRun[] = [
    new TextRun({
      text: `${orderNum}. `,
      font: bodyFont,
      size: qNumSize,
      bold: true,
      color: COLOR.black,
    }),
  ];
  if (showMeta) {
    const metaText = subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`;
    headerRuns.push(
      new TextRun({
        text: metaText,
        font: bodyFont,
        size: SIZE_META,
        color: COLOR.gray,
      }),
    );
  }

  // 첫 단락에 번호 + 메타. 그 다음 단락에 본문(있는 경우).
  if (headerQuestionText) {
    headerRuns.push(
      ...parseFormattedText(headerQuestionText, {
        font: bodyFont,
        size: bodySize,
        bold: true,
        italics: qItalic,
      }),
    );
  }

  result.push(
    new Paragraph({
      spacing: { before: 80, after: questionText ? 40 : 80 },
      children: headerRuns,
      keepNext: true,
    }),
  );

  if (questionText) {
    if (summaryWriting) {
      // 요약문 영작: 헤더(번호+배점+발문) 아래에
      //   [지문](테두리 박스) → [해석](회색) → [요약문]((A)(B)+빈칸선) → [보기](인라인) → [앞글자]
      // 지문은 "무조건" 함께 렌더한다(사용자 요구·레퍼런스 형식, SUMMARY_COMPLETE 미러).
      // 정답계열([빈칸 정답]/modelAnswer 등)은 직렬화에 없으므로 절대 렌더되지 않는다(SW-LEAK-1).
      const sw = parseSummaryWritingBlocks(questionText);

      if (passageContent) {
        result.push(
          ...buildPassage({
            passageTitle,
            passageContent: inlinePassageContent || passageContent,
            passageStyle: "plain",
            showPassageTitle,
            compact,
            usesSentenceInsertMarkers: false,
          }),
        );
      }

      if (sw.gloss) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[해석] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
                color: COLOR.gray,
              }),
              ...parseFormattedText(sw.gloss, {
                font: bodyFont,
                size: bodySize,
                color: COLOR.gray,
              }),
            ],
          }),
        );
      }

      if (sw.summary) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[요약문] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              // (A)(B) 마커는 파랑, _____ 빈칸선·본문은 영문 폰트로(parseFormattedText)
              ...parseFormattedText(sw.summary, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      }

      if (sw.wordBank) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 70, ...exactLineSpacing(bodySize, lh) },
            children: [
              new TextRun({
                text: "[보기] ",
                font: bodyFont,
                size: bodySize,
                bold: true,
              }),
              ...parseFormattedText(sw.wordBank, {
                font: FONT,
                size: bodySize,
              }),
            ],
          }),
        );
      }

      if (sw.firstLetters) {
        result.push(
          new Paragraph({
            spacing: { before: 0, after: 70, ...exactLineSpacing(SIZE_META, lh) },
            children: [
              new TextRun({
                text: "[앞글자] ",
                font: bodyFont,
                size: SIZE_META,
                bold: true,
                color: COLOR.gray,
              }),
              ...parseFormattedText(sw.firstLetters, {
                font: FONT,
                size: SIZE_META,
                color: COLOR.gray,
                markerColor: COLOR.black,
              }),
            ],
          }),
        );
      }
    } else if (summaryComplete) {
      const { summary } = summaryPartsForHeader ?? splitSummaryCompleteMcQuestionText(questionText);
      const maskedSummary = formatSummaryCompleteMcSummaryForDisplay(
        summary,
        readSummaryBlankAnswersFromQuestionLike(
          item.sourceQuestion,
          item.options,
          item.correctAnswer ?? item.sourceQuestion.correctAnswer,
        ),
      );
      if (passageContent) {
        result.push(
          ...buildPassage({
            passageTitle,
            passageContent: inlinePassageContent || passageContent,
            passageStyle: "plain",
            showPassageTitle,
            compact,
            usesSentenceInsertMarkers: false,
          }),
        );
      }
      if (summaryMc) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 20, after: 50 },
            children: [
              new TextRun({
                text: "\u2193",
                font: bodyFont,
                size: bodySize,
                bold: true,
                color: COLOR.gray,
              }),
            ],
          }),
        );
      }
      if (maskedSummary) {
        result.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 90, ...exactLineSpacing(bodySize, lh) },
            children: [
              ...(!summaryMc
                ? [
                    new TextRun({
                      text: "[\uC694\uC57D\uBB38] ",
                      font: bodyFont,
                      size: bodySize,
                      bold: true,
                    }),
                  ]
                : []),
              ...parseFormattedText(maskedSummary, {
                font: FONT,
                size: bodySize,
                bold: true,
              }),
            ],
          }),
        );
      }
    } else {
    if (subType === "SENTENCE_ORDER") {
      for (const segment of sentenceOrderSegmentsFromQuestionText(questionText)) {
        if (segment.kind === "box" && segment.boxStyle === "given") {
          result.push(...buildGivenBox(segment.text.replace(/\s*\n\s*/g, " "), bodySize, lh));
        } else if (segment.kind === "para") {
          result.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
              children: [
                new TextRun({
                  text: `${segment.label} `,
                  font: bodyFont,
                  size: bodySize,
                  bold: true,
                  color: COLOR.black,
                }),
                ...parseFormattedText(segment.text, {
                  font: bodyFont,
                  size: bodySize,
                  bold: true,
                  markerColor: COLOR.black,
                }),
              ],
            }),
          );
        } else if (segment.kind === "text") {
          result.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: { before: 0, after: 60, ...exactLineSpacing(bodySize, lh) },
              children: parseFormattedText(segment.text, {
                font: bodyFont,
                size: bodySize,
                bold: true,
                markerColor: COLOR.black,
              }),
            }),
          );
        }
      }
    } else {
    const { given: givenText, rest: restText } = extractGivenBlock(questionText, subType);

    // 주어진 문장 박스(문장삽입/순서)를 본문(지문/단락) 위에 먼저 그린다.
    if (givenText) {
      result.push(...buildGivenBox(givenText.replace(/\s*\n\s*/g, " "), bodySize, lh));
    }

    if (
      inlineSourcePassage &&
      shouldPlaceInlinePassageBeforeBody(subType) &&
      inlinePassageContent
    ) {
      result.push(
        ...buildPassage({
          passageTitle,
          passageContent: inlinePassageContent,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: false,
        }),
      );
    }

    const visibleRestText =
      subType === "SENTENCE_TRANSFORM"
        ? stripOriginalBlock(restText || questionText)
        : restText || questionText;
    const questionLines = visibleRestText.split("\n");

    let skippedHeaderQuestionLine = false;
    const bodyQuestionParagraphs = questionLines.filter((text) => {
      if (
        !skippedHeaderQuestionLine &&
        headerQuestionText &&
        text.trim() === headerQuestionText.trim()
      ) {
        skippedHeaderQuestionLine = true;
        return false;
      }
      return true;
    });
    // 발문(헤더)과 본문 사이의 빈 줄(원문 "발문\n\n본문" 의 \n\n)은 미리보기에선 본문 위에
    // 표시되지 않는다. DOCX 도 선두 빈 줄을 제거해 발문 바로 아래에서 본문이 시작하게 한다
    // (이 처리 없으면 1번 외 모든 문항에서 발문 아래 빈 줄 한 칸이 더 생겨 미리보기와 어긋남).
    while (
      bodyQuestionParagraphs.length > 0 &&
      bodyQuestionParagraphs[0].trim().length === 0
    ) {
      bodyQuestionParagraphs.shift();
    }

    bodyQuestionParagraphs.forEach((text, idx) => {
      const trimmed = text.trim();
      result.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            before: 0,
            // 본문 마지막 단락: 선지가 뒤따르면 본문↔선지 간격(100), 선지가 없으면(밑줄/어휘
            // 등 인라인 마커 유형) 이 본문이 문항의 마지막 요소이므로 선지 trailing(60)과
            // 같게 둬 문항 간 간격을 일관되게 한다.
            after:
              idx === bodyQuestionParagraphs.length - 1
                ? options.length > 0
                  ? 100
                  : 60
                : 30,
            ...exactLineSpacing(bodySize, lh),
          },
          keepNext: idx === bodyQuestionParagraphs.length - 1 && options.length > 0,
          children:
            trimmed.length === 0
              ? [new TextRun({ text: " ", font: bodyFont, size: bodySize })]
              : parseFormattedText(trimmed, {
                  font: bodyFont,
                  size: bodySize,
                  // 문항 본문(지문)은 일반체 — 발문(헤더)만 굵게(미리보기와 동일).
                  // 일부 유형(빈칸·어휘·무관문장 등)이 굵게 나오던 불일치 해소.
                  // 단, 문항 단위 '굵게' 서식이 켜지면 본문도 함께 굵게(미리보기와 동일).
                  bold: qBold,
                  italics: qItalic,
                  // 순서 유형의 (A)(B)(C)는 미리보기에서 검정, 그 외 본문 마커는 파랑(기본)
                  ...(subType === "SENTENCE_ORDER" ? { markerColor: COLOR.black } : {}),
                }),
        }),
      );
    });

    if (
      inlineSourcePassage &&
      !shouldPlaceInlinePassageBeforeBody(subType) &&
      inlinePassageContent
    ) {
      result.push(
        ...buildPassage({
          passageTitle,
          passageContent: inlinePassageContent,
          passageStyle: "plain",
          showPassageTitle,
          compact,
          usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
        }),
      );
    }
    }
    }
  }

  // 옵션 (preview 와 동일하게 원문자 번호 + 유형별 선택지 표시)
  if (options.length > 0) {
    options.forEach((opt, idx) => {
      const displayText = optionDisplayTextForSubtype(subType, idx, opt.text || "");
      const hasDisplayText = displayText.trim().length > 0;
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          children: [
            new TextRun({
              text: optionDisplayLabel(subType, idx, opt.label),
              font: bodyFont,
              size: optionSize,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...(hasDisplayText
              ? [
                  new TextRun({ text: "  ", font: bodyFont, size: optionSize }),
                  ...parseFormattedText(displayText, {
                    font: useKR ? KR_FONT : FONT,
                    size: optionSize,
                    bold: qBold,
                    italics: qItalic,
                    markerColor: COLOR.black, // 선지의 (A) 마커는 미리보기에서 검정
                  }),
                ]
              : []),
          ],
        }),
      );
    });
  }

  // 객관식 추가 선지
  if (
    showAnswerSpace &&
    options.length > 0 &&
    (item.objectiveAnswerSlots ?? 0) > 0
  ) {
    const slots = Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0));
    const objectiveAnswerTexts = item.objectiveAnswerTexts || [];
    for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
      const optionIndex = options.length + slotIndex;
      const displayText = objectiveAnswerTexts[slotIndex]?.trim() || "";
      const useKR = /[가-힣]/.test(displayText);
      result.push(
        new Paragraph({
          spacing: { after: 60, ...exactLineSpacing(optionSize, lh) },
          indent: { left: 376, hanging: 290 }, // 미리보기 선지: 번호 min-w-18px + gap-1.5(6px)
          children: [
            new TextRun({
              text: optionOrdinalLabel(optionIndex),
              font: bodyFont,
              size: optionSize,
              bold: true,
              color: COLOR.darkGray,
            }),
            new TextRun({ text: "  ", font: bodyFont, size: optionSize }),
            ...(displayText
              ? parseFormattedText(displayText, {
                  font: useKR ? KR_FONT : FONT,
                  size: optionSize,
                  bold: qBold,
                  italics: qItalic,
                  markerColor: COLOR.black,
                })
              : [
                  new TextRun({
                    text: "                                      ",
                    font: bodyFont,
                    size: optionSize,
                    underline: { type: UnderlineType.SINGLE },
                    color: COLOR.darkGray,
                  }),
                ]),
          ],
        }),
      );
    }
  }

  // 선지 뒤 빈 줄: 답란/해설이 뒤따를 때만 구분용으로 둔다. 문항 사이 간격은 다음 문항
  // 헤더의 before spacing 으로 일관 처리하므로, 여기서 무조건 빈 줄을 넣으면 "선지 있는
  // 문항"만 한 줄 더 벌어져 문항 간 간격이 들쭉날쭉해진다(미리보기는 항상 동일 간격).
  const hasTrailingAnswerContent =
    includeAnswers ||
    (showAnswerSpace &&
      (((item.objectiveAnswerSlots ?? 0) > 0) || ((item.answerSpaceLines ?? 0) > 0)));
  if (options.length > 0 && hasTrailingAnswerContent) {
    result.push(new Paragraph({ spacing: { after: 60 } }));
  }

  // 서술형/주관식 답란
  if (
    showAnswerSpace &&
    (item.answerSpaceLines ?? 0) > 0
  ) {
    const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 0));
    for (let i = 0; i < lines; i++) {
      result.push(
        new Paragraph({
          spacing: { before: i === 0 ? 40 : 80, after: 80 },
          border: {
            bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            top: NONE,
            left: NONE,
            right: NONE,
          },
          children: [new TextRun({ text: " " })],
        }),
      );
    }
  }

  // 정답 + 해설 (해설 포함 다운로드)
  if (includeAnswers) {
    result.push(
      ...buildAnswerBlock({
        correctAnswer: formatStoredQuestionCorrectAnswer({
          ...item.sourceQuestion,
          correctAnswer: item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
        }),
        explanation: item.sourceQuestion.explanation,
        hasOptions: options.length > 0,
      }),
    );
  }

  return result;
}

// =============================================================================
// 정답·해설 블록 (해설 포함 모드)
// =============================================================================

function buildAnswerBlock(opts: {
  correctAnswer: string;
  explanation: ExamQuestionData["question"]["explanation"];
  hasOptions: boolean;
}): DocChild[] {
  const result: DocChild[] = [];
  const { correctAnswer, explanation, hasOptions } = opts;

  const answerText = (correctAnswer || "").trim();
  const answerLabel = hasOptions ? "정답" : "정답:";

  // 정답 배지 (얇은 검정 박스, 약간 연한 배경)
  result.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: thinBox(COLOR.darkGray, 4),
              shading: { fill: "F5F5F5" },
              margins: { top: 80, bottom: 80, left: 160, right: 160 },
              width: { size: 100, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  children: [
                    new TextRun({
                      text: `${answerLabel}  `,
                      font: bodyFont,
                      size: SIZE_ANSWER_LABEL,
                      bold: true,
                      color: COLOR.darkGray,
                    }),
                    new TextRun({
                      text: answerText || " ",
                      font: FONT,
                      size: SIZE_ANSWER_VALUE,
                      bold: true,
                      color: COLOR.black,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  );
  result.push(new Paragraph({ spacing: { after: 80 } }));

  if (!explanation) return result;

  // 해설
  const explanationContent = (explanation.content || "").trim();
  if (explanationContent) {
    result.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        indent: { left: 80 },
        children: [
          new TextRun({
            text: "해설",
            font: bodyFont,
            size: SIZE_EXPLAIN_LABEL,
            bold: true,
            color: COLOR.darkGray,
          }),
        ],
      }),
    );
    for (const line of explanationContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      result.push(
        new Paragraph({
          spacing: { after: 40, line: 290 },
          indent: { left: 200 },
          children: parseFormattedText(trimmed, {
            font: bodyFont,
            size: SIZE_EXPLAIN_BODY,
            color: COLOR.darkGray,
          }),
        }),
      );
    }
  }

  // 핵심 포인트
  const keyPoints = safeParseJSON<string[]>(explanation.keyPoints, []);
  if (keyPoints.length > 0) {
    result.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        indent: { left: 80 },
        children: [
          new TextRun({
            text: "핵심 포인트",
            font: bodyFont,
            size: SIZE_EXPLAIN_LABEL,
            bold: true,
            color: COLOR.darkGray,
          }),
        ],
      }),
    );
    for (const kp of keyPoints) {
      const trimmed = (kp || "").trim();
      if (!trimmed) continue;
      result.push(
        new Paragraph({
          spacing: { after: 40, line: 280 },
          indent: { left: 280, hanging: 160 },
          children: [
            new TextRun({
              text: "• ",
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              color: COLOR.gray,
            }),
            ...parseFormattedText(trimmed, {
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              color: COLOR.darkGray,
            }),
          ],
        }),
      );
    }
  }

  // 오답 분석
  const wrongExplanations = safeParseJSON<Record<string, string>>(
    explanation.wrongOptionExplanations,
    {},
  );
  const wrongEntries = Object.entries(wrongExplanations).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  if (wrongEntries.length > 0 && hasOptions) {
    result.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        indent: { left: 80 },
        children: [
          new TextRun({
            text: "오답 분석",
            font: bodyFont,
            size: SIZE_EXPLAIN_LABEL,
            bold: true,
            color: COLOR.darkGray,
          }),
        ],
      }),
    );
    for (const [label, exp] of wrongEntries) {
      result.push(
        new Paragraph({
          spacing: { after: 40, line: 280 },
          indent: { left: 280, hanging: 200 },
          children: [
            new TextRun({
              text: `${label} `,
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...parseFormattedText(exp.trim(), {
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              color: COLOR.gray,
            }),
          ],
        }),
      );
    }
  }

  result.push(new Paragraph({ spacing: { after: 120 } }));
  return result;
}

function safeParseOptions(raw: string | null | undefined): ParsedOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o, idx) => ({
      label: String(o?.label ?? idx + 1),
      text: String(o?.text ?? ""),
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// 그룹화: groupId 가 같으면 지문을 한 번만 출력 (미리보기와 동일)
// =============================================================================

function groupItems(
  items: BuilderItemResolved[],
): Array<{ groupKey: string; items: BuilderItemResolved[] }> {
  const groups: Array<{ groupKey: string; items: BuilderItemResolved[] }> = [];
  for (const item of items) {
    const key = item.groupId || `single:${item.questionId}-${item.orderNum}`;
    const last = groups[groups.length - 1];
    if (last && last.groupKey === key) {
      last.items.push(item);
    } else {
      groups.push({ groupKey: key, items: [item] });
    }
  }
  return groups;
}

function docAlignment(align: BuilderBlock["blockAlign"]): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function blockBodySize(block: BuilderBlock, compact: boolean) {
  // 숫자 pt 가 지정되면 half-point(pt*2) 로 직접 환산해 미리보기와 동일 크기로 출력한다.
  if (typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)) {
    return Math.round(block.blockFontPt * 2);
  }
  if (block.blockFontSize === "lg") return compact ? 24 : 26;
  if (block.blockFontSize === "sm") return compact ? 16 : 18;
  return compact ? SIZE_BODY_COMPACT : SIZE_BODY;
}

function dividerBorderStyle(style: BuilderBlock["dividerStyle"]) {
  if (style === "dashed") return BorderStyle.DASHED;
  if (style === "dotted") return BorderStyle.DOTTED;
  return BorderStyle.SINGLE;
}

function buildCustomBlock(block: BuilderBlock, compact: boolean): DocChild[] {
  const accent = (block.blockAccentColor || "#2563EB").replace("#", "");
  const align = docAlignment(block.blockAlign);
  const text = block.blockText || block.questionText || "";

  if (block.blockType === "section") {
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 140, after: 120 },
        border: {
          left: bdr(BorderStyle.SINGLE, 16, accent),
          bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
          top: NONE,
          right: NONE,
        },
        indent: { left: 160 },
        children: [
          new TextRun({
            text: block.blockTitle || text || "새 섹션",
            font: bodyFont,
            size:
              typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)
                ? Math.round(block.blockFontPt * 2)
                : compact
                  ? 24
                  : 26,
            bold: block.blockBold ?? true,
            italics: block.blockItalic ?? false,
            color: COLOR.black,
          }),
        ],
      }),
    ];
  }

  if (block.blockType === "text") {
    const paragraphs = (text || " ").replace(/\r/g, "").split("\n");
    return paragraphs.map(
      (paragraph) =>
        new Paragraph({
          alignment: align,
          spacing: { before: 40, after: 80 },
          children: parseFormattedText(paragraph || " ", {
            font: bodyFont,
            size: blockBodySize(block, compact),
            color: COLOR.darkGray,
            bold: block.blockBold ?? false,
            italics: block.blockItalic ?? false,
          }),
        }),
    );
  }

  if (block.blockType === "divider") {
    return [
      new Paragraph({
        spacing: { before: 120, after: 120 },
        border: {
          top: bdr(
            dividerBorderStyle(block.dividerStyle),
            Math.max(4, Math.min(24, (block.dividerThickness || 1) * 4)),
            accent,
          ),
          bottom: NONE,
          left: NONE,
          right: NONE,
        },
        children: [new TextRun({ text: "" })],
      }),
    ];
  }

  if (block.blockType === "spacer") {
    // 워드프로세서식 빈 줄(line-gap): 미리보기에서 Enter 한 번 = 본문 한 줄이므로,
    // 워드에서도 "본문 한 줄"과 똑같은 높이(빈 단락 한 줄)로 렌더한다. 추가 spaceAfter
    // 없이 본문 글자 크기·행간(exactLineSpacing)만 줘서 정확히 한 줄을 차지하게 한다.
    if (block.blockText === LINE_GAP_MARKER) {
      const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
      const lh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
      return [
        new Paragraph({
          spacing: { before: 0, after: 0, ...exactLineSpacing(bodySize, lh) },
          children: [new TextRun({ text: "", font: bodyFont, size: bodySize })],
        }),
      ];
    }
    return [
      new Paragraph({
        spacing: { before: 0, after: Math.max(80, Math.min(900, (block.spacerHeight || 32) * 10)) },
        children: [new TextRun({ text: "" })],
      }),
    ];
  }

  if (block.blockType === "image") {
    const image = dataUrlToImage(block.imageDataUrl);
    if (!image) {
      return [
        new Paragraph({
          alignment: align,
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text: block.imageAlt || "이미지",
              font: bodyFont,
              size: SIZE_META,
              color: COLOR.gray,
              italics: true,
            }),
          ],
        }),
      ];
    }

    const width = Math.max(120, Math.min(520, 520 * ((block.imageWidth || 70) / 100)));
    // 실제 종횡비(자연 height/width)로 높이를 잡아 미리보기와 같은 비율로 출력한다.
    const aspect = image.width > 0 ? image.height / image.width : DEFAULT_IMAGE_ASPECT;
    // 아주 긴 이미지는 한 페이지(내용 높이 ~1000px@A4)를 넘지 않도록 높이를 제한해
    // 종횡비를 유지한 채 폭까지 함께 줄인다(워드 페이지/여백을 넘지 않게).
    const MAX_IMG_HEIGHT_PX = 1000;
    let imgW = width;
    let imgH = Math.round(width * aspect);
    if (imgH > MAX_IMG_HEIGHT_PX) {
      imgH = MAX_IMG_HEIGHT_PX;
      imgW = Math.round(MAX_IMG_HEIGHT_PX / aspect);
    }
    const height = imgH;
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 80, after: block.imageAlt ? 40 : 120 },
        // 이미지는 한 덩어리로 유지 — 페이지 하단에 안 들어가면 통째로 다음 쪽으로
        // (Word 가 인라인 이미지를 쪼개지 않으므로 자동으로 다음 쪽 상단에 배치된다).
        keepLines: true,
        keepNext: Boolean(block.imageAlt),
        children: [
          new ImageRun({
            data: image.buffer,
            transformation: { width: imgW, height },
            type: image.type,
          }),
        ],
      }),
      ...(block.imageAlt
        ? [
            new Paragraph({
              alignment: align,
              spacing: { after: 100 },
              keepLines: true,
              children: [
                new TextRun({
                  text: block.imageAlt,
                  font: bodyFont,
                  size: SIZE_META,
                  color: COLOR.gray,
                }),
              ],
            }),
          ]
        : []),
    ];
  }

  return [];
}

function appendQuestionGroups(
  target: DocChild[],
  items: BuilderItemResolved[],
  layout: BuilderLayout,
  includeAnswers: boolean,
  compact: boolean,
) {
  const passageStyle = "plain";
  const showPassageTitle = layout.showPassageTitle === true;
  const groups = groupItems(items);

  // 워드(DOCX) 전용: 문항과 문항 사이에 항상 빈 줄 1개를 넣어 간격을 일관되게 한다
  // (미리보기·HWPX 는 그대로 — 사용자 요청 "워드만"). 본문 한 줄 높이의 빈 단락.
  const sepBodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const sepLh = compact ? BODY_LINE_HEIGHT_COMPACT : BODY_LINE_HEIGHT;
  const questionSeparator = () =>
    new Paragraph({
      spacing: { before: 0, after: 0, ...exactLineSpacing(sepBodySize, sepLh) },
      children: [new TextRun({ text: " ", font: bodyFont, size: sepBodySize })],
    });
  let renderedAnyQuestion = false;

  for (const group of groups) {
    // 이전 문항(그룹)과의 사이에 빈 줄 1개.
    if (renderedAnyQuestion) target.push(questionSeparator());
    const first = group.items[0];
    const rawPassageContent = (first.passageContent ?? first.sourceQuestion.passage?.content ?? "").trim();
    const passageContent = formatSourcePassageForQuestionItems(
      rawPassageContent,
      group.items,
    ).trim();
    const includePassage =
      !shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
      (first.includePassage !== false ||
        shouldForceSourcePassage({
          subType: first.sourceQuestion.subType,
          questionText: first.questionText || first.sourceQuestion.questionText,
          structuredData: (first.sourceQuestion as { structuredData?: unknown }).structuredData,
          passage: { content: rawPassageContent },
        }));
    if (includePassage && passageContent) {
      const passageBlocks = buildPassage({
        passageTitle: printablePassageTitle(first),
        passageContent,
        passageStyle,
        showPassageTitle,
        compact,
        usesSentenceInsertMarkers: group.items.some(
          (item) => item.sourceQuestion.subType === "SENTENCE_INSERT",
        ),
      });
      target.push(...passageBlocks);
    }
    group.items.forEach((item, idx) => {
      // 같은 지문을 공유하는 그룹 내 문항들 사이에도 빈 줄 1개.
      if (idx > 0) target.push(questionSeparator());
      target.push(...buildQuestionBlock(item, layout, includeAnswers));
      renderedAnyQuestion = true;
    });
  }
}

// =============================================================================
// 메인: Document 빌드
// =============================================================================

export function buildBuilderExamDocument(opts: {
  title: string;
  settings: BuilderSettings;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
}): Document {
  const { title, settings, resolvedItems, includeAnswers, fullExamQuestions } = opts;
  bodyFont = bodyFontForTemplate(settings.template);
  const header = settings.header || {};
  const layout = settings.layout || {};
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;
  const compact = layout.density === "compact";
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  const pageSize = DOCX_PAPER_SIZES[paperSize];

  // 페이지 마진 (5차 — 전체 여백 축소): 미리보기 a4-paper-page.tsx 의 px 패딩을
  // 가상 A4 스케일(760px=210mm, mm/px=0.276316)로 환산해 미리보기·HWPX 와 일치시킨다.
  //   comfortable px-[34px] py-[28px] → L/R 9.395mm, T/B 7.737mm.
  //   compact px-[28px] py-[24px] → L/R 7.737mm, T/B 6.632mm.
  const MM_PER_PX = 210 / 760; // 0.276316
  const lrPx = compact ? 28 : 34;
  const tbPx = compact ? 24 : 28;
  const lrDxa = mmToDxa(lrPx * MM_PER_PX);
  const tbDxa = mmToDxa(tbPx * MM_PER_PX);
  const margin = { top: tbDxa, bottom: tbDxa, left: lrDxa, right: lrDxa };

  // ---- Section 1: 1페이지 상단 헤더 (단일 컬럼, 연속 섹션) ----
  const section1Children: DocChild[] = buildPage1Header(header, title, compact);

  // ---- Section 2: 본문 (1단/2단) ----
  const section2Children: DocChild[] = [];
  if (settings.blocks?.length) {
    const byLocalId = new Map(
      resolvedItems
        .filter((item) => item.localId)
        .map((item) => [item.localId as string, item]),
    );
    const used = new Set<BuilderItemResolved>();
    const takeQuestion = (block: BuilderBlock) => {
      const byId = block.localId ? byLocalId.get(block.localId) : undefined;
      if (byId && !used.has(byId)) {
        used.add(byId);
        return byId;
      }
      const fallback = resolvedItems.find(
        (item) => !used.has(item) && item.questionId === block.questionId,
      );
      if (fallback) used.add(fallback);
      return fallback;
    };
    let pendingQuestions: BuilderItemResolved[] = [];
    const flush = () => {
      if (pendingQuestions.length === 0) return;
      appendQuestionGroups(section2Children, pendingQuestions, layout, includeAnswers, compact);
      pendingQuestions = [];
    };

    for (const block of settings.blocks) {
      if (block.blockType === "question") {
        const questionItem = takeQuestion(block);
        if (questionItem) pendingQuestions.push(questionItem);
        continue;
      }
      flush();
      section2Children.push(...buildCustomBlock(block, compact));
    }
    flush();
  } else {
    appendQuestionGroups(section2Children, resolvedItems, layout, includeAnswers, compact);
  }

  // 정답표 (정답포함 모드가 아닐 때만 추가)
  if (!includeAnswers && fullExamQuestions.length > 0) {
    section2Children.push(...buildAnswerKeyTable(fullExamQuestions));
  }

  // ---- 헤더/푸터 정의 ----
  // 1페이지에는 본문 상단의 리치 헤더만 보이도록, titlePage + headers.first 를 비워둠
  const continuedHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        border: {
          bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
          top: NONE, left: NONE, right: NONE,
        },
        children: [
          new TextRun({
            text: title,
            font: bodyFont,
            size: SIZE_CONTINUED,
            color: COLOR.gray,
          }),
        ],
      }),
    ],
  });
  const emptyHeader = new Header({ children: [emptyParagraph()] });

  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "- ",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: FONT,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            text: " / ",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: FONT,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
          new TextRun({
            text: " -",
            font: bodyFont,
            size: SIZE_FOOTER,
            color: COLOR.gray,
          }),
        ],
      }),
    ],
  });

  return new Document({
    creator: "nara",
    styles: {
      default: {
        document: {
          run: { font: bodyFont },
        },
      },
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: { size: pageSize, margin },
          column: { count: 1 },
          titlePage: true,
        },
        headers: { first: emptyHeader, default: continuedHeader },
        footers: { first: pageFooter, default: pageFooter },
        children: section1Children,
      },
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: { size: pageSize, margin },
          column: {
            count: columns,
            space: columns === 2 ? 501 : 0, // 미리보기 TWO_COLUMN_GAP 32px → 8.842mm
          },
          titlePage: true,
        },
        headers: { first: emptyHeader, default: continuedHeader },
        footers: { first: pageFooter, default: pageFooter },
        children: section2Children,
      },
    ],
  });
}
