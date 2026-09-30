// 시험지 인쇄 파이프라인 계약 (26-09-29 · docs/EXAM-PRINT-PIPELINE.md §5)
//
// 이스팀 사고(「1~3쪽만 인쇄」, 6/29~9/29 전 고객 백지 인쇄)의 원인과 9/19 가짜 GREEN 을 소스 계약으로
// 못박는다. 회귀하면 test:unit 에서 바로 빨갛게 뜬다.
//   C1 LazyPaperPage 는 렌더에서 `mounted || forceMount` 로 그린다(이펙트로 미루면 3쪽 이후 백지).
//   C2 시험지 영역의 window.print() 호출은 인쇄 컨트롤러 한 파일에만 있다.
//   C3 setTimeout 뒤에 인쇄를 부르는 패턴이 없다(시간 추측 인쇄 금지).
//   C4 목록 카드에 숨김 iframe · ?print=1 인쇄가 없다.
//   C5 usePrintPortal 은 두 비켜서기 판정을 그대로 갖고, 포털을 실제로 태운 뒤에만 전 쪽을 마운트하며,
//      호스트는 그 반환값을 forceMountAll 에 OR 한다.
//   C6 use-print-mount-all(판정 없는 전 쪽 마운트)은 파일도 참조도 없다.
//   C7 scripts/exam-pagination/*print*.mjs 는 인쇄 트리거와 PDF 사이에 시간 대기를 두지 않는다(합성 beforeprint 금지).
//   C8 인쇄 잡 · 컨트롤러에는 타이머가 없다(시간은 print-readiness 의 실패 상한 · 프레임 양보에만).
//   C9 usePrintPortal 판정 (3): 이번 beforeprint 사건에 선 포털이 있으면 · 첫 매칭이 내 루트가 아니면 비켜선다(두 시험지가
//      한 인쇄에). 지난 인쇄의 남은 호스트는 치우고 판정을 잇는다 · 인쇄 도중 언마운트는 cleanup 이 원복한다(26-09-30 R7) —
//      단 인쇄 레이아웃으로 그려지는 중이면 그 인쇄의 afterprint 로 미룬다(PH-R1 랜딩 네이티브 인쇄).
//   C10 useExamPrintController 를 쓰는 호스트는 그 forceMountAll 을 PreviewPages forceMountAll 에 OR 한다.
//   C11 컨트롤러: autoStart 래치는 rAF 콜백 안에서만(StrictMode 1회) · print() 반환 직후 정리 금지(afterprint 에서만).
//   C12 인쇄 잡은 첫 await 전에 남은 포털을 치우고(R7) · 컨트롤러는 잡 시작부터 인쇄 사건을 듣는다(준비 중 Ctrl+P — R5).
//   C13 검증 스크립트의 쓰기 가드(26-09-30 운영 쓰기 사고 — <a download> 가 context.route 를 우회): 페이지 층(다운로드 ·
//      내보내기 트리거를 요청 전에 삼킴) · 네트워크 층(내보내기 경로는 GET 통과보다 먼저 abort) · 하네스가 페이지 전에 건다 ·
//      클릭하는 스크립트는 가드를 건다 · clickToolbar 는 인쇄 항목만. 동작 증명은 write-guard.mjs 자가 시험(가짜 로컬 서버).
//   C14 인쇄 진입점(툴바 인쇄 · PDF · PDF 해설 · 빌더 모바일 바 · 상태 표시줄 [인쇄]/[다시 시도])은 누름(pointerdown · Enter/Space)
//      에서 무장한다 — click 전 「준비 중」 페인트(26-09-30 CC-2). 호스트는 printArming 을 넘기고, 무장은 busy(disabled)와
//      무관하며 해제에 타이머가 없다.
// 동작(수렴 전 인쇄 금지 · 차단 · 글꼴 · 넘침 보고 · 캐시 · 포털/컨트롤러 훅)은 exam-print-behavior.test.mjs 가 실제로 돌려 본다.
//
// 주석은 떼고 코드만 본다(설명 주석의 「window.print()」 같은 낱말이 걸리지 않게).
// 계기 음성테스트: EXAM_PRINT_CONTRACT_ROOT 로 저장소 사본을 가리키면 같은 단언을 그 사본에 건다
// (사본에 결함을 심어 RED 를 확인하는 용도 — 저장소 파일은 건드리지 않는다).
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.EXAM_PRINT_CONTRACT_ROOT
  ? path.resolve(process.env.EXAM_PRINT_CONTRACT_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const EXAM_SCOPE = [
  "src/components/exams",
  "src/app/(director)/director/exams",
  "src/app/(director)/director/korean/exams",
  "src/app/(director)/director/workbench/exams",
];
const CONTROLLER = "src/components/exams/paper-builder/print/use-exam-print-controller.ts";
const PRINT_JOB = "src/components/exams/paper-builder/print/exam-print-job.ts";
const PREVIEW_PAGES = "src/components/exams/exam-paper-builder-client-parts/preview-pages.tsx";
const PRINT_PORTAL = "src/components/exams/paper-builder/hooks/use-print-portal.ts";
const PORTAL_REGISTRY = "src/components/exams/paper-builder/print/print-portal-registry.ts";
const MOUNT_ALL = "src/components/exams/paper-builder/hooks/use-print-mount-all.ts";
const FILE_CARD = "src/components/exams/exam-file-card.tsx";
const SCRIPTS_DIR = "scripts/exam-pagination";
const WRITE_GUARD = "scripts/exam-pagination/write-guard.mjs";
const PRINT_HARNESS = "scripts/exam-pagination/print-harness.mjs";

const abs = (rel) => path.join(ROOT, rel);
const read = (rel) => readFileSync(abs(rel), "utf8");
const rel = (full) => path.relative(ROOT, full).split(path.sep).join("/");

function walk(dirRel, exts = [".ts", ".tsx", ".js", ".jsx", ".mjs"]) {
  const dir = abs(dirRel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && exts.some((x) => e.name.endsWith(x)))
    .map((e) => rel(path.join(e.parentPath ?? e.path, e.name)))
    .sort();
}

/** 주석을 공백으로 바꾼다(줄 수 보존). 문자열 · 템플릿 · 정규식 리터럴 안의 // 와 /* 는 건드리지 않는다. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let prev = ""; // 마지막 유효 문자 — 정규식 리터럴 판별용
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      // 따옴표 문자열은 한 줄을 넘지 않는다(JSX 본문의 아포스트로피가 여러 줄을 삼키지 않게)
      let j = i + 1;
      while (j < src.length && src[j] !== c && (c === "`" || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      prev = c;
      i = j + 1;
    } else if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev))) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== "\n" && (src[j] !== "/" || inClass)) {
        if (src[j] === "\\") j += 1;
        else if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        j += 1;
      }
      out += src.slice(i, j + 1);
      prev = "/";
      i = j + 1;
    } else {
      out += c;
      if (!/\s/.test(c)) prev = c;
      i += 1;
    }
  }
  return out;
}

const code = (relPath) => stripComments(read(relPath));
const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/** `name(` 의 괄호 짝이 맞는 인자 텍스트 */
function callArgs(src, openParenIndex) {
  let depth = 0;
  for (let j = openParenIndex; j < src.length; j += 1) {
    if (src[j] === "(") depth += 1;
    else if (src[j] === ")" && --depth === 0) return src.slice(openParenIndex + 1, j);
  }
  return src.slice(openParenIndex + 1);
}

test("C1 LazyPaperPage 는 렌더에서 mounted || forceMount 로 그린다(이펙트 마운트 금지)", () => {
  const src = code(PREVIEW_PAGES);
  const start = src.indexOf("function LazyPaperPage(");
  assert.ok(start >= 0, "LazyPaperPage 를 찾지 못했다");
  const next = src.slice(start + 1).search(/\n(?:export\s+)?function\s/);
  const body = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  assert.match(body, /const\s+visible\s*=\s*mounted\s*\|\|\s*forceMount\s*;/, "visible = mounted || forceMount 가 렌더에 없다");
  assert.match(body, /\{\s*visible\s*\?\s*children\(\)\s*:\s*null\s*\}/, "children 을 visible 로 그리지 않는다");
  assert.match(body, /data-exam-page-mounted=\{\s*visible\s*\?/, "data-exam-page-mounted 가 visible 을 드러내지 않는다");
  assert.match(src, /forceMount=\{[^}]*forceMountAll/, "PreviewPages 가 forceMountAll 을 LazyPaperPage 에 넘기지 않는다");
});

test("C2 시험지 영역의 window.print() 는 인쇄 컨트롤러 한 파일에만 있다", () => {
  const PRINT_CALL = /(?:\bwindow|\bglobalThis|\bself|\bcontentWindow|\btop|\bparent)\s*\??\.\s*print\s*\(/g;
  const hits = [];
  for (const dir of EXAM_SCOPE) {
    for (const file of walk(dir)) {
      const src = code(file);
      for (const m of src.matchAll(PRINT_CALL)) hits.push(`${file}:${lineOf(src, m.index)}`);
    }
  }
  assert.ok(existsSync(abs(CONTROLLER)), `${CONTROLLER} 가 없다`);
  assert.deepEqual(hits.map((h) => h.replace(/:\d+$/, "")), [CONTROLLER], `window.print( 호출 위치: ${hits.join(", ") || "없음"}`);
});

test("C3 setTimeout 뒤에 인쇄를 부르는 패턴이 없다(준비 판정에 시간 추측 금지)", () => {
  // 콜백 안에서 print( · xxxPrint( · printPlain( 등을 부르거나, 인쇄 함수를 그대로 넘기는 경우
  // (onAfterPrint · onBeforePrint 같은 인쇄 이벤트 정리 함수는 트리거가 아니다)
  const PRINT_INVOKE = /(?:\.\s*print\b|\bprint\s*\(|\b[a-z]\w*(?<!After|Before)Print\s*(?:\?\.)?\s*\(|\bprint(?:Plain|WithAnswers|Explanation)\s*\()/;
  const PRINT_REF = /^\s*[\w$.?]*(?:\bprint|Print)\s*$/;
  const hits = [];
  for (const dir of EXAM_SCOPE) {
    for (const file of walk(dir)) {
      const src = code(file);
      for (const m of src.matchAll(/\bsetTimeout\s*\(/g)) {
        const args = callArgs(src, m.index + m[0].length - 1);
        const first = args.split(/,(?![^(]*\))/)[0] ?? "";
        if (PRINT_INVOKE.test(args) || PRINT_REF.test(first)) hits.push(`${file}:${lineOf(src, m.index)}`);
      }
    }
  }
  assert.deepEqual(hits, [], `setTimeout → 인쇄: ${hits.join(", ")}`);
});

test("C4 목록 카드에 숨김 iframe · ?print=1 인쇄가 없다", () => {
  const src = code(FILE_CARD);
  assert.doesNotMatch(src, /<iframe\b|createElement\(\s*["'`]iframe/i, "exam-file-card 에 iframe 이 있다");
  assert.doesNotMatch(src, /[?&]print=1/, "exam-file-card 가 ?print=1 을 띄운다");
  assert.doesNotMatch(src, /contentWindow/, "exam-file-card 가 다른 창의 print 를 부른다");
});

test("C5 usePrintPortal: 두 비켜서기 판정 유지 · 포털을 태운 뒤에만 전 쪽 마운트 · 호스트가 OR", () => {
  const src = code(PRINT_PORTAL);
  assert.match(src, /FOREIGN_PRINT_ROOT_SELECTOR\s*=\s*["']\.par-root:not\(\.par-cover-preview\):not\(\.par-print-exclude\)["']/, "남의 인쇄 루트 선택자가 바뀌었다");
  assert.match(src, /HOST_PRINT_OPT_OUT_SELECTOR\s*=\s*["']\[data-exam-print-exclude='true'\]["']/, "호스트 명시 제외 선택자가 바뀌었다");
  const optOut = src.search(/if\s*\(\s*root\.closest\(\s*HOST_PRINT_OPT_OUT_SELECTOR\s*\)\s*\)\s*return/);
  const foreign = src.search(/if\s*\(\s*!root\.offsetParent\s*&&\s*document\.querySelector\(\s*FOREIGN_PRINT_ROOT_SELECTOR\s*\)\s*\)\s*\{?\s*return/);
  const portal = src.search(/document\.body\.appendChild\(\s*printHost\s*\)/);
  const mountAll = src.search(/flushSync\(\s*\(\)\s*=>\s*setPrintMountAll\(\s*true\s*\)\s*\)/);
  assert.ok(optOut >= 0, "판정 (1) data-exam-print-exclude 조기 반환이 없다");
  assert.ok(foreign >= 0, "판정 (2) !offsetParent && 남의 .par-root 조기 반환이 없다");
  assert.ok(portal >= 0 && mountAll >= 0, "포털 탑승 또는 전 쪽 마운트 flushSync 가 없다");
  assert.ok(optOut < portal && foreign < portal, "비켜서기 판정이 포털 탑승보다 뒤에 있다");
  assert.ok(portal < mountAll, "전 쪽 마운트가 포털 탑승보다 먼저다(비켜선 인쇄에서 헛마운트)");
  assert.match(src, /return\s+printMountAll\s*;/, "usePrintPortal 이 printMountAll 을 돌려주지 않는다");
  for (const file of walk("src/components/exams").filter((f) => f !== PRINT_PORTAL)) {
    const host = code(file);
    if (!/\busePrintPortal\s*\(/.test(host)) continue;
    const bound = host.match(/const\s+(\w+)\s*=\s*usePrintPortal\s*\(/);
    assert.ok(bound, `${file}: usePrintPortal 의 반환값(전 쪽 마운트)을 버린다`);
    assert.match(host, new RegExp(`forceMountAll=\\{[^}]*\\b${bound[1]}\\b`), `${file}: ${bound[1]} 을 forceMountAll 에 OR 하지 않는다`);
  }
});

test("C6 use-print-mount-all(판정 없는 전 쪽 마운트)은 파일도 참조도 없다", () => {
  assert.ok(!existsSync(abs(MOUNT_ALL)), `${MOUNT_ALL} 가 남아 있다`);
  const refs = [];
  for (const file of walk("src")) {
    const src = code(file);
    for (const m of src.matchAll(/\busePrintMountAll\b|use-print-mount-all/g)) refs.push(`${file}:${lineOf(src, m.index)}`);
  }
  assert.deepEqual(refs, [], `참조: ${refs.join(", ")}`);
});

test("C7 인쇄 검증 스크립트는 인쇄 트리거와 PDF 사이에 시간 대기를 두지 않는다", () => {
  const files = walk(SCRIPTS_DIR, [".mjs"]).filter((f) => /print[^/]*\.mjs$/.test(f));
  for (const must of ["paper-print-check.mjs", "print-e2e.mjs"]) {
    assert.ok(files.some((f) => f.endsWith(`/${must}`)), `${SCRIPTS_DIR}/${must} 가 없다`);
  }
  const SYNTHETIC = /dispatchEvent\(\s*new\s+Event\(\s*["'`](?:before|after)print/;
  // 「인쇄 준비 사건」(printReady · waitPrintCall)부터 인쇄 트리거 · PDF 까지가 금지 구간이다 — 그 사이의 대기가
  // 곧 9/19 가짜 GREEN(기다리는 동안 이펙트가 나머지 쪽을 그려 줌)이다. 화면 준비 조작은 그 앞에만 둔다.
  const TRIGGER = /beforeprint|afterprint|emulateMedia\(|\.print\s*\(|__printCalls|printReady\(|waitPrintCall\(|enginePrint\(|\.pdf\s*\(/g;
  const SLEEP = /\bwaitForTimeout\s*\(|new\s+Promise\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*setTimeout\(\s*\1\s*,/g;
  for (const file of files) {
    // import 문(가져온 이름에 print 가 들어 있어도 트리거가 아니다)은 줄 수를 보존한 채 지운다
    const src = code(file).replace(/^\s*import\b[\s\S]*?\bfrom\s*["'][^"'\n]+["']\s*;?/gm, (m) => m.replace(/[^\n]/g, " "));
    assert.doesNotMatch(src, SYNTHETIC, `${file}: 합성 beforeprint/afterprint 를 쏜다(엔진이 쏘게 page.pdf 로 직행할 것)`);
    const first = src.search(TRIGGER);
    if (first === -1) continue;
    const sleeps = [...src.slice(first).matchAll(SLEEP)].map((m) => lineOf(src, first + m.index));
    assert.deepEqual(sleeps, [], `${file}: 인쇄 트리거(${lineOf(src, first)}행) 뒤 시간 대기 ${sleeps.join(", ")}행`);
  }
});

test("C13 검증 스크립트의 쓰기 가드 — 다운로드 · 내보내기는 요청 전에 삼키고, 내보내기 경로는 메서드 무관 abort", () => {
  const guard = code(WRITE_GUARD);
  // 페이지 층: Navigation API(다운로드 · 내보내기 목적지) · 캡처 단계 click · 앵커 click() · 떨어진 앵커 dispatchEvent · window.open · 폼
  assert.match(guard, /navigation\?\.addEventListener\(\s*["']navigate["'][\s\S]{0,200}downloadRequest/, "페이지 층에 Navigation API navigate(downloadRequest) 취소가 없다");
  assert.match(guard, /addEventListener\(\s*["']click["']\s*,\s*onClick\s*,\s*true\s*\)/, "페이지 층에 캡처 단계 click 가로채기가 없다");
  assert.match(guard, /HTMLAnchorElement\.prototype/, "페이지 층이 앵커 click() 을 가로채지 않는다(떨어진 앵커 · 앱의 triggerHwpxDownload 모양)");
  assert.match(guard, /EventTarget\.prototype\.dispatchEvent\s*=/, "페이지 층이 떨어진 앵커의 dispatchEvent 를 가로채지 않는다");
  assert.match(guard, /hasAttribute\(\s*["']download["']\s*\)/, "다운로드 속성 앵커를 대상 무관하게 막지 않는다");
  // 네트워크 층: 내보내기 경로 abort 가 GET/HEAD 통과보다 앞(뒤면 GET 내보내기가 그대로 나간다)
  const route = guard.slice(guard.search(/export\s+function\s+guardRoute\s*\(/));
  const exportBlock = route.search(/isExportUrl\(\s*url\s*\)\s*\)\s*\{[\s\S]{0,200}route\.abort\(\)/);
  const getPass = route.search(/method\s*===\s*["']GET["'][\s\S]{0,40}route\.continue\(\)/);
  assert.ok(exportBlock >= 0 && getPass >= 0, "guardRoute 의 내보내기 abort 또는 GET 통과를 찾지 못했다");
  assert.ok(exportBlock < getPass, "내보내기 경로 abort 가 GET 통과보다 뒤다(location.href · fetch · window.open 내보내기가 나간다)");
  assert.match(guard, /EXPORT_PATH_SOURCE\s*=\s*String\.raw`\^\/api\//, "내보내기 경로 정규식이 /api/ pathname 기준이 아니다");
  // 하네스: 페이지를 만들기 전에 가드를 걸고, route 는 guardRoute 로 끝난다
  const harness = code(PRINT_HARNESS);
  const openStart = harness.search(/export\s+async\s+function\s+openGuardedContext\s*\(/);
  assert.ok(openStart >= 0, "openGuardedContext 를 찾지 못했다");
  const open = harness.slice(openStart, harness.indexOf("\n}\n", openStart) + 2);
  const install = open.search(/await\s+installDownloadGuard\(\s*context\s*,/);
  assert.doesNotMatch(open, /route\.continue\(/, "하네스 route 가 guardRoute 를 거치지 않고 요청을 통과시킨다");
  assert.ok(install >= 0, "openGuardedContext 가 installDownloadGuard 를 걸지 않는다");
  assert.ok(install < open.search(/context\.route\(/) && install < open.search(/addInitScript\(\s*instrument/), "가드가 route · 계측보다 늦게 걸린다");
  assert.match(open, /return\s+guardRoute\(\s*route\s*,\s*net\s*,/, "하네스 route 가 guardRoute 로 끝나지 않는다(자체 GET 통과 규칙 부활)");
  assert.match(harness, /PRINT_TOOLBAR_ITEMS\s*=\s*new\s+Set\(\s*\[\s*["']인쇄["']\s*,\s*["']PDF["']\s*,\s*["']PDF 해설["']\s*\]\s*\)/, "clickToolbar 허용 목록이 인쇄 항목만이 아니다");
  assert.match(harness, /if\s*\(\s*!PRINT_TOOLBAR_ITEMS\.has\(\s*text\s*\)\s*\)\s*throw/, "clickToolbar 가 인쇄 항목 밖(HWPX · DOCX)을 거부하지 않는다");
  // 브라우저 컨텍스트를 열어 클릭하는 스크립트 · 인쇄 · 스윕 스크립트는 가드를 건다(직접 또는 openGuardedContext)
  for (const file of walk(SCRIPTS_DIR, [".mjs"])) {
    const src = code(file);
    const opensBrowser = /\.newContext\s*\(/.test(src) || /\bopenGuardedContext\s*\(/.test(src);
    if (!opensBrowser) continue;
    const mustGuard = /\.click\s*\(|\bclickToolbar\s*\(/.test(src) || /(?:print|sweep)[^/]*\.mjs$/.test(file);
    if (!mustGuard) continue;
    assert.match(src, /\binstallDownloadGuard\s*\(|\bopenGuardedContext\s*\(/, `${file}: 쓰기 가드 없이 브라우저 컨텍스트를 연다`);
  }
  for (const file of ["scripts/exam-pagination/print-e2e.mjs", "scripts/exam-pagination/paper-print-check.mjs", "scripts/exam-pagination/paper-sweep.mjs"]) {
    assert.match(code(file), /\bjudgeWriteGuard\s*\(/, `${file}: 다운로드 경보(judgeWriteGuard)를 판정에 넣지 않는다`);
  }
});

test("C8 인쇄 잡 · 컨트롤러에는 타이머 대기가 없다(시간 추측 금지 — 상한은 print-readiness 에만)", () => {
  const TIMER = /\b(?:setTimeout|setInterval)\s*\(|\bwaitForTimeout\s*\(|\bsleep\s*\(/g;
  for (const file of [PRINT_JOB, CONTROLLER]) {
    const src = code(file);
    const hits = [...src.matchAll(TIMER)].map((m) => `${file}:${lineOf(src, m.index)}`);
    assert.deepEqual(hits, [], `타이머: ${hits.join(", ")}`);
  }
});

test("C9 usePrintPortal 판정 (3): 이번 사건에 선 포털이 있거나 첫 매칭이 내 루트가 아니면 비켜선다 · 남은 포털은 치운다 · 언마운트 원복", () => {
  const src = code(PRINT_PORTAL);
  const portal = src.search(/document\.body\.appendChild\(\s*printHost\s*\)/);
  // (0)+(3) 앞 절반: 같은 beforeprint 사건에 선 포털이면 비켜서고, 그 밖의 남은 호스트는 치운 뒤 판정을 잇는다(26-09-30 R7).
  // 종전 「호스트가 있기만 하면 비켜선다」는 남은 호스트 하나로 이후 모든 포털을 영구히 막았다.
  const samePrint = src.search(/if\s*\(\s*settleStalePrintPortal\(\s*document\s*,\s*event\s*\)\s*===\s*["']same-print["']\s*\)\s*return\s*;/);
  const notMine = src.search(/if\s*\(\s*rootRef\s*&&\s*rootRef\.current\s*!==\s*root\s*\)\s*return\s*;/);
  const rootLookup = src.search(/const\s+root\s*=\s*document\.getElementById\(\s*["']exam-paper-print-root["']\s*\)/);
  assert.ok(samePrint >= 0, "판정 (3) 「이번 사건에 선 포털이면 비켜서고 남은 포털은 치운다」(settleStalePrintPortal(document, event))가 없다");
  assert.doesNotMatch(src, /if\s*\(\s*document\.getElementById\(\s*["']exam-print-host["']\s*\)\s*\)\s*return/, "호스트가 있기만 하면 비켜서는 종전 판정이 남았다(남은 호스트가 모든 포털을 영구히 막는다)");
  assert.ok(notMine >= 0, "판정 (3) 「rootRef 가 첫 매칭 루트가 아니면 비켜선다」가 없다");
  assert.ok(samePrint < rootLookup, "남은 포털 치우기가 첫 매칭 조회보다 뒤다(치운 루트가 제자리로 돌아오기 전의 첫 매칭을 본다)");
  assert.ok(samePrint < portal && notMine < portal, "판정 (3) 이 포털 탑승보다 뒤에 있다");
  const claim = src.search(/claimPrintPortal\(\s*\{\s*host:\s*printHost\s*,\s*event\s*,\s*release:\s*afterPrint\s*\}\s*\)/);
  assert.ok(claim > portal, "포털을 세운 뒤 이번 사건 · 원복 함수로 기록(claimPrintPortal)하지 않는다");
  const restore = src.slice(src.search(/function\s+afterPrint\s*\(/));
  assert.match(restore, /portaledRoot\s*\?\?/, "afterprint 가 자기가 옮긴 루트(portaledRoot)가 아니라 첫 매칭을 되돌린다");
  assert.match(restore, /dropPrintPortalClaim\(\s*printHost\s*\)/, "afterprint 가 포털 기록을 지우지 않는다");
  const cleanup = src.slice(src.search(/window\.removeEventListener\(\s*["']afterprint["']\s*,\s*afterPrint\s*\)/));
  const mineGuard = cleanup.search(/if\s*\(\s*!portaledRoot\s*&&\s*!printHost\s*\)\s*return\s*;/);
  const layoutBranch = cleanup.search(/if\s*\(\s*isPrintLayoutActive\(\s*window\s*\)\s*\)\s*\{/);
  // cleanup 의 마지막 문(이펙트 의존성 배열 바로 앞)이 즉시 원복이어야 한다 — 미룬 원복 함수 안의 afterPrint() 와 가른다.
  const immediate = cleanup.search(/\n\s*afterPrint\(\s*\)\s*;\s*\n\s*\};\s*\n\s*\},\s*\[\s*paperSize\s*,\s*rootRef\s*\]\s*\)/);
  assert.ok(mineGuard >= 0, "이펙트 cleanup 이 「내 포털이 서 있을 때만」 원복하지 않는다(남의 인쇄 중 body 클래스를 지운다)");
  assert.ok(immediate > mineGuard, "이펙트 cleanup 이 인쇄 도중 언마운트 때 원복하지 않는다(루트 · 호스트 · body 클래스 누수 — R7)");
  // PH-R1: 인쇄 레이아웃으로 그려지는 중(네이티브 인쇄 캡처 중 폭 질의로 랜딩 데모가 빠짐)이면 그 인쇄의 afterprint 로 미룬다.
  assert.ok(layoutBranch > mineGuard && layoutBranch < immediate, "인쇄 레이아웃 도중 언마운트를 즉시 원복한다 — 캡처 전에 포털이 사라진다(PH-R1)");
  const deferred = cleanup.slice(layoutBranch, immediate);
  assert.match(deferred, /window\.addEventListener\(\s*["']afterprint["']/, "미룬 원복이 그 인쇄의 afterprint 에 걸리지 않는다");
  assert.match(deferred, /claimPrintPortal\(/, "미룬 원복을 포털 기록에 다시 걸지 않는다 — afterprint 누락 시 다음 인쇄 · 잡이 미룬 리스너를 못 뗀다");
  assert.match(deferred, /\breturn\s*;/, "인쇄 레이아웃 도중에도 즉시 원복까지 한다");
  const registry = code(PORTAL_REGISTRY);
  assert.match(registry, /if\s*\(\s*event\s*!==\s*null\s*&&\s*claim\.event\s*===\s*event\s*\)\s*return\s*["']same-print["']/, "「이번 인쇄」 판정이 beforeprint 사건 동일성이 아니다(두 시험지가 한 인쇄에 · 또는 영구 비켜섬)");
  assert.match(registry, /matchMedia\(\s*["']print["']\s*\)\.matches/, "「인쇄 레이아웃으로 그려지는 중」 판정이 matchMedia(\"print\") 가 아니다(PH-R1)");
});

test("C12 인쇄 잡은 시작할 때 남은 포털을 치우고, 컨트롤러는 잡 시작부터 인쇄 사건을 듣는다(준비 중 네이티브 인쇄)", () => {
  const job = code(PRINT_JOB);
  const heal = job.search(/settleStalePrintPortal\(\s*doc\s*,\s*null\s*\)/);
  // 잡 본문 1단계(글꼴 판정) — 그 앞에는 await 가 없다(도우미 정의만). 치우기는 그보다 앞, 즉 첫 양보 전이다.
  const fontsStep = job.search(/if\s*\(\s*!examFontsReady\(\s*doc\s*\)\s*\)/);
  assert.ok(heal >= 0, "인쇄 잡이 남은 포털(#exam-print-host 잔재)을 치우지 않는다 — 옛 루트가 첫 매칭이 되어 차단된다");
  assert.ok(fontsStep > 0 && heal < fontsStep, "남은 포털 치우기가 글꼴 단계(첫 양보) 뒤에 있다(빠른 경로의 클릭 태스크 밖)");
  const ctl = code(CONTROLLER);
  const start = ctl.indexOf("const start = useCallback(");
  const startBody = ctl.slice(start, ctl.indexOf("const print = useCallback(", start));
  assert.match(startBody, /watchPrintEvents\(\s*job\s*\)/, "잡이 시작부터 beforeprint 를 듣지 않는다 — 준비 중 Ctrl+P 뒤 두 번째 인쇄 창(PRINT-R5)");
  assert.ok(startBody.search(/watchPrintEvents\(\s*job\s*\)/) < startBody.search(/runExamPrintJob\(/), "인쇄 사건 리스너가 잡 실행보다 늦게 붙는다");
  assert.match(startBody, /job\.stage\s*===\s*["']native["']/, "준비 중 네이티브 인쇄가 잡을 멈추지 않는다(isDead)");
});

test("C10 useExamPrintController 를 쓰는 호스트는 그 forceMountAll 을 PreviewPages 에 OR 한다", () => {
  let hosts = 0;
  for (const file of walk("src/components/exams")) {
    const host = code(file);
    const bound = host.match(/const\s+(\w+)\s*=\s*useExamPrintController\s*\(/);
    if (!bound) continue;
    hosts += 1;
    const or = new RegExp(`forceMountAll=\\{[^}]*\\b${bound[1]}\\.forceMountAll\\b`);
    assert.match(host, or, `${file}: ${bound[1]}.forceMountAll 을 forceMountAll 에 OR 하지 않는다(버튼 인쇄가 전부 blocked)`);
  }
  assert.ok(hosts >= 2, `useExamPrintController 호스트 ${hosts}곳(상세 · 빌더 기대)`);
});

test("C11 컨트롤러: autoStart 래치는 rAF 콜백 안에서만 · print() 반환 직후 정리 금지", () => {
  const src = code(CONTROLLER);
  const raf = src.search(/requestAnimationFrame\s*\(/);
  assert.ok(raf >= 0, "autoStart 가 rAF 로 예약되지 않는다");
  const latches = [...src.matchAll(/autoLatchRef\.current\s*=\s*true/g)].map((m) => m.index);
  assert.equal(latches.length, 1, `autoStart 래치 ${latches.length}곳`);
  assert.ok(latches[0] > raf, "autoStart 래치가 rAF 콜백 밖(이펙트 본문)에 있다 — StrictMode 에서 0회 또는 2회 인쇄");
  const call = src.search(/window\.print\s*\(\s*\)\s*;/);
  const invokeEnd = src.indexOf("const start = useCallback(", call);
  assert.ok(call >= 0 && invokeEnd > call, "invokePrint 구조를 찾지 못했다");
  assert.doesNotMatch(src.slice(call, invokeEnd), /\bendJob\s*\(/, "print() 반환 직후 정리한다(모바일 비차단 print 에서 인쇄 전 원복)");
});

test("C14 인쇄 진입점은 누름에서 무장한다(click 전 「준비 중」 페인트) · 무장은 버튼을 막지 않고 해제에 타이머가 없다", () => {
  const ARMING = "src/components/exams/paper-builder/print/print-arming.ts";
  const TOOLBAR = "src/components/exams/exam-paper-builder-client-parts/preview-toolbar.tsx";
  const BAR = "src/components/exams/paper-builder/print/print-status-bar.tsx";
  const BUILDER = "src/components/exams/exam-paper-builder-client.tsx";
  assert.ok(existsSync(abs(ARMING)), `${ARMING} 가 없다`);
  assert.doesNotMatch(code(ARMING), /\b(?:setTimeout|setInterval)\s*\(/, "누름 무장 해제에 타이머(시간 추측)가 있다");
  /** onClick 을 가진 <button …> 여는 태그(전부) 안에 무장 핸들러가 있는가. 그런 버튼이 없으면 null */
  const armedButton = (src, onClick) => {
    const tags = [];
    for (let at = src.indexOf(onClick); at >= 0; at = src.indexOf(onClick, at + 1)) {
      const open = src.lastIndexOf("<button", at);
      const close = src.slice(at).search(/\n\s*>|(?<![=\s-])>/);
      tags.push(src.slice(open, at + (close < 0 ? 400 : close)));
    }
    if (tags.length === 0) return null;
    return tags.every((tag) => /\b(?:armFor|printArmHandlers)\s*\(|\{\.\.\.retryProps\}/.test(tag));
  };
  const toolbar = code(TOOLBAR);
  for (const onClick of ["onClick={onPrint}", "runDownload(onPrint)", "runDownload(downloadPdf)", "runDownload(onDownloadPdfWithAnswers)"]) {
    assert.equal(armedButton(toolbar, onClick), true, `툴바 ${onClick} 버튼이 누름에서 무장하지 않는다`);
  }
  // 무장은 disabled 를 켜지 않는다 — 켜면 뒤따를 click 이 사라져 인쇄가 안 된다
  assert.match(toolbar, /const\s+printDisabled\s*=\s*actionDisabled\s*\|\|\s*printBusy\s*;/, "인쇄 버튼 disabled 가 printBusy 밖의 것(무장)에 묶였다");
  const ctl = code(CONTROLLER);
  assert.match(ctl, /busy:\s*state\.phase\s*===\s*["']preparing["']\s*\|\|\s*state\.phase\s*===\s*["']printing["']\s*,/, "컨트롤러 busy 가 무장까지 센다(버튼 disabled → click 유실)");
  const bar = code(BAR);
  assert.equal(armedButton(bar, "onClick={() => print(mode)}"), true, "상태 표시줄 [인쇄] · [다시 시도] 가 누름에서 무장하지 않는다");
  assert.equal(armedButton(code(BUILDER), "onClick={printPlain}"), true, "빌더 모바일 바 [인쇄] 가 누름에서 무장하지 않는다");
  // PreviewToolbar 에 인쇄를 넘기는 호스트는 무장도 넘긴다
  for (const file of walk("src/components/exams")) {
    const host = code(file);
    const bound = host.match(/const\s+(\w+)\s*=\s*useExamPrintController\s*\(/);
    if (!bound || !/<PreviewToolbar\b/.test(host)) continue;
    assert.match(host, new RegExp(`printArming=\\{\\s*${bound[1]}\\.arming\\s*\\}`), `${file}: PreviewToolbar 에 printArming 을 넘기지 않는다`);
  }
});
