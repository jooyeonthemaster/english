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
import type { DocChild, ExamQuestionData } from "./types";

// ---------------------------------------------------------------------------
// Document Builder
// ---------------------------------------------------------------------------

export function buildExamDocument(
  title: string,
  questions: ExamQuestionData[],
  includeAnswers: boolean
): Document {
  const allChildren: DocChild[] = [];

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
    })
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
      })
    );
  }
  allChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: subtitleRuns,
    })
  );

  allChildren.push(hrule(COLOR.black, 12, 80, 200));

  for (const eq of questions) {
    allChildren.push(...buildQuestionElements(eq, includeAnswers));
  }

  if (!includeAnswers) {
    allChildren.push(...buildAnswerKeyTable(questions));
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5in clean margins
          },
          column: { space: 480, count: 2 }, // 2 columns, slightly wider gap
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
