// ============================================================================
// 방문자·세션 식별자 저장소 — 브라우저 전용. client.ts(트래커)가 쓴다.
// 계약: docs/analytics/analytics-spec.md §3.1
//
// · 방문자 id: 쿠키 smoat_vid(2년, 방문마다 갱신) + localStorage 사본.
//   localStorage 사본에도 같은 수명을 준다 — 쿠키만 만료되면 사본이 무기한 복원돼
//   방침(「마지막 방문일로부터 2년이 지나면 만료」)이 거짓이 된다(U10-4).
// · 세션: localStorage smoat_ses. 마지막 경로(path)를 함께 들고 있어야
//   전체 페이지 로드 이동에서도 prevPath 가 끊기지 않는다(L3-5).
// ============================================================================

export const VID_COOKIE = "smoat_vid";
export const VID_KEY = "smoat_vid";
export const SES_KEY = "smoat_ses";
/** 식별자 수명 2년 — 쿠키 Max-Age 와 같은 값(방문마다 갱신 = 마지막 방문 기준 2년). */
export const IDENTITY_TTL_MS = 730 * 86_400_000;

export const ID_RE = /^[A-Za-z0-9_-]{12,40}$/;

export interface StoredSession {
  id: string;
  last: number;
  camp: string | null;
  /** 서버가 ctx 를 받았는지(fetch 200/204 확인) */
  ctxOk: boolean;
  ref: string;
  url: string;
  /** 이 세션에서 마지막으로 기록한 정화 경로(전체 로드 이동의 prevPath 복원용) */
  path?: string | null;
}

export function genId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {
    // 폴백
  }
  let s = "";
  while (s.length < 24) s += Math.random().toString(36).slice(2);
  return s.slice(0, 24);
}

export function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\s*)${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 사파리 프라이빗 등
  }
}

export function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 무시
  }
}

interface StoredVisitor {
  id: string;
  /** 마지막 갱신 시각(ms) — 여기서 2년이 지나면 폐기한다. */
  iat: number;
}

/** localStorage 사본 읽기. 만료됐거나 형식이 깨졌으면 null(= 새 id 발급). */
function readStoredVisitor(now: number): string | null {
  const raw = safeGet(VID_KEY);
  if (!raw) return null;
  if (!raw.startsWith("{")) {
    // 구형 평문 문자열 — 만료 시각이 없으므로 이 시점을 기준으로 삼는다.
    return ID_RE.test(raw) ? raw : null;
  }
  try {
    const v = JSON.parse(raw) as StoredVisitor | null;
    if (!v || typeof v.id !== "string" || !ID_RE.test(v.id)) return null;
    if (typeof v.iat !== "number" || !Number.isFinite(v.iat)) return null;
    if (now - v.iat > IDENTITY_TTL_MS) {
      safeRemove(VID_KEY);
      return null;
    }
    return v.id;
  } catch {
    return null;
  }
}

/** 방문자 id 확보(쿠키 우선 → localStorage 사본). 둘 다 없거나 만료면 새로 발급한다. */
export function ensureVisitor(now: number): { vid: string; isNew: boolean } {
  const fromCookie = readCookie(VID_COOKIE);
  let vid = fromCookie && ID_RE.test(fromCookie) ? fromCookie : readStoredVisitor(now);
  let isNew = false;
  if (!vid) {
    vid = genId();
    isNew = true;
  }
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${VID_COOKIE}=${vid}; Max-Age=${Math.floor(IDENTITY_TTL_MS / 1000)}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // 무시
  }
  safeSet(VID_KEY, JSON.stringify({ id: vid, iat: now } satisfies StoredVisitor));
  return { vid, isNew };
}

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = safeGet(SES_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession | null;
    return s && typeof s.id === "string" && ID_RE.test(s.id) ? s : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(s: StoredSession) {
  safeSet(SES_KEY, JSON.stringify(s));
}

const CONV_KEY = "smoat_cv";
const CONV_MAX = 20;

/**
 * 이미 기록한 전환 id 인가. 미확인 전환은 다음 세션에도 다시 내려오므로(D17),
 * 「전환 이벤트」 행이 재전송 횟수만큼 불어나지 않도록 문서 수명을 넘어 기억한다.
 */
export function wasConversionSeen(cid: string): boolean {
  try {
    const raw = safeGet(CONV_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) && list.includes(cid);
  } catch {
    return false;
  }
}

export function rememberConversion(cid: string) {
  try {
    const raw = safeGet(CONV_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const next = (Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []).filter((x) => x !== cid);
    next.push(cid);
    safeSet(CONV_KEY, JSON.stringify(next.slice(-CONV_MAX)));
  } catch {
    // 무시
  }
}

export function clearIdentity() {
  safeRemove(VID_KEY);
  safeRemove(SES_KEY);
  safeRemove(CONV_KEY);
}
