import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 지문 삭제 가드(docs/EXAM-PAPER-MODEL.md §5) 검증 — 순수 함수 + 가짜 스토어 오케스트레이션.
// 가짜 스토어는 FK ON DELETE SET NULL 과 트랜잭션 롤백을 흉내 낸다. 운영 DB 무접촉.
const harnessSource = String.raw`
import guardMod from "@/actions/workbench/_lib/passage-delete-guard";
import messageMod from "@/actions/workbench/_lib/passage-delete-message";
const {
  normalizePassageContent, isSamePassageContent, chooseRelinkTarget,
  mergeSourcePassageSnapshot, planPassageDeletion, executePassageDeletion,
  runChunkedPassageDeletion, buildPassageDeleteAuditEvents, sanitizePassageIds,
  PassageDeleteConflictError, PASSAGE_DELETE_EVENT_TYPE, describePassageDeleteError,
} = guardMod;
const { toPassageDeletionImpact, buildPassageDeletionConfirm } = messageMod;

const failures = [];
let passed = 0;
function check(name, cond) { if (cond) passed += 1; else failures.push(name); }
async function checkAsync(name, fn) {
  try { check(name, await fn()); } catch (e) { failures.push(name + " threw " + (e && e.message)); }
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const d = (s) => new Date(s);

// ── 가짜 DB/스토어 ──────────────────────────────────────────────
function makeDb() {
  return {
    passages: [
      { id: "pA", academyId: "acA", title: "dup-new", content: "The  cat\nsat.", createdAt: d("2026-09-23") },
      { id: "pC", academyId: "acA", title: "day 6", content: "The cat sat.", createdAt: d("2026-09-18") },
      { id: "pC2", academyId: "acA", title: "day 6 copy", content: "The cat sat.", createdAt: d("2026-09-20") },
      { id: "pU", academyId: "acA", title: "unique", content: "Unique text here.", createdAt: d("2026-09-01") },
      { id: "pT", academyId: "acA", title: "tutor", content: "Tutor text.", createdAt: d("2026-09-01") },
      { id: "pE", academyId: "acA", title: "empty-q", content: "No questions.", createdAt: d("2026-09-01") },
      { id: "pB", academyId: "acB", title: "other academy", content: "The cat sat.", createdAt: d("2026-01-01") },
      { id: "pX", academyId: "acA", title: "array sd", content: "Array text.", createdAt: d("2026-09-01") },
    ],
    questions: [
      { id: "q1", passageId: "pA", deletedAt: null, structuredData: { questionText: "Q1", options: ["a"] } },
      { id: "q2", passageId: "pA", deletedAt: null, structuredData: null },
      { id: "q3", passageId: "pU", deletedAt: null, structuredData: { questionText: "Q3", _typeId: "TOPIC" } },
      { id: "q4", passageId: "pU", deletedAt: "2026-09-25", structuredData: JSON.stringify({ questionText: "Q4" }) },
      { id: "q5", passageId: "pU", deletedAt: null, structuredData: null },
      { id: "q6", passageId: "pB", deletedAt: null, structuredData: { questionText: "Q6" } },
      { id: "q7", passageId: "pT", deletedAt: null, structuredData: { questionText: "Q7" } },
      { id: "q8", passageId: "pX", deletedAt: null, structuredData: [1, 2] },
    ],
    jobs: [{ id: "j1", passageId: "pA" }, { id: "j2", passageId: "pU" }],
    examQuestions: [
      { examId: "e1", examTitle: "중간평가 1", questionId: "q3" },
      { examId: "e2", examTitle: "중간평가 2", questionId: "q3" },
      { examId: "e2", examTitle: "중간평가 2", questionId: "q5" },
      { examId: "e3", examTitle: "휴지통 시험", questionId: "q4" },
    ],
    restrict: [{ passageId: "pT", relation: "tutor_lessons", count: 2 }],
    cascade: { pU: { hasAnalysis: true, reports: 1, webtoons: 2, notes: 3, tutorConversations: 1 } },
  };
}

function makeStore(db, opts = {}) {
  const calls = [];
  const store = {
    async loadPassages(academyId, ids, o) {
      calls.push(["loadPassages", academyId, ids.slice(), o.lock]);
      return db.passages
        .filter((p) => ids.includes(p.id) && (opts.leakyScope || p.academyId === academyId))
        .map((p) => ({ ...p }));
    },
    async findDuplicateCandidates(academyId, ids, excludeIds, o) {
      calls.push(["findDuplicateCandidates", academyId, ids.slice(), excludeIds.slice(), o && o.lock]);
      const out = [];
      for (const id of ids) {
        for (const c of db.passages) {
          if (c.id === id || excludeIds.includes(c.id)) continue;
          if (!opts.leakyCandidates && c.academyId !== academyId) continue;
          out.push({ forId: id, candidate: { ...c } });
        }
      }
      return out;
    },
    async countQuestions(ids) {
      return ids.map((id) => ({
        passageId: id,
        live: db.questions.filter((q) => q.passageId === id && !q.deletedAt).length,
        trashed: db.questions.filter((q) => q.passageId === id && q.deletedAt).length,
      })).filter((r) => r.live + r.trashed > 0);
    },
    async findExamUsage(ids) {
      const out = [];
      for (const eq of db.examQuestions) {
        const q = db.questions.find((x) => x.id === eq.questionId);
        if (q && ids.includes(q.passageId) && !q.deletedAt) {
          out.push({ passageId: q.passageId, examId: eq.examId, examTitle: eq.examTitle });
        }
      }
      return out;
    },
    async countRestrictRefs(ids) { return db.restrict.filter((r) => ids.includes(r.passageId)); },
    async countCascadeRefs(ids) {
      return ids.map((id) => ({ passageId: id, ...(db.cascade[id] ?? { hasAnalysis: false, reports: 0, webtoons: 0, notes: 0, tutorConversations: 0 }) }));
    },
    async relinkRefs(from, to) {
      calls.push(["relinkRefs", from, to]);
      let questions = 0, jobs = 0;
      for (const q of db.questions) if (q.passageId === from) { q.passageId = to; questions += 1; }
      for (const j of db.jobs) if (j.passageId === from) { j.passageId = to; jobs += 1; }
      return { questions, workbenchAiJobs: jobs, questionSets: 0, teacherPrompts: 0, tutorAiLogs: 0 };
    },
    async loadLinkedQuestions(pid) {
      calls.push(["loadLinkedQuestions", pid]);
      return db.questions.filter((q) => q.passageId === pid).map((q) => ({ id: q.id, structuredData: clone(q.structuredData ?? null) }));
    },
    async writeQuestionStructuredData(id, value) {
      calls.push(["write", id]);
      db.questions.find((q) => q.id === id).structuredData = value;
    },
    async deletePassage(academyId, id) {
      calls.push(["deletePassage", academyId, id]);
      if (opts.deleteReturnsZero) return 0;
      const i = db.passages.findIndex((p) => p.id === id && p.academyId === academyId);
      if (i < 0) return 0;
      db.passages.splice(i, 1);
      for (const q of db.questions) if (q.passageId === id) q.passageId = null; // FK SET NULL
      for (const j of db.jobs) if (j.passageId === id) j.passageId = null;
      return 1;
    },
  };
  return { store, calls };
}

/** 트랜잭션 흉내 — 실패하면 DB 를 통째로 되돌린다. */
function makeRunTx(db, storeOpts = {}, hooks = {}) {
  let n = 0;
  const runTx = async (fn) => {
    n += 1;
    const snap = clone(db);
    const { store } = makeStore(db, storeOpts);
    try {
      if (hooks.failOnCall === n) {
        const orig = store.deletePassage;
        store.deletePassage = async (...a) => { await orig(...a); throw new Error("boom"); };
      }
      return await fn(store);
    } catch (e) {
      for (const k of Object.keys(snap)) db[k] = snap[k];
      for (const p of db.passages) p.createdAt = new Date(p.createdAt);
      throw e;
    }
  };
  return { runTx, count: () => n };
}

const NOW = new Date("2026-09-29T10:00:00.000Z");

async function main() {
  // ── 정규화 ──
  check("N1 collapse+trim", normalizePassageContent("  The  cat\n\n sat.\t ") === "The cat sat.");
  check("N2 NBSP/CRLF/tab collapse", normalizePassageContent("a  b\r\nc\td") === "a b c d");
  check("N3 non-string -> empty", normalizePassageContent(null) === "" && normalizePassageContent(undefined) === "" && normalizePassageContent(5) === "");
  check("N4 keeps case/punctuation", normalizePassageContent("A, b!") === "A, b!");

  check("S1 whitespace-only diff is same", isSamePassageContent("The  cat\nsat.", " The cat sat. "));
  check("S2 punctuation diff is NOT same", !isSamePassageContent("The cat sat.", "The cat sat"));
  check("S3 case diff is NOT same", !isSamePassageContent("The cat sat.", "the cat sat."));
  check("S4 empty vs empty is NOT same", !isSamePassageContent("  ", "\n"));
  check("S5 one extra char is NOT same", !isSamePassageContent("The cat sat.", "The cats sat."));

  // ── 옮겨 연결 대상 ──
  const P = (id, academyId, content, createdAt) => ({ id, academyId, title: id, content, createdAt: d(createdAt) });
  const self = P("s", "acA", "Hello  world", "2026-09-10");
  check("R1 oldest identical wins", chooseRelinkTarget(self, [P("n", "acA", "Hello world", "2026-09-05"), P("o", "acA", "Hello world", "2026-09-01")], new Set())?.id === "o");
  check("R2 self excluded", chooseRelinkTarget(self, [self], new Set()) === null);
  check("R3 excludeIds excluded", chooseRelinkTarget(self, [P("o", "acA", "Hello world", "2026-09-01")], new Set(["o"])) === null);
  check("R4 other academy excluded", chooseRelinkTarget(self, [P("o", "acB", "Hello world", "2026-09-01")], new Set()) === null);
  check("R5 near-identical rejected", chooseRelinkTarget(self, [P("o", "acA", "Hello world!", "2026-09-01")], new Set()) === null);
  check("R6 createdAt tie -> id asc", chooseRelinkTarget(self, [P("zz", "acA", "Hello world", "2026-09-01"), P("aa", "acA", "Hello world", "2026-09-01")], new Set())?.id === "aa");

  // ── structuredData 병합 ──
  const snap = { passageId: "p1", title: "T", content: "C", detachedAt: NOW.toISOString() };
  const obj = { questionText: "Q", options: ["a"] };
  const m1 = mergeSourcePassageSnapshot(obj, snap);
  check("M1 object keeps keys + adds", m1.mode === "object" && m1.value.questionText === "Q" && m1.value.options[0] === "a" && m1.value._sourcePassage.content === "C");
  check("M2 input not mutated", !("_sourcePassage" in obj));
  const m3 = mergeSourcePassageSnapshot({ q: 1, _sourcePassage: { passageId: "old" } }, snap);
  check("M3 overwrites old snapshot", m3.value._sourcePassage.passageId === "p1");
  const m4 = mergeSourcePassageSnapshot(null, snap);
  check("M4 null -> object(empty)", m4.mode === "empty" && m4.value._sourcePassage.title === "T");
  check("M5 undefined -> empty", mergeSourcePassageSnapshot(undefined, snap).mode === "empty");
  const m6 = mergeSourcePassageSnapshot(JSON.stringify({ questionText: "Q" }), snap);
  check("M6 JSON-object string stays string", m6.mode === "json-string" && typeof m6.value === "string" && JSON.parse(m6.value).questionText === "Q" && JSON.parse(m6.value)._sourcePassage.content === "C");
  check("M7 'null' string -> json-string", mergeSourcePassageSnapshot("null", snap).mode === "json-string");
  const bad = "not json";
  const m8 = mergeSourcePassageSnapshot(bad, snap);
  check("M8 unparsable string untouched", m8.mode === "unsupported" && m8.value === bad);
  const arr = [1, 2];
  const m9 = mergeSourcePassageSnapshot(arr, snap);
  check("M9 array untouched", m9.mode === "unsupported" && m9.value === arr);
  check("M10 number untouched", mergeSourcePassageSnapshot(7, snap).mode === "unsupported");
  check("M11 JSON array string untouched", mergeSourcePassageSnapshot("[1]", snap).mode === "unsupported");

  check("I1 sanitize ids dedupe/trim/drop junk", JSON.stringify(sanitizePassageIds([" a", "a", "", null, 3, "b"])) === JSON.stringify(["a", "b"]));

  // ── 학원 범위(IDOR) ──
  await checkAsync("P1 IDOR: other academy passage untouched", async () => {
    const db = makeDb(); const { store, calls } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pB"], { now: NOW });
    const touched = calls.some((c) => ["relinkRefs", "write", "deletePassage", "loadLinkedQuestions"].includes(c[0]));
    return r.outcomes.length === 0 && r.notFoundIds[0] === "pB" && db.passages.some((p) => p.id === "pB") && !touched && db.questions.find((q) => q.id === "q6").passageId === "pB";
  });
  await checkAsync("P2 IDOR: leaky store still cannot delete foreign row", async () => {
    const db = makeDb(); const { store, calls } = makeStore(db, { leakyScope: true });
    const r = await executePassageDeletion(store, "acA", ["pB"], { now: NOW });
    return r.outcomes.length === 0 && db.passages.some((p) => p.id === "pB") && !calls.some((c) => c[0] === "deletePassage");
  });
  await checkAsync("P3 mixed own+foreign: only own deleted", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pE", "pB"], { now: NOW });
    return r.outcomes.map((o) => o.passageId).join() === "pE" && db.passages.some((p) => p.id === "pB") && !db.passages.some((p) => p.id === "pE");
  });
  await checkAsync("P3b leaky candidates: foreign identical passage never a relink target", async () => {
    const db = makeDb();
    db.passages = db.passages.filter((p) => p.id !== "pC" && p.id !== "pC2"); // only pB(acB) identical
    const { store, calls } = makeStore(db, { leakyCandidates: true });
    const r = await executePassageDeletion(store, "acA", ["pA"], { now: NOW });
    return r.outcomes[0].mode === "detached" && !calls.some((c) => c[0] === "relinkRefs");
  });

  // ── 옮겨 연결 vs 원문 보관 ──
  await checkAsync("P4 relink to identical same-academy passage (oldest)", async () => {
    const db = makeDb(); const { store, calls } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pA"], { now: NOW });
    const o = r.outcomes[0];
    return o.mode === "relinked" && o.relinkTarget.id === "pC" &&
      db.questions.filter((q) => q.passageId === "pC").length === 2 &&
      db.jobs.find((j) => j.id === "j1").passageId === "pC" &&
      !calls.some((c) => c[0] === "write") && !db.passages.some((p) => p.id === "pA") &&
      db.questions.find((q) => q.id === "q1").structuredData._sourcePassage === undefined;
  });
  await checkAsync("P5 detach: live+trash questions keep original text", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pU"], { now: NOW });
    const o = r.outcomes[0];
    const q3 = db.questions.find((q) => q.id === "q3");
    const q4 = db.questions.find((q) => q.id === "q4");
    const q5 = db.questions.find((q) => q.id === "q5");
    const q4sd = JSON.parse(q4.structuredData);
    return o.mode === "detached" && q3.passageId === null &&
      q3.structuredData._sourcePassage.content === "Unique text here." &&
      q3.structuredData._sourcePassage.title === "unique" &&
      q3.structuredData._sourcePassage.passageId === "pU" &&
      q3.structuredData._sourcePassage.detachedAt === NOW.toISOString() &&
      q3.structuredData._typeId === "TOPIC" &&
      q4sd._sourcePassage.content === "Unique text here." && q4sd.questionText === "Q4" &&
      q5.structuredData._sourcePassage.passageId === "pU" &&
      o.snapshot.object === 1 && o.snapshot["json-string"] === 1 && o.snapshot.empty === 1 &&
      o.liveQuestionCount === 2 && o.trashedQuestionCount === 1 && o.examIds.length === 2;
  });
  await checkAsync("P6 deleting both duplicates: neither relinks to the other", async () => {
    const db = makeDb();
    db.passages = db.passages.filter((p) => p.id !== "pC2");
    const { store, calls } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pA", "pC"], { now: NOW });
    return !calls.some((c) => c[0] === "relinkRefs") &&
      r.outcomes.find((o) => o.passageId === "pA").mode === "detached" &&
      db.questions.find((q) => q.id === "q1").structuredData._sourcePassage.content === "The  cat\nsat.";
  });
  await checkAsync("P7 relink skips a target that is also being deleted -> next oldest", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pA", "pC"], { now: NOW });
    return r.outcomes.find((o) => o.passageId === "pA").relinkTarget.id === "pC2" &&
      db.questions.filter((q) => q.passageId === "pC2").length === 2;
  });
  await checkAsync("P8 RESTRICT (tutor lesson) -> blocked, untouched", async () => {
    const db = makeDb(); const { store, calls } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pT"], { now: NOW });
    return r.outcomes.length === 0 && r.blocked[0].blockedBy[0].relation === "tutor_lessons" &&
      db.passages.some((p) => p.id === "pT") && !calls.some((c) => c[0] === "write" || c[0] === "deletePassage") &&
      db.questions.find((q) => q.id === "q7").structuredData._sourcePassage === undefined;
  });
  await checkAsync("P9 unsupported structuredData untouched + audit keeps text", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pX"], { now: NOW });
    const ev = buildPassageDeleteAuditEvents(r, { academyId: "acA", actorId: "s1", via: "test" });
    return Array.isArray(db.questions.find((q) => q.id === "q8").structuredData) &&
      r.outcomes[0].snapshot.unsupported === 1 &&
      ev[0].metadata.sourcePassage.content === "Array text." && ev[0].metadata.detachedQuestionIds.length === 0 &&
      ev[0].metadata.unsupportedQuestionIds[0] === "q8";
  });
  await checkAsync("P9b detach audit keeps a recovery copy (편집 경로가 _sourcePassage 를 잃어도 복구)", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pU", "pA"], { now: NOW });
    const ev = buildPassageDeleteAuditEvents(r, { academyId: "acA", actorId: "s1", via: "test" });
    const [u, a] = ["pU", "pA"].map((id) => ev.find((e) => e.resourceId === id).metadata);
    return u.sourcePassage.content === "Unique text here." && u.sourcePassage.title === "unique" &&
      JSON.stringify([...u.detachedQuestionIds].sort()) === JSON.stringify(["q3", "q4", "q5"]) &&
      !("unsupportedQuestionIds" in u) && !("fallbackSourcePassage" in u) &&
      a.mode === "relinked" && !("sourcePassage" in a) && !("detachedQuestionIds" in a);
  });
  await checkAsync("P10 delete count 0 -> conflict error, rollback restores snapshots", async () => {
    const db = makeDb();
    const { runTx } = makeRunTx(db, { deleteReturnsZero: true });
    let threw = null; try { await runTx((store) => executePassageDeletion(store, "acA", ["pU"], { now: NOW })); } catch (e) { threw = e; }
    return threw instanceof PassageDeleteConflictError &&
      db.questions.find((q) => q.id === "q3").structuredData._sourcePassage === undefined &&
      db.passages.some((p) => p.id === "pU");
  });
  await checkAsync("P11 chunking: 3 tx, chunk 2 fails -> chunk 1 kept, 2 rolled back, 3 skipped", async () => {
    const db = makeDb();
    for (let i = 0; i < 45; i++) db.passages.push({ id: "z" + String(i).padStart(2, "0"), academyId: "acA", title: "z" + i, content: "zz " + i, createdAt: d("2026-09-01") });
    const ids = db.passages.filter((p) => p.id.startsWith("z")).map((p) => p.id);
    const { runTx, count } = makeRunTx(db, {}, { failOnCall: 2 });
    const r = await runChunkedPassageDeletion(runTx, "acA", ids, { now: NOW, chunkSize: 20 });
    const left = db.passages.filter((p) => p.id.startsWith("z")).length;
    return count() === 2 && r.outcomes.length === 20 && r.error && r.error.message === "boom" && left === 25 && r.requested === 45;
  });
  await checkAsync("P12 cross-chunk: never relink to a passage deleted in a later chunk", async () => {
    const db = makeDb();
    db.passages = db.passages.filter((p) => p.id !== "pC2");
    const { runTx } = makeRunTx(db);
    const r = await runChunkedPassageDeletion(runTx, "acA", ["pA", "pC"], { now: NOW, chunkSize: 1 });
    return r.outcomes.find((o) => o.passageId === "pA").mode === "detached" && r.error === null;
  });
  await checkAsync("P13 plan(lock:false) for impact, execute locks", async () => {
    const db = makeDb(); const a = makeStore(db); const b = makeStore(makeDb());
    await planPassageDeletion(a.store, "acA", ["pU"], { lock: false });
    await executePassageDeletion(b.store, "acA", ["pU"], { now: NOW });
    const [fa, fb] = [a, b].map((x) => x.calls.find((c) => c[0] === "findDuplicateCandidates"));
    return a.calls[0][3] === false && b.calls[0][3] === true && a.calls.every((c) => c[0] !== "deletePassage") &&
      fa[4] === false && fb[4] === true;
  });
  await checkAsync("P14 empty academyId rejected", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    try { await executePassageDeletion(store, "", ["pU"], { now: NOW }); return false; } catch { return db.passages.some((p) => p.id === "pU"); }
  });
  await checkAsync("P16 impact(whole selection) targets == chunked execution targets", async () => {
    const db = makeDb(); const sel = [];
    for (let k = 0; k < 12; k++) for (let i = 0; i < 5; i++) {
      const pid = "k" + k + "m" + i;
      db.passages.push({ id: pid, academyId: "acA", title: pid, content: "Cluster " + k + (i % 2 ? "  text." : " text."), createdAt: d("2026-08-" + String(10 + i).padStart(2, "0")) });
      if (i % 2 === 1) { sel.push(pid); db.questions.push({ id: "qq" + pid, passageId: pid, deletedAt: null, structuredData: {} }); }
    }
    const imp = await planPassageDeletion(makeStore(db).store, "acA", sel, { lock: false });
    const want = new Map(imp.items.map((it) => [it.passage.id, it.relinkTarget && it.relinkTarget.id]));
    const { runTx } = makeRunTx(db);
    const r = await runChunkedPassageDeletion(runTx, "acA", sel, { now: NOW, chunkSize: 3 });
    return r.outcomes.length === sel.length && r.outcomes.every((o) => o.relinkTarget && o.relinkTarget.id === want.get(o.passageId) && /m0$/.test(o.relinkTarget.id));
  });
  await checkAsync("P15 audit events: one per deleted passage", async () => {
    const db = makeDb(); const { store } = makeStore(db);
    const r = await executePassageDeletion(store, "acA", ["pA", "pU", "pT", "pB"], { now: NOW });
    const ev = buildPassageDeleteAuditEvents(r, { academyId: "acA", actorId: "s1", via: "test" });
    return ev.length === 2 && ev.every((e) => e.eventType === PASSAGE_DELETE_EVENT_TYPE && e.resourceType === "PASSAGE" && e.actorId === "s1" && e.academyId === "acA") &&
      ev.find((e) => e.resourceId === "pA").metadata.mode === "relinked" && ev.find((e) => e.resourceId === "pU").metadata.mode === "detached";
  });

  // ── 확인창 문구 ──
  const plan = async (ids) => { const db = makeDb(); const { store } = makeStore(db); return toPassageDeletionImpact(await planPassageDeletion(store, "acA", ids, { lock: false })); };
  const cU = buildPassageDeletionConfirm(await plan(["pU"]));
  check("C1 single detach tells the truth", cU.title === "이 지문을 삭제할까요?" && cU.description.includes("문제 2개(시험지 2개에서 사용 중: 중간평가 1, 중간평가 2)는 지문 원문을 보관한 채 남습니다.") && cU.description.includes("휴지통에 있는 문제 1개") && !cU.description.includes("관련 문제도 모두 삭제") && cU.deletableCount === 1);
  check("C1b cascade line", cU.description.includes("지문 분석 결과·마킹 3개·A4 학습자료 1개·웹툰 2개·학생 AI 튜터 대화 1개도 함께 삭제됩니다."));
  const cA = buildPassageDeletionConfirm(await plan(["pA"]));
  check("C2 single relink names target", cA.description.includes("문제 2개를 같은 내용의 지문 「day 6」에 옮겨 연결한 뒤 삭제합니다."));
  const cT = buildPassageDeletionConfirm(await plan(["pT"]));
  check("C3 blocked single", cT.deletableCount === 0 && cT.description.includes("튜터 수업"));
  const cM = buildPassageDeletionConfirm(await plan(["pA", "pU", "pT", "pB"]));
  check("C4 bulk mixed", cM.title === "선택한 지문 2편을 삭제할까요?" && cM.description.includes("1편은 같은 내용의 다른 지문이 있어, 문제 2개를") && cM.description.includes("1편으로 만든 문제 3개(휴지통 1개 포함, 시험지 2개에서 사용 중: 중간평가 1, 중간평가 2)는 지문 원문을 보관한 채 남습니다.") && cM.description.includes("1편은 튜터 수업에 연결돼 있어 삭제하지 않습니다.") && cM.description.includes("1편은 찾을 수 없어 건너뜁니다.") && cM.blockedCount === 1);
  const cN = buildPassageDeletionConfirm(await plan(["pU"]), { noun: "학습지" });
  check("C5 noun 학습지 particles", cN.title === "이 학습지를 삭제할까요?" && cN.description.startsWith("이 학습지로 만든 문제"));
  const cE = buildPassageDeletionConfirm(await plan(["pE"]));
  check("C6 no questions", cE.description.startsWith("이 지문으로 만든 문제는 없습니다."));
  const imp = await plan(["pU"]);
  check("C7 impact DTO carries no passage content", !JSON.stringify(imp).includes("Unique text here."));
  const cF = buildPassageDeletionConfirm(await plan(["pB"]));
  check("C8 foreign-only -> nothing deletable", cF.deletableCount === 0 && !JSON.stringify(cF).includes("other academy"));

  // ── 오류 문구 ──
  const concurrent = "다른 곳에서 동시에 진행 중인 지문 삭제와 겹쳐";
  check("E1 deadlock (P2010 meta 40P01, 실측 모양) -> retry message", describePassageDeleteError({ code: "P2010", meta: { code: "40P01", message: "ERROR: deadlock detected" } }).includes(concurrent));
  check("E2 P2034 -> retry message", describePassageDeleteError({ code: "P2034" }).includes(concurrent));
  check("E3 P2003 -> linked-feature message", describePassageDeleteError({ code: "P2003" }).startsWith("다른 기능(수업·학습 기록 등)"));
  check("E4 plain Error keeps message", describePassageDeleteError(new Error("boom")) === "boom");
  check("E5 unknown -> generic", describePassageDeleteError(null) === "지문 삭제 중 오류가 발생했습니다.");
  process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
}
main().catch((e) => { process.stdout.write(JSON.stringify({ passed, failed: 1, failures: ["harness crashed: " + (e && e.stack)] })); });
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".passage-delete-guard-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("passage delete guard: 정규화·옮겨 연결·원문 보관·학원 범위·청크·문구", () => {
  assert.deepEqual(summary.failures, [], `failed: ${summary.failures.join(" | ")}`);
  assert.ok(summary.passed >= 50, `expected >= 50 checks, got ${summary.passed}`);
});

const src = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

/** `export async function NAME(` 부터 다음 export 직전까지. */
function exportBody(file, name) {
  const start = file.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = file.indexOf("\nexport ", start + 10);
  return file.slice(start, next < 0 ? undefined : next);
}

test("passages.ts: 모든 변경 액션이 학원 범위를 건다(IDOR 회귀 방지)", () => {
  const file = src("src/actions/workbench/passages.ts");
  // 물리 삭제는 가드만 한다.
  assert.doesNotMatch(file, /prisma\.passage\.delete\(/);
  assert.doesNotMatch(file, /prisma\.passage\.deleteMany\(/);
  assert.match(exportBody(file, "deleteWorkbenchPassage"), /deletePassagesGuarded\(\{\s*academyId: staff\.academyId/);
  assert.match(exportBody(file, "bulkDeleteWorkbenchPassages"), /deletePassagesGuarded\(\{\s*academyId: staff\.academyId/);
  assert.match(exportBody(file, "updateWorkbenchPassage"), /updateMany\(\{\s*where: \{ id: passageId, academyId \}/);
  assert.match(exportBody(file, "bulkUpdatePassageTags"), /where: \{ id: \{ in: passageIds \}, academyId: staff\.academyId \}/);
  assert.match(exportBody(file, "getWorkbenchPassage"), /where: \{ id: passageId, academyId: staff\.academyId \}/);
  // 모든 prisma.passage.update/updateMany 의 where 에 academyId 가 있다.
  const re = /prisma\.passage\.(update|updateMany)\(\{\s*where: ([\s\S]*?),\s*data:/g;
  let m;
  let n = 0;
  while ((m = re.exec(file))) {
    n += 1;
    assert.match(m[2], /academyId/, `unscoped prisma.passage.${m[1]} where: ${m[2]}`);
  }
  assert.ok(n >= 6, `expected >= 6 scoped passage updates, got ${n}`);
  assert.match(exportBody(file, "getPassageDeletionImpact"), /loadPassageDeletionImpact\(staff\.academyId/);
});

test("passage-delete-store: 지문 조회·잠금·삭제 SQL 이 학원 범위를 건다", () => {
  const store = src("src/actions/workbench/_lib/passage-delete-store.ts");
  assert.match(store, /WHERE id = ANY\(\$\{ids\}::text\[\]\) AND "academyId" = \$\{academyId\}\s+ORDER BY id\s+FOR UPDATE/);
  assert.match(store, /findMany\(\{\s*where: \{ id: \{ in: ids \}, academyId \}/);
  assert.match(store, /deleteMany\(\{ where: \{ id: passageId, academyId \} \}\)/);
  assert.match(store, /d\."academyId" = \$\{academyId\}/);
  // 동일 후보는 잘라 내지 않는다(LIMIT 이 확인창·실행 대상을 어긋나게 했다, 26-09-30) + 결정적 순서.
  assert.doesNotMatch(store, /LIMIT\s+\d/);
  const part = (a, b) => store.slice(store.indexOf(a), store.indexOf(b));
  const pairs = part("function queryDuplicatePairs(", "function loadCandidateRows(");
  assert.match(pairs, /DISTINCT ON \(d\.id, c\.content COLLATE "C"\)/);
  assert.match(pairs, /ORDER BY d\.id, c\.content COLLATE "C", c\."createdAt", c\.id`/);
  // 실행 경로는 옮겨 연결 대상을 FOR KEY SHARE 로 잠근다(대상이 동시에 지워지는 경합).
  assert.match(part("function loadCandidateRows(", "export function createPrismaPassageDeleteStore("),
    /"academyId" = \$\{academyId\}\s+ORDER BY id\s+FOR KEY SHARE/);
  // 휴지통 문항도 옮기고 원문을 보관한다 — deletedAt 조건 금지.
  const linked = part("async loadLinkedQuestions(", "async writeQuestionStructuredData(");
  assert.match(linked, /WHERE "passageId" = \$\{passageId\}\s+ORDER BY id\s+FOR UPDATE/);
  assert.doesNotMatch(linked, /deletedAt/);
  assert.doesNotMatch(part("async relinkRefs(", "async loadLinkedQuestions("), /deletedAt/);
  // SET NULL 외래키 다섯 개를 전부 옮긴다.
  for (const model of ["question", "workbenchAiJob", "questionSet", "teacherPrompt", "tutorAiLog"]) {
    assert.match(store, new RegExp(`db\\.${model}\\.updateMany\\(`), `relink misses ${model}`);
  }
  assert.match(store, /PASSAGE_DELETE_TX_OPTIONS/);
});

test("지문 삭제 확인창: 거짓 문구 제거 + 영향 조회 배선", () => {
  const files = [
    "src/components/workbench/passage-analysis-modal.tsx",
    "src/components/workbench/passage-detail-client.tsx",
    "src/app/(director)/director/korean/passages/[passageId]/korean-passage-detail-client.tsx",
    "src/components/workbench/passage-list-client.tsx",
    "src/app/(director)/director/workbench/generate/use-passage-collections.ts",
    "src/components/workbench/passage-registration/use-passage-library.ts",
  ];
  for (const f of files) {
    const s = src(f);
    assert.doesNotMatch(s, /관련 문제도 모두 삭제/, `${f} still claims questions are deleted`);
    assert.doesNotMatch(s, /분석\/문제 데이터도 함께 삭제/, `${f} still claims questions are deleted`);
    assert.match(s, /confirmPassageDeletion\(/, `${f} does not use the impact-backed confirm`);
  }
});
