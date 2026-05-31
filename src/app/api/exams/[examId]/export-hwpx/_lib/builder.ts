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
import {
  computeBreakPlan,
  computePaginatedLayout,
  passageBreakKey,
  questionBreakKey,
  type BreakPlan,
  type BreakType,
} from "./break-plan";
import {
  renderPassageFragment,
  renderQuestionPart,
  type FragmentRenderOptions,
} from "./render/fragment";
import type {
  PaperPage,
  RenderFragment,
} from "@/components/exams/paper-builder/types";

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

// 분할 계획에 따라 블록 묶음의 첫 블록에 강제 단/페이지 나눔을 부여한다.
// (문단·표 모두 pageBreak/columnBreak 필드를 지원한다.)
function applyBreak(blocks: BlockNode[], type: BreakType | undefined) {
  if (!type) return;
  const first = blocks[0];
  if (!first || first.kind === "columnPr") return;
  if (type === "page") first.pageBreak = true;
  else first.columnBreak = true;
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
  breakPlan: BreakPlan;
}) {
  const groups = groupItems(opts.items);
  for (const group of groups) {
    const first = group.items[0];
    const firstLocalId = first.localId;
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

    const passageRenderedSeparately = includePassage && Boolean(passageContent);
    if (passageRenderedSeparately) {
      const passageBlocks = renderPassage({
        passageTitle: printablePassageTitle(first),
        passageContent,
        passageStyle: opts.passageStyle,
        showPassageTitle: opts.showPassageTitle,
        compact: opts.compact,
        usesSentenceInsertMarkers: group.items.some(
          (it) => it.sourceQuestion.subType === "SENTENCE_INSERT",
        ),
        contentWidthHpu: opts.contentWidthHpu,
      });
      if (firstLocalId) {
        applyBreak(passageBlocks, opts.breakPlan.get(passageBreakKey(firstLocalId)));
      }
      opts.target.push(...passageBlocks);
    }
    group.items.forEach((item, idx) => {
      const questionBlocks = renderQuestionBlock({
        item,
        layout: opts.layout,
        includeAnswers: opts.includeAnswers,
        contentWidthHpu: opts.contentWidthHpu,
      });
      if (item.localId) {
        applyBreak(questionBlocks, opts.breakPlan.get(questionBreakKey(item.localId)));
      }
      // 지문이 별도 블록으로 렌더되지 않는 유형(문항 내부 인라인 지문)에서는
      // 지문 기준 단/페이지 나눔이 유실되므로, 그룹 첫 문항 블록에 대신 적용해
      // break plan 이 미리보기와 동일하게 단 시작에 반영되도록 한다.
      if (idx === 0 && !passageRenderedSeparately && firstLocalId) {
        applyBreak(questionBlocks, opts.breakPlan.get(passageBreakKey(firstLocalId)));
      }
      opts.target.push(...questionBlocks);
    });
  }
}

// 한 단(column)의 fragment 들을 BlockNode[] 로.
function renderColumn(
  column: RenderFragment[],
  fopts: FragmentRenderOptions,
): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const fragment of column) {
    blocks.push(...renderPassageFragment(fragment, fopts));
    for (const part of fragment.parts) {
      blocks.push(...renderQuestionPart(part, fopts));
    }
  }
  if (blocks.length === 0) {
    blocks.push({ kind: "p", style: { spaceAfter: 0 }, runs: [] });
  }
  return blocks;
}

// 한 페이지를 단별 명시 표(2단: 좌 | 간격 | 우, 또는 1단)로.
function buildPageTable(opts: {
  page: PaperPage;
  columns: 1 | 2;
  columnWidthHpu: number;
  columnGapHpu: number;
  contentWidthHpu: number;
  pageBreak: boolean;
  fopts: FragmentRenderOptions;
}): BlockNode {
  const NO_BORDERS = {
    left: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
    right: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
    top: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
    bottom: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
  };
  const noMargin = { left: 0, right: 0, top: 0, bottom: 0 };

  if (opts.columns === 1) {
    const colBlocks = renderColumn(opts.page[0] ?? [], opts.fopts);
    return {
      kind: "tbl",
      colWidthsHpu: [opts.contentWidthHpu],
      borders: NO_BORDERS,
      cellMargins: noMargin,
      pageBreak: opts.pageBreak,
      rows: [
        {
          heightHpu: 1,
          cells: [
            {
              widthHpu: opts.contentWidthHpu,
              heightHpu: 1,
              vAlign: "TOP",
              borders: NO_BORDERS,
              margins: noMargin,
              blocks: colBlocks,
            },
          ],
        },
      ],
    };
  }

  const leftBlocks = renderColumn(opts.page[0] ?? [], opts.fopts);
  const rightBlocks = renderColumn(opts.page[1] ?? [], opts.fopts);
  const colW = opts.columnWidthHpu;
  const gap = opts.columnGapHpu;
  return {
    kind: "tbl",
    colWidthsHpu: [colW, gap, colW],
    borders: NO_BORDERS,
    cellMargins: noMargin,
    pageBreak: opts.pageBreak,
    rows: [
      {
        heightHpu: 1,
        cells: [
          {
            widthHpu: colW,
            heightHpu: 1,
            vAlign: "TOP",
            borders: NO_BORDERS,
            margins: noMargin,
            blocks: leftBlocks,
          },
          {
            widthHpu: gap,
            heightHpu: 1,
            vAlign: "TOP",
            borders: NO_BORDERS,
            margins: noMargin,
            blocks: [{ kind: "p", style: { spaceAfter: 0 }, runs: [] }],
          },
          {
            widthHpu: colW,
            heightHpu: 1,
            vAlign: "TOP",
            borders: NO_BORDERS,
            margins: noMargin,
            blocks: rightBlocks,
          },
        ],
      },
    ],
  };
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

  // 미리보기와 동일한 페이지/단 분할을 재현하기 위한 break plan.
  // 정답포함 모드는 해설 블록 때문에 미리보기와 레이아웃이 본질적으로 다르므로,
  // 강제 분할을 적용하지 않고 한컴 자동 흐름에 맡긴다(빈 plan).
  const { plan: breakPlan } = includeAnswers
    ? { plan: new Map() as BreakPlan }
    : computeBreakPlan({
        blocks: settings?.blocks,
        resolvedItems,
        layout,
        template: settings?.template,
      });

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

  // 3) 본문.
  // 새 방식: 미리보기 pagination 이 확정한 페이지/단 배치를 단별 명시 표로 옮긴다.
  //   한컴 자동 다단 흐름/균형 맞춤에 의존하지 않으므로, 긴 지문 시험지에서도
  //   미리보기와 같은 단·페이지 배치가 강제된다. (정답포함 모드는 해설 때문에
  //   pagination 모델과 다르므로 기존 흐름 방식 유지.)
  // NOTE(명시 2단 표 방식 비활성화): 페이지마다 2단 표로 배치를 강제하는 방식은
  // 결정적 배치라는 장점이 있으나, 실제 한컴 한글에서 (1) inline 표의 명시 셀 폭을
  // 제대로 적용하지 않아 칸이 좁아지고(약 55%), (2) 표가 너무 높아 1페이지에서
  // 다음 장으로 밀리는 문제가 확인됐다. 그래서 전체폭 2단(colPr) 흐름 방식으로
  // 되돌린다. (fragment 렌더러/레이아웃 계산 코드는 추후 재시도 위해 보존.)
  const USE_EXPLICIT_COLUMN_TABLES = false;
  const pageLayout =
    USE_EXPLICIT_COLUMN_TABLES && !includeAnswers
      ? computePaginatedLayout({
          blocks: settings?.blocks,
          resolvedItems,
          layout,
          template: settings?.template,
        })
      : null;

  if (pageLayout) {
    const fopts: FragmentRenderOptions = {
      passageStyle,
      showPassageTitle,
      showQuestionMeta: layout.showQuestionMeta !== false,
      showAnswerSpace: layout.showAnswerSpace !== false,
      compact,
      template: settings?.template,
      columnWidthHpu: columnWidth,
    };
    pageLayout.pages.forEach((page: PaperPage, idx: number) => {
      blocks.push(
        buildPageTable({
          page,
          columns,
          columnWidthHpu: columnWidth,
          columnGapHpu: columnGap,
          contentWidthHpu: contentWidth,
          pageBreak: idx > 0,
          fopts,
        }),
      );
    });
  } else {
    // 폴백: 기존 한컴 자동 흐름(colPr) + 강제 break 방식.
    if (columns === 2) {
      blocks.push({
        kind: "columnPr",
        columns: 2,
        columnGapHpu: columnGap,
      });
    }

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
          breakPlan,
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
        const customBlocks = renderCustomBlock(block, compact, columnWidth);
        if (block.localId) {
          applyBreak(
            customBlocks,
            breakPlan.get(questionBreakKey(block.localId)),
          );
        }
        blocks.push(...customBlocks);
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
        breakPlan,
      });
    }
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
