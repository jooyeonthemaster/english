// ============================================================================
// 투어 진행 저장 + 자동 개방 억제 판정 (.tmp-studio-tour/spec.md §1.5)
//
// localStorage["studio-tour-v1"] = { v:1, status, step }
// - 자동 환영: 저장 없음 ∧ xl+ ∧ !navigator.webdriver ∧ ?tour=off 아님.
// - ?tour=start 는 억제를 무시하고 환영을 강제한다(투어 자체 프로브 전용 경로) —
//   기존 QA 프로브 12종은 webdriver 억제로 보호된다(스펙 §0-3, T4).
// ============================================================================

export const TOUR_STORAGE_KEY = "studio-tour-v1";

export type TourStatus = "pending" | "done" | "dismissed";

export interface TourStorageState {
  v: 1;
  status: TourStatus;
  /**
   * running 중 마지막으로 보던 **스텝 id** — 이어보기 재개 축.
   * index 가 아니라 id 인 것이 계약이다(스펙 §5-8): 스텝 삽입·재배열이
   * 일어나도 기존 이탈 사용자가 엉뚱한 스텝에서 재개되지 않는다(적대검수
   * 확정 — index 저장은 「id 개명 금지」 보호를 허구로 만들던 결함).
   * 빈 문자열 = 재개 지점 없음.
   */
  step: string;
}

export function readTourState(): TourStorageState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TourStorageState> | null;
    if (!parsed || parsed.v !== 1) return null;
    if (
      parsed.status !== "pending" &&
      parsed.status !== "done" &&
      parsed.status !== "dismissed"
    ) {
      return null;
    }
    return {
      v: 1,
      status: parsed.status,
      // 손상 방어: 문자열이 아니면(구 index 저장 포함) 재개 지점 없음으로 강등 —
      // 한 필드 손상이 유령 투어(빈 렌더 + 코치 영구 억제)로 증폭되지 않게 한다.
      step: typeof parsed.step === "string" ? parsed.step : "",
    };
  } catch {
    return null;
  }
}

export function writeTourState(state: TourStorageState): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 불가 환경 — 세션 내 상태만으로 동작
  }
}

/** URL 의 ?tour= 값. 렌더 후 클라이언트에서만 부른다(SSR 은 null). */
export function readTourParam(): "start" | "off" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = new URLSearchParams(window.location.search).get("tour");
    return v === "start" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

/**
 * dev 전용 좌표 게이트 음성테스트 훅(T9): ?tourShift=<px> 면 컷아웃을 고의로
 * 밀어서 T2 가 실제로 RED 를 내는지 증명한다. production 빌드에서는 항상 0.
 */
export function readTourShift(): number {
  if (typeof window === "undefined") return 0;
  if (process.env.NODE_ENV === "production") return 0;
  try {
    const v = Number(new URLSearchParams(window.location.search).get("tourShift"));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** 자동 환영을 억제해야 하는가(첫 방문 자동 개방 한정 — 수동 개방은 항상 허용). */
export function autoWelcomeSuppressed(): boolean {
  if (typeof window === "undefined") return true;
  // Playwright/자동화 컨텍스트: 기존 QA 프로브 12종이 빈 localStorage 로 진입하므로
  // 여기서 반드시 막는다. 투어 자체 프로브는 ?tour=start 로 뚫는다.
  if (navigator.webdriver) return true;
  if (readTourParam() === "off") return true;
  return false;
}

/** 투어 성립 뷰포트(xl = 조판 표면의 유일한 거처, 스펙 §5-3). */
export function isXlViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1280px)").matches;
}
