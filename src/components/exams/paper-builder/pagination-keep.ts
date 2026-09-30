import { continuationPartChrome, textMetricsOf } from "./pagination-metrics";
import type { FlowBlock, PaginationKeepSettings } from "./pagination-types";
import type { PaginationSettings } from "./types";

// ============================================================================
// 선지 묶음(keep-together) — docs/EXAM-PAPER-MODEL.md §9 (26-09-29).
//
// 한 문항의 선지 ①~⑤(다중 빈칸 그리드 행·객관식 추가 슬롯 ⑥… 포함)는 칸·쪽 경계에서 쪼개지 않는다.
// 발문 바로 뒤에 선지가 오는 문항(본문이 없거나 두 줄 이하)은 발문도 선지와 함께 옮겨, 칸 바닥에
// 발문만 남고 선지가 다음 칸에서 시작하는 일이 없게 한다. 한 칸보다 긴 묶음만 예외로 종전처럼
// 블록 단위로 흘린다. 지문·본문 줄은 묶지 않는다(한 문단이 15~18줄이라 묶으면 큰 공백이 생긴다).
//
// 조판기(pagination.ts)는 묶음 머리 블록에서
//   (1) 지금 칸에 묶음 전체가 안 들어가고 (2) 빈 다음 칸에는 들어가면 → 머리 앞에서 칸을 넘긴다.
// 머리를 놓은 뒤 묶음 전체가 그 칸에 들어가면 나머지 블록은 넘침 판정 없이 같은 칸에 둔다
// (추정 합의 부동소수 잡음으로 마지막 선지만 갈라지는 것 방지). 비용은 블록 높이 합이다 — 같은
// 문항·같은 조각 안의 뒤 블록은 여백·「(N번 계속)」 라벨이 더 붙지 않는다(marginalCostForBlock 과 일치).
// ============================================================================

/** 발문과 선지 사이 본문이 이 줄 수 이하면 발문+본문+선지를 한 묶음으로 본다(고아 발문 방지). */
export const KEEP_SHORT_BODY_LINES = 2;

/**
 * 「쪽당 N문제」 강제 배치를 실제로 쓸지 — **해설 포함(includeAnswers) 모드에서는 쓰지 않는다.**
 * HWPX(export-hwpx/_lib/builder.ts `forcePerPage = forceTwoPerPage && !includeAnswers`)와 같은 정책이다.
 * 강제 배치는 칸 용량을 무한으로 두고 넘침 가드도 끄므로, 해설이 붙어 문항 하나가 한 칸보다 커지면
 * 해설이 종이 아래로 넘쳐 잘린다(26-09-30 E1 — 빌더 「쪽당 2문제」 + [PDF 해설] 실측 넘친 칸 17개).
 * 해설 모드는 칸 용량으로 흘리고(해설 줄 단위 분할 · 선지 묶음 · 넘침 가드 모두 켜짐), 사용자가 직접
 * 지정한 항목별 나눔(breakBefore)은 그대로 존중한다. 조판기 · 선지 묶음 · 넘침 가드
 * (hooks/use-overflow-guarded-pagination)가 모두 이 함수 하나를 본다 — 따로 settings.forceTwoPerPage 를 읽지 말 것.
 */
export function forcedPerPageEnabled(
  settings: Pick<PaginationSettings, "forceTwoPerPage" | "includeAnswers">,
): boolean {
  return Boolean(settings.forceTwoPerPage) && !settings.includeAnswers;
}

/**
 * 선지 묶음 규칙을 쓸지. 명시값이 없으면 미리보기 글꼴 모델(exam-font)일 때만 켠다 —
 * HWPX break-plan 은 textMetrics 를 넘기지 않으므로(legacy) 쪽 나눔이 종전과 바이트 동일하다.
 * 강제 쪽당 N문제 모드는 칸 용량을 쓰지 않으므로 끈다(해설 모드는 강제 배치를 쓰지 않으므로 켜진다).
 */
export function keepOptionGroupsEnabled(settings: PaginationSettings & PaginationKeepSettings): boolean {
  if (forcedPerPageEnabled(settings)) return false;
  return settings.keepOptionGroups ?? textMetricsOf(settings) === "exam-font";
}

function sameItem(block: FlowBlock | undefined, localId: string): boolean {
  return !!block && block.kind !== "passage-line" && block.kind !== "passage-atom" && block.item.localId === localId;
}

function isFirstOption(block: FlowBlock | undefined, localId: string): boolean {
  return !!block && block.kind === "option" && block.index === 0 && block.item.localId === localId;
}

function isOptionRunMember(block: FlowBlock | undefined, localId: string): boolean {
  return (
    sameItem(block, localId) && !!block && (block.kind === "option" || block.kind === "objective-answer")
  );
}

/**
 * blocks[start] 에서 시작하는 묶음의 마지막 index. 묶음 머리가 아니면 -1.
 *  - 첫 선지(index 0): 같은 문항의 연속 선지(+추가 슬롯) 끝까지.
 *  - 발문(question-meta) 뒤에 같은 문항 본문 줄이 KEEP_SHORT_BODY_LINES 이하로 있고 곧바로 첫 선지가
 *    오면: 발문 + 그 본문 줄 + 선지 묶음 끝까지.
 * 묶을 게 없으면(선지 1개뿐) -1.
 */
export function keptRunEnd(blocks: readonly FlowBlock[], start: number): number {
  const head = blocks[start];
  if (!head) return -1;
  let first: number;
  if (head.kind === "question-meta") {
    const localId = head.item.localId;
    let cursor = start + 1;
    let bodyLines = 0;
    while (
      bodyLines <= KEEP_SHORT_BODY_LINES &&
      blocks[cursor]?.kind === "question-line" &&
      sameItem(blocks[cursor], localId)
    ) {
      bodyLines += 1;
      cursor += 1;
    }
    if (bodyLines > KEEP_SHORT_BODY_LINES || !isFirstOption(blocks[cursor], localId)) return -1;
    first = cursor;
  } else if (head.kind === "option" && head.index === 0) {
    first = start;
  } else {
    return -1;
  }
  const localId = head.item.localId;
  let end = first;
  while (isOptionRunMember(blocks[end + 1], localId)) end += 1;
  return end > start ? end : -1;
}

/** 묶음 머리 뒤(start+1 ~ end) 블록 높이 합 — 같은 문항·같은 조각이라 여백·라벨이 더 붙지 않는다. */
export function keptRunTailHeight(blocks: readonly FlowBlock[], start: number, end: number): number {
  let sum = 0;
  for (let index = start + 1; index <= end; index += 1) sum += blocks[index].height;
  return sum;
}

/**
 * 묶음 머리가 **빈 칸** 맨 위에 놓일 때의 비용(ensureFragment/ensurePart 와 같은 규칙):
 * 빈 칸이라 GROUP_GAP·ITEM_GAP 이 없고, 발문이 아닌 선지 머리는 이미 앞 칸에서 헤더를 그렸으므로
 * 「(N번 계속)」 라벨 자리가 붙는다.
 */
export function keptRunHeadFreshCost(head: FlowBlock, settings: PaginationSettings): number {
  return head.kind === "question-meta" ? head.height : head.height + continuationPartChrome(settings);
}
