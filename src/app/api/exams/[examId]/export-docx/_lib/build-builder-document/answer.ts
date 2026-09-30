import { Paragraph, TableCell, TableRow, TextRun } from "docx";
import { circleGrammarLabelMentions, grammarMarkerDisplayLabel, shouldRenderWrongAnalysisForSubtype } from "@/components/exams/paper-builder/option-display";
import {
  explanationContentLines,
  hasVisibleExplanationText,
  parseExplanationInline,
} from "@/components/exams/paper-builder/explanation-markdown";
import { thinBox } from "../borders";
import { safeParseJSON } from "../helpers";
import { parseFormattedText } from "../parse-formatted-text";
import { COLOR, FONT } from "../styles";
import { bridgeKeep, docxKeep } from "../keep-policy";
import { gridCellWidth, gridTable, tableGrid } from "../table-geometry";
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
  /** 정답 배지 표가 들어갈 단 폭(DXA) — builderPageGeometry(layout).bodyColumnWidthDxa. */
  widthDxa: number;
}): DocChild[] {
  const sections: DocChild[] = []; // 해설 구역들(각 구역은 라벨로 시작)
  const { correctAnswer, explanation, hasOptions, subType, widthDxa } = opts;
  // 어법(GRAMMAR_ERROR)만 해설 산문의 "(A)" 라벨을 원형숫자(①②③)로 표시 변환.
  const isGrammarError = subType === "GRAMMAR_ERROR";
  const prose = (text: string) =>
    isGrammarError ? circleGrammarLabelMentions(text) : text;

  const answerText = (correctAnswer || "").trim();
  const answerLabel = hasOptions ? "정답" : "정답:";

  // 정답 배지 (얇은 검정 박스, 약간 연한 배경) — 역할 badge(keep-policy.ts): 행 cantSplit + 행 문단 keepLines,
  // 뒤에 해설 라벨이 있으면 keepNext(표 → 간격 문단 → 「해설」 → 첫 줄이 한 단). HWPX renderAnswerBlock 의
  // 역할 표와 같은 규칙(HW-2). 앞 선지 묶음과는 잇지 않는다 — keep-policy.ts 「의도된 차이」.
  const grid = tableGrid(widthDxa, [1]);
  const badge = (hasNext: boolean) =>
    gridTable(grid, {
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              borders: thinBox(COLOR.darkGray, 4),
              shading: { fill: "F5F5F5" },
              margins: { top: 80, bottom: 80, left: 160, right: 160 },
              width: gridCellWidth(grid, 0),
              children: [
                new Paragraph({
                  spacing: { after: 0 },
                  ...docxKeep("badge", { hasNext }),
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
    });
  // 배지 ↔ 해설 사이 간격 문단 — 해설이 있으면 사슬을 잇는다(bridgeKeep).
  const badgeGap = (hasNext: boolean) => new Paragraph({ spacing: { after: 80 }, ...bridgeKeep(hasNext) });

  if (!explanation) return [badge(false), badgeGap(false)];
  // 해설 라벨(「해설」·「핵심 포인트」·「오답 분석」) = caption — 단 바닥에 라벨만 남지 않게(HW-2).
  const captionKeep = docxKeep("caption", { hasNext: true });

  // 해설 — 줄머리 「- 」 는 글머리(•) 줄, `**` 는 굵게(웹 PDF 해설과 같은 explanation-markdown 규칙)
  const explanationContent = (explanation.content || "").trim();
  if (explanationContent) {
    sections.push(
      new Paragraph({
        spacing: { before: 40, after: 40 },
        indent: { left: 80 },
        ...captionKeep,
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
    for (const line of explanationContentLines(explanationContent)) {
      const runs = explanationRuns(prose(line.text), COLOR.darkGray);
      if (!runs) continue;
      sections.push(line.bullet ? bulletParagraph(runs) : textParagraph(runs));
    }
  }

  // 핵심 포인트 — 문자열 항목만(웹 explanation-content 와 같은 거르기). 라벨은 그릴 항목이 있을 때만.
  const keyPointsRaw = safeParseJSON<unknown>(explanation.keyPoints, []);
  const keyPoints = (Array.isArray(keyPointsRaw) ? keyPointsRaw : []).filter(
    (kp): kp is string => typeof kp === "string" && kp.trim().length > 0,
  );
  if (keyPoints.length > 0) {
    sections.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        indent: { left: 80 },
        ...captionKeep,
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
      const runs = explanationRuns(prose(kp.trim()), COLOR.darkGray);
      if (runs) sections.push(bulletParagraph(runs));
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
    sections.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        indent: { left: 80 },
        ...captionKeep,
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
      sections.push(
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
            ...(explanationRuns(prose(exp.trim()), COLOR.gray) ?? []),
          ],
        }),
      );
    }
  }

  // 해설 구역이 있으면 배지 → 간격 → 첫 라벨 → 첫 줄이 한 사슬.
  const hasExplanationSections = sections.length > 0;
  return [
    badge(hasExplanationSections),
    badgeGap(hasExplanationSections),
    ...sections,
    new Paragraph({ spacing: { after: 120 } }),
  ];
}

/**
 * 해설 한 줄 → 런. 마크다운(`**굵게**` · 백틱 · 보이지 않는 끊김 문자)은 웹과 같은 explanation-markdown
 * 규칙으로 먼저 풀고, 조각마다 기존 서식(parseFormattedText — 원문자 · (A) 마커 · 밑줄 · 빈칸)을 입힌다.
 * 굵은 조각은 웹 <strong>(text-slate-700)처럼 진회색 굵게. 보이는 글자가 없으면 null(그 줄은 그리지 않는다).
 */
function explanationRuns(text: string, color: string): TextRun[] | null {
  const segments = parseExplanationInline(text);
  if (!hasVisibleExplanationText(segments)) return null;
  const base = { font: bodyFont, size: SIZE_EXPLAIN_BODY, color };
  return segments.flatMap((segment) =>
    parseFormattedText(segment.text, segment.bold ? { ...base, bold: true, color: COLOR.darkGray } : base),
  );
}

/** 해설 문단 줄. */
function textParagraph(runs: TextRun[]): Paragraph {
  return new Paragraph({
    spacing: { after: 40, line: 290 },
    indent: { left: 200 },
    children: runs,
  });
}

/** 글머리(•) 줄 — 핵심 포인트와 해설 본문의 「- 」 줄이 같은 모양(웹 bullet 행). */
function bulletParagraph(runs: TextRun[]): Paragraph {
  return new Paragraph({
    spacing: { after: 40, line: 280 },
    indent: { left: 280, hanging: 160 },
    children: [
      new TextRun({
        text: "• ",
        font: bodyFont,
        size: SIZE_EXPLAIN_BODY,
        color: COLOR.gray,
      }),
      ...runs,
    ],
  });
}
