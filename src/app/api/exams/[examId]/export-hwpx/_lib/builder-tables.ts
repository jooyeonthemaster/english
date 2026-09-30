import type { BlockNode } from "./types";
import { renderPassage, renderSetPrompt } from "./render/passage";
import { type BuilderItemResolved, applyQuestionBlockFormat, renderQuestionBlock } from "./render/question";
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import type { PaperGroup, RenderFragment } from "@/components/exams/paper-builder/types";
import type { BuilderBlock, BuilderLayout } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import { type BreakPlan, passageBreakKey, questionBreakKey } from "./break-plan";
import { type FragmentRenderOptions, renderPassageFragment, renderQuestionPart } from "./render/fragment";
import type { ColumnUnit } from "./builder-types";
import { type HwpxFlowEntry, hwpxFlowEntries } from "./export-model";
import {
  type BreakFlowState,
  applyBreak,
  createBreakFlowState,
  decideGroupBreak,
  explicitBreak,
  itemBreakFields,
  renderCustomBlock,
} from "./builder-blocks";

// =============================================================================
// 그룹·지문 박스 = 공용 정본(paper-item-groups.buildGroups — 웹 조판과 같은 함수).
//   그룹 안 아무 문항이든 지문을 원하면 켠다 · 비문항 블록으로 쪼개진 묶음은 지문 1회 · 영어 세트 병합
//   지문 + 「[n~m] 다음 글을 읽고, 물음에 답하시오.」 · KO 세트 공유지문 1박스. HWPX 는 이 결과만 그린다
//   (예전의 「첫 문항 includePassage !== false → 지문」 판정은 settings NULL 에서 undefined 를 켬으로 읽어
//   번호 없는 원문을 문항 앞에 찍었다 — 고객 107문항 54건).
// =============================================================================

type GroupRenderOpts = {
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  compact: boolean;
  contentWidthHpu: number;
};

/** 그룹 지문 박스(세트 안내문 → [제목] → 지문). 웹이 그리지 않는 그룹이면 []. */
function renderGroupPassage(group: PaperGroup, opts: GroupRenderOpts): BlockNode[] {
  const passageContent = (group.passageContent || "").trim();
  if (!group.includePassage || !passageContent) return [];
  const passageBlocks = renderPassage({
    passageTitle: group.passageTitle,
    passageContent,
    passageStyle: opts.passageStyle,
    showPassageTitle: opts.showPassageTitle,
    compact: opts.compact,
    usesSentenceInsertMarkers: group.items.some(
      (it) => it.sourceQuestion.subType === "SENTENCE_INSERT",
    ),
    contentWidthHpu: opts.contentWidthHpu,
  });
  if (passageBlocks.length === 0) return [];
  return [...renderSetPrompt(group.setPrompt, opts.compact), ...passageBlocks];
}

/** 공용 그룹 → 조판 항목(문항 그룹이면 문항 순서 그대로). 짝이 없으면 null. */
function groupEntries(
  group: PaperGroup,
  entryOf: Map<object, HwpxFlowEntry>,
): HwpxFlowEntry[] {
  return group.items
    .map((paper) => entryOf.get(paper))
    .filter((entry): entry is HwpxFlowEntry => Boolean(entry));
}

function appendQuestionGroup(opts: {
  target: BlockNode[];
  group: PaperGroup;
  items: BuilderItemResolved[];
  layout: BuilderLayout;
  includeAnswers: boolean;
  compact: boolean;
  passageStyle: "boxed" | "underlined" | "plain";
  showPassageTitle: boolean;
  contentWidthHpu: number;
  breakPlan: BreakPlan;
  /** 쪽당 N문제 강제 배치(SPEC §3.1). columns = 단 수(= 쪽당 문제 예산). 미지정 = 강제 없음. */
  forcePerPage?: { columns: 1 | 2 };
  /** 이 구역의 실제 단 수. 1단이면 breakBefore="column" 을 page 로 승격한다(§3.2). */
  sectionColumns: 1 | 2;
  /** appendBlocksInOrder 가 소유하는 강제 나눔 상태(커스텀 블록 사이에서도 쪽 문항 카운터 유지). */
  breakState: BreakFlowState;
}) {
  const { group, items, sectionColumns, breakState } = opts;
  const first = items[0];
  if (!first) return;
  const firstLocalId = first.localId;

  // 그룹 앞 강제 나눔(§3.1 쪽당 N문제 + §3.2 항목별 breakBefore). 상태 갱신도 여기서.
  // 실제 부착은 그룹이 낸 첫 블록(지문 또는 첫 문항)에 — 아래 groupHead.
  const firstBreak = itemBreakFields(first);
  const forced = decideGroupBreak({
    state: breakState,
    budget: opts.forcePerPage?.columns,
    sectionColumns,
    questionCount: items.length,
    breakBefore: firstBreak.breakBefore,
    keepWithPrev: Boolean(firstBreak.keepWithPrev),
  });
  let groupHead: BlockNode[] | null = null;

  const passageBlocks = renderGroupPassage(group, opts);
  const passageRenderedSeparately = passageBlocks.length > 0;
  if (passageRenderedSeparately) {
    if (firstLocalId) {
      applyBreak(passageBlocks, opts.breakPlan.get(passageBreakKey(firstLocalId)));
    }
    groupHead = passageBlocks;
    opts.target.push(...passageBlocks);
  }
  items.forEach((item, idx) => {
    const questionBlocks = applyQuestionBlockFormat(
      renderQuestionBlock({
        item,
        layout: opts.layout,
        includeAnswers: opts.includeAnswers,
        contentWidthHpu: opts.contentWidthHpu,
        groupPassageShown: group.includePassage,
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
    // 그룹 **2번째 이후** 문항에 걸린 명시 나눔(§3.2). 첫 문항 것은 decideGroupBreak 가
    // 이미 groupHead 에 반영하지만, 여기서 안 해주면 지문 묶음 안쪽 문항(예: 43~45 세트의
    // 44번)에 사용자가 건 「쪽 나눔」이 통째로 사라진다 — 네이티브 경로는 breakPlan 이
    // 비어 있어(builder.ts) 위 questionBreakKey 조회가 언제나 undefined 이기 때문이다.
    // §3.1 쪽 문항 카운터는 건드리지 않는다(미리보기도 강제 배치는 그룹 단위로만 센다).
    if (idx > 0) {
      const fields = itemBreakFields(item);
      if (!fields.keepWithPrev) {
        applyBreak(questionBlocks, explicitBreak(fields.breakBefore, sectionColumns));
      }
    }
    if (idx === 0 && !groupHead) groupHead = questionBlocks;
    opts.target.push(...questionBlocks);
  });
  // applyBreak 는 강한 쪽이 이기므로 breakPlan 나눔 뒤에 부착해도 안전하다.
  if (groupHead) applyBreak(groupHead, forced);
}

// 문항과 커스텀 블록(텍스트·섹션·구분선·여백·이미지)을 settings.blocks 순서대로 흘려보낸다.
// 순서 전체를 공용 buildGroups 에 한 번에 넣고(지문 묶음·세트·비문항 블록 분할 규칙이 웹과 같게),
// 문항 그룹은 appendQuestionGroup 으로, 커스텀 블록은 그 자리에 끼운다.
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
  /** 쪽당 N문제 강제 배치(SPEC §3.1). columns = 단 수(= 쪽당 문제 예산). 미지정 = 강제 없음. */
  forcePerPage?: { columns: 1 | 2 };
  /** 이 구역의 실제 단 수. 1단이면 breakBefore="column" 을 page 로 승격한다(§3.2). 기본 2. */
  sectionColumns?: 1 | 2;
}) {
  const sectionColumns = opts.sectionColumns ?? 2;
  // 강제 나눔 상태는 이 함수가 소유한다 — 커스텀 블록이 문항 사이에 끼어도 쪽 문항 카운터가
  // 0 으로 돌아가면 안 된다(§3.1).
  const breakState = createBreakFlowState();
  const entries = hwpxFlowEntries(opts.blocks, opts.resolvedItems);
  const entryOf = new Map<object, HwpxFlowEntry>(entries.map((entry) => [entry.paper, entry]));

  for (const group of buildGroups(entries.map((entry) => entry.paper))) {
    const members = groupEntries(group, entryOf);
    const head = members[0];
    if (!head) continue;
    if (!head.resolved) {
      if (head.block) appendCustomBlock(head.block, opts, sectionColumns, breakState);
      continue;
    }
    appendQuestionGroup({
      ...opts,
      group,
      items: members.flatMap((entry) => (entry.resolved ? [entry.resolved] : [])),
      sectionColumns,
      breakState,
    });
  }
}

function appendCustomBlock(
  block: BuilderBlock,
  opts: {
    target: BlockNode[];
    compact: boolean;
    contentWidthHpu: number;
    imageColWidthHpu: number;
    imageMaxHeightHpu: number;
    breakPlan: BreakPlan;
  },
  sectionColumns: 1 | 2,
  breakState: BreakFlowState,
) {
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
  // §3.2 — 커스텀 블록(텍스트·섹션·구분선·여백·이미지)도 breakBefore 를 존중한다.
  // 문항이 아니므로 쪽 문항 카운터(§3.1)는 건드리지 않지만(미리보기와 동일),
  // 쪽을 넘겼으면 그 쪽의 문항 수는 0 에서 다시 센다.
  if (breakState.started && !block.keepWithPrev) {
    const forced = explicitBreak(block.breakBefore, sectionColumns);
    if (forced === "page") breakState.pageQuestionCount = 0;
    applyBreak(customBlocks, forced);
  }
  if (customBlocks.length > 0) breakState.started = true;
  opts.target.push(...customBlocks);
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
      blocks.push(...renderQuestionPart(part, fopts, fragment.includePassage));
    }
  }
  if (blocks.length === 0) {
    blocks.push({ kind: "p", style: { spaceAfter: 0 }, runs: [] });
  }
  return blocks;
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


// 각 그룹(지문 + 문항들)을 "배치 단위(unit)"로 렌더한다. appendBlocksInOrder 와
// 같은 공용 그룹(buildGroups)·지문 박스를 쓰되, 평탄 배열 대신 placeKey 가 달린 unit 으로 내보낸다.
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
  const entries = hwpxFlowEntries(undefined, opts.items);
  const entryOf = new Map<object, HwpxFlowEntry>(entries.map((entry) => [entry.paper, entry]));
  for (const group of buildGroups(entries.map((entry) => entry.paper))) {
    const items = groupEntries(group, entryOf).flatMap((entry) =>
      entry.resolved ? [entry.resolved] : [],
    );
    const first = items[0];
    if (!first) continue;
    const passageBlocks = renderGroupPassage(group, {
      passageStyle: opts.passageStyle,
      showPassageTitle: opts.showPassageTitle,
      compact: opts.compact,
      contentWidthHpu: opts.columnWidthHpu,
    });
    if (passageBlocks.length > 0) {
      units.push({
        placeKey: first.localId ? passageBreakKey(first.localId) : null,
        blocks: passageBlocks,
      });
    }
    items.forEach((item) => {
      const questionBlocks = applyQuestionBlockFormat(
        renderQuestionBlock({
          item,
          layout: opts.layout,
          includeAnswers: opts.includeAnswers,
          contentWidthHpu: opts.columnWidthHpu,
          groupPassageShown: group.includePassage,
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
