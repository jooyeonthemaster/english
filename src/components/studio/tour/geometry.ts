// ============================================================================
// 투어 기하 — 순수 함수만 (.tmp-studio-tour/spec.md §1.4)
//
// 좌표 계약: 모든 rect 는 뷰포트 기준 px(getBoundingClientRect 좌표계).
// 스포트라이트는 rAF 마다 이 모듈의 함수로 목표 rect → 표시 rect 를 수렴시키고
// (지수 평활), SVG path 문자열과 카드 배치를 계산한다. React 상태는 개입하지
// 않으므로 이 파일은 DOM/React 를 import 하지 않는다(단위 검증 가능).
// ============================================================================

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** 패딩 확장 + 뷰포트 클램프(음수 크기 방지). */
export function expandRect(r: Rect, pad: number, vw: number, vh: number): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return {
    x,
    y,
    w: Math.max(0, Math.min(vw, r.x + r.w + pad) - x),
    h: Math.max(0, Math.min(vh, r.y + r.h + pad) - y),
  };
}

/** 중앙 카드 모드의 "컷아웃 없음" rect — 뷰포트 정중앙 0×0. */
export function centerRect(vw: number, vh: number): Rect {
  return { x: vw / 2, y: vh / 2, w: 0, h: 0 };
}

/** 지수 평활 한 스텝. alpha 1 = 즉시 스냅. Δ<snapEps 면 목표에 스냅한다. */
export function stepToward(cur: Rect, target: Rect, alpha: number, snapEps = 0.4): Rect {
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const next = {
    x: lerp(cur.x, target.x),
    y: lerp(cur.y, target.y),
    w: lerp(cur.w, target.w),
    h: lerp(cur.h, target.h),
  };
  if (
    Math.abs(next.x - target.x) < snapEps &&
    Math.abs(next.y - target.y) < snapEps &&
    Math.abs(next.w - target.w) < snapEps &&
    Math.abs(next.h - target.h) < snapEps
  ) {
    return { ...target };
  }
  return next;
}

export function rectsEqual(a: Rect, b: Rect, eps = 0.01): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.w - b.w) < eps &&
    Math.abs(a.h - b.h) < eps
  );
}

/**
 * evenodd 딤 path: 뷰포트 전체 사각형 + 라운드 사각형 컷아웃.
 * 컷아웃 크기 0 이면 구멍 조각을 생략한다(전면 딤 = 중앙 카드 모드).
 * 라운드 반지름은 변 길이 절반으로 클램프(음수 아크 방지).
 */
export function holePath(vw: number, vh: number, r: Rect, radius: number): string {
  const outer = `M0 0H${vw}V${vh}H0Z`;
  if (r.w < 1 || r.h < 1) return outer;
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
  const x = r.x;
  const y = r.y;
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const hole =
    `M${x + rad} ${y}` +
    `H${right - rad}` +
    `A${rad} ${rad} 0 0 1 ${right} ${y + rad}` +
    `V${bottom - rad}` +
    `A${rad} ${rad} 0 0 1 ${right - rad} ${bottom}` +
    `H${x + rad}` +
    `A${rad} ${rad} 0 0 1 ${x} ${bottom - rad}` +
    `V${y + rad}` +
    `A${rad} ${rad} 0 0 1 ${x + rad} ${y}` +
    `Z`;
  return outer + hole;
}

// ── 툴팁 카드 배치 ──────────────────────────────────────────────────────────

export type CardSide = "top" | "bottom" | "left" | "right" | "center";

export interface CardPlacement {
  x: number;
  y: number;
  side: CardSide;
  /** 꼬리(화살표) 위치 — 카드 좌상단 기준 px. side 가 top/bottom 이면 x축, left/right 면 y축. */
  arrow: number;
}

export const CARD_MARGIN = 8; // 뷰포트 가장자리 최소 여백(T3 계약)
const CARD_GAP = 14; // 컷아웃과 카드 사이 간격

/**
 * 카드 배치 솔버. hole = 패딩 적용된 컷아웃 rect. 크기 0 이면 중앙 배치.
 * preferred 를 먼저 시도하고, 안 맞으면 여유 공간이 가장 큰 변을 고른다.
 * 반환 좌표는 항상 뷰포트 안(4변 CARD_MARGIN)으로 클램프된다.
 */
export function placeCard(
  hole: Rect,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  preferred: "auto" | "top" | "bottom" | "left" | "right" = "auto",
): CardPlacement {
  if (hole.w < 1 && hole.h < 1) {
    return {
      x: clamp((vw - cardW) / 2, CARD_MARGIN, Math.max(CARD_MARGIN, vw - cardW - CARD_MARGIN)),
      y: clamp((vh - cardH) / 2, CARD_MARGIN, Math.max(CARD_MARGIN, vh - cardH - CARD_MARGIN)),
      side: "center",
      arrow: 0,
    };
  }

  const room = {
    top: hole.y,
    bottom: vh - (hole.y + hole.h),
    left: hole.x,
    right: vw - (hole.x + hole.w),
  };
  const fits = {
    top: room.top >= cardH + CARD_GAP + CARD_MARGIN,
    bottom: room.bottom >= cardH + CARD_GAP + CARD_MARGIN,
    left: room.left >= cardW + CARD_GAP + CARD_MARGIN,
    right: room.right >= cardW + CARD_GAP + CARD_MARGIN,
  };

  const SIDES: Exclude<CardSide, "center">[] = ["bottom", "right", "top", "left"];
  let side: Exclude<CardSide, "center">;
  if (preferred !== "auto" && fits[preferred]) {
    side = preferred;
  } else {
    const fitting = SIDES.filter((s) => fits[s]).sort((a, b) => room[b] - room[a]);
    side = fitting[0] ?? [...SIDES].sort((a, b) => room[b] - room[a])[0];
  }

  const holeCx = hole.x + hole.w / 2;
  const holeCy = hole.y + hole.h / 2;
  let x: number;
  let y: number;
  if (side === "top") {
    x = holeCx - cardW / 2;
    y = hole.y - CARD_GAP - cardH;
  } else if (side === "bottom") {
    x = holeCx - cardW / 2;
    y = hole.y + hole.h + CARD_GAP;
  } else if (side === "left") {
    x = hole.x - CARD_GAP - cardW;
    y = holeCy - cardH / 2;
  } else {
    x = hole.x + hole.w + CARD_GAP;
    y = holeCy - cardH / 2;
  }

  x = clamp(x, CARD_MARGIN, Math.max(CARD_MARGIN, vw - cardW - CARD_MARGIN));
  y = clamp(y, CARD_MARGIN, Math.max(CARD_MARGIN, vh - cardH - CARD_MARGIN));

  // 꼬리는 컷아웃 중심을 향해 카드 변 위에서 클램프(모서리 16px 안쪽).
  const arrow =
    side === "top" || side === "bottom"
      ? clamp(holeCx - x, 16, Math.max(16, cardW - 16))
      : clamp(holeCy - y, 16, Math.max(16, cardH - 16));

  return { x, y, side, arrow };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * 오버레이 데모 배치: 앵커 rect **안쪽 상단 정렬**이 기본이다 — 중심 정렬은
 * 앵커가 화면 전고(aside)일 때 오버레이가 헤더 위까지 뚫고 올라가 캡션이
 * 잘리는 실사고를 냈다(적대검수 확정 major). 폭·높이는 앵커를 우선하되
 * 최소 크기 보장 시에만 초과하고, 항상 뷰포트로 최종 클램프한다.
 */
export function placeOverlay(
  anchorRect: Rect,
  minW: number,
  minH: number,
  vw: number,
  vh: number,
): Rect {
  const w = Math.max(anchorRect.w, minW);
  const anchorTop = Math.max(anchorRect.y, CARD_MARGIN);
  const anchorRoom = vh - CARD_MARGIN - anchorTop;
  const h = Math.min(Math.max(Math.min(anchorRect.h, anchorRoom), minH), vh - CARD_MARGIN * 2);
  const x = clamp(
    anchorRect.x + anchorRect.w / 2 - w / 2,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, vw - w - CARD_MARGIN),
  );
  const y = clamp(
    anchorTop,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, vh - h - CARD_MARGIN),
  );
  return { x, y, w, h };
}
