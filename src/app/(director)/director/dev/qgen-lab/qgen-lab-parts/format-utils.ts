// qgen-lab UI 표기 유틸(순수) — 시간·비용·토큰·상태 라벨/색.
// 글자 크기는 rem 임의값을 쓴다: 전역 smoat-large-ui 가 text-xs·text-[11px] 류를 !important 로
// 키우는데, 이 화면은 엔지니어용 계기판이라 밀도를 지킨다(rem 은 html 기준이라 body 20px 영향 없음).

import type { ArmConfig } from "@/lib/qgen-lab/types";

/** 표시용 고정 환율(DB 없는 랩 — PLATFORM_USD_KRW_RATE 기본값과 동일). */
export const USD_KRW = 1350;

export function fmtMs(ms: number | null | undefined, digits = 1): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 600) return `${s.toFixed(digits)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(Math.round(s - m * 60)).padStart(2, "0")}s`;
}

export function fmtUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function fmtKrw(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  return `₩${Math.round(usd * USD_KRW).toLocaleString("ko-KR")}`;
}

export function fmtTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function fmtPct(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function fmtChars(n: number): string {
  return n < 1000 ? `${n}자` : `${(n / 1000).toFixed(1)}k자`;
}

/** "google/gemini-3.7-flash" → "gemini-3.7-flash" */
export function shortModel(slug: string | null | undefined): string {
  return String(slug ?? "").replace(/^[^/]+\//, "") || "—";
}

/** null 이 아닌 값만 더한다(전부 null 이면 null). */
export function sumNullable(values: (number | null | undefined)[]): number | null {
  let seen = false;
  let total = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) {
      seen = true;
      total += v;
    }
  }
  return seen ? total : null;
}

/** 팔 설정 한 줄 요약 — 모델 · effort · 예산 · 형식 · 계획 · 검증. */
export function armConfigLine(arm: ArmConfig): string {
  const g = arm.gen;
  const parts = [
    shortModel(g.model),
    g.effort ? `effort ${g.effort}` : "reasoning off",
    `${Math.round(g.maxTokens / 1000)}k`,
    g.format,
  ];
  if (g.providerPin?.length) parts.push(`pin ${g.providerPin.join(",")}`);
  if (arm.planner.id !== "none") parts.push(`plan ${arm.planner.id}/${arm.planner.mode}`);
  if (arm.verifier.id !== "none") parts.push(`verify ${arm.verifier.id}→${arm.verifier.onFail}`);
  return parts.join(" · ");
}

export const DIFFICULTY_SHORT: Record<ArmConfig["difficulty"], string> = {
  KILLER: "K",
  INTERMEDIATE: "I",
  BASIC: "B",
};

export const GROUP_LABEL: Record<ArmConfig["group"], string> = {
  baseline: "기준선",
  "luna-variant": "luna 변형",
  jev: "jev 설계",
  rescue: "구제 전략",
};

export const GROUP_ORDER: ArmConfig["group"][] = ["baseline", "luna-variant", "jev", "rescue"];

// ── 상태 ────────────────────────────────────────────────────────────────────

export type UiStatus =
  | "idle"
  | "queued"
  | "running"
  | "ok"
  | "gate_fail"
  | "error"
  | "aborted"
  | "skipped";

export const STATUS_LABEL: Record<UiStatus, string> = {
  idle: "대기",
  queued: "대기열",
  running: "실행 중",
  ok: "통과",
  gate_fail: "게이트 반려",
  error: "오류",
  aborted: "중단",
  skipped: "기록 있음",
};

/** 배지 톤 — 잉크/종이 팔레트 + 신호색(주황)은 실행 중에만. */
export const STATUS_TONE: Record<UiStatus, string> = {
  idle: "border-stone-300 bg-stone-100 text-stone-600",
  queued: "border-stone-300 bg-[#fbfaf6] text-stone-500",
  running: "border-orange-300 bg-orange-50 text-orange-700",
  ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
  gate_fail: "border-amber-300 bg-amber-50 text-amber-800",
  error: "border-red-300 bg-red-50 text-red-700",
  aborted: "border-stone-300 bg-stone-100 text-stone-500",
  skipped: "border-stone-300 bg-stone-50 text-stone-600",
};

/** 진행 막대·집계 막대 채움색. */
export const STATUS_FILL: Record<UiStatus, string> = {
  idle: "bg-stone-200",
  queued: "bg-stone-200",
  running: "bg-orange-500",
  ok: "bg-emerald-700",
  gate_fail: "bg-amber-600",
  error: "bg-red-700",
  aborted: "bg-stone-400",
  skipped: "bg-stone-500",
};
