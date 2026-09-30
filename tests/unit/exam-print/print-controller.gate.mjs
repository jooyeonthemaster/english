// useExamPrintController — 동작 게이트(진짜 React · 가짜 문서/창/시계, jsdom 없음). tests/unit/exam-print-behavior.test.mjs
// 가 `node --import=tsx --test` 로 띄운다. EXAM_PRINT_SRC_ROOT 로 사본을 가리키면 그 사본의 훅을 시험한다.
//
// 지키는 것(docs/EXAM-PRINT-PIPELINE.md §3.2):
//   · 준비 중에 사용자가 직접 연 인쇄(Ctrl+P · 브라우저 메뉴)가 오면 잡을 그 인쇄에 넘긴다 — print() 0회 · 원격 측정 0건 ·
//     그 afterprint 에서 outcome 'native'(26-09-30 PRINT-R5, 종전: 준비가 끝난 뒤 두 번째 인쇄 창)
//   · 정리(전 쪽 마운트 해제 · done · onFinished)는 afterprint 에서만 — 비차단 print() 반환 직후 금지
//   · print() 동안 beforeprint 0회 → needs-gesture, 다음 잡 prior · 늦은 beforeprint 는 prior 를 지운다(PRINT-R6)
//   · 문서 load 전에는 print() 를 부르지 않는다 — waiting-load, load 사건 다음 태스크에 1회 · 취소 · 넘겨받기(XB-1)
//   · autoStart 는 StrictMode 에서도 정확히 1회
import test from "node:test";
import assert from "node:assert/strict";
import { buildRoot, fakeFontSet } from "./fake-print-env.mjs";
import { createReactHookEnv, loadSrc, placeRoot } from "./react-hook-env.mjs";

const env = createReactHookEnv();
const { useExamPrintController } = await loadSrc("src/components/exams/paper-builder/print/use-exam-print-controller.ts");

/**
 * 인쇄 창 흉내 — desktop: print() 안에서 beforeprint → afterprint(차단형) · mobile: beforeprint 만(비차단, afterprint 는
 * 테스트가 나중에) · blocked: 아무 사건 없음(Safari 가 비제스처 인쇄를 막은 경우)
 */
function setPrinter(kind) {
  env.win.print = () => {
    env.win.printCalls.push(env.clock.t);
    if (kind === "blocked") return;
    env.win.dispatch("beforeprint");
    if (kind === "desktop") env.win.dispatch("afterprint");
  };
}

/** 문서 하나 + 시험지 루트 + 컨트롤러 하네스. fonts: fakeFontSet 옵션 */
async function setup({ fonts = {}, printer = "desktop", isGuardSettled = () => true, autoStart, strict = true } = {}) {
  env.reset();
  const fontSet = fakeFontSet(env.clock, fonts);
  env.doc.fonts = fontSet.fonts;
  const built = buildRoot({ pages: 5, eager: 2 });
  placeRoot(env.doc.body, built.root, "exam");
  setPrinter(printer);
  const seen = { ctl: null, finishes: [] };
  const rootRef = { current: built.root };
  function ControllerHarness(props) {
    const ctl = useExamPrintController({
      rootRef,
      isGuardSettled,
      hasItems: true,
      examId: "exam-1",
      entry: "detail",
      autoStart: props.autoStart,
      onFinished: (finish) => seen.finishes.push(finish),
    });
    // PreviewPages 흉내 — forceMountAll 이 켜지는 커밋 안에서 전 쪽을 그린다(LazyPaperPage 는 렌더에서 반영)
    env.React.useLayoutEffect(() => {
      if (ctl.forceMountAll) built.mountAll();
    }, [ctl.forceMountAll]);
    seen.ctl = ctl;
    return null;
  }
  const h = env.mount(ControllerHarness, { autoStart }, { strict });
  await env.settle();
  return { ...h, seen, built, fontSet };
}

const phase = (s) => s.seen.ctl.state.phase;
const outcomes = (s) => s.seen.finishes.map((f) => f.outcome);
const telemetry = () => env.calls.telemetry.map((t) => t.meta.outcome);
/** 시계를 끝까지(대기 중인 타이머 전부) 돌리고 React 작업을 비운다 */
async function drain(until = () => false, maxT = 30000) {
  await env.clock.runUntil(until, maxT);
  await env.settle();
}

test("controller(PRINT-R5): 준비 중에 사용자가 Ctrl+P 로 직접 인쇄하면 두 번째 인쇄 창 0 · 원격 측정 0 · outcome native", async () => {
  const s = await setup({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  s.seen.ctl.print("plain");
  await drain(() => phase(s) === "preparing");
  assert.equal(phase(s), "preparing", "전제: 시험지 글꼴을 기다리는 준비 경로");
  // 사용자의 Ctrl+P — 브라우저가 쏜 인쇄(데스크톱은 print 창이 닫힐 때까지 막고 afterprint)
  env.win.dispatch("beforeprint");
  env.win.dispatch("afterprint");
  await drain(); // 글꼴이 도착해 준비가 이어질 시간까지 전부
  assert.equal(env.win.printCalls.length, 0, `컨트롤러가 print() 를 ${env.win.printCalls.length}회 더 불렀다(두 번째 인쇄 창)`);
  assert.deepEqual(telemetry(), [], "네이티브 인쇄는 컨트롤러가 기록하지 않는다(중복 기록 0)");
  assert.deepEqual(s.seen.finishes, [{ outcome: "native", mode: "plain", meta: null }]);
  assert.equal(phase(s), "done");
  assert.equal(s.seen.ctl.busy, false);
  assert.equal(s.seen.ctl.forceMountAll, false);

  // 잡이 깨끗이 끝났다 — 다음 버튼 인쇄는 정상(글꼴 준비됨 → 빠른 경로 동기 인쇄)
  s.seen.ctl.print("plain");
  await drain();
  assert.equal(env.win.printCalls.length, 1);
  assert.deepEqual(telemetry(), ["printed"]);
  assert.deepEqual(outcomes(s), ["native", "printed"]);
  s.unmount();
});

test("controller(PRINT-R5): 모바일 — 네이티브 인쇄 창이 떠 있는 동안 글꼴이 와도 인쇄하지 않고, 그 afterprint 에서 끝난다", async () => {
  const s = await setup({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  s.seen.ctl.print("explanation");
  await drain(() => phase(s) === "preparing");
  env.win.dispatch("beforeprint"); // 비차단 — afterprint 는 창이 닫힐 때
  await drain(); // 글꼴 도착 · 준비 재개 시점을 모두 지난다
  assert.equal(env.win.printCalls.length, 0);
  assert.equal(phase(s), "printing", "사용자가 연 인쇄 창이 떠 있다");
  assert.deepEqual(s.seen.finishes, []);
  env.win.dispatch("afterprint");
  await env.settle();
  assert.deepEqual(outcomes(s), ["native"]);
  assert.equal(phase(s), "done");
  assert.equal(s.seen.ctl.explanation, false);
  assert.deepEqual(telemetry(), []);
  s.unmount();
});

test("controller(PRINT-R5): 전 쪽을 그린 뒤 가드 수렴을 기다리는 중에 온 네이티브 인쇄도 넘겨받는다 — 전 쪽 마운트는 afterprint 에서 해제", async () => {
  let settled = false;
  const s = await setup({ isGuardSettled: () => settled });
  env.clock.win.setTimeout(() => (settled = true), 400);
  s.seen.ctl.print("plain");
  await drain(() => phase(s) === "preparing");
  assert.equal(s.seen.ctl.forceMountAll, true, "전제: 전 쪽 마운트 뒤 가드 대기");
  env.win.dispatch("beforeprint");
  assert.equal(s.seen.ctl.forceMountAll, true, "인쇄 중에는 전 쪽 마운트를 유지한다");
  env.win.dispatch("afterprint");
  await drain();
  assert.equal(env.win.printCalls.length, 0);
  assert.deepEqual(outcomes(s), ["native"]);
  assert.equal(s.seen.ctl.forceMountAll, false);
  s.unmount();
});

test("controller: 네이티브 인쇄 없는 준비 경로는 글꼴 도착 뒤 정확히 1회 인쇄 · 기록 1건 · outcome printed", async () => {
  const s = await setup({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  s.seen.ctl.print("plain");
  await drain();
  assert.equal(env.win.printCalls.length, 1);
  assert.ok(env.win.printCalls[0] >= 300, "글꼴 도착 전에 인쇄했다");
  assert.deepEqual(telemetry(), ["printed"]);
  assert.equal(env.calls.telemetry[0].meta.path, "prepare");
  assert.deepEqual(outcomes(s), ["printed"]);
  assert.equal(phase(s), "done");
  s.unmount();
});

test("controller: 비차단 print()(모바일) — 반환 직후에는 정리하지 않고 afterprint 에서 한 번 정리한다", async () => {
  const s = await setup({ printer: "mobile" });
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(phase(s), "printing");
  assert.equal(s.seen.ctl.forceMountAll, true, "print() 반환 직후 전 쪽 마운트를 풀면 인쇄 전에 원복된다");
  assert.deepEqual(s.seen.finishes, []);
  env.win.dispatch("afterprint");
  await env.settle();
  assert.equal(phase(s), "done");
  assert.equal(s.seen.ctl.forceMountAll, false);
  assert.deepEqual(outcomes(s), ["printed"]);
  s.unmount();
});

test("controller: print() 동안 beforeprint 0회 → needs-gesture · 다음 잡 prior · 늦은 beforeprint 는 prior 를 지운다(PRINT-R6)", async () => {
  const s = await setup({ printer: "blocked" });
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(phase(s), "needs-gesture");
  setPrinter("desktop");
  s.seen.ctl.print("plain"); // 상태 표시줄 [인쇄](새 제스처)
  await env.settle();
  assert.deepEqual(env.calls.telemetry.map((t) => t.meta.prior ?? null), [null, "needs-gesture"]);

  setPrinter("blocked");
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(phase(s), "needs-gesture");
  env.win.dispatch("beforeprint"); // 인쇄 창이 늦게 떴다
  env.win.dispatch("afterprint");
  await env.settle();
  assert.equal(phase(s), "done");
  setPrinter("desktop");
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(env.calls.telemetry.at(-1).meta.prior, undefined, "늦게라도 인쇄됐으면 다음 잡은 재시도가 아니다");
  s.unmount();
});

test("controller(XB-1): 문서 load 전에는 print() 를 부르지 않고 waiting-load — 연타 무시, load 사건이 끝난 다음 태스크에 1회 인쇄", async () => {
  const s = await setup();
  env.doc.readyState = "interactive"; // 무관한 UI 글꼴(CDN)이 load 를 붙잡고 있다
  s.seen.ctl.print("plain");
  await drain(() => phase(s) === "waiting-load");
  assert.equal(phase(s), "waiting-load");
  assert.equal(s.seen.ctl.busy, true, "대기 중에는 인쇄 버튼을 막는다");
  s.seen.ctl.print("plain"); // 조바심에 다시 누름
  await drain();
  assert.equal(env.win.printCalls.length, 0, "load 전에 print() 를 불렀다(브라우저가 미루고, 미뤄진 인쇄가 React 를 멈춘다)");
  assert.deepEqual(telemetry(), [], "인쇄 전 기록");
  // load — 리스너(같은 태스크) 안에서는 아직 부르지 않는다: 미뤄진 인쇄는 load 와 같은 태스크에서 발화한다
  env.doc.readyState = "complete";
  env.win.dispatch("load");
  await env.settle(); // 마이크로태스크 · React 작업까지(가짜 시계의 타이머 = 다음 태스크는 아직)
  assert.equal(env.win.printCalls.length, 0, "load 와 같은 태스크(리스너 · 이어진 마이크로태스크)에서 print() 를 불렀다(다시 미뤄진다)");
  await drain();
  assert.equal(env.win.printCalls.length, 1);
  assert.deepEqual(telemetry(), ["printed"]);
  assert.equal(env.calls.telemetry[0].meta.path, "prepare");
  assert.deepEqual(outcomes(s), ["printed"]);
  assert.equal(phase(s), "done");
  assert.equal(env.win.listenerCount("load"), 0, "load 리스너가 남았다");
  s.unmount();
});

test("controller(XB-1): load 대기 중 취소하면 load 뒤에도 인쇄 · 기록 0, Ctrl+P 는 넘겨받는다(PRINT-R5)", async () => {
  const s = await setup();
  env.doc.readyState = "loading";
  s.seen.ctl.print("explanation");
  await drain(() => phase(s) === "waiting-load");
  s.seen.ctl.cancel();
  await env.settle();
  assert.equal(phase(s), "idle");
  env.doc.readyState = "complete";
  env.win.dispatch("load");
  await drain();
  assert.equal(env.win.printCalls.length, 0, "취소한 잡이 load 뒤 인쇄했다");
  assert.deepEqual(telemetry(), []);
  assert.equal(s.seen.ctl.explanation, false);

  // 대기 중 사용자가 직접 연 인쇄(브라우저 인쇄는 미뤄지지 않는다) — 잡은 넘겨주고 load 뒤 두 번째 인쇄 0
  env.doc.readyState = "interactive";
  s.seen.ctl.print("plain");
  await drain(() => phase(s) === "waiting-load");
  env.win.dispatch("beforeprint");
  env.win.dispatch("afterprint");
  env.doc.readyState = "complete";
  env.win.dispatch("load");
  await drain();
  assert.equal(env.win.printCalls.length, 0);
  assert.deepEqual(outcomes(s), ["cancelled", "native"]);
  assert.equal(phase(s), "done");
  s.unmount();
});

test("controller: autoStart 는 StrictMode(이펙트 이중 실행)에서도 정확히 1회 인쇄한다", async () => {
  const s = await setup({ autoStart: true, strict: true });
  await drain();
  assert.equal(env.win.printCalls.length, 1);
  assert.deepEqual(telemetry(), ["printed"]);
  s.rerender({ autoStart: true });
  await drain();
  assert.equal(env.win.printCalls.length, 1, "다시 렌더해도 두 번째 자동 인쇄는 없다");
  s.unmount();
});
