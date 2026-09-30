// 인쇄 검증(헤드리스) — 실제 조판 화면을 **실제 인쇄 엔진(page.pdf)** 으로 인쇄해
//   ① 스크롤하지 않은 쪽도 인쇄에 실리는지 — PDF 쪽마다 글자가 있는지 · 「인쇄 준비가 끝나지 않았습니다」 경고 쪽 0
//   ② PDF 쪽수가 인쇄된 프레임 수와 같은지
//   ③ 인쇄된 DOM 이 칸을 넘치지 않는지(afterprint 순간 = 인쇄된 DOM 그대로 잰다)
// 를 본다.
//   node scripts/exam-pagination/paper-print-check.mjs <classId> [pickCount]        클래스 스튜디오 시험지 조판
//   node scripts/exam-pagination/paper-print-check.mjs --url director/exams/<id>     시험지 루트가 있는 아무 화면
//     (--url 은 경로 또는 전체 URL. Git Bash 는 「/」로 시작하는 인자를 C:/Program Files/Git/… 로 바꾸므로 앞 「/」를 빼라)
// 옵션: --base URL(기본 $PRINT_E2E_BASE 또는 http://localhost:3000) · --session e2e|customer · --out DIR
//       --allow-actions a,b(내부 세션에서 추가로 허용할 **읽기 전용** 서버 액션 이름 — 스튜디오 조판 등)
//
// ⚠ 26-09-29 가짜 GREEN 정정: 종전 판은 합성 beforeprint → print 미디어 → waitForTimeout(1500) 뒤에 쟀다.
//   그 1.5초 동안 이펙트가 나머지 쪽을 그려 줘서, 실제 인쇄(기다림 없음)에서는 3쪽 이후가 백지인데도 초록이었다.
//   이제 인쇄는 page.pdf() 직행(엔진이 beforeprint/afterprint 를 쏜다)이고, 판정은 그 PDF 와 「인쇄된 DOM」뿐이다.
//   ③ 은 afterprint 순간(인쇄 레이아웃 직후, 앱의 정리 전)에 잰다. 보조로 앱의 afterprint 정리를 붙잡아 둔 채
//   인쇄 미디어를 흉내 내 다시 재되, 인쇄 뒤 인쇄 루트가 바뀌었으면(재조판) 그 값은 인쇄된 것이 아니므로 경고만 남긴다.
// 계기 음성테스트: PRINT_E2E_FAULT=portal-opt-out · portal-removed(포털 미탑승) · overflow-dom(인쇄된 DOM 넘침) → RED.
//   악조건 host-preexists(지난 인쇄의 남은 호스트 — R7 자가 치유)는 GREEN 이어야 한다.
// 쓰기 차단(운영 DB 0건)은 print-harness.mjs 의 openGuardedContext 가 write-guard.mjs 의 세 겹(페이지 층 · 네트워크 층 ·
// 다운로드 경보)으로 한다 — 다운로드가 한 건이라도 시작되면 RED. 대기 규칙은
// tests/unit/exam-print-pipeline-contract.test.mjs C7(인쇄 트리거 뒤 시간 대기 금지)이 지킨다 — 아래 스튜디오
// 조작의 waitForTimeout 은 화면 준비(클릭 사이 재렌더)용이고 인쇄 준비 사건(printReady)보다 앞에만 있다.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CAP,
  enginePrint,
  examFontsSettled,
  judgePdf,
  judgeWriteGuard,
  openGuardedContext,
  openPage,
  printReady,
  summarizeNet,
} from "./print-harness.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
const base = opt("base", process.env.PRINT_E2E_BASE || "http://localhost:3000");
const out = opt("out", ".tmp-print-e2e");
const url = opt("url", null);
const classId = positional[0];
const pickCount = Number(positional[1] || 12);
if (!url && !classId) {
  console.error("사용법: paper-print-check.mjs <classId> [pickCount] | --url <경로> [--base URL] [--session e2e|customer]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const label = opt("label", url ? `print-check-${url.replace(/[^\w]+/g, "_")}` : `print-check-studio-${classId}`);

const ctx = await openGuardedContext({
  base,
  session: opt("session", "e2e"),
  viewport: { width: 1680, height: 1000 },
  extraReadActions: (opt("allow-actions", "") ?? "").split(",").filter(Boolean),
  holdAfterprint: true,
});
const errors = [];
const page = await openPage(ctx, errors);
const fails = [];

async function closeDialogs() {
  for (const text of ["나중에 보기", "오늘 하루 보지 않기", "새로 시작", "닫기"]) {
    const b = page.locator(`button:has-text("${text}")`);
    if (!(await b.count())) continue;
    await b.first().click({ timeout: 3000 }).catch(() => {});
    await b.first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  }
}

let crashed = false;
try {
  if (url) {
    const target = /^https?:\/\//.test(url) ? url : `${base}/${url.replace(/^\/+/, "")}`;
    await page.goto(target, { waitUntil: "load", timeout: CAP });
  } else {
    // 클래스 스튜디오 시험지 조판 — 문항을 골라 조판 판을 연다(화면 준비. 인쇄 판정과 무관한 조작 대기)
    await page.goto(`${base}/director/studio?class=${classId}&view=exam`, { waitUntil: "domcontentloaded", timeout: CAP });
    await page.waitForSelector('input[placeholder="문두·지문 검색"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    await closeDialogs();
    const n = Math.min(pickCount, await page.locator('[aria-label*="문항 선택"]').count());
    for (let i = 0; i < n; i += 1) {
      // 첫 클릭이 조판 판을 열며 목록을 다시 그린다 — 매번 새로 집고, 실패하면 건너뛴다.
      await page.locator('[aria-label*="문항 선택"]:not([aria-disabled="true"])').nth(i).click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(i === 0 ? 4000 : 600);
    }
    await closeDialogs();
  }
  // 앱이 인쇄를 가로챌 준비가 된 사건(첫 본문 프레임 + 인쇄 리스너 등록) + 시험지 글꼴 로드 사건 뒤 곧바로 인쇄한다.
  // 글꼴을 기다리는 까닭: ③ 은 조판 품질을 보는 검사라 「글꼴 도착 전 Ctrl+P」 경주와 섞지 않는다(그 경주는
  // print-e2e native 가 경고로 따로 본다). 스크롤이 없으므로 나머지 쪽은 여전히 안 그려진 채다(화면 로그로 확인).
  await printReady(page);
  await examFontsSettled(page);
  const screen = await page.evaluate(() => window.__snap("screen"));
  if (screen.bodyFrames > 2 && screen.mountedBody === screen.bodyFrames) {
    fails.push("시험 조건 불성립: 인쇄 전에 이미 전 쪽 마운트(동기 안전망을 시험하지 못함)");
  }
  console.log("화면(인쇄 직전):", JSON.stringify({ frames: screen.frames, mounted: screen.mountedFrames, answerKeyFrames: screen.answerKeyFrames }));

  // ── 인쇄: 엔진 직행 ──────────────────────────────────────────────────────────────
  const pdf = await enginePrint(page, path.join(out, `${label}.pdf`));
  const printed = (await page.evaluate(() => window.__snaps)).find((s) => s.tag === "afterprint") ?? null;

  // ── 인쇄된 DOM 감사 ─────────────────────────────────────────────────────────────
  // (1) 주 판정: afterprint 순간(= 인쇄된 DOM 그대로, 앱의 정리 전)에 잰 칸 넘침 — printed.overflow
  // (2) 보조: 앱의 afterprint 정리를 붙잡아 둔 채 인쇄 미디어를 흉내 내 다시 잰다. 단 인쇄 뒤 인쇄 루트가
  //     한 번이라도 바뀌었으면(인쇄 뒤 재조판) 그 DOM 은 인쇄된 것이 아니므로 판정하지 않고 경고만 남긴다.
  const postPrintMutations = await page.evaluate(() => window.__postPrintMutations);
  await page.emulateMedia({ media: "print" });
  const printMediaAudit = await page.evaluate(() => window.__auditOverflow());
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.__releaseAfterprint());
  const warnings = [];

  if (!printed) fails.push("afterprint 가 오지 않았다(엔진 인쇄 실패)");
  else {
    if (printed.rootParent !== "exam-print-host") fails.push(`인쇄된 루트의 부모 ${printed.rootParent}(포털 미탑승)`);
    if (printed.mountedFrames !== printed.frames) fails.push(`인쇄된 DOM 마운트 ${printed.mountedFrames}/${printed.frames}`);
    judgePdf(pdf, printed.frames, fails, "PDF", printed.frameInfo);
    if (printed.overflow.overflowColumns > 0) {
      fails.push(`인쇄된 DOM 넘친 칸 ${printed.overflow.overflowColumns}: ${printed.overflow.where.join(" · ")}`);
    }
    if (postPrintMutations > 0) {
      warnings.push(`인쇄 뒤 인쇄 루트 변경 ${postPrintMutations}건(재조판) — 인쇄 미디어 보조 감사 생략`);
    } else if (printMediaAudit.overflowColumns > 0) {
      fails.push(`인쇄 미디어 넘친 칸 ${printMediaAudit.overflowColumns}: ${printMediaAudit.where.join(" · ")}`);
    }
  }
  const fatal = errors.filter((e) => /Maximum update depth|Minified React error #185|pageerror/.test(e));
  if (fatal.length) fails.push(`치명 오류 ${fatal.length}건`);
  judgeWriteGuard(ctx.net, fails); // 다운로드가 한 건이라도 시작됐으면 RED(가드 뚫림)
  if (ctx.hmr?.length) warnings.push(`개발 서버 Fast Refresh ${ctx.hmr.length}회(실행 중 동시 편집) — RED 면 재확인할 것`);

  console.log("인쇄된 DOM:", JSON.stringify(printed && { frames: printed.frames, mounted: printed.mountedFrames, rootParent: printed.rootParent, overflow: printed.overflow }));
  console.log("PDF:", JSON.stringify({ pages: pdf.pages, textPages: pdf.textPages, blank: pdf.blank, warning: pdf.warning, minChars: pdf.minChars }));
  console.log("인쇄 미디어 보조 감사:", JSON.stringify({ postPrintMutations, ...printMediaAudit }), warnings.length ? `경고 ${JSON.stringify(warnings)}` : "");
  const verdict = fails.length === 0 ? "GREEN" : "RED";
  const net = summarizeNet(ctx.net);
  writeFileSync(path.join(out, `${label}.json`), JSON.stringify({ verdict, fails, warnings, url, classId, screen, printed, pdf, postPrintMutations, printMediaAudit, net, errors: errors.slice(0, 20) }, null, 2));
  console.log(verdict, fails.length ? JSON.stringify(fails) : "", "· 차단 요청", JSON.stringify(net.blocked), "· 쓰기 가드", JSON.stringify(net.writeGuard));
} catch (error) {
  crashed = true;
  fails.push(`실행 오류: ${String(error?.message ?? error).slice(0, 300)}`);
  console.log("RED", JSON.stringify(fails));
} finally {
  await ctx.browser.close();
}
process.exit(crashed ? 2 : fails.length === 0 ? 0 : 1);
