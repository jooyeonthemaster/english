// ============================================================================
// 방문 분석 거부 — 브라우저 전용(클라이언트 공용 순수 모듈).
// 개인정보처리방침의 「행태정보 수집 거부」 수단:
//   1) 거부 쿠키 smoat_analytics_optout=1 (방침 페이지 토글이 설정)
//   2) 브라우저 Global Privacy Control(navigator.globalPrivacyControl === true)
//   3) 쿠키·localStorage 가 모두 막힌 브라우저(식별자를 둘 곳이 없으면 보내지 않는다)
// 1st-party 트래커(client.ts)와 마케팅 픽셀(marketing-pixels.tsx)이 모두 이 판정을 따른다.
// ============================================================================

export const OPT_OUT_COOKIE = "smoat_analytics_optout";

/**
 * 거부 설정이 바뀐 순간 발사하는 이벤트 — 같은 문서 안에서 즉시 멈추게 하는 신호(RC-OPTOUT).
 * 트래커(client.ts)와 픽셀 로더(marketing-pixels.tsx)가 이 이름을 듣는다.
 * ⚠ 판정 결과는 **캐시하지 않는다** — 모든 진입점이 매번 isAnalyticsBlocked() 를 다시 본다.
 */
export const CONSENT_EVENT = "smoat:analytics-consent";

function storageUsable(): boolean {
  let cookieOk = false;
  try {
    cookieOk = navigator.cookieEnabled !== false;
  } catch {
    cookieOk = false;
  }
  let lsOk = false;
  try {
    const k = "__smoat_ls_probe";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    lsOk = true;
  } catch {
    lsOk = false;
  }
  return cookieOk || lsOk;
}

export function hasOptOutCookie(): boolean {
  try {
    return new RegExp(`(?:^|;\\s*)${OPT_OUT_COOKIE}=1`).test(document.cookie);
  } catch {
    return false;
  }
}

export function hasGlobalPrivacyControl(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** true 면 방문 분석·픽셀을 전혀 실행하지 않는다. */
export function isAnalyticsBlocked(): boolean {
  if (typeof window === "undefined") return true;
  return hasOptOutCookie() || hasGlobalPrivacyControl() || !storageUsable();
}

/** 거부/허용 설정. 거부 시 식별자(smoat_vid·smoat_ses)도 지운다. */
export function setAnalyticsOptOut(optOut: boolean) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    if (optOut) {
      document.cookie = `${OPT_OUT_COOKIE}=1; Max-Age=${60 * 60 * 24 * 730}; Path=/; SameSite=Lax${secure}`;
      document.cookie = `smoat_vid=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
      try {
        // visitor-store.ts 가 쓰는 키 전부(식별자·세션·전환 발사 기록)
        window.localStorage.removeItem("smoat_vid");
        window.localStorage.removeItem("smoat_ses");
        window.localStorage.removeItem("smoat_cv");
      } catch {
        // 무시
      }
    } else {
      document.cookie = `${OPT_OUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    }
  } catch {
    // 무시
  }
  // 쿠키를 쓴 뒤 곧바로 알린다 — 새로고침 없이 이 문서에서 수집·발사가 멈춘다.
  notifyConsentChanged();
}

/** 거부 설정 변경 통지(토글·다른 탭에서 호출). */
export function notifyConsentChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { blocked: isAnalyticsBlocked() } }));
  } catch {
    // 무시
  }
}
