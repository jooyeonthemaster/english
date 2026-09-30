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

/**
 * 세트 안내문 「[n~m] 다음 글을 읽고, 물음에 답하시오.」(공용 buildGroups 의 group.setPrompt) —
 * 웹(a4-paper-page)처럼 지문 박스 첫머리, 지문 제목보다 위에 굵게 한 줄. 지문 첫 줄과 한 단에 둔다(caption).
 */
export function renderSetPrompt(setPrompt: string, compact: boolean): ParagraphNode[] {
  const text = setPrompt.trim();
  if (!text) return [];
  return [
    {
      kind: "p",
      keepRole: "caption",
      style: { align: "LEFT", spaceAfter: 60, lineSpacingPct: compact ? 146 : 158 },
      runs: [
        txt(text, {
          size: compact ? SIZE.bodyCompact : SIZE.body,
          bold: true,
          color: COLORS.black,
        }),
      ],
    },
  ];
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
      keepRole: "caption", // 지문 제목은 지문 첫 줄과 한 단에(keep-policy.ts)
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
