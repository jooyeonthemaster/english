// ============================================================================
// 시험지 인쇄 검증 하네스(공용) — print-e2e.mjs · paper-print-check.mjs 가 함께 쓴다.
//  · openGuardedContext  쓰기 차단 브라우저(운영 DB 0건) — write-guard.mjs 의 세 겹을 모든 컨텍스트에 건다:
//                        페이지 층(<a download> · 내보내기 클릭 · 이동 · window.open · 폼을 요청 전에 삼킴, sendBeacon 무력화),
//                        네트워크 층(/api/**/export* 메서드 무관 abort · GET/HEAD 는 기본 거부 + 명시 허용 목록(get-policy.mjs —
//                        부작용 GET 은 로컬 스텁 · 거부) · 그 밖 abort · 읽기 전용 서버 액션만 이름으로 허용 — 고객 세션은
//                        예외 0 · /api/track · collect abort), 경보(다운로드 시작 → 취소 + RED)
//                        ⚠ 26-09-30 사고: route 만 믿던 종전 판에서 <a download> 가 route 를 우회해 운영에 썼다.
//  · instrument          앱보다 먼저 설치되는 계측: print() → 호출 순간 동기 스냅숏, beforeprint/afterprint 스냅숏,
//                        앱의 beforeprint 등록 수(= 인쇄를 가로챌 준비가 된 사건), 선택적 afterprint 붙잡기
//                        realPrint 면 스냅숏 뒤 **진짜 window.print()** 를 부른다(헤드리스 Chromium 은 그 안에서
//                        beforeprint → afterprint 를 동기로 쏘고 돌아온다 = 데스크톱 실제 순서, 26-09-30 실측)
//  · enginePrint         page.pdf() 직행(기다림 없음) → 쪽마다 글자 수 · 백지 · 경고 문구(pdfjs-dist)
//  · judgeSnapshot / judgePdf  합격 판정식(docs/EXAM-PRINT-PIPELINE.md §6)
// 대기는 사건만 기다린다. waitForTimeout · 합성 beforeprint 는 계약 테스트가 금지한다
// (tests/unit/exam-print-pipeline-contract.test.mjs).
// ============================================================================
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { guardRoute, installDownloadGuard, newWriteNet, summarizeWriteGuard } from "./write-guard.mjs";

export { READ_ONLY_ACTIONS, judgeWriteGuard, lookupAction } from "./write-guard.mjs";

/** print-styles.tsx 가 미마운트 쪽에 찍는 경고 문구(백지 대신) */
export const PRINT_WARNING_TEXT = "인쇄 준비가 끝나지 않았습니다";
/** 이보다 글자가 적은 쪽은 백지로 친다(공백 제외) */
export const MIN_PAGE_CHARS = 50;
/**
 * 짧게 끝나는 것이 정상인 쪽(정답표 · 표지)의 하한 — 인쇄된 DOM 그 쪽 글자 수의 절반(최소 SHORT_PAGE_FLOOR).
 * 26-09-30 GPE-1: 5문항 시험지 정답표 쪽(DOM 60여 자)을 pdfjs 가 41자로 세어 「백지」 거짓 RED 가 났다.
 * 진짜 백지(미마운트 쪽 = 쪽 번호 정도)는 DOM 글자의 절반에 한참 못 미치므로 여전히 잡힌다.
 */
export const SHORT_PAGE_FLOOR = 8;
export const CAP = 600_000; // 실패 상한(개발 서버 첫 컴파일 포함). 준비 판정에는 쓰지 않는다.
const SESSION_COOKIE_SCRIPTS = { e2e: ".tmp-studio-qa/mint-cookie.mjs", customer: ".tmp-crm/lee89/mint-lee.mjs" };
export const FIRST_FRAME = "#exam-paper-print-root [data-exam-page-index]";
export const STATUS = '[data-preview-toolbar] + [role="status"]';

// ── 페이지 계측(모든 문서에 앱보다 먼저 설치 — 쓰기 가드의 페이지 층 다음) ─────────────────
function instrument(opts) {
  const W = window;
  W.__printCalls = [];
  W.__snaps = [];
  W.__bp = { before: 0, after: 0, addBefore: 0 };
  W.__clickT = null;
  W.__longest = 0;
  const rootOf = () =>
    document.querySelector("#exam-print-host #exam-paper-print-root") ?? document.getElementById("exam-paper-print-root");
  W.__snap = (tag) => {
    const root = rootOf();
    const q = (sel) => (root ? [...root.querySelectorAll(sel)] : []);
    const frames = q(".exam-preview-page-frame");
    const body = q("[data-exam-page-index]");
    // 쪽(프레임)마다: 짧은 것이 정상인 쪽(정답표 · 표지) 여부와 DOM 글자 수(공백 제외) — PDF 백지 판정의 쪽별 하한
    const frameInfo = frames.map((f) => ({
      short: f.hasAttribute("data-exam-answer-key-frame") || f.hasAttribute("data-exam-cover-frame"),
      chars: f.textContent.replace(/\s+/g, "").length,
    }));
    const chk = (w) => { try { return document.fonts.check(`${w} 16px "Malgun Gothic Exam"`, "가A1①"); } catch { return null; } };
    return {
      tag,
      sinceClick: W.__clickT == null ? null : Math.round(performance.now() - W.__clickT),
      roots: document.querySelectorAll("#exam-paper-print-root").length,
      hosts: document.querySelectorAll("#exam-print-host").length,
      rootInDialog: !!root?.closest("[role=dialog]"),
      rootParent: root?.parentElement?.id || null,
      frames: frames.length,
      frameInfo,
      mountedFrames: frames.filter((f) => f.querySelector(".exam-a4-page")).length,
      bodyFrames: body.length,
      mountedBody: body.filter((f) => f.querySelector(".exam-a4-page")).length,
      falseAttr: body.filter((f) => f.getAttribute("data-exam-page-mounted") === "false").length,
      answerKeyFrames: q("[data-exam-answer-key-frame]").length,
      inlineAnswers: q(".exam-a4-page span.font-bold").filter((s) => /^정답:?$/.test(s.textContent.trim())).length,
      fontsStatus: document.fonts?.status ?? null,
      font400: chk(400),
      font700: chk(700),
      fontFaces: [...(document.fonts ?? [])]
        .filter((f) => f.family.replace(/["']/g, "") === "Malgun Gothic Exam")
        .map((f) => `${f.weight}:${f.status}`),
      imagesPending: q("img").filter((i) => !i.complete).length,
      iframes: document.querySelectorAll("iframe").length,
      dialogs: document.querySelectorAll("[role=dialog]").length,
      search: location.search,
      longestTask: Math.round(W.__longest),
      textLen: root ? root.textContent.length : 0,
      status: document.querySelector('[data-preview-toolbar] + [role="status"]')?.textContent ?? null,
    };
  };
  // 칸 넘침 감사 — 칸의 마지막 블록 아래끝이 main 아래끝을 넘는 칸(배율 무관 px). 인쇄 CSS 는 미리보기를
  // 균일 배율로 찍으므로(print-styles.tsx) 인쇄된 DOM 을 그대로 재면 종이의 넘침과 같다.
  W.__auditOverflow = () => {
    const root = rootOf();
    const pages = root ? [...root.querySelectorAll(".exam-a4-page")] : [];
    const where = [];
    pages.forEach((pageEl, index) => {
      const main = pageEl.querySelector("main");
      if (!main) return;
      const rect = main.getBoundingClientRect();
      const scale = rect.height / main.offsetHeight || 1;
      [...main.children].forEach((col, c) => {
        const last = col.lastElementChild;
        const over = last ? (last.getBoundingClientRect().bottom - rect.bottom) / scale : 0;
        if (over > 1) where.push(`${index + 1}쪽 ${c + 1}칸 +${Math.round(over)}px`);
      });
    });
    return { pages: pages.length, overflowColumns: where.length, where: where.slice(0, 20) };
  };
  // 시험지 인쇄 컨트롤러의 window.print() → 호출 순간 동기 스냅숏(실제 인쇄는 뒤이은 page.pdf 가 한다).
  // realPrint: 스냅숏 뒤 진짜 print() — 그 호출 안에서 엔진이 쏜 beforeprint/afterprint 수를 스냅숏에 적는다.
  const nativePrint = W.print.bind(W);
  W.print = function printSnapshot() {
    const snap = W.__snap("print-call");
    W.__printCalls.push(snap);
    if (!opts.realPrint) return;
    const [b0, a0] = [W.__bp.before, W.__bp.after];
    nativePrint();
    snap.syncEvents = { before: W.__bp.before - b0, after: W.__bp.after - a0 };
  };
  document.addEventListener("click", () => { W.__clickT = performance.now(); W.__longest = 0; }, true);
  // 앱보다 먼저 등록 → beforeprint 스냅숏 = 포털 전 상태, afterprint 스냅숏 = 인쇄된 DOM(복원 전).
  // 인쇄 레이아웃과 afterprint 사이에는 스크립트가 끼지 않으므로 afterprint 순간의 DOM 이 곧 인쇄된 DOM 이다.
  // 그 뒤 인쇄 루트가 바뀌는 횟수(인쇄 뒤 재조판)를 __postPrintMutations 로 센다.
  W.__postPrintMutations = 0;
  addEventListener("beforeprint", () => {
    W.__bp.before += 1;
    // portal-opt-out 결함: 포털 판정 직전(이 리스너가 앱보다 먼저 돈다)에 <html> 에 호스트 명시 제외 표식을 단다
    if (opts.fault === "portal-opt-out") document.documentElement.setAttribute("data-exam-print-exclude", "true");
    W.__snaps.push(W.__snap("beforeprint"));
  });
  addEventListener("afterprint", () => {
    W.__bp.after += 1;
    if (opts.fault === "overflow-dom") {
      // 넘침 감지기 음성테스트: 인쇄된 1쪽 첫 칸에 칸보다 큰 블록을 끼운다(감사가 잡아야 한다)
      const col = document.querySelector("#exam-print-host .exam-a4-page main > *");
      if (col) col.appendChild(Object.assign(document.createElement("div"), { style: "height:2000px" }));
    }
    W.__snaps.push({ ...W.__snap("afterprint"), overflow: W.__auditOverflow() });
    const root = rootOf();
    if (root) {
      new MutationObserver((list) => { W.__postPrintMutations += list.length; })
        .observe(root, { subtree: true, childList: true, characterData: true });
    }
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) W.__longest = Math.max(W.__longest, e.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch { /* longtask 미지원 엔진 */ }
  // 앱의 beforeprint 등록 수(= 인쇄를 가로챌 준비가 된 사건) · 앱 afterprint 붙잡기(인쇄된 DOM 감사용)
  const add = W.addEventListener.bind(W);
  const remove = W.removeEventListener.bind(W);
  const wrapped = new WeakMap();
  const held = [];
  W.__holdAfterprint = !!opts.holdAfterprint;
  W.addEventListener = function (type, fn, o) {
    if (type === "beforeprint") W.__bp.addBefore += 1;
    if (type === "afterprint" && opts.holdAfterprint && typeof fn === "function") {
      const w = (e) => (W.__holdAfterprint ? held.push(() => fn.call(W, e)) : fn.call(W, e));
      wrapped.set(fn, w);
      return add(type, w, o);
    }
    return add(type, fn, o);
  };
  W.removeEventListener = function (type, fn, o) { return remove(type, wrapped.get(fn) ?? fn, o); };
  W.__releaseAfterprint = () => { W.__holdAfterprint = false; held.splice(0).forEach((f) => f()); };
  if (opts.fault === "no-replace-state") {
    const orig = history.replaceState.bind(history);
    history.replaceState = (s, u, url) => orig(s, u, url && String(url).includes("print=1") ? url : location.href);
  }
  // 【악조건 · GREEN 이어야 한다】 지난 인쇄가 남긴 주인 없는 #exam-print-host. 26-09-30 R7 이후 포털이 치우고
  // 선다(자가 치유) — 종전(Wave 1)에는 이것 하나로 포털이 영구히 비켜서 RED 였다.
  if (opts.fault === "host-preexists") {
    document.addEventListener("DOMContentLoaded", () => {
      const host = document.createElement("div");
      host.id = "exam-print-host";
      document.body.appendChild(host);
    });
  }
  // 【계기 음성테스트 · RED 여야 한다】 포털이 서지 않는 인쇄를 하네스가 잡는가.
  //  portal-opt-out: <html> 에 호스트 명시 제외 표식(data-exam-print-exclude) → 포털 판정 (1) 이 매번 비켜선다
  //                  = 「포털 미탑승」(루트 제자리 · 전 쪽 마운트 없음 · 앱 전체가 인쇄된다). 표식은 위 beforeprint 리스너가 단다.
  //  portal-removed: 포털이 세운 #exam-print-host 를 MutationObserver 가 곧바로 떼어 낸다(루트째 문서 밖 → 빈 인쇄)
  if (opts.fault === "portal-removed") {
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver((list) => {
        for (const m of list) for (const n of m.addedNodes) if (n.id === "exam-print-host") { W.__hostRemoved = (W.__hostRemoved ?? 0) + 1; n.remove(); }
      }).observe(document.body, { childList: true });
    });
  }
}

function mintCookie(session) {
  if (process.env.PRINT_E2E_COOKIE) return process.env.PRINT_E2E_COOKIE.trim();
  const script = SESSION_COOKIE_SCRIPTS[session];
  if (!script) throw new Error(`알 수 없는 세션: ${session}`);
  return execSync(`node ${script}`, { encoding: "utf8" }).trim();
}

/** 쓰기 차단 브라우저 컨텍스트. net = {allowed, blocked, telemetry} 는 요청마다 쌓인다. */
export async function openGuardedContext({
  base,
  session = "e2e",
  viewport = { width: 1536, height: 900 },
  allowRead = session !== "customer",
  extraReadActions = [],
  fault = process.env.PRINT_E2E_FAULT || null,
  holdAfterprint = false,
  realPrint = false,
}) {
  if (session === "customer" && (allowRead || extraReadActions.length)) {
    throw new Error("고객 세션에서는 서버 액션을 하나도 허용하지 않는다(spec §3)");
  }
  const browser = await chromium.launch({ headless: true });
  // acceptDownloads 는 켜 둔다 — 뚫린 다운로드가 조용히 거부되지 않고 download 사건(경보 → RED)으로 드러나게.
  // (거부 'deny' 로 둬도 요청은 이미 서버에 간다 — write-guard 자가 시험 controlDeny 실측)
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, acceptDownloads: true });
  await context.addCookies([
    { name: "authjs.session-token", value: mintCookie(session), domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  const net = { ...newWriteNet(), held: [], hung: [] };
  await installDownloadGuard(context, net, { fault }); // 페이지 층 + 경보 — 페이지를 만들기 전에
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (fault === "block-fonts" && url.includes("/fonts/exam/")) return route.abort();
    // 시험지 글꼴이 늦게 온다(결국 도착) — releaseHeldFonts(net) 가 풀 때까지 응답을 붙잡는다(V7-1).
    if (fault === "hold-exam-fonts" && url.includes("/fonts/exam/")) return void net.held.push(route);
    // 무관한 UI 글꼴(Pretendard CDN)이 영영 안 온다 — 로컬 설치본(local())을 지워 CDN 을 타게 하고 응답하지 않는다.
    // 시험지 글꼴은 정상이다. 인쇄 준비가 이것을 기다리면 안 된다(PRINT-R1).
    if (fault === "hang-ui-font" && /pretendard(\.min)?\.css/i.test(url)) {
      const res = await route.fetch();
      const css = (await res.text()).replace(/src:\s*local\([^)]*\)\s*,/g, "src:");
      return route.fulfill({ response: res, body: css, headers: { ...res.headers(), "content-type": "text/css" } });
    }
    if (fault === "hang-ui-font" && /Pretendard-[\w-]+\.woff2?(\?|$)/i.test(url)) return void net.hung.push(url.slice(-48));
    // 네트워크 층(write-guard): 분석 abort · 내보내기 경로 메서드 무관 abort · GET/HEAD 는 get-policy 허용 목록만
    // (공지 배너 · credits 는 로컬 스텁 — 배너 모달이 클릭을 막고, credits 는 부작용 GET) · 읽기 전용 액션만 허용 ·
    // 인쇄 집계 본문은 abort 하며 증거로 적는다.
    const denyActions = fault === "no-preview-data" ? ["getExamPreviewData"] : [];
    return guardRoute(route, net, { allowRead, extraReadActions, denyActions, appOrigin: base, fault });
  });
  await context.addInitScript(instrument, { holdAfterprint, fault, realPrint });
  return { browser, context, net };
}

/** hold-exam-fonts 로 붙잡은 시험지 글꼴 응답을 지금 보낸다 */
export function releaseHeldFonts(net) {
  const routes = net.held.splice(0);
  for (const route of routes) route.continue().catch(() => {});
  return routes.length;
}

export function summarizeNet(net) {
  const count = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }), {});
  return {
    allowed: count(net.allowed, (r) => r.name),
    blocked: count(net.blocked, (r) => (r.kind === "analytics" ? "analytics" : r.kind === "export" ? `export ${r.method}` : `${r.method} ${r.name ?? r.url}`)),
    telemetry: net.telemetry,
    writeGuard: summarizeWriteGuard(net),
  };
}

/** 인쇄 집계 요청(abort 됨)이 count 건 도착하는 사건을 기다린다. 상한은 실패 판정용. */
export function waitTelemetry(net, examId, capMs, count = 1) {
  const has = () => net.telemetry.filter((t) => JSON.stringify(t).includes(examId)).length >= count;
  if (has()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onNew = () => { if (has()) done(true); };
    const timer = setTimeout(() => done(false), capMs);
    function done(ok) { clearTimeout(timer); net.waiters.delete(onNew); resolve(ok); }
    net.waiters.add(onNew);
  });
}

/** PDF 쪽마다 글자 수(공백 제외) · 경고 문구 */
export async function pdfPageTexts(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    const text = content.items.map((it) => it.str ?? "").join("").replace(/\s+/g, "");
    pages.push({ page: i, chars: text.length, warning: text.includes(PRINT_WARNING_TEXT.replace(/\s+/g, "")) });
  }
  await doc.destroy();
  return pages;
}

/** 실제 인쇄 엔진으로 지금 바로 인쇄한다(기다림 없음) → 쪽 수 · 쪽별 글자 수 · 경고 쪽(백지 판정은 judgePdf 가 쪽별 하한으로) */
export async function enginePrint(page, file) {
  const buffer = await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
  const pages = await pdfPageTexts(buffer);
  return {
    file,
    pages: pages.length,
    chars: pages.map((p) => p.chars),
    textPages: pages.filter((p) => p.chars >= MIN_PAGE_CHARS).length,
    blank: pages.filter((p) => p.chars < MIN_PAGE_CHARS).map((p) => p.page),
    warning: pages.filter((p) => p.warning).map((p) => p.page),
    minChars: pages.length ? Math.min(...pages.map((p) => p.chars)) : 0,
  };
}

/**
 * i 번째 쪽(0-based)의 백지 하한. 인쇄된 DOM 의 같은 순번 프레임이 정답표 · 표지이고 DOM 글자가 있으면
 * DOM 글자의 절반(SHORT_PAGE_FLOOR ~ MIN_PAGE_CHARS 사이), 그 밖은 MIN_PAGE_CHARS. 프레임 순서 = 인쇄 쪽 순서
 * (judgePdf 가 쪽 수 = 프레임 수를 먼저 확인한다).
 */
export function pageFloor(frameInfo, i) {
  const f = Array.isArray(frameInfo) ? frameInfo[i] : null;
  if (!f?.short || !(f.chars > 0)) return MIN_PAGE_CHARS;
  return Math.min(MIN_PAGE_CHARS, Math.max(SHORT_PAGE_FLOOR, Math.ceil(f.chars / 2)));
}

export const check = (fails, cond, msg) => { if (!cond) fails.push(msg); };

/** print() 호출 순간의 준비 상태 판정 */
export function judgeSnapshot(s, fails, { inDialog = false } = {}) {
  check(fails, !!s, "print() 가 호출되지 않았다");
  if (!s) return;
  check(fails, s.frames > 0 && s.mountedFrames === s.frames, `print() 순간 마운트 ${s.mountedFrames}/${s.frames}`);
  check(fails, s.falseAttr === 0, `print() 순간 data-exam-page-mounted=false ${s.falseAttr}쪽`);
  const facesOk = ["400", "700"].every((w) => s.fontFaces.includes(`${w}:loaded`));
  check(fails, s.font400 === true && s.font700 === true && facesOk, `시험지 글꼴 미준비(${s.fontsStatus} ${s.fontFaces.join(",")})`);
  check(fails, s.imagesPending === 0, `이미지 대기 ${s.imagesPending}`);
  check(fails, s.iframes === 0, `iframe ${s.iframes}개`);
  if (inDialog) check(fails, s.rootInDialog, "인쇄 루트가 대화상자 밖이다");
  else check(fails, s.roots === 1, `인쇄 루트 ${s.roots}개`);
}

/** 원격 측정 본문(서버 액션 인자 [examId, meta])에서 meta 를 꺼낸다 */
export const telemetryMeta = (t) => (Array.isArray(t) ? t[1] : null) ?? null;

/**
 * 원격 측정 메타 판정 — 인쇄됨 · 전 쪽 마운트 · 글꼴 loaded · 가드 수렴(timeout · stuck 아님) · 재시도 사유 없음.
 * expect.fonts: 결함 주입으로 글꼴이 안 오는 실행이면 그 값(예: 'error'), expect.path: 'fast'|'prepare' 강제.
 */
export function judgeTelemetry(meta, fails, tag, expect = {}) {
  check(fails, !!meta, `${tag}: 원격 측정 메타 없음`);
  if (!meta) return;
  check(fails, meta.outcome === "printed", `${tag}: outcome ${meta.outcome}`);
  check(fails, meta.pages > 0 && meta.mountedPages === meta.pages, `${tag}: 메타 마운트 ${meta.mountedPages}/${meta.pages}`);
  check(fails, meta.fonts === (expect.fonts ?? "loaded"), `${tag}: fonts=${meta.fonts}(기대 ${expect.fonts ?? "loaded"})`);
  check(fails, meta.guard === "settled", `${tag}: guard=${meta.guard}${meta.overflowColumns ? `(넘친 칸 ${meta.overflowColumns})` : ""}`);
  if (expect.path) check(fails, meta.path === expect.path, `${tag}: path=${meta.path}(기대 ${expect.path})`);
  check(fails, !meta.prior, `${tag}: prior=${meta.prior}(정상 종료 뒤 재시도 사유가 남았다)`);
}

/**
 * PDF 판정 — 쪽 수 = 인쇄 프레임 수, 모든 쪽에 글자(쪽별 하한 pageFloor — frameInfo 는 인쇄 순간 스냅숏의 것),
 * 경고 문구 0. 판정에 쓴 쪽별 하한 · 백지 쪽을 pdf.judged 에 남긴다.
 */
export function judgePdf(pdf, expectedPages, fails, tag = "PDF", frameInfo = null) {
  check(fails, pdf.pages === expectedPages, `${tag}: ${pdf.pages}쪽 ≠ 인쇄 프레임 ${expectedPages}`);
  const chars = pdf.chars ?? [];
  const floors = chars.map((_, i) => pageFloor(pdf.pages === expectedPages ? frameInfo : null, i));
  const blank = chars.map((c, i) => (c < floors[i] ? i + 1 : 0)).filter(Boolean);
  pdf.judged = { floors: [...new Set(floors)], blank, shortPages: floors.map((f, i) => (f < MIN_PAGE_CHARS ? i + 1 : 0)).filter(Boolean) };
  check(fails, pdf.pages > 0 && chars.length === pdf.pages && blank.length === 0, `${tag}: 글자 있는 쪽 ${pdf.pages - blank.length}/${pdf.pages}(백지 ${blank.join(",") || "-"})`);
  check(fails, pdf.warning.length === 0, `${tag}: 경고 문구 쪽 ${pdf.warning.join(",")}`);
}

/**
 * 방금 인쇄된 DOM(afterprint 순간 스냅숏) 판정 — 전 쪽 마운트 · 칸 넘침 0. 스냅숏을 돌려준다.
 * overflowTo 를 넘기면 칸 넘침은 실패 대신 거기(경고)에 적는다 — 네이티브 경로(Ctrl+P)는 가드 수렴을 기다릴 수
 * 없다는 설계상 한계라, 백지 여부와 따로 보고한다.
 */
export async function judgePrinted(page, fails, tag = "인쇄된 DOM", overflowTo = fails) {
  const s = await page.evaluate(() => window.__snaps.filter((x) => x.tag === "afterprint").at(-1) ?? null);
  check(fails, !!s, `${tag}: afterprint 가 오지 않았다`);
  if (!s) return null;
  check(fails, s.mountedFrames === s.frames, `${tag}: 마운트 ${s.mountedFrames}/${s.frames}`);
  check(
    overflowTo,
    s.overflow.overflowColumns === 0,
    `${tag}: 넘친 칸 ${s.overflow.overflowColumns}(${s.overflow.where.join(" · ")}; 인쇄 순간 글꼴 ${s.fontFaces.join(",")})`,
  );
  return s;
}

/**
 * 시험지 글꼴 400·700 이 실제로 로드된 사건 + 두 프레임(글꼴 도착으로 가드가 다시 잰 결과가 커밋되도록).
 * 조판 품질(칸 넘침)을 볼 때 「글꼴 경주」를 떼어 내는 용도다. 지연 마운트된 쪽은 스크롤 없이는 여전히 안 그려지므로
 * 동기 안전망 시험은 그대로 성립한다(9/19 가짜 GREEN 은 기다리는 동안 이펙트가 쪽을 그려 준 것이었다).
 */
export async function examFontsSettled(page) {
  await page.evaluate(() =>
    Promise.all(["400", "700"].map((w) => document.fonts.load(`${w} 16px "Malgun Gothic Exam"`, "가A1①"))).then(() => document.fonts.ready),
  );
  await twoFrames(page);
}

/**
 * 새 페이지 — 콘솔 오류는 errors 에, 개발 서버 Fast Refresh(동시 편집으로 모듈이 교체됨)는 ctx.hmr 에 적는다.
 * Fast Refresh 는 상태 · ref 를 보존한 채 이펙트 cleanup 을 다시 돌려 인쇄 도중 잡 리스너를 뗄 수 있다
 * (26-09-30 실측: 다른 세션 편집 직후 force-per-page 의 두 번째 잡에 prior:'needs-gesture'). 판정은 그대로 두고
 * 호출자가 경고로 드러낸다 — 그런 RED 는 같은 명령을 다시 돌려 확인한다.
 */
export async function openPage(ctx, errors) {
  const page = await ctx.context.newPage();
  ctx.hmr ??= [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
    else if (/\[Fast Refresh\]|\[HMR\]/.test(m.text())) ctx.hmr.push(m.text().slice(0, 120));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  return page;
}
/** 앱이 인쇄를 가로챌 준비가 된 사건 — 첫 본문 프레임 + 앱의 beforeprint 리스너 등록 */
export async function printReady(page) {
  await page.waitForSelector(FIRST_FRAME, { timeout: CAP });
  await page.waitForFunction(() => window.__bp.addBefore > 0, null, { timeout: CAP });
}
export const callsNow = (page) => page.evaluate(() => window.__printCalls.length);
export async function waitPrintCall(page, n) {
  await page.waitForFunction(
    ([k, sel]) =>
      window.__printCalls.length > k ||
      /실패/.test(document.querySelector(sel)?.textContent ?? "") ||
      !!document.querySelector("[role=dialog] [role=alert]") ||
      window.__dialogGone === true, // 인쇄 대화상자가 print() 없이 닫혔다(빈 시험지 등)
    [n, STATUS],
    { timeout: CAP },
  );
  return page.evaluate((k) => window.__printCalls[k] ?? null, n);
}
export const afterprintCount = (page) => page.evaluate(() => window.__bp.after);
export const waitAfterprint = (page, n) => page.waitForFunction((k) => window.__bp.after > k, n, { timeout: 60_000 });
export const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** 툴바에서 누를 수 있는 항목 — 인쇄 계열만. HWPX · DOCX 는 내보내기 라우트(운영 기록 · printCount)라 누르지 않는다. */
const PRINT_TOOLBAR_ITEMS = new Set(["인쇄", "PDF", "PDF 해설"]);
export async function clickToolbar(page, text) {
  if (!PRINT_TOOLBAR_ITEMS.has(text)) throw new Error(`clickToolbar: 「${text}」 는 누르지 않는다(인쇄 항목만 — 내보내기는 쓰기)`);
  const direct = page.locator(`[data-preview-toolbar] button:has-text("${text}")`).first();
  if (text === "인쇄" && (await direct.isVisible().catch(() => false))) return direct.click();
  const more = page.locator('[data-preview-toolbar] [aria-label="인쇄 · 다운로드"]');
  if (await more.isVisible().catch(() => false)) await more.click();
  else await page.locator('[data-preview-toolbar] button:has-text("다운로드")').first().click();
  return page.locator(`[data-preview-toolbar] div.absolute button:has-text("${text}")`).first().click();
}
