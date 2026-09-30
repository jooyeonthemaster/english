/**
 * 선지·머리 묶음 유지(keep-together) 정책 — docs/EXAM-PAPER-MODEL.md §9.
 *
 * 렌더러는 문단에 의미 역할(ParagraphNode.keepRole)만 붙이고, 이 모듈 **한 곳**이 흐름형 본문
 * (네이티브 2단 구역·1단 흐름)의 최상위 블록 목록에서 역할을 OWPML <hh:breakSetting>
 * keepWithNext / keepLines 로 바꾼다. 표 셀에 담는 경로(구형 2단 표)는 이 함수를 부르지 않으므로
 * 역할 태그가 있어도 XML 이 바이트 동일하다.
 *
 * ── 한컴 2024 실측(26-09-29, scratchpad/wave1/hwpx-keep/probe*) ─────────────────────────────
 *  V-A1 keepWithNext 는 네이티브 2단의 단 경계와 쪽 경계 모두에서 동작한다(끄면 16/16 분리,
 *       켜면 0/16 — 머리+①~⑤ 가 통째로 다음 단/쪽 첫머리로 옮겨짐).
 *  V-A2 "first-lines": 다음 문단이 나눌 수 있는 본문이면 한컴은 그 **첫 줄만** 붙인다(머리가
 *       단 바닥에 1줄 여유라도 있으면 그대로 두고 지문 첫 줄을 함께 둔다). 지문 전체를 끌고
 *       가지 않는다.
 *  V-A3 사슬은 전이된다: kwn 문단 연속 + 그 뒤 문단이 한 덩어리로 움직인다.
 *  V-A4 한 단보다 긴 사슬/keepLines 문단: 멈추지 않는다. 대신 사슬 시작을 다음 단 첫머리로
 *       옮긴 뒤 거기서 쪼갠다 → 원래 단에 큰 빈칸이 남는다. 그래서 상한(CHAIN_CAP)이 필요하다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────────────────────────
 *  questionHead·caption·optionHead → keepWithNext + keepLines (머리 뒤가 또 머리면 kwn 없음)
 *  option                        → keepLines, 다음 최상위 블록이 option 일 때 keepWithNext. 빈 간격 문단
 *                                  (최대 MAX_BRIDGED_EMPTY 개) 너머가 역할 있는 표(정답 배지)면 그 빈 문단까지 이어 묶는다
 *  역할 있는 최상위 표(정답 배지)   → keepWithNext(표를 감싸는 문단의 paraPr — section-xml.ts). 배지가 단 끝에
 *                                  홀로 남던 고아(리뷰 실측 2→6)를 막는다: 선지 → 배지 → (빈 줄) → 「해설」 → 첫 줄.
 *  역할 없는 문단(지문·본문·해설)  → 0 (한 문단이 15~18줄이라 묶으면 큰 공백)
 *  kwn 문단 뒤의 빈 간격 문단은 사슬을 잇는다(라벨→빈 줄→내용에서 라벨이 고아가 되지 않게).
 *  가드: ① 다음 블록이 강제 쪽/단 나눔이면 kwn 을 뗀다 ② keepLines 단일 문단이 상한을 넘으면
 *        kl 을 뗀다 ③ 사슬 추정 높이가 단 높이×CAP 을 넘으면 뒤(선지 묶음)부터 들어가는 만큼
 *        남기고 그 앞에서 끊는다(②에서 뗀 문단은 첫 몇 줄만 센다). 끄기: env HWPX_KEEP_TOGETHER=0.
 */

import type { BlockNode, ParagraphNode, ParaStyle, TableNode } from "./types";
import { estimateBlocksHeight } from "./section-xml";

/**
 * 한 사슬이 쓸 수 있는 단 높이 비율. EXAM-PAPER-MODEL §9 「한 단보다 긴 묶음만 예외로 쪼갠다」.
 * 추정기 오차는 ESTIMATE_MARGIN 이 흡수한다(추정 × 1.15 > 단 높이면 쪼갬 = 실제 약 87% 이상).
 */
export const CHAIN_CAP_FRACTION = 1;
/** estimateBlocksHeight 는 글리프 부류 폭 모델이라 한컴 실측보다 작게 나올 수 있다. */
const ESTIMATE_MARGIN = 1.15;
/** V-A2 first-lines — 사슬 끝 본문 문단은 첫 몇 줄만 사슬 높이에 넣는다(실측 1줄, 여유 2줄). */
const TERMINAL_BODY_LINES = 2;
/** kwn 문단 뒤에서 사슬을 이어 줄 빈 간격 문단 최대 개수. */
const MAX_BRIDGED_EMPTY = 2;

export interface KeepPolicyStats {
  enabled: boolean;
  /** 역할 때문에 플래그를 받은 문단 수 */
  flagged: number;
  /** keepWithNext 사슬 수 */
  chains: number;
  /** 상한 때문에 끊긴 사슬 수 */
  cappedChains: number;
  /** 다음 블록의 강제 나눔 때문에 kwn 을 뗀 수 */
  breakConflicts: number;
  /** 상한보다 커서 keepLines 를 뗀 문단 수 */
  droppedKeepLines: number;
}

export function keepTogetherEnabled(): boolean {
  return process.env.HWPX_KEEP_TOGETHER !== "0";
}

const isP = (b: BlockNode | undefined): b is ParagraphNode => !!b && b.kind === "p";
/** 역할 있는 최상위 표(정답 배지). 떠 있는 표(머리말용)는 흐름에 없으므로 제외. */
const isRoleTable = (b: BlockNode | undefined): b is TableNode =>
  !!b && b.kind === "tbl" && Boolean(b.keepRole) && !b.float;
/** keepWithNext 가 켜진 사슬 구성원(문단 또는 역할 있는 표). */
type ChainNode = ParagraphNode | TableNode;
const hasKwn = (b: BlockNode | undefined): b is ChainNode =>
  (isP(b) && Boolean(b.style?.keepWithNext)) || (isRoleTable(b) && Boolean(b.keepWithNext));

function forcesBreak(b: BlockNode | undefined): boolean {
  if (!b) return false;
  if (b.kind === "columnPr") return true; // 단 설정이 바뀌는 지점도 사슬을 끊는다
  return Boolean(b.pageBreak || b.columnBreak);
}

function isEmptyPara(b: BlockNode | undefined): b is ParagraphNode {
  if (!isP(b) || b.keepRole) return false;
  return b.runs.every((r) => r.kind === "text" && r.text.trim() === "");
}

/**
 * blocks[from] 부터 빈 간격 문단을 최대 MAX_BRIDGED_EMPTY 개 건너뛴 다음 블록이 target 이면 건너뛴 빈 문단들을,
 * 아니면 null. 강제 나눔 문단에서는 멈춘다(나눔 너머와는 묶지 않는다).
 */
function emptyGapBefore(
  blocks: BlockNode[],
  from: number,
  target: (b: BlockNode | undefined) => boolean,
): ParagraphNode[] | null {
  const gap: ParagraphNode[] = [];
  let k = from;
  while (gap.length < MAX_BRIDGED_EMPTY && isEmptyPara(blocks[k]) && !forcesBreak(blocks[k])) {
    gap.push(blocks[k] as ParagraphNode);
    k++;
  }
  return target(blocks[k]) && !forcesBreak(blocks[k]) ? gap : null;
}

function setFlags(p: ParagraphNode, f: Pick<ParaStyle, "keepWithNext" | "keepLines">) {
  // 스타일 객체를 새로 만든다 — 렌더러가 같은 style 객체를 여러 문단에 공유해도 안전하게.
  p.style = { ...(p.style ?? {}), ...f };
}

function clearFlag(p: ChainNode, key: "keepWithNext" | "keepLines") {
  if (p.kind === "tbl") {
    if (key === "keepWithNext") p.keepWithNext = false;
    return;
  }
  p.style = { ...(p.style ?? {}), [key]: false };
}

/**
 * 흐름형 구역 본문(최상위 블록 목록)에 역할 → breakSetting 플래그를 적용한다. `blocks` 를 변경한다.
 * columnWidthHpu 는 줄바꿈 추정 폭(단 폭), columnHeightHpu 는 단 하나의 본문 높이.
 */
export function applyKeepPolicy(
  blocks: BlockNode[],
  opts: { columnWidthHpu: number; columnHeightHpu: number },
): KeepPolicyStats {
  const stats: KeepPolicyStats = {
    enabled: keepTogetherEnabled(),
    flagged: 0,
    chains: 0,
    cappedChains: 0,
    breakConflicts: 0,
    droppedKeepLines: 0,
  };
  if (!stats.enabled) return stats;

  // 1) 역할 → 플래그
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    if (isRoleTable(b)) {
      b.keepWithNext = Boolean(next);
      stats.flagged++;
      return;
    }
    if (!isP(b) || !b.keepRole) return;
    if (b.keepRole === "option") {
      const toOption = isP(next) && next.keepRole === "option";
      const gapToBadge = toOption ? null : emptyGapBefore(blocks, i + 1, isRoleTable);
      setFlags(b, { keepLines: true, keepWithNext: toOption || gapToBadge !== null });
      for (const gap of gapToBadge ?? []) setFlags(gap, { keepWithNext: true });
    } else {
      const headAfterHead =
        b.keepRole === "questionHead" && isP(next) && next.keepRole === "questionHead";
      setFlags(b, { keepLines: true, keepWithNext: Boolean(next) && !headAfterHead });
    }
    stats.flagged++;
  });

  // 1b) kwn 문단 바로 뒤 빈 간격 문단은 사슬을 잇는다(최대 MAX_BRIDGED_EMPTY 개).
  //     역할 문단에서만 시작한다 — 이어 붙인 빈 문단에서 다시 잇기 시작하면 연쇄로 번진다.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const roleKwn = isRoleTable(b) ? Boolean(b.keepWithNext) : isP(b) && Boolean(b.keepRole) && Boolean(b.style?.keepWithNext);
    if (!roleKwn) continue;
    for (let k = 1; k <= MAX_BRIDGED_EMPTY; k++) {
      const e = blocks[i + k];
      if (!isEmptyPara(e) || forcesBreak(e) || !blocks[i + k + 1]) break;
      setFlags(e, { keepWithNext: true });
      if (!isEmptyPara(blocks[i + k + 1])) break;
    }
  }

  // 2) 강제 쪽/단 나눔으로 시작하는 블록과는 묶지 않는다(쪽당 N문제·breakBefore 와 충돌 방지).
  blocks.forEach((b, i) => {
    if (hasKwn(b) && forcesBreak(blocks[i + 1])) {
      clearFlag(b, "keepWithNext");
      stats.breakConflicts++;
    }
  });

  const cap = opts.columnHeightHpu * CHAIN_CAP_FRACTION;
  const w = opts.columnWidthHpu;

  // 3) 상한보다 큰 keepLines 단일 문단은 보호를 뗀다(V-A4: 다음 단 첫머리로 밀린 뒤 결국 쪼개짐).
  //    사슬 상한(4)보다 먼저 한다 — 뗀 문단은 나눌 수 있는 본문이 되어 사슬 끝에서 첫 몇 줄만
  //    세므로(V-A2), 그 앞 머리가 kwn 을 잃고 단 바닥에 홀로 남지 않는다.
  for (const b of blocks) {
    if (isP(b) && b.style?.keepLines && measure([b], w) > cap) {
      clearFlag(b, "keepLines");
      stats.droppedKeepLines++;
    }
  }

  // 4) 사슬 상한 — 사슬 = kwn 문단의 최대 연속 + 그 뒤(함께 가야 할) 블록
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!hasKwn(b)) continue;
    let j = i;
    while (hasKwn(blocks[j])) j++;
    stats.chains++;
    if (trimChain(blocks.slice(i, j) as ChainNode[], blocks[j], w, cap)) {
      stats.cappedChains++;
    }
    i = j; // 끝 블록 다음부터
  }
  return stats;
}

function measure(bs: BlockNode[], w: number): number {
  return estimateBlocksHeight(bs, w) * ESTIMATE_MARGIN;
}

/** 사슬 끝 블록이 차지하는 높이: 나눌 수 있는 본문 문단이면 첫 몇 줄(V-A2), 아니면 전부. */
function terminalHeight(t: BlockNode | undefined, w: number): number {
  if (!t) return 0;
  const full = measure([t], w);
  if (!isP(t) || t.style?.keepLines) return full;
  const pct = (t.style?.lineSpacingPct ?? 158) / 100;
  const sizes = t.runs.map((r) => (r.kind === "text" ? (r.style?.size ?? 10) : 10));
  const lineHpu = Math.max(...sizes, 1) * 100 * Math.max(1, pct);
  const firstLines = (t.style?.spaceBefore ?? 0) + TERMINAL_BODY_LINES * lineHpu;
  return Math.min(full, firstLines * ESTIMATE_MARGIN);
}

/**
 * 탐욕 접미사: 사슬의 꼬리(선지 묶음 — 가장 온전히 두고 싶은 것)부터 상한에 들어가는 만큼
 * 남기고, 넘치는 지점 앞에서 kwn 을 뗀다. 떼어낸 문단은 앞쪽 사슬의 새 끝이 되어 예산을 다시
 * 센다. 무언가 끊었으면 true.
 */
function trimChain(
  kept: ChainNode[],
  terminal: BlockNode | undefined,
  w: number,
  cap: number,
): boolean {
  let total = terminalHeight(terminal, w);
  let cut = false;
  for (let k = kept.length - 1; k >= 0; k--) {
    const add = measure([kept[k]], w);
    if (total + add > cap) {
      clearFlag(kept[k], "keepWithNext"); // kept[k] 뒤에서 사슬이 끊긴다
      cut = true;
      total = terminalHeight(kept[k], w);
      continue;
    }
    total += add;
  }
  return cut;
}
