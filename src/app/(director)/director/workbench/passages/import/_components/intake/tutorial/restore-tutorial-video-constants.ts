import { Easing, interpolate } from "remotion";
export const RESTORE_TUT_W = 1280;

export const RESTORE_TUT_H = 720;

export const RESTORE_TUT_FPS = 30;

export const RESTORE_TUT_TOTAL = 790;

export const C = {
  blue: "#2563EB",
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
  amber50: "#FFFBEB",
  amber200: "#FDE68A",
  amber700: "#B45309",
};

export const FONT = '"Pretendard", -apple-system, system-ui, sans-serif';

export const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export const S = {
  add: [0, 90],
  crop: [90, 252],
  analyze: [252, 420],
  restore: [420, 610],
  start: [610, 790],
} as const;

export const T = {
  approach: [104, 124],
  draw: [124, 174],
  card: [174, 212],
  aiPulse: [278, 356],
  restore: [438, 512],
  startApproach: [622, 654],
  startClick: [654, 674],
  toast: [680, 790],
} as const;

export const LEFT = { x: 28, y: 96, w: 720, h: 560 };

export const RIGHT = { x: 764, y: 96, w: 488, h: 560 };

export const PAPER = { x: 52, y: 116, w: 668, h: 520 };

export const CROP_BOX = { x: 68, y: 176, w: 310, h: 380 };

export const START_BTN = { x: RIGHT.x + RIGHT.w / 2, y: 664 + 22 };

export const CURSOR_TIP = { dx: 4, dy: 3 };

export type Rect = { x: number; y: number; w: number; h: number };

export function clampInterp(
  frame: number,
  range: readonly [number, number],
  out: readonly [number, number],
  easing?: (n: number) => number,
) {
  return interpolate(frame, range, out, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}
