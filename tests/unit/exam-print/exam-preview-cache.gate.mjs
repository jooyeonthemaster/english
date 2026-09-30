// 시험지 미리보기 데이터 캐시(썸네일 · 카드 인쇄 대화상자 공유) — 동작 게이트.
// tests/unit/exam-print-behavior.test.mjs 가 `node --import=tsx --test` 로 띄운다.
// 서버 액션 "@/actions/exams" 는 여기서 가짜로 바꾼다 — 호출마다 테스트가 풀 시점을 정한다(Next 서버 액션 직렬 큐 모형).
// (tsx 는 이 저장소의 .ts 를 CommonJS 로 싣는다 — "type":"module" 이 없다 — 그래서 require 해석을 가로챈다.)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.EXAM_PRINT_SRC_ROOT
  ? path.resolve(process.env.EXAM_PRINT_SRC_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const calls = [];
const require = createRequire(import.meta.url);
const Module = require("node:module");
const STUB_ID = path.join(ROOT, "__exam-print-gate__", "actions-exams-stub.cjs");
const stub = new Module(STUB_ID);
stub.filename = STUB_ID;
stub.loaded = true;
stub.exports = {
  getExamPreviewData(examId) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ examId, resolve, reject });
    return promise;
  },
};
require.cache[STUB_ID] = stub;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === "@/actions/exams") return STUB_ID;
  return originalResolve.call(this, request, ...rest);
};

const cache = await import(pathToFileURL(path.join(ROOT, "src/components/exams/exam-preview-data-cache.ts")).href);

const callsFor = (id) => calls.filter((c) => c.examId === id);
const flush = () => new Promise((resolve) => setImmediate(resolve));
const data = (id) => ({ id, questions: [{ id: "q" }], submissions: [] });
let seq = 0;
const uid = (p) => `${p}-${++seq}`;

test("cache: high 는 즉시 보내고, 같은 키는 진행 중 · 완료 후 모두 서버 호출 1건(Date ≡ ISO)", async () => {
  const id = uid("hi");
  const a = cache.loadExamPreviewData(id, "2026-09-30T00:00:00.000Z");
  const b = cache.loadExamPreviewData(id, new Date("2026-09-30T00:00:00.000Z"));
  assert.equal(callsFor(id).length, 1);
  assert.equal(a, b);
  callsFor(id)[0].resolve(data(id));
  assert.deepEqual(await a, data(id));
  assert.deepEqual(await cache.loadExamPreviewData(id, "2026-09-30T00:00:00.000Z"), data(id));
  assert.equal(callsFor(id).length, 1, "끝난 결과는 재사용한다(네트워크 0)");
});

test("cache: low(썸네일)는 한 번에 한 건씩 — 앞 건이 끝나야 다음 건, 실패해도 대기열이 멈추지 않는다", async () => {
  const ids = [uid("lo"), uid("lo"), uid("lo")];
  const ps = ids.map((id) => cache.loadExamPreviewData(id, "v", "low"));
  assert.deepEqual(ids.map((id) => callsFor(id).length), [1, 0, 0]);
  callsFor(ids[0])[0].resolve(data(ids[0]));
  await ps[0];
  await flush();
  assert.deepEqual(ids.map((id) => callsFor(id).length), [1, 1, 0]);
  callsFor(ids[1])[0].reject(new Error("boom"));
  await assert.rejects(ps[1]);
  await flush();
  assert.deepEqual(ids.map((id) => callsFor(id).length), [1, 1, 1]);
  callsFor(ids[2])[0].resolve(data(ids[2]));
  await ps[2];
});

test("cache: 인쇄(high)는 썸네일 적체를 건너뛰고, 대기 중인 같은 시험지 요청은 승격한다(중복 0)", async () => {
  const busy = uid("busy");
  const queued = uid("queued");
  const other = uid("other");
  const pBusy = cache.loadExamPreviewData(busy, "v", "low");
  const pQueued = cache.loadExamPreviewData(queued, "v", "low");
  const pOther = cache.loadExamPreviewData(other, "v", "low");
  assert.equal(callsFor(queued).length, 0);
  const fresh = uid("fresh");
  const pFresh = cache.loadExamPreviewData(fresh, "v");
  assert.equal(callsFor(fresh).length, 1, "새 인쇄 요청은 썸네일 뒤에 줄 서지 않는다");
  callsFor(fresh)[0].resolve(data(fresh));
  await pFresh;
  const pPrint = cache.loadExamPreviewData(queued, "v");
  assert.equal(pPrint, pQueued, "대기 중인 엔트리에 합류한다");
  assert.equal(callsFor(queued).length, 1, "즉시 승격");
  callsFor(queued)[0].resolve(data(queued));
  assert.deepEqual(await pPrint, data(queued));
  callsFor(busy)[0].resolve(data(busy));
  await pBusy;
  await flush();
  assert.equal(callsFor(queued).length, 1, "승격된 엔트리는 low 펌프가 다시 보내지 않는다");
  assert.equal(callsFor(other).length, 1, "펌프는 다음 low 로 넘어간다");
  callsFor(other)[0].resolve(data(other));
  await pOther;
});

test("cache: 버전(updatedAt)이 바뀌면 다시 받고, 실패와 null 은 캐시하지 않는다", async () => {
  const id = uid("ver");
  const p1 = cache.loadExamPreviewData(id, "2026-09-29T00:00:00.000Z");
  callsFor(id)[0].resolve(data(id));
  await p1;
  const p2 = cache.loadExamPreviewData(id, "2026-09-30T00:00:00.000Z");
  assert.equal(callsFor(id).length, 2);
  callsFor(id)[1].reject(new Error("network"));
  await assert.rejects(p2);
  const p3 = cache.loadExamPreviewData(id, "2026-09-30T00:00:00.000Z");
  assert.equal(callsFor(id).length, 3, "실패는 캐시하지 않는다");
  callsFor(id)[2].resolve(null);
  assert.equal(await p3, null);
  void cache.loadExamPreviewData(id, "2026-09-30T00:00:00.000Z");
  assert.equal(callsFor(id).length, 4, "null 은 캐시하지 않는다");
  callsFor(id)[3].resolve(data(id));
});

test("cache: TTL 3분 · LRU 상한 48", async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const id = uid("ttl");
    const p = cache.loadExamPreviewData(id, "v");
    callsFor(id)[0].resolve(data(id));
    await p;
    now += 2 * 60 * 1000;
    void cache.loadExamPreviewData(id, "v");
    assert.equal(callsFor(id).length, 1, "3분 안에는 신선하다");
    now += 61 * 1000;
    void cache.loadExamPreviewData(id, "v");
    assert.equal(callsFor(id).length, 2, "3분이 지나면 다시 받는다");
    callsFor(id)[1].resolve(data(id));

    const first = uid("lru");
    const pf = cache.loadExamPreviewData(first, "v");
    callsFor(first)[0].resolve(data(first));
    await pf;
    const rest = Array.from({ length: 47 }, () => uid("lru"));
    for (const r of rest) {
      const pr = cache.loadExamPreviewData(r, "v");
      callsFor(r)[0].resolve(data(r));
      await pr;
    }
    void cache.loadExamPreviewData(first, "v");
    assert.equal(callsFor(first).length, 1, "48건은 들어간다");
    for (const r of [uid("lru"), uid("lru")]) {
      const pr = cache.loadExamPreviewData(r, "v");
      callsFor(r)[0].resolve(data(r));
      await pr;
    }
    void cache.loadExamPreviewData(rest[0], "v");
    assert.equal(callsFor(rest[0]).length, 2, "48건을 넘으면 가장 오래 안 쓴 것부터 밀려난다");
    callsFor(rest[0])[1].resolve(data(rest[0]));
  } finally {
    Date.now = realNow;
  }
});
