import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
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
import { COLOR, FONT, KR_FONT } from "./styles";
import { parseFormattedText } from "./parse-formatted-text";
import { buildAnswerKeyTable } from "./build-answer-key";
import { safeParseJSON } from "./helpers";
import {
  formatSentenceInsertPassageMarkers,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  splitSentenceInsertGivenBlock,
} from "@/components/exams/paper-builder/option-display";
import {
  shouldForceSourcePassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
import {
  isSummaryCompleteMc,
  splitSummaryCompleteMcQuestionText,
} from "@/components/exams/paper-builder/summary-complete-mc-layout";
import {
  formatSummaryCompleteMcSummaryForDisplay,
  readSummaryBlankAnswersFromQuestionLike,
} from "@/lib/summary-complete-mc";
import type { DocChild, ExamQuestionData, ParsedOption } from "./types";

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
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

// 미리보기 px 기준값 → docx half-point.
// 미리보기 text-[11.5px] ≈ 본문 10pt, [10.5px] ≈ 9.5pt
const SIZE_TITLE = 40;        // 20pt (h2 28px)
const SIZE_TITLE_COMPACT = 32; // 16pt (compact 22px)
const SIZE_SUBTITLE = 14;     // 7pt (subtitle 9px)
const SIZE_INFO = 16;         // 8pt (학교/반/이름)
const SIZE_INSTRUCTIONS = 16; // 8pt
const SIZE_QNUM = 22;         // 11pt
const SIZE_QNUM_COMPACT = 20; // 10pt
const SIZE_META = 14;         // 7pt
const SIZE_BODY = 20;         // 10pt
const SIZE_BODY_COMPACT = 18; // 9pt
const SIZE_PASSAGE_TITLE = 14; // 7pt
const SIZE_CONTINUED = 16;    // 8pt
const SIZE_FOOTER = 16;       // 8pt
const SIZE_ANSWER_LABEL = 16; // 8pt
const SIZE_ANSWER_VALUE = 22; // 11pt
const SIZE_EXPLAIN_LABEL = 16; // 8pt
const SIZE_EXPLAIN_BODY = 18; // 9pt

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
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: "left" | "center" | "right";
  blockFontSize?: "sm" | "md" | "lg";
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
  sourceQuestion: ExamQuestionData["question"];
}

function normalizePrintableTitle(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizePrintableTitle(item.passageTitle);
  if (!savedTitle) return "";
  const sourceTitle = normalizePrintableTitle(item.sourceQuestion.passage?.title);
  return savedTitle === sourceTitle ? "" : savedTitle;
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
  return { buffer: buf, type, width: 64, height: 64 };
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
            font: KR_FONT,
            size: SIZE_SUBTITLE,
            bold: true,
            color: COLOR.gray,
            characterSpacing: 30,
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
          font: KR_FONT,
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
            font: KR_FONT,
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
                    font: KR_FONT,
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
                    font: KR_FONT,
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

  const titlePara: Paragraph | null =
    showPassageTitle && passageTitle.trim()
      ? new Paragraph({
          spacing: { after: 60 },
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
        line: 300,
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

  if (passageStyle === "boxed") {
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: thinBox(COLOR.darkGray, 4),
                margins: { top: 120, bottom: 120, left: 160, right: 160 },
                width: { size: 100, type: WidthType.PERCENTAGE },
                children: innerChildren,
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 120 } }),
    ];
  }

  if (passageStyle === "underlined") {
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top: bdr(BorderStyle.SINGLE, 6, COLOR.darkGray),
                  bottom: bdr(BorderStyle.SINGLE, 6, COLOR.darkGray),
                  left: NONE,
                  right: NONE,
                },
                margins: { top: 100, bottom: 100, left: 0, right: 0 },
                width: { size: 100, type: WidthType.PERCENTAGE },
                children: innerChildren,
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 120 } }),
    ];
  }

  // plain
  return [...innerChildren, new Paragraph({ spacing: { after: 120 } })];
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
  const questionText = formatSentenceInsertPassageMarkers(
    item.questionText ?? item.sourceQuestion.questionText ?? "",
    subType,
  ).trim();
  const options = (item.options ?? safeParseOptions(item.sourceQuestion.options)).filter(
    (o) => o && (o.text || "").length >= 0,
  );

  const qNumSize = compact ? SIZE_QNUM_COMPACT : SIZE_QNUM;
  const bodySize = compact ? SIZE_BODY_COMPACT : SIZE_BODY;
  const summaryMc = isSummaryCompleteMc(subType);
  const inlineSourcePassage =
    shouldRenderSourcePassageInsideQuestion(subType) && !summaryMc;
  const passageContent = (item.passageContent ?? item.sourceQuestion.passage?.content ?? "").trim();
  const summaryPartsForHeader = summaryMc
    ? splitSummaryCompleteMcQuestionText(questionText)
    : null;
  const genericHeaderQuestionText = !summaryPartsForHeader
    ? firstQuestionLineForHeader(questionText, subType)
    : "";
  const headerQuestionText =
    summaryPartsForHeader?.stem || genericHeaderQuestionText;

  // 번호 + 메타 + 본문 한 단락 (번호 굵게, 메타 작게, 본문은 새 줄에서 시작)
  const headerRuns: TextRun[] = [
    new TextRun({
      text: `${orderNum}. `,
      font: KR_FONT,
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
        font: KR_FONT,
        size: SIZE_META,
        color: COLOR.gray,
      }),
    );
  }

  // 첫 단락에 번호 + 메타. 그 다음 단락에 본문(있는 경우).
  if (headerQuestionText) {
    headerRuns.push(
      ...parseFormattedText(headerQuestionText, {
        font: KR_FONT,
        size: bodySize,
        bold: true,
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
    if (summaryMc) {
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
            passageTitle: "",
            passageContent,
            passageStyle: layout.passageStyle ?? "boxed",
            showPassageTitle: false,
            compact,
            usesSentenceInsertMarkers: false,
          }),
        );
      }
      result.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 20, after: 50 },
          children: [
            new TextRun({
              text: "\u2193",
              font: KR_FONT,
              size: bodySize,
              bold: true,
              color: COLOR.gray,
            }),
          ],
        }),
      );
      if (maskedSummary) {
        result.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: thinBox(COLOR.lightGray, 4),
                    shading: { fill: "F8FAFC" },
                    margins: { top: 100, bottom: 100, left: 140, right: 140 },
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 0, line: 290 },
                        children: parseFormattedText(maskedSummary, {
                          font: FONT,
                          size: bodySize,
                          bold: true,
                        }),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ spacing: { after: 90 } }),
        );
      }
    } else {
    const { beforeText, givenText } = splitSentenceInsertGivenBlock(questionText, subType);
    const questionParagraphs: Array<{ text: string; boxed: boolean }> = [];

    // 주어진 문장(문장삽입) 박스는 지문 '위'에 와야 하므로 beforeText(지문)보다 먼저 넣는다.
    if (givenText) {
      questionParagraphs.push({
        text: givenText.replace(/\s*\n\s*/g, " "),
        boxed: true,
      });
    }
    if (beforeText) {
      beforeText.split("\n").forEach((line) => {
        questionParagraphs.push({ text: line, boxed: false });
      });
    }
    if (questionParagraphs.length === 0) {
      questionText.split("\n").forEach((line) => {
        questionParagraphs.push({ text: line, boxed: false });
      });
    }

    let skippedHeaderQuestionLine = false;
    const bodyQuestionParagraphs = questionParagraphs.filter(({ text, boxed }) => {
      if (
        !skippedHeaderQuestionLine &&
        headerQuestionText &&
        !boxed &&
        text.trim() === headerQuestionText.trim()
      ) {
        skippedHeaderQuestionLine = true;
        return false;
      }
      return true;
    });

    bodyQuestionParagraphs.forEach(({ text, boxed }, idx) => {
      const trimmed = text.trim();
      result.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: {
            before: boxed ? 50 : 0,
            after: idx === bodyQuestionParagraphs.length - 1 ? 100 : boxed ? 70 : 30,
            line: 290,
          },
          keepNext: idx === bodyQuestionParagraphs.length - 1 && options.length > 0,
          border: boxed
            ? {
                top: bdr(BorderStyle.SINGLE, 6, COLOR.gray),
                bottom: bdr(BorderStyle.SINGLE, 6, COLOR.gray),
                left: bdr(BorderStyle.SINGLE, 6, COLOR.gray),
                right: bdr(BorderStyle.SINGLE, 6, COLOR.gray),
              }
            : undefined,
          children:
            trimmed.length === 0
              ? [new TextRun({ text: " ", font: KR_FONT, size: bodySize })]
              : parseFormattedText(trimmed, { font: KR_FONT, size: bodySize, bold: true }),
        }),
      );
    });

    if (inlineSourcePassage && passageContent) {
      result.push(
        ...buildPassage({
          passageTitle: "",
          passageContent,
          passageStyle: layout.passageStyle ?? "boxed",
          showPassageTitle: false,
          compact,
          usesSentenceInsertMarkers: subType === "SENTENCE_INSERT",
        }),
      );
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
          spacing: { after: 40, line: 280 },
          indent: { left: 360, hanging: 280 },
          children: [
            new TextRun({
              text: optionOrdinalLabel(idx),
              font: KR_FONT,
              size: bodySize,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...(hasDisplayText
              ? [
                  new TextRun({ text: "  ", font: KR_FONT, size: bodySize }),
                  ...parseFormattedText(displayText, {
                    font: useKR ? KR_FONT : FONT,
                    size: bodySize,
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
          spacing: { after: 40, line: 280 },
          indent: { left: 360, hanging: 280 },
          children: [
            new TextRun({
              text: optionOrdinalLabel(optionIndex),
              font: KR_FONT,
              size: bodySize,
              bold: true,
              color: COLOR.darkGray,
            }),
            new TextRun({ text: "  ", font: KR_FONT, size: bodySize }),
            ...(displayText
              ? parseFormattedText(displayText, {
                  font: useKR ? KR_FONT : FONT,
                  size: bodySize,
                })
              : [
                  new TextRun({
                    text: "                                      ",
                    font: KR_FONT,
                    size: bodySize,
                    underline: { type: UnderlineType.SINGLE },
                    color: COLOR.darkGray,
                  }),
                ]),
          ],
        }),
      );
    }
  }

  if (options.length > 0) {
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
        correctAnswer:
          item.correctAnswer ?? item.sourceQuestion.correctAnswer ?? "",
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
                      font: KR_FONT,
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
            font: KR_FONT,
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
            font: KR_FONT,
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
            font: KR_FONT,
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
              font: KR_FONT,
              size: SIZE_EXPLAIN_BODY,
              color: COLOR.gray,
            }),
            ...parseFormattedText(trimmed, {
              font: KR_FONT,
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
            font: KR_FONT,
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
              font: KR_FONT,
              size: SIZE_EXPLAIN_BODY,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...parseFormattedText(exp.trim(), {
              font: KR_FONT,
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
            font: KR_FONT,
            size: compact ? 24 : 26,
            bold: true,
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
            font: KR_FONT,
            size: blockBodySize(block, compact),
            color: COLOR.darkGray,
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
              font: KR_FONT,
              size: SIZE_META,
              color: COLOR.gray,
              italics: true,
            }),
          ],
        }),
      ];
    }

    const width = Math.max(120, Math.min(520, 520 * ((block.imageWidth || 70) / 100)));
    return [
      new Paragraph({
        alignment: align,
        spacing: { before: 80, after: block.imageAlt ? 40 : 120 },
        children: [
          new ImageRun({
            data: image.buffer,
            transformation: { width, height: width * 0.68 },
            type: image.type,
          }),
        ],
      }),
      ...(block.imageAlt
        ? [
            new Paragraph({
              alignment: align,
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: block.imageAlt,
                  font: KR_FONT,
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
  const passageStyle = layout.passageStyle ?? "boxed";
  const showPassageTitle = layout.showPassageTitle === true;
  const groups = groupItems(items);
  for (const group of groups) {
    const first = group.items[0];
    const passageContent = (first.passageContent ?? first.sourceQuestion.passage?.content ?? "").trim();
    const includePassage =
      !shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
      (first.includePassage !== false ||
        shouldForceSourcePassage({
          subType: first.sourceQuestion.subType,
          questionText: first.questionText || first.sourceQuestion.questionText,
          structuredData: (first.sourceQuestion as { structuredData?: unknown }).structuredData,
          passage: { content: passageContent },
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
    for (const item of group.items) {
      target.push(...buildQuestionBlock(item, layout, includeAnswers));
    }
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
            font: KR_FONT,
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
            font: KR_FONT,
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
            font: KR_FONT,
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
            font: KR_FONT,
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
          run: { font: KR_FONT },
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
            space: columns === 2 ? 540 : 0,
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
