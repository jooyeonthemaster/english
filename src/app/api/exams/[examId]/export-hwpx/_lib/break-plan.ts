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
 * 입력 PaperItem·그룹은 웹과 같은 공용 정본이다(26-09-30 HWPX-CONSUMER):
 *   hwpxFlowEntries(blocks, resolvedItems) → PaperItem[] → buildGroups(paper-item-groups) → paginateGroups.
 * 예전의 서버 복제본(reconstructPaperItems·buildGroups·applyKoSetSharedPassages·
 * `includePassage ?? Boolean(source.passage)` 폴백)은 없앴다 — 네 번째 includePassage 규칙이자
 * 세 번째 buildGroups 였다(P3·P7).
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
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import type {
  PaginationSettings,
  PaperItem,
  PaperPage,
  RenderFragment,
} from "@/components/exams/paper-builder/types";
import type { BuilderItemResolved } from "./render/question";
import type {
  BuilderBlock,
  BuilderLayout,
} from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import { hwpxFlowEntries } from "./export-model";

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

function paginationSettingsFrom(
  layout: BuilderLayout,
  template: string | undefined,
  firstPageHeaderPx?: number,
  contentSafetyPx?: number,
): PaginationSettings {
  // 기본값은 웹 상세와 같은 정본(resolvePaperLayout). 라우트는 이미 판정된 boolean 을 넘기므로
  // 여기서 달라지는 것은 손입력(테스트) 뿐이다.
  const resolved = resolvePaperLayout({ layout, template });
  return {
    paperSize: resolved.paperSize,
    columns: resolved.columns,
    density: resolved.density,
    // 정답 미포함 다운로드와 동일: 답란을 그대로 표시 (분할에 영향).
    showAnswerSpace: resolved.showAnswerSpace,
    showPassageTitle: resolved.showPassageTitle,
    showQuestionMeta: resolved.showQuestionMeta,
    passageStyle: "plain",
    template: resolved.template,
    // HWPX 는 다중 빈칸 조합 선지를 「값1 …… 값2」 한 문단으로 쓴다(render/options.ts) —
    // 미리보기 컬럼 그리드(좁은 열 접힘) 추정을 쓰면 표 높이를 과대 예약한다.
    multiBlankOptionLayout: "inline",
    // HWPX 는 1쪽 머리말 높이를 page-0 용량에서 뺀다.
    //   **`!== undefined` 로 검사해야 한다.** truthy 검사(`firstPageHeaderPx ? …`)를 쓰면
    //   **0 이 falsy 라 키가 통째로 빠지고** pagination 이 자기 기본 머리말 높이를 예약한다.
    //   E36 에서 머리말을 전부 표지로 옮겨 실제 예약값이 0 이 되면서 이 함정이 실제로
    //   발동했다(존재하지 않는 머리말 자리를 1쪽에 계속 비워 두는 유령 예약).
    //   contentSafetyPx 도 같다 — env HWPX_SAFETY_PX=0 이 무시돼 기본 40 이 먹었다.
    ...(firstPageHeaderPx !== undefined ? { firstPageHeaderPx } : {}),
    ...(contentSafetyPx !== undefined ? { contentSafetyPx } : {}),
  };
}

/** 조판 순서의 공용 PaperItem[](문항 + 커스텀 블록) — builder-tables 와 같은 hwpxFlowEntries. */
function paperItemsForPlan(
  blocks: BuilderBlock[] | undefined,
  resolvedItems: BuilderItemResolved[],
): PaperItem[] {
  return hwpxFlowEntries(blocks, resolvedItems).map((entry) => entry.paper);
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
    const paperItems = paperItemsForPlan(opts.blocks, opts.resolvedItems);
    if (paperItems.length === 0) return null;
    const settings = paginationSettingsFrom(
      opts.layout,
      opts.template,
      opts.firstPageHeaderPx,
      opts.contentSafetyPx,
    );
    const { pages } = paginateGroups(buildGroups(paperItems), settings);
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
    const paperItems = paperItemsForPlan(opts.blocks, opts.resolvedItems);
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
