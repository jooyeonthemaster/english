// ============================================================================
// 수집 본체 — POST /api/collect 의 서버 로직.
// 계약: docs/analytics/analytics-spec.md §3.2, §6
//
// 원칙: 절대 throw 하지 않는다(I4). 모든 쓰기는 멱등(클라 난수 id + ON CONFLICT).
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyAttribution, campaignSignature, type Attribution } from "./classify";
import { OPT_OUT_COOKIE } from "./consent";
import {
  ackConversions,
  detectConversions,
  dueForDetect,
  getSessionState,
  pendingConversions,
  setSessionState,
  type ConversionInstruction,
} from "./ingest-conversions";
import { intIn, parseHits, titleOf, type EngHit, type EvHit, type PvHit } from "./ingest-hits";
import { isBotUserAgent, parseUserAgent } from "./user-agent";
import {
  PRODUCTION_HOSTS,
  areaOfPath,
  clip,
  isValidClientId,
  queryToString,
  sanitizeQuery,
  sanitizeReferrer,
} from "./sanitize";

const MAX_BODY = 16_000;

export type { ConversionInstruction };

export interface IngestResult {
  hadPageview: boolean;
  conversions: ConversionInstruction[];
}

function allowNonProd(): boolean {
  return process.env.ANALYTICS_COUNT_NONPROD === "1";
}

function requestHost(headers: Headers): string {
  const raw = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  return raw.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}

function originAllowed(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true; // sendBeacon/same-origin 요청은 Origin 이 없을 수 있다
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return PRODUCTION_HOSTS.has(h) || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/**
 * 서버 쪽 거부 존중 — 거부 쿠키·GPC 헤더가 있으면 저장하지 않는다(RC-OPTOUT ④).
 * 구버전 JS 가 캐시돼 계속 보내는 경우까지 막는 최종 방어선이다.
 */
function isOptedOut(headers: Headers): boolean {
  const cookie = headers.get("cookie") ?? "";
  if (cookie.split(/;\s*/).some((c) => c.trim() === `${OPT_OUT_COOKIE}=1`)) return true;
  return headers.get("sec-gpc") === "1";
}

function hasStaffCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(cookieHeader);
}

function hasAdminCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)yshin-admin-session=/.test(cookieHeader);
}

interface SessionContext {
  attribution: Attribution;
  referrer: string | null;
  referrerHost: string | null;
  landingQuery: string | null;
  trackedLink: string | null;
  screen: string | null;
  language: string | null;
  timezone: string | null;
}

function buildContext(ctx: unknown, inApp: string | null): SessionContext {
  const c = ctx && typeof ctx === "object" ? (ctx as Record<string, unknown>) : {};
  const ref = sanitizeReferrer(c.ref);
  let search = "";
  if (typeof c.url === "string") {
    try {
      search = new URL(c.url).search;
    } catch {
      search = "";
    }
  }
  const query = sanitizeQuery(search);
  const attribution = classifyAttribution({ referrerHost: ref?.host ?? null, query, inApp });
  const sw = intIn(c.sw, 0, 10000);
  const sh = intIn(c.sh, 0, 10000);
  return {
    attribution,
    referrer: ref?.url ?? null,
    referrerHost: ref?.host ?? null,
    landingQuery: queryToString(query),
    trackedLink: query.sl && /^[a-z0-9][a-z0-9-]{1,40}$/.test(query.sl) ? query.sl : null,
    screen: sw && sh ? `${sw}x${sh}` : null,
    language: clip(c.lang, 20),
    timezone: clip(c.tz, 60),
  };
}

function geo(headers: Headers) {
  const country = clip(headers.get("x-vercel-ip-country"), 8);
  const region = clip(headers.get("x-vercel-ip-country-region"), 16);
  let city = headers.get("x-vercel-ip-city");
  if (city) {
    try {
      city = decodeURIComponent(city);
    } catch {
      // 원문 유지
    }
  }
  return { country, region, city: clip(city, 80) };
}

/**
 * 계정 연결. 이미 연결된 세션이면 UPDATE 2건을 보내지 않는다(L4-4 — 매 히트 반복 제거).
 * 역할(role)은 전환 판정에 필요할 때만 조회한다.
 */
async function linkAccount(
  visitorId: string,
  sessionId: string,
  alreadyLinked: boolean,
): Promise<{ academyId: string; role: string } | null> {
  // 동적 import — auth 모듈(NextAuth) 초기화를 로그인 쿠키가 있을 때만.
  const { getStaffSession } = await import("@/lib/auth");
  const staff = await getStaffSession().catch(() => null);
  if (!staff?.academyId || !staff.id) return null;
  if (!alreadyLinked) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "analytics_sessions" SET "academyId" = ${staff.academyId}, "staffId" = ${staff.id}
      WHERE "id" = ${sessionId} AND "academyId" IS NULL`);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "analytics_visitors" SET "academyId" = ${staff.academyId}, "staffId" = ${staff.id}, "linkedAt" = ${new Date()}
      WHERE "id" = ${visitorId} AND "academyId" IS NULL`);
  }
  return { academyId: staff.academyId, role: staff.role };
}

export async function ingest(req: Request): Promise<IngestResult | null> {
  try {
    const headers = req.headers;
    if (!originAllowed(headers)) return null;
    if (isOptedOut(headers)) return null;
    const ua = headers.get("user-agent");
    if (isBotUserAgent(ua, allowNonProd())) return null;

    const text = await req.text();
    if (!text || text.length > MAX_BODY) return null;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
    const vid = body.vid;
    const sid = body.sid;
    if (!isValidClientId(vid) || !isValidClientId(sid)) return null;

    const now = Date.now();
    // 수신 시각 — 세션 lastSeenAt 과 실시간 판정의 기준(D18). 이벤트 createdAt 만 클라 ts 를 쓴다.
    const receivedAt = new Date(now);
    const { hits, acks } = parseHits(body.hits, now);
    if (acks.length) {
      await ackConversions(vid, acks).catch((err) => console.error("[analytics] ack failed", err));
    }
    if (hits.length === 0) return acks.length ? { hadPageview: false, conversions: [] } : null;

    const cookieHeader = headers.get("cookie");
    const host = requestHost(headers);
    const isInternal = hasAdminCookie(cookieHeader) || (!PRODUCTION_HOSTS.has(host) && !allowNonProd());

    const parsedUa = parseUserAgent(ua);
    const context = buildContext(body.ctx, parsedUa.inApp);
    const hasCtx = !!body.ctx && typeof body.ctx === "object";
    const g = geo(headers);

    const pvs = hits.filter((h): h is PvHit => h.t === "pv");
    const evs = hits.filter((h): h is EvHit => h.t === "ev");
    const engs = hits.filter((h): h is EngHit => h.t === "eng");

    // ── 1) 이벤트 (멱등) ──
    let pvInserted = 0;
    let evInserted = 0;
    if (pvs.length) {
      const r = await prisma.analyticsEvent.createMany({
        data: pvs.map((h) => ({
          id: h.id,
          sessionId: sid,
          visitorId: vid,
          type: "pageview",
          path: h.p,
          title: titleOf(h),
          area: areaOfPath(h.p) ?? "marketing",
          prevPath: h.pp,
          createdAt: new Date(h.ts),
        })),
        skipDuplicates: true,
      });
      pvInserted = r.count;
    }
    if (evs.length) {
      const r = await prisma.analyticsEvent.createMany({
        data: evs.map((h) => ({
          id: h.id,
          sessionId: sid,
          visitorId: vid,
          type: "event",
          name: h.n,
          path: h.p,
          area: areaOfPath(h.p) ?? "marketing",
          props: h.pr ?? Prisma.JsonNull,
          createdAt: new Date(h.ts),
        })),
        skipDuplicates: true,
      });
      evInserted = r.count;
    }
    for (const h of engs) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "analytics_events"
        SET "engagedMs" = GREATEST(COALESCE("engagedMs", 0), ${h.ms}),
            "scrollPct" = CASE WHEN ${h.sc}::int IS NULL THEN "scrollPct" ELSE GREATEST(COALESCE("scrollPct", 0), ${h.sc}::int) END
        WHERE "id" = ${h.id} AND "sessionId" = ${sid}`);
    }

    const engagedDelta = hits.reduce((s, h) => s + (h.t === "eng" || h.t === "hb" ? h.d : 0), 0);
    const firstTs = Math.min(...hits.map((h) => h.ts));
    const lastHit = hits.reduce((a, b) => (b.ts >= a.ts ? b : a));
    const entryHit = pvs[0] ?? hits[0];
    const entryTitle = pvs[0] ? titleOf(pvs[0]) : null;
    const a = hasCtx ? context.attribution : null;

    // ── 2) 방문자 upsert ──
    const visitorRows = await prisma.$queryRaw<Array<{ inserted: boolean }>>(Prisma.sql`
      INSERT INTO "analytics_visitors" ("id","firstSeenAt","lastSeenAt","sessionCount","pageviewCount","firstSessionId",
        "firstChannel","firstSource","firstMedium","firstCampaign","firstReferrerHost","firstLandingPath","firstTrackedLink")
      VALUES (${vid}, ${new Date(firstTs)}, ${receivedAt}, 0, ${pvInserted}, ${sid},
        ${a?.channel ?? "direct"}, ${a?.source ?? "(direct)"}, ${a?.medium ?? null}, ${a?.campaign ?? null},
        ${hasCtx ? context.referrerHost : null}, ${entryHit.p}, ${hasCtx ? context.trackedLink : null})
      ON CONFLICT ("id") DO UPDATE SET
        "firstSeenAt" = LEAST("analytics_visitors"."firstSeenAt", EXCLUDED."firstSeenAt"),
        "lastSeenAt" = GREATEST("analytics_visitors"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "pageviewCount" = "analytics_visitors"."pageviewCount" + EXCLUDED."pageviewCount"
      RETURNING (xmax = 0) AS "inserted"`);
    const visitorIsNew = visitorRows[0]?.inserted ?? false;

    // ── 3) 세션 upsert ──
    const sessionRows = await prisma.$queryRaw<Array<{ inserted: boolean; academyId: string | null }>>(Prisma.sql`
      INSERT INTO "analytics_sessions" ("id","visitorId","startedAt","lastSeenAt","engagedMs","pageviews","eventsCount","isNewVisitor",
        "entryPath","entryTitle","exitPath","hostname","referrer","referrerHost","channel","source","medium","campaign","term","content",
        "clickIdType","trackedLink","landingQuery","deviceType","browser","browserVersion","os","inApp","screen","language","timezone",
        "country","region","city","isInternal")
      VALUES (${sid}, ${vid}, ${new Date(firstTs)}, ${receivedAt}, ${engagedDelta}, ${pvInserted}, ${evInserted},
        ${hasCtx ? visitorIsNew || body.nv === true : visitorIsNew},
        ${entryHit.p}, ${entryTitle}, ${lastHit.p}, ${host || null},
        ${hasCtx ? context.referrer : null}, ${hasCtx ? context.referrerHost : null},
        ${a?.channel ?? "direct"}, ${a?.source ?? "(direct)"}, ${a?.medium ?? null}, ${a?.campaign ?? null}, ${a?.term ?? null}, ${a?.content ?? null},
        ${a?.clickIdType ?? null}, ${hasCtx ? context.trackedLink : null}, ${hasCtx ? context.landingQuery : null},
        ${parsedUa.deviceType}, ${parsedUa.browser}, ${parsedUa.browserVersion}, ${parsedUa.os}, ${parsedUa.inApp},
        ${hasCtx ? context.screen : null}, ${hasCtx ? context.language : null}, ${hasCtx ? context.timezone : null},
        ${g.country}, ${g.region}, ${g.city}, ${isInternal})
      ON CONFLICT ("id") DO UPDATE SET
        "lastSeenAt" = GREATEST("analytics_sessions"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "engagedMs" = "analytics_sessions"."engagedMs" + EXCLUDED."engagedMs",
        "pageviews" = "analytics_sessions"."pageviews" + EXCLUDED."pageviews",
        "eventsCount" = "analytics_sessions"."eventsCount" + EXCLUDED."eventsCount",
        "exitPath" = CASE WHEN EXCLUDED."lastSeenAt" >= "analytics_sessions"."lastSeenAt" THEN EXCLUDED."exitPath" ELSE "analytics_sessions"."exitPath" END,
        "isInternal" = "analytics_sessions"."isInternal" OR EXCLUDED."isInternal"
      RETURNING (xmax = 0) AS "inserted", "academyId"`);
    if (sessionRows[0]?.inserted) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "analytics_visitors" SET "sessionCount" = "sessionCount" + 1 WHERE "id" = ${vid}`);
    }

    // ── 4) 계정 연결 + 5) 전환 ──
    // 이미 연결된 세션이면 UPDATE 2건을 보내지 않고, 전환 조회도 세션당 창(60초)에 1회만 한다(L4-4).
    let conversions: ConversionInstruction[] = [];
    const sessionAcademyId = sessionRows[0]?.academyId ?? null;
    const cached = getSessionState(sid);
    let academyId = sessionAcademyId ?? cached?.academyId ?? null;
    let role = cached?.role ?? null;
    const onPageview = pvs.length > 0 && !isInternal;
    if (hasStaffCookie(cookieHeader) && (!academyId || (onPageview && !role))) {
      const linked = await linkAccount(vid, sid, !!sessionAcademyId).catch((err) => {
        console.error("[analytics] link failed", err);
        return null;
      });
      if (linked) {
        academyId = linked.academyId;
        role = linked.role;
      }
    }
    if (academyId) setSessionState(sid, { academyId, role });
    if (academyId && onPageview && dueForDetect(sid, now)) {
      try {
        // 신규 전환 판정은 원장 세션에서만(§6). 재전송은 계정에 연결된 세션이면 한다 —
        // 쿠키가 만료돼도 미확인 전환이 영영 발사되지 않는 일이 없도록(D17).
        if (role === "DIRECTOR") await detectConversions({ academyId, visitorId: vid, sessionId: sid });
        conversions = await pendingConversions(vid);
      } catch (err) {
        console.error("[analytics] conversion detect failed", err);
      }
    }

    return { hadPageview: pvs.length > 0, conversions };
  } catch (err) {
    console.error("[analytics] ingest failed", err);
    return null;
  }
}

// 클라이언트와 같은 캠페인 서명 규칙을 서버에서도 노출(게이트 대조용).
export { campaignSignature };
