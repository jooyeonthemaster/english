// 시험지 인쇄 훅(usePrintPortal · useExamPrintController)을 **진짜 React(react-dom/client)** 로 돌리는 테스트 도구 —
// 저장소에 jsdom 이 없다(devDependency 추가 금지). 훅은 null 을 그리는 하네스 컴포넌트 안에서 부르므로 React 가 만드는
// 호스트 DOM 은 0 이고, 훅이 직접 만지는 DOM(루트 · 포털 호스트 · body 클래스 · 창 사건)만 가짜 문서 · 창이 흉내 낸다.
//
// 모듈 가로채기(tsx 는 이 저장소의 .ts 를 CommonJS 로 싣는다 — "type":"module" 이 없다):
//   · "@/actions/exams"(서버 액션) · "sonner"(토스트) → 호출을 기록하는 가짜
//   · "react" · "react-dom" → 언제나 저장소 node_modules — EXAM_PRINT_SRC_ROOT(결함을 심은 사본)에서 실어도 같은
//     React 인스턴스를 쓴다(사본 폴더에는 node_modules 가 없다).
// 이 파일은 테스트 도구다 — 동작 계약은 print-portal.gate.mjs · print-controller.gate.mjs 에 있다.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FakeClock, FakeEl } from "./fake-print-env.mjs";

/** 실제 저장소(node_modules) */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
/** 시험할 소스 루트 — EXAM_PRINT_SRC_ROOT 로 사본을 가리키면 그 사본의 모듈을 시험한다(계기 음성테스트) */
export const SRC = process.env.EXAM_PRINT_SRC_ROOT ? path.resolve(process.env.EXAM_PRINT_SRC_ROOT) : REPO;
export const loadSrc = (rel) => import(pathToFileURL(path.join(SRC, rel)).href);

/**
 * 가짜 문서(html > head · body). getElementById · querySelector 는 문서 순서상 첫 매칭(문서에 붙은 노드만).
 * 붙지 않은 노드는 못 찾는다 — 포털 호스트를 떼면 문서에서 사라지는 것까지 흉내 낸다.
 */
export function fakeDom({ fonts, visibilityState = "visible" } = {}) {
  const html = new FakeEl("html");
  const head = new FakeEl("head");
  const body = new FakeEl("body");
  html.append(head, body);
  html.isDocumentRoot = true;
  const doc = {
    nodeType: 9,
    documentElement: html,
    head,
    body,
    fonts,
    visibilityState,
    activeElement: null,
    createElement(tag) {
      const el = new FakeEl(String(tag).toLowerCase());
      el.createdBy = doc;
      return el;
    },
    getElementById(id) {
      for (const el of html.descendants()) if (el.getAttribute("id") === id) return el;
      return null;
    },
    querySelector: (selector) => html.querySelector(selector),
    querySelectorAll: (selector) => html.querySelectorAll(selector),
    addEventListener() {},
    removeEventListener() {},
  };
  html.doc = doc;
  return doc;
}

/**
 * 가짜 창 — 타이머 · rAF · performance 는 시계(clock.win), 사건은 DOM 명세대로 디스패치한다: 리스너마다 **같은 사건
 * 객체**를 넘기고(포털의 「이번 인쇄」 판정이 이것에 기댄다), 디스패치 중 제거된 리스너는 부르지 않는다.
 * print 는 테스트가 바꿔 끼운다(기본: 호출 시각만 기록).
 */
export function fakeWindow(clock, doc) {
  const listeners = new Map();
  const win = {
    document: doc,
    navigator: { userAgent: "node" },
    HTMLIFrameElement: class HTMLIFrameElement {},
    setTimeout: (...a) => clock.win.setTimeout(...a),
    clearTimeout: (...a) => clock.win.clearTimeout(...a),
    requestAnimationFrame: (...a) => clock.win.requestAnimationFrame(...a),
    cancelAnimationFrame: (...a) => clock.win.cancelAnimationFrame(...a),
    performance: { now: () => clock.t },
    /**
     * 문서가 지금 인쇄 레이아웃으로 그려지는 중인가 — matchMedia("print").matches. 테스트가 켠다(기본 false = 화면).
     * 실제 Chromium printToPDF 는 beforeprint 리스너 안에서는 false, 그 뒤 캡처 동안 true, afterprint 에서 false(PH-R1 실측).
     */
    printMedia: false,
    matchMedia: (query) => ({
      media: query,
      matches: query === "print" ? win.printMedia : false,
      addEventListener() {},
      removeEventListener() {},
    }),
    printCalls: [],
    print() {
      win.printCalls.push(clock.t);
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      const list = listeners.get(type);
      if (!list.includes(fn)) list.push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type);
      const i = list ? list.indexOf(fn) : -1;
      if (i >= 0) list.splice(i, 1);
    },
    listenerCount: (type) => listeners.get(type)?.length ?? 0,
    /** 사건 하나를 디스패치하고 그 객체를 돌려준다 */
    dispatch(type) {
      const event = { type, timeStamp: clock.t };
      for (const fn of [...(listeners.get(type) ?? [])]) {
        if (listeners.get(type)?.includes(fn)) fn.call(win, event);
      }
      return event;
    },
  };
  return win;
}

let installed = null;

/**
 * 가로채기 · 전역 · React 를 한 번 세운다(게이트 파일마다 프로세스가 따로라 전역 오염이 번지지 않는다).
 * reset() 은 테스트마다 새 시계 · 문서 · 창을 전역에 끼운다. mount() 는 하네스를 동기 커밋한다.
 */
export function createReactHookEnv() {
  if (installed) return installed;
  const require = createRequire(path.join(REPO, "package.json"));
  const Module = require("node:module");
  const calls = { telemetry: [], toasts: [] };
  const stubExports = {
    "@/actions/exams": {
      incrementExamPrintCount(examId, meta) {
        calls.telemetry.push({ examId, meta });
        return Promise.resolve({ success: true });
      },
    },
    sonner: {
      toast: Object.assign((m) => calls.toasts.push(["toast", m]), {
        error: (m) => calls.toasts.push(["error", m]),
        info: (m) => calls.toasts.push(["info", m]),
        success: (m) => calls.toasts.push(["success", m]),
      }),
    },
  };
  const stubIds = {};
  for (const [request, exports] of Object.entries(stubExports)) {
    const id = path.join(REPO, "__exam-print-gate__", `${request.replace(/\W/g, "_")}.cjs`);
    const mod = new Module(id);
    mod.filename = id;
    mod.loaded = true;
    mod.exports = exports;
    require.cache[id] = mod;
    stubIds[request] = id;
  }
  const repoParent = new Module(path.join(REPO, "package.json"));
  repoParent.filename = path.join(REPO, "package.json");
  repoParent.paths = Module._nodeModulePaths(REPO);
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
    if (stubIds[request]) return stubIds[request];
    if (/^react(-dom)?(\/|$)/.test(request)) return originalResolve.call(this, request, repoParent, ...rest);
    return originalResolve.call(this, request, parent, ...rest);
  };

  const env = { clock: null, doc: null, win: null, calls };
  env.reset = ({ fonts } = {}) => {
    env.clock = new FakeClock();
    env.doc = fakeDom({ fonts: typeof fonts === "function" ? fonts(env.clock) : fonts });
    env.win = fakeWindow(env.clock, env.doc);
    globalThis.window = env.win;
    globalThis.document = env.doc;
    calls.telemetry.length = 0;
    calls.toasts.length = 0;
    return env;
  };
  env.reset();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;

  const React = require("react");
  const { createRoot } = require("react-dom/client");
  const { flushSync } = require("react-dom");
  env.React = React;
  env.flushSync = flushSync;
  /** React 스케줄러(setImmediate) 작업을 비운다 — 기본 우선순위 갱신 · 패시브 이펙트 */
  env.settle = async (rounds = 8) => {
    for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
  };
  /** 하네스 컴포넌트를 동기 커밋한다(StrictMode 기본 — 이펙트 이중 실행까지 시험한다) */
  env.mount = (Component, props = {}, { strict = true } = {}) => {
    const root = createRoot(env.doc.createElement("div"));
    const render = (p) => {
      const el = React.createElement(Component, p);
      flushSync(() => root.render(strict ? React.createElement(React.StrictMode, null, el) : el));
    };
    render(props);
    return {
      rerender: (next) => render({ ...props, ...next }),
      unmount: () => root.unmount(),
    };
  };
  installed = env;
  return env;
}

/** 본문 쪽 프레임이 있는 인쇄 루트를 wrapper 안에 두고(앞뒤 형제 포함) 부모에 붙인다 */
export function placeRoot(parent, root, label) {
  const wrapper = new FakeEl("div", { attrs: { "data-wrapper": label } });
  const before = new FakeEl("div", { attrs: { "data-before": label } });
  const after = new FakeEl("div", { attrs: { "data-after": label } });
  wrapper.append(before, root, after);
  parent.appendChild(wrapper);
  return { wrapper, before, after };
}

/** 문서 안 #exam-print-host 전부(가짜 문서 순서) */
export function printHosts(doc) {
  return [...doc.documentElement.descendants()].filter((el) => el.getAttribute("id") === "exam-print-host");
}
