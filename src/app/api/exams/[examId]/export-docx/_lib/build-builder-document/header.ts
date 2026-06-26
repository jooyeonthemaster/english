import { AlignmentType, BorderStyle, HeightRule, ImageRun, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType } from "docx";
import { NONE, bdr, noBorders } from "../borders";
import { COLOR } from "../styles";
import type { DocChild } from "../types";
import type { BuilderHeader } from "./model";
import { SIZE_INFO, SIZE_INSTRUCTIONS, SIZE_SUBTITLE, SIZE_TITLE, SIZE_TITLE_COMPACT, bodyFont } from "./sizes";
import { dataUrlToImage } from "./util";



// =============================================================================
// 페이지 헤더 (1페이지 상단)
// =============================================================================

export function buildPage1Header(
  header: BuilderHeader,
  title: string,
  compact: boolean,
): DocChild[] {
  const subtitle = header.subtitle?.trim() || "";
  const studentNameLabel = header.studentNameLabel?.trim() || "이름";
  const schoolName = header.schoolName?.trim() || "";
  const className = header.className?.trim() || "";
  const instructions = header.instructions?.trim() || "";
  const logoImg = dataUrlToImage(header.academyLogoDataUrl ?? null);

  const titleSize = compact ? SIZE_TITLE_COMPACT : SIZE_TITLE;

  // 왼쪽: [로고] + [소제목 / 큰제목]
  const leftCellChildren: Paragraph[] = [];
  if (subtitle) {
    leftCellChildren.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: subtitle.toUpperCase(),
            font: bodyFont,
            size: SIZE_SUBTITLE,
            bold: true,
            color: COLOR.gray,
            characterSpacing: 25, // 미리보기 tracking-[0.18em] @9px ≈ 1.27pt
          }),
        ],
      }),
    );
  }
  leftCellChildren.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: title,
          font: bodyFont,
          size: titleSize,
          bold: true,
          color: COLOR.black,
        }),
      ],
    }),
  );

  // 로고가 있으면 별도 셀로 분리하여 왼쪽 정렬
  const leftCells: TableCell[] = [];
  if (logoImg) {
    leftCells.push(
      new TableCell({
        borders: noBorders(),
        verticalAlign: VerticalAlign.TOP,
        width: { size: 740, type: WidthType.DXA },
        margins: { top: 0, bottom: 0, left: 0, right: 160 },
        children: [
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new ImageRun({
                data: logoImg.buffer,
                transformation: { width: 44, height: 44 },
                type: logoImg.type,
              }),
            ],
          }),
        ],
      }),
    );
  }
  leftCells.push(
    new TableCell({
      borders: noBorders(),
      verticalAlign: VerticalAlign.TOP,
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: leftCellChildren,
    }),
  );

  const leftTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: NONE, bottom: NONE, left: NONE, right: NONE,
      insideHorizontal: NONE, insideVertical: NONE,
    },
    rows: [new TableRow({ children: leftCells })],
  });

  // 오른쪽: 학교 / 반 / 이름 (각 줄에 하단 보더, 라벨 / 값)
  const rightCellChildren = buildInfoBlock({
    studentNameLabel,
    schoolName,
    className,
  });

  // 상단 박스: 좌측(소제목+제목) | 우측(학교/반/이름) — 가장 아래에 두꺼운 보더
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [6800, 2900],
    borders: {
      top: NONE, left: NONE, right: NONE,
      insideHorizontal: NONE, insideVertical: NONE,
      bottom: bdr(BorderStyle.SINGLE, 12, COLOR.black),
    },
    rows: [
      new TableRow({
        children: [
          // 상단 여백 축소(5차): 미리보기 헤더가 items-start(TOP) 이므로 BOTTOM→TOP 으로
          // 바꿔 제목/학생정보가 위로 붙게 한다. 하단 셀 마진도 140→60 으로 축소.
          new TableCell({
            borders: { top: NONE, left: NONE, right: NONE, bottom: NONE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 60, left: 0, right: 120 },
            width: { size: 6800, type: WidthType.DXA },
            children: [leftTable],
          }),
          new TableCell({
            borders: { top: NONE, left: NONE, right: NONE, bottom: NONE },
            verticalAlign: VerticalAlign.TOP,
            margins: { top: 0, bottom: 60, left: 120, right: 0 },
            width: { size: 2900, type: WidthType.DXA },
            children: rightCellChildren,
          }),
        ],
      }),
    ],
  });

  const result: DocChild[] = [headerTable];

  // 안내문 + 날짜 줄
  if (instructions) {
    result.push(
      new Paragraph({
        spacing: { before: 60, after: 120 },
        children: [
          new TextRun({
            text: instructions,
            font: bodyFont,
            size: SIZE_INSTRUCTIONS,
            color: COLOR.gray,
          }),
        ],
      }),
    );
  } else {
    result.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  }

  return result;
}

function buildInfoBlock(opts: {
  studentNameLabel: string;
  schoolName: string;
  className: string;
}): DocChild[] {
  const { studentNameLabel, schoolName, className } = opts;

  const rowsData: Array<{ label: string; value: string }> = [
    { label: "학교", value: schoolName },
    { label: "반", value: className },
    { label: studentNameLabel || "이름", value: "" },
  ];

  const rows = rowsData.map(
    (row) =>
      new TableRow({
        height: { value: 220, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            borders: {
              top: NONE, left: NONE, right: NONE,
              bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            },
            width: { size: 30, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 10, bottom: 30, left: 0, right: 80 },
            children: [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: row.label,
                    font: bodyFont,
                    size: SIZE_INFO,
                    color: COLOR.darkGray,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: {
              top: NONE, left: NONE, right: NONE,
              bottom: bdr(BorderStyle.SINGLE, 4, COLOR.lightGray),
            },
            width: { size: 70, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { top: 10, bottom: 30, left: 0, right: 0 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new TextRun({
                    text: row.value || " ",
                    font: bodyFont,
                    size: SIZE_INFO,
                    bold: Boolean(row.value),
                    color: COLOR.black,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
  );

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: NONE, bottom: NONE, left: NONE, right: NONE,
        insideHorizontal: NONE, insideVertical: NONE,
      },
      rows,
    }),
  ];
}
