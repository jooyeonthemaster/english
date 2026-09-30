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
import {
  explanationContentLines,
  hasVisibleExplanationText,
  parseExplanationInline,
} from "@/components/exams/paper-builder/explanation-markdown";
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

  // 정답 배지 — 단/쪽 끝에 홀로 남지 않게(뒤 해설과 한 단, 앞 선지 묶음과도 한 단 — keep-policy.ts)
  result.push({
    kind: "tbl",
    keepRole: "caption",
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

  // 해설 — 줄머리 「- 」 는 글머리(•) 줄, `**` 는 굵게(웹 PDF 해설과 같은 explanation-markdown 규칙)
  const content = (explanation.content || "").trim();
  if (content) {
    result.push({
      kind: "p",
      keepRole: "caption", // 해설 라벨 → 첫 줄 (keep-policy.ts)
      style: { spaceBefore: 40, spaceAfter: 40, leftMargin: 80 },
      runs: [
        txt("해설", {
          size: SIZE.explainLabel,
          bold: true,
          color: COLORS.darkGray,
        }),
      ],
    });
    for (const line of explanationContentLines(content)) {
      const runs = explanationRuns(prose(line.text), COLORS.darkGray);
      if (!runs) continue;
      result.push(
        line.bullet
          ? bulletParagraph(runs)
          : {
              kind: "p",
              style: { leftMargin: 200, spaceAfter: 40, lineSpacingPct: 158 },
              runs,
            },
      );
    }
  }

  // 핵심 포인트 — 문자열 항목만(웹 explanation-content 와 같은 거르기). 라벨은 그릴 항목이 있을 때만.
  const keyPointsRaw = safeJSONParse<unknown>(explanation.keyPoints, []);
  const keyPoints = (Array.isArray(keyPointsRaw) ? keyPointsRaw : []).filter(
    (kp): kp is string => typeof kp === "string" && kp.trim().length > 0,
  );
  if (keyPoints.length > 0) {
    result.push({
      kind: "p",
      keepRole: "caption",
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
      const runs = explanationRuns(prose(kp.trim()), COLORS.darkGray);
      if (runs) result.push(bulletParagraph(runs));
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
      keepRole: "caption",
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
          ...(explanationRuns(prose(exp.trim()), COLORS.gray) ?? []),
        ],
      });
    }
  }

  result.push({ kind: "p", style: { spaceAfter: 120 }, runs: [] });
  return result;
}

/**
 * 해설 한 줄 → 런. 마크다운(`**굵게**` · 백틱 · 보이지 않는 끊김 문자)은 웹과 같은 explanation-markdown
 * 규칙으로 먼저 풀고, 조각마다 기존 서식(parseFormattedToRuns — 원문자 · (A) 마커 · 밑줄 · 빈칸)을 입힌다.
 * 굵은 조각은 웹 <strong>(text-slate-700)처럼 진회색 굵게. 보이는 글자가 없으면 null(그 줄은 그리지 않는다).
 */
function explanationRuns(text: string, color: string): RunNode[] | null {
  const segments = parseExplanationInline(text);
  if (!hasVisibleExplanationText(segments)) return null;
  const base = { size: SIZE.explainBody, color };
  return segments.flatMap((segment) =>
    parseFormattedToRuns(segment.text, segment.bold ? { ...base, bold: true, color: COLORS.darkGray } : base),
  );
}

/** 글머리(•) 줄 — 핵심 포인트와 해설 본문의 「- 」 줄이 같은 모양(웹 bullet 행). */
function bulletParagraph(runs: RunNode[]): BlockNode {
  return {
    kind: "p",
    style: {
      leftMargin: 280,
      indentFirst: -160,
      spaceAfter: 40,
      lineSpacingPct: 158,
    },
    runs: [txt("• ", { size: SIZE.explainBody, color: COLORS.gray }), ...runs],
  };
}
