// 시험지 조판 전수 측정 하네스(헤드리스) — 넘침 + 칸 채움률 + 추정 오차를 한 번에 잰다.
//   node scripts/exam-pagination/paper-sweep.mjs --out result.jsonl [--base URL] [--guard-off] [--wait 3000] <url|경로> [...]
// 각 URL 은 /director/dev/paper-overflow (개발 전용 렌더 페이지). 경로(예: director/dev/paper-overflow?recent=20 — Git Bash 는
//   「/」로 시작하는 인자를 C:/Program Files/Git/… 로 바꾸므로 앞 「/」를 뺄 것)를 주면 --base 에 붙인다.
// --base: 기본 $PRINT_E2E_BASE → 첫 전체 URL 의 origin → http://localhost:3000. 세션 쿠키 도메인도 여기서 정한다.
// 가드 스위치(localStorage paperOverflowGuard)는 init script 로 모든 문서에 먼저 심는다. 종전 판은 http://localhost:3000/login
//   으로 가서 심었는데, 유효한 스태프 쿠키면 /login 이 AUTH_URL(3000)로 리다이렉트돼 다른 포트에서는 ERR_CONNECTION_REFUSED 로 죽었다.
// 쓰기 차단(운영 DB 0건 — 로컬 .env 는 운영 DB): write-guard.mjs 세 겹(페이지 층 · 네트워크 층 · 다운로드 경보). 렌더 페이지는
//   DB 를 읽기만 하지만 앱 레이아웃의 서버 액션 · 분석 요청이 섞인다 — 읽기 전용 액션만 이름으로 허용하고 나머지는 abort.
//   GET 은 get-policy.mjs 허용 목록만(렌더 화면 · 읽기 전용 GET · 정적 자산), 부작용 GET(credits 등)은 로컬 스텁 · 거부.
//   다운로드가 한 건이라도 시작되면 종료 코드 1.
// 스태프 쿠키: $PRINT_E2E_COOKIE → .tmp-studio-qa/cookie.txt → .tmp-studio-qa/mint-cookie.mjs(내부 E2E 학원).
import { chromium } from "playwright";
import { writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { guardRoute, installDownloadGuard, judgeWriteGuard, newWriteNet, summarizeWriteGuard } from "./write-guard.mjs";

const args = process.argv.slice(2);
const VALUE_OPTIONS = ["--out", "--wait", "--base"];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const out = opt("--out");
const guardOff = args.includes("--guard-off");
const waitMs = opt("--wait") ? Number(opt("--wait")) : 2500;
const targets = args.filter((a, i) => !a.startsWith("--") && !VALUE_OPTIONS.includes(args[i - 1]));
const isAbsolute = (t) => /^https?:\/\//.test(t);
const base = (opt("--base") ?? process.env.PRINT_E2E_BASE ?? (targets.find(isAbsolute) ? new URL(targets.find(isAbsolute)).origin : "http://localhost:3000")).replace(/\/+$/, "");
const urls = targets.map((t) => (isAbsolute(t) ? t : `${base}/${t.replace(/^\/+/, "")}`));
if (!out || urls.length === 0) {
  console.error("사용법: paper-sweep.mjs --out result.jsonl [--base URL] [--guard-off] [--wait ms] <url|경로> [...]");
  process.exit(2);
}

function cookieToken() {
  if (process.env.PRINT_E2E_COOKIE) return process.env.PRINT_E2E_COOKIE.trim();
  try {
    const cached = readFileSync(".tmp-studio-qa/cookie.txt", "utf8").trim();
    if (cached) return cached;
  } catch {}
  return execSync("node .tmp-studio-qa/mint-cookie.mjs", { encoding: "utf8" }).trim();
}

const MEASURE = () => {
  const guard = window.__paperOverflowGuard ?? null;
  const cols = [];
  const overflows = [];
  document.querySelectorAll("[data-exam-page-index]").forEach((frame) => {
    const pageIndex = Number(frame.dataset.examPageIndex);
    const pageEl = frame.querySelector(".exam-a4-page");
    const main = pageEl?.querySelector("main");
    if (!main || !main.offsetHeight) return;
    const mainRect = main.getBoundingClientRect();
    const scale = mainRect.height / main.offsetHeight || 1;
    Array.from(main.children).forEach((col, columnIndex) => {
      const last = col.lastElementChild;
      if (!last) return;
      const bottom = last.getBoundingClientRect().bottom;
      const used = (bottom - mainRect.top) / scale;
      const avail = main.offsetHeight;
      const info = guard?.columns?.[pageIndex];
      const entry = {
        p: pageIndex,
        c: columnIndex,
        used: Math.round(used * 10) / 10,
        avail,
        est: info?.used?.[columnIndex] == null ? null : Math.round(info.used[columnIndex] * 10) / 10,
        cap: info?.capacity?.[columnIndex] == null ? null : Math.round(info.capacity[columnIndex]),
        blocks: info?.blocks?.[columnIndex] ?? null,
      };
      cols.push(entry);
      if (used > avail + 1) {
        entry.qids = [
          ...new Set(
            Array.from(col.querySelectorAll("[data-question-id]")).map((e) => e.getAttribute("data-question-id")),
          ),
        ];
        overflows.push(entry);
      }
    });
  });
  const manifestEl = document.getElementById("paper-overflow-manifest");
  return {
    pages: document.querySelectorAll(".exam-a4-page main").length,
    guardPasses: guard?.passes ?? null,
    guardAdjust: guard?.adjust ?? null,
    items: manifestEl ? JSON.parse(manifestEl.textContent).length : null,
    cols,
    overflows,
  };
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  acceptDownloads: true, // 뚫린 다운로드가 경보(download 사건)로 드러나게 — write-guard 가 취소하고 적는다
});
await context.addCookies([
  { name: "authjs.session-token", value: cookieToken(), domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
]);
const net = newWriteNet();
await installDownloadGuard(context, net);
await context.route("**/*", (route) => guardRoute(route, net, { allowRead: true, appOrigin: base }));
// 가드 켜기/끄기 — 앱이 읽기 전에 모든 문서에 심는다(로그인 화면 경유 없음)
await context.addInitScript((off) => {
  try {
    if (off) localStorage.setItem("paperOverflowGuard", "off");
    else localStorage.removeItem("paperOverflowGuard");
  } catch { /* 저장소 차단 문서 */ }
}, guardOff);
const page = await context.newPage();
page.on("pageerror", (err) => console.error("PAGEERROR", String(err).slice(0, 200)));

writeFileSync(out, "");
for (const url of urls) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".exam-a4-page main", { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(waitMs);
    const result = await page.evaluate(MEASURE);
    appendFileSync(out, JSON.stringify({ url, ...result }) + "\n");
    process.stdout.write(`${url.split("?")[1] ?? url}: pages=${result.pages} overflow=${result.overflows.length} passes=${result.guardPasses}\n`);
  } catch (error) {
    appendFileSync(out, JSON.stringify({ url, error: String(error).slice(0, 200) }) + "\n");
    process.stdout.write(`${url}: ERROR ${String(error).slice(0, 120)}\n`);
  }
}
await browser.close();
const fails = [];
judgeWriteGuard(net, fails);
const blockKey = (b) => (b.kind === "analytics" ? "analytics" : `${b.method ?? ""} ${b.name ?? b.url}`);
const blocked = net.blocked.reduce((acc, b) => ({ ...acc, [blockKey(b)]: (acc[blockKey(b)] ?? 0) + 1 }), {});
process.stdout.write(`쓰기 가드: ${JSON.stringify(summarizeWriteGuard(net))} · 차단 ${JSON.stringify(blocked)}\n`);
if (fails.length) {
  console.error(fails.join("\n"));
  process.exitCode = 1;
}
