import {
  AlignmentType,
  Document,
  Footer,
  Header,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { COLOR, KR_FONT, FONT, LABEL_SIZE, SUBTITLE_SIZE, TITLE_SIZE } from "./styles";
import { hrule } from "./borders";
import { buildQuestionElements } from "./build-question";
import { buildAnswerKeyTable } from "./build-answer-key";
import { LEGACY_PAGE_SIZE, legacyDocGeometry } from "./table-geometry";
import type { DocChild, ExamQuestionData } from "./types";

// ---------------------------------------------------------------------------
// Document Builder
// ---------------------------------------------------------------------------

export function buildExamDocument(
  title: string,
  questions: ExamQuestionData[],
  includeAnswers: boolean,
  options?: {
    columns?: 1 | 2;
    density?: "comfortable" | "compact";
    template?: string;
  },
): Document {
  const allChildren: DocChild[] = [];
  // 쪽·단 설정의 단일 원천 — 본문 표(선지·답란·정답표)의 폭도 같은 단 폭에서 계산한다.
  const geometry = legacyDocGeometry(options);

  allChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: title,
          font: KR_FONT,
          size: TITLE_SIZE,
          bold: true,
        }),
      ],
    }),
  );

  const subtitleRuns: TextRun[] = [
    new TextRun({
      text: `총 ${questions.length}문항`,
      font: KR_FONT,
      size: SUBTITLE_SIZE,
      color: COLOR.gray,
    }),
  ];
  if (includeAnswers) {
    subtitleRuns.push(
      new TextRun({
        text: "  |  정답 및 해설",
        font: KR_FONT,
        size: SUBTITLE_SIZE,
        color: COLOR.darkGray,
        bold: true,
      }),
    );
  }
  allChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: subtitleRuns,
    }),
  );

  allChildren.push(hrule(COLOR.black, 12, 80, 200));

  for (const eq of questions) {
    allChildren.push(...buildQuestionElements(eq, includeAnswers, geometry.columnWidthDxa));
  }

  if (!includeAnswers) {
    // 정답표는 항상 새 페이지에서 시작.
    allChildren.push(
      ...buildAnswerKeyTable(questions, {
        pageBreakBefore: true,
        containerWidthDxa: geometry.columnWidthDxa,
      }),
    );
  }

  const { margin, columnCount, columnSpaceDxa } = geometry;

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: LEGACY_PAGE_SIZE.width, height: LEGACY_PAGE_SIZE.height },
            margin,
          },
          column: { space: columnSpaceDxa, count: columnCount },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: title,
                    font: KR_FONT,
                    size: 16,
                    color: COLOR.lightGray,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "- ",
                    font: KR_FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                  new TextRun({
                    text: " -",
                    font: KR_FONT,
                    size: LABEL_SIZE,
                    color: COLOR.lightGray,
                  }),
                ],
              }),
            ],
          }),
        },
        children: allChildren,
      },
    ],
  });
}
