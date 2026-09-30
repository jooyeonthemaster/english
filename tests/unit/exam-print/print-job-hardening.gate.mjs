// 인쇄 잡 강화(26-09-30 Wave 2) — 동작 게이트(가짜 DOM · 가짜 시계, React 없음). tests/unit/exam-print-behavior.test.mjs
// 가 `node --import=tsx --test` 로 띄운다. EXAM_PRINT_SRC_ROOT 로 사본을 가리키면 그 사본의 모듈을 시험한다.
//
// 지키는 것:
//   · PRINT-R7  새 인쇄 요청은 지난 인쇄가 남긴 #exam-print-host(주인 없음 · afterprint 누락)를 치우고 시작한다 — 남은
//              호스트 속 옛 루트가 첫 매칭이 되어 내 루트를 not-primary-root 로 막지 않게. 빠른 경로의 동기성은 유지.
//   · PRINT-R8  원격 측정 라벨: 글꼴 실패는 'error'(빠른 경로에서도), 차단은 서버 검증을 거쳐도 outcome='blocked' ·
//              blockReason 이 남아 관리자 활동 피드가 「성공한 내보내기」와 가를 수 있다(피드 매핑 계약의 입력).
import test from "node:test";
import assert from "node:assert/strict";
import { FakeClock, buildRoot, fakeFontSet } from "./fake-print-env.mjs";
import { fakeDom, loadSrc, placeRoot, printHosts } from "./react-hook-env.mjs";

const PRINT = "src/components/exams/paper-builder/print";
const jobMod = await loadSrc(`${PRINT}/exam-print-job.ts`);
const registry = await loadSrc(`${PRINT}/print-portal-registry.ts`);
const metaMod = await loadSrc("src/lib/exams/print-event-meta.ts");

function deps({ root, clock, doc, overrides = {} }) {
  const log = [];
  const reports = [];
  const d = {
    mode: "plain",
    entry: "card-dialog",
    getRoot: () => root,
    isGuardSettled: () => true,
    mountAll: () => log.push("mount"),
    onPreparing: () => log.push("preparing"),
    isDead: () => false,
    report: (meta) => {
      log.push(`report:${meta.outcome}`);
      reports.push(meta);
    },
    invokePrint: () => log.push("print"),
    env: { doc, win: clock.win, now: clock.now },
    ...overrides,
  };
  return { d, log, reports };
}

async function run(d, clock) {
  let result = null;
  void jobMod.runExamPrintJob(d).then((r) => (result = r));
  await clock.runUntil(() => result !== null);
  return result;
}

test("job(PRINT-R7): 주인 없는 남은 호스트(옛 루트를 품음)를 새 인쇄 시작 때 치운다 — 내 루트를 같은 태스크에서 인쇄", async () => {
  const clock = new FakeClock();
  const doc = fakeDom({ fonts: fakeFontSet(clock).fonts });
  // 지난 인쇄의 잔재: body 끝 호스트 속 옛 루트(주인은 이미 사라짐) + body 클래스
  const stale = doc.createElement("div");
  stale.setAttribute("id", "exam-print-host");
  stale.appendChild(buildRoot({ pages: 2, eager: 2 }).root);
  doc.body.appendChild(stale);
  doc.body.classList.add("exam-print-active");
  // 그 뒤에 열린 인쇄 대화상자(내 루트) — 문서 순서상 남은 호스트 뒤
  const mine = buildRoot({ pages: 4, eager: 1 });
  const dialog = doc.createElement("div");
  doc.body.appendChild(dialog);
  placeRoot(dialog, mine.root, "mine");
  assert.notEqual(doc.getElementById("exam-paper-print-root"), mine.root, "전제: 옛 루트가 첫 매칭");

  const h = deps({ root: mine.root, clock, doc, overrides: { mountAll: () => mine.mountAll() } });
  const pending = jobMod.runExamPrintJob(h.d);
  assert.deepEqual(h.log, ["report:printed", "print"], "치우기는 동기 — 빠른 경로가 클릭 태스크 안에서 인쇄해야 한다");
  const result = await pending;
  assert.equal(result.kind, "printed");
  assert.deepEqual(printHosts(doc), []);
  assert.equal(doc.body.classList.contains("exam-print-active"), false);
  assert.equal(doc.getElementById("exam-paper-print-root"), mine.root);
});

test("job(PRINT-R7): 주인이 기록한 남은 포털은 주인의 원복을 불러 치운다(한 번) · 기록도 지운다", async () => {
  const clock = new FakeClock();
  const doc = fakeDom({ fonts: fakeFontSet(clock).fonts });
  const mine = buildRoot({ pages: 3, eager: 3 });
  const placed = placeRoot(doc.body, mine.root, "mine");
  // 내 루트가 지난 인쇄의 호스트에 남아 있다(afterprint 누락, 주인 = 나 — 살아 있음)
  const host = doc.createElement("div");
  host.setAttribute("id", "exam-print-host");
  doc.body.appendChild(host);
  host.appendChild(mine.root);
  let releases = 0;
  registry.claimPrintPortal({
    host,
    event: { type: "beforeprint" },
    release: () => {
      releases += 1;
      placed.wrapper.insertBefore(mine.root, placed.after);
      host.remove();
      registry.dropPrintPortalClaim(host);
    },
  });
  const h = deps({ root: mine.root, clock, doc });
  const result = await run(h.d, clock);
  assert.equal(result.kind, "printed");
  assert.equal(releases, 1);
  assert.equal(mine.root.parentElement, placed.wrapper, "주인 원복으로 제자리");
  assert.deepEqual(printHosts(doc), []);
  assert.equal(registry.currentPrintPortalClaim(), null);
});

test("registry(PRINT-R7): 같은 beforeprint 사건에 선 포털만 「이번 인쇄」다 — 다른 사건 · 사건 밖(null)에서는 잔재로 치운다", () => {
  const doc = fakeDom();
  const place = () => {
    const host = doc.createElement("div");
    host.setAttribute("id", "exam-print-host");
    doc.body.appendChild(host);
    return host;
  };
  const e1 = { type: "beforeprint" };
  let host = place();
  registry.claimPrintPortal({ host, event: e1, release: () => { host.remove(); registry.dropPrintPortalClaim(host); } });
  assert.equal(registry.settleStalePrintPortal(doc, e1), "same-print");
  assert.equal(printHosts(doc).length, 1, "같은 사건이면 건드리지 않는다");
  assert.equal(registry.settleStalePrintPortal(doc, { type: "beforeprint" }), "healed");
  assert.deepEqual(printHosts(doc), []);
  host = place();
  registry.claimPrintPortal({ host, event: e1, release: () => { host.remove(); registry.dropPrintPortalClaim(host); } });
  assert.equal(registry.settleStalePrintPortal(doc, null), "healed", "인쇄 사건 밖에서 남은 호스트는 전부 잔재");
  assert.equal(registry.settleStalePrintPortal(doc, null), "clear");
  assert.equal(registry.currentPrintPortalClaim(), null);
});

test("job(PRINT-R8): fonts.check 가 참이어도 시험지 글꼴 면이 실패(error) 상태면 fonts='error' — 빠른 경로는 그대로", async () => {
  const clock = new FakeClock();
  const fontSet = fakeFontSet(clock);
  fontSet.examFaces.forEach((face) => (face.status = "error"));
  fontSet.fonts.check = () => true; // 실패 면을 참으로 치는 엔진
  const doc = fakeDom({ fonts: fontSet.fonts });
  const mine = buildRoot({ pages: 2, eager: 2 });
  placeRoot(doc.body, mine.root, "mine");
  const h = deps({ root: mine.root, clock, doc });
  const result = await jobMod.runExamPrintJob(h.d);
  assert.deepEqual([result.meta.fonts, result.meta.path], ["error", "fast"]);
  assert.equal(metaMod.parsePrintEventMeta(result.meta)?.fonts, "error");
});

test("job(PRINT-R8): 차단 메타는 서버 검증 뒤에도 outcome='blocked' · blockReason 이 남고 인쇄 횟수에 안 든다(피드 계약)", async () => {
  const clock = new FakeClock();
  const doc = fakeDom({ fonts: fakeFontSet(clock).fonts });
  const mine = buildRoot({ pages: 6, eager: 2 });
  placeRoot(doc.body, mine.root, "mine");
  const h = deps({ root: mine.root, clock, doc, overrides: { mountAll: () => mine.mountAll([4]) } });
  const result = await jobMod.runExamPrintJob(h.d);
  assert.equal(result.kind, "blocked");
  const logged = metaMod.parsePrintEventMeta(JSON.parse(JSON.stringify(h.reports[0]))); // 서버 액션 인자 = 직렬화
  assert.ok(logged, "차단 메타가 서버 검증에서 버려지면 피드가 차단을 볼 수 없다");
  assert.deepEqual(
    [logged.outcome, logged.blockReason, logged.mountedPages < logged.pages],
    ["blocked", "unmounted-pages", true],
  );
  assert.equal(metaMod.printEventCountsAsPrint(h.reports[0]), false);

  const ok = deps({ root: buildRoot({ pages: 1, eager: 1 }).root, clock, doc: fakeDom({ fonts: fakeFontSet(clock).fonts }) });
  placeRoot(ok.d.env.doc.body, ok.d.getRoot(), "ok");
  const printed = await jobMod.runExamPrintJob(ok.d);
  const loggedOk = metaMod.parsePrintEventMeta(JSON.parse(JSON.stringify(printed.meta)));
  assert.deepEqual([loggedOk.outcome, "blockReason" in loggedOk], ["printed", false]);
  assert.equal(metaMod.printEventCountsAsPrint(printed.meta), true);
});
