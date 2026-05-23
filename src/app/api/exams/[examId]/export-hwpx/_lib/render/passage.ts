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
const BOX_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};
const UNDERLINE_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.22,
  color: COLORS.darkGray,
};

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
  const lines = content.split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return {
        kind: "p",
        style: {
          align: "JUSTIFY",
          spaceAfter: idx < lines.length - 1 ? 40 : 0,
          lineSpacingPct: 160,
        },
        runs: [txt(" ", { size: bodySize })],
      };
    }
    return {
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct: 160,
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
        cellMargins: { left: 240, right: 240, top: 180, bottom: 180 },
        rows: [
          {
            heightHpu: 1500,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 1500,
                vAlign: "TOP",
                borders: {
                  left: BOX_BORDER,
                  right: BOX_BORDER,
                  top: BOX_BORDER,
                  bottom: BOX_BORDER,
                },
                margins: { left: 240, right: 240, top: 180, bottom: 180 },
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
        cellMargins: { left: 0, right: 0, top: 150, bottom: 150 },
        rows: [
          {
            heightHpu: 1500,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 1500,
                vAlign: "TOP",
                borders: {
                  left: NO,
                  right: NO,
                  top: UNDERLINE_BORDER,
                  bottom: UNDERLINE_BORDER,
                },
                margins: { left: 0, right: 0, top: 150, bottom: 150 },
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
