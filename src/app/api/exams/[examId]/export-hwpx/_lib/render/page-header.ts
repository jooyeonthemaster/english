/**
 * 1페이지 상단 헤더 블록.
 * 좌측: 소제목(작게) + 큰 제목.
 * 우측: 학교 / 반 / 이름 (3행, 하단 보더로 빈칸 표시).
 * 하단에 굵은 검정 라인.
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
// 미리보기 헤더 구분선은 border-b (1px ≈ 0.26mm, 연한 회색)일 뿐 두꺼운 검정선이 아니다.
const THICK_BOTTOM: BorderSpec = {
  type: "SOLID",
  widthMm: 0.26,
  color: COLORS.separator,
};
const THIN_BOTTOM: BorderSpec = {
  type: "SOLID",
  widthMm: 0.2,
  color: COLORS.separator,
};

function infoRow(label: string, value: string, rowWidth: number): BlockNode {
  const labelW = Math.floor(rowWidth * 0.32);
  const valueW = rowWidth - labelW;
  return {
    kind: "tbl",
    colWidthsHpu: [labelW, valueW],
    rows: [
      {
        heightHpu: 520,
        cells: [
          {
            widthHpu: labelW,
            heightHpu: 520,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: THIN_BOTTOM },
            margins: { left: 0, right: 80, top: 10, bottom: 40 },
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
            heightHpu: 520,
            vAlign: "BOTTOM",
            borders: { left: NO, right: NO, top: NO, bottom: THIN_BOTTOM },
            margins: { left: 0, right: 0, top: 10, bottom: 40 },
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

  // 미리보기의 우측 학생 정보 박스는 w-[168px] 고정폭 ≈ 본문폭의 24%.
  const rightWidth = Math.round(contentWidthHpu * 0.24);
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

  // 헤더 행 높이 / 정렬 (5차 — 상단 여백 축소):
  // 근본 원인: 직전엔 outer 셀이 vAlign:"BOTTOM" + 강제 행높이 2500 HPU 였다.
  // 제목/학생정보가 2500 HPU 밴드의 "맨 아래"에 가라앉아 그 위로 큰 빈 띠(상단 여백)가 생겼다.
  // 미리보기 헤더는 flex items-start(=TOP 정렬)이고 밴드를 강제로 키우지 않는다.
  // → vAlign 을 TOP 으로 바꾸고, 행 높이를 내용 최소치로 낮춰 본문을 위로 끌어올린다.
  //   info 3행(각 520) = 1560 HPU 가 우측 콘텐츠라 좌측 제목이 그보다 짧으면 그에 맞춘다.
  const HEADER_ROW_H = compact ? 1500 : 1700;
  const outer: BlockNode = {
    kind: "tbl",
    colWidthsHpu: [leftWidth, rightWidth],
    borders: { left: NO, right: NO, top: NO, bottom: NO },
    rows: [
      {
        heightHpu: HEADER_ROW_H,
        cells: [
          {
            widthHpu: leftWidth,
            heightHpu: HEADER_ROW_H,
            vAlign: "TOP",
            borders: { left: NO, right: NO, top: NO, bottom: NO },
            margins: { left: 0, right: 200, top: 0, bottom: 60 },
            blocks: leftBlocks,
          },
          {
            widthHpu: rightWidth,
            heightHpu: HEADER_ROW_H,
            vAlign: "TOP",
            borders: { left: NO, right: NO, top: NO, bottom: NO },
            margins: { left: 200, right: 0, top: 0, bottom: 0 },
            blocks: rightBlocks,
          },
        ],
      },
    ],
  };

  const bottomLine: BlockNode = {
    kind: "tbl",
    colWidthsHpu: [contentWidthHpu],
    borders: { left: NO, right: NO, top: THICK_BOTTOM, bottom: NO },
    rows: [
      {
        heightHpu: 120,
        cells: [
          {
            widthHpu: contentWidthHpu,
            heightHpu: 120,
            vAlign: "CENTER",
            borders: { left: NO, right: NO, top: THICK_BOTTOM, bottom: NO },
            margins: { left: 0, right: 0, top: 0, bottom: 0 },
            blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
          },
        ],
      },
    ],
  };

  return [outer, bottomLine];
}
