// usePrintPortal — 동작 게이트(진짜 React · 가짜 문서/창, jsdom 없음). tests/unit/exam-print-behavior.test.mjs 가
// `node --import=tsx --test` 로 띄운다. EXAM_PRINT_SRC_ROOT 로 사본을 가리키면 그 사본의 훅을 시험한다.
//
// 지키는 것(docs/EXAM-PRINT-PIPELINE.md §4 · 26-09-30 PRINT-R7):
//   · 포털을 태운 beforeprint 에서만 전 쪽 마운트(flushSync true) · afterprint 에서 제자리 원복
//   · 인쇄 도중 언마운트되면 cleanup 이 루트 · #exam-print-host · body 클래스를 되돌린다 — 단 문서가 인쇄 레이아웃으로
//     그려지는 중(matchMedia("print"))이면 그 인쇄의 afterprint 로 미룬다(PH-R1 랜딩 네이티브 인쇄)
//   · 남은 호스트(afterprint 누락 · 주인 없음 · 남이 떼어 냄)는 다음 인쇄에서 치우고 포털을 다시 세운다 — 영구 비켜섬 금지
//   · 두 인스턴스여도 한 인쇄에 포털은 하나(판정 (3)) — 같은 beforeprint 사건 안에서만 「이미 섰다」로 본다
import test from "node:test";
import assert from "node:assert/strict";
import { buildRoot } from "./fake-print-env.mjs";
import { createReactHookEnv, loadSrc, placeRoot, printHosts } from "./react-hook-env.mjs";

const env = createReactHookEnv();
const { usePrintPortal } = await loadSrc("src/components/exams/paper-builder/hooks/use-print-portal.ts");
const registry = await loadSrc("src/components/exams/paper-builder/print/print-portal-registry.ts");

const BODY_CLASS = "exam-print-active";

/** 포털 인스턴스 하나 — rootRef 를 넘기는 호스트(상세 · 빌더) 또는 안 넘기는 호스트(랜딩 데모) */
function mountPortal({ root, withRootRef = true, paperSize = "A4" }) {
  const seen = { value: null, renders: 0 };
  const rootRef = { current: root };
  function PortalHarness({ size }) {
    seen.value = usePrintPortal(size, withRootRef ? { rootRef } : {});
    seen.renders += 1;
    return null;
  }
  const h = env.mount(PortalHarness, { size: paperSize });
  return { ...h, seen, rootRef };
}

/** 새 문서의 앱 루트(body > #app) — 인쇄 루트는 addRoot 로 둔다 */
function page() {
  env.reset();
  const app = env.doc.createElement("div");
  app.setAttribute("id", "app");
  env.doc.body.appendChild(app);
  return { app };
}
function addRoot(parent, label, { pages = 4, eager = 2 } = {}) {
  const built = buildRoot({ pages, eager });
  return { ...built, ...placeRoot(parent, built.root, label) };
}

function assertRestored(r, label) {
  assert.equal(r.root.parentElement, r.wrapper, `${label}: 루트가 원래 부모로 돌아가야 한다`);
  assert.equal(r.root.nextSibling, r.after, `${label}: 루트가 원래 자리(형제 순서)로 돌아가야 한다`);
  assert.equal(r.root.getAttribute("style"), null, `${label}: 인쇄용 인라인 스타일을 걷어야 한다`);
}

function assertClean(label) {
  assert.deepEqual(printHosts(env.doc), [], `${label}: #exam-print-host 가 남았다`);
  assert.equal(env.doc.body.classList.contains(BODY_CLASS), false, `${label}: body.${BODY_CLASS} 가 남았다`);
  assert.equal(registry.currentPrintPortalClaim(), null, `${label}: 포털 기록이 남았다`);
}

test("portal: beforeprint 에서 루트를 호스트로 옮기고 전 쪽 마운트(동기) → afterprint 에서 제자리 원복", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const a = mountPortal({ root: r.root });
  await env.settle();
  assert.equal(a.seen.value, false);
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].parentElement, env.doc.body);
  assert.equal(r.root.parentElement, hosts[0]);
  assert.equal(env.doc.body.classList.contains(BODY_CLASS), true);
  assert.equal(a.seen.value, true, "전 쪽 마운트는 beforeprint 안에서 동기(flushSync)로 켜져야 한다");
  assert.equal(registry.currentPrintPortalClaim()?.host, hosts[0], "포털 기록(같은 모듈 인스턴스)이 이 호스트를 가리켜야 한다");
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(r, "afterprint");
  assertClean("afterprint");
  assert.equal(a.seen.value, false);
  a.unmount();
});

test("portal(PRINT-R7): 인쇄 도중 언마운트되면 cleanup 이 루트 · 호스트 · body 클래스를 되돌리고, 다음 인스턴스는 포털을 세운다", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const a = mountPortal({ root: r.root });
  await env.settle();
  env.win.dispatch("beforeprint");
  assert.equal(printHosts(env.doc).length, 1);
  a.unmount(); // 모바일 비차단 인쇄 뒤 화면 이동 · 대화상자 닫힘 — afterprint 전
  await env.settle();
  assertRestored(r, "언마운트");
  assertClean("언마운트");
  env.win.dispatch("afterprint"); // 늦은 afterprint — 아무 일도 없어야 한다
  assertClean("늦은 afterprint");

  const r2 = addRoot(app, "B");
  r.wrapper.remove(); // 앞 화면은 사라졌다
  const b = mountPortal({ root: r2.root });
  await env.settle();
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1, "다음 인쇄의 포털이 서야 한다");
  assert.equal(r2.root.parentElement, hosts[0]);
  assert.equal(b.seen.value, true);
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(r2, "B afterprint");
  assertClean("B afterprint");
  b.unmount();
});

test("portal(PH-R1): 인쇄 레이아웃 도중 언마운트(네이티브 인쇄의 폭 질의 전환으로 랜딩 데모가 빠짐)면 포털을 캡처 끝까지 두고 그 인쇄의 afterprint 에서 원복한다", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const a = mountPortal({ root: r.root, withRootRef: false }); // 랜딩 데모형(rootRef 없음)
  await env.settle();
  env.win.dispatch("beforeprint");
  const host = printHosts(env.doc)[0];
  assert.equal(r.root.parentElement, host);
  // printToPDF · 데스크톱 인쇄 미리보기: 인쇄 폭으로 매체 질의를 다시 평가 → DemoGate `(min-width: 1024px)` 거짓 → 데모 언마운트
  env.win.printMedia = true;
  a.unmount();
  await env.settle();
  assert.deepEqual(printHosts(env.doc), [host], "캡처 전에 포털을 걷었다 — PDF 에 데모 시험지 대신 랜딩이 찍힌다");
  assert.equal(r.root.parentElement, host, "인쇄되는 동안 루트는 호스트 안에 있어야 한다");
  assert.equal(env.doc.body.classList.contains(BODY_CLASS), true);
  assert.equal(env.win.listenerCount("afterprint"), 1, "미룬 원복 리스너가 정확히 하나여야 한다");
  env.win.printMedia = false;
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(r, "미룬 원복");
  assertClean("미룬 원복");
  assert.equal(env.win.listenerCount("afterprint"), 0, "미룬 원복 리스너가 남았다");
});

test("portal(PH-R1): 미룬 원복도 afterprint 가 끝내 안 오면 다음 인쇄 · 새 인쇄 잡이 치운다(미룬 리스너까지)", async () => {
  for (const via of ["next-beforeprint", "job-start"]) {
    const { app } = page();
    const ra = addRoot(app, "A");
    const a = mountPortal({ root: ra.root, withRootRef: false });
    await env.settle();
    env.win.dispatch("beforeprint");
    env.win.printMedia = true;
    a.unmount();
    await env.settle();
    env.win.printMedia = false; // afterprint 누락
    assert.equal(printHosts(env.doc).length, 1, `${via}: 미룬 포털이 서 있어야 한다`);
    if (via === "job-start") {
      assert.equal(registry.settleStalePrintPortal(env.doc, null), "healed", `${via}: 잡 시작 치우기`);
      assertRestored(ra, via);
      assertClean(via);
    } else {
      const rb = addRoot(app, "B");
      ra.wrapper.remove(); // 앞 화면(데모)은 사라졌다
      const b = mountPortal({ root: rb.root });
      await env.settle();
      env.win.dispatch("beforeprint");
      assertRestored(ra, `${via}: 치운 A`);
      const hosts = printHosts(env.doc);
      assert.equal(hosts.length, 1, `${via}: 호스트 ${hosts.length}개`);
      assert.equal(rb.root.parentElement, hosts[0], `${via}: 지금 첫 매칭(B)이 인쇄돼야 한다`);
      env.win.dispatch("afterprint");
      await env.settle();
      assertRestored(rb, `${via}: B afterprint`);
      assertClean(`${via}: B afterprint`);
      b.unmount();
    }
    assert.equal(env.win.listenerCount("afterprint"), 0, `${via}: 미룬 원복 리스너가 남았다`);
  }
});

test("portal(PRINT-R7): afterprint 가 끝내 안 온 호스트는 다음 인쇄가 치운다 — 옛 시험지가 아니라 지금 첫 매칭 루트가 찍힌다", async () => {
  const { app } = page();
  const ra = addRoot(app, "A");
  const a = mountPortal({ root: ra.root });
  await env.settle();
  env.win.dispatch("beforeprint"); // A 인쇄 — afterprint 누락(모바일)
  assert.equal(ra.root.parentElement, printHosts(env.doc)[0]);

  // 그 뒤 다른 시험지 화면(B)이 A 보다 앞에 뜬다(예: 목록의 카드 인쇄 대화상자). A 는 살아 있다.
  const rb = addRoot(app, "B");
  app.insertBefore(rb.wrapper, ra.wrapper);
  const b = mountPortal({ root: rb.root });
  await env.settle();
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1, `호스트 ${hosts.length}개`);
  assert.equal(rb.root.parentElement, hosts[0], "지금 첫 매칭 루트(B)가 인쇄돼야 한다 — 남은 호스트의 옛 시험지(A)가 아니라");
  assertRestored(ra, "치운 A");
  assert.equal(b.seen.value, true);
  await env.settle(); // 치운 A 의 해제는 기본 우선순위 갱신(인쇄 뒤 렌더) — B 의 flushSync 와 달리 기다린다
  assert.equal(a.seen.value, false, "치운 A 의 전 쪽 마운트는 꺼져야 한다");
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(rb, "B afterprint");
  assertClean("B afterprint");
  a.unmount();
  b.unmount();
});

test("portal(PRINT-R7): 주인 없는 #exam-print-host(누가 만들고 버림)는 치우고 포털을 세운다", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const orphan = env.doc.createElement("div");
  orphan.setAttribute("id", "exam-print-host");
  env.doc.body.appendChild(orphan);
  env.doc.body.classList.add(BODY_CLASS);
  const a = mountPortal({ root: r.root });
  await env.settle();
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1);
  assert.notEqual(hosts[0], orphan, "주인 없는 호스트는 치워야 한다");
  assert.equal(r.root.parentElement, hosts[0], "포털이 서야 한다(종전: 영구 비켜섬 — 네이티브 인쇄 앞 2쪽)");
  assert.equal(a.seen.value, true);
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(r, "afterprint");
  assertClean("afterprint");
  a.unmount();
});

test("portal(PRINT-R7): 남이 호스트를 떼어 버려 루트가 문서 밖에 묻혀도 다음 인쇄가 제자리로 돌리고 다시 세운다", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const a = mountPortal({ root: r.root });
  await env.settle();
  env.win.dispatch("beforeprint");
  printHosts(env.doc)[0].remove(); // 루트를 품은 채 문서에서 사라짐
  assert.equal(r.root.isConnected, false);
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1);
  assert.equal(r.root.parentElement, hosts[0]);
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(r, "afterprint");
  assertClean("afterprint");
  a.unmount();
});

test("portal(PRINT-R7): 남은 호스트가 있어도 남의 인쇄(명시 제외 · 숨은 루트 + .par-root)에서는 치우기만 하고 서지 않는다", async () => {
  const { app } = page();
  const r = addRoot(app, "A");
  const a = mountPortal({ root: r.root });
  await env.settle();
  env.win.dispatch("beforeprint"); // afterprint 누락
  // 사용자가 학습지 조판으로 넘어갔다 — 시험지 루트는 명시 제외, 화면에는 학습지 인쇄 루트
  r.wrapper.setAttribute("data-exam-print-exclude", "true");
  const par = env.doc.createElement("div");
  par.classList.add("par-root");
  app.appendChild(par);
  env.win.dispatch("beforeprint");
  assertClean("남의 인쇄"); // 남은 호스트 · body 클래스가 있으면 print-styles 가 학습지를 통째로 숨긴다
  assertRestored(r, "남의 인쇄");
  await env.settle();
  assert.equal(a.seen.value, false);
  env.win.dispatch("afterprint");
  a.unmount();
});

test("portal 판정 (3): 두 인스턴스(rootRef)여도 한 인쇄에 포털은 하나 — 첫 매칭 루트의 주인만, 리스너 순서와 무관", async () => {
  for (const order of ["A-first", "B-first"]) {
    const { app } = page();
    const ra = addRoot(app, "A");
    const rb = addRoot(app, "B"); // 문서 순서: A 가 첫 매칭
    const first = order === "A-first" ? mountPortal({ root: ra.root }) : mountPortal({ root: rb.root });
    const second = order === "A-first" ? mountPortal({ root: rb.root }) : mountPortal({ root: ra.root });
    const [a, b] = order === "A-first" ? [first, second] : [second, first];
    await env.settle();
    env.win.dispatch("beforeprint");
    const hosts = printHosts(env.doc);
    assert.equal(hosts.length, 1, `${order}: 호스트 ${hosts.length}개`);
    assert.equal(ra.root.parentElement, hosts[0], `${order}: 첫 매칭(A)이 인쇄돼야 한다`);
    assert.equal(rb.root.parentElement, rb.wrapper, `${order}: B 는 제자리`);
    assert.deepEqual([a.seen.value, b.seen.value], [true, false], `${order}: 전 쪽 마운트는 인쇄되는 인스턴스만`);
    env.win.dispatch("afterprint");
    await env.settle();
    assertRestored(ra, `${order} A`);
    assertRestored(rb, `${order} B`);
    assertClean(order);
    a.unmount();
    b.unmount();
  }
});

test("portal 판정 (3): rootRef 없는 두 인스턴스(랜딩 데모형) — 같은 사건에서 둘째는 비켜선다(두 시험지가 한 인쇄에 찍히지 않게)", async () => {
  const { app } = page();
  const ra = addRoot(app, "A");
  const rb = addRoot(app, "B");
  const a = mountPortal({ root: ra.root, withRootRef: false });
  const b = mountPortal({ root: rb.root, withRootRef: false });
  await env.settle();
  env.win.dispatch("beforeprint");
  const hosts = printHosts(env.doc);
  assert.equal(hosts.length, 1, `호스트 ${hosts.length}개 — 둘째 리스너가 다음 첫 매칭(B)을 또 옮겼다`);
  assert.equal(ra.root.parentElement, hosts[0]);
  assert.equal(rb.root.parentElement, rb.wrapper);
  env.win.dispatch("afterprint");
  await env.settle();
  assertRestored(ra, "A");
  assertRestored(rb, "B");
  assertClean("afterprint");
  a.unmount();
  b.unmount();
});
