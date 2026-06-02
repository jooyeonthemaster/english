/**
 * 옵션 렌더러.
 * - 미리보기(A4PaperPage)와 같이 모든 선지를 한 줄씩 세로 배치한다.
 */

import type { BlockNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import {
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";

export interface ParsedOption {
  label: string;
  text: string;
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
  options.forEach((_, idx) => {
    const display = displayTexts[idx];
    const hasText = display.trim().length > 0;
    const runs: RunNode[] = [
      txt(optionOrdinalLabel(idx), {
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
