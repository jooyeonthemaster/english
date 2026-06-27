import { Easing, interpolate } from "remotion";
export type GenerateTourVariant =
  | "overview"
  | "library"
  | "file"
  | "paste"
  | "workspace"
  | "precise"
  | "results";

export const GENERATE_TOUR_W = 960;

export const GENERATE_TOUR_H = 540;

export const GENERATE_TOUR_FPS = 30;

export const GENERATE_TOUR_TOTAL = 240;

export const C = {
  blue: "#2563EB",
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue300: "#93C5FD",
  blue700: "#1D4ED8",
  violet: "#7C3AED",
  violet50: "#F5F3FF",
  violet100: "#EDE9FE",
  violet200: "#DDD6FE",
  violet700: "#6D28D9",
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
  red: "#DC2626",
};

export const FONT =
  '"Pretendard", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export const FRAME_PAD = 18;

export const INNER_W = GENERATE_TOUR_W - FRAME_PAD * 2;

export const INNER_H = GENERATE_TOUR_H - FRAME_PAD * 2;

export const UI = {
  top: 62,
  leftX: 18,
  leftW: 260,
  midX: 292,
  midW: 372,
  rightX: 676,
  rightW: 230,
  gap: 14,
  safeRight: INNER_W - 18,
  resultTop: INNER_H - 18 - 134,
  resultW: INNER_W - 36,
};

export function clampInterp(
  frame: number,
  range: [number, number],
  output: [number, number],
) {
  return interpolate(frame, range, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
}

export function pulse(frame: number, start: number, end: number) {
  const p = clampInterp(frame, [start, end], [0, Math.PI * 2]);
  return 0.5 + Math.sin(p) * 0.5;
}
