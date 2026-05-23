/**
 * 1페이지 상단 헤더 블록.
 * 좌측: 소제목(작게) + 큰 제목.
 * 우측: 학교 / 반 / 이름 (3행, 하단 보더로 빈칸 표시).
 * 외곽: 하단에 굵은 검정 보더.
 */

import type { BorderSpec, BlockNode, ParagraphNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";

interface HeaderProps {
  subtitle?: string;
  title: string;
  schoolName?: string;
  className?: string;
  studentNameLabel?: string;
  compact?: boolean;
  contentWidthHpu: number;
}

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
const THICK_BOTTOM: BorderSpec = {
  type: "SOLID",
  widthMm: 0.4,
  color: COLORS.black,
};
const THIN_BOTTOM: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.lightGray,
};

function infoRow(label: string, value: string, rowWidth: number): BlockNode {
  const labelW = Math.floor(rowWidth * 0.32);
  const valueW = rowWidth - labelW;
  return {
    kind: "tbl",
    colWidthsHpu: [labelW, valueW],
    rows: [
      {
        heightHpu: 900,
        cells: [
          {
            widthHpu: labelW,
            heightHpu: 900,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: THIN_BOTTOM },
            margins: { left: 0, right: 80, top: 40, bottom: 60 },
            blocks: [
              {
                kind: "p",
                style: { align: "LEFT", lineSpacingPct: 130 },
                runs: [
                  txt(label, {
                    size: SIZE.info,
                    color: COLORS.darkGray,
                  }),
                ],
              },
            ],
          },
          {
            widthHpu: valueW,
            heightHpu: 900,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: THIN_BOTTOM },
            margins: { left: 0, right: 0, top: 40, bottom: 60 },
            blocks: [
              {
                kind: "p",
                style: { align: "RIGHT", lineSpacingPct: 130 },
                runs: [
                  txt(value || " ", {
                    size: SIZE.info,
                    bold: !!value,
                    color: COLORS.black,
                  }),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function renderPageHeader(props: HeaderProps): BlockNode[] {
  const {
    subtitle = "",
    title,
    schoolName = "",
    className = "",
    studentNameLabel = "이름",
    compact = false,
    contentWidthHpu,
  } = props;

  const titleSize = compact ? SIZE.titleCompact : SIZE.title;

  // 좌:우 = 60:40 (미리보기 비율). 컬럼 폭에 맞춰 자동 계산.
  const rightWidth = Math.round(contentWidthHpu * 0.4);
  const leftWidth = contentWidthHpu - rightWidth;

  const leftBlocks: ParagraphNode[] = [];
  if (subtitle) {
    leftBlocks.push({
      kind: "p",
      style: { align: "LEFT", spaceAfter: 80, lineSpacingPct: 130 },
      runs: [
        txt(subtitle, {
          size: SIZE.subtitle,
          bold: true,
          color: COLORS.gray,
          letterSpacing: 20,
        }),
      ],
    });
  }
  leftBlocks.push({
    kind: "p",
    style: { align: "LEFT", spaceAfter: 0, lineSpacingPct: 110 },
    runs: [
      txt(title, {
        size: titleSize,
        bold: true,
        color: COLORS.black,
      }),
    ],
  });

  // 우측: 학교/반/이름 — 3행 1표
  const rightBlocks: BlockNode[] = [
    infoRow("학교", schoolName, rightWidth),
    infoRow("반", className, rightWidth),
    infoRow(studentNameLabel || "이름", "", rightWidth),
  ];

  const outer: BlockNode = {
    kind: "tbl",
    colWidthsHpu: [leftWidth, rightWidth],
    borders: { left: NO, right: NO, top: NO, bottom: THICK_BOTTOM },
    rows: [
      {
        heightHpu: 3400,
        cells: [
          {
            widthHpu: leftWidth,
            heightHpu: 3400,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: NO },
            margins: { left: 0, right: 200, top: 100, bottom: 240 },
            blocks: leftBlocks,
          },
          {
            widthHpu: rightWidth,
            heightHpu: 3400,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: NO },
            margins: { left: 200, right: 0, top: 100, bottom: 100 },
            blocks: rightBlocks,
          },
        ],
      },
    ],
  };

  return [outer];
}
