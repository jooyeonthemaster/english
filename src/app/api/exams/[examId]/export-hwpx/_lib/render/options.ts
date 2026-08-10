/**
 * 옵션 렌더러.
 * - 미리보기(A4PaperPage)와 같이 모든 선지를 한 줄씩 세로 배치한다.
 */

import type { BlockNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import {
  multiBlankHeaderLabels,
  multiBlankOptionMatrix,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";

export interface ParsedOption {
  label: string;
  text: string;
}

/**
 * 다중 빈칸(BLANK_INFERENCE) 조합 선지의 (A)/(B)/(C) 컬럼 헤더 라인.
 * HTML 미리보기의 컬럼 헤더 그리드를 텍스트 문단으로 근사한다(공백 패딩 —
 * 비례 글꼴이라 근사 정렬, 텍스트 표면 허용 오차). 선지 문단과 같은 문단
 * 스타일(줄간격·spaceAfter)이라 미리보기 pagination 이 첫 선지 블록에 예약한
 * 헤더 행 높이(pagination-metrics.multiBlankOptionsHeaderHeight)와 실높이가 맞는다.
 * 다중 빈칸이 아니면 null(단일 빈칸·타 유형 무영향).
 */
export function multiBlankOptionsHeaderBlock(opts: {
  options: ParsedOption[];
  subType: string | null | undefined;
  compact: boolean;
}): BlockNode | null {
  const { options, subType, compact } = opts;
  if (subType !== "BLANK_INFERENCE") return null;
  const matrix = multiBlankOptionMatrix(options);
  if (!matrix) return null;
  const bodySize = compact ? SIZE.optionsCompact : SIZE.options;
  const labels = multiBlankHeaderLabels(matrix.blankCount);
  const SEPARATOR_CHARS = 6; // " …… " 어림 폭
  let header = "";
  labels.forEach((label, c) => {
    const colWidth = Math.max(
      label.length,
      ...matrix.rows.map((row) => row.values[c]?.length ?? 0),
    );
    const lead = Math.max(0, Math.floor((colWidth - label.length) / 2));
    header += " ".repeat(lead) + label;
    if (c < labels.length - 1) {
      header += " ".repeat(
        Math.max(2, colWidth - label.length - lead + SEPARATOR_CHARS),
      );
    }
  });
  return {
    kind: "p",
    style: {
      align: "LEFT",
      // 선지 값이 시작하는 텍스트 컬럼(번호 뒤 560hpu)에 맞춰 시작한다.
      leftMargin: 560,
      spaceAfter: 40,
      lineSpacingPct: compact ? 146 : 158,
    },
    runs: [txt(header, { size: bodySize, bold: true, color: COLORS.darkGray })],
  };
}

export function renderOptions(opts: {
  options: ParsedOption[];
  subType: string | null | undefined;
  compact: boolean;
  contentWidthHpu: number;
}): BlockNode[] {
  const { options, subType, compact } = opts;
  if (!shouldRenderOptionListForSubtype(subType)) return [];
  if (options.length === 0) return [];

  // 미리보기 선지는 본문보다 살짝 작은 11px(=8.25pt)/compact 10px(=7.5pt).
  const bodySize = compact ? SIZE.optionsCompact : SIZE.options;
  const displayTexts = options.map((o, i) =>
    optionDisplayTextForSubtype(subType, i, o.text || ""),
  );

  const blocks: BlockNode[] = [];
  // 다중 빈칸 조합 선지: 목록 위에 (A)/(B) 헤더 라인(값은 라벨 없이 원문 유지)
  const headerBlock = multiBlankOptionsHeaderBlock({ options, subType, compact });
  if (headerBlock) blocks.push(headerBlock);
  options.forEach((option, idx) => {
    const display = displayTexts[idx];
    const hasText = display.trim().length > 0;
    const runs: RunNode[] = [
      txt(optionDisplayLabel(subType, idx, option.label), {
        size: bodySize,
        bold: true,
        color: COLORS.darkGray,
      }),
    ];
    if (hasText) {
      runs.push(txt("  ", { size: bodySize }));
      // 선지 본문의 (A)~(E) 마커는 DOCX/미리보기와 동일하게 검정.
      runs.push(
        ...parseFormattedToRuns(display, { size: bodySize }, { markerColor: COLORS.black }),
      );
    }
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        // 미리보기 선지는 원문자 marker(min-w-[18px]) + gap-1.5 뒤에 텍스트가 오고,
        // 줄바꿈 시 텍스트가 marker 아래가 아니라 들여쓰기되어 정렬된다.
        leftMargin: 560,
        indentFirst: -560,
        spaceAfter: 40,
        lineSpacingPct: compact ? 146 : 158,
      },
      runs,
    });
  });
  blocks.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
  return blocks;
}
