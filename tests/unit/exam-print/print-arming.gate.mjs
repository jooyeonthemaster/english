// 인쇄 진입점 누름 무장 — 동작 게이트(진짜 React · 가짜 문서/창/시계). tests/unit/exam-print-behavior.test.mjs 가
// `node --import=tsx --test` 로 띄운다. EXAM_PRINT_SRC_ROOT 로 사본을 가리키면 그 사본을 시험한다(계기 음성테스트).
//
// 지키는 것(26-09-30 PRINT-RESPONSE · CC-2 / PRINT-R4 — print-arming.ts):
//   · 누르는 순간(pointerdown · Enter/Space) 「준비 중」이 무장된다 — click 전에 페인트될 수 있게. 무장은 호스트를 다시
//     그리지 않고(외부 스토어) busy(= 버튼 disabled)를 켜지 않는다(켜면 뒤따를 click 이 사라져 인쇄가 안 된다)
//   · 인쇄는 여전히 click 안에서 동기로 — 무장 뒤 click 이면 print() 1회, 무장 표시는 잡의 다음 상태 커밋에서 사라진다
//   · 인쇄로 이어지지 않은 누름은 타이머 없이 풀린다: mouse = pointerup 뒤 첫 프레임, touch = 떼는 점이 밖 · cancel ·
//     contextmenu · 다른 곳 click(프레임으로 풀지 않는다 — Chromium touch 는 click 이 rAF 뒤에 온다), Enter = keydown 뒤
//     첫 프레임, Space = keyup 뒤 첫 프레임
//   · 준비 경로로 가도 표시줄이 깜박이지 않는다(무장 → preparing 사이에 보이지 않는 커밋 없음)
//   · autoStart(카드 대화상자 · ?print=1)는 무장 프레임을 한 번 페인트한 뒤 다음 프레임에 인쇄 — StrictMode 1회 그대로
import test from "node:test";
import assert from "node:assert/strict";
import { buildRoot, fakeFontSet } from "./fake-print-env.mjs";
import { createReactHookEnv, loadSrc, placeRoot } from "./react-hook-env.mjs";

const env = createReactHookEnv();
const pick = (mod, name) => mod[name] ?? mod.default?.[name];
const ctlMod = await loadSrc("src/components/exams/paper-builder/print/use-exam-print-controller.ts");
const armMod = await loadSrc("src/components/exams/paper-builder/print/print-arming.ts");
const uiMod = await loadSrc("src/components/exams/paper-builder/print/print-arm-ui.tsx");
const barMod = await loadSrc("src/components/exams/paper-builder/print/print-status-bar.tsx");
const useExamPrintController = pick(ctlMod, "useExamPrintController");
const printArmIntent = pick(armMod, "printArmIntent");
const usePrintArmed = pick(uiMod, "usePrintArmed");
const printBarView = pick(barMod, "printBarView");

/** 창 사건 — 가짜 창의 dispatch 는 속성을 못 싣는다. 리스너 등록을 옆에서 받아 적어 속성 있는 사건을 쏜다. */
function recordListeners(win) {
  const reg = new Map();
  const add = win.addEventListener.bind(win);
  const remove = win.removeEventListener.bind(win);
  win.addEventListener = (type, fn, opt) => {
    add(type, fn, opt);
    if (!reg.has(type)) reg.set(type, []);
    if (!reg.get(type).includes(fn)) reg.get(type).push(fn);
  };
  win.removeEventListener = (type, fn, opt) => {
    remove(type, fn, opt);
    const list = reg.get(type);
    const i = list ? list.indexOf(fn) : -1;
    if (i >= 0) list.splice(i, 1);
  };
  return (type, props = {}) => {
    const event = { type, timeStamp: env.clock.t, ...props };
    for (const fn of [...(reg.get(type) ?? [])]) if (reg.get(type).includes(fn)) fn.call(win, event);
    return event;
  };
}

function setPrinter(kind) {
  env.win.print = () => {
    env.win.printCalls.push(env.clock.t);
    if (kind === "blocked") return;
    env.win.dispatch("beforeprint");
    if (kind === "desktop") env.win.dispatch("afterprint");
  };
}

const TRIGGER = { disabled: false, isConnected: true, getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40 }) };
/** React 합성 사건 모양(무장에 필요한 면만) */
function press(type, props = {}) {
  const nativeEvent = { type };
  return { type, currentTarget: TRIGGER, nativeEvent, ...props };
}
const mouseDown = (extra) => press("pointerdown", { pointerType: "mouse", button: 0, isPrimary: true, ...extra });
const touchDown = (extra) => press("pointerdown", { pointerType: "touch", button: 0, isPrimary: true, ...extra });
const keyDown = (key, extra) => press("keydown", { key, repeat: false, ...extra });

async function setup({ fonts = {}, printer = "desktop", autoStart, hasItems = true, strict = true } = {}) {
  env.reset();
  const fire = recordListeners(env.win);
  env.doc.fonts = fakeFontSet(env.clock, fonts).fonts;
  const built = buildRoot({ pages: 5, eager: 2 });
  placeRoot(env.doc.body, built.root, "exam");
  setPrinter(printer);
  const seen = { ctl: null, hostRenders: 0, barRenders: 0, bar: [], finishes: [], barAtPrint: -1 };
  const printer0 = env.win.print;
  env.win.print = () => {
    seen.barAtPrint = seen.bar.length; // print() 순간까지 표시줄 커밋 수
    printer0();
  };
  const rootRef = { current: built.root };
  // 상태 표시줄 흉내 — 실제 표시줄과 같은 판정(printBarView)으로 커밋마다 「보이나」를 적는다
  function BarProbe({ ctl }) {
    seen.barRenders += 1;
    const armed = usePrintArmed(ctl.arming);
    const view = printBarView(ctl.state, armed);
    env.React.useLayoutEffect(() => {
      seen.bar.push(view.visible ? view.phase : "hidden");
    });
    seen.armed = armed;
    return null;
  }
  function Host(props) {
    seen.hostRenders += 1;
    const ctl = useExamPrintController({
      rootRef,
      isGuardSettled: () => true,
      hasItems: props.hasItems,
      examId: "exam-1",
      entry: "detail",
      autoStart: props.autoStart,
      onFinished: (finish) => seen.finishes.push(finish.outcome),
    });
    env.React.useLayoutEffect(() => {
      if (ctl.forceMountAll) built.mountAll();
    }, [ctl.forceMountAll]);
    seen.ctl = ctl;
    return env.React.createElement(BarProbe, { ctl });
  }
  const h = env.mount(Host, { autoStart, hasItems }, { strict });
  await env.settle();
  return { ...h, seen, fire };
}

const frame = async () => {
  await env.clock.step();
  await env.settle();
};
const armed = (s) => s.seen.ctl.arming.get();
const phase = (s) => s.seen.ctl.state.phase;

test("arming: 누름 의도 — 주 버튼 mouse · touch/pen · Enter · Space 만, 보조 버튼 · 비주 포인터 · 비활성 · 반복 키는 무장하지 않는다", () => {
  assert.equal(printArmIntent(mouseDown()), "mouse");
  assert.equal(printArmIntent(touchDown()), "touch");
  assert.equal(printArmIntent(press("pointerdown", { pointerType: "pen", button: 0 })), "touch");
  assert.equal(printArmIntent(keyDown("Enter")), "key-enter");
  assert.equal(printArmIntent(keyDown(" ")), "key-space");
  assert.equal(printArmIntent(mouseDown({ button: 2 })), null, "오른쪽 버튼(click 없음)");
  assert.equal(printArmIntent(touchDown({ isPrimary: false })), null, "두 번째 손가락");
  assert.equal(printArmIntent(mouseDown({ currentTarget: { disabled: true } })), null, "비활성 버튼");
  assert.equal(printArmIntent(keyDown("Enter", { repeat: true })), null, "키 반복");
  assert.equal(printArmIntent(keyDown("Tab")), null);
  assert.equal(printArmIntent(press("keyup", { key: "Enter" })), null);
});

test("arming(mouse): 누르면 click 전에 「준비 중」 — 호스트 재렌더 0 · busy 거짓(버튼이 막히지 않는다) · click 안 print() 1회 · 인쇄 뒤 표시 해제", async () => {
  const s = await setup();
  const hostBefore = s.seen.hostRenders;
  assert.equal(s.seen.ctl.arming.arm("plain", mouseDown()), true);
  await env.settle();
  assert.equal(armed(s), "plain");
  assert.equal(s.seen.armed, "plain", "표시줄 구독자가 무장을 받았다");
  assert.equal(s.seen.bar.at(-1), "preparing", "click 전 커밋에서 표시줄이 「준비 중」");
  assert.equal(s.seen.hostRenders, hostBefore, `무장이 호스트를 ${s.seen.hostRenders - hostBefore}회 다시 그렸다(빌더 전체 재렌더 = 수백 ms)`);
  assert.equal(s.seen.ctl.busy, false, "무장이 busy 를 켜면 인쇄 버튼이 disabled 가 되어 click 이 사라진다");
  // 누름과 click 사이 프레임이 여러 번 돌아도(사람 누름 ~90ms) 무장은 유지된다
  await frame();
  await frame();
  assert.equal(armed(s), "plain");
  // 떼기 → 같은 태스크의 click → 인쇄
  s.fire("pointerup", { pointerType: "mouse" });
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(env.win.printCalls.length, 1, "click 안에서 print() 가 불리지 않았다");
  assert.deepEqual(s.seen.finishes, ["printed"]);
  assert.equal(armed(s), null, "인쇄 뒤 무장 표시가 남았다");
  assert.equal(phase(s), "done");
  assert.equal(s.seen.bar.at(-1), "hidden");
  await frame(); // 소비된 무장의 해제 프레임은 아무것도 하지 않는다
  assert.equal(env.win.printCalls.length, 1);
  s.unmount();
});

test("arming(mouse): 누른 채 밖으로 끌어 떼면(click 없음) 다음 프레임에 해제 · 인쇄 0 · 원격 측정 0", async () => {
  const s = await setup();
  s.seen.ctl.arming.arm("plain", mouseDown());
  await env.settle();
  s.fire("pointerup", { pointerType: "mouse", clientX: 500, clientY: 500 });
  assert.equal(armed(s), "plain", "같은 태스크 안에서는 아직 click 이 올 수 있다");
  await frame();
  assert.equal(armed(s), null, "click 없는 누름의 무장이 남았다");
  assert.equal(s.seen.bar.at(-1), "hidden");
  assert.equal(env.win.printCalls.length, 0);
  assert.deepEqual(env.calls.telemetry, []);
  s.unmount();
});

test("arming(touch): 떼는 점이 버튼 안이면 프레임이 지나도 유지(click 이 늦게 온다) → click 으로 인쇄 · 밖 · cancel · 길게 누름 · 다른 곳 click 은 해제", async () => {
  const s = await setup();
  s.seen.ctl.arming.arm("explanation", touchDown());
  await env.settle();
  s.fire("pointerup", { pointerType: "touch", clientX: 50, clientY: 20 });
  await frame();
  await frame();
  assert.equal(armed(s), "explanation", "touch 무장을 프레임으로 풀었다(Chromium 은 pointerup 뒤 rAF 가 click 보다 먼저)");
  s.seen.ctl.print("explanation");
  await env.settle();
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(armed(s), null);

  for (const [label, end] of [
    ["버튼 밖에서 뗌", () => s.fire("pointerup", { pointerType: "touch", clientX: 300, clientY: 20 })],
    ["pointercancel(스크롤)", () => s.fire("pointercancel", { pointerType: "touch" })],
    ["contextmenu(길게 누름)", () => s.fire("contextmenu")],
    ["다른 곳 click", () => s.fire("click")],
    ["다른 곳 새 누름", () => s.fire("pointerdown", { pointerType: "touch" })],
    ["창 blur(다른 앱으로 전환)", () => s.fire("blur", { target: env.win })],
  ]) {
    s.seen.ctl.arming.arm("plain", touchDown());
    await env.settle();
    assert.equal(armed(s), "plain", `${label}: 전제 — 무장`);
    end();
    await env.settle();
    assert.equal(armed(s), null, `${label}: 무장이 풀리지 않았다`);
  }
  assert.equal(env.win.printCalls.length, 1, "해제된 누름이 인쇄했다");
  s.unmount();
});

test("arming: 메뉴 항목을 누를 때 요소 사이 포커스 이동(blur · 창 캡처로 지나감)은 무장을 풀지 않는다 — 창 자신의 blur 만 푼다", async () => {
  const s = await setup();
  // [다운로드]를 눌러 메뉴를 연 뒤 [PDF 해설]을 누르면 [다운로드] 버튼이 blur 된다(26-09-30 실측 — 이것으로 무장이 즉시 풀렸다)
  s.seen.ctl.arming.arm("explanation", mouseDown());
  await env.settle();
  s.fire("blur", { target: { tagName: "BUTTON" } });
  s.fire("focusout", { target: { tagName: "BUTTON" } });
  await env.settle();
  assert.equal(armed(s), "explanation", "요소 blur 가 무장을 풀었다(메뉴 PDF · PDF 해설은 click 전 「준비 중」이 안 보인다)");
  s.fire("pointerup", { pointerType: "mouse" });
  s.seen.ctl.print("explanation");
  await env.settle();
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(armed(s), null);
  s.unmount();
});

test("arming(keyboard): Enter 는 keydown 뒤 첫 프레임 · Space 는 keyup 뒤 첫 프레임까지 click 을 기다린다(키보드 활성화 그대로)", async () => {
  const s = await setup();
  // Enter + 같은 태스크 click → 인쇄
  s.seen.ctl.arming.arm("plain", keyDown("Enter"));
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(armed(s), null);
  // Enter 인데 click 이 없었다(다른 핸들러가 막음) → 다음 프레임 해제
  s.seen.ctl.arming.arm("plain", keyDown("Enter"));
  await env.settle();
  assert.equal(armed(s), "plain");
  await frame();
  assert.equal(armed(s), null, "click 없는 Enter 의 무장이 남았다");
  // Space: 누르고 있는 동안 프레임이 돌아도 유지(= 이 사이에 페인트) → keyup + click
  s.seen.ctl.arming.arm("explanation", keyDown(" "));
  await frame();
  await frame();
  assert.equal(armed(s), "explanation", "Space 를 누르고 있는 동안 무장이 풀렸다");
  s.fire("keyup", { key: " " });
  s.seen.ctl.print("explanation");
  await env.settle();
  assert.equal(env.win.printCalls.length, 2);
  // Space 를 떼기 전에 포커스가 떠나 click 이 없다 → keyup 뒤 프레임 해제
  s.seen.ctl.arming.arm("plain", keyDown(" "));
  s.fire("keyup", { key: " " });
  await frame();
  assert.equal(armed(s), null);
  assert.equal(env.win.printCalls.length, 2);
  s.unmount();
});

test("arming: 준비 경로로 가도 표시줄이 깜박이지 않는다(무장 → preparing 사이 숨은 커밋 0) · [취소] 는 무장도 푼다", async () => {
  const s = await setup({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  s.seen.ctl.arming.arm("plain", mouseDown());
  await env.settle();
  const from = s.seen.bar.length - 1;
  s.fire("pointerup", { pointerType: "mouse" });
  s.seen.ctl.print("plain");
  await env.settle();
  await env.clock.runUntil(() => env.win.printCalls.length > 0, 30000);
  await env.settle();
  const trail = s.seen.bar.slice(from, s.seen.barAtPrint);
  assert.equal(trail[0], "preparing", `전제: 무장 커밋(${trail.join(" → ")})`);
  assert.ok(!trail.includes("hidden"), `무장 → 인쇄 사이에 표시줄이 사라진 커밋이 있다: ${trail.join(" → ")}`);
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(env.calls.telemetry[0].meta.path, "prepare");
  assert.equal(armed(s), null);

  s.seen.ctl.arming.arm("plain", mouseDown());
  await env.settle();
  s.seen.ctl.cancel();
  await env.settle();
  assert.equal(armed(s), null, "[취소] 가 무장을 풀지 않았다");
  assert.equal(s.seen.bar.at(-1), "hidden");
  s.unmount();

  // 첫 인쇄 전(상태 IDLE 그대로 — 상태 커밋이 일어나지 않는다)의 [취소]
  const f = await setup();
  f.seen.ctl.arming.arm("plain", touchDown());
  await env.settle();
  assert.equal(f.seen.bar.at(-1), "preparing");
  f.seen.ctl.cancel();
  await env.settle();
  assert.equal(armed(f), null, "잡 없는 [취소] 가 무장을 풀지 않았다(「준비 중」이 남는다)");
  assert.equal(f.seen.bar.at(-1), "hidden");
  f.unmount();
});

test("arming: 준비 중(연타)에는 무장하지 않고, 문항이 없으면 click 이 무장을 푼다", async () => {
  const s = await setup({ fonts: { exam: "unloaded", onLoad: { after: 300 } } });
  s.seen.ctl.print("plain");
  await env.settle();
  assert.equal(phase(s), "preparing");
  assert.equal(s.seen.ctl.arming.arm("plain", mouseDown()), false, "준비 중인데 무장했다");
  assert.equal(armed(s), null);
  s.unmount();

  const e = await setup({ hasItems: false });
  e.seen.ctl.arming.arm("plain", mouseDown());
  await env.settle();
  e.seen.ctl.print("plain");
  await env.settle();
  assert.equal(armed(e), null, "빈 시험지 click 뒤 무장이 남았다");
  assert.equal(env.win.printCalls.length, 0);
  e.unmount();
});

test("arming(autoStart): 무장 프레임을 먼저 페인트하고 다음 프레임에 인쇄 — StrictMode 에서도 정확히 1회", async () => {
  const s = await setup({ autoStart: true, strict: true });
  await frame(); // 래치 프레임
  assert.equal(armed(s), "plain", "자동 인쇄가 「준비 중」을 먼저 그리지 않았다");
  assert.equal(s.seen.bar.at(-1), "preparing");
  assert.equal(env.win.printCalls.length, 0, "무장과 같은 프레임에서 인쇄했다(페인트 기회 없음)");
  await env.clock.runUntil(() => env.win.printCalls.length > 0, 30000);
  await env.settle();
  assert.equal(env.win.printCalls.length, 1);
  assert.equal(armed(s), null);
  s.rerender({ autoStart: true });
  await env.clock.runUntil(() => false, 2000);
  await env.settle();
  assert.equal(env.win.printCalls.length, 1, "두 번째 자동 인쇄");
  s.unmount();
});

test("arming(autoStart): 래치 뒤 autoStart 가 꺼져도(?print=1 제거 재렌더) 인쇄하고, 그 사이 언마운트면 인쇄하지 않는다", async () => {
  const s = await setup({ autoStart: true });
  await frame();
  s.rerender({ autoStart: false }); // onAutoStart 가 파라미터를 지운 뒤의 재렌더
  await env.settle();
  await env.clock.runUntil(() => env.win.printCalls.length > 0, 5000);
  assert.equal(env.win.printCalls.length, 1, "래치된 자동 인쇄가 autoStart 꺼짐에 취소됐다(딥링크 인쇄 유실)");
  s.unmount();

  const u = await setup({ autoStart: true });
  await frame();
  u.unmount(); // 대화상자 닫기
  await env.clock.runUntil(() => false, 5000);
  assert.equal(env.win.printCalls.length, 0, "닫힌 대화상자가 인쇄했다");
});
