"use client";

// ============================================================================
// 마케팅 픽셀 로더 — 루트 레이아웃에 SiteAnalytics 와 함께 1회 마운트. 계약 §8.3·§8.4
//
// · 허용 영역(marketing·/register·/login·director·teacher)이 아닌 경로에서는 아무것도 로드하지 않는다.
// · Clarity 는 더 좁은 영역(marketing·/register·/login)에서만 로드·녹화한다(§14 D13).
// · 허용 경로 첫 진입 → requestIdleCallback(없으면 2초) → GET /api/analytics/config → 설정된 스크립트만 주입.
// · 경로 변경마다: 허용 경로면 각 픽셀 pageview(제목이 채워진 뒤), 금지 경로면 발사 없음 + Clarity 즉시 중지.
// · 방문 분석 거부(거부 쿠키·GPC·저장소 차단)는 **모든 진입점에서 다시 확인**한다 — 거부 순간부터
//   같은 문서 안에서도 발사가 멈춘다(이전 구현은 최초 1회만 보고 이후 이동에서 계속 발사했다).
// · 1st-party 트래커가 받은 전환 지시(CONVERSION_EVENT)를 각 픽셀 전환으로 발사 —
//   로드 전이면 큐, sessionStorage 로 같은 전환 id 중복 발사 방지.
// usePathname 만 쓴다(useSearchParams 는 정적 페이지를 CSR 로 강등). 모든 예외를 삼킨다(I4).
// ============================================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONVERSION_EVENT, type ConversionDetail } from "@/lib/analytics/client";
import { isAnalyticsBlocked } from "@/lib/analytics/consent";
import {
  hasAnyPixel,
  isClarityAllowedPath,
  isPixelAllowedPath,
  sanitizePublicPixels,
  type PublicPixels,
} from "@/lib/analytics/pixels-common";
import { normalizePath } from "@/lib/analytics/sanitize";
import {
  fireConversion,
  firePageview,
  installClarity,
  installPixels,
  startClarity,
  stopClarity,
  type PixelConversion,
} from "./pixel-scripts";
import { whenTitleReady } from "./title-ready";

const CONFIG_URL = "/api/analytics/config";
const FIRED_KEY = "smoat_px_conv";
const FIRED_MAX = 50;

/**
 * 거부 설정이 바뀌면 consent.ts 가 이 이름으로 CustomEvent 를 발사한다(감독 RC-OPTOUT).
 * 아직 발사하지 않는 버전이어도 각 진입점의 재확인만으로 차단은 성립한다(이벤트는 즉시성 보강).
 */
export const CONSENT_EVENT = "smoat:analytics-consent";

/**
 * idle      — 아직 허용 경로를 밟지 않음(설정 조회도 안 함)
 * scheduled — 유휴 대기·설정 조회 중
 * fetched   — 설정은 받았지만 현재 경로가 금지라 주입 보류
 * ready     — 스크립트 주입 완료
 * off       — 설정된 픽셀 없음·조회 실패·방문 분석 거부(이번 페이지 수명 동안 아무것도 안 함)
 */
type Phase = "idle" | "scheduled" | "fetched" | "ready" | "off";

function conversionKey(c: PixelConversion): string {
  return `${c.type}:${c.id ?? "-"}`;
}

function readFired(): string[] {
  try {
    const raw = window.sessionStorage.getItem(FIRED_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markFired(key: string) {
  try {
    const next = [...readFired().filter((k) => k !== key), key].slice(-FIRED_MAX);
    window.sessionStorage.setItem(FIRED_KEY, JSON.stringify(next));
  } catch {
    // 프라이빗 모드 등 — 메모리 중복 방지만
  }
}

function normalizeConversion(detail: unknown): PixelConversion | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Partial<ConversionDetail>;
  if (d.type !== "signup" && d.type !== "purchase") return null;
  const value = d.type === "purchase" ? Math.max(0, Math.round(Number(d.value) || 0)) : 0;
  const id = typeof d.id === "string" && d.id ? d.id.slice(0, 64) : null;
  return { type: d.type, value, id };
}

/** 로더 상태 기계. export 는 검수 하네스용 — 앱에서는 getRuntime() 싱글턴만 쓴다. */
export class PixelRuntime {
  private phase: Phase = "idle";
  private pixels: PublicPixels = {};
  private currentPath: string | null = null;
  private lastPvPath: string | null = null;
  private pendingConv: PixelConversion[] = [];
  private firedInMemory = new Set<string>();
  private clarityInstalled = false;
  private clarityStopped = false;
  private offByConsent = false;

  /** 경로 진입 — 상태 갱신·Clarity 제어·설정 조회까지. 페이지뷰 발사는 pageview() 가 한다. */
  route(rawPath: string) {
    try {
      if (this.consentBlocked()) return;
      const path = normalizePath(rawPath);
      if (!path) return;
      this.currentPath = path;
      const allowed = isPixelAllowedPath(path);
      if (!allowed) this.lastPvPath = null;
      // 녹화 중지는 미룰 수 없다 — 제목 대기보다 먼저 판정한다.
      this.applyClarity(path);
      if (this.phase === "idle") {
        if (allowed) this.schedule();
        return;
      }
      if (this.phase === "fetched" && allowed) {
        this.install();
        return;
      }
      if (this.phase === "ready" && allowed) this.flushConversions();
    } catch {
      // 무시
    }
  }

  /** 페이지뷰 발사(제목이 채워진 뒤 호출). 경로가 이미 바뀌었으면 발사하지 않는다. */
  pageview(rawPath: string) {
    try {
      if (this.phase !== "ready" || this.consentBlocked()) return;
      const path = normalizePath(rawPath);
      if (!path || path !== this.currentPath || path === this.lastPvPath) return;
      if (!isPixelAllowedPath(path)) return;
      this.lastPvPath = path;
      firePageview(this.pixels, path);
      this.flushConversions();
    } catch {
      // 무시
    }
  }

  conversion(detail: unknown) {
    try {
      if (this.consentBlocked()) return;
      const c = normalizeConversion(detail);
      if (!c) return;
      const key = conversionKey(c);
      if (this.firedInMemory.has(key) || readFired().includes(key)) return;
      if (this.pendingConv.some((p) => conversionKey(p) === key)) return;
      this.pendingConv.push(c);
      this.flushConversions();
    } catch {
      // 무시
    }
  }

  /** consent.ts 의 변경 이벤트 — 거부로 바뀌면 즉시 정지, 허용으로 돌아오면 현재 경로부터 재개. */
  consentChanged() {
    try {
      if (isAnalyticsBlocked()) {
        this.shutdownByConsent();
        return;
      }
      if (this.phase === "off" && this.offByConsent) {
        this.phase = "idle";
        this.offByConsent = false;
        if (this.currentPath) this.route(this.currentPath);
      }
    } catch {
      // 무시
    }
  }

  /** true 면 이번 호출은 아무것도 하지 않는다(거부 상태면 진행 중인 것도 정지시킨다). */
  private consentBlocked(): boolean {
    if (this.phase === "off") return true;
    if (!isAnalyticsBlocked()) return false;
    this.shutdownByConsent();
    return true;
  }

  private shutdownByConsent() {
    this.phase = "off";
    this.offByConsent = true;
    this.pendingConv = [];
    this.lastPvPath = null;
    if (this.clarityInstalled && !this.clarityStopped) {
      stopClarity();
      this.clarityStopped = true;
    }
  }

  private schedule() {
    this.phase = "scheduled";
    const run = () => void this.load();
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (typeof idle === "function") idle.call(window, run);
    else setTimeout(run, 2000);
  }

  private async load() {
    try {
      const res = await fetch(CONFIG_URL, { credentials: "omit" });
      // 유휴 대기·조회 사이에 거부로 바뀔 수 있다.
      if (this.consentBlocked()) return;
      if (!res.ok) return this.turnOff();
      const data = (await res.json().catch(() => null)) as { pixels?: unknown } | null;
      if (this.consentBlocked()) return;
      this.pixels = sanitizePublicPixels(data?.pixels);
      if (!hasAnyPixel(this.pixels)) return this.turnOff();
      this.phase = "fetched";
      if (this.currentPath && isPixelAllowedPath(this.currentPath)) this.install();
    } catch {
      this.turnOff();
    }
  }

  private turnOff() {
    this.phase = "off";
    this.pendingConv = [];
  }

  private install() {
    if (this.consentBlocked()) return;
    installPixels(this.pixels);
    this.phase = "ready";
    if (!this.currentPath) return;
    this.applyClarity(this.currentPath);
    // 첫 페이지뷰(설정 조회 뒤라 제목은 이미 채워져 있다).
    this.pageview(this.currentPath);
  }

  /** Clarity 만 허용 영역이 더 좁다(§14 D13) — 원장·강사 화면에서는 로드도 녹화도 하지 않는다. */
  private applyClarity(path: string) {
    const id = this.pixels.clarityId;
    if (!id || this.phase === "off") return;
    if (isClarityAllowedPath(path)) {
      if (!this.clarityInstalled) {
        installClarity(id);
        this.clarityInstalled = true;
        this.clarityStopped = false;
        return;
      }
      if (this.clarityStopped) {
        startClarity();
        this.clarityStopped = false;
      }
      return;
    }
    if (this.clarityInstalled && !this.clarityStopped) {
      stopClarity();
      this.clarityStopped = true;
    }
  }

  private flushConversions() {
    if (this.phase !== "ready" || !this.currentPath || !isPixelAllowedPath(this.currentPath)) return;
    if (this.consentBlocked()) return;
    for (const c of this.pendingConv.splice(0)) {
      const key = conversionKey(c);
      if (this.firedInMemory.has(key) || readFired().includes(key)) continue;
      this.firedInMemory.add(key);
      markFired(key);
      fireConversion(this.pixels, c);
    }
  }
}

let runtime: PixelRuntime | null = null;

function getRuntime(): PixelRuntime {
  if (!runtime) runtime = new PixelRuntime();
  return runtime;
}

export function MarketingPixels() {
  const pathname = usePathname();

  useEffect(() => {
    const onConversion = (e: Event) => getRuntime().conversion((e as CustomEvent<unknown>).detail);
    const onConsent = () => getRuntime().consentChanged();
    window.addEventListener(CONVERSION_EVENT, onConversion);
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => {
      window.removeEventListener(CONVERSION_EVENT, onConversion);
      window.removeEventListener(CONSENT_EVENT, onConsent);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const rt = getRuntime();
    rt.route(pathname);
    // 페이지뷰는 제목이 채워진 뒤 — Next 는 경로 전환과 같은 틱에 metadata 를 커밋하지 않는다(U8-2).
    return whenTitleReady(() => rt.pageview(pathname));
  }, [pathname]);

  return null;
}
