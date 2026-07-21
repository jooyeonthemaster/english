"use client";

// generate-page-client.tsx 공유 유틸(스펙 §레인1 U6 lib) — U4(use-extraction-review.ts)
// 가 fetchReviewAction·isAbortError 를 먼저 필요로 해 이 파일을 선생성했고,
// 나머지 상수·유틸(GENERATE_TUTORIAL_ENABLED, MobileStep, derivePastedTitle 등)은
// U6 에서 합류했다. 코드는 generate-page-client.tsx 에서 바이트 동일 이동(무회귀).

// 튜토리얼(문제 생성 투어) 임시 비활성화 — 미완성 기능이라 배포에서 숨긴다.
// 재활성화: 아래 값을 true 로 바꾸면 "튜토리얼" 버튼과 투어 오버레이가 다시 노출된다.
export const GENERATE_TUTORIAL_ENABLED = false;

// ─── Helpers ─────────────────────────────────────────────

// ── 모바일 스텝 플로우 (<lg 전용) ──
// 한 화면 = 한 기능: 지문 입력 → 내 지문함 → 워크스페이스 → 문제 확인.
// PC(≥lg)는 기존 통합 레이아웃 그대로 — 숨김은 전부 max-lg: 클래스라서
// 데스크톱 DOM/동작에는 영향이 없다.
export type MobileStep = "input" | "library" | "workspace" | "results";
export const MOBILE_FLOW_STEPS = [
  { key: "input", label: "지문 입력" },
  { key: "library", label: "내 지문함" },
  { key: "workspace", label: "워크스페이스" },
  { key: "results", label: "문제 확인" },
] as const;

/** Build a passage title from the first non-empty line of pasted content. */
export function derivePastedTitle(content: string): string {
  const firstLine = (
    content.split(/\r?\n/).find((l) => l.trim().length > 0) || content
  ).trim();
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  const base = words || "직접 입력 지문";
  return base.length > 60 ? base.slice(0, 60) + "…" : base;
}

/**
 * djb2 — "포인트 짚어주기" 지문 본문 신선도 검증용 경량 해시(암호학적 강도
 * 불필요, point-suggest 라우트의 캐시 해시와 같은 규칙). 포인트를 지정하던
 * 시점의 본문과 달라졌는지(오프셋·축자 신뢰 불가)를 판정한다.
 */
export function hashPassageText(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i += 1) {
    h = ((h * 33) ^ content.charCodeAt(i)) >>> 0;
  }
  return `${content.length}:${h.toString(16)}`;
}

export const SAVED_QUESTIONS_DONE_REFRESH_DELAY_MS = 1500;

export const REVIEW_ACTION_TIMEOUT_MS = 30_000;

export function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException) ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

export async function fetchReviewAction(
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    REVIEW_ACTION_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}
