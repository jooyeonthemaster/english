/**
 * 정답표 — 시험지 뒤에 붙는 밴드형 표(스펙 §4).
 *
 *   | 문항 | 1 | 2 | 3 | … | 10 |   ← 라벨 셀 음영(COLORS.answerBg)
 *   | 정답 | 5 | 3 | 5 | … | 2  |
 *
 * 한 밴드 = 2행(문항 번호 행 + 정답 행), 밴드당 10문항. 마지막 밴드는 남은 문항
 * 수만큼만 열을 만든다(빈 칸을 그리지 않는다).
 *
 * 한컴 제약(실측 확정 — 재실험 불필요):
 *  - P10: 예전 "문항 / 정답" 머리 셀은 칸 폭(약 54pt)에서 2줄로 터졌다.
 *    → 머리 행을 없애고 그 라벨을 각 행 맨 앞 셀로 옮겼다. 이 표는 1단 전체폭
 *      정답표 구역에서 그리는 것을 전제로 폭을 계산한다.
 *  - P11(=§7-1): "윗변만 있는 표"(부분 보더)는 한컴이 옅은 파란 빈 박스로 덧그린다.
 *    → 표 위 굵은 구분선 블록을 삭제했고, 모든 셀은 네 변 동일한 얇은 선만 쓴다.
 *  - 열 폭 합이 표 폭(hp:sz width = colWidthsHpu 합)과 어긋나면 한컴이 열 폭을
 *    제멋대로 재분배한다. → 마지막 문항 열이 나머지를 흡수해 합을 contentWidthHpu 에
 *    정확히 맞춘다.
 */

import type { BlockNode, BorderSpec, TableNode, TableCellNode, TableRowNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { mm } from "../units";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

// 표 전체가 쓰는 단 하나의 보더. 부분 보더(윗변만/아랫변만)는 금지(§7-1).
const THIN: BorderSpec = {
  type: "SOLID",
  widthMm: 0.15,
  color: COLORS.darkGray,
};

/** 한 밴드에 담는 문항 수. */
const BAND_SIZE = 10;
/** 라벨 열("문항"/"정답") 폭 = max(14mm, 전체폭의 10%). */
const LABEL_COL_MIN_MM = 14;
const LABEL_COL_RATIO = 0.1;
/** 밴드 행 높이(내용이 더 높으면 section-xml 의 실측이 알아서 키운다). */
const BAND_ROW_H = 780;
/** 라벨 글자 크기(pt). 숫자·정답은 SIZE.answerValue(11pt). */
const LABEL_PT = 10;
/** 셀 안쪽 여백. 문항 열이 좁으므로 최소로 둔다. */
const CELL_MARGINS: { left: number; right: number; top: number; bottom: number } = {
  left: 60,
  right: 60,
  top: 60,
  bottom: 60,
};
/** 정답이 이보다 길면 밴드 열에서 세로로 터지므로 번호 목록으로 폴백한다. */
const LONG_ANSWER_CHARS = 20;

export function renderAnswerKey(
  questions: ExamQuestionData[],
  contentWidthHpu: number,
  opts?: { pageBreak?: boolean },
): BlockNode[] {
  if (!questions.length) return [];

  // 입력은 라우트에서 이미 orderNum 순으로 오지만, 밴드 배치가 순서에 전적으로
  // 의존하므로 방어적으로 한 번 더 정렬한다.
  const ordered = [...questions].sort((a, b) => a.orderNum - b.orderNum);

  const result: BlockNode[] = [];

  // 제목 "정 답 표" (DOCX 28 half-pt = 14pt).
  // 상단 구분선 표(P11)를 삭제했으므로 opts.pageBreak 는 이제 이 제목 문단이 싣는다
  // — "첫 블록에 pageBreak" 계약은 그대로다. 정답표를 별도 구역으로 뽑은 호출자는
  // false 를 넘기면 된다(새 구역은 언제나 새 쪽에서 시작한다 — P2).
  result.push({
    kind: "p",
    pageBreak: opts?.pageBreak ?? false,
    style: {
      align: "CENTER",
      spaceBefore: 80,
      spaceAfter: 100,
      lineSpacingPct: 130,
    },
    runs: [
      txt("정 답 표", {
        size: 14,
        bold: true,
        color: COLORS.black,
      }),
    ],
  });

  // 서술형 등 긴 정답이 섞이면 좁은 밴드 열에서 한 글자씩 세로로 터진다.
  // DOCX 와 동일하게 가장 긴 정답이 20자를 넘으면 전체폭 번호 목록으로 렌더한다.
  const maxAnswerLen = ordered.reduce(
    (max, eq) => Math.max(max, answerTextForQuestion(eq).length),
    0,
  );
  if (maxAnswerLen > LONG_ANSWER_CHARS) {
    for (const eq of ordered) {
      result.push({
        kind: "p",
        style: {
          // 한컴은 "첫 줄 = leftMargin, 이어줄 = leftMargin + |indentFirst|" 로 그린다
          // (실측 근거: render/options.ts 의 optionHangingIndentHpu 주석).
          // 예전 값(2100/-2100)은 첫 줄을 21pt 들여쓰고 이어줄을 42pt 로 밀어, 번호가
          // 왼쪽에 붙지 않고 목록 전체가 어긋났다. 번호를 왼쪽에 붙이고 이어지는 줄만
          // 정답 텍스트 컬럼("13. " ≈ 21pt)에 맞추려면 leftMargin 은 0 이어야 한다.
          leftMargin: 0,
          indentFirst: -2100, // hanging 21pt ≈ "NN. " 폭(DOCX 420 dxa × 5 과 동일)
          spaceBefore: 30,
          spaceAfter: 30,
          lineSpacingPct: 150,
        },
        runs: [
          txt(`${eq.orderNum}. `, { size: SIZE.answerValue, bold: true, color: COLORS.darkGray }),
          txt(answerTextForQuestion(eq) || " ", {
            size: SIZE.answerValue,
            color: COLORS.black,
          }),
        ],
      });
    }
    result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
    return result;
  }

  // 밴드 렌더. 밴드 사이는 작은 빈 문단으로 띄운다.
  for (let start = 0; start < ordered.length; start += BAND_SIZE) {
    const band = ordered.slice(start, start + BAND_SIZE);
    if (start > 0) {
      result.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
    }
    result.push(buildBandTable(band, contentWidthHpu));
  }
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });

  return result;
}

/**
 * 밴드 하나(문항 count 개)의 열 폭.
 * [라벨 열, 문항 열 × count] 이고 합계는 정확히 contentWidthHpu 다.
 *  - 라벨 열 = max(mm(14), floor(전체폭 × 10%)). 다만 극단적으로 좁은 폭이 들어와도
 *    문항 열이 음수가 되지 않도록 전체폭의 절반으로 클램프한다(방어).
 *  - 문항 열은 균등 분할(floor)하고 마지막 열이 나머지를 흡수한다.
 *    base = floor(rest/count) ≤ rest/count 이므로 base×(count−1) ≤ rest → 마지막 열 ≥ 0.
 */
function bandColumnWidths(contentWidthHpu: number, count: number): number[] {
  const rawLabel = Math.max(
    mm(LABEL_COL_MIN_MM),
    Math.floor(contentWidthHpu * LABEL_COL_RATIO),
  );
  const labelW = Math.max(1, Math.min(rawLabel, Math.floor(contentWidthHpu / 2)));
  const rest = Math.max(0, contentWidthHpu - labelW);

  // 열 폭은 **언제나 꽉 찬 밴드(BAND_SIZE)** 기준으로 잡는다. 마지막 밴드가 3문항뿐이라고
  // 그 3칸으로 전체폭을 나누면 칸이 윗밴드의 3배로 벌어져 표가 어긋나 보인다(실측).
  // 부분 밴드는 표 자체가 좁아지고 왼쪽에 붙어 윗밴드와 열이 정확히 맞는다.
  const base = Math.floor(rest / BAND_SIZE);

  const widths: number[] = [labelW];
  if (count >= BAND_SIZE) {
    // 꽉 찬 밴드: 마지막 열이 나머지를 흡수해 합 = contentWidthHpu 를 정확히 맞춘다
    // (합이 어긋나면 한컴이 열 폭을 제멋대로 재분배한다).
    for (let i = 0; i < count - 1; i++) widths.push(base);
    widths.push(rest - base * (count - 1));
  } else {
    for (let i = 0; i < count; i++) widths.push(base);
  }
  return widths;
}

/** 밴드 표(2행: 문항 번호 / 정답). */
function buildBandTable(band: ExamQuestionData[], contentWidthHpu: number): TableNode {
  const widths = bandColumnWidths(contentWidthHpu, band.length);
  const numberRow = buildBandRow(
    "문항",
    widths,
    band.map((eq) => ({ text: String(eq.orderNum), color: COLORS.darkGray })),
  );
  const answerRow = buildBandRow(
    "정답",
    widths,
    band.map((eq) => ({
      text: answerTextForQuestion(eq) || " ",
      color: COLORS.black,
    })),
  );

  return {
    kind: "tbl",
    colWidthsHpu: widths,
    // 외곽도 셀과 같은 얇은 선. 네 변 동일(§7-1).
    borders: { left: THIN, right: THIN, top: THIN, bottom: THIN },
    cellMargins: { ...CELL_MARGINS },
    rows: [numberRow, answerRow],
  };
}

/** 밴드의 한 행: 라벨 셀(음영) + 값 셀들. 모두 가로·세로 가운데 정렬. */
function buildBandRow(
  label: string,
  widths: number[],
  values: Array<{ text: string; color: string }>,
): TableRowNode {
  const cells: TableCellNode[] = [
    bandCell(widths[0], label, {
      size: LABEL_PT,
      color: COLORS.darkGray,
      fill: COLORS.answerBg,
    }),
  ];
  values.forEach((v, i) => {
    cells.push(
      bandCell(widths[i + 1], v.text, {
        size: SIZE.answerValue,
        color: v.color,
      }),
    );
  });
  return { heightHpu: BAND_ROW_H, cells };
}

function bandCell(
  widthHpu: number,
  text: string,
  style: { size: number; color: string; fill?: string },
): TableCellNode {
  return {
    widthHpu,
    heightHpu: BAND_ROW_H,
    vAlign: "CENTER",
    // 네 변 동일한 얇은 선만 쓴다(부분 보더 금지 — 옅은 파란 빈 박스 아티팩트).
    borders: {
      left: THIN,
      right: THIN,
      top: THIN,
      bottom: THIN,
      ...(style.fill ? { fillColor: style.fill } : {}),
    },
    margins: { ...CELL_MARGINS },
    blocks: [
      {
        kind: "p",
        style: { align: "CENTER", spaceAfter: 0 },
        runs: [txt(text, { size: style.size, bold: true, color: style.color })],
      },
    ],
  };
}

function answerTextForQuestion(eq: ExamQuestionData): string {
  return formatStoredQuestionCorrectAnswer(eq.question);
}
