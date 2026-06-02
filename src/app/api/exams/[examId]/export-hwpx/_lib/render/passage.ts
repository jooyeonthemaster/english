/**
 * 지문 렌더러.
 * passageStyle: "boxed" | "underlined" | "plain"
 */

import type { BlockNode, BorderSpec, ParagraphNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import { formatSentenceInsertPassageMarkers } from "@/components/exams/paper-builder/option-display";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
// 미리보기 boxed 지문: rounded border (1px ≈ 0.26mm) + px-3 py-2 패딩.
// 테두리 색은 DOCX 골드와 동일하게 slate-400(#94A3B8).
const BOX_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.26,
  color: COLORS.slate400,
};
// underlined 지문: 위/아래 진한 회색 라인 (DOCX darkGray).
const UNDERLINE_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.26,
  color: COLORS.darkGray,
};

// 미리보기 가상 A4(760px=210mm) 스케일: 1px = 0.276316mm = 78.33 HPU.
// px-3(12px)=3.316mm → ~940HPU, py-2(8px)=2.211mm → ~627HPU
const BOX_PAD_LR = 940;
const BOX_PAD_TB = 627;

export interface PassageOptions {
  passageTitle: string;
  passageContent: string;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  compact: boolean;
  usesSentenceInsertMarkers: boolean;
  contentWidthHpu: number;
}

function makePassageParas(
  content: string,
  compact: boolean,
): ParagraphNode[] {
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  // 미리보기 본문 줄간격: comfortable leading-[1.58], compact leading-[1.46].
  const lineSpacingPct = compact ? 146 : 158;
  const lines = content.split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return {
        kind: "p",
        style: {
          align: "JUSTIFY",
          spaceAfter: idx < lines.length - 1 ? 40 : 0,
          lineSpacingPct,
        },
        runs: [txt(" ", { size: bodySize })],
      };
    }
    return {
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct,
      },
      runs: parseFormattedToRuns(trimmed, { size: bodySize }),
    };
  });
}

export function renderPassage(opts: PassageOptions): BlockNode[] {
  const {
    passageTitle,
    passageContent,
    passageStyle,
    showPassageTitle,
    compact,
    usesSentenceInsertMarkers,
    contentWidthHpu,
  } = opts;
  if (!passageContent.trim()) return [];

  const rendered = formatSentenceInsertPassageMarkers(
    passageContent,
    usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
  );
  const inner: ParagraphNode[] = [];
  if (showPassageTitle && passageTitle.trim()) {
    inner.push({
      kind: "p",
      style: { align: "LEFT", spaceAfter: 60, lineSpacingPct: 130 },
      runs: [
        txt(passageTitle.toUpperCase(), {
          size: SIZE.passageTitle,
          bold: true,
          color: COLORS.darkGray,
          letterSpacing: 20,
        }),
      ],
    });
  }
  inner.push(...makePassageParas(rendered, compact));

  if (passageStyle === "boxed") {
    return [
      {
        kind: "tbl",
        colWidthsHpu: [contentWidthHpu],
        borders: {
          left: BOX_BORDER,
          right: BOX_BORDER,
          top: BOX_BORDER,
          bottom: BOX_BORDER,
        },
        cellMargins: { left: BOX_PAD_LR, right: BOX_PAD_LR, top: BOX_PAD_TB, bottom: BOX_PAD_TB },
        rows: [
          {
            heightHpu: 1,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 1,
                vAlign: "TOP",
                borders: {
                  left: BOX_BORDER,
                  right: BOX_BORDER,
                  top: BOX_BORDER,
                  bottom: BOX_BORDER,
                },
                margins: { left: BOX_PAD_LR, right: BOX_PAD_LR, top: BOX_PAD_TB, bottom: BOX_PAD_TB },
                blocks: inner,
              },
            ],
          },
        ],
      },
      { kind: "p", style: { spaceAfter: 120 }, runs: [] },
    ];
  }

  if (passageStyle === "underlined") {
    return [
      {
        kind: "tbl",
        colWidthsHpu: [contentWidthHpu],
        borders: {
          left: NO,
          right: NO,
          top: UNDERLINE_BORDER,
          bottom: UNDERLINE_BORDER,
        },
        cellMargins: { left: 0, right: 0, top: BOX_PAD_TB, bottom: BOX_PAD_TB },
        rows: [
          {
            heightHpu: 1,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 1,
                vAlign: "TOP",
                borders: {
                  left: NO,
                  right: NO,
                  top: UNDERLINE_BORDER,
                  bottom: UNDERLINE_BORDER,
                },
                margins: { left: 0, right: 0, top: BOX_PAD_TB, bottom: BOX_PAD_TB },
                blocks: inner,
              },
            ],
          },
        ],
      },
      { kind: "p", style: { spaceAfter: 120 }, runs: [] },
    ];
  }

  // plain
  return [...inner, { kind: "p", style: { spaceAfter: 120 }, runs: [] }];
}
