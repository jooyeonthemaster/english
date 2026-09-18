// ============================================================================
// 트래커 보조 순수 함수 — 브라우저 전용. client.ts 의 상태 기계를 가볍게 유지하기 위한 분리.
// · 자동 이벤트 판정(외부 링크·파일 다운로드·data-track)
// · 캠페인 서명(새 세션 사유 판정)
// · 정화된 현재 URL(세션 ctx 로 보낼 값 — 토큰·PII 를 localStorage 에도 두지 않는다)
// 계약: docs/analytics/analytics-spec.md §3.1
// ============================================================================

import { maskSensitivePath, normalizePath, sanitizeQuery } from "./sanitize";

const DOWNLOAD_RE = /\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip|csv)(\?|#|$)/i;

export interface AutoEvent {
  name: string;
  props: Record<string, unknown>;
}

/** 클릭 1회에서 나올 자동 이벤트들(cta_click · download · outbound). */
export function classifyClick(target: Element | null): AutoEvent[] {
  const out: AutoEvent[] = [];
  if (!target || typeof target.closest !== "function") return out;
  const tracked = target.closest("[data-track]") as HTMLElement | null;
  if (tracked) {
    const label = tracked.getAttribute("data-track") || tracked.textContent?.trim().slice(0, 40) || "";
    out.push({ name: "cta_click", props: { label: label.slice(0, 80) } });
  }
  const a = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!a) return out;
  const href = a.href;
  if (!/^https?:/i.test(href)) return out;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return out;
  }
  if (DOWNLOAD_RE.test(url.pathname)) {
    out.push({ name: "download", props: { file: url.pathname.split("/").pop()?.slice(0, 80) ?? "" } });
  } else if (url.hostname !== location.hostname) {
    out.push({ name: "outbound", props: { host: url.hostname.slice(0, 80) } });
  }
  return out;
}

/** 이번 진입의 캠페인 서명 — 저장된 값과 다르면 새 세션이다(§3.1). */
export function campaignSignature(search: string): string | null {
  const q = sanitizeQuery(search);
  const parts = [
    q.utm_source,
    q.utm_medium,
    q.utm_campaign,
    q.gclid ? "gclid" : null,
    q.NaPm || q.n_media ? "naver_ad" : null,
    q.fbclid ? "fbclid" : null,
    q.ttclid ? "ttclid" : null,
    q.msclkid ? "msclkid" : null,
    q.sl,
  ].filter(Boolean);
  return parts.length ? parts.join("|").slice(0, 200) : null;
}

/** 허용 쿼리만 남기고 경로 토큰까지 가린 현재 URL. */
export function sanitizedHref(): string {
  const q = sanitizeQuery(location.search);
  const qs = new URLSearchParams(q).toString();
  const path = maskSensitivePath(normalizePath(location.pathname) ?? location.pathname);
  return `${location.origin}${path}${qs ? `?${qs}` : ""}`;
}
