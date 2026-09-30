// 시험지 인쇄 잡 · 준비 판정 · 원격 측정 메타 — 동작 게이트(가짜 DOM · 가짜 시계, React 없음).
// tests/unit/exam-print-behavior.test.mjs 가 `node --import=tsx --test` 로 띄운다(TS 모듈을 직접 import).
// EXAM_PRINT_SRC_ROOT 로 저장소 사본을 가리키면 그 사본의 모듈을 시험한다(계기 음성테스트용).
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FakeClock, FakeEl, buildRoot, fakeDoc, fakeFontSet } from "./fake-print-env.mjs";

const ROOT = process.env.EXAM_PRINT_SRC_ROOT
  ? path.resolve(process.env.EXAM_PRINT_SRC_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const PRINT = "src/components/exams/paper-builder/print";
const readiness = await load(`${PRINT}/print-readiness.ts`);
const jobMod = await load(`${PRINT}/exam-print-job.ts`);
const overflowMod = await load(`${PRINT}/column-overflow.ts`);
const metaMod = await load("src/lib/exams/print-event-meta.ts");

/** 잡 의존성 — 기본은 「모든 조건이 처음부터 참」 */
function setup({ root, clock, doc, overrides = {} }) {
  const log = [];
  const reports = [];
  let atPrint = null;
  const deps = {
    mode: "plain",
    entry: "detail",
    getRoot: () => root,
    isGuardSettled: () => true,
    mountAll: () => log.push("mount"),
    onPreparing: () => log.push("preparing"),
    isDead: () => false,
    report: (meta) => {
      log.push(`report:${meta.outcome}`);
      reports.push(meta);
    },
    invokePrint: () => {
      log.push("print");
      atPrint = { t: clock.t, inspection: readiness.inspectExamPrintRoot(root) };
    },
    env: { doc, win: clock.win, now: clock.now },
    ...overrides,
  };
  return { deps, log, reports, atPrint: () => atPrint };
}

function world(opts = {}) {
  const clock = new FakeClock();
  const built = buildRoot(opts.root);
  const fontSet = fakeFontSet(clock, opts.fonts);
  const roots = [...(opts.before ?? []), built.root];
  const doc = fakeDoc({ roots, fonts: fontSet.fonts });
  return { clock, ...built, fontSet, roots, doc };
}

async function run(deps, clock) {
  let result = null;
  void jobMod.runExamPrintJob(deps).then((r) => (result = r));
  await clock.runUntil(() => result !== null);
  return result;
}

// ─── 원격 측정 메타 ───────────────────────────────────────────────────────────────
const OK = { entry: "detail", mode: "plain", pages: 3, mountedPages: 3, prepareMs: 0, fonts: "loaded", guard: "settled", outcome: "printed" };

test("meta: 유효한 메타는 통과하고 모르는 키는 버린다(선택 필드 · 새 열거값 포함)", () => {
  const meta = metaMod.parsePrintEventMeta({ ...OK, path: "prepare", images: "loaded", prior: "needs-gesture", evil: "<script>" });
  assert.equal(meta.prior, "needs-gesture");
  assert.equal("evil" in meta, false);
  assert.equal(metaMod.parsePrintEventMeta({ ...OK, fonts: "error" }).fonts, "error");
  const stuck = metaMod.parsePrintEventMeta({ ...OK, guard: "stuck", overflowColumns: 2 });
  assert.equal(stuck.guard, "stuck");
  assert.equal(stuck.overflowColumns, 2);
});

test("meta: 필수 · 선택 필드가 하나라도 어긋나면 통째로 null", () => {
  for (const bad of [
    null, "x", [], { ...OK, entry: "iframe" }, { ...OK, mode: "answers" }, { ...OK, pages: -1 },
    { ...OK, pages: 5001 }, { ...OK, mountedPages: 1.5 }, { ...OK, prepareMs: 600001 },
    { ...OK, fonts: "fallback" }, { ...OK, guard: "maybe" }, { ...OK, outcome: "done" },
    { ...OK, path: "slow" }, { ...OK, blockReason: "whatever" }, { ...OK, pages: "3" },
    { ...OK, overflowColumns: -1 }, { ...OK, overflowColumns: 1.5 }, { ...OK, overflowColumns: "2" },
  ]) {
    assert.equal(metaMod.parsePrintEventMeta(bad), null, JSON.stringify(bad));
  }
});

test("meta: blocked 는 인쇄 횟수에 넣지 않고, 메타 없는 종전 호출은 센다", () => {
  assert.equal(metaMod.printEventCountsAsPrint({ outcome: "blocked" }), false);
  assert.equal(metaMod.printEventCountsAsPrint({ outcome: "printed" }), true);
  assert.equal(metaMod.printEventCountsAsPrint(undefined), true);
  assert.equal(metaMod.printEventCountsAsPrint(null), true);
});

// ─── 준비 판정 ────────────────────────────────────────────────────────────────────
test("readiness: 표지 · 본문 · 정답표 프레임을 세고 안 그려진 본문 쪽을 짚는다 · 차단 조건은 pages · primary-root", () => {
  const { root } = buildRoot({ pages: 4, eager: 2, answerKeys: 2, cover: true });
  const insp = readiness.inspectExamPrintRoot(root);
  assert.deepEqual(
    [insp.frames, insp.mountedFrames, insp.bodyFrames, insp.mountedBodyFrames, insp.missing],
    [7, 5, 4, 2, [2, 3]],
  );
  const snap = { fontsReady: true, inspection: insp, guardSettled: true, primaryRoot: true, visible: true };
  assert.deepEqual(readiness.readinessGaps(snap), ["pages"]);
  assert.deepEqual(
    readiness.blockingGaps(readiness.readinessGaps({ ...snap, fontsReady: false, guardSettled: false, primaryRoot: false })),
    ["pages", "primary-root"],
  );
  assert.equal(jobMod.finalBlockReason(null, true), "no-root");
  assert.equal(jobMod.finalBlockReason(insp, true), "unmounted-pages");
  assert.equal(jobMod.finalBlockReason({ ...insp, missing: [], mountedBodyFrames: 4 }, false), "not-primary-root");
  assert.equal(jobMod.finalBlockReason({ ...insp, missing: [], mountedBodyFrames: 4 }, true), null);
});

test("readiness: 첫 매칭 루트만 주인이다", () => {
  const { root } = buildRoot();
  const intruder = new FakeEl("div", { attrs: { id: "exam-paper-print-root" } });
  assert.equal(readiness.isPrimaryPrintRoot(root, fakeDoc({ roots: [root] })), true);
  assert.equal(readiness.isPrimaryPrintRoot(root, fakeDoc({ roots: [intruder, root] })), false);
  assert.equal(readiness.isPrimaryPrintRoot(null, fakeDoc({ roots: [root] })), false);
});

test("readiness(PRINT-R1): 시험지 글꼴만 본다 — 무관한 UI 글꼴이 영영 로딩이어도 준비 완료", () => {
  const clock = new FakeClock();
  const hung = fakeFontSet(clock, { exam: "loaded", ui: "loading" });
  assert.equal(hung.fonts.status, "loading", "전제: 전역 status 는 loading");
  assert.equal(readiness.examFontsReady(fakeDoc({ roots: [], fonts: hung.fonts })), true);
  assert.equal(readiness.examFontsLoading(fakeDoc({ roots: [], fonts: hung.fonts })), false);
  const examLoading = fakeFontSet(clock, { exam: "loading", ui: "loaded" });
  assert.equal(readiness.examFontsReady(fakeDoc({ roots: [], fonts: examLoading.fonts })), false);
  assert.equal(readiness.examFontsLoading(fakeDoc({ roots: [], fonts: examLoading.fonts })), true);
});

test("column-overflow: 넘친 칸을 앞에서부터 찾고 skip 칸은 건너뛴다", () => {
  const { root, mountAll } = buildRoot({ pages: 3, eager: 0 });
  mountAll([], { 1: [0, 166], 2: [40, 0] });
  const all = overflowMod.findColumnOverflows(root, {}, false);
  assert.deepEqual(all.map((o) => [o.page, o.column]), [[1, 1], [2, 0]]);
  assert.deepEqual(overflowMod.findColumnOverflows(root).map((o) => [o.page, o.column]), [[1, 1]]);
  assert.deepEqual(overflowMod.findColumnOverflows(root, { "1:1": true }).map((o) => [o.page, o.column]), [[2, 0]]);
});

// ─── 인쇄 잡 ──────────────────────────────────────────────────────────────────────
test("job 빠른 경로: 조건이 모두 참이면 await 없이 같은 동기 호출 안에서 마운트 → 기록 → 인쇄", async () => {
  const w = world();
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll() } });
  const pending = jobMod.runExamPrintJob(h.deps);
  assert.deepEqual(h.log, ["report:printed", "print"], "시계를 돌리기 전에 이미 인쇄했어야 한다(클릭 태스크 안)");
  assert.deepEqual(h.atPrint().inspection.missing, []);
  const result = await pending;
  assert.equal(result.kind, "printed");
  assert.deepEqual([result.meta.path, result.meta.pages, result.meta.mountedPages, result.meta.prepareMs], ["fast", 6, 6, 0]);
  assert.equal("overflowColumns" in result.meta, false);
});

test("job(PRINT-R1): UI 글꼴이 영영 로딩이어도 시험지 글꼴이 준비됐으면 빠른 경로 · 상한 대기 0", async () => {
  const w = world({ fonts: { exam: "loaded", ui: "loading" } });
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll() } });
  const pending = jobMod.runExamPrintJob(h.deps);
  assert.deepEqual(h.log, ["report:printed", "print"]);
  const result = await pending;
  assert.deepEqual([result.meta.path, result.meta.fonts, result.meta.guard], ["fast", "loaded", "settled"]);
});

test("job 준비 경로: 가드가 수렴한 그 프레임에 인쇄한다 — 그 전에는 인쇄하지 않고 고정 대기도 없다", async () => {
  const w = world();
  let settled = false;
  let settledAt = -1;
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll(), isGuardSettled: () => settled },
  });
  w.clock.win.setTimeout(() => {
    settled = true;
    settledAt = w.clock.t;
  }, 137);
  const result = await run(h.deps, w.clock);
  assert.equal(result.kind, "printed");
  const printedAt = h.atPrint().t;
  assert.ok(settledAt > 0 && printedAt >= settledAt, `인쇄 ${printedAt}ms · 수렴 ${settledAt}ms — 수렴 전에 인쇄했다`);
  assert.ok(printedAt - settledAt <= 16, "수렴 신호 뒤 한 프레임 안에 인쇄해야 한다");
  assert.deepEqual([result.meta.path, result.meta.guard], ["prepare", "settled"]);
  assert.equal(h.log.filter((x) => x === "preparing").length, 1);
});

test("job: 가드가 끝내 수렴하지 않으면 4초 상한은 실패 상한일 뿐 — guard=timeout 으로 인쇄", async () => {
  const w = world();
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll(), isGuardSettled: () => false },
  });
  const result = await run(h.deps, w.clock);
  assert.equal(result.meta.guard, "timeout");
  assert.ok(h.atPrint().t >= readiness.PRINT_BUDGETS.guard);
});

test("job: 전 쪽 마운트 직후 가드에 한 번 다시 재게 한다(숨은 루트 구멍) — ensureVisible → mountAll → remeasure → print", async () => {
  const w = world();
  const order = [];
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: {
      ensureVisible: () => order.push("ensureVisible"),
      mountAll: () => {
        order.push("mountAll");
        w.mountAll();
      },
      remeasure: () => order.push("remeasure"),
      invokePrint: () => order.push("print"),
    },
  });
  await jobMod.runExamPrintJob(h.deps);
  assert.deepEqual(order, ["ensureVisible", "mountAll", "remeasure", "print"]);
});

test("job: 끝내 안 그려진 쪽이 있으면 차단 — print() 0회, blocked 원격 측정", async () => {
  const w = world({ root: { pages: 6, eager: 2 } });
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll([3]) } });
  const result = await jobMod.runExamPrintJob(h.deps);
  assert.deepEqual([result.kind, result.reason, result.missing], ["blocked", "unmounted-pages", [3]]);
  assert.deepEqual(h.log, ["report:blocked"]);
  assert.ok(h.reports[0].mountedPages < h.reports[0].pages);
});

test("job: 다른 인쇄 루트가 앞에 있으면 1초 상한 뒤 차단(not-primary-root) · 그 안에 치워지면 내 루트를 인쇄", async () => {
  const intruder = new FakeEl("div", { attrs: { id: "exam-paper-print-root" } });
  const w = world({ before: [intruder] });
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll() } });
  const result = await run(h.deps, w.clock);
  assert.deepEqual([result.kind, result.reason], ["blocked", "not-primary-root"]);
  assert.equal(h.log.includes("print"), false);

  const intruder2 = new FakeEl("div", { attrs: { id: "exam-paper-print-root" } });
  const w2 = world({ before: [intruder2] });
  w2.clock.win.setTimeout(() => (intruder2.connected = false), 300);
  const h2 = setup({ root: w2.root, clock: w2.clock, doc: w2.doc, overrides: { mountAll: () => w2.mountAll() } });
  const result2 = await run(h2.deps, w2.clock);
  assert.equal(result2.kind, "printed");
  assert.ok(h2.atPrint().t >= 300 && h2.atPrint().t < 400, `인쇄 ${h2.atPrint().t}ms`);
});

test("job: 준비 중 취소되면 인쇄 · 기록 모두 0", async () => {
  const w = world();
  let dead = false;
  let settled = false;
  w.clock.win.setTimeout(() => (dead = true), 100);
  w.clock.win.setTimeout(() => (settled = true), 200);
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll(), isGuardSettled: () => settled, isDead: () => dead },
  });
  const result = await run(h.deps, w.clock);
  await w.clock.runUntil(() => false, 1000);
  assert.equal(result.kind, "aborted");
  assert.equal(h.log.includes("print"), false);
  assert.equal(h.reports.length, 0);
});

test("job 글꼴: 시험지 글꼴이 늦게 오면 명시적으로 불러와 도착 뒤 인쇄(fonts=loaded)", async () => {
  const w = world({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  let loadedAtPrint = null;
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll(), invokePrint: () => (loadedAtPrint = w.fontSet.examFaces.map((f) => f.status)) },
  });
  const result = await run(h.deps, w.clock);
  assert.deepEqual(loadedAtPrint, ["loaded", "loaded"]);
  assert.deepEqual([result.meta.fonts, result.meta.path], ["loaded", "prepare"]);
});

test("job 글꼴(PRINT-R1): 시험지 글꼴을 기다리는 동안 UI 글꼴이 걸려 있어도 시험지 면이 오면 곧바로 인쇄", async () => {
  const w = world({ fonts: { exam: "unloaded", ui: "loading", onLoad: { after: 300 } } });
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll() } });
  const result = await run(h.deps, w.clock);
  assert.equal(result.meta.fonts, "loaded");
  assert.ok(result.meta.prepareMs < 1000, `prepareMs ${result.meta.prepareMs} — 전역 fonts.ready 를 기다렸다`);

  // load() 가 먼저 풀리고 면이 뒤늦게 loaded 가 되는 경우에도 전역 fonts.ready 가 아니라 그 면을 기다린다
  const w2 = world({ fonts: { exam: "unloaded", ui: "loading", onLoad: { early: true, after: 300 } } });
  const h2 = setup({ root: w2.root, clock: w2.clock, doc: w2.doc, overrides: { mountAll: () => w2.mountAll() } });
  const result2 = await run(h2.deps, w2.clock);
  assert.equal(result2.meta.fonts, "loaded");
  assert.ok(result2.meta.prepareMs < 1000, `prepareMs ${result2.meta.prepareMs} — 전역 fonts.ready 를 기다렸다`);
});

test("job 글꼴: 글꼴 파일이 거부되면 상한까지 기다리지 않고 fonts=error 로 인쇄 · 영영 안 오면 8초 상한 뒤 timeout", async () => {
  const w = world({ fonts: { exam: "unloaded", onLoad: "error" } });
  const h = setup({ root: w.root, clock: w.clock, doc: w.doc, overrides: { mountAll: () => w.mountAll() } });
  const result = await run(h.deps, w.clock);
  assert.equal(result.meta.fonts, "error");
  assert.ok(w.clock.t < readiness.PRINT_BUDGETS.fonts, `거부인데 ${w.clock.t}ms 기다렸다`);

  const w2 = world({ fonts: { exam: "unloaded", onLoad: "never" } });
  const h2 = setup({ root: w2.root, clock: w2.clock, doc: w2.doc, overrides: { mountAll: () => w2.mountAll() } });
  const result2 = await run(h2.deps, w2.clock);
  assert.equal(result2.meta.fonts, "timeout");
  assert.ok(w2.clock.t >= readiness.PRINT_BUDGETS.fonts);
});

test("job 이미지: 미완료 이미지는 decode 뒤 가드에 다시 재게 하고 인쇄(images=loaded)", async () => {
  const w = world();
  let complete = false;
  const img = new FakeEl("img");
  Object.defineProperty(img, "complete", { get: () => complete });
  img.loading = "lazy";
  img.decode = () => new Promise((resolve) => w.clock.win.setTimeout(() => ((complete = true), resolve()), 250));
  w.body[0].querySelector(".exam-a4-page").append(img);
  let remeasured = 0;
  let completeAtPrint = null;
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll(), remeasure: () => (remeasured += 1), invokePrint: () => (completeAtPrint = complete) },
  });
  const result = await run(h.deps, w.clock);
  assert.equal(completeAtPrint, true);
  assert.equal(img.loading, "eager", "화면 밖 lazy 이미지는 eager 로 바꿔 지금 불러오게 한다");
  assert.equal(remeasured, 2, "전 쪽 마운트 직후 1회 + 이미지 decode 뒤 1회");
  assert.equal(result.meta.images, "loaded");
});

test("job(PRINT-R3): 가드가 수렴했는데 인쇄될 DOM 에 넘친 칸이 남으면 guard=stuck · overflowColumns 로 드러낸다", async () => {
  const w = world({ root: { pages: 3, eager: 0 } });
  const h = setup({
    root: w.root,
    clock: w.clock,
    doc: w.doc,
    overrides: { mountAll: () => w.mountAll([], { 0: [0, 166] }) },
  });
  const result = await jobMod.runExamPrintJob(h.deps);
  assert.equal(result.kind, "printed", "잘린 한 칸 때문에 시험지 전체를 막지는 않는다");
  assert.deepEqual([result.meta.guard, result.meta.overflowColumns], ["stuck", 1]);
  assert.ok(metaMod.parsePrintEventMeta(result.meta), "서버 검증을 통과하는 메타여야 한다");
});
