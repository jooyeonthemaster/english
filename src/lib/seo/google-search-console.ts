/**
 * Google Search Console API 클라이언트 (서버 전용, 새 의존성 0 — jose 만 사용).
 *
 * ⚠️ 핵심 사실(리서치 검증):
 *  - Google "Indexing API" 는 JobPosting/BroadcastEvent 전용이라 일반 SaaS 페이지엔
 *    쓸 수 없다(미지원 용도 = 스팸정책 위반·계정 회수 위험). 여기선 절대 사용하지 않는다.
 *  - 합법 자동화는 ① Sitemaps API(사이트맵 제출) ② URL Inspection(색인 상태 "조회"만)
 *    ③ Search Analytics(키워드 노출/클릭/순위 모니터링). 색인을 "강제"하는 API 는 없다.
 *  - 구식 sitemap ping(google.com/ping?sitemap=)은 2023-06 폐지(404) — 쓰지 않는다.
 *
 * 인증: 서비스계정 JSON(base64) → RS256 서명 JWT → 액세스토큰.
 *   서비스계정 이메일을 Search Console 속성에 "사용자"로 추가해야 동작한다
 *   (사이트맵 제출은 "소유자", 읽기 전용은 "전체" 권한).
 * 속성: 도메인 속성 → siteUrl = "sc-domain:smoat.co.kr".
 */

import { SignJWT, importPKCS8 } from "jose";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE_WEBMASTERS = "https://www.googleapis.com/auth/webmasters";

const DEFAULT_SITE_URL =
  process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL || "sc-domain:smoat.co.kr";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

function loadServiceAccount(): ServiceAccount | null {
  const b64 =
    process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64 ||
    process.env.GOOGLE_DOC_AI_SERVICE_ACCOUNT_B64 || // 동일 SA 에 GSC 권한 부여 시 재사용
    "";
  if (!b64.trim()) return null;
  try {
    const json = Buffer.from(b64.trim(), "base64").toString("utf-8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(
  scope = SCOPE_WEBMASTERS,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const sa = loadServiceAccount();
  if (!sa) return null;

  try {
    const key = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email)
      .setSubject(sa.client_email)
      .setAudience(TOKEN_ENDPOINT)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      exp: now + (data.expires_in ?? 3600),
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export function gscConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export type GscResult<T = unknown> = {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
};

/**
 * 사이트맵 제출(자동). PUT webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}.
 * 성공 시 빈 응답. 서비스계정이 속성 "소유자" 권한이어야 한다.
 */
export async function submitSitemap(
  feedUrl: string,
  siteUrl: string = DEFAULT_SITE_URL,
): Promise<GscResult> {
  const token = await getAccessToken(SCOPE_WEBMASTERS);
  if (!token)
    return { ok: false, status: 0, error: "GSC 서비스계정 미설정/인증 실패" };

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/sitemaps/${encodeURIComponent(feedUrl)}`;

  const res = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    ok: res.ok,
    status: res.status,
    error: res.ok ? undefined : await res.text().catch(() => undefined),
  };
}

/**
 * URL 색인 상태 "조회"(제출 아님). per-site 2,000 QPD 한도 — 핵심 페이지에만.
 */
export async function inspectUrl(
  inspectionUrl: string,
  siteUrl: string = DEFAULT_SITE_URL,
): Promise<GscResult> {
  const token = await getAccessToken(SCOPE_WEBMASTERS);
  if (!token)
    return { ok: false, status: 0, error: "GSC 서비스계정 미설정/인증 실패" };

  const res = await fetch(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl,
        languageCode: "ko",
      }),
    },
  );
  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? await res.json().catch(() => undefined) : undefined,
    error: res.ok ? undefined : await res.text().catch(() => undefined),
  };
}

export type SearchAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/**
 * 키워드 노출/클릭/평균순위 모니터링. dataState 기본 'final' 이라
 * 최근 2~3일은 비어있을 수 있어 endDate 는 오늘-3일 권장.
 */
export async function querySearchAnalytics(opts: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: ("query" | "page" | "country" | "device" | "date")[];
  rowLimit?: number;
  siteUrl?: string;
}): Promise<GscResult<{ rows?: SearchAnalyticsRow[] }>> {
  const token = await getAccessToken(SCOPE_WEBMASTERS);
  if (!token)
    return { ok: false, status: 0, error: "GSC 서비스계정 미설정/인증 실패" };

  const siteUrl = opts.siteUrl ?? DEFAULT_SITE_URL;
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl,
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions ?? ["query"],
        rowLimit: Math.min(opts.rowLimit ?? 1000, 25000),
      }),
    },
  );
  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? await res.json().catch(() => undefined) : undefined,
    error: res.ok ? undefined : await res.text().catch(() => undefined),
  };
}

export const GSC_SITE_URL = DEFAULT_SITE_URL;
