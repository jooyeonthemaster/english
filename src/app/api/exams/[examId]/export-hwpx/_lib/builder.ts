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
import {
  shouldForceSourcePassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
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
  contentWidthHpu: number,
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
    const lineType =
      block.dividerStyle === "dotted"
        ? "DOT"
        : block.dividerStyle === "dashed"
          ? "DASH"
          : "SOLID";
    const border = {
      type: lineType,
      widthMm: Math.max(0.1, Math.min(0.8, (block.dividerThickness || 1) * 0.12)),
      color,
    } as const;
    const none = { type: "NONE", widthMm: 0.1, color: COLORS.black } as const;
    return [
      {
        kind: "tbl",
        colWidthsHpu: [contentWidthHpu],
        borders: { left: none, right: none, top: border, bottom: none },
        rows: [
          {
            heightHpu: 220,
            cells: [
              {
                widthHpu: contentWidthHpu,
                heightHpu: 220,
                vAlign: "CENTER",
                borders: { left: none, right: none, top: border, bottom: none },
                margins: { left: 0, right: 0, top: 80, bottom: 80 },
                blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
              },
            ],
          },
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
    const passageContent = (
      first.passageContent ?? first.sourceQuestion.passage?.content ?? ""
    ).trim();
    const includePassage =
      !shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
      (first.includePassage !== false ||
        shouldForceSourcePassage({
          subType: first.sourceQuestion.subType,
          questionText: first.questionText || first.sourceQuestion.questionText,
          structuredData: (first.sourceQuestion as { structuredData?: unknown }).structuredData,
          passage: { content: passageContent },
        }));

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
  const { title, settings, resolvedItems, includeAnswers } = opts;
  const header: BuilderHeader = settings?.header ?? {};
  const layout: BuilderLayout = settings?.layout ?? {};
  const compact = layout.density === "compact";
  const passageStyle = layout.passageStyle ?? "boxed";
  const showPassageTitle = layout.showPassageTitle === true;
  const columns: 1 | 2 = layout.columns === 1 ? 1 : 2;

  // 페이지 설정 — 미리보기(A4PaperPage)의 px padding 을 mm로 정확히 환산.
  // 미리보기: comfortable px-[42px] py-[38px], compact px-[34px] py-[30px].
  // 미리보기는 가상 A4(760px=210mm) 모델 → 1px = 210/760 = 0.276316mm.
  //   (96dpi(0.264583mm) 가 아님. 그게 직전 패스의 버그였다.)
  const MM_PER_PX = 210 / 760; // 0.276316
  const paperSize = layout.paperSize === "B4" ? "B4" : "A4";
  // 전체 여백 축소(5차): 미리보기 a4-paper-page.tsx 의 새 px 패딩을 그대로 환산한다.
  //   comfortable px-[34px] py-[28px], compact px-[28px] py-[24px].
  //   좌우는 줄넘김 안정성을 위해 소폭(42→34, 34→28)만, 상하는 더 적극적으로 축소.
  //   (직전의 LR_TRIM 별도 보정은 제거 — 미리보기 패딩 자체를 줄였으므로 불필요.)
  const LR_PX = compact ? 28 : 34;
  const TB_PX = compact ? 24 : 28;
  const marginLR = mm(LR_PX * MM_PER_PX);
  const marginTB = mm(TB_PX * MM_PER_PX);
  const pageWidth = paperSize === "B4" ? B4_WIDTH : A4_WIDTH;
  const pageHeight = paperSize === "B4" ? B4_HEIGHT : A4_HEIGHT;
  const contentWidth = pageWidth - 2 * marginLR;
  const columnGap = mm(32 * MM_PER_PX); // gap-8 = 32px ≈ 8.84mm
  // 줄넘김(칸당 글자수)은 본문 칸 폭으로 결정된다. 칸 폭은 미리보기의 콘텐츠 폭
  // (새 좌우 패딩 34/28px 기준)으로 고정해 미리보기 pagination.ts 와 동일 폭을 쓴다.
  // (좌우 패딩을 미리보기·pagination·HWPX·DOCX 에서 함께 바꿨으므로 줄넘김이 어긋나지 않는다.)
  const previewContentWidth = pageWidth - 2 * marginLR;
  const columnWidth =
    columns === 1
      ? previewContentWidth
      : Math.floor((previewContentWidth - columnGap) / 2);

  const blocks: BlockNode[] = [];

  // 1) 페이지 헤더 (제목, 학교/반/이름)
  //    미리보기처럼 헤더는 항상 전체 본문 폭을 사용하고, 본문 직전에 다단을 켠다.
  blocks.push(
    ...renderPageHeader({
      subtitle: header.subtitle,
      title,
      schoolName: header.schoolName,
      className: header.className,
      studentNameLabel: header.studentNameLabel,
      compact,
      contentWidthHpu: contentWidth,
    }),
  );

  // 2) 안내문
  const instructions = (header.instructions || "").trim();
  if (instructions) {
    blocks.push({
      kind: "p",
      style: {
        align: "LEFT",
        // 미리보기 instructions 는 헤더 바로 아래(mt-2)에 붙어 있다.
        // 본문 위 빈공간을 줄이려 위/아래 간격을 축소.
        spaceBefore: 60,
        spaceAfter: 120,
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
    blocks.push({ kind: "p", style: { spaceAfter: 60 }, runs: [] });
  }

  if (columns === 2) {
    blocks.push({
      kind: "columnPr",
      columns: 2,
      columnGapHpu: columnGap,
    });
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
      blocks.push(...renderCustomBlock(block, compact, columnWidth));
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

  const section: SectionSpec = {
    pageWidthHpu: pageWidth,
    pageHeightHpu: pageHeight,
    marginLeft: marginLR,
    marginRight: marginLR,
    marginTop: marginTB,
    marginBottom: marginTB,
    // 머리말은 실제로 쓰지 않고(헤더를 본문 블록으로 그림) 본문 위 죽은 공간만
    // 만들므로 0 에 가깝게. 한컴은 top 여백 안에 header 밴드를 잡으므로 0이면
    // 본문이 marginTop 바로 아래에서 시작한다.
    marginHeader: mm(0),
    // 꼬리말(autoNum 페이지번호)은 살아있어야 하므로 적당한 값 유지.
    marginFooter: mm(7),
    columns: 1,
    columnGapHpu: columnGap,
    blocks,
  };

  return { title, sections: [section] };
}
