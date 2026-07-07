/**
 * 정답·해설 블록 (해설 포함 다운로드 모드).
 * - 정답 박스 (얇은 보더, 연한 배경)
 * - 해설 본문
 * - 핵심 포인트 리스트
 * - 오답 분석 (선택 라벨별)
 */

import type { BlockNode, BorderSpec, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import { circleGrammarLabelMentions, grammarMarkerDisplayLabel, shouldRenderWrongAnalysisForSubtype } from "@/components/exams/paper-builder/option-display";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const THIN_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};

function safeJSONParse<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface AnswerBlockOptions {
  correctAnswer: string;
  explanation: ExamQuestionData["question"]["explanation"];
  hasOptions: boolean;
  contentWidthHpu: number;
  /** 마커 유형 오답분석 게이트 + 어법 라벨 표시 변환용 (웹/DOCX 와 규약 동일) */
  subType?: string | null;
}

export function renderAnswerBlock(opts: AnswerBlockOptions): BlockNode[] {
  const { correctAnswer, explanation, hasOptions, contentWidthHpu, subType } = opts;
  const result: BlockNode[] = [];
  // 어법(GRAMMAR_ERROR)만 해설 산문의 "(A)" 라벨을 원형숫자(①②③)로 표시 변환.
  const isGrammarError = subType === "GRAMMAR_ERROR";
  const prose = (text: string) =>
    isGrammarError ? circleGrammarLabelMentions(text) : text;
  const answerText = (correctAnswer || "").trim();
  const answerLabel = hasOptions ? "정답" : "정답:";

  // 정답 배지
  result.push({
    kind: "tbl",
    colWidthsHpu: [contentWidthHpu],
    borders: {
      left: THIN_BORDER,
      right: THIN_BORDER,
      top: THIN_BORDER,
      bottom: THIN_BORDER,
      fillColor: COLORS.answerBg,
    },
    cellMargins: { left: 240, right: 240, top: 120, bottom: 120 },
    rows: [
      {
        heightHpu: 1200,
        cells: [
          {
            widthHpu: contentWidthHpu,
            heightHpu: 1200,
            vAlign: "CENTER",
            borders: {
              left: THIN_BORDER,
              right: THIN_BORDER,
              top: THIN_BORDER,
              bottom: THIN_BORDER,
              fillColor: COLORS.answerBg,
            },
            margins: { left: 240, right: 240, top: 120, bottom: 120 },
            blocks: [
              {
                kind: "p",
                style: { spaceAfter: 0 },
                runs: [
                  txt(`${answerLabel}  `, {
                    size: SIZE.answerLabel,
                    bold: true,
                    color: COLORS.darkGray,
                  }),
                  txt(answerText || " ", {
                    size: SIZE.answerValue,
                    bold: true,
                    color: COLORS.black,
                  }),
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });

  if (!explanation) return result;

  // 해설
  const content = (explanation.content || "").trim();
  if (content) {
    result.push({
      kind: "p",
      style: { spaceBefore: 40, spaceAfter: 40, leftMargin: 80 },
      runs: [
        txt("해설", {
          size: SIZE.explainLabel,
          bold: true,
          color: COLORS.darkGray,
        }),
      ],
    });
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      result.push({
        kind: "p",
        style: { leftMargin: 200, spaceAfter: 40, lineSpacingPct: 158 },
        runs: parseFormattedToRuns(prose(t), {
          size: SIZE.explainBody,
          color: COLORS.darkGray,
        }),
      });
    }
  }

  // 핵심 포인트
  const keyPoints = safeJSONParse<string[]>(explanation.keyPoints, []);
  if (keyPoints.length > 0) {
    result.push({
      kind: "p",
      style: { spaceBefore: 60, spaceAfter: 40, leftMargin: 80 },
      runs: [
        txt("핵심 포인트", {
          size: SIZE.explainLabel,
          bold: true,
          color: COLORS.darkGray,
        }),
      ],
    });
    for (const kp of keyPoints) {
      const t = (kp || "").trim();
      if (!t) continue;
      const runs: RunNode[] = [
        txt("• ", { size: SIZE.explainBody, color: COLORS.gray }),
        ...parseFormattedToRuns(prose(t), {
          size: SIZE.explainBody,
          color: COLORS.darkGray,
        }),
      ];
      result.push({
        kind: "p",
        style: {
          leftMargin: 280,
          indentFirst: -160,
          spaceAfter: 40,
          lineSpacingPct: 158,
        },
        runs,
      });
    }
  }

  // 오답 분석 — KO 봉투는 배열형([{label, explanation}]) 계약이라 Record 로 정규화
  // (영어 Record 형은 기존 경로 그대로. 웹 explanation-content/DOCX answer 와 동일 규약).
  const wrongsRaw = safeJSONParse<unknown>(explanation.wrongOptionExplanations, {});
  const wrongs: Record<string, string> = Array.isArray(wrongsRaw)
    ? Object.fromEntries(
        wrongsRaw
          .filter(
            (e): e is { label: string; explanation: string } =>
              !!e &&
              typeof e === "object" &&
              typeof (e as { label?: unknown }).label === "string" &&
              typeof (e as { explanation?: unknown }).explanation === "string",
          )
          .map((e) => [e.label, e.explanation]),
      )
    : ((wrongsRaw ?? {}) as Record<string, string>);
  const wrongEntries = Object.entries(wrongs).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  );
  // 마커 유형(어법 등)은 선지 목록이 없어도 라벨이 지문 마커로 실재 — 오답 분석 포함.
  if (
    wrongEntries.length > 0 &&
    shouldRenderWrongAnalysisForSubtype(subType, hasOptions)
  ) {
    result.push({
      kind: "p",
      style: { spaceBefore: 60, spaceAfter: 40, leftMargin: 80 },
      runs: [
        txt("오답 분석", {
          size: SIZE.explainLabel,
          bold: true,
          color: COLORS.darkGray,
        }),
      ],
    });
    for (const [label, exp] of wrongEntries) {
      result.push({
        kind: "p",
        style: {
          leftMargin: 280,
          indentFirst: -200,
          spaceAfter: 40,
          lineSpacingPct: 158,
        },
        runs: [
          txt(`${isGrammarError ? grammarMarkerDisplayLabel(label) : label} `, {
            size: SIZE.explainBody,
            bold: true,
            color: COLORS.darkGray,
          }),
          ...parseFormattedToRuns(prose(exp.trim()), {
            size: SIZE.explainBody,
            color: COLORS.gray,
          }),
        ],
      });
    }
  }

  result.push({ kind: "p", style: { spaceAfter: 120 }, runs: [] });
  return result;
}
