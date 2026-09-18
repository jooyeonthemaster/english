// ============================================================================
// 공개 추적 링크 리다이렉트 — GET /go/[slug]
// 계약: docs/analytics/analytics-spec.md §2.5, §2.6, §3.4
//
// 활성 링크 → destination 에 utm_* + sl=<slug> 병합(기존 쿼리 보존, 같은 키는 링크 값 우선) → 302.
// 클릭한 주소에 붙어 온 광고 클릭ID(fbclid·gclid 등 §3.4 허용 키)도 목적지까지 넘긴다.
// 없음/비활성/오류 → 302 "/". 클릭 기록은 응답 뒤(after)에 하고, 실패해도 리다이렉트는 반드시 나간다.
// 봇(링크 미리보기 크롤러 포함)은 클릭 행만 isBot=true 로 남기고 clicks 는 올리지 않는다.
// 기록하지 않는 요청: HEAD(프리페치·업타임 모니터·메신저 미리보기) · 방문 분석 거부(쿠키·GPC).
// ============================================================================

import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPT_OUT_COOKIE } from "@/lib/analytics/consent";
import { ALLOWED_QUERY_KEYS, sanitizeReferrer } from "@/lib/analytics/sanitize";
import { linkRedirectPath, isValidSlug } from "@/lib/analytics/tracked-links";
import { isBotUserAgent, parseUserAgent } from "@/lib/analytics/user-agent";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
} as const;

/** 목적지까지 넘겨 주는 요청 쿼리 키(§3.4 허용 키와 동일 — 그 외는 버린다). */
const PASSTHROUGH_KEYS = new Set<string>(ALLOWED_QUERY_KEYS);
const PASSTHROUGH_VALUE_MAX = 200;

/**
 * 클릭한 주소(/go/<slug>?fbclid=…)에 붙은 쿼리를 목적지 쿼리에 합친다.
 * 페이스북·인스타는 fbclid, 구글 광고는 gclid 를 클릭 주소에 붙이므로 그대로 버리면
 * 목적지에서 §2.2 clickIdType 이 영영 비고 광고 성과를 이어붙일 수 없다.
 * 링크에 박힌 값(utm_*·sl)이 항상 우선이고, 허용 키가 아니면 버린다(이메일·토큰 유입 차단).
 */
function mergeIncomingQuery(req: Request, target: string): string {
  let incoming: URLSearchParams;
  try {
    incoming = new URL(req.url).searchParams;
  } catch {
    return target;
  }
  const hashAt = target.indexOf("#");
  const hash = hashAt >= 0 ? target.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? target.slice(0, hashAt) : target;
  const qAt = noHash.indexOf("?");
  const pathname = qAt >= 0 ? noHash.slice(0, qAt) : noHash;
  const params = new URLSearchParams(qAt >= 0 ? noHash.slice(qAt + 1) : "");
  let changed = false;
  for (const [key, value] of incoming) {
    if (!PASSTHROUGH_KEYS.has(key) || !value || params.has(key)) continue;
    params.set(key, value.slice(0, PASSTHROUGH_VALUE_MAX));
    changed = true;
  }
  if (!changed) return target;
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

/** 같은 origin 으로만 보낸다(오픈 리다이렉트 이중 방어). */
function redirectTo(req: Request, target: string): NextResponse {
  const origin = new URL(req.url);
  let url: URL;
  try {
    url = new URL(target, req.url);
    if (url.origin !== origin.origin) url = new URL("/", req.url);
  } catch {
    url = new URL("/", req.url);
  }
  const res = NextResponse.redirect(url, 302);
  for (const [k, v] of Object.entries(RESPONSE_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * 이 요청을 클릭 집계에서 빼야 하는가.
 * - HEAD: Next 는 HEAD 를 GET 핸들러로 처리한다 — 프리페치·업타임 모니터·메신저 미리보기가 클릭을 부풀린다.
 * - 거부 쿠키/GPC: 방침 토글이 「이 브라우저에서는 방문 분석이 실행되지 않습니다」라고 단언하므로 링크 클릭도 남기지 않는다.
 */
function skipReason(req: Request): "head" | "optout" | null {
  if (req.method === "HEAD") return "head";
  if (req.headers.get("sec-gpc") === "1") return "optout";
  const cookie = req.headers.get("cookie");
  if (cookie && cookie.split(";").some((part) => part.trim() === `${OPT_OUT_COOKIE}=1`)) return "optout";
  return null;
}

function headerValue(req: Request, name: string, max: number): string | null {
  const v = req.headers.get(name)?.trim();
  if (!v) return null;
  let decoded = v;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    decoded = v;
  }
  return decoded.slice(0, max);
}

interface ClickRecord {
  linkId: string;
  slug: string;
  referrerHost: string | null;
  deviceType: string;
  os: string;
  inApp: string | null;
  country: string | null;
  region: string | null;
  isBot: boolean;
}

async function recordClick(click: ClickRecord): Promise<void> {
  try {
    await prisma.analyticsLinkClick.create({ data: { id: randomUUID(), ...click } });
    if (!click.isBot) {
      // prisma update 는 updatedAt(@updatedAt)까지 바꾸므로 원자적 증가는 Raw SQL 로.
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "analytics_tracked_links" SET "clicks" = "clicks" + 1 WHERE "id" = ${click.linkId}`,
      );
    }
  } catch (err) {
    console.error("[go] click record failed", click.slug, err);
  }
}

const LINK_SELECT = {
  id: true,
  slug: true,
  destination: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
} satisfies Prisma.AnalyticsTrackedLinkSelect;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return redirectTo(req, "/");

  let link: Prisma.AnalyticsTrackedLinkGetPayload<{ select: typeof LINK_SELECT }> | null;
  try {
    link = await prisma.analyticsTrackedLink.findFirst({ where: { slug, isActive: true }, select: LINK_SELECT });
  } catch (err) {
    console.error("[go] link lookup failed", slug, err);
    return redirectTo(req, "/");
  }
  if (!link) return redirectTo(req, "/");

  // 목적지 = 링크에 저장된 경로+utm(+sl) 에, 클릭 주소에 붙어 온 허용 쿼리(fbclid·gclid 등)를 합친 것.
  const target = mergeIncomingQuery(req, linkRedirectPath(link));

  // HEAD·거부 요청은 리다이렉트만 하고 아무것도 남기지 않는다.
  if (skipReason(req)) return redirectTo(req, target);

  // 요청 헤더는 응답 전에 읽어 둔다(after 콜백이 요청 객체에 의존하지 않도록).
  const ua = req.headers.get("user-agent");
  const parsed = parseUserAgent(ua);
  const click: ClickRecord = {
    linkId: link.id,
    slug: link.slug,
    referrerHost: sanitizeReferrer(req.headers.get("referer"))?.host.slice(0, 255) ?? null,
    deviceType: parsed.deviceType,
    os: parsed.os,
    inApp: parsed.inApp,
    country: headerValue(req, "x-vercel-ip-country", 8),
    region: headerValue(req, "x-vercel-ip-country-region", 16),
    isBot: isBotUserAgent(ua, process.env.ANALYTICS_COUNT_NONPROD === "1"),
  };

  try {
    after(() => recordClick(click));
  } catch (err) {
    console.error("[go] after() unavailable", link.slug, err);
  }
  return redirectTo(req, target);
}