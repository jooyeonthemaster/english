// ============================================================================
// 추적 링크(/go/[slug]) — 입력 검증·URL 조립·프리셋. 순수 함수, 서버/클라이언트 공용(Prisma import 금지).
// 계약: docs/analytics/analytics-spec.md §2.5, §2.6
//
// - slug: ^[a-z0-9][a-z0-9-]{1,40}$ (/go/ 하위라 예약어 충돌 없음)
// - destination: 내부 경로만("/" 시작, "//"·"\"·"/admin" 금지, 500자) — 오픈 리다이렉트 금지
//   ※ 문자열 검사만으로는 "/.//evil.com"·"/./admin"·"/%2e%2e/admin" 이 새므로 URL 로 정규화한 뒤
//     같은 검사를 다시 하고, 저장·미리보기·리다이렉트 모두 정규화된 값을 쓴다(normalizeDestination).
// - utmSource·utmMedium 필수(소문자 trim, 100자), utmCampaign/utmContent/utmTerm 선택(trim, 100자)
//   ※ 모든 텍스트 필드는 제어문자(CR/LF·탭) 금지 — 유입경로 표·필터 칩에서 같은 값이 갈라진다.
// ============================================================================

export const LINK_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const LINK_SLUG_MAX = 41;
export const LINK_DESTINATION_MAX = 500;
export const LINK_UTM_MAX = 100;
export const LINK_LABEL_MAX = 100;
export const LINK_NOTE_MAX = 500;

/** 공개 짧은 주소 경로 접두 */
export const SHORT_LINK_PREFIX = "/go/";

export interface TrackedLinkInput {
  label: string;
  slug: string;
  destination: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  note: string | null;
  isActive: boolean;
}

export type TrackedLinkField = keyof TrackedLinkInput;
export type LinkFieldErrors = Partial<Record<TrackedLinkField, string>>;

export type LinkValidation<T> = { ok: true; value: T } | { ok: false; errors: LinkFieldErrors };

// ── 필드 단위 검증 ───────────────────────────────────────────────────────────

export function isValidSlug(v: unknown): v is string {
  return typeof v === "string" && LINK_SLUG_RE.test(v);
}

/** 제어문자(줄바꿈·탭·NUL·U+2028/2029) — 어떤 입력에도 저장하지 않는다. */
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;
const CONTROL_CHARS_GLOBAL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/g;

/** 붙여넣기로 들어온 줄바꿈·제어문자를 지운다(화면 입력과 서버 검증이 같은 규칙). */
export function stripControlChars(v: string): string {
  return v.replace(CONTROL_CHARS_GLOBAL_RE, "");
}

/** 경로에서 금지 패턴을 찾는다(정규화 전·후 같은 규칙으로 두 번 본다). */
function forbiddenPathReason(pathname: string): string | null {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const lower = decoded.toLowerCase();
  if (lower.startsWith("/admin")) return "관리자 경로(/admin)로는 보낼 수 없습니다";
  if (lower.startsWith("//") || pathname.startsWith("//") || lower.includes("\\")) {
    return "외부 주소로 해석되는 경로는 쓸 수 없습니다";
  }
  if (lower.startsWith(SHORT_LINK_PREFIX)) return "추적 링크(/go/…)를 다시 목적지로 쓸 수 없습니다";
  return null;
}

/**
 * 목적지 경로 검증 + 정규화. 통과하면 저장·리다이렉트에 쓸 정규화된 경로를 돌려준다.
 * 정규화 후 재검사가 핵심 — "/.//evil.com"·"/./admin/members"·"/%2e%2e/%2e%2e/admin" 은
 * 원문 문자열만 보면 전부 통과하지만 브라우저·Next 는 //evil.com·/admin 으로 해석한다.
 */
export function normalizeDestination(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  const d = raw.trim();
  if (!d) return bad("목적지 경로를 입력하세요");
  if (d.length > LINK_DESTINATION_MAX) return bad(`목적지는 ${LINK_DESTINATION_MAX}자 이하여야 합니다`);
  if (!d.startsWith("/")) return bad("목적지는 / 로 시작하는 사이트 내부 경로여야 합니다");
  if (d.startsWith("//")) return bad("// 로 시작하는 경로는 외부 주소로 해석돼 쓸 수 없습니다");
  // 브라우저는 "\" 를 "/" 로 취급한다("/\evil.com" = 외부 주소) · 공백·제어문자는 경로에 불필요
  for (let i = 0; i < d.length; i++) {
    const code = d.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || d[i] === "\\") return bad("목적지에 역슬래시·공백·제어문자를 쓸 수 없습니다");
  }
  // 경로 부분은 % 디코딩 후에도 검사(/%61dmin, /%2F%2Fevil.com 우회 차단).
  const rawReason = forbiddenPathReason(d.split(/[?#]/)[0] ?? d);
  if (rawReason) return bad(rawReason);

  // 상대 세그먼트(.·..)·중복 슬래시를 해소한 뒤 같은 검사를 다시 한다.
  let u: URL;
  try {
    u = new URL(d, "http://normalize.invalid");
  } catch {
    return bad("목적지 경로를 해석할 수 없습니다");
  }
  const normalized = `${u.pathname}${u.search}${u.hash}`;
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return bad("외부 주소로 해석되는 경로는 쓸 수 없습니다");
  }
  const reason = forbiddenPathReason(u.pathname);
  if (reason) return bad(reason);
  if (normalized.length > LINK_DESTINATION_MAX) return bad(`목적지는 ${LINK_DESTINATION_MAX}자 이하여야 합니다`);
  return { ok: true, value: normalized };
}

/** 목적지 경로 검증 — 통과하면 null, 아니면 사유 문자열(화면 오류 문구). */
export function destinationError(raw: string): string | null {
  const r = normalizeDestination(raw);
  return r.ok ? null : r.error;
}

const CONTROL_ERROR = "줄바꿈·제어문자는 쓸 수 없습니다";

function requiredText(raw: unknown, max: number, lower: boolean): { value: string } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { error: "필수 항목입니다" };
  const v = lower ? raw.trim().toLowerCase() : raw.trim();
  if (v.length > max) return { error: `${max}자 이하로 입력하세요` };
  // utm 값에 CR/LF 가 들어가면 유입경로 표·필터 칩에서 같은 소스가 둘로 갈라진다.
  if (CONTROL_CHARS_RE.test(v)) return { error: CONTROL_ERROR };
  return { value: v };
}

function optionalText(raw: unknown, max: number): { value: string | null } | { error: string } {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "string") return { error: "문자열이어야 합니다" };
  const v = raw.trim();
  if (!v) return { value: null };
  if (v.length > max) return { error: `${max}자 이하로 입력하세요` };
  if (CONTROL_CHARS_RE.test(v)) return { error: CONTROL_ERROR };
  return { value: v };
}

type FieldResult = { value: unknown } | { error: string };

const FIELD_VALIDATORS: Record<TrackedLinkField, (raw: unknown) => FieldResult> = {
  label: (raw) => requiredText(raw, LINK_LABEL_MAX, false),
  slug: (raw) => {
    if (typeof raw !== "string" || !raw.trim()) return { error: "짧은 주소(slug)를 입력하세요" };
    const v = raw.trim();
    if (!LINK_SLUG_RE.test(v)) return { error: "영문 소문자·숫자·하이픈 2~41자(첫 글자는 영문/숫자)" };
    return { value: v };
  },
  destination: (raw) => {
    if (typeof raw !== "string") return { error: "목적지 경로를 입력하세요" };
    const r = normalizeDestination(raw);
    // 저장값은 정규화된 경로 — 화면 미리보기·/go 리다이렉트·DB 가 같은 문자열을 본다.
    return r.ok ? { value: r.value } : { error: r.error };
  },
  utmSource: (raw) => requiredText(raw, LINK_UTM_MAX, true),
  utmMedium: (raw) => requiredText(raw, LINK_UTM_MAX, true),
  utmCampaign: (raw) => optionalText(raw, LINK_UTM_MAX),
  utmContent: (raw) => optionalText(raw, LINK_UTM_MAX),
  utmTerm: (raw) => optionalText(raw, LINK_UTM_MAX),
  note: (raw) => optionalText(raw, LINK_NOTE_MAX),
  isActive: (raw) => (typeof raw === "boolean" ? { value: raw } : { error: "true/false 여야 합니다" }),
};

const REQUIRED_ON_CREATE: TrackedLinkField[] = ["label", "slug", "destination", "utmSource", "utmMedium"];
const ALL_FIELDS = Object.keys(FIELD_VALIDATORS) as TrackedLinkField[];

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** 생성 입력 검증(POST). isActive 생략 시 true. */
export function validateLinkCreate(raw: unknown): LinkValidation<TrackedLinkInput> {
  const body = asRecord(raw);
  if (!body) return { ok: false, errors: { label: "잘못된 요청 본문입니다" } };
  const errors: LinkFieldErrors = {};
  const out: Record<string, unknown> = {};
  for (const f of ALL_FIELDS) {
    if (f === "isActive" && body.isActive === undefined) {
      out.isActive = true;
      continue;
    }
    const r = FIELD_VALIDATORS[f](body[f]);
    if ("error" in r) errors[f] = r.error;
    else out[f] = r.value;
  }
  for (const f of REQUIRED_ON_CREATE) if (!(f in out) && !errors[f]) errors[f] = "필수 항목입니다";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: out as unknown as TrackedLinkInput };
}

/** 부분 수정 입력 검증(PATCH) — 들어온 키만 검증. 빈 패치는 오류. */
export function validateLinkPatch(raw: unknown): LinkValidation<Partial<TrackedLinkInput>> {
  const body = asRecord(raw);
  if (!body) return { ok: false, errors: { label: "잘못된 요청 본문입니다" } };
  const errors: LinkFieldErrors = {};
  const out: Record<string, unknown> = {};
  for (const f of ALL_FIELDS) {
    if (!(f in body)) continue;
    const r = FIELD_VALIDATORS[f](body[f]);
    if ("error" in r) errors[f] = r.error;
    else out[f] = r.value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(out).length === 0) return { ok: false, errors: { label: "바꿀 항목이 없습니다" } };
  return { ok: true, value: out as Partial<TrackedLinkInput> };
}

// ── URL 조립 ────────────────────────────────────────────────────────────────

export interface UtmParams {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

const UTM_KEYS: Array<[keyof UtmParams, string]> = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmContent", "utm_content"],
  ["utmTerm", "utm_term"],
];

/**
 * 경로(+기존 쿼리·해시)에 utm_* 와 sl 을 병합한 "경로?쿼리#해시" 문자열.
 * 기존 쿼리는 보존하고, 같은 키는 링크 값이 우선한다. 비어 있는 utm 값은 붙이지 않는다.
 */
export function mergeTrackingQuery(path: string, utm: UtmParams, slug?: string | null): string {
  const hashAt = path.indexOf("#");
  const hash = hashAt >= 0 ? path.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? path.slice(0, hashAt) : path;
  const qAt = noHash.indexOf("?");
  const pathname = qAt >= 0 ? noHash.slice(0, qAt) : noHash;
  const params = new URLSearchParams(qAt >= 0 ? noHash.slice(qAt + 1) : "");
  for (const [field, key] of UTM_KEYS) {
    const v = utm[field]?.trim();
    if (v) params.set(key, v);
  }
  if (slug) params.set("sl", slug);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

/** 추적 링크의 리다이렉트 목적지(경로+쿼리). 서버 /go/[slug] 와 화면 미리보기가 같은 규칙을 쓴다. */
export function linkRedirectPath(link: UtmParams & { slug: string; destination: string }): string {
  return mergeTrackingQuery(link.destination, link, link.slug);
}

/** 짧은 주소 "https://www.smoat.co.kr/go/<slug>" */
export function shortLinkUrl(base: string, slug: string): string {
  return `${base.replace(/\/+$/, "")}${SHORT_LINK_PREFIX}${slug}`;
}

/** 절대 URL(base + 경로) */
export function absoluteSiteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── slug 제안 ───────────────────────────────────────────────────────────────

/**
 * 라벨(과 보조 값)에서 slug 후보를 만든다. 한글 라벨은 영문이 남지 않으므로 소스·캠페인·콘텐츠로 보완.
 * 결과가 규칙을 만족하지 않으면 빈 문자열.
 */
export function suggestSlug(label: string, fallbackParts: Array<string | null | undefined> = []): string {
  const toSlug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[_\s.]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  let slug = toSlug(label);
  if (slug.length < 2) slug = toSlug(fallbackParts.filter(Boolean).join("-"));
  slug = slug.slice(0, LINK_SLUG_MAX).replace(/-+$/g, "");
  return LINK_SLUG_RE.test(slug) ? slug : "";
}

// ── 프리셋 ──────────────────────────────────────────────────────────────────

export interface LinkPreset {
  key: string;
  label: string;
  utmSource: string;
  utmMedium: string;
  utmContent?: string;
}

export const LINK_PRESETS: LinkPreset[] = [
  { key: "insta-bio", label: "인스타 프로필", utmSource: "instagram", utmMedium: "social", utmContent: "bio" },
  { key: "insta-story", label: "인스타 스토리", utmSource: "instagram", utmMedium: "social", utmContent: "story" },
  { key: "threads", label: "스레드", utmSource: "threads", utmMedium: "social" },
  { key: "kakao-share", label: "카톡 단톡방 공유", utmSource: "kakaotalk", utmMedium: "share" },
  { key: "kakao-channel", label: "카카오톡 채널", utmSource: "kakao_channel", utmMedium: "messenger" },
  { key: "naver-blog", label: "네이버 블로그", utmSource: "naver_blog", utmMedium: "blog" },
  { key: "naver-cafe", label: "네이버 카페", utmSource: "naver_cafe", utmMedium: "community" },
  { key: "youtube", label: "유튜브 설명란", utmSource: "youtube", utmMedium: "video" },
  { key: "flyer-qr", label: "오프라인 전단 QR", utmSource: "flyer", utmMedium: "qr" },
  { key: "seminar", label: "세미나 PPT", utmSource: "seminar", utmMedium: "offline" },
];
