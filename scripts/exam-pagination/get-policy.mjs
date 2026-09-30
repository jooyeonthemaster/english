// ============================================================================
// 쓰기 가드 GET 정책(순수 — 브라우저 · DB 무의존). write-guard.mjs 의 네트워크 층이 GET/HEAD 마다 부른다.
//
// 26-09-30 COH-4 · GPE-3: 종전 가드는 「GET/HEAD 는 읽기」라고 믿고 전부 통과시켰다. 그런데 모든 원장 화면이 부르는
//   GET /api/credits/balance 는 getCreditSummary → sweepExpiredCredits 로 UPDATE credit_balances(+ INSERT
//   credit_transactions)를 조건부로 실행한다 — 만료된 학원 화면을 여는 것만으로 운영에 쓴다.
//   그래서 앱 원점(appOrigin)의 GET 은 **기본 거부**, 통과는 아래 명시 허용 목록만이다:
//     · 정적 자산       /_next/ · /__nextjs* · public/ 에 실제로 있는 파일(서버 코드가 돌지 않는다)
//     · 읽기 전용 화면  READ_ONLY_PAGES — 하네스가 여는 화면만(문서 · RSC 요청). 화면 · 레이아웃 · proxy 가 쓰지 않음을
//                       side-effect-sweep.mjs 가 증명한다(자가 시험이 매번 다시 증명).
//     · 읽기 전용 GET   READ_ONLY_GETS — route.ts GET 중 쓰기가 닿지 않음이 증명된 것만
//     · 로컬 스텁       GET_STUBS — 화면이 부르지만 부작용이 있거나(credits) 클릭을 막는(배너) GET 은 서버에 보내지 않고
//                       여기서 대답한다
//   그 밖(목록 밖 API · route.ts · 화면 · 메타데이터 경로)은 서버에 보내지 않는다 — 문서 이동은 abort, 나머지는 로컬 503.
//   다른 원점(CDN 글꼴 등)은 우리 DB 에 닿지 않으므로 통과. 허용 목록을 늘리려면 여기에 적고 자가 시험
//   (node scripts/exam-pagination/write-guard.mjs)으로 스윕 증명을 받는다 — 실행 중에 목록을 넓히는 옵션은 없다.
// 계기 결함: PRINT_E2E_FAULT=get-passthrough(종전 규칙 = GET 전부 통과) · allow-side-effect-get(credits 를 읽기 전용
//   목록에 넣음) → 자가 시험 RED.
// ============================================================================
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/** 하네스가 여는 화면(page.tsx). 이 화면 · 조상 레이아웃 · src/proxy.ts 에서 쓰기가 닿지 않음이 스윕으로 증명돼야 한다. */
export const READ_ONLY_PAGES = Object.freeze({
  "src/app/(auth)/login/page.tsx": "write-guard 자가 시험 live 다리 · 세션 없는 문서",
  "src/app/(director)/director/exams/page.tsx": "print-e2e dialog · timing(목록 카드 인쇄)",
  "src/app/(director)/director/exams/[examId]/page.tsx": "print-e2e native · button · deeplink · paper-print-check --url",
  "src/app/(director)/director/workbench/exams/[examId]/edit/page.tsx": "print-e2e button --surface builder · force-per-page",
  "src/app/(director)/director/dev/paper-overflow/page.tsx": "paper-sweep(개발 전용 렌더 화면)",
  "src/app/(director)/director/studio/page.tsx": "paper-print-check <classId>(스튜디오 조판)",
});

/** 쓰기가 닿지 않음이 증명된 route.ts GET — 원장 화면 셸이 부른다(막아도 인쇄는 되지만 화면 오류를 줄인다). */
/** paths 가 있으면 파일 경로 정규식 대신 그 경로만 받는다(모든 경로를 받는 catch-all 이 형제 route 를 덮지 않게). */
export const READ_ONLY_GETS = Object.freeze({
  "src/app/api/auth/[...nextauth]/route.ts": {
    reason: "useSession · csrf — GET 은 jwt/session 콜백(읽기)만. authorize()(쓰기)는 POST 로그인에서만 돈다(스윕 SKIP_SUBTREES)",
    paths: ["/api/auth/session", "/api/auth/csrf", "/api/auth/providers"],
  },
  "src/app/api/notifications/summary/route.ts": { reason: "원장 셸 알림 배지 폴링" },
  "src/app/api/analytics/config/route.ts": { reason: "원장 셸 분석 설정(수집 요청 /api/track · collect 는 따로 abort)" },
});

/** 서버에 보내지 않고 로컬에서 대답하는 GET. reason 은 왜 막는지(부작용 · UX). */
export const GET_STUBS = Object.freeze({
  "src/app/api/credits/balance/route.ts": {
    reason: "부작용 GET — getCreditSummary → sweepExpiredCredits(UPDATE credit_balances · INSERT credit_transactions)",
    body: { balance: 9999, monthlyAllocation: 0, bonusCredits: 0, totalConsumed: 0, totalAllocated: 9999, isLow: false, threshold: 50, expiresAt: null },
  },
  "src/app/api/site-banners/route.ts": {
    reason: "공지 배너 모달이 클릭을 가로막는다(UX) — 빈 목록",
    body: { banners: [] },
  },
});

/** 서버 코드가 돌지 않는 경로 접두(Next 번들 · 개발 오버레이) */
export const STATIC_PREFIXES = Object.freeze(["/_next/", "/__nextjs"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// ── route 파일 → URL 정규식 ─────────────────────────────────────────────────────────────
/** src/app/…/(page|route|메타데이터).tsx 경로 → URL 세그먼트 목록(경로 그룹 · 병렬 슬롯 제거) */
export function routeSegments(file) {
  const rel = file.replace(/\\/g, "/").replace(/^src\/app\/?/, "");
  const parts = rel.split("/");
  parts.pop(); // page.tsx · route.ts
  return parts.filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@"));
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** URL pathname 정규식 원문. [x] → 한 세그먼트, [...x] → 하나 이상, [[...x]] → 0개 이상 */
export function routePatternSource(file) {
  const body = routeSegments(file)
    .map((s) => (/^\[\[\.\.\..+\]\]$/.test(s) ? "(?:/.*)?" : /^\[\.\.\..+\]$/.test(s) ? "/.+" : /^\[.+\]$/.test(s) ? "/[^/]+" : `/${escapeRe(s)}`))
    .join("");
  return `^${body || "/"}/?$`;
}
/** 시험용 표본 경로 — 동적 세그먼트에 값을 채운다 */
export function samplePath(file) {
  const segs = routeSegments(file).map((s) => (/^\[\[?\.\.\./.test(s) ? "sample/a" : /^\[.+\]$/.test(s) ? "sample-id" : s));
  return `/${segs.join("/")}`;
}
/** 표 항목이 받는 URL 정규식 원문 — paths 가 있으면 그 경로만, 없으면 파일 경로에서 */
export function entryPatternSource(file, entry) {
  const paths = entry && typeof entry === "object" && Array.isArray(entry.paths) ? entry.paths : null;
  return paths ? `^(?:${paths.map(escapeRe).join("|")})/?$` : routePatternSource(file);
}
const compile = (table) => Object.entries(table).map(([file, entry]) => ({ file, re: new RegExp(entryPatternSource(file, entry)) }));

/** 결함 주입을 반영한 실제 정책 표(자가 시험 · 스윕 대조가 같은 표를 본다) */
export function effectiveGetPolicy(fault = null) {
  const gets = { ...READ_ONLY_GETS };
  const stubs = { ...GET_STUBS };
  if (fault === "allow-side-effect-get") {
    // 결함: 부작용 GET(credits)을 스텁 대신 읽기 전용 목록에 올린다 → 스윕 대조 · live 다리 RED
    gets["src/app/api/credits/balance/route.ts"] = { reason: "FAULT allow-side-effect-get" };
    delete stubs["src/app/api/credits/balance/route.ts"];
  }
  return { pages: { ...READ_ONLY_PAGES }, gets, stubs };
}

const compiledCache = new Map();
function compiled(fault) {
  const key = fault ?? "";
  if (!compiledCache.has(key)) {
    const p = effectiveGetPolicy(fault);
    compiledCache.set(key, { pages: compile(p.pages), gets: compile(p.gets), stubs: compile(p.stubs), stubTable: p.stubs });
  }
  return compiledCache.get(key);
}

const publicCache = new Map();
/** public/ 에 실제로 있는 파일인가(저장소 루트 = cwd 기준). 서버 코드가 돌지 않는 정적 응답이다. */
export function isPublicFile(pathname, root = process.cwd()) {
  if (publicCache.has(pathname)) return publicCache.get(pathname);
  let ok = false;
  try {
    const decoded = decodeURIComponent(pathname);
    const publicDir = path.join(root, "public");
    const abs = path.normalize(path.join(publicDir, decoded));
    ok = abs.startsWith(publicDir + path.sep) && existsSync(abs) && statSync(abs).isFile();
  } catch { ok = false; }
  publicCache.set(pathname, ok);
  return ok;
}

/**
 * GET/HEAD 요청 하나의 판정. 반환 action: "continue"(서버로) · "stub"(로컬 대답 — body) · "deny"(서버에 보내지 않음).
 *  정책을 거는 원점: appOrigin + 모든 로컬 호스트(localhost · 127.0.0.1 · ::1).
 */
export function classifyGet({ url, resourceType = null, appOrigin = null, fault = null }) {
  let u;
  try { u = new URL(String(url)); } catch { return { action: "deny", kind: "bad-url" }; }
  if (!/^https?:$/.test(u.protocol)) return { action: "continue", kind: "non-http" };
  // 앱 = appOrigin 이거나 **어떤 로컬 호스트든**(base 가 127.0.0.1 인데 앱이 AUTH_URL 의 localhost 로 보내는 경우 등 —
  // 다른 별칭으로 새지 않게). 다른 원점(CDN 글꼴 등)만 통과.
  let app = LOCAL_HOSTS.has(u.hostname);
  try { app = app || (!!appOrigin && u.origin === new URL(appOrigin).origin); } catch { /* 잘못된 appOrigin — 로컬 판정만 */ }
  if (!app) return { action: "continue", kind: "cross-origin" };
  if (fault === "get-passthrough") return { action: "continue", kind: "fault-get-passthrough" };
  const p = u.pathname;
  if (STATIC_PREFIXES.some((pre) => p.startsWith(pre))) return { action: "continue", kind: "static" };
  if (isPublicFile(p)) return { action: "continue", kind: "public" };
  const c = compiled(fault);
  const hit = (list) => list.find((x) => x.re.test(p))?.file ?? null;
  const stub = hit(c.stubs);
  if (stub) return { action: "stub", kind: "stub", route: stub, body: c.stubTable[stub].body };
  const get = hit(c.gets);
  if (get) return { action: "continue", kind: "read-only-get", route: get };
  const page = hit(c.pages);
  if (page) return { action: "continue", kind: "read-only-page", route: page };
  return { action: "deny", kind: resourceType === "document" ? "page" : p.startsWith("/api/") ? "api" : "other" };
}
