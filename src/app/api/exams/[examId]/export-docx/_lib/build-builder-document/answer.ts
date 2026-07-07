import { Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import { circleGrammarLabelMentions, grammarMarkerDisplayLabel, shouldRenderWrongAnalysisForSubtype } from "@/components/exams/paper-builder/option-display";
import { thinBox } from "../borders";
import { safeParseJSON } from "../helpers";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR, FONT } from "../styles";
import type { DocChild, ExamQuestionData } from "../types";
import { SIZE_ANSWER_LABEL, SIZE_ANSWER_VALUE, SIZE_EXPLAIN_BODY, SIZE_EXPLAIN_LABEL, bodyFont } from "./sizes";



// =============================================================================
// 정답·해설 블록 (해설 포함 모드)
// =============================================================================

export function buildAnswerBlock(opts: {
  correctAnswer: string;
  explanation: ExamQuestionData["question"]["explanation"];
  hasOptions: boolean;
  /** 마커 유형 오답분석 게이트 + 어법 라벨 표시 변환용 (웹 explanation-content 와 규약 동일) */
  subType?: string | null;
}): DocChild[] {
  const result: DocChild[] = [];
  const { correctAnswer, explanation, hasOptions, subType } = opts;
  // 어법(GRAMMAR_ERROR)만 해설 산문의 "(A)" 라벨을 원형숫자(①②③)로 표시 변환.
  const isGrammarError = subType === "GRAMMAR_ERROR";
  const prose = (text: string) =>
    isGrammarError ? circleGrammarLabelMentions(text) : text;

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
          children: parseFormattedText(prose(trimmed), {
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
            ...parseFormattedText(prose(trimmed), {
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              color: COLOR.darkGray,
            }),
          ],
        }),
      );
    }
  }

  // 오답 분석 — KO 봉투는 배열형([{label, explanation}]) 계약이라 Record 로 정규화
  // (영어 Record 형은 기존 경로 그대로. 웹 explanation-content/HWPX answer 와 동일 규약).
  const wrongRaw = safeParseJSON<unknown>(explanation.wrongOptionExplanations, {});
  const wrongExplanations: Record<string, string> = Array.isArray(wrongRaw)
    ? Object.fromEntries(
        wrongRaw
          .filter(
            (e): e is { label: string; explanation: string } =>
              !!e &&
              typeof e === "object" &&
              typeof (e as { label?: unknown }).label === "string" &&
              typeof (e as { explanation?: unknown }).explanation === "string",
          )
          .map((e) => [e.label, e.explanation]),
      )
    : ((wrongRaw ?? {}) as Record<string, string>);
  const wrongEntries = Object.entries(wrongExplanations).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  // 마커 유형(어법 등)은 선지 목록이 없어도 라벨이 지문 마커로 실재 — 오답 분석 포함.
  if (
    wrongEntries.length > 0 &&
    shouldRenderWrongAnalysisForSubtype(subType, hasOptions)
  ) {
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
              text: `${isGrammarError ? grammarMarkerDisplayLabel(label) : label} `,
              font: bodyFont,
              size: SIZE_EXPLAIN_BODY,
              bold: true,
              color: COLOR.darkGray,
            }),
            ...parseFormattedText(prose(exp.trim()), {
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
