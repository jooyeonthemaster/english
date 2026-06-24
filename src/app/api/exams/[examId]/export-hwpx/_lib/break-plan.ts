/**
 * 미리보기(A4PaperPage)의 페이지/단 분할을 HWPX 다운로드에 그대로 반영하기 위한
 * "분할 계획(break plan)" 생성기.
 *
 * 핵심 아이디어:
 *  - 웹 미리보기는 pagination.ts(paginateGroups)로 각 문항/지문이 어느
 *    페이지·어느 단에 들어가는지 미리 확정한다. HWPX 는 그 결정을 무시하고
 *    한컴 자동 흐름에 맡겨 와서, 양쪽의 줄/단/페이지 넘김이 완전히 달라졌다.
 *  - 이 모듈은 서버에서 동일한 paginateGroups 를 돌려, "각 단/페이지를
 *    시작하는 단위"를 찾아낸다. 빌더는 그 단위의 첫 블록에
 *    columnBreak/pageBreak 를 부여해 미리보기와 같은 위치에서 넘어가게 한다.
 *
 * 분할 단위(unit)는 두 종류다.
 *  - passage:<firstItemLocalId>  지문 묶음(그룹)의 지문 블록이 단/페이지를 시작
 *  - question:<localId>          문항(또는 커스텀 블록)이 단/페이지를 시작
 *
 * 한컴에서 지문/문항은 (표/문단 묶음으로) 통째로 그려지므로, 미리보기처럼 한
 * 문항을 단 경계에서 쪼개지는 않는다. 대신 "그 단위가 미리보기에서 처음
 * 등장한 단/페이지"에 강제 break 를 넣어, 단위 단위로 미리보기와 같은
 * 칸/페이지에 배치한다.
 */

import { paginateGroups } from "@/components/exams/paper-builder/pagination";
import {
  shouldForceSourcePassage,
  shouldRenderSourcePassageInsideQuestion,
} from "@/components/exams/paper-builder/passage-policy";
import {
  normalizeInlineText,
  normalizePassageText,
  normalizeQuestionText,
} from "@/components/exams/paper-builder/text-normalization";
import type {
  OptionItem,
  PaginationSettings,
  PaperGroup,
  PaperItem,
  PaperPage,
  RenderFragment,
} from "@/components/exams/paper-builder/types";
import type { BuilderItemResolved } from "./render/question";
import type {
  BuilderBlock,
  BuilderLayout,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";

export type BreakType = "page" | "column";
export type BreakPlan = Map<string, BreakType>;

export interface BreakPlanResult {
  plan: BreakPlan;
  pageCount: number;
}

export function passageBreakKey(firstItemLocalId: string): string {
  return `passage:${firstItemLocalId}`;
}

export function questionBreakKey(localId: string): string {
  return `question:${localId}`;
}

// 빈 분할 계획 (정답포함 모드 등 분할을 강제하지 않을 때).
export const EMPTY_BREAK_PLAN: BreakPlanResult = {
  plan: new Map(),
  pageCount: 0,
};

function shouldRenderSeparateSourcePassage(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  if (shouldRenderSourcePassageInsideQuestion(item.sourceQuestion.subType)) {
    return false;
  }
  const passageContent =
    item.passageContent || item.sourceQuestion.passage?.content || "";
  return (
    Boolean(passageContent.trim()) &&
    (item.includePassage ||
      shouldForceSourcePassage({
        subType: item.sourceQuestion.subType,
        questionText: item.questionText || item.sourceQuestion.questionText,
        structuredData: item.sourceQuestion.structuredData,
        passage: { content: passageContent },
      }))
  );
}

function resolvePaperItemPassageTitle(item: PaperItem): string {
  return normalizeInlineText(
    item.passageTitle || item.sourceQuestion.passage?.title || "",
  );
}

function parseOptionsLoose(raw: unknown): OptionItem[] {
  if (Array.isArray(raw)) {
    return raw
      .map((o, idx) => ({
        label: String((o as OptionItem)?.label ?? idx + 1),
        text: String((o as OptionItem)?.text ?? ""),
      }))
      .filter((o) => o.text.length > 0 || o.label.length > 0);
  }
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o, idx) => ({
        label: String(o?.label ?? idx + 1),
        text: String(o?.text ?? ""),
      }))
      .filter((o) => o.text.length > 0 || o.label.length > 0);
  } catch {
    return [];
  }
}

function paginationSettingsFrom(
  layout: BuilderLayout,
  template: string | undefined,
  firstPageHeaderPx?: number,
  contentSafetyPx?: number,
): PaginationSettings {
  return {
    paperSize: layout.paperSize === "B4" ? "B4" : "A4",
    columns: layout.columns === 1 ? 1 : 2,
    density: layout.density === "compact" ? "compact" : "comfortable",
    // 정답 미포함 다운로드와 동일: 답란을 그대로 표시 (분할에 영향).
    showAnswerSpace: layout.showAnswerSpace !== false,
    showPassageTitle: layout.showPassageTitle === true,
    showQuestionMeta: layout.showQuestionMeta !== false,
    passageStyle: "plain",
    template: (template ?? "clean") as PaginationSettings["template"],
    // HWPX: 1쪽 헤더(제목/학생정보/안내문)를 본문 표 위 별도 블록으로 그리므로
    // 실제 한컴 렌더 높이를 page-0 용량에서 빼 첫 표가 1쪽에 들어가게 한다.
    ...(firstPageHeaderPx ? { firstPageHeaderPx } : {}),
    ...(contentSafetyPx ? { contentSafetyPx } : {}),
  };
}

/**
 * 영구 저장된 블록(또는 resolvedItems)을 pagination 이 소비할 수 있는
 * PaperItem[] 로 재구성한다. pagination 이 실제로 읽는 필드만 채우고
 * sourceQuestion 은 subType 만 필요하므로 최소 구성으로 캐스팅한다.
 *
 * 주의: 빌더 설정이 없는 시험지(route 의 fallback 경로)에서는 resolvedItems 에
 * localId / options / passage 필드가 없을 수 있다. 모든 접근을 방어적으로 한다.
 */
function reconstructPaperItems(opts: {
  blocks: BuilderBlock[] | undefined;
  resolvedItems: BuilderItemResolved[];
}): PaperItem[] {
  const { blocks, resolvedItems } = opts;

  const resolvedByLocalId = new Map<string, BuilderItemResolved>();
  const resolvedByQuestionId = new Map<string, BuilderItemResolved>();
  for (const item of resolvedItems) {
    if (item.localId) resolvedByLocalId.set(item.localId, item);
    if (item.questionId && !resolvedByQuestionId.has(item.questionId)) {
      resolvedByQuestionId.set(item.questionId, item);
    }
  }

  const makeQuestionItem = (
    block: Partial<BuilderBlock> & { localId?: string; questionId?: string },
    resolved: BuilderItemResolved | undefined,
  ): PaperItem => {
    const source = resolved?.sourceQuestion;
    const subType = source?.subType ?? null;
    const questionId =
      block.questionId ?? resolved?.questionId ?? resolved?.localId ?? "q";
    const localId =
      block.localId ?? resolved?.localId ?? `q-${questionId}`;
    const questionText = normalizeQuestionText(
      block.questionText ?? resolved?.questionText ?? source?.questionText ?? "",
    );
    const options =
      block.options !== undefined
        ? parseOptionsLoose(block.options)
        : resolved?.options ?? parseOptionsLoose(source?.options);
    const includePassage =
      block.includePassage ??
      resolved?.includePassage ??
      Boolean(source?.passage);
    const passageContent = normalizePassageText(
      block.passageContent ??
        resolved?.passageContent ??
        source?.passage?.content ??
        "",
    );
    const passageTitle = normalizeInlineText(
      block.passageTitle ||
        resolved?.passageTitle ||
        source?.passage?.title ||
        "",
    );

    return {
      localId,
      questionId,
      // pagination 은 sourceQuestion.subType 만 읽는다.
      sourceQuestion: { subType } as unknown as PaperItem["sourceQuestion"],
      orderNum: block.orderNum ?? resolved?.orderNum ?? 0,
      points: block.points ?? resolved?.points ?? 1,
      groupId: block.groupId ?? resolved?.groupId ?? `single:${localId}`,
      includePassage,
      passageTitle,
      passageContent,
      questionText,
      options,
      correctAnswer: "",
      answerSpaceLines:
        block.answerSpaceLines ?? resolved?.answerSpaceLines ?? 0,
      objectiveAnswerSlots:
        block.objectiveAnswerSlots ?? resolved?.objectiveAnswerSlots ?? 0,
      objectiveAnswerTexts:
        block.objectiveAnswerTexts ?? resolved?.objectiveAnswerTexts ?? [],
      sectionTitle: block.sectionTitle ?? "",
      teacherNote: block.teacherNote ?? resolved?.teacherNote ?? "",
      breakBefore: (block.breakBefore as PaperItem["breakBefore"]) ?? "auto",
      keepWithPrev: Boolean(block.keepWithPrev),
      blockType: "question",
      locked: false,
      blockTitle: "",
      blockText: "",
      blockAlign: "left",
      blockFontSize: "md",
      blockAccentColor: "#2563EB",
      dividerStyle: "solid",
      dividerThickness: 1,
      spacerHeight: 32,
      imageDataUrl: null,
      imageAlt: "",
      imageWidth: 70,
    };
  };

  const makeCustomItem = (block: BuilderBlock): PaperItem => {
    const localId = block.localId;
    return {
      localId,
      questionId: block.questionId ?? `custom:${localId}`,
      sourceQuestion: { subType: null } as unknown as PaperItem["sourceQuestion"],
      orderNum: 0,
      points: 0,
      groupId: block.groupId ?? `block:${localId}`,
      includePassage: false,
      passageTitle: "",
      passageContent: "",
      questionText: block.questionText ?? block.blockText ?? "",
      options: [],
      correctAnswer: "",
      answerSpaceLines: 0,
      objectiveAnswerSlots: 0,
      objectiveAnswerTexts: [],
      sectionTitle: block.sectionTitle ?? "",
      teacherNote: "",
      breakBefore: (block.breakBefore as PaperItem["breakBefore"]) ?? "auto",
      keepWithPrev: Boolean(block.keepWithPrev),
      blockType: (block.blockType as PaperItem["blockType"]) ?? "text",
      locked: Boolean(block.locked),
      blockTitle: block.blockTitle ?? "",
      blockText: block.blockText ?? "",
      blockAlign: (block.blockAlign as PaperItem["blockAlign"]) ?? "left",
      blockFontSize: (block.blockFontSize as PaperItem["blockFontSize"]) ?? "md",
      blockAccentColor: block.blockAccentColor ?? "#2563EB",
      dividerStyle:
        (block.dividerStyle as PaperItem["dividerStyle"]) ?? "solid",
      dividerThickness: block.dividerThickness ?? 1,
      spacerHeight: block.spacerHeight ?? 32,
      imageDataUrl: block.imageDataUrl ?? null,
      imageAlt: block.imageAlt ?? "",
      imageWidth: block.imageWidth ?? 70,
    };
  };

  if (blocks?.length) {
    const used = new Set<BuilderItemResolved>();
    return blocks.map((block) => {
      if (block.blockType !== "question") return makeCustomItem(block);
      let resolved = block.localId
        ? resolvedByLocalId.get(block.localId)
        : undefined;
      if (resolved && used.has(resolved)) resolved = undefined;
      if (!resolved && block.questionId) {
        const candidate = resolvedByQuestionId.get(block.questionId);
        if (candidate && !used.has(candidate)) resolved = candidate;
      }
      if (resolved) used.add(resolved);
      return makeQuestionItem(block, resolved);
    });
  }

  // v1: settings.blocks 가 없으면 resolvedItems(문항)만으로 구성.
  return resolvedItems.map((item) =>
    makeQuestionItem(
      {
        localId: item.localId,
        questionId: item.questionId,
        orderNum: item.orderNum,
        points: item.points,
        groupId: item.groupId ?? undefined,
        includePassage: item.includePassage,
        passageTitle: item.passageTitle,
        passageContent: item.passageContent,
        questionText: item.questionText,
        options: item.options,
        answerSpaceLines: item.answerSpaceLines,
        objectiveAnswerSlots: item.objectiveAnswerSlots,
        objectiveAnswerTexts: item.objectiveAnswerTexts,
      },
      item,
    ),
  );
}

// buildGroups (paper-item-utils.tsx) 와 동일한 그룹화 로직을 서버에서 재현한다.
// (원본은 .tsx 라 서버 번들에 끌어오지 않으려고 여기 순수 함수로 복제.)
function buildGroups(items: PaperItem[]): PaperGroup[] {
  const groups: PaperGroup[] = [];
  for (const item of items) {
    if (item.blockType !== "question") {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: false,
        passageTitle: "",
        passageContent: "",
      });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last && item.groupId && last.id === item.groupId) {
      last.items.push(item);
      if (shouldRenderSeparateSourcePassage(item) && item.passageContent) {
        last.includePassage = true;
        last.passageTitle = resolvePaperItemPassageTitle(item);
        last.passageContent = item.passageContent;
      }
    } else {
      groups.push({
        id: item.groupId || item.localId,
        items: [item],
        includePassage: shouldRenderSeparateSourcePassage(item),
        passageTitle: resolvePaperItemPassageTitle(item),
        passageContent: item.passageContent,
      });
    }
  }
  return groups;
}

/**
 * 미리보기와 동일한 분할을 계산해, 각 단/페이지를 "시작"하는 단위에 부여할
 * break 종류를 담은 맵을 만든다.
 *
 * break 계획은 어디까지나 "레이아웃 향상" 기능이다. 입력 데이터가 예상과
 * 다르더라도 다운로드 자체를 막아서는 안 되므로, 내부에서 예외가 나면 호출부
 * (builder)가 빈 plan 으로 안전하게 폴백할 수 있게 둔다(여기서는 throw 하지
 * 않고 빈 결과를 반환).
 */
export interface PaginatedLayout {
  pages: PaperPage[];
  settings: PaginationSettings;
}

/**
 * 미리보기(paginateGroups)가 계산한 "페이지 → 단 → fragment" 구조를 그대로 돌려준다.
 * HWPX 빌더가 이 구조를 단별 명시 표(per-column table)로 옮겨, 한컴 자동 다단
 * 흐름/균형 맞춤에 의존하지 않고 미리보기와 동일한 배치를 강제한다.
 * 실패하면 null (빌더는 기존 흐름 방식으로 폴백).
 */
export function computePaginatedLayout(opts: {
  blocks: BuilderBlock[] | undefined;
  resolvedItems: BuilderItemResolved[];
  layout: BuilderLayout;
  template: string | undefined;
  firstPageHeaderPx?: number;
  contentSafetyPx?: number;
}): PaginatedLayout | null {
  try {
    const paperItems = reconstructPaperItems({
      blocks: opts.blocks,
      resolvedItems: opts.resolvedItems,
    });
    if (paperItems.length === 0) return null;
    const settings = paginationSettingsFrom(
      opts.layout,
      opts.template,
      opts.firstPageHeaderPx,
      opts.contentSafetyPx,
    );
    const groups = buildGroups(paperItems);
    const { pages } = paginateGroups(groups, settings);
    if (!pages.length) return null;
    return { pages, settings };
  } catch {
    return null;
  }
}

export function computeBreakPlan(opts: {
  blocks: BuilderBlock[] | undefined;
  resolvedItems: BuilderItemResolved[];
  layout: BuilderLayout;
  template: string | undefined;
}): BreakPlanResult {
  try {
    const paperItems = reconstructPaperItems({
      blocks: opts.blocks,
      resolvedItems: opts.resolvedItems,
    });
    if (paperItems.length === 0) return EMPTY_BREAK_PLAN;

    const settings = paginationSettingsFrom(opts.layout, opts.template);
    const groups = buildGroups(paperItems);
    const groupFirstLocalId = new Map<string, string>();
    for (const group of groups) {
      groupFirstLocalId.set(group.id, group.items[0]?.localId ?? group.id);
    }

    const { pages } = paginateGroups(groups, settings);
    const plan: BreakPlan = new Map();

    let prev: { p: number; c: number } | null = null;
    for (let p = 0; p < pages.length; p += 1) {
      const columns = pages[p];
      for (let c = 0; c < columns.length; c += 1) {
        const column = columns[c];
        if (!column || column.length === 0) continue;

        const f0: RenderFragment = column[0];
        let key: string | null = null;

        const leadsWithPassageStart =
          f0.includePassage &&
          f0.passageRenderedLines.length > 0 &&
          f0.passageStartLineIndex === 0;

        if (leadsWithPassageStart) {
          const firstLocalId =
            groupFirstLocalId.get(f0.groupSourceId) ??
            f0.parts[0]?.source.localId ??
            null;
          if (firstLocalId) key = passageBreakKey(firstLocalId);
        } else if (f0.parts.length > 0 && f0.parts[0].isStart) {
          key = questionBreakKey(f0.parts[0].source.localId);
        }
        // 그 외(지문/문항 "이어짐"으로 단을 시작): 깔끔히 끊을 시작 단위가
        // 없으므로 강제 break 를 넣지 않고 한컴 자동 흐름에 맡긴다.

        if (prev !== null && key) {
          if (p > prev.p) plan.set(key, "page");
          else if (c > prev.c) plan.set(key, "column");
        }

        prev = { p, c };
      }
    }

    return { plan, pageCount: pages.length };
  } catch {
    // 분할 계획 실패는 다운로드를 막지 않는다(폴백: 자동 흐름).
    return EMPTY_BREAK_PLAN;
  }
}
