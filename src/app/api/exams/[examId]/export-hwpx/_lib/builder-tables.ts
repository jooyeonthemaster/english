import type { BlockNode } from "./types";
import { renderPassage } from "./render/passage";
import { type BuilderItemResolved, applyQuestionBlockFormat, renderQuestionBlock } from "./render/question";
import { shouldForceSourcePassage, shouldRenderSourcePassageInsideQuestion } from "@/components/exams/paper-builder/passage-policy";
import { formatSourcePassageForQuestionItems } from "@/components/exams/paper-builder/source-passage-markers";
import { resolveKoSetSharedPassageContent } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document/ko-set-passage";
import type { PaperPage, RenderFragment } from "@/components/exams/paper-builder/types";
import type { BuilderBlock, BuilderLayout } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import { type BreakPlan, passageBreakKey, questionBreakKey } from "./break-plan";
import { type FragmentRenderOptions, renderPassageFragment, renderQuestionPart } from "./render/fragment";
import type { ColumnUnit } from "./builder-types";
import { applyBreak, printablePassageTitle, renderCustomBlock } from "./builder-blocks";
export function groupItems(
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

// Passage-inclusion resolution for one question group. Shared verbatim by
// appendQuestionGroups (flat) and renderGroupsToUnits (units) so the
// includePassage/source-passage policy lives in exactly one place.
export function resolveGroupPassage(
  first: BuilderItemResolved,
  items: BuilderItemResolved[],
): { passageContent: string; includePassage: boolean } {
  // KO 세트 그룹(`set:<setId>`): 병합 마커 공유지문 1박스 + 세트 지시문 —
  // 웹 미리보기(applyKoSetSharedPassages)·DOCX(assemble)와 동일 모델.
  // 영어/일반 그룹은 null 이 반환되어 아래 기존 로직이 그대로 실행된다.
  const koSetPassageContent = resolveKoSetSharedPassageContent(
    first.groupId,
    items,
  );
  if (koSetPassageContent !== null) {
    return { passageContent: koSetPassageContent, includePassage: true };
  }
  const rawPassageContent = (
    first.passageContent ?? first.sourceQuestion.passage?.content ?? ""
  ).trim();
  const passageContent = formatSourcePassageForQuestionItems(
    rawPassageContent,
    items,
  ).trim();
  const includePassage =
    !shouldRenderSourcePassageInsideQuestion(first.sourceQuestion.subType) &&
    (first.includePassage !== false ||
      shouldForceSourcePassage({
        subType: first.sourceQuestion.subType,
        questionText: first.questionText || first.sourceQuestion.questionText,
        structuredData: (first.sourceQuestion as { structuredData?: unknown })
          .structuredData,
        passage: { content: rawPassageContent },
      }));
  return { passageContent, includePassage };
}

export function appendQuestionGroups(opts: {
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
    const { passageContent, includePassage } =
      resolveGroupPassage(first, group.items);

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
      const questionBlocks = applyQuestionBlockFormat(
        renderQuestionBlock({
          item,
          layout: opts.layout,
          includeAnswers: opts.includeAnswers,
          contentWidthHpu: opts.contentWidthHpu,
        }),
        item,
        opts.compact,
      );
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

// 문항과 커스텀 블록(텍스트·섹션·구분선·여백·이미지)을 settings.blocks 순서대로 흘려보낸다.
// 문항은 연속분을 모아 appendQuestionGroups 로(지문 묶음 유지), 커스텀 블록은 사이에 끼운다.
// contentWidthHpu = 본문/문항 폭(단 폭 또는 전체폭), imageColWidthHpu = 이미지 박스 폭 기준.
// 네이티브 2단(colCount=2) 경로에서도 이 함수를 써 이미지·섹션이 칸 안에 함께 흐르게 한다.
export function appendBlocksInOrder(opts: {
  target: BlockNode[];
  blocks: BuilderBlock[] | undefined;
  resolvedItems: BuilderItemResolved[];
  layout: BuilderLayout;
  includeAnswers: boolean;
  compact: boolean;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  contentWidthHpu: number;
  imageColWidthHpu: number;
  imageMaxHeightHpu: number;
  breakPlan: BreakPlan;
}) {
  const appendQ = (items: BuilderItemResolved[]) => {
    if (items.length === 0) return;
    appendQuestionGroups({
      target: opts.target,
      items,
      layout: opts.layout,
      includeAnswers: opts.includeAnswers,
      compact: opts.compact,
      passageStyle: opts.passageStyle,
      showPassageTitle: opts.showPassageTitle,
      contentWidthHpu: opts.contentWidthHpu,
      breakPlan: opts.breakPlan,
    });
  };

  if (!opts.blocks?.length) {
    appendQ(opts.resolvedItems);
    return;
  }

  const byLocalId = new Map(
    opts.resolvedItems
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
    const fallback = opts.resolvedItems.find(
      (item) => !used.has(item) && item.questionId === block.questionId,
    );
    if (fallback) used.add(fallback);
    return fallback;
  };

  let pending: BuilderItemResolved[] = [];
  const flush = () => {
    appendQ(pending);
    pending = [];
  };
  for (const block of opts.blocks) {
    if (block.blockType === "question") {
      const q = takeQuestion(block);
      if (q) pending.push(q);
      continue;
    }
    flush();
    const customBlocks = renderCustomBlock(
      block,
      opts.compact,
      opts.contentWidthHpu,
      opts.imageColWidthHpu,
      opts.imageMaxHeightHpu,
    );
    if (block.localId) {
      applyBreak(customBlocks, opts.breakPlan.get(questionBreakKey(block.localId)));
    }
    opts.target.push(...customBlocks);
  }
  flush();
}

// 한 단(column)의 fragment 들을 BlockNode[] 로.
export function renderColumn(
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
export function buildPageTable(opts: {
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

// =============================================================================
// 결정론적 명시 2단 표 (한컴은 본문 중간 colPr 다단을 적용하지 않으므로 — 검증됨 —
// 페이지마다 [좌칸 | 간격 | 우칸] 무테 표로 배치를 강제한다.)
// =============================================================================

export const TBL_NO_BORDERS = {
  left: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
  right: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
  top: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
  bottom: { type: "NONE" as const, widthMm: 0.1, color: "#000000" },
};

export const TBL_NO_MARGIN = { left: 0, right: 0, top: 0, bottom: 0 };

// 각 그룹(지문 + 문항들)을 "배치 단위(unit)"로 렌더한다. appendQuestionGroups 와
// 동일한 렌더링이되, 평탄 배열 대신 placeKey 가 달린 unit 으로 내보낸다.
export function renderGroupsToUnits(opts: {
  items: BuilderItemResolved[];
  layout: BuilderLayout;
  includeAnswers: boolean;
  compact: boolean;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  columnWidthHpu: number;
}): ColumnUnit[] {
  const units: ColumnUnit[] = [];
  const groups = groupItems(opts.items);
  for (const group of groups) {
    const first = group.items[0];
    const firstLocalId = first.localId;
    const { passageContent, includePassage } =
      resolveGroupPassage(first, group.items);
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
        contentWidthHpu: opts.columnWidthHpu,
      });
      units.push({
        placeKey: firstLocalId ? passageBreakKey(firstLocalId) : null,
        blocks: passageBlocks,
      });
    }
    group.items.forEach((item) => {
      const questionBlocks = applyQuestionBlockFormat(
        renderQuestionBlock({
          item,
          layout: opts.layout,
          includeAnswers: opts.includeAnswers,
          contentWidthHpu: opts.columnWidthHpu,
        }),
        item,
        opts.compact,
      );
      units.push({
        placeKey: item.localId ? questionBreakKey(item.localId) : null,
        blocks: questionBlocks,
      });
    });
  }
  return units;
}

// 한 페이지를 [좌칸 | 간격 | 우칸] 무테 표로.
export function buildColumnPageTable(opts: {
  leftBlocks: BlockNode[];
  rightBlocks: BlockNode[];
  colWidthHpu: number;
  gapHpu: number;
  lastColWidthHpu: number;
  pageBreak: boolean;
}): BlockNode {
  const emptyPara: BlockNode = { kind: "p", style: { spaceAfter: 0 }, runs: [] };
  const left = opts.leftBlocks.length ? opts.leftBlocks : [emptyPara];
  const right = opts.rightBlocks.length ? opts.rightBlocks : [emptyPara];
  return {
    kind: "tbl",
    colWidthsHpu: [opts.colWidthHpu, opts.gapHpu, opts.lastColWidthHpu],
    borders: TBL_NO_BORDERS,
    cellMargins: TBL_NO_MARGIN,
    pageBreak: opts.pageBreak,
    rows: [
      {
        heightHpu: 1,
        cells: [
          {
            widthHpu: opts.colWidthHpu,
            heightHpu: 1,
            vAlign: "TOP",
            borders: TBL_NO_BORDERS,
            margins: TBL_NO_MARGIN,
            blocks: left,
          },
          {
            widthHpu: opts.gapHpu,
            heightHpu: 1,
            vAlign: "TOP",
            borders: TBL_NO_BORDERS,
            margins: TBL_NO_MARGIN,
            blocks: [emptyPara],
          },
          {
            widthHpu: opts.lastColWidthHpu,
            heightHpu: 1,
            vAlign: "TOP",
            borders: TBL_NO_BORDERS,
            margins: TBL_NO_MARGIN,
            blocks: right,
          },
        ],
      },
    ],
  };
}
