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
  formatInlineMarkersForSubtype,
  formatSentenceInsertPassageMarkers,
  optionDisplayLabel,
  optionDisplayTextForSubtype,
  optionOrdinalLabel,
  shouldRenderOptionListForSubtype,
} from "@/components/exams/paper-builder/option-display";
import {
  questionStemAndBody,
  isStructuredAtomicSubtype,
} from "@/components/exams/paper-builder/question-body-layout";
import { questionHasEmbeddedPassage } from "@/components/exams/paper-builder/passage-policy";
import { normalizeInlineText } from "@/components/exams/paper-builder/text-normalization";
import { renderQuestionBlock, type BuilderItemResolved } from "./question";
import {
  LINE_GAP_MARKER,
  type PassageStyle,
  type RenderFragment,
  type RenderItemPart,
  type StructRow,
  type StructRowStyle,
} from "@/components/exams/paper-builder/types";

const NO: BorderSpec = { type: "NONE", widthMm: 0.1, color: COLORS.black };
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

function printablePassageTitle(item: RenderItemPart["source"]): string {
  const savedTitle = normalizeInlineText(item.passageTitle || "");
  const sourceTitle = normalizeInlineText(item.sourceQuestion.passage?.title || "");
  return savedTitle || sourceTitle;
}

function renderPassageTitleParagraph(passageTitle: string): ParagraphNode {
  return {
    kind: "p",
    style: { align: "LEFT", spaceBefore: 20, spaceAfter: 30, lineSpacingPct: 130 },
    runs: [
      txt(passageTitle.toUpperCase(), {
        size: SIZE.passageTitle,
        bold: true,
        color: COLORS.darkGray,
        letterSpacing: 20,
      }),
    ],
  };
}

function wrapPassageBox(
  inner: ParagraphNode[],
  passageStyle: PassageStyle,
  columnWidthHpu: number,
): BlockNode[] {
  void passageStyle;
  void columnWidthHpu;
  return [...inner, { kind: "p", style: { spaceAfter: 120 }, runs: [] }];
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
    part.structRows.length > 0 ||
    part.questionRenderedLines.length > 0 ||
    part.options.length > 0 ||
    part.showObjectiveAnswer ||
    part.showAnswer
  );
}

/** fragment 의 한 문항 part(이 단에 배정된 부분)를 렌더. */
function renderStructRows(
  rows: StructRow[],
  subType: string,
  passageTitle: string,
  opts: FragmentRenderOptions,
): BlockNode[] {
  if (rows.length === 0) return [];

  const groups: {
    segIndex: number;
    style: StructRowStyle;
    paraLabel?: string;
    rows: StructRow[];
  }[] = [];

  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.segIndex === row.segIndex) {
      last.rows.push(row);
    } else {
      groups.push({
        segIndex: row.segIndex,
        style: row.style,
        paraLabel: row.paraLabel,
        rows: [row],
      });
    }
  }

  const result: BlockNode[] = [];
  const bodySize = opts.compact ? SIZE.bodyCompact : SIZE.body;

  for (const group of groups) {
    const text = formatSentenceInsertPassageMarkers(
      joinRenderedLines(group.rows.map((row) => row.line)),
      subType === "SENTENCE_INSERT" ? "SENTENCE_INSERT" : null,
    );
    const resumed = !group.rows[0].isSegStart;
    const continues = !group.rows[group.rows.length - 1].isSegEnd;

    if (group.style === "arrow") {
      result.push({
        kind: "p",
        style: { align: "CENTER", spaceAfter: 60, lineSpacingPct: 120 },
        runs: [txt("\u2193", { size: bodySize, bold: true, color: COLORS.gray })],
      });
      continue;
    }

    if (
      group.style === "given" ||
      group.style === "passage" ||
      group.style === "summary"
    ) {
      const inner: ParagraphNode[] = [];
      if (resumed) inner.push(italicMarker("(\uC774\uC5B4\uC11C)"));
      if (
        group.style === "passage" &&
        opts.showPassageTitle &&
        passageTitle &&
        !resumed
      ) {
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
      if (group.style === "given" && !resumed) {
        inner.push({
          kind: "p",
          style: { align: "LEFT", spaceAfter: 30, lineSpacingPct: 120 },
          runs: [
            txt("\uC8FC\uC5B4\uC9C4 \uBB38\uC7A5", {
              size: SIZE.meta,
              bold: true,
              color: COLORS.gray,
            }),
          ],
        });
      }
      const bodyText =
        group.style === "summary" && subType === "SUMMARY_COMPLETE" && !resumed
          ? `[\uC694\uC57D\uBB38] ${text}`
          : text;
      inner.push(...bodyParas(bodyText, opts.compact, { bold: group.style !== "passage" }));
      if (continues) {
        inner.push(italicMarker("(\uB2E4\uC74C \uCE78\uC73C\uB85C \uC774\uC5B4\uC9D0 \u2192)"));
      }
      result.push(...wrapPassageBox(inner, "plain", opts.columnWidthHpu));
      continue;
    }

    if (resumed) result.push(italicMarker("(\uC774\uC5B4\uC11C)"));
    const prefix =
      group.style === "para" && group.paraLabel && !resumed
        ? `${group.paraLabel} `
        : "";
    result.push(...bodyParas(`${prefix}${text}`.trim(), opts.compact, { bold: true }));
    if (continues) {
      result.push(italicMarker("(\uB2E4\uC74C \uCE78\uC73C\uB85C \uC774\uC5B4\uC9D0 \u2192)"));
    }
  }

  return result;
}

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

  // 구조화 원자 유형(요약완성·순서·주제/요지/제목/내용일치)은 칸 경계에서 쪼개지
  // 않고 한 덩어리로 배치된다. fragment 렌더러는 지문/요약/순서 박스를 그리지
  // 못하므로, 검증된 완전 렌더러(renderQuestionBlock)로 통째 렌더한다.
  //   (정답 미포함 경로에서만 fragment 가 쓰이므로 includeAnswers=false.)
  if (isStructuredAtomicSubtype(subType)) {
    if (!part.showHeader) return [];
    // part.source 는 재구성된 PaperItem(sourceQuestion={subType}). renderQuestionBlock
    // 가 읽는 필드(passageContent/options/questionText/sourceQuestion.subType)는 모두
    // 갖고 있고, 없는 필드는 정답 미포함 경로에서 안 쓰이므로 캐스팅해 재사용한다.
    const blocks = renderQuestionBlock({
      item: item as unknown as BuilderItemResolved,
      layout: {
        columns: 2,
        density: compact ? "compact" : "comfortable",
        showAnswerSpace: opts.showAnswerSpace,
        showQuestionMeta: opts.showQuestionMeta,
        showPassageTitle: opts.showPassageTitle,
        passageStyle: opts.passageStyle,
      },
      includeAnswers: false,
      contentWidthHpu: opts.columnWidthHpu,
    });
    blocks.push({ kind: "p", style: { spaceAfter: 80 }, runs: [] });
    return blocks;
  }

  // 미리보기(a4-paper-page)와 동일: 지시문(stem=첫 단락)은 번호 옆에 항상 통째로,
  // 본문(body)만 칸 경계에서 분할된다. questionRenderedLines/Total 은 body 좌표다.
  const { stem, body } = questionStemAndBody(item);
  const bodyPassageTitle = printablePassageTitle(item);
  const showBodyPassageTitle =
    part.showHeader &&
    opts.showPassageTitle &&
    Boolean(bodyPassageTitle) &&
    part.structRows.length === 0 &&
    questionHasEmbeddedPassage({
      ...item.sourceQuestion,
      questionText: item.questionText || item.sourceQuestion.questionText,
      passage: {
        content:
          item.passageContent || item.sourceQuestion.passage?.content || "",
      },
    });

  if (showBodyPassageTitle) {
    result.push(renderPassageTitleParagraph(bodyPassageTitle));
  }

  // 1) 번호 + 메타 + 지시문(stem) — 한 줄에 인라인.
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
            ? `[${item.points}점 · ${subTypeLabel}] `
            : `[${item.points}점] `,
          { size: SIZE.meta, color: COLORS.gray },
        ),
      );
    }
    if (stem.trim()) {
      headerRuns.push(
        ...parseFormattedToRuns(
          formatInlineMarkersForSubtype(stem, subType),
          { size: bodySize, bold: true },
        ),
      );
    }
    result.push({
      kind: "p",
      style: { align: "JUSTIFY", spaceBefore: 40, spaceAfter: 60 },
      runs: headerRuns,
    });
  }

  // 2) 이어짐 표시
  if (part.isContinuation && partHasContent(part)) {
    result.push(italicMarker(`(${item.orderNum}번 계속)`));
  }

  // 3) 본문(body) — 한 칸에 다 들어가면 통째로, 칸을 넘으면 이 part 에 배치된 줄만.
  //    (stem 은 위 헤더에서 이미 렌더했다.)
  const startsAtBeginning = part.questionStartLineIndex === 0;
  const endsHere =
    part.questionStartLineIndex + part.questionRenderedLines.length >=
    part.questionTotalLines;
  const bodyIsWhole = part.isStart && startsAtBeginning && endsHere;

  if (part.structRows.length > 0) {
    result.push(
      ...renderStructRows(
        part.structRows,
        subType,
        printablePassageTitle(item),
        opts,
      ),
    );
  } else if (bodyIsWhole) {
    if (body.trim()) {
      const rendered = formatInlineMarkersForSubtype(body, subType);
      result.push(...bodyParas(rendered, compact, { bold: true }));
    }
  } else if (part.questionRenderedLines.length > 0) {
    const rendered = formatInlineMarkersForSubtype(
      joinRenderedLines(part.questionRenderedLines),
      subType,
    );
    result.push(...bodyParas(rendered, compact, { bold: true }));
  }

  // 4) 선지(이 단에 배정된 선지). originalIndex 로 라벨/표시.
  if (shouldRenderOptionListForSubtype(subType) && part.options.length > 0) {
    for (const { option, originalIndex } of part.options) {
      const display = optionDisplayTextForSubtype(
        subType,
        originalIndex,
        option.text || "",
      );
      const hasText = display.trim().length > 0;
      const runs: RunNode[] = [
        txt(optionDisplayLabel(subType, originalIndex, option.label), {
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
    shouldRenderOptionListForSubtype(subType) &&
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
    // 워드프로세서식 빈 줄(line-gap): 미리보기에서 Enter 한 번 = 본문 한 줄이므로,
    // 강제 단 배치(forced layout) 셀 안에서도 "본문 한 줄" 높이로 렌더한다(builder.ts
    // buildCustomBlock 의 네이티브 흐름 처리와 동일 규칙). 본문 크기의 빈 run + 본문
    // 행간(lineSpacingPct)만 주고 추가 spaceAfter 는 두지 않는다.
    if (item.blockText === LINE_GAP_MARKER) {
      const bodySize = compact ? SIZE.bodyCompact : SIZE.body;
      return [
        {
          kind: "p",
          style: {
            spaceBefore: 0,
            spaceAfter: 0,
            lineSpacingPct: compact ? 146 : 158,
          },
          runs: [txt("", { size: bodySize })],
        },
      ];
    }
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
