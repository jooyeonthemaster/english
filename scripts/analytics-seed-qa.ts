/**
 * 검수용 합성 유입 데이터 — 대시보드 화면 검수·스크린샷 전용.
 *   npx tsx scripts/analytics-seed-qa.ts          # 심기(기존 qa-seed 먼저 삭제)
 *   npx tsx scripts/analytics-seed-qa.ts --clean  # 삭제만
 *
 * 식별: visitor/session/event id 접두 "qa-seed-", hostname "qa.seed", 추적 링크 slug 접두 "qa-seed-".
 * ⚠ 운영 DB 다. 배포 전 반드시 --clean. (analytics_* 테이블만 건드린다 — 기존 테이블 쓰기 0)
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const P = "qa-seed-";
const DAY = 86_400_000;

// 결정론 난수(재현 가능)
let seed = 20260917;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(arr: Array<[T, number]>): T {
  const total = arr.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of arr) {
    r -= w;
    if (r <= 0) return v;
  }
  return arr[arr.length - 1][0];
}
function id(kind: string, n: number) {
  return `${P}${kind}-${n.toString(36).padStart(5, "0")}`;
}

async function clean() {
  const e = await prisma.analyticsEvent.deleteMany({ where: { id: { startsWith: P } } });
  const s = await prisma.analyticsSession.deleteMany({ where: { id: { startsWith: P } } });
  const v = await prisma.analyticsVisitor.deleteMany({ where: { id: { startsWith: P } } });
  const c = await prisma.analyticsConversion.deleteMany({ where: { id: { startsWith: P } } });
  const lc = await prisma.analyticsLinkClick.deleteMany({ where: { id: { startsWith: P } } });
  const l = await prisma.analyticsTrackedLink.deleteMany({ where: { slug: { startsWith: P } } });
  console.log(`cleaned: events ${e.count}, sessions ${s.count}, visitors ${v.count}, conversions ${c.count}, linkClicks ${lc.count}, links ${l.count}`);
}

const SOURCES: Array<[{ channel: string; source: string; referrerHost: string | null; medium?: string; campaign?: string; inApp?: string; link?: string }, number]> = [
  [{ channel: "organic_search", source: "naver", referrerHost: "search.naver.com" }, 22],
  [{ channel: "organic_search", source: "google", referrerHost: "www.google.com" }, 16],
  [{ channel: "organic_search", source: "daum", referrerHost: "search.daum.net" }, 2],
  [{ channel: "direct", source: "(direct)", referrerHost: null }, 18],
  [{ channel: "organic_social", source: "instagram", referrerHost: "l.instagram.com", inApp: "instagram" }, 9],
  [{ channel: "organic_social", source: "instagram", referrerHost: null, medium: "social", campaign: "bio_link", inApp: "instagram", link: `${P}insta-bio` }, 4],
  [{ channel: "messenger", source: "kakaotalk", referrerHost: null, inApp: "kakaotalk" }, 8],
  [{ channel: "community", source: "naver_blog", referrerHost: "m.blog.naver.com" }, 6],
  [{ channel: "community", source: "naver_cafe", referrerHost: "cafe.naver.com", inApp: "naver" }, 5],
  [{ channel: "video", source: "youtube", referrerHost: "m.youtube.com" }, 2],
  [{ channel: "ai", source: "chatgpt", referrerHost: "chatgpt.com" }, 3],
  [{ channel: "paid_search", source: "naver", referrerHost: "search.naver.com", medium: "cpc", campaign: "sept_mock_kw" }, 3],
  [{ channel: "organic_social", source: "threads", referrerHost: "l.threads.com", inApp: "threads" }, 1],
  [{ channel: "referral", source: "hagwon.example.kr", referrerHost: "hagwon.example.kr" }, 1],
];

const MARKETING = ["/", "/resources", "/resources/2026-09-hakpyeong-english", "/faq", "/features/exam", "/features/worksheet", "/guides", "/about", "/seminar", "/credits/products", "/schools/seoul"];
const APP = ["/director/studio", "/director/credits", "/director/exams", "/teacher", "/director/students"];
const REGIONS: Array<[string, number]> = [["11", 30], ["41", 25], ["28", 7], ["26", 6], ["27", 5], ["30", 4], ["29", 3], ["48", 4], ["47", 3], ["44", 3], ["43", 2], ["52", 2], ["46", 2], ["51", 1], ["50", 1], ["31", 1], ["49", 1]];

async function main() {
  await clean();
  if (process.argv.includes("--clean")) return;

  const now = Date.now();
  const academies = await prisma.academy.findMany({
    where: { createdAt: { gte: new Date(now - 28 * DAY) } },
    select: { id: true, createdAt: true, staff: { where: { role: "DIRECTOR" }, select: { id: true }, take: 1 } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const visitors: Prisma.AnalyticsVisitorCreateManyInput[] = [];
  const sessions: Prisma.AnalyticsSessionCreateManyInput[] = [];
  const events: Prisma.AnalyticsEventCreateManyInput[] = [];
  let ev = 0;

  const VISITORS = 520;
  for (let vi = 0; vi < VISITORS; vi++) {
    const vid = id("v", vi);
    const src = pick(SOURCES);
    const mobile = src.inApp ? true : rnd() < 0.55;
    const firstAt = now - Math.floor(rnd() * 30 * DAY);
    // 한국 시간 낮·저녁에 몰리게
    const kstHour = pick<number>([[9, 3], [10, 5], [11, 5], [13, 5], [14, 6], [15, 6], [16, 5], [20, 6], [21, 7], [22, 6], [23, 3], [1, 1], [7, 2]]);
    const base = new Date(firstAt);
    base.setUTCHours((kstHour + 24 - 9) % 24, Math.floor(rnd() * 60), 0, 0);
    const firstSeen = Math.min(base.getTime(), now - 60_000);
    const sessionCount = rnd() < 0.3 ? 2 + Math.floor(rnd() * 3) : 1;
    const region = pick(REGIONS);
    const device = mobile ? (rnd() < 0.08 ? "tablet" : "mobile") : "desktop";
    const os = device === "desktop" ? pick<string>([["Windows", 7], ["macOS", 3]]) : pick<string>([["iOS", 5], ["Android", 5]]);
    const browser = src.inApp ? `인앱:${src.inApp}` : device === "desktop" ? pick<string>([["Chrome", 6], ["Whale", 2], ["Edge", 1], ["Safari", 1]]) : pick<string>([["Safari", 5], ["Chrome", 3], ["Samsung Internet", 2]]);
    let pvTotal = 0;
    let lastSeen = firstSeen;

    for (let si = 0; si < sessionCount; si++) {
      const sid = id(`s${vi}`, si);
      const start = si === 0 ? firstSeen : Math.min(firstSeen + Math.floor(rnd() * 10 * DAY) + si * 3_600_000, now - 30_000);
      const s = si === 0 ? src : pick(SOURCES);
      const pages = 1 + Math.floor(Math.pow(rnd(), 1.8) * 6);
      const inAppFlow = rnd() < 0.18 && si > 0;
      let t = start;
      let prev: string | null = null;
      let engaged = 0;
      const entry = s.link ? "/" : pick<string>(MARKETING.map((p, i) => [p, i === 0 ? 8 : i < 3 ? 4 : 2]));
      for (let pi = 0; pi < pages; pi++) {
        const path = pi === 0 ? entry : inAppFlow ? APP[Math.floor(rnd() * APP.length)] : MARKETING[Math.floor(rnd() * MARKETING.length)];
        const dwell = 3_000 + Math.floor(Math.pow(rnd(), 2) * 180_000);
        events.push({
          id: id("e", ev++),
          sessionId: sid,
          visitorId: vid,
          type: "pageview",
          path,
          title: path === "/" ? "스모트(SMOAT)" : `${path} | SMOAT`,
          area: path.startsWith("/director") ? "director" : path.startsWith("/teacher") ? "teacher" : "marketing",
          prevPath: prev,
          engagedMs: dwell,
          scrollPct: Math.floor(rnd() * 100),
          createdAt: new Date(t),
        });
        if (rnd() < 0.12) {
          events.push({
            id: id("e", ev++),
            sessionId: sid,
            visitorId: vid,
            type: "event",
            name: pick<string>([["cta_click", 6], ["outbound", 2], ["download", 2]]),
            path,
            area: "marketing",
            props: { label: "무료로 시작하기" },
            createdAt: new Date(t + 2000),
          });
        }
        engaged += dwell;
        prev = path;
        t += dwell + 1500;
      }
      pvTotal += pages;
      lastSeen = Math.max(lastSeen, t);
      sessions.push({
        id: sid,
        visitorId: vid,
        startedAt: new Date(start),
        lastSeenAt: new Date(Math.min(t, now)),
        engagedMs: engaged,
        pageviews: pages,
        eventsCount: 0,
        isNewVisitor: si === 0,
        entryPath: entry,
        exitPath: prev,
        hostname: "qa.seed",
        referrer: s.referrerHost ? `https://${s.referrerHost}/` : null,
        referrerHost: s.referrerHost,
        channel: s.channel,
        source: s.source,
        medium: s.medium ?? null,
        campaign: s.campaign ?? null,
        trackedLink: s.link ?? null,
        landingQuery: s.campaign ? `utm_source=${s.source}&utm_medium=${s.medium}&utm_campaign=${s.campaign}` : null,
        deviceType: device,
        browser,
        os,
        inApp: s.inApp ?? null,
        screen: device === "desktop" ? "1920x1080" : "390x844",
        language: "ko-KR",
        timezone: "Asia/Seoul",
        country: rnd() < 0.97 ? "KR" : "US",
        region,
        city: region === "11" ? "Seoul" : region === "41" ? "Suwon-si" : null,
        isInternal: false,
      });
    }
    visitors.push({
      id: vid,
      firstSeenAt: new Date(firstSeen),
      lastSeenAt: new Date(Math.min(lastSeen, now)),
      sessionCount,
      pageviewCount: pvTotal,
      firstSessionId: id(`s${vi}`, 0),
      firstChannel: src.channel,
      firstSource: src.source,
      firstMedium: src.medium ?? null,
      firstCampaign: src.campaign ?? null,
      firstReferrerHost: src.referrerHost,
      firstLandingPath: sessions.find((x) => x.id === id(`s${vi}`, 0))?.entryPath ?? "/",
      firstTrackedLink: src.link ?? null,
    });
  }

  // 실시간 — 최근 5분 활성 세션 6개
  for (let k = 0; k < 6; k++) {
    const s = sessions[sessions.length - 1 - k * 7];
    if (!s) continue;
    s.lastSeenAt = new Date(now - (k + 1) * 35_000);
    s.startedAt = new Date(now - (k + 1) * 35_000 - 240_000);
    const e = events.filter((x) => x.sessionId === s.id);
    e.forEach((x, i) => (x.createdAt = new Date(now - (k + 1) * 35_000 - (e.length - i) * 30_000)));
  }

  // 가입 귀속 — 최근 가입 학원에 합성 방문자 연결(방문이 가입보다 앞서게)
  academies.forEach((a, i) => {
    const v = visitors[i * 7];
    if (!v) return;
    const before = a.createdAt.getTime() - (1 + (i % 4)) * DAY + 3_600_000 * (i % 5);
    v.firstSeenAt = new Date(before);
    v.academyId = a.id;
    v.staffId = a.staff[0]?.id ?? null;
    v.linkedAt = a.createdAt;
    const s = sessions.find((x) => x.id === v.firstSessionId);
    if (s) {
      s.startedAt = new Date(before);
      s.lastSeenAt = new Date(before + 300_000);
      s.academyId = null;
      events
        .filter((x) => x.sessionId === s.id)
        .forEach((x, j) => (x.createdAt = new Date(before + j * 40_000)));
    }
    // 가입 당일 세션(로그인 후)
    const sid = `${P}signup-${i}`;
    sessions.push({
      id: sid,
      visitorId: v.id,
      startedAt: new Date(a.createdAt.getTime() - 120_000),
      lastSeenAt: new Date(a.createdAt.getTime() + 600_000),
      engagedMs: 540_000,
      pageviews: 3,
      eventsCount: 1,
      isNewVisitor: false,
      entryPath: "/register",
      exitPath: "/director/studio",
      hostname: "qa.seed",
      channel: "direct",
      source: "(direct)",
      deviceType: "desktop",
      browser: "Chrome",
      os: "Windows",
      country: "KR",
      region: "11",
      academyId: a.id,
      staffId: a.staff[0]?.id ?? null,
      isInternal: false,
      hasConversion: true,
    });
    ["/register", "/auth/onboarding", "/director/studio"].forEach((path, j) =>
      events.push({
        id: id("e", ev++),
        sessionId: sid,
        visitorId: v.id,
        type: "pageview",
        path,
        area: path.startsWith("/director") ? "director" : "auth",
        prevPath: j ? ["/register", "/auth/onboarding"][j - 1] : null,
        engagedMs: 60_000,
        createdAt: new Date(a.createdAt.getTime() - 120_000 + j * 90_000),
      }),
    );
  });

  // 추적 링크 2개 + 클릭
  const link1 = await prisma.analyticsTrackedLink.create({
    data: { slug: `${P}insta-bio`, label: "[QA] 인스타 프로필 링크", destination: "/", utmSource: "instagram", utmMedium: "social", utmCampaign: "bio_link", clicks: 41 },
  });
  await prisma.analyticsTrackedLink.create({
    data: { slug: `${P}kakao-share`, label: "[QA] 카톡 단톡방 공유", destination: "/resources", utmSource: "kakaotalk", utmMedium: "share", utmCampaign: "sept_resources", clicks: 12 },
  });
  const clicks: Prisma.AnalyticsLinkClickCreateManyInput[] = Array.from({ length: 41 }, (_, i) => ({
    id: id("lc", i),
    linkId: link1.id,
    slug: link1.slug,
    referrerHost: "l.instagram.com",
    deviceType: "mobile",
    os: i % 2 ? "iOS" : "Android",
    inApp: "instagram",
    country: "KR",
    region: pick(REGIONS),
    createdAt: new Date(now - Math.floor(rnd() * 20 * DAY)),
  }));

  for (const s of sessions) {
    s.eventsCount = events.filter((e) => e.sessionId === s.id && e.type === "event").length;
  }

  // 불변식(U5-10): 방문자 firstSeenAt ≤ 그 방문자의 가장 이른 세션 시작 ≤ 가장 늦은 세션 끝 ≤ lastSeenAt.
  // 귀속 보정에서 첫 세션만 앞당기면 다른 세션이 firstSeenAt 보다 앞서는 행이 생긴다(실측 3건, 전부 시드).
  const bounds = new Map<string, { min: number; max: number }>();
  for (const s of sessions) {
    const start = new Date(s.startedAt as Date).getTime();
    const end = new Date((s.lastSeenAt ?? s.startedAt) as Date).getTime();
    const cur = bounds.get(s.visitorId);
    if (!cur) bounds.set(s.visitorId, { min: start, max: end });
    else bounds.set(s.visitorId, { min: Math.min(cur.min, start), max: Math.max(cur.max, end) });
  }
  for (const v of visitors) {
    const b = bounds.get(v.id);
    if (!b) continue;
    if (b.min < new Date(v.firstSeenAt as Date).getTime()) v.firstSeenAt = new Date(b.min);
    if (b.max > new Date(v.lastSeenAt as Date).getTime()) v.lastSeenAt = new Date(b.max);
  }

  await prisma.analyticsVisitor.createMany({ data: visitors });
  for (let i = 0; i < sessions.length; i += 500) await prisma.analyticsSession.createMany({ data: sessions.slice(i, i + 500) });
  for (let i = 0; i < events.length; i += 1000) await prisma.analyticsEvent.createMany({ data: events.slice(i, i + 1000) });
  await prisma.analyticsLinkClick.createMany({ data: clicks });
  console.log(`seeded: visitors ${visitors.length}, sessions ${sessions.length}, events ${events.length}, linked academies ${academies.length}, link clicks ${clicks.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
