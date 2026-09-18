// ============================================================================
// Google Search Console 읽기 전용 진단 — 연결 검사(probe)·제출 사이트맵·검색 실적.
// 계약: docs/analytics/analytics-spec.md §10 (/admin/analytics/setup)
//
// ⚠️ 쓰기 호출 금지(submitSitemap 등). 업스트림 오류 원문·서비스 계정 이메일·env 키 이름은
//    응답에 그대로 싣지 않는다(SEC-10) — probe.error 는 사전 정의 요약, 원문은 probe.debug
//    (SUPER_ADMIN 응답에만 실린다) 와 서버 로그에만 남긴다.
// ============================================================================

import "server-only";
import {
  GSC_SITE_URL,
  gscConfigured,
  gscCredentialInfo,
  listSitemaps,
  querySearchAnalytics,
  type GscResult,
  type SearchAnalyticsRow,
} from "@/lib/seo/google-search-console";
import { addDays, toKstDay } from "../time";

/** 최고관리자에게만 내보내는 원본 진단(업스트림 원문·인증 출처). */
export interface GscProbeDebug {
  /** Google 응답 원문(600자 절단) */
  upstream: string | null;
  /** 현재 인증에 쓰인 env 키 이름 */
  credentialSource: string | null;
  /** 서비스 계정 이메일 */
  serviceAccount: string | null;
  /** 전용 계정을 넣을 env 키 이름 */
  envHint: string;
}

export interface GscProbe {
  ok: boolean;
  /** HTTP 상태. 0 = 호출 전 실패(미설정·토큰 발급 실패·시간 초과) */
  status: number;
  /** 사전 정의 요약 메시지(업스트림 원문 아님) */
  error: string | null;
  /** 한국어 조치 안내(성공 시 null) — 자격증명 식별자는 담지 않는다 */
  remedy: string | null;
  /** SUPER_ADMIN 응답에만 포함 */
  debug?: GscProbeDebug;
}

export interface GscSitemapRow {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  errors: number;
  warnings: number;
  /** 사이트맵에 들어 있다고 구글이 읽어간 URL 수 */
  submitted: number;
}

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  /** 클릭률 % (0~100, 소수 1자리) */
  ctr: number;
  /** 평균 순위(소수 1자리) */
  position: number;
}

export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSection {
  configured: boolean;
  siteUrl: string;
  /** 색인 현황은 API 가 주지 않는다(WmxSitemapContent.indexed = deprecated) — 콘솔에서 확인 */
  consoleUrl: string;
  probe: GscProbe;
  sitemaps: GscSitemapRow[] | null;
  /** 최근 28일(데이터 확정 지연 3일 제외) 검색어 상위 25 */
  topQueries: GscQueryRow[] | null;
  topPages: GscPageRow[] | null;
}

const GSC_TIMEOUT_MS = 20_000;
const SC_ENV_KEY = "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_B64";

/** Search Console 콘솔에서 이 속성을 여는 주소. */
function consoleUrlFor(siteUrl: string): string {
  return `https://search.google.com/search-console?resource_id=${encodeURIComponent(siteUrl)}`;
}

async function withTimeout<T>(p: Promise<GscResult<T>>): Promise<GscResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<GscResult<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, status: 0, error: `응답 시간 초과(${GSC_TIMEOUT_MS / 1000}초)` }),
      GSC_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      p.catch((err: unknown): GscResult<T> => ({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Google API 오류 본문(JSON) → 사람이 읽을 메시지 + 사유 코드 */
function parseGoogleError(raw: string | undefined): { message: string | null; reasons: string[] } {
  if (!raw) return { message: null, reasons: [] };
  try {
    const body = JSON.parse(raw) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
        details?: Array<{ reason?: string }>;
      };
    };
    const e = body.error;
    const reasons = [
      e?.status,
      ...(e?.errors ?? []).map((x) => x.reason),
      ...(e?.details ?? []).map((x) => x.reason),
    ].filter((x): x is string => typeof x === "string" && x.length > 0);
    return { message: e?.message ? e.message.slice(0, 600) : raw.slice(0, 600), reasons };
  } catch {
    return { message: raw.slice(0, 600), reasons: [] };
  }
}

/** 실패 분류 → 화면에 내보낼 요약 + 조치. 업스트림 문자열은 분류에만 쓰고 반환하지 않는다. */
function classify(status: number, message: string | null, reasons: string[]): { error: string; remedy: string } {
  const text = `${message ?? ""} ${reasons.join(" ")}`;

  if (status === 0) {
    if (/인증 실패/.test(message ?? "")) {
      return {
        error: "서비스 계정 인증 실패 — 액세스 토큰을 발급하지 못했습니다",
        remedy: "서비스 계정 키(JSON base64)가 올바른지, 키가 폐기되지 않았는지 배포 환경변수에서 확인하세요.",
      };
    }
    if (/시간 초과/.test(message ?? "")) {
      return { error: "Google API 응답 시간 초과", remedy: "잠시 후 「다시 확인」을 누르세요." };
    }
    return {
      error: "Google API 에 접속하지 못했습니다(네트워크 오류)",
      remedy: "서버에서 Google 로 나가는 요청이 막혀 있지 않은지 확인한 뒤 「다시 확인」을 누르세요.",
    };
  }
  if (status === 403 && /SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/i.test(text)) {
    return {
      error: "Google Search Console API 가 꺼져 있습니다 (HTTP 403)",
      remedy:
        "① Google Cloud 콘솔 → API 및 서비스 → 라이브러리에서 이 서비스 계정이 속한 프로젝트의 「Google Search Console API」를 사용 설정하세요. " +
        `② 그다음 Search Console → 설정 → 사용자 및 권한에서 그 서비스 계정 이메일을 사용자로 추가하세요(조회는 「전체」, 사이트맵 제출은 「소유자」). ①만 하면 속성(${GSC_SITE_URL}) 권한이 없어 다시 403 이 납니다.`,
    };
  }
  if (status === 403 || status === 404) {
    return {
      error: `이 속성에 대한 접근 권한이 없습니다 (HTTP ${status})`,
      remedy: `Search Console → 설정 → 사용자 및 권한에서 서비스 계정 이메일을 속성(${GSC_SITE_URL}) 사용자로 추가하세요(조회는 「전체」, 사이트맵 제출은 「소유자」).`,
    };
  }
  if (status === 401) {
    return {
      error: "인증 토큰이 거부됐습니다 (HTTP 401)",
      remedy: "서비스 계정 키를 재발급해 배포 환경변수를 갱신하고 재배포하세요.",
    };
  }
  if (status === 429) {
    return { error: "API 할당량 초과 (HTTP 429)", remedy: "잠시 후 다시 확인하세요." };
  }
  return {
    error: `Google API 오류 (HTTP ${status})`,
    remedy: "일시적인 실패일 수 있습니다. 잠시 후 「다시 확인」을 누르세요.",
  };
}

function toProbe(result: GscResult<unknown>): GscProbe {
  if (result.ok) return { ok: true, status: result.status, error: null, remedy: null };
  const { message, reasons } = parseGoogleError(result.error);
  const { error, remedy } = classify(result.status, message, reasons);
  const cred = gscCredentialInfo();
  // 원문은 서버 로그에만 남긴다(응답에는 SUPER_ADMIN 일 때만 debug 로 실린다).
  console.warn("[analytics] GSC probe 실패", { status: result.status, upstream: message, source: cred.source });
  return {
    ok: false,
    status: result.status,
    error,
    remedy,
    debug: {
      upstream: message,
      credentialSource: cred.source,
      serviceAccount: cred.clientEmail,
      envHint: SC_ENV_KEY,
    },
  };
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function searchMetrics(r: SearchAnalyticsRow): Omit<GscQueryRow, "query"> {
  return {
    clicks: toInt(r.clicks),
    impressions: toInt(r.impressions),
    ctr: round1(toInt(r.ctr) * 100),
    position: round1(toInt(r.position)),
  };
}

export async function gscDiagnosis(): Promise<GscSection> {
  const configured = gscConfigured();
  const base = {
    configured,
    siteUrl: GSC_SITE_URL,
    consoleUrl: consoleUrlFor(GSC_SITE_URL),
    sitemaps: null,
    topQueries: null,
    topPages: null,
  };
  if (!configured) {
    return {
      ...base,
      probe: {
        ok: false,
        status: 0,
        error: "서비스 계정이 설정되지 않았습니다",
        remedy:
          "Search Console 속성에 사용자로 추가한 서비스 계정의 JSON 키를 base64 로 인코딩해 배포 환경변수(Search Console 전용 서비스 계정 키)에 넣고 재배포하세요.",
        debug: { upstream: null, credentialSource: null, serviceAccount: null, envHint: SC_ENV_KEY },
      },
    };
  }

  // 1) 연결 진단 = 사이트맵 목록 조회(읽기). 실패하면 나머지 호출은 생략(같은 원인으로 실패한다).
  const sm = await withTimeout(listSitemaps());
  if (!sm.ok) return { ...base, probe: toProbe(sm) };

  // 2) 검색 실적 — 확정 데이터 기준 최근 28일(오늘-3일까지).
  const endDate = addDays(toKstDay(Date.now()), -3);
  const startDate = addDays(endDate, -27);
  const [queries, pages] = await Promise.all([
    withTimeout(querySearchAnalytics({ startDate, endDate, dimensions: ["query"], rowLimit: 25 })),
    withTimeout(querySearchAnalytics({ startDate, endDate, dimensions: ["page"], rowLimit: 25 })),
  ]);
  const firstFail = [queries, pages].find((r) => !r.ok);

  return {
    ...base,
    probe: firstFail ? toProbe(firstFail) : toProbe(sm),
    // 「색인」 열은 만들지 않는다 — WmxSitemapContent.indexed 는 구글이 deprecated 로 표시했고
    // 항상 0 이 내려와 「색인 0건」으로 오독된다. 색인 현황은 consoleUrl 로 안내한다.
    sitemaps: (sm.data?.sitemap ?? []).map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      isPending: Boolean(s.isPending),
      errors: toInt(s.errors),
      warnings: toInt(s.warnings),
      submitted: (s.contents ?? []).reduce((sum, c) => sum + toInt(c.submitted), 0),
    })),
    topQueries: queries.ok
      ? (queries.data?.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? "", ...searchMetrics(r) }))
      : null,
    topPages: pages.ok ? (pages.data?.rows ?? []).map((r) => ({ page: r.keys?.[0] ?? "", ...searchMetrics(r) })) : null,
  };
}
