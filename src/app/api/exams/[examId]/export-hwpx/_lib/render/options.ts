/**
 * 옵션 렌더러.
 * - 5개 + 모두 25자 미만 → 2열 정렬
 * - 그 외 → 한 줄씩
 */

import type { BlockNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import {
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
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
  const { options, subType, compact, contentWidthHpu } = opts;
  if (options.length === 0) return [];

  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  const displayTexts = options.map((o, i) =>
    optionDisplayTextForSubtype(subType, i, o.text || ""),
  );
  const maxLen = Math.max(...displayTexts.map((t) => t.length));

  // IRRELEVANT 등 본문에 박힌 마커가 답인 유형:
  // 옵션 텍스트가 마커 자체(①~⑤) 또는 비어있으면 마커만 한 줄에 가로 배치.
  const isMarkerOnly = options.every((_, i) => {
    const t = displayTexts[i].trim();
    return t === "" || t === optionOrdinalLabel(i) || /^[①②③④⑤⑥⑦⑧⑨⑩]$/.test(t);
  });
  if (isMarkerOnly) {
    const runs: RunNode[] = [];
    for (let i = 0; i < options.length; i++) {
      if (i > 0) runs.push(txt("      ", { size: bodySize }));
      runs.push(
        txt(optionOrdinalLabel(i), {
          size: bodySize,
          bold: true,
          color: COLORS.darkGray,
        }),
      );
    }
    return [
      {
        kind: "p",
        style: {
          align: "LEFT",
          leftMargin: 200,
          spaceBefore: 40,
          spaceAfter: 80,
          lineSpacingPct: 150,
        },
        runs,
      },
    ];
  }

  // 2열 정렬: 5개 + 모두 짧을 때
  if (maxLen < 25 && options.length === 5) {
    const colW = Math.floor(contentWidthHpu / 2);
    const rows = [];
    for (let i = 0; i < options.length; i += 2) {
      rows.push({
        heightHpu: 1000,
        cells: [0, 1].map((j) => {
          const idx = i + j;
          const opt = options[idx];
          if (!opt) {
            return {
              widthHpu: colW,
              heightHpu: 1000,
              vAlign: "TOP" as const,
              margins: { left: 60, right: 60, top: 40, bottom: 40 },
              blocks: [
                {
                  kind: "p" as const,
                  style: { spaceAfter: 0 },
                  runs: [txt(" ", { size: bodySize })],
                },
              ],
            };
          }
          const display = displayTexts[idx];
          return {
            widthHpu: colW,
            heightHpu: 1000,
            vAlign: "TOP" as const,
            margins: { left: 60, right: 60, top: 40, bottom: 40 },
            blocks: [
              {
                kind: "p" as const,
                style: {
                  align: "LEFT" as const,
                  leftMargin: 400,
                  indentFirst: -400,
                  spaceAfter: 0,
                  lineSpacingPct: 150,
                },
                runs: [
                  txt(`${optionOrdinalLabel(idx)}   `, {
                    size: bodySize,
                    bold: true,
                    color: COLORS.darkGray,
                  }),
                  ...parseFormattedToRuns(display, { size: bodySize }),
                ],
              },
            ],
          };
        }),
      });
    }
    return [
      {
        kind: "tbl",
        colWidthsHpu: [colW, contentWidthHpu - colW],
        rows,
      },
      { kind: "p", style: { spaceAfter: 60 }, runs: [] },
    ];
  }

  // 한 줄씩
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
      runs.push(...parseFormattedToRuns(display, { size: bodySize }));
    }
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        leftMargin: 360,
        indentFirst: -280,
        spaceAfter: 40,
        lineSpacingPct: 150,
      },
      runs,
    });
  });
  blocks.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
  return blocks;
}
