// ============================================================================
// 쓰기 가드 자가 시험 — `node scripts/exam-pagination/write-guard.mjs [--base http://localhost:3109]` 가 부른다.
//
//  ① 내보내기 다리(26-09-30 사고): 이 프로세스 안에 띄운 **가짜** 로컬 서버(127.0.0.1 임의 포트, 내보내기 경로를 흉내 내
//     attachment 로 답하고 도달 건수를 센다)에 트리거 9종을 쏜다. 대조군(종전 하네스 = 비GET abort 만)은 서버에 닿아야 하고
//     (구멍 재현 — 못 하면 자가 시험이 무뎌진 것이라 RED), 가드 컨텍스트는 서버 도달 0 · 다운로드 0 · 전부 어느 층이 잡음.
//     --base 를 주면 실제 앱 문서(/login, GET 만)에서도 앱 모양 트리거 3종이 페이지 층에서 삼켜지는지 본다 — 존재하지 않는
//     가짜 경로만 쓴다. **실제 내보내기 라우트는 어떤 경우에도 부르지 않는다.**
//  ② 부작용 GET 다리(COH-4 · GPE-3): 같은 가짜 서버에 부작용 GET(credits · 목록 밖 API · 부작용 화면 · img)과 허용 GET
//     (허용 화면 · 읽기 전용 API · public 파일)을 쏜다. 대조군(종전 = GET 전부 통과)은 부작용 GET 이 서버에 닿아야 하고,
//     가드는 부작용 GET 도달 0(스텁 · 거부 기록) · 허용 GET 도달(과잉 차단 아님)이어야 한다. --base 면 실제 앱 문서에서도
//     credits 가 로컬 스텁으로 대답되는지 응답 머리로 본다(세션 없는 문서 — 서버에 가도 401 이라 쓰지 않는다).
//  ③ 정적 대조(side-effect-sweep.mjs): 분석기 픽스처(가상 파일계) 판별 · 알려진 부작용 GET(credits) 검출(분석기가 눈멀지
//     않음) · 부작용 GET 전부 비통과 · 허용 목록(화면 · GET · 서버 액션)과 그 패턴이 덮는 형제 파일 전부 부작용 0.
//  계기 음성테스트: PRINT_E2E_FAULT=no-download-guard · no-export-block · get-passthrough · allow-side-effect-get ·
//     sweep-blind(분석기가 prisma 모델 쓰기를 못 본다) → RED.
// ============================================================================
import { chromium } from "playwright";
import { createServer } from "node:http";
import { READ_ONLY_ACTIONS, guardRoute, installDownloadGuard, isExportUrl, newWriteNet } from "./write-guard.mjs";
import { classifyGet, effectiveGetPolicy, entryPatternSource, routePatternSource, samplePath } from "./get-policy.mjs";
import { createProject, listAppFiles, pageRoots, reach, summarize, sweepSideEffects } from "./side-effect-sweep.mjs";

/** 내보내기 트리거 9종. run(page, url) — url 은 가짜 서버의 내보내기 모양 경로. app:true 3종은 앱의 실제 모양이다. */
const VECTORS = [
  // exam-detail-paper-preview · 빌더 triggerHwpxDownload 그대로: 만들어 붙이고 click() 뒤 뗀다(9/30 사고 경로)
  { name: "anchor-click-attached", app: true, run: (p, u) => p.evaluate((x) => {
    const a = document.createElement("a");
    a.href = x; a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  }, u) },
  { name: "anchor-click-detached", app: true, run: (p, u) => p.evaluate((x) => {
    const a = document.createElement("a");
    a.href = x; a.download = ""; a.click();
  }, u) },
  // header-section.tsx: 선언형 <a download> + onClick 이 href 를 바꾼다 — 사용자 클릭(신뢰 이벤트)
  { name: "user-click-download-attr", app: true, run: async (p, u) => {
    await p.evaluate((x) => {
      const a = Object.assign(document.createElement("a"), { id: "wg-decl", textContent: "download" });
      a.href = x; a.setAttribute("download", "");
      a.addEventListener("click", () => { a.href = `${x}&t=1`; });
      document.body.appendChild(a);
    }, u);
    await p.click("#wg-decl");
  } },
  { name: "anchor-dispatch-detached", run: (p, u) => p.evaluate((x) => {
    const a = document.createElement("a");
    a.href = x; a.download = "";
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, u) },
  { name: "user-click-plain-link", run: async (p, u) => {
    await p.evaluate((x) => document.body.appendChild(Object.assign(document.createElement("a"), { id: "wg-plain", href: x, textContent: "plain" })), u);
    await p.click("#wg-plain");
  } },
  { name: "location-assign", run: (p, u) => p.evaluate((x) => { location.href = x; }, u) },
  { name: "window-open", run: (p, u) => p.evaluate((x) => { window.open(x); }, u) },
  { name: "form-get", run: (p, u) => p.evaluate((x) => {
    // GET 제출은 action 의 쿼리를 폼 데이터로 갈아 끼운다 — 꼬리표 v 를 양쪽에 둬 어느 층이 잡아도 귀속되게 한다.
    const url = new URL(x, location.href);
    const f = Object.assign(document.createElement("form"), { method: "get", action: url.href });
    f.appendChild(Object.assign(document.createElement("input"), { type: "hidden", name: "v", value: url.searchParams.get("v") }));
    document.body.appendChild(f);
    f.requestSubmit();
  }, u) },
  { name: "fetch-get", run: (p, u) => p.evaluate((x) => fetch(x).then(() => "ok", () => "blocked"), u) },
];

const fetchJson = (p, u) => p.evaluate((x) => fetch(x).then(async (r) => ({ status: r.status, guard: r.headers.get("x-write-guard"), body: await r.text().then((t) => t.slice(0, 200)) }), (e) => ({ error: String(e) })), u);
const navigate = (p, u) => p.evaluate((x) => { location.href = x; }, u);
const image = (p, u) => p.evaluate((x) => { new Image().src = x; }, u);
/** 부작용 GET 트리거 — expect: stub(로컬 대답) · deny(서버에 보내지 않음) · continue(허용 — 서버에 닿아야 한다) */
const GET_VECTORS = [
  { name: "credits-balance-fetch", path: "/api/credits/balance", expect: "stub", run: fetchJson }, // GPE-3 의 그 GET
  { name: "unlisted-api-fetch", path: "/api/workbench/ai-jobs", expect: "deny", run: fetchJson }, // 스윕: stale 잡 정리 + 환불
  { name: "side-effect-img", path: "/api/referral", expect: "deny", run: image }, // 스윕: 추천 코드 lazy 발급
  { name: "side-effect-page-nav", path: "/go/write-guard-selftest", expect: "deny", run: navigate }, // 스윕: 클릭 기록 INSERT
  { name: "unlisted-page-nav", path: "/director/workbench/extraction", expect: "deny", run: navigate }, // 스윕: 화면이 credits sweep
  { name: "allowed-page-nav", path: "/director/exams", expect: "continue", run: navigate },
  { name: "read-only-get-fetch", path: "/api/notifications/summary", expect: "continue", run: fetchJson },
  { name: "public-file-fetch", path: "/fonts/exam/MalgunGothic-Regular.woff2", expect: "continue", run: fetchJson },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // 자가 시험 전용(인쇄 스크립트 아님 — C7 대상 밖)
/** 이동 실패 상한 — 실제 앱(--base)의 /login 은 개발 서버 첫 컴파일 · 동시 편집 Fast Refresh 로 30초를 넘길 수 있다 */
const NAV_CAP = 180_000;
async function until(cond, capMs) {
  for (const t0 = Date.now(); Date.now() - t0 < capMs; await sleep(25)) if (cond()) return true;
  return cond();
}

async function fakeServer() {
  const hits = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://fake.local");
    if (u.searchParams.has("v")) hits.push({ method: req.method, path: u.pathname, v: u.searchParams.get("v") });
    if (isExportUrl(u.href)) {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="write-guard-selftest.hwpx"' });
      return res.end("FAKE EXPORT — write-guard self-test");
    }
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/fonts/")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"fake":"server reached"}');
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end("<!doctype html><meta charset=utf-8><title>write-guard self-test</title><body><p>write-guard self-test</p></body>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, hits, base: `http://127.0.0.1:${server.address().port}` };
}

/** 종전 하네스 규칙(사고 당시): GET/HEAD 통과 · 나머지 abort */
const legacyRoute = (route) => (["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());

async function runLeg(browser, leg, { base, hits = null, guarded, acceptDownloads = true, vectors = VECTORS, pathPrefix = "/api/exams/FAKE" }) {
  const context = await browser.newContext({ acceptDownloads });
  const net = newWriteNet();
  const seen = { routed: [], requests: [] };
  context.on("request", (r) => { if (isExportUrl(r.url())) seen.requests.push(r.url()); });
  if (guarded) await installDownloadGuard(context, net);
  else context.on("page", (page) => page.on("download", (d) => { net.downloads.push({ url: d.url() }); d.cancel().catch(() => {}); }));
  await context.route("**/*", (route) => {
    if (isExportUrl(route.request().url())) seen.routed.push(route.request().url());
    return guarded ? guardRoute(route, net, { appOrigin: base }) : legacyRoute(route);
  });
  const rows = [];
  for (const [i, vector] of vectors.entries()) {
    const tag = `${leg}-${vector.name}`;
    const url = `${pathPrefix}/export-${i % 2 ? "docx" : "hwpx"}?v=${tag}`;
    const mine = (s) => String(s).includes(`v=${tag}`);
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "load", timeout: NAV_CAP }); // 허용 화면(get-policy READ_ONLY_PAGES)에서 시작
    let error = null;
    await vector.run(page, url).catch((e) => { error = String(e?.message ?? e).split("\n")[0].slice(0, 120); });
    const count = () => ({
      hits: hits ? hits.filter((h) => h.v === tag).length : null,
      swallowed: net.swallowed.filter((s) => mine(s.url)).map((s) => s.how),
      routeBlocked: net.blocked.filter((b) => b.kind === "export" && mine(b.url)).length,
      downloads: net.downloads.filter((d) => mine(d.url)).length,
    });
    // 사건: 서버 도달 · 페이지 층이 삼킴 · 네트워크 층이 막음 · 다운로드 중 하나(상한 = 판정 불가 표시)
    const decided = await until(() => { const c = count(); return c.hits > 0 || c.swallowed.length > 0 || c.routeBlocked > 0 || c.downloads > 0; }, 8000);
    await sleep(600); // 부재 증명: 뒤늦게 서버에 닿는 요청이 없는지(다운로드 관리자는 페이지 사건과 순서가 없다)
    rows.push({ vector: vector.name, app: !!vector.app, decided, ...count(), routeSeen: seen.routed.filter(mine).length, requestEvents: seen.requests.filter(mine).length, error });
    await page.close().catch(() => {});
  }
  await context.close();
  return rows;
}

async function runGetLeg(browser, leg, { base, hits, guarded, vectors = GET_VECTORS }) {
  const context = await browser.newContext();
  const net = newWriteNet();
  await context.route("**/*", (route) => (guarded ? guardRoute(route, net, { appOrigin: base }) : legacyRoute(route)));
  const rows = [];
  for (const vector of vectors) {
    const tag = `${leg}-${vector.name}`;
    const mine = (s) => String(s).includes(`v=${tag}`);
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "load", timeout: NAV_CAP });
    let error = null;
    const result = await vector.run(page, `${vector.path}?v=${tag}`).catch((e) => { error = String(e?.message ?? e).split("\n")[0].slice(0, 100); return null; });
    const count = () => ({
      hits: hits ? hits.filter((h) => h.v === tag).length : null,
      stubbed: net.stubbed.filter((s) => mine(s.url)).length,
      denied: net.blocked.filter((b) => b.kind === "get-deny" && mine(b.url)).length,
    });
    const decided = await until(() => { const c = count(); return c.hits > 0 || c.stubbed > 0 || c.denied > 0; }, 8000);
    await sleep(300); // 부재 증명(뒤늦은 도달)
    rows.push({ vector: vector.name, expect: vector.expect, decided, ...count(), result, error });
    await page.close().catch(() => {});
  }
  await context.close();
  return rows;
}

// ── ③ 정적 대조 ─────────────────────────────────────────────────────────────────────
const FIXTURE_ROUTES = {
  // 경로(src/app/api/<이름>/route.ts) → 부작용이 있어야 하는가
  "write-chain": true, "read-only": false, reexport: true, namespace: true, dynamic: true, "client-only": false, "auth/[...nextauth]": false, "other-auth": true,
};
function fixtureProject(fault) {
  const authSrc = (file) => [
    'import { prisma } from "@/lib/prisma";',
    `// ${file}`,
    "export const { handlers, auth } = NextAuth({",
    "  providers: [Credentials({ async authorize() { await prisma.staff.update({ where: {}, data: {} }); return null; } })],",
    "  callbacks: { async session({ session }) { return prisma.staff.findFirst({}).then(() => session); } },",
    "});",
  ].join("\n");
  const files = new Map(Object.entries({
    "prisma/schema.prisma": "model CreditBalance {\n  id String\n}\nmodel Staff {\n  id String\n}\n",
    "src/lib/prisma.ts": "export const prisma = {} as any;",
    "src/lib/credits.ts": [
      'import { prisma } from "@/lib/prisma";',
      "export async function readBalance(id: string) { return prisma.creditBalance.findUnique({ where: { id } }); }",
      "export async function sweep(id: string) { await prisma.creditBalance.update({ where: { id }, data: {} }); }",
      "export async function lockRead(id: string) { return prisma.$queryRaw`SELECT * FROM credit_balances WHERE id = ${id} FOR UPDATE`; }",
      "export async function rawWrite(id: string) { return prisma.$queryRaw`WITH t AS (SELECT 1) UPDATE credit_balances SET balance = 0 WHERE id = ${id}`; }",
      "export async function summary(id: string) { await sweep(id); return readBalance(id); }",
    ].join("\n"),
    "src/lib/index-reexport.ts": 'export { summary as reexported } from "./credits";',
    "src/app/api/write-chain/route.ts": 'import { summary } from "@/lib/credits";\nexport async function GET() { return summary("a"); }',
    "src/app/api/read-only/route.ts": 'import { readBalance, lockRead, sweep } from "@/lib/credits";\nexport async function GET() { await lockRead("a"); return readBalance("a"); }\nexport async function POST() { return sweep("a"); }',
    "src/app/api/reexport/route.ts": 'import { reexported } from "@/lib/index-reexport";\nexport const GET = async () => reexported("a");',
    "src/app/api/namespace/route.ts": 'import * as C from "@/lib/credits";\nexport async function GET() { return C.rawWrite("a"); }',
    "src/app/api/dynamic/route.ts": 'export async function GET() { const m = await import("@/lib/credits"); return m.summary("a"); }',
    "src/app/api/client-only/route.ts": 'import { Widget } from "@/components/widget";\nexport async function GET() { return Widget; }',
    "src/components/widget.tsx": '"use client";\nimport { sweep } from "@/lib/credits";\nexport function Widget() { void sweep("a"); return null; }',
    "src/lib/auth.ts": authSrc("SKIP_SUBTREES 대상(authorize 건너뜀)"),
    "src/app/api/auth/[...nextauth]/route.ts": 'import { handlers } from "@/lib/auth";\nexport const { GET, POST } = handlers;',
    "src/lib/auth-other.ts": authSrc("건너뛰기 대상 아님"),
    "src/app/api/other-auth/route.ts": 'import { handlers } from "@/lib/auth-other";\nexport const { GET } = handlers;',
  }));
  return createProject({ files, delegates: fault === "sweep-blind" ? new Set() : undefined });
}

function staticLeg(fault, fails) {
  const out = {};
  // (a) 분석기 픽스처 — 도움 함수 사슬 · 재수출 · 이름공간 · 동적 import · 쓰기 SQL 은 잡고, FOR UPDATE 읽기 · POST 전용 쓰기 ·
  //     클라이언트 모듈 · 검토된 authorize 는 잡지 않는다
  const fx = sweepSideEffects({ project: fixtureProject(fault) });
  out.fixture = Object.fromEntries(fx.routes.map((r) => [r.file.replace(/^src\/app\/api\/|\/route\.ts$/g, ""), r.writes > 0]));
  for (const [name, want] of Object.entries(FIXTURE_ROUTES)) {
    if (out.fixture[name] !== want) fails.push(`정적: 분석기 픽스처 ${name} 부작용 ${out.fixture[name]}(기대 ${want})`);
  }
  // (b) 실제 저장소
  const policy = effectiveGetPolicy(fault);
  const project = createProject(fault === "sweep-blind" ? { delegates: new Set() } : {});
  const sweep = sweepSideEffects({ project, pageFiles: Object.keys(policy.pages), actions: READ_ONLY_ACTIONS });
  const dirty = (r) => r.writes > 0 || r.external > 0 || (r.missingRoots?.length ?? 0) > 0;
  out.ms = sweep.ms;
  const credits = sweep.routes.find((r) => r.file === "src/app/api/credits/balance/route.ts");
  if (!(credits?.writes > 0) || !credits.sites.some((s) => s.kind === "db")) {
    fails.push(`정적: 알려진 부작용 GET(/api/credits/balance → sweepExpiredCredits)을 분석기가 못 찾았다(눈멂): ${JSON.stringify(credits?.sites?.map((s) => s.what) ?? null)}`);
  }
  const app = "http://127.0.0.1:1";
  const sideEffectGets = sweep.routes.filter((r) => r.symbols.length && (r.writes > 0 || r.external > 0));
  out.sideEffectGets = sideEffectGets.map((r) => ({ file: r.file, writes: r.writes, external: r.external, first: r.sites[0] ? `${r.sites[0].kind} ${r.sites[0].what} @ ${r.sites[0].file}:${r.sites[0].line}` : null }));
  for (const r of sideEffectGets) {
    for (const resourceType of ["fetch", "document"]) {
      const v = classifyGet({ url: app + r.sample, resourceType, appOrigin: app, fault });
      if (v.action === "continue") fails.push(`정적: 부작용 GET ${r.file}(${r.sample}, ${resourceType}) 가 서버로 통과한다(${v.kind})`);
    }
  }
  // 허용 목록: 항목 자체 + 그 패턴이 덮는 형제 route · 화면(Next 는 정적 세그먼트를 먼저 고르지만 가드는 패턴만 본다)
  const { routes: routeFiles, pages: pageFilesAll } = listAppFiles(project);
  const rowOf = new Map(sweep.routes.map((r) => [r.file, r]));
  for (const r of sweep.pages) rowOf.set(r.file, r);
  const rowFor = (file) => {
    if (!rowOf.has(file)) rowOf.set(file, { file, ...summarize(reach(project, pageRoots(project, file))) });
    return rowOf.get(file);
  };
  out.admitted = [];
  for (const [kind, table] of [["page", policy.pages], ["get", policy.gets]]) {
    for (const [file, entry] of Object.entries(table)) {
      const re = new RegExp(entryPatternSource(file, entry));
      const paths = entry && typeof entry === "object" && entry.paths ? entry.paths : null;
      const covered = [...routeFiles, ...pageFilesAll].filter((f) =>
        f === file || (paths ? paths.some((p) => new RegExp(routePatternSource(f)).test(p)) : re.test(samplePath(f))));
      if (![...routeFiles, ...pageFilesAll].includes(file)) fails.push(`정적: 허용 목록 ${kind} ${file} 파일이 없다(목록이 낡았다)`);
      for (const f of covered) {
        const row = rowFor(f);
        out.admitted.push({ kind, entry: file, file: f, writes: row.writes, external: row.external, missing: row.missingRoots ?? [] });
        if (dirty(row)) fails.push(`정적: 허용 목록 ${kind} ${file} 가 받는 ${f} 에 부작용 ${row.writes}(외부 ${row.external}, 없는 뿌리 ${row.missingRoots?.join(",") || "-"}): ${row.sites.slice(0, 2).map((s) => `${s.what}@${s.file}:${s.line}`).join(" · ")}`);
      }
    }
  }
  for (const a of sweep.actions) {
    if (dirty(a)) fails.push(`정적: 읽기 전용 서버 액션 ${a.file}#${a.name} 에 부작용 ${a.writes}(없는 뿌리 ${a.missingRoots?.join(",") || "-"})`);
  }
  out.actions = sweep.actions.map((a) => `${a.name}:${a.writes}`);
  return out;
}

// ── 판정 ────────────────────────────────────────────────────────────────────────
export async function selfTest() {
  const args = process.argv.slice(2);
  const liveBase = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
  const fault = process.env.PRINT_E2E_FAULT || null;
  const fails = [];
  const report = { fault, liveBase, legs: {}, getLegs: {} };
  report.static = staticLeg(fault, fails);
  const { server, hits, base } = await fakeServer();
  report.fakeBase = base;
  const browser = await chromium.launch({ headless: true });
  try {
    report.legs.control = await runLeg(browser, "control", { base, hits, guarded: false });
    report.legs.controlDeny = await runLeg(browser, "deny", { base, hits, guarded: false, acceptDownloads: false, vectors: VECTORS.filter((v) => v.app) });
    report.legs.guarded = await runLeg(browser, "guarded", { base, hits, guarded: true });
    report.getLegs.control = await runGetLeg(browser, "get-control", { base, hits, guarded: false });
    report.getLegs.guarded = await runGetLeg(browser, "get-guarded", { base, hits, guarded: true });
    if (liveBase) {
      // 실제 앱 문서(Next 번들 · 라우터가 도는 /login)에서 앱 모양 트리거가 페이지 층에서 삼켜지는가.
      // 존재하지 않는 가짜 경로만 쓴다 — 삼켜지지 않으면 개발 서버에 404 요청이 갈 뿐 DB 와 무관하다.
      report.legs.live = await runLeg(browser, "live", { base: liveBase, guarded: "live", vectors: VECTORS.filter((v) => v.app), pathPrefix: "/api/__write_guard_selftest__" });
      // 실제 앱 원점에서 credits 가 로컬 스텁으로 대답되는가(세션 없음 — 가드가 뚫려도 라우트는 401 로 끝나 쓰지 않는다)
      report.getLegs.live = await runGetLeg(browser, "get-live", { base: liveBase, hits: null, guarded: true, vectors: GET_VECTORS.filter((v) => v.name === "credits-balance-fetch") });
    }
  } finally {
    await browser.close();
    server.close();
  }
  // ① 대조군: 앱 모양(붙인 앵커 click)이 route · request 사건 없이 서버에 닿아야 한다 = 사고 구멍 재현
  const hole = report.legs.control.find((r) => r.vector === "anchor-click-attached");
  if (!(hole?.hits > 0 && hole.routeSeen === 0 && hole.requestEvents === 0)) {
    fails.push(`대조군이 구멍을 재현하지 못했다(자가 시험이 무뎌졌다): ${JSON.stringify(hole)}`);
  }
  for (const r of report.legs.guarded) {
    if (r.hits > 0) fails.push(`가드: ${r.vector} 가 가짜 서버에 ${r.hits}건 닿았다`);
    if (r.downloads > 0) fails.push(`가드: ${r.vector} 다운로드 ${r.downloads}건`);
    if (r.swallowed.length === 0 && r.routeBlocked === 0) fails.push(`가드: ${r.vector} 를 어느 층도 잡았다는 기록이 없다`);
  }
  for (const r of report.legs.live ?? []) {
    if (r.swallowed.length === 0 || r.downloads > 0 || r.routeBlocked > 0) fails.push(`실제 앱 문서: ${r.vector} 페이지 층 미작동(${JSON.stringify(r)})`);
  }
  // ② 부작용 GET: 대조군은 서버에 닿아야(GPE-3 구멍 재현), 가드는 부작용 도달 0 · 허용 도달
  for (const r of report.getLegs.control.filter((x) => x.expect !== "continue")) {
    if (!(r.hits > 0)) fails.push(`GET 대조군: ${r.vector} 가 서버에 닿지 않았다(구멍 재현 실패 — 자가 시험이 무뎌졌다)`);
  }
  for (const r of report.getLegs.guarded) {
    if (r.expect === "continue") {
      if (!(r.hits > 0) || r.denied > 0) fails.push(`GET 가드: 허용 ${r.vector} 가 서버에 닿지 않았다(과잉 차단 — 도달 ${r.hits} · 거부 ${r.denied})`);
      continue;
    }
    if (r.hits > 0) fails.push(`GET 가드: 부작용 ${r.vector} 가 가짜 서버에 ${r.hits}건 닿았다`);
    if (r.expect === "stub" && !(r.stubbed > 0 && r.result?.guard === "stub" && /"balance":9999/.test(r.result?.body ?? ""))) fails.push(`GET 가드: ${r.vector} 가 로컬 스텁으로 대답되지 않았다(${JSON.stringify(r.result)})`);
    if (r.expect === "deny" && !(r.denied > 0)) fails.push(`GET 가드: ${r.vector} 거부 기록이 없다`);
  }
  for (const r of report.getLegs.live ?? []) {
    if (!(r.stubbed > 0 && r.result?.guard === "stub")) fails.push(`실제 앱 문서: ${r.vector} 가 로컬 스텁이 아니다(${JSON.stringify(r.result)})`);
  }
  report.verdict = fails.length ? "RED" : "GREEN";
  report.fails = fails;
  const fmt = (rows) => rows.map((r) => `  ${r.vector.padEnd(26)} hits=${r.hits ?? "-"} swallowed=[${r.swallowed.join(",")}] routeBlocked=${r.routeBlocked} downloads=${r.downloads} routeSeen=${r.routeSeen} requestEvents=${r.requestEvents}${r.error ? ` err=${r.error}` : ""}`).join("\n");
  const fmtGet = (rows) => rows.map((r) => `  ${r.vector.padEnd(26)} expect=${r.expect.padEnd(8)} hits=${r.hits ?? "-"} stubbed=${r.stubbed} denied=${r.denied}${r.result?.guard ? ` guard=${r.result.guard}` : ""}${r.error ? ` err=${r.error}` : ""}`).join("\n");
  for (const [leg, rows] of Object.entries(report.legs)) console.log(`[${leg}]\n${fmt(rows)}`);
  for (const [leg, rows] of Object.entries(report.getLegs)) console.log(`[GET ${leg}]\n${fmtGet(rows)}`);
  const s = report.static;
  console.log(`[정적] 스윕 ${s.ms}ms · 픽스처 ${JSON.stringify(s.fixture)} · 부작용 GET ${s.sideEffectGets.length}개 · 허용 목록이 받는 파일 ${s.admitted.length}개(부작용 ${s.admitted.filter((a) => a.writes || a.external).length}) · 서버 액션 ${s.actions.join(" ")}`);
  for (const g of s.sideEffectGets) console.log(`  부작용 GET ${g.file} — ${g.first}`);
  console.log(JSON.stringify({ verdict: report.verdict, fault, fails }, null, 2));
  return report;
}
