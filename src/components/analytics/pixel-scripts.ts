// ============================================================================
// 마케팅 픽셀 스니펫·발사기 — 브라우저 전용, 프레임워크 무관. MarketingPixels 가 구동한다.
// 계약: docs/analytics/analytics-spec.md §8.3·§8.4. 모든 호출은 예외를 삼킨다(I4).
//
// 공식 스니펫 대조(26-09-17 확인):
//  · gtag.js / GA4 send_page_view:false·수동 page_view — developers.google.com/analytics/devguides/collection/ga4/views
//    (향상된 측정이 켜져 있으면 send_page_view:false 여도 history 변경 page_view 가 자동 발송된다 → 관리 화면 안내)
//  · Google Ads 전환 — support.google.com/google-ads/answer/7548399 (send_to "AW-ID/LABEL", value, currency, transaction_id)
//  · GTM — 공식 컨테이너 스니펫(gtm.start/gtm.js), GA4 전자상거래 dataLayer 는 {ecommerce:null} 선행 push
//  · Meta — developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/
//    (fbq.disablePushState = true 로 history 자동 PageView 차단 → 금지 경로 유출 방지)
//  · 네이버 — naver.github.io/conversion-tracking (wcslog.js · wcs_add["wa"] · wcs.inflow(최상위 도메인) · wcs_do() ·
//    전환 wcs.trans({type:"sign_up"|"purchase", id, value}) — inflow 가 trans 보다 먼저)
//  · 카카오 — kakaobusiness.gitbook.io/main/tool/pixel-sdk/install (//t1.daumcdn.net/kas/static/kp.js ·
//    kakaoPixel(id).pageView() / completeRegistration() / purchase({total_price, currency}))
//  · TikTok — 공식 베이스 코드(analytics.tiktok.com/i18n/pixel/events.js?sdkid=&lib=ttq) · ttq.page() ·
//    ttq.track(event, params, {event_id}). CompletePayment 는 2025-05 Purchase 로 개명(레거시 이름 계속 지원·자동 변환)
//  · Clarity — www.clarity.ms/tag/<id> 공식 스니펫. "stop"/"start" 는 clarity-js 소스의 공개 함수이나
//    learn.microsoft.com 클라이언트 API 문서에는 없음 [미확인: stop 후 start 재개 동작]
// ============================================================================

import { isClarityAllowedPath, isPixelAllowedPath, type PublicPixels } from "@/lib/analytics/pixels-common";
import { normalizePath, sanitizeQuery } from "@/lib/analytics/sanitize";

type AnyFn = (...args: unknown[]) => void;
export type PixelKey = "gtag" | "gtm" | "meta" | "naver" | "kakao" | "tiktok" | "clarity";

interface FbqFn {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: FbqFn;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
}

/** TikTok 스텁 — 배열이면서 메서드를 속성으로 단다(공식 베이스 코드 구조). */
type TtqStub = unknown[] & Record<string, unknown>;

interface PixelWindow extends Window {
  dataLayer?: unknown[];
  gtag?: AnyFn;
  fbq?: FbqFn;
  _fbq?: FbqFn;
  wcs?: { inflow?: (domain?: string) => void; trans?: (conv: Record<string, unknown>) => void };
  wcs_add?: Record<string, string>;
  wcs_do?: AnyFn;
  kakaoPixel?: (id: string) => {
    pageView?: () => void;
    completeRegistration?: () => void;
    purchase?: (params: Record<string, unknown>) => void;
  };
  ttq?: TtqStub;
  TiktokAnalyticsObject?: string;
  clarity?: AnyFn & { q?: unknown[] };
}

const w = () => window as unknown as PixelWindow;

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    // 픽셀 실패는 페이지에 영향 없음(I4)
  }
}

// ── 스크립트 로드 상태 게이트 ─────────────────────────────────────────────────
// 네이버·카카오는 스텁이 없어 로드 전 호출이 불가능하고, 스텁형(gtag/fbq/ttq)도 로드 시점의
// location 으로 대기열을 처리한다 → 모든 발사는 로드 완료 후 + 실행 시점에 경로를 다시 확인한다.

type Status = "loading" | "ready" | "failed";
const status: Partial<Record<PixelKey, Status>> = {};
const pending: Partial<Record<PixelKey, Array<() => void>>> = {};

function currentPathAllowed(requirePath?: string): boolean {
  const here = normalizePath(location.pathname);
  if (!here || !isPixelAllowedPath(here)) return false;
  return requirePath === undefined || here === requirePath;
}

/** 로드 완료 후 실행. requirePath(normalizePath 결과)가 있으면 실행 시점 경로가 같을 때만(페이지뷰용). */
function runWhenReady(key: PixelKey, fn: () => void, requirePath?: string) {
  const task = () => {
    if (currentPathAllowed(requirePath)) safe(fn);
  };
  const s = status[key];
  if (s === "ready") task();
  else if (s === "loading") (pending[key] ??= []).push(task);
}

function injectScript(key: PixelKey, src: string, onReady?: () => void) {
  if (status[key]) return;
  status[key] = "loading";
  const el = document.createElement("script");
  el.async = true;
  el.src = src;
  el.dataset.smoatPixel = key;
  el.addEventListener("load", () => {
    safe(() => onReady?.());
    status[key] = "ready";
    for (const t of (pending[key] ?? []).splice(0)) t();
  });
  el.addEventListener("error", () => {
    status[key] = "failed";
    pending[key] = [];
  });
  (document.head || document.body).appendChild(el);
}

// ── 설치(중복 주입 방지: status 로 1회) ─────────────────────────────────────

function installGtag(p: PublicPixels) {
  const primary = p.ga4Id || p.googleAdsId;
  if (!primary || status.gtag) return;
  const win = w();
  win.dataLayer = win.dataLayer || [];
  if (!win.gtag) {
    // gtag 는 반드시 arguments 객체를 push 해야 한다(배열 push 는 gtag.js 가 명령으로 인식하지 않음).
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer!.push(arguments);
    };
  }
  injectScript("gtag", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primary)}`);
  win.gtag("js", new Date());
  if (p.ga4Id) win.gtag("config", p.ga4Id, { send_page_view: false });
  if (p.googleAdsId) win.gtag("config", p.googleAdsId);
}

function installGtm(id: string) {
  if (status.gtm) return;
  const win = w();
  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  injectScript("gtm", `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
}

function installMeta(id: string) {
  if (status.meta) return;
  const win = w();
  if (!win.fbq) {
    const n = function fbq() {
      // eslint-disable-next-line prefer-rest-params
      const args = arguments;
      // 공식 스니펫과 동일하게 this=fbq 로 호출
      // eslint-disable-next-line prefer-spread
      if (n.callMethod) n.callMethod.apply(n, Array.prototype.slice.call(args) as unknown[]);
      else n.queue.push(args);
    } as unknown as FbqFn;
    if (!win._fbq) win._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    win.fbq = n;
  }
  injectScript("meta", "https://connect.facebook.net/en_US/fbevents.js");
  win.fbq!.disablePushState = true;
  // 자동 고급매칭(폼 입력 이메일·전화 해시 전송) 차단 — 방침 11항의 전송 범위를 넘지 않는다.
  // init 보다 먼저 지정해야 첫 수집부터 적용된다(운영자는 Events Manager 에서도 꺼 둘 것).
  win.fbq!("set", "autoConfig", false, id);
  win.fbq!("init", id);
}

/**
 * 네이버 wcslog.js 는 1회만 로드하고, 사이트ID(wcs_add["wa"])는 발사 직전에 바꿔 쓴다.
 * 애널리틱스 발급ID 와 광고 공통키는 **다른 값**이라 PV 로그가 2개 나가는 것이 정상이다
 * (naver.github.io/conversion-tracking 07 가이드). §14 D14
 */
function installNaver(firstId: string) {
  if (status.naver) return;
  const setAccount = () => {
    const win = w();
    win.wcs_add = win.wcs_add || {};
    win.wcs_add.wa = firstId;
  };
  setAccount();
  injectScript("naver", "https://wcs.naver.net/wcslog.js", setAccount);
}

function installKakao() {
  injectScript("kakao", "https://t1.daumcdn.net/kas/static/kp.js");
}

function installTiktok(id: string) {
  if (status.tiktok) return;
  const win = w();
  if (!win.ttq) {
    win.TiktokAnalyticsObject = "ttq";
    const ttq = [] as unknown as TtqStub;
    const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    const setAndDefer = (target: TtqStub, name: string) => {
      target[name] = (...args: unknown[]) => {
        target.push([name, ...args]);
      };
    };
    ttq.methods = methods;
    ttq.setAndDefer = setAndDefer;
    for (const m of methods) setAndDefer(ttq, m);
    const registry = <T,>(key: "_i" | "_t" | "_o"): Record<string, T> => {
      if (!ttq[key]) ttq[key] = {};
      return ttq[key] as Record<string, T>;
    };
    ttq.instance = (t: string) => {
      const e = registry<TtqStub>("_i")[t] || ([] as unknown as TtqStub);
      for (const m of methods) setAndDefer(e, m);
      return e;
    };
    ttq.load = (e: string, n?: Record<string, unknown>) => {
      const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
      const inst = [] as unknown as TtqStub;
      inst._u = src;
      registry<TtqStub>("_i")[e] = inst;
      registry<number>("_t")[e] = +new Date();
      registry<unknown>("_o")[e] = n || {};
      injectScript("tiktok", `${src}?sdkid=${encodeURIComponent(e)}&lib=ttq`);
    };
    win.ttq = ttq;
  }
  (win.ttq!.load as (id: string) => void)(id);
}

/** Clarity 만 별도 설치 — 허용 영역(marketing·/register·/login)에 있을 때만 호출할 것(§14 D13). */
export function installClarity(id: string) {
  if (status.clarity) return;
  // 이중 방어: 호출 시점 경로가 Clarity 허용 영역이 아니면 주입하지 않는다.
  if (!isClarityAllowedPath(location.pathname)) return;
  const win = w();
  if (!win.clarity) {
    const c = function clarity() {
      // eslint-disable-next-line prefer-rest-params
      (c.q = c.q || []).push(arguments);
    } as AnyFn & { q?: unknown[] };
    win.clarity = c;
  }
  injectScript("clarity", `https://www.clarity.ms/tag/${encodeURIComponent(id)}`);
}

/**
 * 설정된 픽셀만 주입. 호출 전 현재 경로가 허용 영역인지 확인할 것.
 * Clarity 는 여기서 주입하지 않는다 — 허용 영역이 더 좁아(§14 D13) 로더가 따로 호출한다.
 */
export function installPixels(p: PublicPixels) {
  safe(() => installGtag(p));
  if (p.gtmId) safe(() => installGtm(p.gtmId!));
  if (p.metaPixelId) safe(() => installMeta(p.metaPixelId!));
  const naverFirst = p.naverAnalyticsId || p.naverAdsConversionId;
  if (naverFirst) safe(() => installNaver(naverFirst));
  if (p.kakaoPixelId) safe(installKakao);
  if (p.tiktokPixelId) safe(() => installTiktok(p.tiktokPixelId!));
}

// ── 발사 ────────────────────────────────────────────────────────────────────

/** 허용 쿼리만 남긴 현재 URL(§8.4 — GA4 page_location). */
function sanitizedLocation(): string {
  const qs = new URLSearchParams(sanitizeQuery(location.search)).toString();
  return `${location.origin}${location.pathname}${qs ? `?${qs}` : ""}`;
}

function naverRootDomain(): string {
  return location.hostname.replace(/^www\./, "");
}

/** 네이버 사이트ID 를 바꿔 끼우고 PV 를 보낸다(wcs_add["wa"] 는 wcslog.js 의 전역 슬롯 1개뿐). */
function naverSend(id: string, withInflow: boolean) {
  const win = w();
  if (!win.wcs || !win.wcs_do) return;
  win.wcs_add = win.wcs_add || {};
  win.wcs_add.wa = id;
  if (withInflow) win.wcs.inflow?.(naverRootDomain());
  win.wcs_do();
}

/** 경로 변경마다(허용 경로에서만 호출). Clarity 는 자동 수집. */
export function firePageview(p: PublicPixels, path: string) {
  const pageLocation = sanitizedLocation();
  // 제목이 아직 비어 있으면 page_title 을 아예 보내지 않는다(빈 문자열로 덮어쓰면 GA4 가 (not set) 이 된다).
  const pageTitle = (document.title || "").slice(0, 300);
  const titlePart = pageTitle ? { page_title: pageTitle } : {};
  if (p.ga4Id) {
    runWhenReady("gtag", () => w().gtag?.("event", "page_view", { send_to: p.ga4Id, page_location: pageLocation, ...titlePart }), path);
  }
  if (p.gtmId) {
    runWhenReady("gtm", () => w().dataLayer?.push({ event: "page_view", page_location: pageLocation, ...titlePart }), path);
  }
  if (p.metaPixelId) runWhenReady("meta", () => w().fbq?.("track", "PageView"), path);
  if (p.naverAnalyticsId || p.naverAdsConversionId) {
    runWhenReady("naver", () => {
      // 애널리틱스 발급ID 와 광고 공통키는 별개 — 둘 다 넣었으면 PV 로그가 2개 나가는 것이 정상(§14 D14).
      if (p.naverAnalyticsId) naverSend(p.naverAnalyticsId, false);
      if (p.naverAdsConversionId) naverSend(p.naverAdsConversionId, true);
    }, path);
  }
  if (p.kakaoPixelId) runWhenReady("kakao", () => w().kakaoPixel?.(p.kakaoPixelId!).pageView?.(), path);
  if (p.tiktokPixelId) runWhenReady("tiktok", () => (w().ttq?.page as AnyFn | undefined)?.(), path);
}

export interface PixelConversion {
  type: "signup" | "purchase";
  /** KRW 정수(purchase) */
  value: number;
  /** creditTopUpId(purchase) */
  id: string | null;
}

/** 가입·결제 전환을 설정된 모든 픽셀에 발사(§8.3). */
export function fireConversion(p: PublicPixels, c: PixelConversion) {
  if (c.type === "signup") {
    if (p.ga4Id) runWhenReady("gtag", () => w().gtag?.("event", "sign_up", { send_to: p.ga4Id, page_location: sanitizedLocation() }));
    if (p.googleAdsId && p.googleAdsSignupLabel) {
      runWhenReady("gtag", () => w().gtag?.("event", "conversion", { send_to: `${p.googleAdsId}/${p.googleAdsSignupLabel}` }));
    }
    if (p.gtmId) runWhenReady("gtm", () => w().dataLayer?.push({ event: "sign_up" }));
    if (p.metaPixelId) runWhenReady("meta", () => w().fbq?.("track", "CompleteRegistration"));
    if (p.naverAdsConversionId) {
      // 전환(wcs.trans)은 검색광고·GFA 용 공통키로만 보낸다 — 애널리틱스 발급ID 로는 전환이 집계되지 않는다.
      runWhenReady("naver", () => {
        const win = w();
        win.wcs_add = win.wcs_add || {};
        win.wcs_add.wa = p.naverAdsConversionId!;
        win.wcs?.inflow?.(naverRootDomain());
        win.wcs?.trans?.({ type: "sign_up" });
      });
    }
    if (p.kakaoPixelId) runWhenReady("kakao", () => w().kakaoPixel?.(p.kakaoPixelId!).completeRegistration?.());
    if (p.tiktokPixelId) runWhenReady("tiktok", () => (w().ttq?.track as AnyFn | undefined)?.("CompleteRegistration"));
    return;
  }

  const value = c.value;
  const txn = c.id ?? "";
  if (p.ga4Id) {
    runWhenReady("gtag", () =>
      w().gtag?.("event", "purchase", { send_to: p.ga4Id, transaction_id: txn, value, currency: "KRW", page_location: sanitizedLocation() }),
    );
  }
  if (p.googleAdsId && p.googleAdsPurchaseLabel) {
    runWhenReady("gtag", () =>
      w().gtag?.("event", "conversion", { send_to: `${p.googleAdsId}/${p.googleAdsPurchaseLabel}`, value, currency: "KRW", transaction_id: txn }),
    );
  }
  if (p.gtmId) {
    runWhenReady("gtm", () => {
      const dl = w().dataLayer;
      dl?.push({ ecommerce: null });
      dl?.push({ event: "purchase", ecommerce: { transaction_id: txn, value, currency: "KRW" } });
    });
  }
  if (p.metaPixelId) {
    runWhenReady("meta", () => {
      if (txn) w().fbq?.("track", "Purchase", { value, currency: "KRW" }, { eventID: txn });
      else w().fbq?.("track", "Purchase", { value, currency: "KRW" });
    });
  }
  if (p.naverAdsConversionId) {
    runWhenReady("naver", () => {
      const win = w();
      win.wcs_add = win.wcs_add || {};
      win.wcs_add.wa = p.naverAdsConversionId!;
      win.wcs?.inflow?.(naverRootDomain());
      const conv: Record<string, unknown> = { type: "purchase", value: String(value) };
      if (txn) conv.id = txn;
      win.wcs?.trans?.(conv);
    });
  }
  if (p.kakaoPixelId) {
    runWhenReady("kakao", () => w().kakaoPixel?.(p.kakaoPixelId!).purchase?.({ total_price: String(value), currency: "KRW" }));
  }
  if (p.tiktokPixelId) {
    runWhenReady("tiktok", () => {
      const track = w().ttq?.track as AnyFn | undefined;
      // 표준 이벤트 명칭은 Purchase(구 CompletePayment — 2025-05 개명, 레거시는 자동 변환).
      if (txn) track?.("Purchase", { value, currency: "KRW" }, { event_id: txn });
      else track?.("Purchase", { value, currency: "KRW" });
    });
  }
}

/** 금지 경로 진입 — Clarity 녹화 중지(§8.4). 이미 로드된 다른 스크립트는 제거 불가. */
export function stopClarity() {
  safe(() => w().clarity?.("stop"));
}

/** Clarity 허용 영역으로 복귀 — 녹화 재개. [미확인: 공식 문서 미기재 API] */
export function startClarity() {
  if (!isClarityAllowedPath(location.pathname)) return;
  safe(() => w().clarity?.("start"));
}
