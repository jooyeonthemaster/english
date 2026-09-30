// 시험지 인쇄 동작 게이트용 최소 가짜 환경 — 저장소에 jsdom 이 없어서 인쇄 잡 · 준비 판정 · 인쇄 포털 · 컨트롤러가
// 실제로 읽고 쓰는 DOM 면만 흉내 낸다: querySelector(All) · closest(단순 · 복합 선택자 — .class #id [attr] [attr='v']
// :not(...), 자손 결합자), 속성 · dataset · style, 트리 조작(appendChild · insertBefore · removeChild · nextSibling ·
// isConnected · offsetParent), 칸 박스, FontFaceSet, 가짜 시계. 문서 · 창 · React 는 react-hook-env.mjs.
// 이 파일은 테스트 도구다 — 시험지 코드의 동작 계약은 *.gate.mjs 에 있다.

const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function matchesSimple(el, token) {
  if (token.startsWith(":not(")) return !matchesCompound(el, token.slice(5, -1));
  if (token.startsWith(".")) return el.classList.includes(token.slice(1));
  if (token.startsWith("#")) return el.getAttribute("id") === token.slice(1);
  if (token.startsWith("[")) {
    const m = token.match(/^\[([\w-]+)(?:=(['"]?)(.*?)\2)?\]$/);
    if (!m) throw new Error(`fake-print-env: 모르는 속성 선택자 ${token}`);
    return m[3] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[3];
  }
  return el.tag === token;
}

function matchesCompound(el, sel) {
  const tokens = sel.match(/:not\([^)]*\)|\[[^\]]*\]|[.#]?[\w-]+/g) ?? [];
  if (tokens.join("") !== sel) throw new Error(`fake-print-env: 모르는 선택자 ${sel}`);
  return tokens.length > 0 && tokens.every((token) => matchesSimple(el, token));
}

/** classList — 배열(기존 게이트의 includes)이면서 DOMTokenList 의 add · remove · contains 를 갖는다 */
class FakeClassList extends Array {
  add(...names) {
    for (const n of names) if (!this.includes(n)) this.push(n);
  }
  remove(...names) {
    for (const n of names) {
      const i = this.indexOf(n);
      if (i >= 0) this.splice(i, 1);
    }
  }
  contains(name) {
    return this.includes(name);
  }
}

function domError(message) {
  const err = new Error(message);
  err.name = "NotFoundError";
  return err;
}

export class FakeEl {
  constructor(tag, { cls = "", attrs = {}, rect = null, offsetHeight = 0 } = {}) {
    this.tag = tag;
    this.classList = new FakeClassList();
    if (cls) this.classList.add(...cls.split(/\s+/));
    this.attrs = {};
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.rect = rect; // {top, bottom, height}
    this.offsetHeight = offsetHeight;
    this.nodeType = 1;
    this.style = { cssText: "" };
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
  }
  get tagName() {
    return this.tag.toUpperCase();
  }
  get nodeName() {
    return this.tagName;
  }
  get id() {
    return this.getAttribute("id") ?? "";
  }
  set id(value) {
    this.setAttribute("id", value);
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = String(value);
  }
  removeAttribute(name) {
    delete this.attrs[name];
    if (name.startsWith("data-")) delete this.dataset[camel(name.slice(5))];
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }
  getAttribute(name) {
    return this.hasAttribute(name) ? this.attrs[name] : null;
  }
  append(...children) {
    for (const child of children) this.appendChild(child);
    return this;
  }
  appendChild(child) {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, ref) {
    if (ref == null) return this.appendChild(child);
    if (ref.parent !== this) throw domError("insertBefore: 기준 노드가 이 노드의 자식이 아니다");
    child.remove();
    child.parent = this;
    this.children.splice(this.children.indexOf(ref), 0, child);
    return child;
  }
  removeChild(child) {
    if (child.parent !== this) throw domError("removeChild: 이 노드의 자식이 아니다");
    child.remove();
    return child;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  get parentElement() {
    return this.parent;
  }
  get parentNode() {
    return this.parent;
  }
  get nextSibling() {
    if (!this.parent) return null;
    return this.parent.children[this.parent.children.indexOf(this) + 1] ?? null;
  }
  /** 자신부터 문서 뿌리 쪽으로 */
  *selfAndAncestors() {
    yield this;
    if (this.parent) yield* this.parent.selfAndAncestors();
  }
  get topmost() {
    return this.parent ? this.parent.topmost : this;
  }
  get isConnected() {
    return this.topmost.isDocumentRoot === true;
  }
  get ownerDocument() {
    return this.topmost.doc ?? this.createdBy ?? null;
  }
  /** display:none 서브트리(hidden 속성) · 문서 밖이면 null — 레이아웃 없는 가짜라 그 밖에는 부모를 돌려준다 */
  get offsetParent() {
    if (!this.isConnected) return null;
    for (const node of this.selfAndAncestors()) if (node.hasAttribute("hidden")) return null;
    return this.parent;
  }
  closest(selector) {
    for (const node of this.selfAndAncestors()) if (matchesCompound(node, selector)) return node;
    return null;
  }
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }
  addEventListener() {}
  removeEventListener() {}
  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }
  getBoundingClientRect() {
    return this.rect ?? { top: 0, bottom: 0, height: 0 };
  }
  *descendants() {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const last = parts.at(-1);
    const out = [];
    for (const el of this.descendants()) {
      if (!matchesCompound(el, last)) continue;
      let ok = true;
      let anc = el.parent;
      for (let i = parts.length - 2; i >= 0; i -= 1) {
        while (anc && !matchesCompound(anc, parts[i])) anc = anc.parent;
        if (!anc) {
          ok = false;
          break;
        }
        anc = anc.parent;
      }
      if (ok) out.push(el);
    }
    return out;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const MAIN_HEIGHT = 1000;

/** 용지 1장(.exam-a4-page > main > 칸 2개). overflowPx[칸] 만큼 그 칸의 마지막 블록이 main 아래로 넘친다. */
export function fakePage(overflowPx = [0, 0]) {
  const main = new FakeEl("main", { rect: { top: 0, bottom: MAIN_HEIGHT, height: MAIN_HEIGHT }, offsetHeight: MAIN_HEIGHT });
  for (const over of overflowPx) {
    const bottom = over > 0 ? MAIN_HEIGHT + over : MAIN_HEIGHT - 10;
    const block = new FakeEl("div", { rect: { top: bottom - 10, bottom, height: 10 } });
    main.append(new FakeEl("div").append(block));
  }
  return new FakeEl("div", { cls: "exam-a4-page" }).append(main);
}

/** 인쇄 루트: 표지(선택) · 본문 pages 쪽(앞 eager 쪽만 그려짐) · 정답표 answerKeys 쪽 */
export function buildRoot({ pages = 5, eager = 2, answerKeys = 1, cover = false } = {}) {
  const root = new FakeEl("div", { attrs: { id: "exam-paper-print-root" } });
  const frame = (attrs, mounted) => {
    const el = new FakeEl("div", { cls: "exam-preview-page-frame", attrs });
    if (mounted) el.append(fakePage());
    root.append(el);
    return el;
  };
  if (cover) frame({ "data-exam-cover-frame": "true" }, true);
  const body = Array.from({ length: pages }, (_, i) => frame({ "data-exam-page-index": i }, i < eager));
  for (let i = 0; i < answerKeys; i += 1) frame({ "data-exam-answer-key-frame": "true" }, true);
  const mountAll = (except = [], overflow = {}) =>
    body.forEach((el, i) => {
      if (!except.includes(i) && !el.querySelector(".exam-a4-page")) el.append(fakePage(overflow[i]));
    });
  return { root, body, mountAll };
}

/** 가짜 FontFace — status 는 테스트가 바꾼다. loaded 는 settle() 로 푼다. */
export function fakeFace(family, weight, status = "loaded") {
  let resolve;
  let reject;
  const face = {
    family,
    weight: String(weight),
    status,
    loaded: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    settle(next) {
      face.status = next;
      if (next === "loaded") resolve(face);
      else if (next === "error") reject(new Error("NetworkError"));
    },
  };
  face.loaded.catch(() => undefined);
  if (status === "loaded") resolve(face);
  return face;
}

/**
 * 가짜 FontFaceSet. exam: 시험지 글꼴 면 상태, ui: 무관한 UI 글꼴 면 상태. load() 는 시험지 면을 onLoad 대로 푼다:
 * {after: ms} 뒤 loaded · "error" 즉시 거부 · "never" 영영 안 옴. ready 는 모든 면이 loading 이 아닐 때 풀린다.
 */
export function fakeFontSet(clock, { exam = "loaded", ui = "loaded", onLoad = { after: 300 } } = {}) {
  const examFaces = [fakeFace('"Malgun Gothic Exam"', 400, exam), fakeFace('"Malgun Gothic Exam"', 700, exam)];
  const uiFaces = [fakeFace("Pretendard", 400, ui)];
  const all = [...examFaces, ...uiFaces];
  const fonts = {
    get status() {
      return all.some((f) => f.status === "loading") ? "loading" : "loaded";
    },
    forEach(cb) {
      all.forEach((f) => cb(f));
    },
    check(spec) {
      if (!spec.includes("Malgun Gothic Exam")) return true;
      const weight = spec.trim().split(/\s+/)[0];
      return examFaces.filter((f) => f.weight === weight).every((f) => f.status === "loaded");
    },
    load(spec) {
      const faces = examFaces.filter((f) => spec.startsWith(f.weight));
      if (faces.every((f) => f.status === "loaded")) return Promise.resolve(faces);
      for (const f of faces) if (f.status === "unloaded") f.status = "loading";
      if (onLoad === "error") {
        faces.forEach((f) => f.settle("error"));
        return Promise.reject(new Error("NetworkError"));
      }
      if (onLoad === "never") return new Promise(() => undefined);
      if (onLoad.early) {
        // load() 는 먼저 풀리는데 면은 아직 내려받는 중(다른 요청이 같은 면을 다시 부른 경우 등) — 면의 loaded 로 끝난다
        clock.win.setTimeout(() => faces.forEach((f) => f.settle("loaded")), onLoad.after);
        return Promise.resolve([]);
      }
      return new Promise((resolve) =>
        clock.win.setTimeout(() => {
          faces.forEach((f) => f.settle("loaded"));
          resolve(faces);
        }, onLoad.after),
      );
    },
    get ready() {
      return new Promise(() => undefined); // 쓰면 안 된다 — UI 글꼴이 걸리면 영영 안 풀리는 전역 대기
    },
  };
  return { fonts, examFaces, uiFaces };
}

/** 가짜 문서: getElementById 는 문서 순서상 첫 매칭(roots 배열 순서) */
export function fakeDoc({ roots, fonts, visibilityState = "visible" }) {
  return {
    fonts,
    visibilityState,
    getElementById: (id) => roots.find((r) => r.getAttribute("id") === id && r.connected !== false) ?? null,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** 수동 시계 — 타이머 · rAF 는 테스트가 시계를 돌릴 때만 돈다. */
export class FakeClock {
  t = 0;
  seq = 0;
  q = new Map();
  win = {
    setTimeout: (fn, ms = 0) => {
      const id = ++this.seq;
      this.q.set(id, { at: this.t + ms, fn });
      return id;
    },
    clearTimeout: (id) => void this.q.delete(id),
    requestAnimationFrame: (fn) => this.win.setTimeout(() => fn(this.t), 16),
    cancelAnimationFrame: (id) => void this.q.delete(id),
    performance: { now: () => this.t },
  };
  now = () => this.t;
  async step() {
    await flush();
    let nextId = -1;
    let next = null;
    for (const [id, entry] of this.q) {
      if (!next || entry.at < next.at) {
        next = entry;
        nextId = id;
      }
    }
    if (!next) return false;
    this.q.delete(nextId);
    this.t = Math.max(this.t, next.at);
    next.fn();
    await flush();
    return true;
  }
  async runUntil(done, maxT = 60000) {
    while (!done() && this.t <= maxT) {
      if (!(await this.step())) break;
    }
  }
}
