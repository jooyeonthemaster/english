/**
 * fragment 렌더러 — 미리보기(a4-paper-page.tsx)의 "단(column) 안 fragment" 렌더를
 * HWPX BlockNode 로 1:1 이식한다.
 *
 * 기존 builder 는 한컴 신문형 다단(colPr) + 자동 흐름에 맡겨, 긴 지문 시험지에서
 * 강제 break 가 잡히지 않으면 한컴이 자유롭게 단을 채워 미리보기와 배치가 크게
 * 어긋났다. 이 모듈은 미리보기 pagination 이 이미 확정한 "어느 단에 어떤 라인이
 * 들어가는지"를 그대로 셀에 채워, 한컴은 셀 폭 안에서 줄만 다시 흐르면 되게 한다.
 */

import type { BlockNode, BorderSpec, ParagraphNode, RunNode } from "../types";
import { txt } from "../types";
import { COLORS, SIZE, SUBTYPE_LABELS } from "../tokens";
import { parseFormattedToRuns } from "../format";
import {
  formatSentenceInsertPassageMarkers,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
} from "@/components/exams/paper-builder/option-display";
import type {
  PassageStyle,
  RenderFragment,
  RenderItemPart,
} from "@/components/exams/paper-builder/types";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
const BOX_BORDER: BorderSpec = {
  type: "SOLID",
  widthMm: 0.26,
  color: COLORS.separator,
};
// 미리보기 boxed 지문: px-3 py-2 → ~940 / ~627 HPU.
const BOX_PAD_LR = 940;
const BOX_PAD_TB = 627;
const ANSWER_LINE: BorderSpec = {
  type: "SOLID",
  widthMm: 0.12,
  color: COLORS.lightGray,
};

export interface FragmentRenderOptions {
  passageStyle: PassageStyle;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  showAnswerSpace: boolean;
  compact: boolean;
  template: string | undefined;
  // 단(칸) 폭(HPU). 셀 안 콘텐츠 폭.
  columnWidthHpu: number;
}

// paper-item-utils.tsx joinRenderedLinesForDisplay 의 순수 복제.
// (서버 번들에 .tsx 를 끌어오지 않으려고 동일 로직을 여기 둔다.)
function joinRenderedLines(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        paragraphs.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) paragraphs.push(current.join(" "));
  return paragraphs
    .join("\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// 본문 텍스트(여러 \n 단락)를 문단 노드들로. 미리보기 leading 과 맞춘다.
function bodyParas(
  text: string,
  compact: boolean,
  opts: { bold?: boolean } = {},
): ParagraphNode[] {
  const size = compact ? SIZE.bodyCompact : SIZE.body;
  const lineSpacingPct = compact ? 146 : 158;
  const lines = text.replace(/\r/g, "").split("\n");
  return lines.map<ParagraphNode>((line, idx) => {
    const trimmed = line.trim();
    const last = idx === lines.length - 1;
    if (!trimmed) {
      return {
        kind: "p",
        style: { align: "JUSTIFY", spaceAfter: last ? 0 : 40, lineSpacingPct },
        runs: [txt(" ", { size })],
      };
    }
    return {
      kind: "p",
      style: { align: "JUSTIFY", spaceAfter: last ? 0 : 40, lineSpacingPct },
      runs: parseFormattedToRuns(trimmed, { size, bold: opts.bold }),
    };
  });
}

function italicMarker(text: string): ParagraphNode {
  return {
    kind: "p",
    style: { align: "LEFT", spaceAfter: 40, lineSpacingPct: 120 },
    runs: [txt(text, { size: SIZE.subtitle, italic: true, color: COLORS.gray })],
  };
}

function wrapPassageBox(
  inner: ParagraphNode[],
  passageStyle: PassageStyle,
  columnWidthHpu: number,
): BlockNode[] {
  if (passageStyle === "plain") {
    return [...inner, { kind: "p", style: { spaceAfter: 120 }, runs: [] }];
  }
  const boxed = passageStyle === "boxed";
  const border = BOX_BORDER;
  const borders = boxed
    ? { left: border, right: border, top: border, bottom: border }
    : { left: NO, right: NO, top: border, bottom: border };
  const margins = boxed
    ? { left: BOX_PAD_LR, right: BOX_PAD_LR, top: BOX_PAD_TB, bottom: BOX_PAD_TB }
    : { left: 0, right: 0, top: BOX_PAD_TB, bottom: BOX_PAD_TB };
  return [
    {
      kind: "tbl",
      colWidthsHpu: [columnWidthHpu],
      borders,
      cellMargins: margins,
      rows: [
        {
          heightHpu: 1,
          cells: [
            {
              widthHpu: columnWidthHpu,
              heightHpu: 1,
              vAlign: "TOP",
              borders,
              margins,
              blocks: inner,
            },
          ],
        },
      ],
    },
    { kind: "p", style: { spaceAfter: 120 }, runs: [] },
  ];
}

/** fragment 의 지문(이 단에 배정된 라인들)을 렌더. */
export function renderPassageFragment(
  fragment: RenderFragment,
  opts: FragmentRenderOptions,
): BlockNode[] {
  if (!fragment.includePassage || fragment.passageRenderedLines.length === 0) {
    return [];
  }
  const isPassageStart = fragment.passageStartLineIndex === 0;
  const endLineIndex =
    fragment.passageStartLineIndex + fragment.passageRenderedLines.length;
  const isPassageEnd = endLineIndex >= fragment.passageTotalLines;
  const isSplit = !(isPassageStart && isPassageEnd);

  const rawText = isSplit
    ? joinRenderedLines(fragment.passageRenderedLines)
    : fragment.passageContent;
  const rendered = formatSentenceInsertPassageMarkers(
    rawText,
    fragment.usesSentenceInsertMarkers ? "SENTENCE_INSERT" : null,
  );

  const inner: ParagraphNode[] = [];
  if (opts.showPassageTitle && fragment.passageTitle && isPassageStart) {
    inner.push({
      kind: "p",
      style: { align: "LEFT", spaceAfter: 60, lineSpacingPct: 130 },
      runs: [
        txt(fragment.passageTitle.toUpperCase(), {
          size: SIZE.passageTitle,
          bold: true,
          color: COLORS.darkGray,
          letterSpacing: 20,
        }),
      ],
    });
  }
  if (!isPassageStart) inner.push(italicMarker("(지문 계속)"));
  inner.push(...bodyParas(rendered, opts.compact));
  if (isSplit && !isPassageEnd) {
    inner.push(italicMarker("(다음 칸으로 이어짐 →)"));
  }

  return wrapPassageBox(inner, opts.passageStyle, opts.columnWidthHpu);
}

function partHasContent(part: RenderItemPart): boolean {
  return (
    part.questionRenderedLines.length > 0 ||
    part.options.length > 0 ||
    part.showObjectiveAnswer ||
    part.showAnswer
  );
}

/** fragment 의 한 문항 part(이 단에 배정된 부분)를 렌더. */
export function renderQuestionPart(
  part: RenderItemPart,
  opts: FragmentRenderOptions,
): BlockNode[] {
  const item = part.source;
  if (item.blockType !== "question") {
    return renderCustomPart(part, opts);
  }

  const compact = opts.compact;
  const result: BlockNode[] = [];
  const qNumSize = compact ? SIZE.qNumCompact : SIZE.qNum;
  const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
  const subType = item.sourceQuestion.subType || "";
  const subTypeLabel = subType ? SUBTYPE_LABELS[subType] || subType : "";

  // 1) 번호 + 메타
  if (part.showHeader) {
    const headerRuns: RunNode[] = [
      txt(`${item.orderNum}. `, {
        size: qNumSize,
        bold: true,
        color: COLORS.black,
      }),
    ];
    if (opts.showQuestionMeta) {
      headerRuns.push(
        txt(
          subTypeLabel
            ? `[${item.points}점 · ${subTypeLabel}]`
            : `[${item.points}점]`,
          { size: SIZE.meta, color: COLORS.gray },
        ),
      );
    }
    result.push({
      kind: "p",
      style: { spaceBefore: 40, spaceAfter: 60 },
      runs: headerRuns,
    });
  }

  // 2) 이어짐 표시
  if (part.isContinuation && partHasContent(part)) {
    result.push(italicMarker(`(${item.orderNum}번 계속)`));
  }

  // 3) 발문(이 단에 배정된 줄). whole 이면 원문, 분할이면 join.
  if (part.questionRenderedLines.length > 0) {
    const whole =
      part.questionStartLineIndex === 0 &&
      part.questionStartLineIndex + part.questionRenderedLines.length >=
        part.questionTotalLines;
    const text = whole
      ? item.questionText
      : joinRenderedLines(part.questionRenderedLines);
    const rendered = formatSentenceInsertPassageMarkers(text, subType);
    result.push(...bodyParas(rendered, compact, { bold: true }));
  }

  // 4) 선지(이 단에 배정된 선지). originalIndex 로 라벨/표시.
  if (part.options.length > 0) {
    for (const { option, originalIndex } of part.options) {
      const display = optionDisplayTextForSubtype(
        subType,
        originalIndex,
        option.text || "",
      );
      const hasText = display.trim().length > 0;
      const runs: RunNode[] = [
        txt(optionOrdinalLabel(originalIndex), {
          size: bodySize,
          bold: true,
          color: COLORS.darkGray,
        }),
      ];
      if (hasText) {
        runs.push(txt("  ", { size: bodySize }));
        runs.push(...parseFormattedToRuns(display, { size: bodySize }));
      }
      result.push({
        kind: "p",
        style: {
          align: "LEFT",
          leftMargin: 560,
          indentFirst: -560,
          spaceAfter: 40,
          lineSpacingPct: compact ? 146 : 158,
        },
        runs,
      });
    }
  }

  // 5) 객관식 추가 선지 슬롯
  if (
    part.showObjectiveAnswer &&
    opts.showAnswerSpace &&
    (item.objectiveAnswerSlots ?? 0) > 0 &&
    item.options.length > 0
  ) {
    const slots = Math.max(1, Math.min(10, item.objectiveAnswerSlots ?? 0));
    const texts = item.objectiveAnswerTexts || [];
    for (let i = 0; i < slots; i += 1) {
      const optionIndex = item.options.length + i;
      const display = (texts[i] ?? "").trim();
      const runs: RunNode[] = [
        txt(optionOrdinalLabel(optionIndex), {
          size: bodySize,
          bold: true,
          color: COLORS.darkGray,
        }),
        txt("  ", { size: bodySize }),
      ];
      if (display) runs.push(...parseFormattedToRuns(display, { size: bodySize }));
      result.push({
        kind: "p",
        style: {
          align: "LEFT",
          leftMargin: 560,
          indentFirst: -560,
          spaceAfter: 40,
          lineSpacingPct: compact ? 146 : 158,
        },
        runs,
      });
    }
  }

  // 6) 서술형 답란
  if (
    part.showAnswer &&
    opts.showAnswerSpace &&
    (item.answerSpaceLines ?? 0) > 0
  ) {
    const lines = Math.max(1, Math.min(12, item.answerSpaceLines ?? 3));
    for (let i = 0; i < lines; i += 1) {
      result.push({
        kind: "tbl",
        colWidthsHpu: [opts.columnWidthHpu],
        borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
        rows: [
          {
            heightHpu: 360,
            cells: [
              {
                widthHpu: opts.columnWidthHpu,
                heightHpu: 360,
                vAlign: "BOTTOM",
                borders: { left: NO, right: NO, top: NO, bottom: ANSWER_LINE },
                margins: { left: 0, right: 0, top: i === 0 ? 80 : 120, bottom: 0 },
                blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
              },
            ],
          },
        ],
      });
    }
  }

  // 문항 사이 간격
  result.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
  return result;
}

function renderCustomPart(
  part: RenderItemPart,
  opts: FragmentRenderOptions,
): BlockNode[] {
  const item = part.source;
  const compact = opts.compact;
  const color = item.blockAccentColor || "#2563EB";
  const align =
    item.blockAlign === "center"
      ? ("CENTER" as const)
      : item.blockAlign === "right"
        ? ("RIGHT" as const)
        : ("LEFT" as const);

  if (item.blockType === "section") {
    return [
      {
        kind: "p",
        style: {
          align,
          leftMargin: 120,
          spaceBefore: 140,
          spaceAfter: 120,
          lineSpacingPct: 150,
        },
        runs: [
          txt(item.blockTitle || item.blockText || "새 섹션", {
            size: compact ? 12 : 13,
            bold: true,
            color,
          }),
        ],
      },
    ];
  }

  if (item.blockType === "text") {
    const size =
      item.blockFontSize === "lg"
        ? compact
          ? 12
          : 13
        : item.blockFontSize === "sm"
          ? compact
            ? 8
            : 9
          : compact
            ? SIZE.bodyCompact
            : SIZE.body;
    return (item.blockText || " ")
      .replace(/\r/g, "")
      .split("\n")
      .map<BlockNode>((line) => ({
        kind: "p",
        style: { align, spaceBefore: 40, spaceAfter: 80, lineSpacingPct: 155 },
        runs: [txt(line || " ", { size, color: COLORS.darkGray })],
      }));
  }

  if (item.blockType === "spacer") {
    return [
      {
        kind: "p",
        style: {
          spaceBefore: 0,
          spaceAfter: Math.max(
            80,
            Math.min(900, (item.spacerHeight || 32) * 10),
          ),
        },
        runs: [],
      },
    ];
  }

  // divider/image 등은 간단히 빈 줄 처리(다단 셀에서 드묾).
  return [{ kind: "p", style: { spaceAfter: 80 }, runs: [] }];
}
