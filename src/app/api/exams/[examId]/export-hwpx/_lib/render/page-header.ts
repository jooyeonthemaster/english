/**
 * 1페이지 상단 헤더 블록.
 * 좌측: 소제목(작게) + 큰 제목.
 * 우측: 학교 / 반 / 이름 (3행, 하단 보더로 빈칸 표시).
 * 하단에 굵은 검정 라인.
 */

import type {
  BorderSpec,
  BlockNode,
  ParagraphNode,
  TableNode,
  TableRowNode,
} from "../types";
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
// 학생정보 박스 테두리: 일관된 얇은 선(slate400). 한컴은 "아래만/부분 보더" 표를
// 리플로 시 기본 격자선을 덧그려 박스가 깨져 보인다(검증) → 모든 변을 동일 보더로
// 둔 "단일 표"가 깔끔하게 렌더된다.
const BOX_LINE: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.slate400,
};

// 학생정보 박스를 "단일 3×2 표"로(중첩 표 금지). 라벨 셀은 옅은 음영.
function buildInfoBox(
  rows: Array<{ label: string; value: string }>,
  rowWidth: number,
): TableNode {
  const labelW = Math.floor(rowWidth * 0.34);
  const valueW = rowWidth - labelW;
  const box = { left: BOX_LINE, right: BOX_LINE, top: BOX_LINE, bottom: BOX_LINE };
  const trs: TableRowNode[] = rows.map(({ label, value }) => ({
    heightHpu: 540,
    cells: [
      {
        widthHpu: labelW,
        heightHpu: 540,
        vAlign: "CENTER",
        borders: { ...box, fillColor: COLORS.slate50 },
        margins: { left: 100, right: 60, top: 10, bottom: 10 },
        blocks: [
          {
            kind: "p",
            style: { align: "LEFT", lineSpacingPct: 120 },
            runs: [txt(label, { size: SIZE.info, color: COLORS.darkGray })],
          },
        ],
      },
      {
        widthHpu: valueW,
        heightHpu: 540,
        vAlign: "BOTTOM",
        borders: { ...box },
        margins: { left: 60, right: 40, top: 10, bottom: 30 },
        blocks: [
          {
            kind: "p",
            style: { align: "RIGHT", lineSpacingPct: 120 },
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
  }));
  return { kind: "tbl", colWidthsHpu: [labelW, valueW], borders: box, rows: trs };
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

  // 우측: 학교/반/이름 — 단일 3×2 박스(중첩 표 금지, 일관 보더로 깔끔).
  const rightBlocks: BlockNode[] = [
    buildInfoBox(
      [
        { label: "학교", value: schoolName },
        { label: "반", value: className },
        { label: studentNameLabel || "이름", value: "" },
      ],
      rightWidth,
    ),
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

  // 머리말 하단 구분선은 두지 않는다: 한컴이 "윗변만 있는(부분 보더)" 떠있는 표를
  // 리플로 시 옅은 파랑 셀 안내선 박스로 덧그려 머리말이 깨져 보인다(검증). 제목+박스+
  // 본문 간 여백으로 충분히 구분되며, 부분 보더 표를 피해야 안내선 아티팩트가 없다.
  return [outer];
}
