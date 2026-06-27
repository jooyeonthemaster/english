import { Easing, interpolate } from "remotion";
export const TUT_W = 1280;

export const TUT_H = 720;

export const TUT_FPS = 30;

export const TUT_TOTAL = 860;

export const C = {
  blue: "#2563EB",
  blueHover: "#1d4ed8",
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue300: "#93C5FD",
  blue700: "#1D4ED8",
  slate950: "#020617",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748B",
  slate400: "#94A3B8",
  slate300: "#CBD5E1",
  slate200: "#E2E8F0",
  slate100: "#F1F5F9",
  slate50: "#F8FAFC",
  white: "#FFFFFF",
  emerald: "#059669",
  emerald50: "#ECFDF5",
  emerald100: "#D1FAE5",
  red: "#DC2626",
};

export const FONT = '"Pretendard", -apple-system, system-ui, sans-serif';

// ── 장면 프레임 구간 ────────────────────────────────────────────────────────
export const S = {
  add: [0, 96],
  crop1: [96, 248],
  split: [248, 470],
  merge: [470, 690],
  start: [690, 860],
};

// 서브 타이밍(절대 프레임)
export const T = {
  // crop1
  c1Approach: [108, 126],
  c1Draw: [126, 162],
  c1Card: [162, 196],
  // split A
  aApproach: [260, 278],
  aDraw: [278, 312],
  aCard: [312, 344],
  // split B
  bApproach: [350, 368],
  bDraw: [368, 402],
  bCard: [402, 434],
  // merge
  check2: [486, 512],
  check3: [512, 538],
  btnGlow: [538, 566],
  btnClick: [566, 588],
  mergeAnim: [588, 648],
  // start
  startApproach: [702, 740],
  startClick: [740, 760],
  toast: [760, 860],
};

// ── 레이아웃 좌표 (1280×720) ───────────────────────────────────────────────
export const LEFT = { x: 28, y: 96, w: 720, h: 560 }; // 시험지 캔버스
export const RIGHT = { x: 764, y: 96, w: 488, h: 560 }; // 추출될 지문 패널
export const PAPER = { x: 52, y: 116, w: 668, h: 520 }; // 시험지 종이
// 지문 박스 타깃(캔버스 절대 좌표)
export const BOX1 = { x: 70, y: 196, w: 300, h: 150 }; // 지문 1 (단순)
export const BOXA = { x: 70, y: 384, w: 300, h: 116 }; // 지문 2 (나뉜 앞)
export const BOXB = { x: 392, y: 168, w: 300, h: 132 }; // 지문 3 (나뉜 뒤)

// ── 우측 패널 내부 레이아웃 (렌더와 커서 좌표가 같은 상수를 공유한다) ─────────
// 커서가 "체크박스/합치기 버튼/추출 버튼" 정확히 그 위에 떨어지도록, 패널 헤더·머지
// 바·카드에 고정 높이를 주고 그 수치로 클릭 타깃 좌표를 역산한다. 손으로 짐작한
// 오프셋(과거 +210/+380/+120)이 실제 렌더 위치와 어긋나 커서가 빈 공간을 누르던
// 문제를 제거하기 위함. CARD_CB_OFFSET_Y/CB_X 는 보더·패딩까지 반영한 실측치.
export const PANEL_CHROME_H = 80; // 헤더(38) + 머지바(42)
export const PANEL_PAD = 12; // 카드 그리드 패딩
export const CARD_GAP = 10;

export const CARD_H = 110; // 단일 조각 카드 고정 높이
export const CARD_CB_OFFSET_Y = 18; // 카드 top → 체크박스 세로 중앙(카드보더1 + 헤더34/2)
export const CB_X = RIGHT.x + PANEL_PAD + 11 + 9; // 그리드패딩 + (카드보더1+헤더좌패딩10) + 체크박스반9 = 796
export const PANEL_CONTENT_TOP = RIGHT.y + PANEL_CHROME_H + PANEL_PAD; // 첫 카드 top
export function cardTopY(i: number) {
  return PANEL_CONTENT_TOP + i * (CARD_H + CARD_GAP);
}

export function cbCenter(i: number) {
  return { x: CB_X, y: cardTopY(i) + CARD_CB_OFFSET_Y };
}

// 머지바 "한 지문으로 합치기" 버튼 중앙: 우측 정렬(우패딩14) + 버튼폭110/2
export const MERGE_BTN = { x: RIGHT.x + RIGHT.w - 14 - 55, y: RIGHT.y + 38 + 21 };

// 푸터 "추출 시작" 버튼 중앙
export const START_BTN = { x: RIGHT.x + RIGHT.w / 2, y: 664 + 22 };

// svg 포인터 꼭짓점이 (cx,cy)에 정확히 닿도록 커서 div를 좌상으로 보정
export const CURSOR_TIP = { dx: 4, dy: 3 };

export type Rect = { x: number; y: number; w: number; h: number };

export function clampInterp(
  frame: number,
  range: [number, number],
  out: [number, number],
  easing?: (n: number) => number,
) {
  return interpolate(frame, range, out, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
