/**
 * 검수 계기 — 관리자 화면(유입 분석 + 수리 대상) 전수 캡처. 데스크톱 1440 · 모바일 390.
 *   node --env-file=.env scripts/analytics-capture-admin.mjs <baseUrl> <outDir> [only=slug1,slug2]
 * 관리자 쿠키는 순수 서명 JWT(10분, DB 계정 생성 없음). 각 캡처마다 페이지 정체(h1/제목)를 기록한다.
 */
import { chromium } from "playwright";
import { SignJWT } from "jose";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3391";
const OUT = process.argv[3] ?? "./.tmp-analytics-shots";
const ONLY = (process.argv.find((a) => a.startsWith("only=")) ?? "").slice(5).split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });

const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
const token = await new SignJWT({ adminId: "qa-gate", email: "qa@gate.local", name: "QA", role: "SUPER_ADMIN" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("60m")
  .sign(new TextEncoder().encode(secret));

const TARGETS = [
  { slug: "an-overview", url: "/admin/analytics?range=30d" },
  { slug: "an-realtime", url: "/admin/analytics/realtime" },
  { slug: "an-acquisition", url: "/admin/analytics/acquisition?range=30d" },
  { slug: "an-acquisition-filtered", url: "/admin/analytics/acquisition?range=30d&channel=organic_social" },
  { slug: "an-pages", url: "/admin/analytics/pages?range=30d" },
  { slug: "an-audience", url: "/admin/analytics/audience?range=30d" },
  { slug: "an-conversions", url: "/admin/analytics/conversions?range=30d" },
  { slug: "an-sessions", url: "/admin/analytics/sessions?range=30d", click: "tbody tr" },
  { slug: "an-links", url: "/admin/analytics/links?range=30d" },
  { slug: "an-setup", url: "/admin/analytics/setup" },
  { slug: "adm-dashboard", url: "/admin" },
  { slug: "adm-payments", url: "/admin/credit-plans", click: "tbody tr" },
  { slug: "adm-member", url: "/admin/members" , click: "tbody tr a[href^='/admin/members/']" },
  { slug: "adm-costs", url: "/admin/costs" },
  { slug: "adm-referrals", url: "/admin/referrals" },
  { slug: "adm-bank", url: "/admin/credits/bank-deposits" },
];

const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
];

const browser = await chromium.launch();
const manifest = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.isMobile, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    const u = new URL(BASE);
    await ctx.addCookies([{ name: "yshin-admin-session", value: token, domain: u.hostname, path: "/" }]);
    for (const t of TARGETS) {
      if (ONLY.length && !ONLY.includes(t.slug)) continue;
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 300));
      });
      const entry = { slug: t.slug, viewport: vp.name, url: t.url, files: [], errors };
      try {
        const res = await page.goto(`${BASE}${t.url}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
        entry.status = res?.status();
        // 리포트 fetch 완료 대기: 스켈레톤이 사라지고 네트워크가 잠잠해질 때까지
        await page.waitForLoadState("networkidle", { timeout: 180_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        entry.finalUrl = page.url();
        entry.h1 = await page.locator("h1").first().textContent({ timeout: 5000 }).catch(() => null);
        const file = path.join(OUT, `${t.slug}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        entry.files.push(file);
        if (t.click) {
          const target = page.locator(t.click).first();
          if (await target.count()) {
            await target.click({ timeout: 15_000 });
            await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
            await page.waitForTimeout(3000);
            const f2 = path.join(OUT, `${t.slug}-${vp.name}-clicked.png`);
            await page.screenshot({ path: f2, fullPage: false });
            entry.files.push(f2);
            entry.clickedUrl = page.url();
          } else {
            entry.clickMissing = t.click;
          }
        }
      } catch (err) {
        entry.error = String(err).slice(0, 400);
      }
      manifest.push(entry);
      console.log(`${t.slug}/${vp.name}: ${entry.status ?? "ERR"} h1=${entry.h1 ?? "-"} errors=${errors.length}${entry.error ? " FAIL " + entry.error.slice(0, 120) : ""}`);
      await page.close();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
}
