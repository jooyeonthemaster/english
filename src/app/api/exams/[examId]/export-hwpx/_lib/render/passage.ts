/**
 * 지문 렌더러.
 * passageStyle: "boxed" | "underlined" | "plain"
 */

import type { BlockNode, ParagraphNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE } from "../tokens";
import { parseFormattedToRuns } from "../format";
import { formatSentenceInsertPassageMarkers } from "@/components/exams/paper-builder/option-display";

export interface PassageOptions {
  passageTitle: string;
  passageContent: string;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  compact: boolean;
  usesSentenceInsertMarkers: boolean;
  contentWidthHpu: number;
}

function makePassageParas(
  content: string,
  compact: boolean,
): ParagraphNode[] {
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  // 미리보기 본문 줄간격: comfortable leading-[1.58], compact leading-[1.46].
  const lineSpacingPct = compact ? 146 : 158;
  const lines = content.split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return {
        kind: "p",
        style: {
          align: "JUSTIFY",
          spaceAfter: idx < lines.length - 1 ? 40 : 0,
          lineSpacingPct,
        },
        runs: [txt(" ", { size: bodySize })],
      };
    }
    return {
      kind: "p",
      style: {
        align: "JUSTIFY",
        spaceAfter: idx < lines.length - 1 ? 40 : 0,
        lineSpacingPct,
      },
      runs: parseFormattedToRuns(trimmed, { size: bodySize }),
    };
  });
}

export function renderPassage(opts: PassageOptions): BlockNode[] {
  const {
    passageTitle,
    passageContent,
    showPassageTitle,
    compact,
    usesSentenceInsertMarkers,
  } = opts;
  if (!passageContent.trim()) return [];

  const rendered = formatSentenceInsertPassageMarkers(
    passageContent,
    usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
  );
  const inner: ParagraphNode[] = [];
  if (showPassageTitle && passageTitle.trim()) {
    inner.push({
      kind: "p",
      style: { align: "LEFT", spaceAfter: 60, lineSpacingPct: 130 },
      runs: [
        txt(passageTitle.toUpperCase(), {
          size: SIZE.passageTitle,
          bold: true,
          color: COLORS.darkGray,
          letterSpacing: 20,
        }),
      ],
    });
  }
  inner.push(...makePassageParas(rendered, compact));

  return [...inner, { kind: "p", style: { spaceAfter: 120 }, runs: [] }];
}
