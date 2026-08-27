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
 * 선지 매달림 들여쓰기(hanging indent) 폭 — 원문자 마커 + 뒤따르는 두 칸 공백의 실제 폭.
 *
 * 한컴 PDF 실측(8.5pt 선지): 마커 "①" 시작 x=32.3pt, 본문 "exert" 시작 x=49.2pt →
 * 마커+공백 = 16.9pt = 글자 크기의 1.99배. 매달림 폭은 글자 크기에 비례한다.
 * 1 pt = 100 HPUNIT 이므로 pt × 200 = 2.0em 에 해당하는 HPU 다.
 *
 * ─── 한컴의 들여쓰기 해석 (실측 확정 — CSS 와 다르다. 재발 금지) ────────────────
 * 한컴은 `hc:left`(leftMargin)/`hc:intent`(indentFirst)를 이렇게 그린다:
 *     첫 줄       = leftMargin
 *     이어지는 줄 = leftMargin + |indentFirst|
 * 즉 **음수 intent 가 첫 줄을 왼쪽으로 당기는 게 아니라, 이어지는 줄을 오른쪽으로 민다.**
 * 2개 데이터포인트로 검증했다(본문 칸 왼쪽 = x 26.6pt 기준):
 *     L=560,  I=-560   → 첫 줄 5.7pt / 이어줄 11.2pt   (예측 5.6 / 11.2)
 *     L=1700, I=-1700  → 첫 줄 17.1pt / 이어줄 34.0pt  (예측 17 / 34)
 * 그래서 "마커는 칸 왼쪽에 붙이고 이어지는 줄만 본문 컬럼에 맞추려면"
 *     leftMargin = 0, indentFirst = -HANG
 * 이어야 한다. 예전 값(L=560, I=-560)은 이어줄을 겨우 11.2pt 밀어 본문 컬럼(16.9pt)과
 * 5.7pt 어긋났고, 그래서 선지 두 번째 줄이 원문자 아래로 흘러내려 보였다.
 */
export function optionHangingIndentHpu(bodySizePt: number): number {
  return Math.round(bodySizePt * 200);
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
  /**
   * 선지 문단의 매달림 폭(HPU). **호출자가 자기 선지 글자 크기로 계산해 넘겨야 한다.**
   * 여기서 자체 추정하면 호출자와 어긋난다 — fragment.ts 는 선지를 SIZE.body(9pt)로,
   * options.ts 는 SIZE.options(8.5pt)로 그려서 매달림 폭이 1800 vs 1700 으로 갈린다.
   * 미지정 시에는 options.ts 기준으로 폴백한다(기존 호출부 무회귀).
   */
  hangIndentHpu?: number;
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
      // 선지 값이 시작하는 텍스트 컬럼(마커 뒤)에 맞춰 시작한다 — 호출자의 선지 문단
      // 매달림 폭과 반드시 같은 값이어야 헤더와 값 열이 어긋나지 않는다.
      leftMargin: opts.hangIndentHpu ?? optionHangingIndentHpu(bodySize),
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
  const headerBlock = multiBlankOptionsHeaderBlock({
    options,
    subType,
    compact,
    hangIndentHpu: optionHangingIndentHpu(bodySize),
  });
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
        // 한컴은 "첫 줄 = leftMargin, 이어줄 = leftMargin + |indentFirst|" 로 그린다
        // (실측 근거는 optionHangingIndentHpu 주석). 마커를 칸 왼쪽에 붙이고 이어지는
        // 줄만 본문 컬럼에 맞추려면 leftMargin 은 0 이어야 한다.
        leftMargin: 0,
        indentFirst: -optionHangingIndentHpu(bodySize),
        spaceAfter: 40,
        lineSpacingPct: compact ? 146 : 158,
      },
      runs,
    });
  });
  blocks.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
  return blocks;
}
