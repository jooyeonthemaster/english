// 문항 조각(part)·지문 조각별 추정 vs 실측 — 어느 구성요소가 얼마나 어긋나는지 본다(헤드리스).
//   node scripts/exam-pagination/paper-parts.mjs --out parts.json <url> [url...]
import { chromium } from "playwright";
import { guardRoute, installDownloadGuard, judgeWriteGuard, newWriteNet } from "./write-guard.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const out = args[args.indexOf("--out") + 1];
const urls = args.filter((a) => a.startsWith("http"));

function cookieToken() {
  try {
    const cached = readFileSync(".tmp-studio-qa/cookie.txt", "utf8").trim();
    if (cached) return cached;
  } catch {}
  return execSync("node .tmp-studio-qa/mint-cookie.mjs", { encoding: "utf8" }).trim();
}

const COLLECT = () => {
  const manifest = JSON.parse(document.getElementById("paper-overflow-manifest").textContent);
  const subOf = Object.fromEntries(manifest.map((m) => [m.id, m.subType]));
  const partCount = {};
  document.querySelectorAll(".exam-a4-page [data-paper-part-key]").forEach((el) => {
    const q = el.getAttribute("data-question-id");
    if (q) partCount[q] = (partCount[q] || 0) + 1;
  });
  const rows = [];
  document.querySelectorAll(".exam-a4-page [data-paper-part-key]").forEach((el) => {
    const est = el.getAttribute("data-est-h");
    if (est == null) return;
    const pageEl = el.closest(".exam-a4-page");
    const main = pageEl.querySelector("main");
    const scale = main.getBoundingClientRect().height / main.offsetHeight || 1;
    const dom = el.getBoundingClientRect().height / scale;
    const q = el.getAttribute("data-question-id");
    rows.push({
      kind: "part",
      q,
      sub: subOf[q] ?? null,
      parts: partCount[q] ?? 1,
      est: Math.round(parseFloat(est) * 10) / 10,
      dom: Math.round(dom * 10) / 10,
      opts: el.querySelectorAll(":scope > div.space-y-1 > *").length,
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
writeFileSync(out, JSON.stringify(all));
console.log("parts", all.length);
await browser.close();
const guardFails = [];
judgeWriteGuard(net, guardFails); // 다운로드가 한 건이라도 시작됐으면 실패(가드 뚫림)
if (guardFails.length) { console.error(guardFails.join("\n")); process.exitCode = 1; }
