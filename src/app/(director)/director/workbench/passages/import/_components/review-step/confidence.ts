// ============================================================================
// Confidence tiers (4-way — 안전 / 의심 / 위험 / 치명).
//
// 기존 2단 구분은 0.5~0.9 구간을 모두 약한 스카이블루로 덮어 "의심" 상태가
// 시각적으로 인지되지 않았다. 이제 4개 임계값으로 분리한다:
//   >= 0.9 (안전)  — 오버레이 없음
//   0.7~0.9 (의심) — bg-sky-100/60 + ring-sky-300
//   0.5~0.7 (위험) — bg-rose-50/60 + ring-rose-300
//   <  0.5 (치명) — bg-rose-100/70 + ring-rose-400
// amber/orange는 브랜드 금지 — 스카이/로즈 명도로 3단 구분을 구현.
// CONFIDENCE_CRITICAL은 constants.ts에서 import (다른 레이어도 동일 기준 공유).
// ============================================================================

import {
  CONFIDENCE_CRITICAL,
  CONFIDENCE_GREEN,
  CONFIDENCE_YELLOW,
} from "@/lib/extraction/constants";
import type { ConfidenceTier } from "./types";

export function classifyConfidence(confidence: number | null): ConfidenceTier {
  if (confidence == null) return "unknown";
  if (confidence >= CONFIDENCE_GREEN) return "safe";
  if (confidence >= CONFIDENCE_YELLOW) return "suspect";
  if (confidence >= CONFIDENCE_CRITICAL) return "danger";
  return "critical";
}

export function toneForConfidence(confidence: number | null): {
  bg: string;
  text: string;
  label: string;
} {
  const tier = classifyConfidence(confidence);
  const label =
    confidence == null ? "—" : `${Math.round(confidence * 100)}%`;
  if (tier === "unknown")
    return { bg: "bg-slate-100", text: "text-slate-500", label };
  if (tier === "safe")
    return { bg: "bg-emerald-100", text: "text-emerald-700", label };
  if (tier === "suspect")
    return { bg: "bg-sky-100", text: "text-sky-800", label };
  if (tier === "danger")
    return { bg: "bg-rose-50", text: "text-rose-700", label };
  return { bg: "bg-rose-100", text: "text-rose-800", label };
}

export function confidenceLayer(confidence: number | null): string {
  const tier = classifyConfidence(confidence);
  if (tier === "unknown" || tier === "safe") return "bg-transparent";
  if (tier === "suspect") return "bg-sky-100/60 ring-1 ring-sky-300";
  if (tier === "danger") return "bg-rose-50/60 ring-1 ring-rose-300";
  return "bg-rose-100/70 ring-1 ring-rose-400";
}

/**
 * P1-1: 트리 깊이 상한 (CHOICE가 자기 CHOICE 자식이 되는 오염 데이터에서
 *       CSS 무한 인덴트를 방지). 3단을 넘으면 안내 메시지와 함께 자식 렌더 중단.
 * P1-2: aria-level + roving tabindex (선택된 노드만 tabIndex=0, 나머지 -1).
 */
export const MAX_TREE_DEPTH = 3;
