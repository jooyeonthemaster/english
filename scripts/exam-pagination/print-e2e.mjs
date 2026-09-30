#!/usr/bin/env node
// ============================================================================
// 시험지 인쇄 e2e — 실제 인쇄 엔진(page.pdf = Chrome printToPDF)과 print() 호출 순간 동기 스냅숏으로만 판정한다.
// 계약·배경: docs/EXAM-PRINT-PIPELINE.md §6
//
//   node scripts/exam-pagination/print-e2e.mjs <mode> --exam <id> [옵션]      (cwd = 저장소 루트)
//     native               상세 화면. 앱이 인쇄 리스너를 건 순간(첫 본문 프레임 + beforeprint 등록) 곧바로 page.pdf()
//                          = Ctrl+P · 브라우저 메뉴 · printToPDF 처럼 기다릴 수 없는 경로의 동기 안전망
//     button               툴바 [인쇄](--explanation 이면 이어서 [다운로드]→[PDF 해설]) → print() 순간 스냅숏 → 즉시 page.pdf()
//                          → 원격 측정(인쇄 집계 본문)이 잡마다 1건 오는 사건을 기다려 메타를 판정한다
//                          (fonts=loaded · guard=settled — stuck 은 고칠 수 없는 넘침 · prior 없음 · 전 쪽 마운트)
//                          --real-print: 스텁 대신 진짜 print() — 그 호출 안에서 beforeprint/afterprint 가 돌고 정리까지
//                          끝나는 실제 순서를 본다(PDF 대신 afterprint 순간의 인쇄된 DOM 으로 판정)
//     dialog               목록 카드 [인쇄] → 인쇄 대화상자 → 스냅숏 → page.pdf() → afterprint 뒤 닫힘 · 집계 시도 1회
//                          (--exam = 썸네일을 받은 카드(캐시 적중), --miss <id|auto> = 데이터를 아직 안 받은 카드.
//                           auto = 썸네일 · 요청이 없는 5문항 이상 카드 중 목록 끝에서 가장 가까운 것.
//                           --exam 카드가 첫 화면에 없으면 목록 페이지를 넘겨 찾는다 — 모바일은 폴더당 10장씩, GPE-2)
//     deeplink-strictmode  /director/exams/{id}?print=1 → print() 정확히 1회 · 파라미터 제거 · 새로고침 뒤 0회
//     timing               button(과 --dialog-exam 이 있으면 dialog)을 --cpu 배율마다 --repeat 회 — 클릭→print() 지연
//     force-per-page       빌더 [시험지 설정] 「쪽당 N문제」(--per 1|2, 기본 2)를 켜고 켜졌는지(버튼 활성 + 쪽 수 변화)
//                          확인한 뒤 [인쇄] → [PDF 해설] 을 button 과 같은 판정으로 — 26-09-30 E1 회귀(강제 배치 + 해설이
//                          칸 용량 ∞ · 가드 꺼짐으로 종이 아래 잘림 → 해설 모드는 강제 배치를 끈다, forcedPerPageEnabled).
//                          인쇄 뒤에도 강제 배치 · 쪽 수가 그대로여야 한다. 빌더 읽기 액션이 필요해 --session e2e 전용.
//   옵션: --base URL(기본 $PRINT_E2E_BASE 또는 http://localhost:3000) · --session e2e|customer(기본 e2e)
//         --surface detail|builder(button) · --explanation · --dialog-exam <id>(timing) · --cpu 1,4 · --repeat N
//         --per 1|2(force-per-page) · --viewport 390x844 · --out DIR(기본 .tmp-print-e2e) · --label L
//   공용 하네스(쓰기 차단 컨텍스트 · 계측 · 엔진 인쇄 · 판정식): print-harness.mjs · 쓰기 가드: write-guard.mjs
//
// 【판정 원칙】 시간을 기다려 얻은 초록은 증거가 아니다(9/19 가짜 GREEN = 합성 beforeprint + 1.5초 대기).
//  · 인쇄 결과는 page.pdf() 로만 본다 — 엔진이 beforeprint/afterprint 를 쏘고 그 자리에서 인쇄 레이아웃을 뜬다.
//  · 버튼 경로의 window.print 는 「호출 순간 동기 스냅숏」으로 바꾼다(실제 인쇄 없음) → 곧바로 page.pdf().
//  · 대기는 사건(인쇄 리스너 등록 · print() 호출 · afterprint · 요청 발생)만 기다린다. 시간 상한은 실패 판정용.
//  · waitForTimeout · 합성 beforeprint 는 tests/unit/exam-print-pipeline-contract.test.mjs 가 금지한다.
//
// 【쓰기 차단 — 운영 DB 0건】 write-guard.mjs 세 겹: 페이지 층(<a download> · 내보내기 링크 클릭 · 이동 · window.open ·
//  폼을 요청 전에 삼킴 — route 로는 못 막는다, 26-09-30 사고) · 네트워크 층(/api/**/export* 메서드 무관 abort, GET/HEAD 는
//  get-policy.mjs 허용 목록만(부작용 GET — credits 등 — 은 로컬 스텁 · 거부, COH-4), 그 밖 abort, 예외는 READ_ONLY_ACTIONS
//  서버 액션 이름뿐 — 고객 세션은 예외 0, /api/track · collect abort, sendBeacon 무력화) ·
//  경보(다운로드가 시작되면 취소하고 RED). 허용·차단·삼킴은 결과 JSON 의 net 에 싣는다(인쇄 집계 incrementExamPrintCount
//  는 abort, 본문만 증거로). 툴바는 인쇄 항목(인쇄 · PDF · PDF 해설)만 누른다 — HWPX · DOCX 는 누르지 않는다.
//  가드 자체의 증명: node scripts/exam-pagination/write-guard.mjs(가짜 로컬 서버 자가 시험).
//
// 【계기 음성테스트】 PRINT_E2E_FAULT=portal-opt-out|portal-removed(포털 미탑승 → native · button --real-print ·
//  paper-print-check RED) · block-fonts · no-replace-state · no-preview-data · overflow-dom 로 브라우저 쪽 조건만
//  망가뜨리면 해당 모드가 RED 여야 한다(저장소 코드는 건드리지 않는다).
// 【악조건(GREEN 이어야 한다)】 PRINT_E2E_FAULT=host-preexists(지난 인쇄가 남긴 주인 없는 호스트 — R7 자가 치유, 인쇄 전
//  호스트가 실제로 있었는지 · 인쇄 뒤 0 인지도 본다) · hang-ui-font(무관한 UI 글꼴이 영영 로딩 — 시험지 글꼴이 준비됐으면
//  빠른 경로 · 상한 대기 0, PRINT-R1) · hold-exam-fonts(시험지 글꼴이 늦게 도착 — 준비 경로에서 도착 뒤 인쇄, V7-1)
// 종료 코드: 0 GREEN · 1 RED · 2 실행 오류
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CAP,
  FIRST_FRAME,
  STATUS,
  afterprintCount,
  callsNow,
  check,
  clickToolbar,
  enginePrint,
  examFontsSettled,
  judgePdf,
  judgePrinted,
  judgeSnapshot,
  judgeTelemetry,
  judgeWriteGuard,
  openGuardedContext,
  openPage,
  printReady,
  releaseHeldFonts,
  summarizeNet,
  telemetryMeta,
  twoFrames,
  waitAfterprint,
  waitPrintCall,
  waitTelemetry,
} from "./print-harness.mjs";

// ── 모드 ────────────────────────────────────────────────────────────────────────
async function modeNative(ctx, o, r) {
  const page = await openPage(ctx, r.errors);
  await page.goto(`${o.base}/director/exams/${o.exam}`, { waitUntil: "commit", timeout: CAP });
  await printReady(page);
  r.before = await page.evaluate(() => window.__snap("before"));
  r.pdf = await enginePrint(page, `${o.out}/${o.label}.pdf`);
  r.printed = await judgePrinted(page, r.fails, "인쇄된 DOM", r.warnings); // 넘침은 경고(네이티브는 가드를 못 기다린다)
  r.postPrintMutations = await page.evaluate(() => window.__postPrintMutations);
  r.printCalls = await callsNow(page);
  if (r.printed) {
    check(r.fails, r.printed.rootParent === "exam-print-host", `인쇄된 루트의 부모 ${r.printed.rootParent}(포털 미탑승)`);
    judgePdf(r.pdf, r.printed.frames, r.fails, "PDF", r.printed.frameInfo);
  }
  check(r.fails, r.printCalls === 0, `페이지가 스스로 print() ${r.printCalls}회`);
  // 시험 조건: 인쇄 전에 이미 전 쪽이 그려져 있었다면 동기 안전망을 시험하지 못한 것이다.
  check(r.fails, r.before.bodyFrames <= 2 || r.before.mountedBody < r.before.bodyFrames, "시험 조건 불성립: 인쇄 전에 이미 전 쪽 마운트");
  // 자가 치유 악조건은 인쇄 전에 남은 호스트가 실제로 있어야 성립한다(없으면 초록이 아무것도 증명하지 않는다).
  if (r.fault === "host-preexists") check(r.fails, r.before.hosts >= 1, `시험 조건 불성립: 인쇄 전 남은 호스트 ${r.before.hosts}개`);
  await page.waitForFunction(() => {
    const root = document.getElementById("exam-paper-print-root");
    return !!root && root.parentElement?.id !== "exam-print-host" && !document.body.classList.contains("exam-print-active");
  }, null, { timeout: 60_000 });
  r.restored = await page.evaluate(() => window.__snap("restored"));
  check(r.fails, r.restored.rootParent !== "exam-print-host" && r.restored.roots === 1, "afterprint 뒤 루트 원위치 실패");
  check(r.fails, r.restored.hosts === 0, `afterprint 뒤 #exam-print-host ${r.restored.hosts}개 잔존`);
}

async function buttonJob(ctx, page, o, r, mode) {
  const job = { mode };
  const ak0 = (await page.evaluate(() => window.__snap("pre"))).answerKeyFrames;
  const n = await callsNow(page);
  const a = await afterprintCount(page);
  await clickToolbar(page, mode === "explanation" ? "PDF 해설" : "인쇄");
  if (r.fault === "hold-exam-fonts" && ctx.net.held.length > 0) {
    // 컨트롤러가 글꼴을 기다리는 준비 경로에 들어선 사건 → 그때 글꼴을 보낸다(늦게 도착)
    await page.waitForFunction((sel) => /준비 중/.test(document.querySelector(sel)?.textContent ?? ""), STATUS, { timeout: CAP });
    job.releasedFonts = releaseHeldFonts(ctx.net);
  }
  job.snapshot = await waitPrintCall(page, n);
  judgeSnapshot(job.snapshot, r.fails);
  if (!job.snapshot) return job;
  if (o.realPrint) {
    // 진짜 print() — 엔진이 그 호출 안에서 beforeprint → afterprint 를 쏘고 앱이 정리까지 마친 뒤 돌아온다
    const ev = job.snapshot.syncEvents ?? {};
    check(r.fails, ev.before >= 1 && ev.after >= 1, `${mode}: print() 안에서 beforeprint ${ev.before} · afterprint ${ev.after}`);
    const printedDom = await judgePrinted(page, r.fails, `${mode} 인쇄된 DOM`);
    job.printedOverflow = printedDom?.overflow ?? null;
    check(r.fails, printedDom?.rootParent === "exam-print-host", `${mode}: 인쇄된 루트의 부모 ${printedDom?.rootParent}(포털 미탑승 — 앱 전체가 인쇄된다)`);
    await twoFrames(page);
    job.statusAfter = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, STATUS);
    check(r.fails, job.statusAfter === "", `${mode}: 인쇄 뒤 상태 표시줄 「${job.statusAfter}」(done 이 아니다)`);
  } else {
    job.pdf = await enginePrint(page, `${o.out}/${o.label}-${mode}.pdf`);
    job.statusAtBeforeprint = await page.evaluate(() => window.__snaps.filter((s) => s.tag === "beforeprint").at(-1)?.status ?? null);
    judgePdf(job.pdf, job.snapshot.frames, r.fails, mode, job.snapshot.frameInfo);
    job.printedOverflow = (await judgePrinted(page, r.fails, `${mode} 인쇄된 DOM`))?.overflow ?? null;
  }
  await waitAfterprint(page, a);
  job.hostsAfter = await page.evaluate(() => document.querySelectorAll("#exam-print-host").length);
  check(r.fails, job.hostsAfter === 0, `${mode}: afterprint 뒤 #exam-print-host ${job.hostsAfter}개 잔존`);
  if (!o.realPrint) {
    // 스텁 print() 는 beforeprint 를 안 쏘므로 잡은 needs-gesture 로 간다 → 뒤이은 엔진 인쇄(page.pdf)의 beforeprint ·
    // afterprint 가 그 잡을 printing → done 으로 끝내야 한다(데스크톱에서 인쇄 창이 늦게 뜬 경우와 같은 순서).
    await twoFrames(page);
    job.statusAfter = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? null, STATUS);
    check(r.fails, job.statusAfter === "", `${mode}: 엔진 인쇄 뒤 상태 표시줄 「${job.statusAfter}」(done 이 아니다 — 늦은 beforeprint/afterprint 를 잡이 못 받았다)`);
  }
  if (mode === "explanation") {
    check(r.fails, job.snapshot.answerKeyFrames === 0 && job.snapshot.inlineAnswers > 0, `해설 인쇄 순간 정답표 ${job.snapshot.answerKeyFrames} · 인라인 해설 ${job.snapshot.inlineAnswers}`);
    // 정리는 afterprint 태스크에서 커밋된다 — 원복(정답표 복귀 · 인라인 해설 0)을 사건으로 기다린다.
    await page.waitForFunction(
      (k) => { const s = window.__snap("revert"); return s.answerKeyFrames === k && s.inlineAnswers === 0; },
      ak0, { timeout: 60_000 },
    ).then(() => { job.reverted = true; }, () => r.fails.push("해설 인쇄 뒤 원복 실패"));
  }
  return job;
}

async function modeButton(ctx, o, r) {
  const page = await openPage(ctx, r.errors);
  const url = o.surface === "builder" ? `${o.base}/director/workbench/exams/${o.exam}/edit` : `${o.base}/director/exams/${o.exam}`;
  // load 사건은 기다리지 않는다 — 걸린 웹 글꼴은 load 를 영영 막는다(hang-ui-font). 준비는 printReady 사건으로 본다.
  await page.goto(url, { waitUntil: "commit", timeout: CAP });
  await printReady(page);
  if (r.fault === "hang-ui-font") {
    // 시험지 글꼴만 도착한 사건(UI 글꼴은 영영 로딩) — 이 상태의 클릭은 빠른 경로여야 한다
    await page.evaluate(() => Promise.all(["400", "700"].map((w) => document.fonts.load(`${w} 16px "Malgun Gothic Exam"`, "가A1①"))));
    r.uiFontHung = await page.evaluate(() => ({ status: document.fonts.status, hung: [...document.fonts].filter((f) => f.status === "loading").length }));
    check(r.fails, r.uiFontHung.status === "loading" && ctx.net.hung.length > 0, `시험 조건 불성립: UI 글꼴이 로딩 중이 아니다(${JSON.stringify(r.uiFontHung)})`);
  }
  r.before = await page.evaluate(() => window.__snap("before"));
  r.jobs = [await buttonJob(ctx, page, o, r, "plain")];
  if (o.explanation) r.jobs.push(await buttonJob(ctx, page, o, r, "explanation"));
  await judgeJobsTelemetry(ctx, o, r);
}

/** 인쇄 집계(원격 측정)는 fire-and-forget + 서버 액션 직렬 큐 → 잡마다 1건 도착하는 사건을 기다린다(상한 = 실패 판정) */
async function judgeJobsTelemetry(ctx, o, r) {
  r.latencyMs = r.jobs.map((j) => j.snapshot?.sinceClick ?? null);
  const printed = r.jobs.filter((j) => j.snapshot);
  const arrived = await waitTelemetry(ctx.net, o.exam, 120_000, printed.length);
  check(r.fails, arrived, `인쇄 집계 ${ctx.net.telemetry.length}건(기대 ${printed.length})`);
  const metas = ctx.net.telemetry.filter((t) => JSON.stringify(t).includes(o.exam)).map(telemetryMeta);
  const expectPath = r.fault === "hang-ui-font" ? "fast" : r.fault === "hold-exam-fonts" ? "prepare" : undefined;
  printed.forEach((j, i) => {
    j.meta = metas[i] ?? null;
    judgeTelemetry(j.meta, r.fails, `${j.mode} 원격 측정`, {
      fonts: r.fault === "block-fonts" ? "error" : "loaded",
      path: i === 0 ? expectPath : undefined,
    });
  });
}

async function modeForcePerPage(ctx, o, r) {
  const page = await openPage(ctx, r.errors);
  await page.goto(`${o.base}/director/workbench/exams/${o.exam}/edit`, { waitUntil: "commit", timeout: CAP });
  await printReady(page);
  await examFontsSettled(page); // 쪽 수 비교가 글꼴 도착(가드 재분할)에 흔들리지 않게 — 사건 대기
  const title = `쪽당 ${o.per}문제씩 강제 배치`;
  const frames = () => page.evaluate((sel) => document.querySelectorAll(sel).length, FIRST_FRAME);
  const forcedOn = () => page.evaluate((t) => !!document.querySelector(`button[title="${t}"]`)?.className.includes("border-blue-300"), title);
  r.framesNormal = await frames();
  await page.locator('button:has-text("시험지 설정")').first().click();
  const toggle = page.locator(`button[title="${title}"]`).first();
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  // 토글과 재조판은 한 커밋이다 — 버튼 활성 사건 뒤 두 프레임이면 새 쪽 수가 그려져 있다.
  await page.waitForFunction((t) => !!document.querySelector(`button[title="${t}"]`)?.className.includes("border-blue-300"), title, { timeout: CAP });
  await twoFrames(page);
  r.framesForced = await frames();
  check(r.fails, r.framesForced !== r.framesNormal, `시험 조건 불성립: 「쪽당 ${o.per}문제」가 쪽 수를 바꾸지 않았다(${r.framesNormal}쪽)`);
  r.before = await page.evaluate(() => window.__snap("before"));
  r.jobs = [await buttonJob(ctx, page, o, r, "plain"), await buttonJob(ctx, page, o, r, "explanation")];
  // 해설 인쇄는 강제 배치를 **그 인쇄 동안만** 끈다 — 끝나면 설정 · 쪽 수가 그대로여야 한다.
  r.forcedStillOn = await forcedOn();
  r.framesAfter = await frames();
  check(r.fails, r.forcedStillOn && r.framesAfter === r.framesForced, `인쇄 뒤 강제 배치 ${r.forcedStillOn} · 쪽 ${r.framesAfter}/${r.framesForced}`);
  await judgeJobsTelemetry(ctx, o, r);
}

/**
 * 목록에서 카드를 찾아 화면에 들인다. 첫 화면에 없으면 목록의 「다음 페이지」를 끝까지 넘기며 찾는다(모바일 목록은 폴더당
 * 10장씩만 그린다 — 26-09-30 GPE-2: 390x844 에서 e2e 53 카드가 첫 10장 밖이라 scrollIntoViewIfNeeded 가 30초 뒤 실행 오류).
 * 넘김은 「카드 목록이 바뀐」 사건을 기다린다. 끝까지 없으면 null(호출자가 시험 조건 불성립으로 적는다). 돌려주는 값 = 넘긴 횟수.
 */
async function locateCard(page, examId) {
  const sel = `[data-drag-item-id="${examId}"]`;
  const ids = () => page.evaluate(() => [...document.querySelectorAll("[data-drag-item-id]")].map((e) => e.getAttribute("data-drag-item-id")).join(","));
  for (let turns = 0; turns <= 200; turns += 1) {
    if ((await page.locator(sel).count()) > 0) {
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      return turns;
    }
    const next = page.locator('button[aria-label="다음 페이지"]:not([disabled]):visible').first();
    if ((await next.count()) === 0) return null;
    const before = await ids();
    await next.click();
    await page.waitForFunction((b) => [...document.querySelectorAll("[data-drag-item-id]")].map((e) => e.getAttribute("data-drag-item-id")).join(",") !== b, before, { timeout: CAP });
  }
  return null;
}

async function dialogCase(page, ctx, o, r, kind, examId) {
  const c = { kind, examId };
  (r.cases ??= []).push(c); // 도중에 실패해도 여기까지의 관측을 남긴다
  const sel = `[data-drag-item-id="${examId}"]`;
  const reqs = () => ctx.net.allowed.filter((a) => a.name === "getExamPreviewData" && a.body.includes(examId)).length;
  if (kind === "hit") {
    c.pageTurns = await locateCard(page, examId);
    if (c.pageTurns == null) {
      r.fails.push(`시험 조건 불성립: --exam 카드 ${examId} 가 목록에 없다(페이지 넘김 끝까지 — 다른 학원 · 폴더이거나 삭제됨)`);
      return c;
    }
    // 썸네일 = 공유 캐시에 데이터가 있다. 끝내 안 그려지면(데이터 차단 결함 주입 등) 조건 불성립으로 적고 계속 누른다.
    await page.waitForSelector(`${sel} .exam-a4-page`, { timeout: 120_000 })
      .catch(() => r.fails.push("시험 조건 불성립: hit 카드 썸네일이 그려지지 않았다"));
  }
  // 캐시 계약: 한 시험지의 미리보기 데이터 요청은 썸네일·인쇄를 통틀어 1건(진행 중 합치기 · 공유 캐시)
  c.requestsBeforeClick = reqs();
  c.thumbBeforeClick = await page.evaluate((s) => !!document.querySelector(`${s} .exam-a4-page`), sel);
  if (kind === "miss") {
    // miss 카드는 넘겨서 찾지 않는다(넘기면 화면에 들어와 썸네일 데이터가 요청된다 = miss 가 아니다)
    if (!(await page.locator(sel).count())) {
      r.fails.push(`시험 조건 불성립: --miss 카드 ${examId} 가 지금 목록 화면에 없다(--miss auto 를 쓸 것)`);
      return c;
    }
    check(r.fails, c.requestsBeforeClick === 0 && !c.thumbBeforeClick, "시험 조건 불성립: miss 카드의 데이터가 이미 요청됐다(--miss auto 로 먼 카드를 고를 것)");
  }
  const n = await callsNow(page);
  const a = await afterprintCount(page);
  await page.evaluate(() => {
    window.__dialogT = null;
    window.__dialogGone = false;
    new MutationObserver((_, mo) => {
      const open = !!document.querySelector("[role=dialog]");
      if (open && window.__dialogT == null) window.__dialogT = performance.now();
      if (!open && window.__dialogT != null) { window.__dialogGone = true; mo.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
  });
  if (kind === "hit") await page.locator(`${sel} button[aria-label="시험지 인쇄"]`).click();
  else await page.evaluate((s) => document.querySelector(`${s} button[aria-label="시험지 인쇄"]`).click(), sel);
  c.snapshot = await waitPrintCall(page, n);
  if (!c.snapshot) c.closedWithoutPrint = await page.evaluate(() => window.__dialogGone);
  c.dialogMs = await page.evaluate(() => (window.__dialogT == null ? null : Math.round(window.__dialogT - window.__clickT)));
  judgeSnapshot(c.snapshot, r.fails, { inDialog: true });
  check(r.fails, page.frames().length === 1, `프레임 ${page.frames().length}개(숨김 iframe 부활)`);
  if (!c.snapshot) return c;
  c.pdf = await enginePrint(page, `${o.out}/${o.label}-${kind}.pdf`);
  judgePdf(c.pdf, c.snapshot.frames, r.fails, `dialog-${kind}`, c.snapshot.frameInfo);
  c.printedOverflow = (await judgePrinted(page, r.fails, `dialog-${kind} 인쇄된 DOM`))?.overflow ?? null;
  await waitAfterprint(page, a);
  await page.waitForFunction(() => !document.querySelector("[role=dialog]"), null, { timeout: 60_000 })
    .catch(() => r.fails.push(`dialog-${kind}: afterprint 뒤 대화상자가 닫히지 않았다`));
  c.after = await page.evaluate(() => ({ ...window.__snap("after"), scrollLocked: document.body.hasAttribute("data-scroll-locked") }));
  check(r.fails, c.after.roots === 0 && !c.after.scrollLocked, `dialog-${kind}: 닫힌 뒤 루트 ${c.after.roots} · 스크롤 잠금 ${c.after.scrollLocked}`);
  c.previewRequests = reqs() - c.requestsBeforeClick;
  const total = c.requestsBeforeClick + c.previewRequests;
  check(r.fails, total === 1, `dialog-${kind}: 미리보기 데이터 요청 누계 ${total}건(클릭 전 ${c.requestsBeforeClick} · 뒤 ${c.previewRequests}, 기대 1)`);
  return c;
}

async function modeDialog(ctx, o, r) {
  const page = await openPage(ctx, r.errors);
  await page.goto(`${o.base}/director/exams`, { waitUntil: "load", timeout: CAP });
  await page.waitForSelector("[data-drag-item-id]", { timeout: CAP });
  r.cards = await page.evaluate(() => document.querySelectorAll("[data-drag-item-id]").length);
  await dialogCase(page, ctx, o, r, "hit", o.exam);
  if (o.miss === "auto") {
    // 아직 데이터를 한 번도 요청하지 않은(썸네일이 안 그려진) 5문항 이상 카드 중 문서 끝에서 가장 가까운 것
    const asked = ctx.net.allowed.filter((a) => a.name === "getExamPreviewData").map((a) => a.body);
    o.miss = await page.evaluate((bodies) => {
      const ids = [...document.querySelectorAll("[data-drag-item-id]")]
        .filter((el) => !el.querySelector(".exam-a4-page") && el.querySelector('button[aria-label="시험지 인쇄"]'))
        // 카드 전체 textContent 는 제목 끝 숫자와 붙는다(「…05-15」+「0문항」) — 「N문항」 칸만 읽는다
        .filter((el) => {
          const cell = [...el.querySelectorAll("span")].map((s) => s.textContent.trim()).find((t) => /^\d+문항$/.test(t));
          return Number.parseInt(cell ?? "0", 10) >= 5;
        })
        .map((el) => el.getAttribute("data-drag-item-id"));
      return ids.reverse().find((id) => !bodies.some((b) => b.includes(id))) ?? null;
    }, asked);
    check(r.fails, !!o.miss, "시험 조건 불성립: miss 로 쓸 카드가 없다");
  }
  if (o.miss) await dialogCase(page, ctx, o, r, "miss", o.miss);
  // 인쇄 집계는 fire-and-forget + 서버 액션 직렬 큐 → 요청 발생을 사건으로 기다린다(상한 = 실패 판정)
  const printed = r.cases.filter((c) => c.snapshot);
  for (const c of printed) await waitTelemetry(ctx.net, c.examId, 120_000);
  for (const c of printed) {
    c.telemetry = ctx.net.telemetry.filter((t) => JSON.stringify(t).includes(c.examId));
    check(r.fails, c.telemetry.length === 1, `dialog-${c.kind}: 인쇄 집계 시도 ${c.telemetry.length}건(기대 1)`);
  }
}

async function modeDeeplink(ctx, o, r) {
  const page = await openPage(ctx, r.errors);
  await page.goto(`${o.base}/director/exams/${o.exam}?print=1`, { waitUntil: "load", timeout: CAP });
  r.snapshot = await waitPrintCall(page, 0);
  judgeSnapshot(r.snapshot, r.fails);
  r.urlAfterStart = await page.evaluate(() => location.search);
  check(r.fails, !/(^|[?&])print=1/.test(r.urlAfterStart), `시작 뒤에도 URL 에 print=1(${r.urlAfterStart})`);
  r.strictMode = await page.evaluate(() => window.__bp);
  if (r.snapshot) {
    const a = await afterprintCount(page);
    r.pdf = await enginePrint(page, `${o.out}/${o.label}.pdf`);
    judgePdf(r.pdf, r.snapshot.frames, r.fails, "PDF", r.snapshot.frameInfo);
    r.printedOverflow = (await judgePrinted(page, r.fails))?.overflow ?? null;
    await waitAfterprint(page, a);
  }
  // 「두 번째 호출이 없다」는 부재 증명 — 네트워크가 잦아들고 두 프레임이 더 지난 뒤의 호출 수를 센다.
  await page.waitForLoadState("networkidle");
  await twoFrames(page);
  r.calls = await callsNow(page);
  check(r.fails, r.calls === 1, `print() ${r.calls}회(기대 1)`);
  await page.reload({ waitUntil: "load", timeout: CAP });
  await printReady(page);
  await page.waitForLoadState("networkidle");
  await twoFrames(page);
  r.afterReload = await page.evaluate(() => ({ calls: window.__printCalls.length, search: location.search }));
  check(r.fails, r.afterReload.calls === 0, `새로고침 뒤 print() ${r.afterReload.calls}회(기대 0)`);
}

async function modeTiming(ctx, o, r) {
  r.samples = [];
  for (const cpu of o.cpu) {
    for (let i = 0; i < o.repeat; i += 1) {
      for (const kind of o.dialogExam ? ["button", "dialog"] : ["button"]) {
        const page = await openPage(ctx, r.errors);
        const cdp = await ctx.context.newCDPSession(page);
        const url = kind === "button" ? `${o.base}/director/exams/${o.exam}` : `${o.base}/director/exams`;
        await page.goto(url, { waitUntil: "load", timeout: CAP });
        if (kind === "button") await printReady(page);
        else {
          if ((await locateCard(page, o.dialogExam)) == null) throw new Error(`시험 조건 불성립: --dialog-exam 카드 ${o.dialogExam} 가 목록에 없다`);
          await page.waitForSelector(`[data-drag-item-id="${o.dialogExam}"] .exam-a4-page`, { timeout: CAP });
        }
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        if (kind === "button") await clickToolbar(page, "인쇄");
        else await page.locator(`[data-drag-item-id="${o.dialogExam}"] button[aria-label="시험지 인쇄"]`).click();
        const s = await waitPrintCall(page, 0);
        judgeSnapshot(s, r.fails, { inDialog: kind === "dialog" });
        // 긴 작업 항목은 그 작업이 끝난 뒤에야 배달된다 — print() 순간이 아니라 두 프레임 뒤에 읽는다.
        await twoFrames(page);
        const longestTaskMs = await page.evaluate(() => Math.round(window.__longest));
        r.samples.push({ kind, cpu, run: i + 1, clickToPrintMs: s?.sinceClick ?? null, longestTaskMs, frames: s?.frames, mounted: s?.mountedFrames });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await page.close();
      }
    }
  }
  r.summary = {};
  for (const s of r.samples) (r.summary[`${s.kind}@${s.cpu}x`] ??= []).push(s.clickToPrintMs);
}

const MODES = {
  native: modeNative,
  button: modeButton,
  dialog: modeDialog,
  "deeplink-strictmode": modeDeeplink,
  timing: modeTiming,
  "force-per-page": modeForcePerPage,
};

function parseArgs(argv) {
  const o = { mode: argv[0], base: process.env.PRINT_E2E_BASE || "http://localhost:3000", session: "e2e", surface: "detail", cpu: [1, 4], repeat: 1, per: "2", out: ".tmp-print-e2e" };
  for (let i = 1; i < argv.length; i += 1) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--explanation") o.explanation = true;
    else if (k === "--real-print") o.realPrint = true;
    else if (k === "--cpu") { o.cpu = v.split(",").map(Number); i += 1; }
    else if (k === "--repeat") { o.repeat = Number(v); i += 1; }
    else if (k.startsWith("--")) { o[k.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v; i += 1; }
  }
  o.label ??= `${o.mode}-${o.exam}${o.mode === "force-per-page" ? `-per${o.per}` : ""}${o.realPrint ? "-real" : ""}${process.env.PRINT_E2E_FAULT ? `-fault-${process.env.PRINT_E2E_FAULT}` : ""}`;
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!MODES[o.mode] || !o.exam) {
    console.error(`사용법: print-e2e.mjs <${Object.keys(MODES).join("|")}> --exam <id> [--session e2e|customer] [--base URL] …`);
    process.exit(2);
  }
  if (o.mode === "force-per-page" && (o.session !== "e2e" || !["1", "2"].includes(String(o.per)))) {
    console.error("force-per-page 는 --session e2e(빌더 읽기 액션 필요) · --per 1|2 만 받는다");
    process.exit(2);
  }
  mkdirSync(o.out, { recursive: true });
  const viewport = o.viewport ? { width: Number(o.viewport.split("x")[0]), height: Number(o.viewport.split("x")[1]) } : undefined;
  const ctx = await openGuardedContext({ base: o.base, session: o.session, viewport, realPrint: !!o.realPrint });
  const r = { mode: o.mode, exam: o.exam, session: o.session, base: o.base, fault: process.env.PRINT_E2E_FAULT || null, fails: [], warnings: [], errors: [] };
  try {
    await MODES[o.mode](ctx, o, r);
  } catch (error) {
    r.fails.push(`실행 오류: ${String(error?.message ?? error).slice(0, 300)}`);
    r.crashed = true;
  } finally {
    r.net = summarizeNet(ctx.net);
    r.fatal = r.errors.filter((e) => /Maximum update depth|Minified React error #185|pageerror/.test(e));
    check(r.fails, r.fatal.length === 0, `치명 오류 ${r.fatal.length}건`);
    judgeWriteGuard(ctx.net, r.fails); // 다운로드가 한 건이라도 시작됐으면 RED(가드 뚫림)
    r.hmr = ctx.hmr ?? [];
    if (r.hmr.length) r.warnings.push(`개발 서버 Fast Refresh ${r.hmr.length}회(실행 중 동시 편집) — RED 면 같은 명령으로 재확인할 것`);
    r.verdict = r.fails.length === 0 ? "GREEN" : "RED";
    writeFileSync(path.join(o.out, `${o.label}.json`), JSON.stringify(r, null, 2));
    await ctx.browser.close();
  }
  console.log(JSON.stringify({ verdict: r.verdict, mode: r.mode, exam: r.exam, fails: r.fails, warnings: r.warnings, net: r.net.blocked, writeGuard: r.net.writeGuard, out: path.join(o.out, `${o.label}.json`) }, null, 2));
  process.exit(r.crashed ? 2 : r.verdict === "GREEN" ? 0 : 1);
}

await main();
