#!/usr/bin/env node
// ============================================================================
// 쓰기 차단 가드(공용) — 헤드리스 검증 스크립트가 운영 DB(로컬 .env DATABASE_URL = 운영)에 한 건도 쓰지 않게 한다.
//   print-harness.mjs(openGuardedContext) · paper-sweep.mjs 가 모든 브라우저 컨텍스트에 건다.
//
// 26-09-30 사고: 비GET 만 abort 하던 하네스에서 e2e 가 <a download> HWPX 링크를 눌렀다. Chromium 은 다운로드를
//   다운로드 관리자가 따로 요청하므로 context.route 에도 request 이벤트에도 잡히지 않는다 → 개발 서버가 내보내기
//   라우트를 실행해 운영에 app_events(EXAM_EXPORT) 1행 · printCount 6→7 을 썼다. 게다가 GET 은 전부 통과였으므로
//   location.href · fetch · window.open 으로 부른 내보내기(GET)도 그대로 나갔다.
//
// 겹 셋(하나가 뚫려도 다음이 막는다) + 자가 시험:
//   ① 페이지 층(앱보다 먼저 설치) — 다운로드 · 내보내기로 가는 트리거를 **요청이 생기기 전에** 삼킨다:
//      Navigation API navigate(downloadRequest · 내보내기 목적지) 취소 · 캡처 단계 click/auxclick preventDefault ·
//      HTMLAnchorElement/HTMLAreaElement.prototype.click · dispatchEvent(떨어진 앵커는 이벤트가 window 에 안 온다) ·
//      window.open · form 제출. 삼킨 것은 net.swallowed 에 적는다. 다운로드 속성이 있는 앵커는 대상 무관 전부 삼킨다.
//   ② 네트워크 층(context.route) — /api/**/export* 경로는 메서드 무관 abort(fetch · 이동 · 팝업),
//      GET/HEAD 는 **기본 거부 + 명시 허용 목록**(get-policy.mjs — 26-09-30 COH-4 · GPE-3: GET /api/credits/balance 가
//      UPDATE credit_balances 를 하는 등 부작용 GET 25개 · 원장 화면 3개를 side-effect-sweep.mjs 가 찾았다),
//      서버 액션은 읽기 전용 **이름** 허용 목록만(고객 세션은 0), /api/track · collect abort.
//   ③ 경보 — 그래도 다운로드가 시작되면 취소하고 net.downloads 에 적는다(judgeWriteGuard → 실행 RED).
//      이 시점엔 요청이 이미 서버에 갔다. 예방이 아니라 「조용히 새지 않게」 하는 경보다.
//   자가 시험: `node scripts/exam-pagination/write-guard.mjs [--base http://localhost:3109]` (본체 write-guard-selftest.mjs)
//      가짜 로컬 서버(127.0.0.1 임의 포트)에 내보내기 트리거 9종 + 부작용 GET 트리거를 쏜다. 대조군(종전 규칙)은 서버에
//      닿아야 하고(구멍 재현), 가드 컨텍스트는 서버 도달 0 · 다운로드 0 이어야 한다. GET 정책은 정적 스윕 대조도 한다
//      (허용 목록 = 부작용 0 · 부작용 GET = 전부 막힘). **실제 내보내기 라우트는 어떤 경우에도 부르지 않는다.**
//   계기 음성테스트: PRINT_E2E_FAULT=no-download-guard(① 끔) · no-export-block(② 의 내보내기 차단 끔) ·
//      get-passthrough(GET 전부 통과 = 종전) · allow-side-effect-get(credits 를 허용 목록에) → 자가 시험 RED.
// ============================================================================
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { classifyGet } from "./get-policy.mjs";

/** 읽기 전용 서버 액션 허용 목록(파일 → 이름). 이름으로만 허용하고 ID 는 매니페스트에서 푼다. */
export const READ_ONLY_ACTIONS = Object.freeze({
  "src/actions/exams/crud.ts": ["getExamPreviewData", "getExam"],
  "src/actions/exam-paper-builder.ts": [
    "getExamPaperBuilderQuestionsPage",
    "getExamPaperBuilderQuestionPageOf",
    "getExamPaperBuilderQuestionSetsBySetIds",
    "getExamPaperBuilderSetMemberQuestionsByQuestionIds",
  ],
  "src/actions/question-sets.ts": ["getAcademyQuestionSetMemberMap"],
  "src/actions/workbench/collections-question.ts": ["getQuestionCollections", "getAcademyQuestionCollectionMembership"],
  "src/actions/platform-announcements.ts": ["getStaffHasNewAnnouncements"],
});
const MANIFESTS = [".next/dev/server/server-reference-manifest.json", ".next/server/server-reference-manifest.json"];

let actionIndex = null;
const missedIds = new Set();
function loadActionIndex() {
  const map = new Map();
  for (const file of MANIFESTS) {
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const [id, entry] of Object.entries(manifest.node ?? {})) {
      const w = Object.values(entry.workers ?? {})[0];
      if (w) map.set(id, { name: w.exportedName, file: w.filename });
    }
  }
  return map;
}
/** 서버 액션 ID → {name, file}. 모르는 ID 는 매니페스트를 한 번 다시 읽는다(새로 컴파일된 페이지). */
export function lookupAction(id) {
  if (!actionIndex || (!actionIndex.has(id) && !missedIds.has(id))) {
    actionIndex = loadActionIndex();
    if (!actionIndex.has(id)) missedIds.add(id);
  }
  return actionIndex.get(id) ?? null;
}
const isReadOnlyAction = (info, extra) =>
  !!info && ((READ_ONLY_ACTIONS[info.file] ?? []).includes(info.name) || extra.includes(info.name));

/** 내보내기 라우트 경로(pathname 기준): /api/exams/{id}/export-hwpx · export-docx · /api/questions/{id}/export-* 등 */
export const EXPORT_PATH_SOURCE = String.raw`^/api/(?:.*/)?export(?:-[\w-]+)?(?:/|$)`;
const EXPORT_PATH_RE = new RegExp(EXPORT_PATH_SOURCE, "i");
export function isExportUrl(url, base = "http://localhost/") {
  try { return EXPORT_PATH_RE.test(new URL(String(url), base).pathname); } catch { return false; }
}

/** 가드가 쓰는 요청 장부. 호출자가 필드를 더 붙여도 된다(print-harness 의 held · hung 등). */
export function newWriteNet() {
  return { allowed: [], blocked: [], telemetry: [], waiters: new Set(), swallowed: [], downloads: [], stubbed: [] };
}

// ── ① 페이지 층(앱보다 먼저 설치 — 직렬화되어 브라우저에서 돈다) ──────────────────────────────────
function pageWriteGuard({ exportSource, interceptDownloads }) {
  try { navigator.sendBeacon = () => true; } catch { /* 읽기 전용 엔진 */ }
  if (!interceptDownloads) return;
  const W = window;
  const EXPORT = new RegExp(exportSource, "i");
  const log = (W.__swallowedDownloads = []);
  const abs = (u) => { try { return new URL(String(u), location.href); } catch { return null; } };
  const isExport = (u) => { const x = u == null ? null : abs(u); return !!x && EXPORT.test(x.pathname); };
  const isLink = (n) => n instanceof HTMLAnchorElement || n instanceof HTMLAreaElement;
  const risky = (el) => isLink(el) && (el.hasAttribute("download") || isExport(el.href));
  const swallow = (how, url) => {
    const entry = { how, url: String(abs(url)?.href ?? url).slice(0, 200) };
    log.push(entry);
    try { W.__writeGuardReport?.(entry); } catch { /* 바인딩 없는 문서 */ }
  };
  try {
    W.navigation?.addEventListener("navigate", (e) => {
      const url = e.destination?.url ?? "";
      if ((e.downloadRequest != null || isExport(url)) && e.cancelable) {
        e.preventDefault();
        swallow(e.downloadRequest != null ? "navigate:download" : "navigate", url);
      }
    });
  } catch { /* Navigation API 미지원 — 아래 겹이 막는다 */ }
  const onClick = (e) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    const link = path.find(isLink) ?? null;
    if (risky(link)) { e.preventDefault(); swallow(e.type, link.href); }
  };
  W.addEventListener("click", onClick, true);
  W.addEventListener("auxclick", onClick, true);
  const nativeClick = HTMLElement.prototype.click;
  for (const proto of [HTMLAnchorElement.prototype, HTMLAreaElement.prototype]) {
    Object.defineProperty(proto, "click", {
      configurable: true,
      writable: true,
      value: function click() {
        if (risky(this)) return void swallow("anchor.click", this.href);
        return nativeClick.call(this);
      },
    });
  }
  const nativeDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
    if (event?.type === "click" && risky(this) && !this.isConnected) { swallow("dispatch", this.href); return false; }
    return nativeDispatch.call(this, event);
  };
  const nativeOpen = W.open;
  W.open = function open(url, ...rest) {
    if (isExport(url)) { swallow("window.open", url); return null; }
    return nativeOpen.call(W, url, ...rest);
  };
  W.addEventListener("submit", (e) => {
    const action = e.submitter?.formAction || e.target?.action;
    if (isExport(action)) { e.preventDefault(); swallow("submit", action); }
  }, true);
  const nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function submit() {
    if (isExport(this.action)) return void swallow("form.submit", this.action);
    return nativeSubmit.call(this);
  };
}

/** ① 페이지 층 + ③ 경보를 컨텍스트에 건다. 페이지를 만들기 전에 불러야 한다. */
export async function installDownloadGuard(context, net, { fault = process.env.PRINT_E2E_FAULT || null } = {}) {
  await context.exposeBinding("__writeGuardReport", (_source, entry) => { net.swallowed.push(entry); });
  await context.addInitScript(pageWriteGuard, {
    exportSource: EXPORT_PATH_SOURCE,
    interceptDownloads: fault !== "no-download-guard",
  });
  const watch = (page) => page.on("download", (download) => {
    net.downloads.push({ url: download.url().slice(0, 200), page: page.url().slice(0, 160) });
    download.cancel().catch(() => {});
  });
  context.pages().forEach(watch);
  context.on("page", watch);
}

/**
 * ② 네트워크 층 — context.route 핸들러 안에서 부른다(앞단에 호출자 고유의 결함 주입을 둘 수 있다).
 * appOrigin: 앱 원점(하네스의 --base). GET 정책은 이 원점에만 건다(다른 원점 = CDN 등은 우리 DB 와 무관).
 */
export function guardRoute(route, net, { allowRead = false, extraReadActions = [], denyActions = [], appOrigin = null, fault = process.env.PRINT_E2E_FAULT || null } = {}) {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  if (/\/api\/(track|collect)\b/.test(url)) {
    net.blocked.push({ kind: "analytics", url: url.slice(0, 120) });
    return route.abort();
  }
  if (fault !== "no-export-block" && isExportUrl(url)) {
    net.blocked.push({ kind: "export", method, url: url.slice(0, 200), navigation: req.isNavigationRequest() });
    return route.abort();
  }
  if (method === "GET" || method === "HEAD") {
    // 기본 거부 + 명시 허용 목록(get-policy.mjs). 부작용 GET 은 서버에 보내지 않는다 — 스텁은 로컬 대답,
    // 거부는 문서 이동이면 abort(이동 실패가 드러나게), 그 밖은 로컬 503(fetch 가 거부 대신 오류 응답을 받게).
    const verdict = classifyGet({ url, resourceType: req.resourceType(), appOrigin, fault });
    if (verdict.action === "stub") {
      net.stubbed.push({ route: verdict.route, url: url.slice(0, 160) });
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "x-write-guard": "stub" }, body: JSON.stringify(verdict.body) });
    }
    if (verdict.action === "deny") {
      net.blocked.push({ kind: "get-deny", method, why: verdict.kind, url: url.slice(0, 160) });
      if (verdict.kind === "page") return route.abort();
      return route.fulfill({ status: 503, contentType: "application/json", headers: { "x-write-guard": "deny" }, body: '{"error":"write-guard: GET blocked (not on the read-only allowlist)"}' });
    }
  }
  if (method === "GET" || method === "HEAD") return route.continue();
  const id = req.headers()["next-action"] ?? null;
  const info = id ? lookupAction(id) : null;
  const body = (req.postData() ?? "").slice(0, 800);
  if (allowRead && !denyActions.includes(info?.name) && isReadOnlyAction(info, extraReadActions)) {
    net.allowed.push({ name: info.name, body: body.slice(0, 120) });
    return route.continue();
  }
  net.blocked.push({ kind: info ? "action" : "non-get", method, name: info?.name ?? id, url: url.slice(0, 120), body });
  if (info?.name === "incrementExamPrintCount") {
    try { net.telemetry.push(JSON.parse(body)); } catch { net.telemetry.push(body); }
    for (const notify of net.waiters) notify();
  }
  return route.abort();
}

/** 실행 판정 — 다운로드가 한 건이라도 시작됐으면 RED(가드가 뚫렸다 = 서버에 요청이 갔다) */
export function judgeWriteGuard(net, fails) {
  if (net.downloads.length > 0) {
    fails.push(`다운로드 ${net.downloads.length}건 시작(쓰기 가드 뚫림 — 서버가 내보내기를 실행했을 수 있다): ${net.downloads.map((d) => d.url).join(" · ")}`);
  }
}

const pathOf = (u) => { try { return new URL(u).pathname.replace(/\/c[a-z0-9]{20,}/g, "/:id"); } catch { return String(u).slice(0, 80); } };
export function summarizeWriteGuard(net) {
  const count = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [key(r)]: (acc[key(r)] ?? 0) + 1 }), {});
  return {
    swallowed: count(net.swallowed, (r) => r.how),
    exportBlocked: net.blocked.filter((b) => b.kind === "export").length,
    getDenied: count(net.blocked.filter((b) => b.kind === "get-deny"), (r) => pathOf(r.url)),
    getStubbed: count(net.stubbed ?? [], (r) => r.route),
    downloads: net.downloads.length,
  };
}

// ── 자가 시험 — 본체는 write-guard-selftest.mjs(가짜 로컬 서버 · 정적 스윕 대조) ────────────────────
// top-level await 금지 — 자가 시험 모듈이 이 모듈을 다시 import 하므로, 이 모듈의 평가가 끝난 뒤에 이어 돌린다(순환 대기 방지).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  import("./write-guard-selftest.mjs")
    .then(({ selfTest }) => selfTest())
    .then((report) => process.exit(report.verdict === "GREEN" ? 0 : 1), (e) => { console.error("실행 오류:", e); process.exit(2); });
}
