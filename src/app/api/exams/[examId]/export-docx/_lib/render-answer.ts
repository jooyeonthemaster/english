import {
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { COLOR, FONT, KR_FONT, LABEL_SIZE, PASSAGE_SIZE, QUESTION_SIZE, SMALL_SIZE } from "./styles";
import { thinBox } from "./borders";
import { safeParseJSON } from "./helpers";
import type { DocChild, ExamQuestionData, ParsedOption } from "./types";

// ---------------------------------------------------------------------------
// Answer & Explanation
// ---------------------------------------------------------------------------

export function renderAnswer(
  q: ExamQuestionData["question"],
  options: ParsedOption[]
): DocChild[] {
  const result: DocChild[] = [];

  const answerLabel = options.length > 0 ? "정답" : "정답:";
  const answerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: thinBox(COLOR.black, 4),
            shading: { fill: COLOR.answerBg },
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${answerLabel}  `,
                    font: KR_FONT,
                    size: PASSAGE_SIZE,
                    bold: true,
                    color: COLOR.darkGray,
                  }),
                  new TextRun({
                    text: q.correctAnswer,
                    font: FONT,
                    size: QUESTION_SIZE,
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
  });
  result.push(answerTable);
  result.push(new Paragraph({ spacing: { after: 80 } }));

  if (q.explanation) {
    if (q.explanation.content) {
      result.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "해설",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      const explanationLines = q.explanation.content
        .split("\n")
        .filter((l) => l.trim());
      for (const line of explanationLines) {
        result.push(
          new Paragraph({
            spacing: { after: 40, line: 312 },
            indent: { left: 200 },
            children: [
              new TextRun({
                text: line,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
            ],
          })
        );
      }
    }

    const keyPoints = safeParseJSON<string[]>(q.explanation.keyPoints, []);
    if (keyPoints.length > 0) {
      result.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "핵심 포인트",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      for (const kp of keyPoints) {
        result.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200, hanging: 100 },
            children: [
              new TextRun({
                text: "• ",
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
              new TextRun({
                text: kp,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.gray,
              }),
            ],
          })
        );
      }
    }

    const wrongExplanations = safeParseJSON<Record<string, string>>(
      q.explanation.wrongOptionExplanations,
      {}
    );
    if (Object.keys(wrongExplanations).length > 0 && options.length > 0) {
      result.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          indent: { left: 100 },
          children: [
            new TextRun({
              text: "오답 분석",
              font: KR_FONT,
              size: LABEL_SIZE,
              bold: true,
              color: COLOR.darkGray,
            }),
          ],
        })
      );

      for (const [label, explanation] of Object.entries(wrongExplanations)) {
        result.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 200, hanging: 200 },
            children: [
              new TextRun({
                text: `${label} `,
                font: FONT,
                size: SMALL_SIZE,
                bold: true,
                color: COLOR.gray,
              }),
              new TextRun({
                text: explanation,
                font: KR_FONT,
                size: SMALL_SIZE,
                color: COLOR.lightGray,
              }),
            ],
          })
        );
      }
    }
  }

  return result;
}
