// 칸 = 문항 조각 + 지문 조각 + 조각 사이 여백. 문항 조각은 이미 정확하니(±2px) 나머지(지문·여백)가
// 얼마나 어긋나는지 분리해서 본다.  node scripts/exam-pagination/paper-residual.mjs <url> [url...]
import { chromium } from "playwright";
import { guardRoute, installDownloadGuard, judgeWriteGuard, newWriteNet } from "./write-guard.mjs";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const urls = process.argv.slice(2).filter((a) => a.startsWith("http"));
function cookieToken() {
  try {
    const cached = readFileSync(".tmp-studio-qa/cookie.txt", "utf8").trim();
    if (cached) return cached;
  } catch {}
  return execSync("node .tmp-studio-qa/mint-cookie.mjs", { encoding: "utf8" }).trim();
}

const COLLECT = () => {
  const guard = window.__paperOverflowGuard;
  const rows = [];
  document.querySelectorAll("[data-exam-page-index]").forEach((frame) => {
    const p = Number(frame.dataset.examPageIndex);
    const pageEl = frame.querySelector(".exam-a4-page");
    const main = pageEl?.querySelector("main");
    if (!main || !main.offsetHeight) return;
    const mainRect = main.getBoundingClientRect();
    const scale = mainRect.height / main.offsetHeight || 1;
    Array.from(main.children).forEach((col, c) => {
      const last = col.lastElementChild;
      if (!last) return;
      const used = (last.getBoundingClientRect().bottom - mainRect.top) / scale;
      const est = guard?.columns?.[p]?.used?.[c];
      let partEst = 0;
      let partDom = 0;
      col.querySelectorAll("[data-paper-part-key]").forEach((el) => {
        const e = el.getAttribute("data-est-h");
        if (e == null) return;
        partEst += parseFloat(e);
        partDom += el.getBoundingClientRect().height / scale;
      });
      const passages = Array.from(col.querySelectorAll("div.mb-3.py-1")).map(
        (el) => Math.round((el.getBoundingClientRect().height / scale) * 10) / 10,
      );
      rows.push({
        p,
        c,
        used: Math.round(used * 10) / 10,
        est: est == null ? null : Math.round(est * 10) / 10,
        partEst: Math.round(partEst * 10) / 10,
        partDom: Math.round(partDom * 10) / 10,
        passages,
        fragments: col.children.length,
        parts: col.querySelectorAll("[data-paper-part-key]").length,
      });
    });
  });
  return rows;
};

if (urls.length === 0) { console.error("URL 이 없다(http… 로 시작하는 인자)"); process.exit(2); }
// 쓰기 차단(26-09-30): 종전 판은 가드 없이 모든 요청(서버 액션 POST · 부작용 GET 포함)을 개발 서버(= 운영 DB)로 보냈고,
// http://localhost:3000/login 을 거쳐 가드 스위치를 심었다. 이제 write-guard.mjs 세 겹 + GET 허용 목록(get-policy.mjs) ·
// 스위치는 init script 로 모든 문서에 먼저 심는다(paper-sweep.mjs 와 같은 방식). 원점 = 첫 URL.
const base = new URL(urls[0]).origin;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await context.addCookies([
  { name: "authjs.session-token", value: cookieToken(), domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
]);
const net = newWriteNet();
await installDownloadGuard(context, net);
await context.route("**/*", (route) => guardRoute(route, net, { allowRead: true, appOrigin: base }));
await context.addInitScript(() => {
  try { localStorage.setItem("paperOverflowGuard", "off"); } catch { /* 저장소 차단 문서 */ }
});
const page = await context.newPage();
const all = [];
for (const url of urls) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".exam-a4-page main", { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  all.push(...(await page.evaluate(COLLECT)));
}
await browser.close();
const guardFails = [];
judgeWriteGuard(net, guardFails); // 다운로드가 한 건이라도 시작됐으면 실패(가드 뚫림)
if (guardFails.length) { console.error(guardFails.join("\n")); process.exitCode = 1; }

const withEst = all.filter((r) => r.est != null);
const colErr = withEst.map((r) => Math.round(r.est - r.used)).sort((a, b) => a - b);
const partErr = withEst.map((r) => Math.round(r.partEst - r.partDom)).sort((a, b) => a - b);
// 나머지(지문 + 조각 사이 여백)의 추정 오차 = 칸 오차 − 문항 조각 오차
const restErr = withEst
  .map((r) => Math.round(r.est - r.used - (r.partEst - r.partDom)))
  .sort((a, b) => a - b);
const med = (a) => a[Math.floor(a.length / 2)];
console.log("columns", withEst.length);
console.log("칸 추정−실측   median", med(colErr), "min", colErr[0], "max", colErr[colErr.length - 1]);
console.log("문항조각 합계   median", med(partErr), "min", partErr[0], "max", partErr[partErr.length - 1]);
console.log("나머지(지문·여백) median", med(restErr), "min", restErr[0], "max", restErr[restErr.length - 1]);
const worst = withEst
  .map((r) => ({ ...r, rest: Math.round(r.est - r.used - (r.partEst - r.partDom)) }))
  .sort((a, b) => a.rest - b.rest)
  .slice(0, 6);
for (const w of worst) {
  console.log(
    `  p${w.p}c${w.c} rest=${w.rest} fragments=${w.fragments} parts=${w.parts} passages=[${w.passages.join(",")}]`,
  );
}
