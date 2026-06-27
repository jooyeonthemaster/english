import { TOUR_CARD_ESTIMATED_H, TOUR_CARD_W } from "./tour-constants";
import type { TargetRect } from "./tour-types";

export function queryTourTarget(target: string) {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(
    `[data-generate-tour="${target}"]`,
  );
}

export function firstAvailableTarget(targets: string[] | undefined) {
  if (!targets) return null;
  for (const target of targets) {
    const el = queryTourTarget(target);
    if (el) return el;
  }
  return null;
}

export function visibleTourTargets(targets: string[] | undefined) {
  if (!targets || typeof document === "undefined") return [];
  const elements: HTMLElement[] = [];
  for (const target of targets) {
    document
      .querySelectorAll<HTMLElement>(`[data-generate-tour="${target}"]`)
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) elements.push(el);
      });
  }
  return elements;
}

export function readRect(el: HTMLElement | null): TargetRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function centerPoint(rect: TargetRect) {
  return {
    left: Math.round(rect.left + rect.width / 2),
    top: Math.round(rect.top + rect.height / 2),
  };
}

export function approachPoint(rect: TargetRect) {
  return {
    left: Math.round(rect.left + Math.min(rect.width * 0.22, 42)),
    top: Math.round(rect.top - 34),
  };
}

export function isTourCardTarget(target: string | undefined) {
  return target?.startsWith("tour-") ?? false;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function getCardPosition(rect: TargetRect | null) {
  if (typeof window === "undefined") {
    return { left: 24, top: 24, width: TOUR_CARD_W };
  }
  const margin = 14;
  const width = Math.min(TOUR_CARD_W, window.innerWidth - margin * 2);
  if (!rect) {
    return {
      left: Math.round((window.innerWidth - width) / 2),
      top: Math.max(16, Math.round(window.innerHeight * 0.12)),
      width,
    };
  }

  const rightLeft = rect.right + margin;
  if (rightLeft + width <= window.innerWidth - margin) {
    return {
      left: rightLeft,
      top: clamp(
        rect.top + rect.height / 2 - TOUR_CARD_ESTIMATED_H / 2,
        margin,
        Math.max(margin, window.innerHeight - TOUR_CARD_ESTIMATED_H - margin),
      ),
      width,
    };
  }

  const leftLeft = rect.left - width - margin;
  if (leftLeft >= margin) {
    return {
      left: leftLeft,
      top: clamp(
        rect.top + rect.height / 2 - TOUR_CARD_ESTIMATED_H / 2,
        margin,
        Math.max(margin, window.innerHeight - TOUR_CARD_ESTIMATED_H - margin),
      ),
      width,
    };
  }

  const belowTop = rect.bottom + margin;
  const canBelow = belowTop + 360 <= window.innerHeight - margin;
  return {
    left: clamp(
      rect.left + rect.width / 2 - width / 2,
      margin,
      window.innerWidth - width - margin,
    ),
    top: canBelow
      ? belowTop
      : clamp(
          rect.top - 360 - margin,
          margin,
          window.innerHeight - 360 - margin,
        ),
    width,
  };
}
