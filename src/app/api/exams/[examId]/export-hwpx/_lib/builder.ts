/**
 * 시험지 빌더 → HwpxDocument 메인 엔트리.
 *
 * 입력: BuilderSettings + ExamQuestionData[]
 * 출력: HwpxDocument (그 다음 package.ts 에서 ZIP 생성)
 */

import { mm, A4_WIDTH, A4_HEIGHT, B4_WIDTH, B4_HEIGHT } from "./units";
import type { BlockNode, HwpxDocument, SectionSpec } from "./types";
import { txt } from "./types";
import { COLORS, SIZE } from "./tokens";
import { renderPageHeader } from "./render/page-header";
import { renderPassage } from "./render/passage";
import {
  renderQuestionBlock,
  type BuilderItemResolved,
} from "./render/question";
import { renderAnswerKey } from "./render/answer-key";
import type {
  BuilderBlock,
  BuilderHeader,
  BuilderLayout,
  BuilderSettings,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";

export interface BuildHwpxOptions {
  title: string;
  settings: BuilderSettings | null;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
}

function groupItems(
  items: BuilderItemResolved[],
): Array<{ groupKey: string; items: BuilderItemResolved[] }> {
  const groups: Array<{ groupKey: string; items: BuilderItemResolved[] }> = [];
  for (const item of items) {
    const key = item.groupId || `single:${item.questionId}-${item.orderNum}`;
    const last = groups[groups.length - 1];
    if (last && last.groupKey === key) {
      last.items.push(item);
    } else {
      groups.push({ groupKey: key, items: [item] });
    }
  }
  return groups;
}

function normalizePrintableTitle(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function printablePassageTitle(item: BuilderItemResolved): string {
  const savedTitle = normalizePrintableTitle(item.passageTitle);
  if (!savedTitle) return "";
  const sourceTitle = normalizePrintableTitle(item.sourceQuestion.passage?.title);
  return savedTitle === sourceTitle ? "" : savedTitle;
}

function blockAlign(align: BuilderBlock["blockAlign"]) {
  if (align === "center") return "CENTER" as const;
  if (align === "right") return "RIGHT" as const;
  return "LEFT" as const;
}

function blockTextSize(block: BuilderBlock, compact: boolean) {
  if (block.blockFontSize === "lg") return compact ? 12 : 13;
  if (block.blockFontSize === "sm") return compact ? 8 : 9;
  return compact ? SIZE.bodyCompact : SIZE.body;
}

function renderCustomBlock(
  block: BuilderBlock,
  compact: boolean,
): BlockNode[] {
  const align = blockAlign(block.blockAlign);
  const color = block.blockAccentColor || "#2563EB";
  const text = block.blockText || block.questionText || "";

  if (block.blockType === "section") {
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
          txt(block.blockTitle || text || "새 섹션", {
            size: compact ? 12 : 13,
            bold: true,
            color,
          }),
        ],
      },
    ];
  }

  if (block.blockType === "text") {
    return (text || " ").replace(/\r/g, "").split("\n").map((line) => ({
      kind: "p" as const,
      style: { align, spaceBefore: 40, spaceAfter: 80, lineSpacingPct: 155 },
      runs: [txt(line || " ", { size: blockTextSize(block, compact), color: COLORS.darkGray })],
    }));
  }

  if (block.blockType === "divider") {
    const char = block.dividerStyle === "dotted" ? "·" : block.dividerStyle === "dashed" ? "─ " : "─";
    return [
      {
        kind: "p",
        style: { align: "CENTER", spaceBefore: 120, spaceAfter: 120 },
        runs: [
          txt(char.repeat(block.dividerStyle === "dashed" ? 34 : 58), {
            size: Math.max(8, Math.min(14, 8 + (block.dividerThickness || 1))),
            bold: (block.dividerThickness || 1) >= 3,
            color,
          }),
        ],
      },
    ];
  }

  if (block.blockType === "spacer") {
    return [
      {
        kind: "p",
        style: {
          spaceBefore: 0,
          spaceAfter: Math.max(80, Math.min(900, (block.spacerHeight || 32) * 10)),
        },
        runs: [],
      },
    ];
  }

  if (block.blockType === "image") {
    return [
      {
        kind: "p",
        style: { align, spaceBefore: 80, spaceAfter: 80 },
        runs: [
          txt(`[이미지: ${block.imageAlt || "삽입 이미지"}]`, {
            size: SIZE.meta,
            color: COLORS.gray,
          }),
        ],
      },
    ];
  }

  return [];
}

function appendQuestionGroups(opts: {
  target: BlockNode[];
  items: BuilderItemResolved[];
  layout: BuilderLayout;
  includeAnswers: boolean;
  compact: boolean;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  contentWidthHpu: number;
}) {
  const groups = groupItems(opts.items);
  for (const group of groups) {
    const first = group.items[0];
    const includePassage = first.includePassage !== false;
    const passageContent = (
      first.passageContent ?? first.sourceQuestion.passage?.content ?? ""
    ).trim();

    if (includePassage && passageContent) {
      opts.target.push(
        ...renderPassage({
          passageTitle: printablePassageTitle(first),
          passageContent,
          passageStyle: opts.passageStyle,
          showPassageTitle: opts.showPassageTitle,
          compact: opts.compact,
          usesSentenceInsertMarkers: group.items.some(
            (it) => it.sourceQuestion.subType === "SENTENCE_INSERT",
          ),
          contentWidthHpu: opts.contentWidthHpu,
        }),
      );
    }
    for (const item of group.items) {
      opts.target.push(
        ...renderQuestionBlock({
          item,
          layout: opts.layout,
          includeAnswers: opts.includeAnswers,
          contentWidthHpu: opts.contentWidthHpu,
        }),
      );
    }
  }
}

export function buildBuilderHwpxDocument(
  opts: BuildHwpxOptions,
): HwpxDocument {
  const { title, settings, resolvedItems, includeAnswers, fullExamQuestions } =
    opts;
  const header: BuilderHeader = settings?.header ?? {};
  const layout: BuilderLayout = settings?.layout ?? {};
  const compact = layout.density === "compact";
  const passageStyle = layout.passageStyle ?? "boxed";
  const showPassageTitle = layout.showPassageTitle === true;
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;

  // 페이지 설정 — 미리보기와 비슷한 빽빽한 마진
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  const marginLR = compact ? mm(12) : mm(14);
  const marginTB = compact ? mm(12) : mm(14);
  const pageWidth = paperSize === "B4" ? B4_WIDTH : A4_WIDTH;
  const pageHeight = paperSize === "B4" ? B4_HEIGHT : A4_HEIGHT;
  const contentWidth = pageWidth - 2 * marginLR;
  const columnGap = mm(6);
  const columnWidth =
    columns === 1
      ? contentWidth
      : Math.floor((contentWidth - columnGap) / 2);

  const blocks: BlockNode[] = [];

  // 1) 페이지 헤더 (제목, 학교/반/이름)
  //    2단 모드에서도 헤더 표는 단 폭으로 줄어든다(자동). 사용자는 columns=1
  //    모드를 골라야 헤더가 페이지 전체 폭을 차지하는 일반 시험지 룩이 된다.
  blocks.push(
    ...renderPageHeader({
      subtitle: header.subtitle,
      title,
      schoolName: header.schoolName,
      className: header.className,
      studentNameLabel: header.studentNameLabel,
      compact,
      contentWidthHpu: columnWidth,
    }),
  );

  // 2) 안내문
  const instructions = (header.instructions || "").trim();
  if (instructions) {
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        spaceBefore: 120,
        spaceAfter: 160,
        lineSpacingPct: 150,
      },
      runs: [
        txt(instructions, {
          size: SIZE.instructions,
          color: COLORS.gray,
        }),
      ],
    });
  } else {
    blocks.push({ kind: "p", style: { spaceAfter: 100 }, runs: [] });
  }

  // 3) 본문 — v2 는 사용자 삽입 블록 순서를 유지한다.
  if (settings?.blocks?.length) {
    const byLocalId = new Map(
      resolvedItems
        .filter((item) => item.localId)
        .map((item) => [item.localId as string, item]),
    );
    const used = new Set<BuilderItemResolved>();
    const takeQuestion = (block: BuilderBlock) => {
      const byId = block.localId ? byLocalId.get(block.localId) : undefined;
      if (byId && !used.has(byId)) {
        used.add(byId);
        return byId;
      }
      const fallback = resolvedItems.find(
        (item) => !used.has(item) && item.questionId === block.questionId,
      );
      if (fallback) used.add(fallback);
      return fallback;
    };
    let pendingQuestions: BuilderItemResolved[] = [];
    const flush = () => {
      if (pendingQuestions.length === 0) return;
      appendQuestionGroups({
        target: blocks,
        items: pendingQuestions,
        layout,
        includeAnswers,
        compact,
        passageStyle,
        showPassageTitle,
        contentWidthHpu: columnWidth,
      });
      pendingQuestions = [];
    };

    for (const block of settings.blocks) {
      if (block.blockType === "question") {
        const questionItem = takeQuestion(block);
        if (questionItem) pendingQuestions.push(questionItem);
        continue;
      }
      flush();
      blocks.push(...renderCustomBlock(block, compact));
    }
    flush();
  } else {
    appendQuestionGroups({
      target: blocks,
      items: resolvedItems,
      layout,
      includeAnswers,
      compact,
      passageStyle,
      showPassageTitle,
      contentWidthHpu: columnWidth,
    });
  }

  // 4) 정답표 (해설 모드가 아닐 때)
  if (!includeAnswers && fullExamQuestions.length > 0) {
    blocks.push(
      ...renderAnswerKey(fullExamQuestions, columnWidth),
    );
  }

  // 5) 마지막 페이지 번호 (인라인) — Phase 0
  blocks.push({
    kind: "p",
    style: { align: "CENTER", spaceBefore: 240, spaceAfter: 0 },
    runs: [
      txt("- ", { size: SIZE.footer, color: COLORS.gray }),
      { kind: "pageNum", style: { size: SIZE.footer, color: COLORS.gray } },
      txt(" / ", { size: SIZE.footer, color: COLORS.gray }),
      { kind: "totalPages", style: { size: SIZE.footer, color: COLORS.gray } },
      txt(" -", { size: SIZE.footer, color: COLORS.gray }),
    ],
  });

  const section: SectionSpec = {
    pageWidthHpu: pageWidth,
    pageHeightHpu: pageHeight,
    marginLeft: marginLR,
    marginRight: marginLR,
    marginTop: marginTB,
    marginBottom: marginTB,
    marginHeader: mm(8),
    marginFooter: mm(8),
    columns,
    columnGapHpu: columnGap,
    blocks,
  };

  return { title, sections: [section] };
}
