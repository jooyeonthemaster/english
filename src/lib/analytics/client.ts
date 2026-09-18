// ============================================================================
// 브라우저 트래커 엔진 — 프레임워크 무관. SiteAnalytics 컴포넌트가 구동한다.
// 계약: docs/analytics/analytics-spec.md §3.1, §6.3
//
// 모든 예외를 삼킨다(I4). /admin 에서는 아무것도 하지 않는다(I2).
// 거부(쿠키·GPC·저장소 차단)는 **매 전송 직전** 다시 확인한다 — start() 1회 래치가 아니다(RC-OPTOUT).
// 식별자 저장·수명은 visitor-store.ts.
// ============================================================================

import { campaignSignature, classifyClick, sanitizedHref } from "./client-support";
import { CONSENT_EVENT, isAnalyticsBlocked } from "./consent";
import { isAdminPath, maskSensitivePath, normalizePath } from "./sanitize";
import {
  SES_KEY,
  ensureVisitor,
  genId,
  loadStoredSession,
  rememberConversion,
  safeRemove,
  saveStoredSession,
  wasConversionSeen,
  type StoredSession,
} from "./visitor-store";

const ENDPOINT = "/api/collect";
const SESSION_TIMEOUT_MS = 30 * 60_000;
const HEARTBEAT_MS = 120_000;
const ACTIVE_WINDOW_MS = 5 * 60_000;
/** 탭 숨김 비콘 최소 간격 — pagehide 는 예외로 항상 보낸다(L4-7). */
const BEACON_MIN_GAP_MS = 10_000;
const BEACON_MIN_ENGAGED_MS = 3_000;
/** 전환 지시를 픽셀 쪽에 넘긴 뒤 발사 확인(ack)을 보내기까지 기다리는 시간(D17). */
const ACK_DELAY_MS = 1_500;
/** 페이지가 화면에 다 들어오는지 처음 재는 시점(첫 페인트·레이아웃 뒤). */
const FIT_SAMPLE_MS = 800;

export const CONVERSION_EVENT = "smoat:conversion";

export interface ConversionDetail {
  type: "signup" | "purchase";
  value?: number;
  id?: string;
  /** analytics_conversions.id — 픽셀 발사 확인(ack)에 쓴다(D17). */
  cid?: string;
}

type Hit = Record<string, unknown> & { t: string; ts: number };

class Tracker {
  private vid = "";
  private visitorIsNew = false;
  private session: StoredSession | null = null;
  private queue: Hit[] = [];
  private currentPv: { id: string; path: string; engagedMs: number; reportedMs: number; maxScroll: number; scrolled: boolean } | null = null;
  private visibleSince: number | null = null;
  private lastInteraction = Date.now();
  private sessionEngagedUnreported = 0;
  private initialLoad = true;
  private lastPath: string | null = null;
  private started = false;
  private wired = false;
  private blocked = false;
  private hbTimer: ReturnType<typeof setInterval> | null = null;
  private lastSendAt = 0;
  private acked = new Set<string>();

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    // 거부 쿠키·GPC·저장소 차단이면 아무것도 하지 않는다(개인정보처리방침 거부 수단).
    if (isAnalyticsBlocked()) {
      this.blocked = true;
      // 나중에 허용으로 바뀌면 같은 문서에서 다시 켠다.
      try {
        window.addEventListener(CONSENT_EVENT, this.onConsent);
      } catch {
        // 무시
      }
      return;
    }
    this.begin();
  }

  private begin() {
    if (this.wired) return;
    try {
      const now = Date.now();
      const v = ensureVisitor(now);
      this.vid = v.vid;
      this.visitorIsNew = v.isNew;
      this.visibleSince = document.visibilityState === "visible" ? now : null;

      document.addEventListener("visibilitychange", this.onVisibility, { passive: true });
      window.addEventListener("pagehide", this.onPageHide, { passive: true });
      window.addEventListener("scroll", this.onScroll, { passive: true });
      window.addEventListener(CONSENT_EVENT, this.onConsent);
      for (const ev of ["pointerdown", "keydown", "touchstart"]) {
        window.addEventListener(ev, this.onInteract, { passive: true, capture: true });
      }
      document.addEventListener("click", this.onClick, { capture: true, passive: true });
      this.hbTimer = setInterval(this.onHeartbeat, HEARTBEAT_MS);
      this.wired = true;

      const w = window as unknown as {
        smoatTrack?: (n: string, p?: Record<string, unknown>) => void;
        smoatConversionFired?: (cid: string) => void;
      };
      w.smoatTrack = (n, p) => this.event(n, p);
      // 픽셀 쪽이 실제 발사 직후 부르면 그 시각으로 ack 한다(없으면 ACK_DELAY_MS 뒤 자동 ack).
      w.smoatConversionFired = (cid) => this.ackConversion(cid);
    } catch {
      // 무시
    }
  }

  /** 거부로 전환됐을 때 — 큐를 버리고 타이머·리스너를 해제한다. 같은 문서에서 즉시 멈춘다. */
  private stop() {
    this.blocked = true;
    this.queue.length = 0;
    this.currentPv = null;
    this.session = null;
    this.visibleSince = null;
    this.lastPath = null;
    this.sessionEngagedUnreported = 0;
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = null;
    if (!this.wired) return;
    this.wired = false;
    try {
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("scroll", this.onScroll);
      for (const ev of ["pointerdown", "keydown", "touchstart"]) {
        window.removeEventListener(ev, this.onInteract, { capture: true });
      }
      document.removeEventListener("click", this.onClick, { capture: true });
      safeRemove(SES_KEY);
    } catch {
      // 무시
    }
  }

  /** 모든 전송 진입점의 관문 — 거부로 바뀌었으면 그 자리에서 멈춘다. */
  private allowed(): boolean {
    if (this.blocked) return false;
    if (isAnalyticsBlocked()) {
      this.stop();
      return false;
    }
    return true;
  }

  private onConsent = () => {
    try {
      if (isAnalyticsBlocked()) {
        this.stop();
        return;
      }
      if (this.blocked && this.started) {
        // 다시 허용 — 새 식별자로 이 문서에서 곧바로 재개한다.
        this.blocked = false;
        this.initialLoad = false;
        this.lastPath = null;
        this.begin();
        this.pageview(location.pathname);
      }
    } catch {
      // 무시
    }
  };

  // ── 세션 ─────────────────────────────────────────────
  private saveSession() {
    if (this.session) saveStoredSession(this.session);
  }

  /** 필요하면 새 세션을 연다. 반환: 새 세션 여부 + 저장돼 있던 직전 경로(전체 로드 prevPath 복원). */
  private touchSession(now: number): { isNew: boolean; storedPath: string | null } {
    const stored = loadStoredSession();
    const camp = this.initialLoad ? campaignSignature(location.search) : null;
    const expired = !stored || now - stored.last > SESSION_TIMEOUT_MS;
    const newCampaign = !!camp && !!stored && stored.camp !== camp;
    if (expired || newCampaign) {
      this.session = {
        id: genId(),
        last: now,
        camp: camp ?? null,
        ctxOk: false,
        ref: this.initialLoad ? document.referrer || "" : "",
        url: sanitizedHref(),
        path: null,
      };
      this.saveSession();
      return { isNew: true, storedPath: null };
    }
    this.session = { ...stored, last: now };
    this.saveSession();
    return { isNew: false, storedPath: stored.path ?? null };
  }

  private body(hits: Hit[]) {
    const s = this.session!;
    const b: Record<string, unknown> = {
      v: 1,
      vid: this.vid,
      sid: s.id,
      nv: this.visitorIsNew,
      hits,
    };
    if (!s.ctxOk) {
      b.ctx = {
        ref: s.ref,
        url: s.url,
        sw: window.screen?.width ?? 0,
        sh: window.screen?.height ?? 0,
        lang: navigator.language,
        tz: (() => {
          try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
          } catch {
            return "";
          }
        })(),
      };
    }
    return b;
  }

  // ── 체류 계산 ────────────────────────────────────────
  private accrue(now: number) {
    if (this.visibleSince !== null && this.currentPv) {
      const d = Math.max(0, now - this.visibleSince);
      this.currentPv.engagedMs += d;
      this.sessionEngagedUnreported += d;
      this.visibleSince = now;
    }
  }

  /**
   * 스크롤할 것이 없는 페이지는 스크롤 이벤트가 없어 0% 로 남는다 — 화면에 다 들어오면 100% 로 본다(U3-4).
   * **현재 페이지가 살아 있는 동안에만** 잰다(경로 전환 시점에 재면 새 문서를 재게 된다).
   * 나중에 지연 로딩으로 길어지면 다음 표본에서 되돌린다(사용자가 실제로 스크롤한 값은 건드리지 않는다).
   */
  private sampleFit(pvId?: string) {
    try {
      const pv = this.currentPv;
      if (!pv || pv.scrolled || (pvId && pv.id !== pvId)) return;
      pv.maxScroll = document.documentElement.scrollHeight <= window.innerHeight + 1 ? 100 : 0;
    } catch {
      // 무시
    }
  }

  private engagementHit(now: number): Hit | null {
    if (!this.currentPv) return null;
    this.accrue(now);
    const pv = this.currentPv;
    if (pv.engagedMs === pv.reportedMs && this.sessionEngagedUnreported === 0) return null;
    const hit: Hit = {
      t: "eng",
      id: pv.id,
      p: pv.path,
      ms: Math.round(pv.engagedMs),
      sc: pv.maxScroll,
      d: Math.round(this.sessionEngagedUnreported),
      ts: now,
    };
    pv.reportedMs = pv.engagedMs;
    this.sessionEngagedUnreported = 0;
    return hit;
  }

  // ── 전송 ─────────────────────────────────────────────
  private async sendFetch(hits: Hit[], readResponse: boolean) {
    if (!this.session || !this.allowed()) return;
    const payload = JSON.stringify(this.body(hits));
    this.lastSendAt = Date.now();
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        body: payload,
        keepalive: payload.length < 60_000,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        credentials: "same-origin",
      });
      if (res.ok && this.session && !this.session.ctxOk) {
        this.session.ctxOk = true;
        this.saveSession();
      }
      if (readResponse && res.status === 200) {
        const data = (await res.json().catch(() => null)) as { c?: ConversionDetail[] } | null;
        for (const c of data?.c ?? []) this.handleConversion(c);
      }
    } catch {
      // 네트워크 실패 — 다음 전송에 ctx 재시도(ctxOk 유지 false)
    }
  }

  private sendBeacon(hits: Hit[]) {
    if (!this.session || hits.length === 0 || !this.allowed()) return;
    const payload = JSON.stringify(this.body(hits));
    this.lastSendAt = Date.now();
    try {
      if (navigator.sendBeacon?.(ENDPOINT, new Blob([payload], { type: "text/plain;charset=UTF-8" }))) return;
    } catch {
      // 폴백
    }
    void this.sendFetch(hits, false);
  }

  private handleConversion(c: ConversionDetail) {
    if (!this.allowed()) return;
    const cid = c.cid;
    // 발사 확인이 안 된 전환은 다음 세션에도 다시 내려온다 — 픽셀에는 매번 넘기되(픽셀 쪽이 중복을 막는다),
    // 우리 「전환 이벤트」 행은 전환 1건당 1행만 남긴다.
    const firstTime = !cid || !wasConversionSeen(cid);
    if (cid) rememberConversion(cid);
    try {
      window.dispatchEvent(new CustomEvent<ConversionDetail>(CONVERSION_EVENT, { detail: c }));
    } catch {
      // 무시
    }
    if (firstTime) {
      this.queue.push({
        t: "ev",
        id: genId(),
        n: c.type === "signup" ? "signup_complete" : "purchase_complete",
        p: this.currentPv?.path ?? "/",
        pr: c.type === "purchase" ? { value: c.value ?? 0 } : {},
        ts: Date.now(),
      });
    }
    // 픽셀 쪽이 smoatConversionFired 로 먼저 알려 주면 그 시각, 아니면 잠시 뒤 자동 확인(D17).
    if (cid) setTimeout(() => this.ackConversion(cid), ACK_DELAY_MS);
  }

  /** 전환 픽셀 발사 확인 — 서버의 firedAt 을 채운다(D17). */
  private ackConversion(cid: string) {
    if (typeof cid !== "string" || !cid || this.acked.has(cid) || !this.allowed()) return;
    this.acked.add(cid);
    this.queue.push({ t: "ack", id: cid, ts: Date.now() });
    this.flushFetch();
  }

  // ── 공개 동작 ────────────────────────────────────────
  pageview(rawPath: string) {
    if (!this.started || !this.allowed()) return;
    try {
      const norm = normalizePath(rawPath);
      if (!norm || isAdminPath(norm)) {
        // 관리자 진입: 진행 중 페이지 체류만 마감
        this.flushBeacon(true);
        this.currentPv = null;
        return;
      }
      const path = maskSensitivePath(norm);
      if (path === this.lastPath) return;
      const now = Date.now();
      const eng = this.engagementHit(now);
      const { isNew: newSession, storedPath } = this.touchSession(now);
      // 전체 페이지 로드면 메모리엔 직전 경로가 없다 — 세션 저장본에서 복원한다(L3-5).
      const prev = this.lastPath ?? (newSession ? null : storedPath);
      this.lastPath = path;
      const pvId = genId();
      this.currentPv = { id: pvId, path, engagedMs: 0, reportedMs: 0, maxScroll: 0, scrolled: false };
      this.visibleSince = document.visibilityState === "visible" ? now : null;
      if (this.session) {
        this.session.path = path;
        this.saveSession();
      }
      const hits: Hit[] = [];
      if (eng) hits.push(eng);
      hits.push(...this.queue.splice(0));
      hits.push({ t: "pv", id: pvId, p: path, ti: document.title?.slice(0, 300) ?? "", pp: prev, ts: now });
      this.initialLoad = false;
      void this.sendFetch(hits, true);
      setTimeout(() => this.sampleFit(pvId), FIT_SAMPLE_MS);
    } catch {
      // 무시
    }
  }

  event(name: string, props?: Record<string, unknown>) {
    if (!this.allowed()) return;
    try {
      if (!this.currentPv || !/^[a-z0-9][a-z0-9_:.-]{0,59}$/i.test(name)) return;
      this.queue.push({ t: "ev", id: genId(), n: name, p: this.currentPv.path, pr: props ?? {}, ts: Date.now() });
      if (this.queue.length >= 10) this.flushFetch();
    } catch {
      // 무시
    }
  }

  private flushFetch() {
    if (!this.session || this.queue.length === 0 || !this.allowed()) return;
    void this.sendFetch(this.queue.splice(0), false);
  }

  /** force=true(pagehide·관리자 진입)면 무조건 보낸다. 아니면 보낼 것이 있을 때만·최소 간격 지나서만. */
  private flushBeacon(force: boolean) {
    if (!this.session || !this.allowed()) return;
    const now = Date.now();
    this.accrue(now);
    if (!force) {
      const hasQueued = this.queue.length > 0;
      const tooSoon = now - this.lastSendAt < BEACON_MIN_GAP_MS;
      const tooShort = this.sessionEngagedUnreported < BEACON_MIN_ENGAGED_MS;
      if (!hasQueued && (tooSoon || tooShort)) return;
    }
    const hits: Hit[] = [...this.queue.splice(0)];
    const eng = this.engagementHit(now);
    if (eng) hits.push(eng);
    if (hits.length) this.sendBeacon(hits);
  }

  // ── 리스너 ───────────────────────────────────────────
  private onVisibility = () => {
    if (!this.allowed()) return;
    const now = Date.now();
    if (document.visibilityState === "hidden") {
      this.sampleFit();
      this.flushBeacon(false);
      this.visibleSince = null;
    } else {
      this.visibleSince = now;
      // 30분 넘게 숨어 있다 돌아오면 새 세션 + 현재 페이지 재기록
      const stored = loadStoredSession();
      if (!stored || now - stored.last > SESSION_TIMEOUT_MS) {
        const path = this.lastPath;
        this.lastPath = null;
        if (path) this.pageview(location.pathname);
      }
    }
  };

  private onPageHide = () => {
    this.sampleFit();
    this.flushBeacon(true);
  };

  private onScroll = () => {
    if (!this.currentPv) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100);
    if (pct > this.currentPv.maxScroll) this.currentPv.maxScroll = Math.min(100, pct);
    this.currentPv.scrolled = true;
    this.lastInteraction = Date.now();
  };

  private onInteract = () => {
    this.lastInteraction = Date.now();
  };

  private onHeartbeat = () => {
    try {
      if (!this.allowed()) return;
      if (document.visibilityState !== "visible" || !this.currentPv || !this.session) return;
      const now = Date.now();
      if (now - this.lastInteraction > ACTIVE_WINDOW_MS) return;
      this.sampleFit();
      this.touchSession(now);
      const hits: Hit[] = [...this.queue.splice(0)];
      const eng = this.engagementHit(now);
      if (eng) hits.push(eng);
      else hits.push({ t: "hb", p: this.currentPv.path, d: 0, ts: now });
      void this.sendFetch(hits, false);
    } catch {
      // 무시
    }
  };

  private onClick = (e: MouseEvent) => {
    try {
      for (const ev of classifyClick(e.target as Element | null)) this.event(ev.name, ev.props);
    } catch {
      // 무시
    }
  };
}

let singleton: Tracker | null = null;

export function getTracker(): Tracker {
  if (!singleton) singleton = new Tracker();
  return singleton;
}

/** 어디서든 커스텀 이벤트 기록. 예: trackEvent("seminar_apply", { plan: "group" }) */
export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  getTracker().event(name, props);
}
