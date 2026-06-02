/**
 * 13가지 ParsedSection 타입별 렌더러.
 * DOCX 의 render-section-boxes / render-section-inline 와 동일한 시각 구조.
 */

import type { BlockNode, BorderSpec, ParagraphNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import type { ParsedSection } from "@/app/api/exams/[examId]/export-docx/_lib/types";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
const BOX: BorderSpec = { type: "SOLID", widthMm: 0.15, color: COLORS.black };
const ERROR_LEFT: BorderSpec = {
  type: "SOLID",
  widthMm: 0.6,
  color: COLORS.errorLeft,
};
const PASSAGE_BOX: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};

function labelPara(label: string): ParagraphNode {
  return {
    kind: "p",
    style: { spaceBefore: 40, spaceAfter: 40, lineSpacingPct: 130 },
    runs: [
      txt(`<${label}>`, {
        size: SIZE.body,
        bold: true,
      }),
    ],
  };
}

function bodyParas(content: string): ParagraphNode[] {
  const lines = content.split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return {
        kind: "p",
        style: {
          align: "JUSTIFY",
          spaceAfter: idx < lines.length - 1 ? 40 : 0,
          lineSpacingPct: 158,
        },
        runs: [txt(" ", { size: SIZE.body })],
      };
    }
    return {
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct: 158,
      },
      runs: parseFormattedToRuns(trimmed, { size: SIZE.body }),
    };
  });
}

function boxed(
  content: string,
  contentWidthHpu: number,
  border: BorderSpec,
  margins = { left: 240, right: 240, top: 180, bottom: 180 },
): BlockNode[] {
  return [
    {
      kind: "tbl",
      colWidthsHpu: [contentWidthHpu],
      borders: { left: border, right: border, top: border, bottom: border },
      cellMargins: margins,
      rows: [
        {
          heightHpu: 1,
          cells: [
            {
              widthHpu: contentWidthHpu,
              heightHpu: 1,
              vAlign: "TOP",
              borders: {
                left: border,
                right: border,
                top: border,
                bottom: border,
              },
              margins,
              blocks: bodyParas(content),
            },
          ],
        },
      ],
    },
    { kind: "p", style: { spaceAfter: 120 }, runs: [] },
  ];
}

// =============================================================================
// 각 섹션 타입
// =============================================================================

export function renderMarker(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  result.push(...boxed(section.content, contentWidthHpu, BOX));
  return result;
}

export function renderConditions(section: ParsedSection): BlockNode[] {
  const items = section.items ?? [];
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  for (let i = 0; i < items.length; i++) {
    result.push({
      kind: "p",
      style: {
        leftMargin: 400,
        indentFirst: -200,
        spaceAfter: 40,
        lineSpacingPct: 170,
      },
      runs: [
        txt(`${i + 1}. `, { size: SIZE.body }),
        ...parseFormattedToRuns(items[i], { size: SIZE.body }),
      ],
    });
  }
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
  return result;
}

export function renderError(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  // 왼쪽에만 빨간 두꺼운 보더
  result.push({
    kind: "tbl",
    colWidthsHpu: [contentWidthHpu],
    borders: { left: ERROR_LEFT, right: NO, top: NO, bottom: NO },
    cellMargins: { left: 240, right: 0, top: 60, bottom: 60 },
    rows: [
      {
        heightHpu: 1,
        cells: [
          {
            widthHpu: contentWidthHpu,
            heightHpu: 1,
            vAlign: "TOP",
            borders: { left: ERROR_LEFT, right: NO, top: NO, bottom: NO },
            margins: { left: 240, right: 0, top: 60, bottom: 60 },
            blocks: bodyParas(section.content),
          },
        ],
      },
    ],
  });
  result.push({ kind: "p", style: { spaceAfter: 120 }, runs: [] });
  return result;
}

export function renderSummary(
  section: ParsedSection,
  contentWidthHpu: number,
): BlockNode[] {
  const result: BlockNode[] = [];
  if (section.label) result.push(labelPara(section.label));
  result.push(...boxed(section.content, contentWidthHpu, PASSAGE_BOX));
  return result;
}

export function renderScrambled(section: ParsedSection): BlockNode[] {
  const items = section.items ?? [];
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 80, lineSpacingPct: 170, indentFirst: 0 },
      runs: items.flatMap<RunNode>((w, i) => [
        ...(i > 0 ? [txt(" / ", { size: SIZE.body, color: COLORS.gray })] : []),
        txt(w, { size: SIZE.body, bold: true }),
      ]),
    },
  ];
}

export function renderTarget(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 60 },
      runs: parseFormattedToRuns(section.content, {
        size: SIZE.body,
        bold: true,
      }),
    },
  ];
}

export function renderContext(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    ...bodyParas(section.content),
    { kind: "p", style: { spaceAfter: 80 }, runs: [] },
  ];
}

export function renderParagraphs(section: ParsedSection): BlockNode[] {
  const items = section.items ?? section.content.split("\n");
  // SENTENCE_ORDER (A)/(B)/(C) 문단: 마커는 DOCX/미리보기와 동일하게 검정.
  return items.map<ParagraphNode>((line) => ({
    kind: "p",
    style: {
      align: "JUSTIFY",
      leftMargin: 200,
      spaceAfter: 60,
      lineSpacingPct: 158,
    },
    runs: parseFormattedToRuns(line, { size: SIZE.body }, { markerColor: COLORS.black }),
  }));
}

export function renderBlanks(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 80 },
      runs: parseFormattedToRuns(section.content, { size: SIZE.body }),
    },
  ];
}

export function renderHint(section: ParsedSection): BlockNode[] {
  return [
    ...(section.label ? [labelPara(section.label)] : []),
    {
      kind: "p",
      style: { spaceAfter: 60, leftMargin: 200 },
      runs: parseFormattedToRuns(section.content, {
        size: SIZE.body,
        color: COLORS.gray,
        italic: true,
      }),
    },
  ];
}

export function renderMatchType(section: ParsedSection): BlockNode[] {
  // DOCX 와 동일하게 우측 정렬 · lightGray · 8pt.
  return [
    {
      kind: "p",
      style: { align: "RIGHT", spaceAfter: 60 },
      runs: [
        txt(`[유형: ${section.content}]`, {
          size: SIZE.continued,
          color: COLORS.lightGray,
        }),
      ],
    },
  ];
}

export function renderFallback(section: ParsedSection): BlockNode[] {
  return [
    {
      kind: "p",
      style: { leftMargin: 200, spaceAfter: 40, lineSpacingPct: 158 },
      runs: parseFormattedToRuns(section.content, { size: SIZE.body }),
    },
  ];
}

export function renderDirection(
  section: ParsedSection,
  orderNum: number,
  points: number,
  subTypeLabel: string,
  showMeta: boolean,
  compact: boolean,
): BlockNode[] {
  const qNumSize = compact ? SIZE.qNumCompact : SIZE.qNum;
  const headerRuns: RunNode[] = [
    txt(`${orderNum}. `, {
      size: qNumSize,
      bold: true,
      color: COLORS.black,
    }),
  ];
  if (showMeta) {
    const meta = subTypeLabel ? `[${points}점 · ${subTypeLabel}]` : `[${points}점]`;
    headerRuns.push(
      txt("  ", { size: qNumSize }),
      txt(meta, {
        size: SIZE.meta,
        color: COLORS.gray,
      }),
    );
  }
  headerRuns.push(
    ...parseFormattedToRuns(section.content, {
      size: compact ? SIZE.bodyCompact : SIZE.body,
      bold: true,
    }),
  );
  return [
    {
      kind: "p",
      style: { spaceBefore: 80, spaceAfter: 100, lineSpacingPct: 158 },
      runs: headerRuns,
    },
  ];
}
