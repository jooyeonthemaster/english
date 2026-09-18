// ============================================================================
// 마케팅 픽셀 설정 — 순수 함수(서버/클라이언트 공용). DB·env 읽기는 pixels.ts(서버).
// 계약: docs/analytics/analytics-spec.md §8.1(형식), §8.4(로드 범위·민감 경로)
// ============================================================================

import { areaOfPath, isAdminPath, normalizePath } from "./sanitize";

/** platform_settings.analytics_pixels 의 ID 필드(순서 = 관리자 폼 순서). */
export const PIXEL_ID_FIELDS = [
  "ga4Id",
  "gtmId",
  "googleAdsId",
  "googleAdsSignupLabel",
  "googleAdsPurchaseLabel",
  "metaPixelId",
  "naverAnalyticsId",
  "naverAdsConversionId",
  "kakaoPixelId",
  "tiktokPixelId",
  "clarityId",
] as const;

export type PixelIdField = (typeof PIXEL_ID_FIELDS)[number];

/** 저장·유효 설정. 빈 문자열 = 미설정. */
export type PixelConfig = { enabled: boolean } & Record<PixelIdField, string>;

/** 공개 설정 API 응답의 pixels — 활성·유효 ID 만 담긴다. */
export type PublicPixels = Partial<Record<PixelIdField, string>>;

/**
 * Google Ads 전환 라벨 형식은 스펙 §8.1 에 정의가 없다 — 스크립트 문자열 주입 방지용 최소 가드
 * (Ads 전환 스니펫 send_to "AW-…/<label>" 의 라벨은 영숫자·_·- 로 구성). [감독 확인 필요]
 */
const ADS_LABEL_RE = /^[A-Za-z0-9_-]{4,64}$/;

/** §8.1 형식 검증 정규식. */
export const PIXEL_ID_PATTERNS: Record<PixelIdField, RegExp> = {
  ga4Id: /^G-[A-Z0-9]{4,15}$/,
  gtmId: /^GTM-[A-Z0-9]{4,10}$/,
  googleAdsId: /^AW-\d{6,15}$/,
  googleAdsSignupLabel: ADS_LABEL_RE,
  googleAdsPurchaseLabel: ADS_LABEL_RE,
  metaPixelId: /^\d{10,20}$/,
  naverAnalyticsId: /^[a-z0-9_]{4,40}$/i,
  naverAdsConversionId: /^[a-z0-9_]{4,40}$/i,
  kakaoPixelId: /^\d{10,25}$/,
  tiktokPixelId: /^[A-Z0-9]{10,30}$/,
  clarityId: /^[a-z0-9]{6,20}$/,
};

/** 형식 힌트(입력 placeholder·오류 메시지 공용). */
export const PIXEL_FORMAT_HINTS: Record<PixelIdField, string> = {
  ga4Id: "G-XXXXXXXXXX",
  gtmId: "GTM-XXXXXXX",
  googleAdsId: "AW-123456789",
  googleAdsSignupLabel: "전환 라벨 (영문·숫자·_·-)",
  googleAdsPurchaseLabel: "전환 라벨 (영문·숫자·_·-)",
  metaPixelId: "숫자 10~20자리",
  naverAnalyticsId: "네이버 애널리틱스 발급ID",
  naverAdsConversionId: "광고 공통키 (s_ 로 시작)",
  kakaoPixelId: "숫자 10~25자리",
  tiktokPixelId: "영문 대문자·숫자 10~30자",
  clarityId: "영문 소문자·숫자 6~20자",
};

/** env 폴백 변수명(§8.1 — DB 값이 비었을 때만 사용). */
export const PIXEL_ENV_KEYS: Record<PixelIdField, string> = {
  ga4Id: "NEXT_PUBLIC_GA4_ID",
  gtmId: "NEXT_PUBLIC_GTM_ID",
  googleAdsId: "NEXT_PUBLIC_GOOGLE_ADS_ID",
  googleAdsSignupLabel: "NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL",
  googleAdsPurchaseLabel: "NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL",
  metaPixelId: "NEXT_PUBLIC_META_PIXEL_ID",
  naverAnalyticsId: "NEXT_PUBLIC_NAVER_ANALYTICS_ID",
  naverAdsConversionId: "NEXT_PUBLIC_NAVER_ADS_CONVERSION_ID",
  kakaoPixelId: "NEXT_PUBLIC_KAKAO_PIXEL_ID",
  tiktokPixelId: "NEXT_PUBLIC_TIKTOK_PIXEL_ID",
  clarityId: "NEXT_PUBLIC_CLARITY_ID",
};

export function isPixelIdField(key: string): key is PixelIdField {
  return (PIXEL_ID_FIELDS as readonly string[]).includes(key);
}

export function emptyPixelConfig(enabled = true): PixelConfig {
  const out = { enabled } as PixelConfig;
  for (const f of PIXEL_ID_FIELDS) out[f] = "";
  return out;
}

/** 값이 비었거나 형식이 맞으면 null, 아니면 오류 메시지. 호출 전 trim 할 것. */
export function pixelFieldError(field: PixelIdField, value: string): string | null {
  if (!value) return null;
  return PIXEL_ID_PATTERNS[field].test(value) ? null : `형식이 올바르지 않습니다 (예: ${PIXEL_FORMAT_HINTS[field]})`;
}

export function isValidPixelId(field: PixelIdField, value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && PIXEL_ID_PATTERNS[field].test(value);
}

export type PixelInputResult =
  | { ok: true; config: PixelConfig }
  | { ok: false; errors: Record<string, string> };

/** PUT 본문 검증 — 알 수 없는 키는 무시, ID 는 trim 후 형식 검증(빈 값 허용). */
export function validatePixelInput(body: unknown): PixelInputResult {
  const errors: Record<string, string> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: { _body: "요청 본문은 JSON 객체여야 합니다." } };
  }
  const raw = body as Record<string, unknown>;
  const config = emptyPixelConfig();
  if (typeof raw.enabled !== "boolean") errors.enabled = "사용 여부(enabled)는 true/false 여야 합니다.";
  else config.enabled = raw.enabled;
  for (const f of PIXEL_ID_FIELDS) {
    const v = raw[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") {
      errors[f] = "문자열이어야 합니다.";
      continue;
    }
    const value = v.trim();
    const err = pixelFieldError(f, value);
    if (err) errors[f] = err;
    else config[f] = value;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, config };
}

/** 유효 설정 → 공개 응답용(비활성이면 빈 객체). Ads 라벨은 Ads ID 가 있을 때만. */
export function toPublicPixels(config: PixelConfig): PublicPixels {
  if (!config.enabled) return {};
  const out: PublicPixels = {};
  for (const f of PIXEL_ID_FIELDS) {
    if (isValidPixelId(f, config[f])) out[f] = config[f];
  }
  if (!out.googleAdsId) {
    delete out.googleAdsSignupLabel;
    delete out.googleAdsPurchaseLabel;
  }
  return out;
}

/** 클라이언트 방어: 서버 응답을 다시 형식 검증한다(스크립트 URL 주입 차단). */
export function sanitizePublicPixels(raw: unknown): PublicPixels {
  const out: PublicPixels = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const f of PIXEL_ID_FIELDS) {
    const v = r[f];
    if (isValidPixelId(f, v)) out[f] = v;
  }
  if (!out.googleAdsId) {
    delete out.googleAdsSignupLabel;
    delete out.googleAdsPurchaseLabel;
  }
  return out;
}

export function hasAnyPixel(p: PublicPixels): boolean {
  return !!(
    p.ga4Id ||
    p.gtmId ||
    p.googleAdsId ||
    p.metaPixelId ||
    p.naverAnalyticsId ||
    p.naverAdsConversionId ||
    p.kakaoPixelId ||
    p.tiktokPixelId ||
    p.clarityId
  );
}

// ── §8.4 로드 범위 ───────────────────────────────────────────────────────────

/**
 * 로드 금지 경로(토큰·미성년자·민감 쿼리). §8.4 목록 + (student-app) 라우트 그룹의
 * 최상위 학생 경로 /assignments·/exams(§3.5 area 로는 marketing 으로 잡히지만 학생 화면).
 * Next 라우팅은 대소문자를 구분하지만 브라우저 주소창·외부 링크는 /T/<토큰> 처럼 들어올 수 있고
 * 그 경로도 루트 레이아웃을 렌더한다 → 판정은 항상 소문자 경로로 한다(U8-5).
 */
const PIXEL_BLOCKED_RE: RegExp[] = [
  /^\/admin(\/|$)/i,
  /^\/auth\/(complete|onboarding)(\/|$)/i,
  /^\/(t|r|a)(\/|$)/i,
  /^\/g(\/|$)/i,
  /^\/(student|parent|tutor)(\/|$)/i,
  /^\/credits\/promo(\/|$)/i,
  /^\/coupon(\/|$)/i,
  /^\/(assignments|exams)(\/|$)/i,
];

const PIXEL_AUTH_ALLOW_RE = /^\/(register|login)(\/|$)/i;

/** 허용 영역: marketing · /register · /login · director · teacher (§8.4). */
export function isPixelAllowedPath(rawPath: string | null | undefined): boolean {
  const path = normalizePath(rawPath);
  if (!path) return false;
  // 대소문자 우회 차단(/T/<토큰>·/Admin 등) — 영역 판정도 같은 소문자 경로로 한다.
  const lower = path.toLowerCase();
  if (isAdminPath(lower)) return false;
  if (PIXEL_BLOCKED_RE.some((re) => re.test(lower))) return false;
  if (PIXEL_AUTH_ALLOW_RE.test(lower)) return true;
  const area = areaOfPath(lower);
  return area === "marketing" || area === "director" || area === "teacher";
}

/**
 * Clarity(세션 녹화·히트맵) 전용 허용 영역 — §14 D13.
 * 원장·강사 화면에는 학생 이름·성적이 렌더되므로 녹화 대상에서 제외한다.
 * 허용: marketing · /register · /login 뿐.
 */
export function isClarityAllowedPath(rawPath: string | null | undefined): boolean {
  const path = normalizePath(rawPath);
  if (!path || !isPixelAllowedPath(path)) return false;
  const lower = path.toLowerCase();
  if (PIXEL_AUTH_ALLOW_RE.test(lower)) return true;
  return areaOfPath(lower) === "marketing";
}
