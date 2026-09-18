// ============================================================================
// 경로·쿼리·referrer 정화 — PII 저장 금지(I3). 순수 함수, 서버/클라이언트 공용.
// 계약: docs/analytics/analytics-spec.md §3.4, §3.5
// ============================================================================

/** 보존 허용 쿼리 키. 여기에 없는 키는 버린다(이메일·토큰·검색어 유출 방지). */
export const ALLOWED_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "NaPm",
  "n_media",
  "n_query",
  "n_rank",
  "n_ad_group",
  "n_ad",
  "n_keyword",
  "n_campaign_type",
  "ttclid",
  "msclkid",
  "dclid",
  "twclid",
  "li_fat_id",
  "sl",
  "ref",
] as const;

const ALLOWED = new Set<string>(ALLOWED_QUERY_KEYS);
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 클릭 ID 류는 값 자체가 식별자라 존재 여부만 의미 — 값은 짧게 자른다. */
const CLICK_ID_KEYS = new Set(["gclid", "gbraid", "wbraid", "fbclid", "NaPm", "ttclid", "msclkid", "dclid", "twclid", "li_fat_id"]);

export const PRODUCTION_HOSTS = new Set(["smoat.co.kr", "www.smoat.co.kr"]);

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim();
  if (!p.startsWith("/")) return null;
  const hashAt = p.indexOf("#");
  if (hashAt >= 0) p = p.slice(0, hashAt);
  const qAt = p.indexOf("?");
  if (qAt >= 0) p = p.slice(0, qAt);
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  try {
    p = decodeURI(p);
  } catch {
    // 잘못된 인코딩은 원문 유지
  }
  if (p.length > 500) p = p.slice(0, 500);
  return p;
}

/**
 * 토큰 트리 — 경로에 접근 토큰이 들어가는 공개 링크(세그먼트 기반으로 가린다, I3).
 * 값은 그 트리에서 토큰 앞에 올 수 있는 **고정 하위 경로** 이름이다.
 *   /t/[token] · /t/e/[enrollToken] · /r/[token] · /r/exam/[token] · /a/[token]
 * 토큰은 반 로스터·리포트·공유 자료를 여는 자격증명이므로 저장·표시 어디에도 남기지 않는다.
 */
const TOKEN_TREES: Record<string, ReadonlySet<string>> = {
  t: new Set(["e"]),
  r: new Set(["exam"]),
  a: new Set<string>(),
};

/** 사람이 읽는 슬러그가 아니라 난수 토큰으로 보이는 세그먼트. */
function looksLikeToken(seg: string): boolean {
  if (seg.length < 12) return false;
  return /^[A-Za-z0-9_-]+$/.test(seg) && !isReadableSlug(seg);
}

/**
 * 사람이 읽는 SEO 슬러그(하이픈으로 이어진 소문자 낱말) 판정.
 * 예: "naesin-english-exam-prep", "2026-09-hakpyeong-english", "descriptive-overview".
 * base64url 토큰은 대문자가 섞이고 낱말 경계가 없어 여기 걸리지 않는다.
 */
function isReadableSlug(seg: string): boolean {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(seg)) return false;
  const parts = seg.split("-");
  if (parts.some((x) => x.length < 2)) return false;
  return parts.filter((x) => /[a-z]/.test(x)).length >= 2;
}

/**
 * 경로 안의 접근 토큰·이메일을 가린다(I3). 저장 전 경로와 referrer 경로에 모두 적용한다.
 * 반환값이 입력과 다르면 「민감 경로」다 — 제목(title)도 저장하지 않는다(§3.4, RC-TOKENMASK).
 */
export function maskSensitivePath(path: string): string {
  if (!path.startsWith("/")) return path;
  const segs = path.split("/");
  // segs[0] 은 항상 "" (선행 슬래시)
  const root = segs[1] ?? "";
  const tree = TOKEN_TREES[root];
  if (tree) {
    let i = 2;
    if (segs[i] && tree.has(segs[i])) i += 1;
    if (segs[i]) segs[i] = ":token";
    // 남은 꼬리에 또 토큰이 있으면(중첩 공유 링크) 함께 가린다
    for (let k = i + 1; k < segs.length; k++) {
      if (looksLikeToken(segs[k])) segs[k] = ":token";
    }
  } else if (root === "credits" && segs[2] === "promo") {
    // /credits/promo/b/<슬러그> 는 공개 번들 랜딩(토큰 아님) — 그 하위만 예외로 둔다
    if (segs[3] && segs[3] !== "b") segs[3] = ":token";
  }
  for (let k = 1; k < segs.length; k++) {
    // decodeURI 는 %40 을 풀지 않는다 — 인코딩된 이메일도 잡는다.
    if (segs[k] && EMAIL_RE.test(segs[k].replace(/%40/gi, "@"))) segs[k] = ":redacted";
  }
  return segs.join("/");
}

/** 자기 도메인 여부 — 자기 referrer 의 경로에는 우리 토큰이 들어온다. */
export function isOwnHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return PRODUCTION_HOSTS.has(h) || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app");
}

export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

/** 쿼리 문자열 → 허용 키만 남긴 레코드. */
export function sanitizeQuery(search: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!search) return out;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return out;
  }
  for (const [k, v] of params) {
    if (!ALLOWED.has(k)) continue;
    const value = v.trim();
    if (!value || EMAIL_RE.test(value)) continue;
    out[k] = value.slice(0, CLICK_ID_KEYS.has(k) ? 64 : 200);
  }
  return out;
}

export function queryToString(q: Record<string, string>): string | null {
  const keys = Object.keys(q);
  if (keys.length === 0) return null;
  const s = new URLSearchParams(q).toString();
  return s.length > 1000 ? s.slice(0, 1000) : s;
}

export interface SanitizedReferrer {
  /** "https://host/path" (쿼리·해시 제거) */
  url: string;
  /** 소문자 host, www./m. 접두 유지(분류기가 제거) */
  host: string;
  path: string;
}

export function sanitizeReferrer(raw: unknown): SanitizedReferrer | null {
  if (typeof raw !== "string" || !raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    // android-app://com.google.android.gm 같은 앱 referrer → host 만 보존
    if (u.protocol === "android-app:") {
      const host = (u.hostname || u.pathname.replace(/^\/\//, "").split("/")[0] || "").toLowerCase();
      return host ? { url: `android-app://${host}`, host, path: "/" } : null;
    }
    return null;
  }
  const host = u.hostname.toLowerCase();
  let path = (u.pathname || "/").slice(0, 300);
  // 자기 도메인에서 넘어온 referrer 에는 응시·리포트 토큰이 그대로 실려 온다 — 경로와 같은 규칙으로 가린다.
  if (isOwnHost(host)) path = maskSensitivePath(normalizePath(path) ?? path);
  return { url: `${u.protocol}//${host}${path}`.slice(0, 2000), host, path };
}

/** 영역 판정(§3.5). null = 수집 안 함(관리자). */
export function areaOfPath(path: string): string | null {
  if (isAdminPath(path)) return null;
  const seg = path.split("/")[1] ?? "";
  switch (seg) {
    case "director":
      return "director";
    case "teacher":
      return "teacher";
    case "student":
      return "student";
    case "parent":
      return "parent";
    case "tutor":
      return "tutor";
    case "g":
      return "drill";
    case "login":
    case "signup":
    case "register":
    case "auth":
    case "join":
    case "forgot-password":
    case "reset-password":
    case "find-id":
    case "onboarding":
      return "auth";
    default:
      return "marketing";
  }
}

/** 리포트용 경로 그룹핑 — 동적 ID 세그먼트를 :id 로 접는다. */
export function pathGroup(path: string): string {
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^c[a-z0-9]{20,}$/.test(seg)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
      if (/^\d{3,}$/.test(seg)) return ":id";
      // 20자 이상 토큰은 접되, 사람이 읽는 SEO 슬러그는 그대로 둔다(공개 콘텐츠 성과가 한 줄에 묻힌다 — U3-2)
      if (seg.length >= 20 && /^[A-Za-z0-9_-]+$/.test(seg) && !isReadableSlug(seg)) return ":id";
      return seg;
    })
    .join("/");
}

export const CLIENT_ID_RE = /^[A-Za-z0-9_-]{12,40}$/;

export function isValidClientId(v: unknown): v is string {
  return typeof v === "string" && CLIENT_ID_RE.test(v);
}

export function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}
