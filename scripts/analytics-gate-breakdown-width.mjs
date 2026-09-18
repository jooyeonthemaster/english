/**
 * 게이트 — 공용 분해표(BreakdownTable)의 라벨 열이 좁은 폭에서 읽히는지 구조적으로 잰다.
 *
 *   node --env-file=.env scripts/analytics-gate-breakdown-width.mjs [baseUrl] [widths=390,768,1440]
 *
 * 스크린샷은 「글자가 0px 로 접혔다」를 못 본다 — 실측(수리 전, 390px): 유입경로 채널 표의 라벨 셀이 12px,
 * 라벨 텍스트가 16px 로 색 점만 남고 이름이 통째로 사라졌다. 그래서 DOM 폭을 직접 잰다.
 *
 * 판정(각 표의 첫 열):
 *   ① 라벨 셀 clientWidth >= MIN_LABEL_CELL_PX (이름이 들어갈 자리가 있다)
 *   ② 라벨 텍스트 scrollWidth <= clientWidth + 1 (말줄임이 아니라 실제로 다 보인다) — 넘치면 title 속성 필수
 *   ③ 가로 스크롤이 필요한 표에는 단서(data-scroll-hint)가 있다
 */
import { chromium } from "playwright";
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? "http://localhost:3391";
const WIDTHS = (process.argv.find((a) => a.startsWith("widths=")) ?? "widths=390,768,1440")
  .slice(7)
  .split(",")
  .map(Number);

/** 라벨 열 최소 폭 — 「SNS/검색(자연)」 같은 한글 라벨이 최소한 몇 글자는 보이는 바닥값 */
const MIN_LABEL_CELL_PX = 96;

const PAGES = [
  { slug: "overview", url: "/admin/analytics?range=30d" },
  { slug: "acquisition", url: "/admin/analytics/acquisition?range=30d" },
  { slug: "pages", url: "/admin/analytics/pages?range=30d" },
  { slug: "audience", url: "/admin/analytics/audience?range=30d" },
  { slug: "conversions", url: "/admin/analytics/conversions?range=30d" },
];

const secret = process.env.ADMIN_JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!secret) {
  console.error("ADMIN_JWT_SECRET(또는 NEXTAUTH_SECRET) 이 필요합니다.");
  process.exit(2);
}
const token = await new SignJWT({ adminId: "qa-gate", email: "qa@gate.local", name: "QA", role: "SUPER_ADMIN" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("60m")
  .sign(new TextEncoder().encode(secret));

const measure = () => {
  const out = [];
  for (const table of document.querySelectorAll("table")) {
    const head = table.querySelector("thead th");
    const cell = table.querySelector("tbody tr > td:first-child");
    if (!head || !cell) continue;
    const text = cell.querySelector("div:last-child") ?? cell;
    const scroller = cell.closest("[data-scrollable-x]");
    const hint = scroller?.parentElement?.parentElement?.querySelector("[data-scroll-hint]") ?? null;
    out.push({
      header: (head.textContent ?? "").trim().slice(0, 20),
      labelCellW: Math.round(cell.getBoundingClientRect().width),
      textClientW: text.clientWidth,
      textScrollW: text.scrollWidth,
      hasTitle: !!(text.getAttribute("title") ?? "").trim(),
      tableW: Math.round(table.getBoundingClientRect().width),
      scrollerW: scroller ? scroller.clientWidth : null,
      scrollerScrollW: scroller ? scroller.scrollWidth : null,
      hasHint: !!hint,
      rowFocusable: (cell.parentElement?.getAttribute("tabindex") ?? null) === "0",
      rowClickable: !!cell.parentElement?.className?.includes?.("cursor-pointer"),
    });
  }
  return out;
};

const browser = await chromium.launch();
let fail = 0;
let checked = 0;
try {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      isMobile: width < 640,
      hasTouch: width < 640,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    await ctx.addCookies([{ name: "yshin-admin-session", value: token, url: BASE }]);
    const page = await ctx.newPage();
    for (const target of PAGES) {
      await page.goto(BASE + target.url, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {});
      await page.waitForSelector("table tbody tr", { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(400);
      const rows = await page.evaluate(measure);
      if (rows.length === 0) {
        console.log(`  [skip] ${width}px ${target.slug} — 표 없음`);
        continue;
      }
      for (const r of rows) {
        checked += 1;
        const problems = [];
        if (r.labelCellW < MIN_LABEL_CELL_PX) problems.push(`라벨 셀 ${r.labelCellW}px < ${MIN_LABEL_CELL_PX}`);
        if (r.textScrollW > r.textClientW + 1 && !r.hasTitle) problems.push("말줄임인데 title 없음");
        if (r.scrollerW !== null && r.scrollerScrollW > r.scrollerW + 1 && !r.hasHint) problems.push("가로 스크롤 단서 없음");
        if (r.rowClickable && !r.rowFocusable) problems.push("클릭 가능한 행인데 키보드 포커스 불가");
        if (problems.length) {
          fail += 1;
          console.log(`  FAIL ${width}px ${target.slug} 「${r.header}」 ${problems.join(" · ")} ${JSON.stringify(r)}`);
        } else {
          console.log(`  ok   ${width}px ${target.slug} 「${r.header}」 라벨 ${r.labelCellW}px 표 ${r.tableW}px${r.hasHint ? " (스크롤 단서)" : ""}`);
        }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n분해표 라벨 폭 게이트: ${checked - fail}/${checked} 통과`);
process.exit(fail ? 1 : 0);
