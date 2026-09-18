/**
 * 게이트 G3 — 수집 E2E: 실제 브라우저 방문 → /api/collect → DB 행 대조 → 관리자 리포트 API 반영.
 *
 *   1) dev 서버: ANALYTICS_COUNT_NONPROD=1 npx next dev --turbopack -p <빈 포트>  (정체 확인 필수 — 다른 프로젝트가 포트를 쓰고 있을 수 있다)
 *   2) node --env-file=.env scripts/analytics-gate-e2e.mjs [baseUrl]
 *      거부·전환·ack 만: node --env-file=.env scripts/analytics-gate-e2e.mjs <baseUrl> --conversions-only
 *
 * 테스트 방문자 id 는 전부 "qa-" 접두 → 종료 시 삭제(성공/실패 무관). 운영 데이터 오염 0.
 * 종료 코드 0 = 전건 통과, 1 = 실패.
 * 계약: docs/analytics/analytics-spec.md §12 G3
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3217";
/** 거부·전환·ack 만 돌린다(방문 시나리오 없이 = ANALYTICS_COUNT_NONPROD 없이도 확인 가능). */
const CONVERSIONS_ONLY = process.argv.includes("--conversions-only");
const RUN = `qa-${Date.now().toString(36)}`;
const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}: ${detail}`);
    console.log(`FAIL ${name} — ${detail}`);
  }
}

const UA = {
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.34.94 (iPhone15,2; iOS 17_6; ko_KR; ko; scale=3.00; 1179x2556; 634108168)",
  kakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.6.1",
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

const SCENARIOS = [
  { id: "ig", ua: UA.instagram, url: "/", referer: "https://l.instagram.com/", mobile: true, expect: { channel: "organic_social", source: "instagram", inApp: "instagram", deviceType: "mobile" } },
  { id: "kakao", ua: UA.kakao, url: "/faq", referer: undefined, mobile: true, expect: { channel: "messenger", source: "kakaotalk", inApp: "kakaotalk" } },
  { id: "naver", ua: UA.desktop, url: "/", referer: "https://search.naver.com/search.naver?query=%EC%98%81%EC%96%B4", expect: { channel: "organic_search", source: "naver", deviceType: "desktop", referrer: "https://search.naver.com/search.naver" } },
  { id: "blog", ua: UA.desktop, url: "/resources?utm_source=naver_blog&utm_medium=blog&utm_campaign=qa_sept&token=SECRET", referer: "https://blog.naver.com/", expect: { channel: "community", source: "naver_blog", campaign: "qa_sept", landingQuery: "utm_source=naver_blog&utm_medium=blog&utm_campaign=qa_sept" } },
  { id: "gpt", ua: UA.desktop, url: "/?utm_source=chatgpt.com", referer: undefined, expect: { channel: "ai", source: "chatgpt" } },
  { id: "direct", ua: UA.desktop, url: "/", referer: undefined, spa: true, expect: { channel: "direct", source: "(direct)" } },
  { id: "token", ua: UA.desktop, url: "/t/QAtoken0123456789abcdefQAtoken01", referer: undefined, expectPath: "/t/:token", expect: { channel: "direct" } },
];

async function visit(browser, s) {
  const ctx = await browser.newContext({
    userAgent: s.ua,
    viewport: s.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const vid = `${RUN}-${s.id}`;
  await ctx.addCookies([{ name: "smoat_vid", value: vid, url: BASE }]);
  const page = await ctx.newPage();
  const collectResponses = [];
  const firstCollect = page.waitForResponse((r) => r.url().includes("/api/collect"), { timeout: 120_000 }).catch(() => null);
  await page.goto(`${BASE}${s.url}`, { waitUntil: "domcontentloaded", referer: s.referer, timeout: 120_000 });
  const first = await firstCollect;
  if (first) collectResponses.push(first.status());
  await page.waitForTimeout(1500);
  if (s.spa) {
    // 클라이언트 내비게이션(SPA) — Next 앱 라우터는 history.pushState 를 usePathname 에 동기화한다
    await page.evaluate(() => window.history.pushState({}, "", "/faq"));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.history.pushState({}, "", "/resources"));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.smoatTrack?.("qa_custom", { k: "v" }));
    // 체류 비콘(visibility hidden) 유도
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1500);
  }
  await ctx.close();
  return { vid, collectResponses };
}

/**
 * 방문 분석 거부 — 서버 쪽 최종 방어선(RC-OPTOUT ④). 거부 쿠키·GPC 요청은 저장하지 않는다.
 * (구버전 JS 가 캐시돼 계속 보내는 경우까지 막는다 — 클라이언트만 고치면 뚫린다.)
 */
async function consentScenario() {
  const post = async (vid, headers) => {
    const res = await fetch(`${BASE}/api/collect`, {
      method: "POST",
      headers: { "content-type": "text/plain", "user-agent": UA.desktop, "x-forwarded-host": "www.smoat.co.kr", ...headers },
      body: JSON.stringify({ v: 1, vid, sid: `${vid}-s`, nv: true, hits: [{ t: "pv", id: `${vid}-e`, p: "/faq", ti: "FAQ", pp: null, ts: Date.now() }] }),
    });
    return res.status;
  };
  const optOutVid = `${RUN}-optout`;
  const gpcVid = `${RUN}-gpc`;
  const okVid = `${RUN}-consent-ok`;
  check("consent:optout-204", (await post(optOutVid, { cookie: "smoat_analytics_optout=1" })) === 204, "거부 쿠키 요청이 204 가 아니다");
  check("consent:gpc-204", (await post(gpcVid, { "sec-gpc": "1" })) === 204, "GPC 요청이 204 가 아니다");
  check("consent:allowed-200", (await post(okVid, {})) === 200, "대조군(허용) 요청이 200 이 아니다");
  const blocked = await prisma.analyticsEvent.count({ where: { visitorId: { in: [optOutVid, gpcVid] } } });
  check("consent:optout-not-stored", blocked === 0, `저장된 행 ${blocked}건`);
  const allowed = await prisma.analyticsEvent.count({ where: { visitorId: okVid } });
  check("consent:control-stored", allowed === 1, `대조군 행 ${allowed}건(계기 고장 여부 확인)`);
}

/**
 * 거부 토글이 **같은 문서에서 즉시** 효력을 갖는가(RC-OPTOUT ①②③).
 * 이전 구현은 start() 1회 래치라 거부 후에도 SPA 이동마다 계속 전송했다.
 */
async function optOutImmediacyScenario(browser) {
  const ctx = await browser.newContext({ userAgent: UA.desktop, viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
  await ctx.addCookies([{ name: "smoat_vid", value: `${RUN}-toggle`, url: BASE }]);
  const page = await ctx.newPage();
  let hits = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/collect")) hits.push(r.url());
  });
  await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(4000);
  hits = [];
  await page.evaluate(() => window.history.pushState({}, "", "/terms"));
  await page.waitForTimeout(2500);
  check("optout:control-collects", hits.length >= 1, "거부 전 SPA 이동에서 수집 요청이 0건(계기 고장)");
  await page.evaluate(() => window.history.pushState({}, "", "/privacy"));
  await page.waitForTimeout(2000);
  hits = [];
  await page.getByRole("button", { name: /방문 분석 거부하기/ }).click({ timeout: 20_000 });
  await page.waitForTimeout(500);
  for (const path of ["/faq", "/about", "/resources"]) {
    await page.evaluate((p) => window.history.pushState({}, "", p), path);
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => window.smoatTrack?.("qa_after_optout", { k: "v" }));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(1500);
  check("optout:same-document-stops", hits.length === 0, `거부 후 요청 ${hits.length}건`);
  const cleared = await page.evaluate(() => !localStorage.getItem("smoat_vid") && !localStorage.getItem("smoat_ses"));
  check("optout:identifiers-cleared", cleared, "거부 후에도 식별자가 localStorage 에 남아 있다");
  await ctx.close();
}

/**
 * 전환 재전송 + ack 왕복. 쓰기는 analytics_* 에 한정하고 전부 RUN 접두라 종료 시 삭제된다.
 *  1) 계정에 연결된 qa 세션 + 미확인(firedAt NULL) 전환 1건을 심는다
 *  2) 그 방문자로 페이지뷰 → 응답 c 에 cid 가 실려 온다
 *  3) {t:"ack", id:cid} → firedAt 이 채워진다
 *  4) 같은 페이지뷰를 재전송 → c 가 빈다(중복 발사 없음)
 *  5) 7일 지난 미확인 전환은 재전송하지 않는다 / 남의 전환은 ack 되지 않는다
 */
async function conversionAckScenario() {
  const vid = `${RUN}-conv`;
  const sid = `${RUN}-convs`;
  const academyId = `${RUN}-academy`;
  const now = Date.now();
  const post = async (hits, extra = {}) => {
    const res = await fetch(`${BASE}/api/collect`, {
      method: "POST",
      headers: { "content-type": "text/plain", "user-agent": UA.desktop, "x-forwarded-host": "www.smoat.co.kr", ...(extra.headers ?? {}) },
      body: JSON.stringify({ v: 1, vid, sid, nv: false, hits }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  await prisma.analyticsVisitor.create({
    data: { id: vid, firstSeenAt: new Date(now - 60_000), lastSeenAt: new Date(now), sessionCount: 1, pageviewCount: 1, academyId, linkedAt: new Date(now - 60_000), firstChannel: "direct", firstSource: "(direct)", firstLandingPath: "/" },
  });
  await prisma.analyticsSession.create({
    data: { id: sid, visitorId: vid, startedAt: new Date(now - 60_000), lastSeenAt: new Date(now), engagedMs: 1000, pageviews: 1, eventsCount: 0, isNewVisitor: true, entryPath: "/", exitPath: "/", hostname: "www.smoat.co.kr", channel: "direct", source: "(direct)", academyId, isInternal: false },
  });
  const fresh = await prisma.analyticsConversion.create({
    data: { id: `${RUN}-cv1`, type: "signup", refId: `${RUN}-ref1`, academyId, visitorId: vid, sessionId: sid, value: 0, occurredAt: new Date(now - 30_000), firedAt: null },
  });
  await prisma.analyticsConversion.create({
    data: { id: `${RUN}-cv2`, type: "purchase", refId: `${RUN}-ref2`, academyId, visitorId: vid, sessionId: sid, value: 49500, occurredAt: new Date(now - 8 * 86_400_000), firedAt: null },
  });

  const pv1 = await post([{ t: "pv", id: `${RUN}-cve1`, p: "/director/studio", ti: "", pp: null, ts: now }]);
  const list1 = pv1.body?.c ?? [];
  check("conv:pageview-200", pv1.status === 200, `status=${pv1.status}`);
  check("conv:instruction-resent", list1.some((c) => c.cid === fresh.id && c.type === "signup"), `c=${JSON.stringify(list1)}`);
  check("conv:stale-not-resent", !list1.some((c) => c.cid === `${RUN}-cv2`), `7일 초과 전환이 재전송됨: ${JSON.stringify(list1)}`);

  // 남의 전환은 ack 되지 않는다(방문자 소유 확인)
  const other = await fetch(`${BASE}/api/collect`, {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": UA.desktop, "x-forwarded-host": "www.smoat.co.kr" },
    body: JSON.stringify({ v: 1, vid: `${RUN}-other`, sid: `${RUN}-others`, nv: true, hits: [{ t: "ack", id: fresh.id, ts: now }] }),
  });
  check("conv:ack-status", other.status === 204, `status=${other.status}`);
  const notMine = await prisma.analyticsConversion.findUnique({ where: { id: fresh.id } });
  check("conv:ack-foreign-rejected", notMine?.firedAt === null, `firedAt=${notMine?.firedAt}`);

  await post([{ t: "ack", id: fresh.id, ts: now }]);
  const acked = await prisma.analyticsConversion.findUnique({ where: { id: fresh.id } });
  check("conv:ack-sets-firedAt", !!acked?.firedAt, `firedAt=${acked?.firedAt}`);

  // 창(60초) 안이면 서버가 다시 조회하지 않으므로 세션을 바꿔 재전송 여부를 본다
  const sid2 = `${RUN}-convs2`;
  await prisma.analyticsSession.create({
    data: { id: sid2, visitorId: vid, startedAt: new Date(now), lastSeenAt: new Date(now), engagedMs: 0, pageviews: 0, eventsCount: 0, isNewVisitor: false, entryPath: "/", exitPath: "/", hostname: "www.smoat.co.kr", channel: "direct", source: "(direct)", academyId, isInternal: false },
  });
  const pv2 = await fetch(`${BASE}/api/collect`, {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": UA.desktop, "x-forwarded-host": "www.smoat.co.kr" },
    body: JSON.stringify({ v: 1, vid, sid: sid2, nv: false, hits: [{ t: "pv", id: `${RUN}-cve2`, p: "/director/studio", ti: "", pp: null, ts: Date.now() }] }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  check("conv:no-refire-after-ack", !(pv2.body?.c ?? []).some((c) => c.cid === fresh.id), `c=${JSON.stringify(pv2.body?.c)}`);
}

/** 정리 — qa 접두 전부 삭제(성공·실패 무관). */
async function cleanup() {
  const del0 = await prisma.analyticsConversion.deleteMany({ where: { id: { startsWith: RUN } } });
  const del1 = await prisma.analyticsEvent.deleteMany({ where: { visitorId: { startsWith: RUN } } });
  const del2 = await prisma.analyticsSession.deleteMany({ where: { visitorId: { startsWith: RUN } } });
  const del3 = await prisma.analyticsVisitor.deleteMany({ where: { id: { startsWith: RUN } } });
  console.log(`cleanup: conversions ${del0.count}, events ${del1.count}, sessions ${del2.count}, visitors ${del3.count}`);
}

async function main() {
  if (CONVERSIONS_ONLY) {
    const browser = await chromium.launch();
    try {
      await consentScenario();
      await optOutImmediacyScenario(browser);
      await conversionAckScenario();
    } finally {
      await browser.close();
      await cleanup();
      await prisma.$disconnect();
    }
    console.log(`\nanalytics-gate-e2e(conversions): ${pass}/${pass + fail} pass`);
    if (failures.length) console.log(failures.join("\n"));
    process.exit(fail || pass === 0 ? 1 : 0);
  }
  const browser = await chromium.launch();
  try {
    // 0) 정체 확인 — 이 포트가 스모트인지
    const probe = await fetch(BASE);
    const html = await probe.text();
    check("identity", /SMOAT|스모트/.test(html), `title mismatch at ${BASE}`);

    const results = {};
    for (const s of SCENARIOS) {
      results[s.id] = await visit(browser, s);
    }

    // 봇 — 저장되면 안 됨
    const botCtx = await browser.newContext({ userAgent: UA.googlebot });
    await botCtx.addCookies([{ name: "smoat_vid", value: `${RUN}-bot`, url: BASE }]);
    const botPage = await botCtx.newPage();
    await botPage.goto(`${BASE}/`, { waitUntil: "load", timeout: 120_000 });
    await botPage.waitForTimeout(8000);
    await botCtx.close();

    // 관리자 경로 — 저장되면 안 됨
    const adminCtx = await browser.newContext({ userAgent: UA.desktop });
    await adminCtx.addCookies([{ name: "smoat_vid", value: `${RUN}-admin`, url: BASE }]);
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`${BASE}/admin/login`, { waitUntil: "load", timeout: 120_000 });
    await adminPage.waitForTimeout(8000);
    await adminCtx.close();

    await new Promise((r) => setTimeout(r, 1500));

    for (const s of SCENARIOS) {
      const vid = results[s.id].vid;
      const sessions = await prisma.analyticsSession.findMany({ where: { visitorId: vid }, orderBy: { startedAt: "asc" } });
      check(`${s.id}:collect-ok`, results[s.id].collectResponses.some((c) => c === 200 || c === 204), `responses=${JSON.stringify(results[s.id].collectResponses)}`);
      check(`${s.id}:one-session`, sessions.length === 1, `sessions=${sessions.length}`);
      const ses = sessions[0];
      if (!ses) continue;
      for (const [k, v] of Object.entries(s.expect)) {
        check(`${s.id}:${k}`, ses[k] === v, `expected ${JSON.stringify(v)} got ${JSON.stringify(ses[k])}`);
      }
      check(`${s.id}:not-internal`, ses.isInternal === false, `isInternal=${ses.isInternal}`);
      const visitor = await prisma.analyticsVisitor.findUnique({ where: { id: vid } });
      check(`${s.id}:visitor-first-touch`, visitor?.firstChannel === s.expect.channel, `visitor.firstChannel=${visitor?.firstChannel}`);
      const events = await prisma.analyticsEvent.findMany({ where: { visitorId: vid }, orderBy: { createdAt: "asc" } });
      const pvs = events.filter((e) => e.type === "pageview");
      check(`${s.id}:pageview`, pvs.length >= 1, `pageviews=${pvs.length}`);
      if (s.expectPath) check(`${s.id}:masked-path`, pvs[0]?.path === s.expectPath, `path=${pvs[0]?.path}`);
      check(`${s.id}:no-token-leak`, !JSON.stringify({ ses, events }).includes("SECRET") && !JSON.stringify(events).includes("QAtoken"), "token/secret found in stored rows");
      if (s.spa) {
        check(`${s.id}:spa-2-pageviews`, pvs.length >= 2 && ses.pageviews >= 2, `events=${pvs.length} ses.pageviews=${ses.pageviews}`);
        check(`${s.id}:spa-prevPath`, pvs[1]?.prevPath === pvs[0]?.path, `prevPath=${pvs[1]?.prevPath}`);
        check(`${s.id}:custom-event`, events.some((e) => e.type === "event" && e.name === "qa_custom"), "qa_custom missing");
        check(`${s.id}:engaged`, ses.engagedMs > 0, `engagedMs=${ses.engagedMs}`);
        check(`${s.id}:exitPath`, ses.exitPath === pvs[pvs.length - 1]?.path, `exitPath=${ses.exitPath}`);
      }
    }

    const botRows = await prisma.analyticsSession.count({ where: { visitorId: `${RUN}-bot` } });
    check("bot:not-stored", botRows === 0, `rows=${botRows}`);
    const adminRows = await prisma.analyticsEvent.count({ where: { visitorId: `${RUN}-admin` } });
    check("admin:not-stored", adminRows === 0, `rows=${adminRows}`);

    // 관리자 리포트 API — 인증 없으면 401, 있으면 200 + 테스트 방문 반영
    const unauth = await fetch(`${BASE}/api/admin/analytics/overview?range=today`);
    check("api:401-without-admin", unauth.status === 401, `status=${unauth.status}`);
    const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
    const token = await new SignJWT({ adminId: "qa-gate", email: "qa@gate.local", name: "QA", role: "SUPER_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(secret));
    const res = await fetch(`${BASE}/api/admin/analytics/overview?range=today&internal=include`, {
      headers: { cookie: `yshin-admin-session=${token}` },
    });
    const body = await res.json().catch(() => null);
    check("api:overview-200", res.status === 200, `status=${res.status} body=${JSON.stringify(body)?.slice(0, 200)}`);
    check("api:overview-sessions", (body?.current?.sessions ?? 0) >= SCENARIOS.length, `sessions=${body?.current?.sessions}`);
    check("api:overview-activeNow", (body?.activeNow ?? 0) >= 1, `activeNow=${body?.activeNow}`);
    const igFiltered = await fetch(`${BASE}/api/admin/analytics/overview?range=today&internal=include&source=instagram`, {
      headers: { cookie: `yshin-admin-session=${token}` },
    }).then((r) => r.json());
    check("api:filter-source", (igFiltered?.current?.sessions ?? 0) >= 1 && igFiltered.current.sessions < body.current.sessions, `ig=${igFiltered?.current?.sessions} all=${body?.current?.sessions}`);

    await consentScenario();
    await optOutImmediacyScenario(browser);

    // ── 전환 지시·발사 확인(ack) 왕복 — §0-3·D17 ────────────────────────────
    // 운영 결제 데이터에 쓰지 않는다: 학원·충전 건을 만들지 않고, 합성 academyId(느슨한 참조)와
    // qa- 접두 방문자/세션/전환으로만 검증한다. 원장 쿠키가 필요한 「신규 판정」은 여기서 다루지 않는다
    // (setup 화면 경고는 U9 몫). 아래는 서버가 미확인 전환을 다시 싣고 ack 로 닫는 계약의 실증이다.
    await conversionAckScenario();
  } finally {
    await browser.close();
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(`\nanalytics-gate-e2e: ${pass}/${pass + fail} pass`);
  if (failures.length) console.log(failures.join("\n"));
  process.exit(fail || pass === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
