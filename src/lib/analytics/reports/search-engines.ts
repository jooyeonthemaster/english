// ============================================================================
// 리포트: 검색엔진·사이트맵 — 사이트맵 URL 수·섹션, robots/llms/rss, 소유확인, IndexNow 키 실검증,
// Google Search Console 실연결 진단(읽기 전용, ./search-engines-gsc) + 검색어·페이지 상위,
// 네이버 서치어드바이저 안내.
// 계약: docs/analytics/analytics-spec.md §10 (/admin/analytics/setup)
//
// ⚠️ 쓰기 호출 금지: submitSitemap·pingIndexNow 등 외부로 "제출"하는 함수는 여기서 부르지 않는다.
// 외부 호출이 느려 모듈 메모리 캐시 10분(refresh=true 면 무시).
// ============================================================================

import "server-only";
import sitemap from "@/app/sitemap";
import { SITE, absoluteUrl } from "@/lib/seo/config";
import { indexNowConfig } from "@/lib/seo/indexnow";
import { gscDiagnosis, type GscSection } from "./search-engines-gsc";

export type {
  GscPageRow,
  GscProbe,
  GscProbeDebug,
  GscQueryRow,
  GscSection,
  GscSitemapRow,
} from "./search-engines-gsc";

/** 소유확인 코드 1건의 주입 상태 — 하드코딩 폴백이면 fromEnv=false(어떤 환경에서도 초록인 것을 구분). */
export interface VerificationState {
  present: boolean;
  fromEnv: boolean;
}

/** IndexNow 키 파일 실검증 — 검색엔진이 키를 확인하는 방식(keyLocation GET)과 같다. */
export interface IndexNowCheck {
  state: "match" | "mismatch" | "unreachable" | "skipped";
  status: number;
  detail: string | null;
}

export interface SearchEnginesReport {
  sitemap: {
    url: string;
    total: number;
    bySection: Array<{ section: string; count: number }>;
    /** 실제 갱신일(route.lastModified·학교 updatedAt)이 있는 항목의 최대값. 없으면 null */
    lastModified: string | null;
    /** 실제 갱신일이 있는 항목 수(나머지는 요청 시각이 lastmod 로 나간다) */
    datedEntries: number;
  };
  robotsUrl: string;
  llmsUrl: string;
  rssUrl: string;
  /** 소유확인 메타 태그 코드가 레이아웃에 들어가 있는지(콘솔의 확인 완료 여부와는 별개) */
  verification: { google: VerificationState; naver: VerificationState };
  indexNow: { configured: boolean; fromEnv: boolean; keyLocation: string; keyCheck: IndexNowCheck };
  gsc: GscSection;
  naver: { verified: boolean; consoleUrl: string; note: string };
}

const CACHE_TTL_MS = 10 * 60_000;
const KEY_CHECK_TIMEOUT_MS = 5_000;

let cache: { at: number; data: SearchEnginesReport } | null = null;
let inflight: Promise<SearchEnginesReport> | null = null;

export interface SearchEnginesOptions {
  refresh?: boolean;
  /** SUPER_ADMIN 응답에만 true — GSC 원본 진단(업스트림 원문·서비스 계정)을 포함한다(SEC-10). */
  includeDebug?: boolean;
}

export async function getSearchEnginesReport(opts: SearchEnginesOptions = {}): Promise<SearchEnginesReport> {
  const full = await load(opts.refresh === true);
  return opts.includeDebug ? full : stripDebug(full);
}

async function load(refresh: boolean): Promise<SearchEnginesReport> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = build()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 자격증명 식별자가 담긴 probe.debug 를 떼어낸 사본(캐시 원본은 그대로 둔다). */
function stripDebug(report: SearchEnginesReport): SearchEnginesReport {
  if (!report.gsc.probe.debug) return report;
  const probe = { ...report.gsc.probe };
  delete probe.debug;
  return { ...report, gsc: { ...report.gsc, probe } };
}

async function build(): Promise<SearchEnginesReport> {
  const idx = indexNowConfig();
  const [sitemapInfo, gsc, keyCheck] = await Promise.all([
    sitemapSummary(),
    gscDiagnosis(),
    checkIndexNowKey(idx.keyLocation),
  ]);
  return {
    sitemap: sitemapInfo,
    robotsUrl: absoluteUrl("/robots.txt"),
    llmsUrl: absoluteUrl("/llms.txt"),
    rssUrl: absoluteUrl("/rss.xml"),
    verification: {
      google: verificationState(SITE.verification.google, process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION),
      naver: verificationState(SITE.verification.naver, process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION),
    },
    indexNow: {
      configured: idx.configured,
      fromEnv: Boolean(process.env.INDEXNOW_KEY?.trim()),
      keyLocation: idx.keyLocation,
      keyCheck,
    },
    gsc,
    naver: {
      verified: Boolean(SITE.verification.naver),
      consoleUrl: "https://searchadvisor.naver.com/",
      note: "네이버 서치어드바이저는 이 화면과 API 로 연동돼 있지 않습니다. 콘솔에 로그인해 사이트맵·RSS 제출 상태와 수집·노출 현황을 확인하세요. 공개 URL 변경 통지는 /api/seo/submit 크론(vercel.json, 매일 12:00 KST 1회)이 IndexNow 로 네이버 엔드포인트에도 보내도록 구성돼 있습니다.",
    },
  };
}

function verificationState(value: string | undefined, envValue: string | undefined): VerificationState {
  return { present: Boolean(value), fromEnv: Boolean(envValue && envValue.trim()) };
}

// ---------------------------------------------------------------------------
// IndexNow — 키 파일을 실제로 GET 해 본문이 키와 같은지 본다(검증 실패 시 통지가 무효).
// ---------------------------------------------------------------------------

/** keyLocation(기본 `<site>/<key>.txt`)에서 기대 키를 뽑는다. 사용자 지정 위치면 null. */
function expectedKeyFrom(keyLocation: string): string | null {
  try {
    const file = new URL(keyLocation).pathname.split("/").filter(Boolean).pop() ?? "";
    const m = /^([A-Za-z0-9-]{8,128})\.txt$/.exec(file);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function checkIndexNowKey(keyLocation: string): Promise<IndexNowCheck> {
  if (!keyLocation) return { state: "skipped", status: 0, detail: "키 위치가 없습니다" };
  const expected = expectedKeyFrom(keyLocation);
  try {
    const res = await fetch(keyLocation, {
      cache: "no-store",
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { state: "unreachable", status: res.status, detail: `키 파일 응답 HTTP ${res.status}` };
    }
    const body = (await res.text()).trim();
    if (!expected) {
      return body
        ? { state: "skipped", status: res.status, detail: "사용자 지정 키 위치 — 파일은 응답하지만 키 일치는 확인하지 않았습니다" }
        : { state: "mismatch", status: res.status, detail: "키 파일이 비어 있습니다" };
    }
    if (body === expected) return { state: "match", status: res.status, detail: null };
    return {
      state: "mismatch",
      status: res.status,
      detail: "키 파일 내용이 파일 이름의 키와 다릅니다(검색엔진 검증 실패 — 파일을 교체하세요)",
    };
  } catch {
    // 응답 없음(잘못된 호스트·포트, 네트워크 차단). 오류 원문은 싣지 않는다.
    return { state: "unreachable", status: 0, detail: "키 파일을 가져오지 못했습니다(응답 없음)" };
  }
}

// ---------------------------------------------------------------------------
// 사이트맵 — src/app/sitemap.ts 를 그대로 호출(학교 DB 조회 포함)해 실제 제공분을 센다.
//
// ⚠️ sitemap.ts 는 lastModified 가 없는 항목에 `new Date()`(생성 시각)를 넣는다. 그대로 최대값을
//    구하면 「최신 lastmod = 지금」이 되어 매 호출 값이 달라진다 → 호출 시각 이후 값은 제외하고
//    실제 갱신일이 있는 항목만 센다.
// ---------------------------------------------------------------------------

async function sitemapSummary(): Promise<SearchEnginesReport["sitemap"]> {
  const startedAt = Date.now();
  const entries = await sitemap();
  // 생성 시각으로 채워진 항목을 걸러낼 기준(호출 직전보다 1초 이전까지만 "실제 갱신일"로 인정).
  const generatedFloor = startedAt - 1_000;
  const sections = new Map<string, number>();
  let latest = 0;
  let dated = 0;
  for (const entry of entries) {
    let pathname = "/";
    try {
      pathname = new URL(entry.url).pathname;
    } catch {
      pathname = entry.url.startsWith("/") ? entry.url : "/";
    }
    const first = pathname.split("/").filter(Boolean)[0];
    const section = first ? first : "home";
    sections.set(section, (sections.get(section) ?? 0) + 1);
    if (entry.lastModified) {
      const t = new Date(entry.lastModified).getTime();
      if (Number.isFinite(t) && t < generatedFloor) {
        dated += 1;
        if (t > latest) latest = t;
      }
    }
  }
  return {
    url: absoluteUrl("/sitemap.xml"),
    total: entries.length,
    bySection: [...sections.entries()]
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count || a.section.localeCompare(b.section)),
    lastModified: latest ? new Date(latest).toISOString() : null,
    datedEntries: dated,
  };
}
