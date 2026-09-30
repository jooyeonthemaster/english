// AUDIT-BACKFILL (26-09-30) — scripts/backfill/orphan-passage-backfill 의 순수 로직 단위 테스트(DB 없음).
// 재구성(순서 재조립·삽입·무관·빈칸), 문항별 근거(섞인 잡 무리), 계획 단계(0 증명·1 동일 전문·2 원문 보관),
// SQL 가드·되돌리기, 적용 전제 조건(거부 규칙)·롤백을 잠근다.
// AB-R1(26-09-30): 0·1단계 자동 적용은 문항별 근거(exact·consistent·1:1 잡 증명+닻)가 있는 문항만 — 근거 없는
// (no-evidence) 문항은 relinkReview(approved:true 여야 적용)로 간다.
// GA-1(26-09-30): 단계별 적용 범위(--stages · applyScope · 단계별 해시) — 0단계만 승인 · 적용할 수 있다.
// GA-2(26-09-30): 0단계는 잡을 잇지 않고, 1단계는 생성 잡(QUESTION_GENERATION)만 잇는다.
// COH-13(26-09-30): 동일 지문 정규화는 삭제 가드의 normalizePassageContent 그 자체다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
const pick = (m) => m.default ?? m["module.exports"] ?? m;
const R = pick(await import("../scripts/backfill/orphan-passage/reconstruct"));
const E = pick(await import("../scripts/backfill/orphan-passage/evidence"));
const P = pick(await import("../scripts/backfill/orphan-passage/plan"));
const S = pick(await import("../scripts/backfill/orphan-passage/sql"));
const A = pick(await import("../scripts/backfill/orphan-passage/apply"));
const G = pick(await import("../src/actions/workbench/_lib/passage-delete-guard"));
const out = {};
out.singleSource = { same: R.normalizeForIdentity === G.normalizePassageContent, nbsp: R.normalizeForIdentity("  a\u00a0\n b  ") };
out.parseStages = ["0", "0,1", "1,0,1", "all", "ALL", "3", "", "0;1"].map((x) => P.parseStages(x));

// 실제 지문처럼 60낱말 이상(지문 내장형 발문을 근거로 쓰는 하한 — evidence.ts MIN_WORDS_FOR_TEXT).
const PASS_A = "Alpha one begins the story here beside the old river bank. Alpha two continues with more detail about the river and its many bridges. Alpha three explains why the small town grew so quickly after the war. Alpha four describes the market that opened every Sunday morning. Alpha five tells how the farmers carried grain across the hills. Alpha six notes that the school doubled in size within a decade. Alpha seven recalls the flood that nearly destroyed everything. Alpha eight ends with a lesson for careful readers.";
const PASS_B = "Beta text talks about high mountains and deep snow in the north. Beta climbers prepare ropes and food for many long days. Beta storms arrive without any warning in the middle of winter. Beta rescue teams train every single week near the glacier. Beta guides study maps and weather charts each night. Beta villages depend on tourism during the short summer. Beta avalanches close the passes for several months. Beta families still tell old stories about lost travelers.";
const FIVE_ORDER = [{ label: "1", text: "(A)-(C)-(B)" }, { label: "2", text: "(B)-(A)-(C)" }, { label: "3", text: "(B)-(C)-(A)" }, { label: "4", text: "(C)-(A)-(B)" }, { label: "5", text: "(C)-(B)-(A)" }];
const order = (id, given, a, b, c, answer = "3") => ({
  id, academyId: "ac1", subType: "SENTENCE_ORDER", questionText: "순서?", options: JSON.stringify(FIVE_ORDER), correctAnswer: answer, setId: null, createdAt: new Date(0), sdMd5: "m-" + id,
  structuredData: { givenSentence: given, paragraphs: [{ label: "(A)", text: a }, { label: "(B)", text: b }, { label: "(C)", text: c }], options: FIVE_ORDER, correctAnswer: answer },
});
// 8문장 지문을 주어진 글(0~1) · (A)(6~7) · (B)(2~3) · (C)(4~5) 로 쪼개 (B)-(C)-(A) 로 재조립되게 한다.
const split8 = (p) => {
  const t = p.match(/[^.]+\./g).map((x) => x.trim());
  return [t.slice(0, 2).join(" "), t.slice(6, 8).join(" "), t.slice(2, 4).join(" "), t.slice(4, 6).join(" ")];
};
const orderA = (id) => order(id, ...split8(PASS_A));
const orderB = (id) => order(id, ...split8(PASS_B));
const src = (id, subType = "TITLE", extra = {}) => ({ id, academyId: "ac1", subType, questionText: "다음 글의 제목으로 가장 적절한 것은?", options: "[]", correctAnswer: "1", setId: null, createdAt: new Date(0), sdMd5: "m-" + id, structuredData: {}, ...extra });
const embedded = (id, text) => ({ id, academyId: "ac1", subType: "BLANK_INFERENCE", questionText: "다음 빈칸에 들어갈 말은?\n\n" + text, options: "[]", correctAnswer: "1", setId: null, createdAt: new Date(0), sdMd5: "m-" + id, structuredData: {} });

// ── 재구성 ──
out.reassemble = R.reassembleSentenceOrder(orderA("o1"));
out.reassembleCircled = R.reassembleSentenceOrder(order("o2", ...split8(PASS_A), "③"));
out.reassembleBadAnswer = R.reassembleSentenceOrder(order("o3", ...split8(PASS_A), "9"));
out.insert = R.reconstructSentenceInsert({ id: "i1", subType: "SENTENCE_INSERT", questionText: "", options: null, correctAnswer: "②", structuredData: { givenSentence: "Middle sentence goes here.", passageWithMarkers: "First sentence is long enough to count. ( ① ) Second one follows. ( ② ) Third one ends. ( ③ )", correctAnswer: "②" } });
out.irrelevant = R.reconstructIrrelevant({ id: "r1", subType: "IRRELEVANT", questionText: "", options: null, correctAnswer: "②", structuredData: { passageWithNumbers: "Intro text. ① Keep this line. ② Remove me now. ③ Keep that line.", sentences: ["Keep this line.", "Remove me now.", "Keep that line."], correctAnswer: "②" } });
out.blank = R.reconstructBlank({ id: "b1", subType: "BLANK_INFERENCE", questionText: "", options: JSON.stringify([{ label: "1", text: "wrong" }, { label: "2", text: "right words" }]), correctAnswer: "2", structuredData: { passageWithBlank: "The answer is ________ in this sentence." } });
out.strip = R.stripDisplayMarkers("He __(A) runs__ fast ⓐ and [goes / went] home ① now .");
out.recallVsSim = [R.tokenRecall("지시문 지시문 지시문 " + PASS_A, PASS_A), Number(R.tokenSimilarity("지시문 지시문 지시문 " + PASS_A, PASS_A).toFixed(3)), R.tokenRecall(PASS_B, PASS_A) < 0.6];

// ── 문항별 근거 ──
const mixed = [orderA("a1"), orderA("a2"), embedded("b1", PASS_B), src("t1"), src("sw", "SUMMARY_COMPLETE", { questionText: "다음 글의 내용을 한 문장으로 요약하고자 한다. ".repeat(12) + "[요약문] (A) ___ (B) ___" })];
const vMixed = E.judgeGroup(mixed, PASS_A, []);
out.mixed = { homogeneous: vMixed.homogeneous, linkable: vMixed.linkable, byQ: Object.fromEntries(vMixed.byQuestion) };
const vHomo = E.judgeGroup([orderA("a1"), embedded("e1", PASS_A.replace("river", "__river__")), src("t1"), src("sw", "SUMMARY_COMPLETE", { questionText: "요약하시오 ".repeat(70) })], PASS_A, []);
out.homo = { homogeneous: vHomo.homogeneous, linkable: vHomo.linkable, byQ: Object.fromEntries(vHomo.byQuestion) };
const jl = (questionId, rp, n, ctid) => ({ questionId, jobId: "j", academyId: "ac1", title: "", jobPassageId: null, resultPassageId: rp, createdAt: new Date(0), jobQuestionCount: n, clientTempId: ctid });
out.jobProof = [
  E.jobProvesSource([jl("q", "X", 1, "fast:X:TITLE:1:0")], "q", "X"),
  E.jobProvesSource([jl("q", "X", 3, "fast:X:TITLE:1:0")], "q", "X"),
  E.jobProvesSource([jl("q", "X", 1, null)], "q", "X"),
  E.jobProvesSource([jl("q", "X", 1, "fast:Y:TITLE:1:0")], "q", "X"),
  E.jobProvesSource([jl("q", "X", 1, "fast:X:TITLE:1:0"), jl("q", "Y", 4, null)], "q", "X"),
  E.jobProvesSource([], "q", "X"),
];
const byQ = new Map([["e1", "exact"], ["c1", "consistent"], ["n1", "no-evidence"], ["n2", "no-evidence"]]);
const proofLinks = [jl("e1", "X", 1, "fast:X:A:1:0"), jl("n1", "X", 1, "fast:X:TITLE:1:0"), jl("n2", "X", 5, null)];
const part = (links) => { const r = E.partitionLinkable(["e1", "c1", "n1", "n2"], byQ, "X", links); return { auto: r.auto.map((a) => a.questionId + ":" + a.evidence), pending: r.pending }; };
out.partition = { anchored: part(proofLinks), unanchored: part(proofLinks.slice(1)) };

// ── 계획 ──
const live = (id, content, created, academyId = "ac1") => ({ id, academyId, title: "T-" + id, content, createdAt: new Date(created) });
// 기본 잡 = 여러 문항을 낸 잡(근거 못 됨). o.one 이면 그 문항 하나만 낸 빠른 생성 잡(clientTempId 에 지문 id).
const link = (qid, rp, title = "job title", o = {}) => ({ questionId: qid, jobId: "j-" + qid, academyId: "ac1", title, jobPassageId: null, resultPassageId: rp, createdAt: new Date(0), jobQuestionCount: o.one ? 1 : 3, clientTempId: o.one ? "fast:" + rp + ":T:1:0" : null });
const baseData = () => ({
  orphans: [
    orderA("a1"), orderA("a2"), src("aT"),                       // 무리 R1 → L1(PASS_A), 균질
    orderB("b1"), src("bT"),                                      // 무리 R2 → 재구성 하나뿐 → 검토
    orderA("m1"), orderA("m2"), embedded("m3", PASS_B), src("mT"), // 무리 R3 섞임 → m1,m2 만 L1
    src("s1"), src("s2"),                                          // 무리 R4 → 저장본만(살아 있는 지문 없음) → 2단계
    embedded("x1", PASS_B),                                        // 무리 R5 지문 내장형 — 손대지 않음
    src("d1", "TITLE", { structuredData: { _sourcePassage: { content: "kept", passageId: "old", title: "", detachedAt: "t" } } }),
    orderA("p1"), orderA("p2"), src("pT"), src("pJ", "CONTENT_MATCH"), // 무리 R7 균질, 닻 없음 → pT·pJ 검토 대기
  ],
  jobLinks: [link("a1", "R1", "job title", { one: true }), link("a2", "R1"), link("aT", "R1", "job title", { one: true }), link("b1", "R2"), link("bT", "R2"),
    link("m1", "R3"), link("m2", "R3"), link("m3", "R3"), link("mT", "R3"), link("s1", "R4", "Snap title"), link("s2", "R4"), link("x1", "R5"), link("d1", "R6"),
    link("p1", "R7"), link("p2", "R7"), link("pT", "R7"), link("pJ", "R7", "job title", { one: true })],
  existingPassageIds: new Set(),
  livePassages: [live("L1new", PASS_A, 5000), live("L1", PASS_A.replace(/ /g, "  "), 1000), live("L2", PASS_B, 1000), live("OTHER", PASS_A, 0, "ac2")],
  snapshots: [{ examId: "ex1", academyId: "ac1", examTitle: "E", updatedAt: new Date(10), src: "items", questionId: "s1", passageContent: "Snapshot passage text for the s group, long enough to be a passage body.", passageTitle: "Snap P" }],
  examUses: [{ questionId: "s1", examId: "ex1", title: "E", printCount: 3, academyId: "ac1" }],
  relinkableJobs: [{ id: "jR1", academyId: "ac1", domain: "QUESTION_GENERATION", rp: "R1" }, { id: "jR1a", academyId: "ac1", domain: "PASSAGE_ANALYSIS", rp: "R1" }, { id: "jR3", academyId: "ac1", domain: "QUESTION_GENERATION", rp: "R3" }, { id: "jR7", academyId: "ac1", domain: "QUESTION_GENERATION", rp: "R7" }],
});
const plan = P.buildPlan(baseData(), { academyId: "ac1", generatedAt: "2026-09-30T00:00:00.000Z" });
out.plan = {
  version: plan.planVersion,
  stage0: plan.stage0.status,
  s1groups: plan.stage1.groups.map((g) => [g.deletedPassageId, g.toPassageId, g.questionIds, g.pendingQuestionIds, g.homogeneous, g.excluded.map((e) => e.questionId + ":" + e.consistency)]),
  s1evidence: plan.stage1.items.map((i) => i.questionId + ":" + i.evidence),
  s1jobs: plan.stage1.jobs.map((j) => j.jobId),
  s1jobsSkipped: plan.stage1.jobsSkipped.map((j) => j.jobId + ":" + j.domain),
  relinkReview: plan.relinkReview.items.map((i) => [i.questionId, i.stage, i.toPassageId, i.evidence, i.jobProvesQuestion, i.requiresReview, i.approved]),
  counts: [plan.counts.stage1Questions, plan.counts.stage1ByJobProof, plan.counts.stage1PendingReview],
  review: plan.review.map((r) => r.kind + ":" + r.deletedPassageId),
  s2: plan.stage2.items.map((i) => [i.questionId, i.source, i.fromQuestionId, i.title, i.requiresReview, i.approved]),
  s2after: plan.stage2.items.map((i) => i.after.structuredData._sourcePassage),
  unrec: plan.unrecoverable.map((u) => u.questionId + ":" + u.reason),
  untouched: plan.untouched,
};
const plan2 = P.buildPlan(baseData(), { academyId: "ac1", generatedAt: "2027-01-01T00:00:00.000Z" });
const changed = baseData();
changed.snapshots[0].passageContent += " extra";
out.hash = { stable: plan.planHash === plan2.planHash, changes: plan.planHash !== P.buildPlan(changed, { academyId: "ac1", generatedAt: "x" }).planHash };

// 0단계: 고객 무리(고정 id) — day 6 전문 일치 증명 → ready, 불일치 → blocked(항목 0)
const S0 = P.STAGE0;
const q0 = (id) => ({ ...orderA(id), id, academyId: S0.academyId });
const s0data = (targetContent, proven = true) => ({
  orphans: [q0(S0.expectedQuestionIds[4]), { ...src(S0.expectedQuestionIds[3], "TOPIC"), academyId: S0.academyId }],
  jobLinks: [S0.expectedQuestionIds[4], S0.expectedQuestionIds[3]].map((q) => ({ ...link(q, S0.deletedPassageId, "job title", { one: proven }), academyId: S0.academyId })),
  existingPassageIds: new Set(),
  livePassages: [live(S0.targetPassageId, targetContent, 1, S0.academyId)],
  snapshots: [], examUses: [],
  relinkableJobs: [{ id: "jc", academyId: S0.academyId, domain: "QUESTION_GENERATION", rp: S0.deletedPassageId }, { id: "ja", academyId: S0.academyId, domain: "PASSAGE_ANALYSIS", rp: S0.deletedPassageId }],
});
const ok0 = P.buildPlan(s0data(PASS_A), { academyId: S0.academyId, generatedAt: "t" });
const bad0 = P.buildPlan(s0data(PASS_A + " Edited."), { academyId: S0.academyId, generatedAt: "t" });
const unproven0 = P.buildPlan(s0data(PASS_A, false), { academyId: S0.academyId, generatedAt: "t" });
out.stage0 = {
  ok: [ok0.stage0.status, ok0.stage0.items.map((i) => i.toPassageId), ok0.stage0.jobs.length, ok0.stage0.expectedMissing.length, ok0.stage0.verifiedBy.length > 0],
  leftUnlinked: ok0.stage0.jobsLeftUnlinked.map((j) => j.jobId + ":" + j.domain),
  jobOps: S.buildOps(ok0, { academyId: S0.academyId, includeJobs: true }).filter((o) => o.label.includes("job")).length,
  okEvidence: ok0.stage0.items.map((i) => i.evidence),
  unproven: [unproven0.stage0.status, unproven0.stage0.items.map((i) => i.evidence), unproven0.relinkReview.items.map((i) => [i.questionId, i.stage]), unproven0.stage0.jobs.length],
  bad: [bad0.stage0.status, bad0.stage0.items.length, bad0.stage0.reasons.length > 0],
  other: P.buildPlan(s0data(PASS_A), { academyId: "ac9", generatedAt: "t" }).stage0.status,
};

// ── SQL · 되돌리기 ──
const approvedPlan = {
  ...plan,
  relinkReview: { items: plan.relinkReview.items.map((i) => ({ ...i, approved: i.questionId === "pT" })) },
  stage2: { items: plan.stage2.items.map((i) => ({ ...i, approved: i.questionId === "s1" })) },
};
const ops = S.buildOps(approvedPlan, { academyId: "ac1", includeJobs: false });
const opsJobs = S.buildOps(approvedPlan, { academyId: "ac1", includeJobs: true });
const opsOther = S.buildOps(approvedPlan, { academyId: "ac2", includeJobs: true });
out.sql = {
  labels: ops.map((o) => o.label.split(" ").slice(0, 3).join(" ") + (o.label.endsWith("(reviewed)") ? "*" : "")),
  reviewedTarget: ops.filter((o) => o.label.endsWith("(reviewed)")).map((o) => o.params.slice(0, 2)),
  relinkGuard: ops[0].sql,
  s2Guard: ops.find((o) => o.label.includes("_sourcePassage")).sql,
  s2Params: ops.find((o) => o.label.includes("_sourcePassage")).params.slice(1),
  jobs: opsJobs.length - ops.length,
  other: opsOther.length,
  expect: [...new Set(ops.map((o) => o.expectRows))],
  undo: S.buildUndo(approvedPlan, { academyId: "ac1", includeJobs: false }).map((u) => [u.table, u.column, u.undo.sql.slice(0, 40)]),
  jsonb: [S.jsonbParam({ a: 1 }), S.jsonbParam('{"a":1}'), S.jsonbParam(null)],
};

// ── 적용 전제 · 실행기 ──
const calls = [];
const exec = (affected) => async (sql, params) => { calls.push(sql.slice(0, 20)); return affected.shift(); };
let err = null;
try { await A.executeOps(exec([1, 0, 1]), ops.slice(0, 3)); } catch (e) { err = e.constructor.name + ":" + e.affected; }
out.execFail = { err, calls: calls.length };
out.execOk = await A.executeOps(async () => 1, ops);
const ALL = [0, 1, 2];
const clone = (x) => JSON.parse(JSON.stringify(x));
const reviewed = clone(P.withApplyScope(approvedPlan, ALL));
const tampered = clone(reviewed);
tampered.stage2.items[0].content = "evil";
const oldVersion = { ...clone(reviewed), planVersion: 2 };
const retarget = clone(reviewed);
retarget.relinkReview.items.forEach((i) => { if (i.questionId === "pT") i.toPassageId = "EVIL"; });
const payloadEdit = clone(reviewed);
payloadEdit.stage2.items.forEach((i) => { if (i.questionId === "s1") i.after.structuredData = { hacked: true }; });
const noScope = clone(approvedPlan);
const v = (o) => { const r = A.validateApplyRequest({ stages: ALL, ...o }); return r.ok ? "ok" : r.reason.slice(0, 12); };
out.validate = [
  v({ apply: false, academyId: "ac1", reviewedPlan: reviewed, recomputed: plan }),
  v({ apply: true, academyId: null, reviewedPlan: reviewed, recomputed: plan }),
  v({ apply: true, academyId: "ac1", reviewedPlan: null, recomputed: plan }),
  v({ apply: true, academyId: "ac2", reviewedPlan: reviewed, recomputed: plan }),
  v({ apply: true, academyId: "ac1", reviewedPlan: tampered, recomputed: plan }),
  v({ apply: true, academyId: "ac1", reviewedPlan: reviewed, recomputed: P.buildPlan(changed, { academyId: "ac1", generatedAt: "x" }) }),
  v({ apply: true, academyId: "ac1", reviewedPlan: reviewed, recomputed: plan2 }),
  v({ apply: true, academyId: "ac1", reviewedPlan: oldVersion, recomputed: plan2 }),
  v({ apply: true, academyId: "ac1", reviewedPlan: retarget, recomputed: plan2 }),
  v({ apply: true, academyId: "ac1", reviewedPlan: noScope, recomputed: plan2 }),
  v({ apply: true, academyId: "ac1", stages: null, reviewedPlan: reviewed, recomputed: plan2 }),
];

// ── GA-1: 단계별 적용 범위 — 고객 학원에 0단계 무리 + 1단계 무리(같은 학원 · 다른 지워진 지문)가 함께 있다 ──
const S0c = P.STAGE0;
const custData = (s1Extra = "") => {
  const d = s0data(PASS_A);
  const q1 = (id) => ({ ...orderB(id), academyId: S0c.academyId });
  d.orphans.push(q1("c1"), q1("c2"));
  d.jobLinks.push(...["c1", "c2"].map((q) => ({ ...link(q, "RD2"), academyId: S0c.academyId })));
  d.livePassages.push(live("DAY2", PASS_B + s1Extra, 2, S0c.academyId));
  return d;
};
const cust = P.buildPlan(custData(), { academyId: S0c.academyId, generatedAt: "t" });
const custS1Changed = P.buildPlan(custData(" Day two was edited."), { academyId: S0c.academyId, generatedAt: "t" });
const custS0Changed = (() => { const d = custData(); d.livePassages[0] = { ...d.livePassages[0], content: PASS_A + " Changed." }; return P.buildPlan(d, { academyId: S0c.academyId, generatedAt: "t" }); })();
const review0 = clone(P.withApplyScope(cust, [0]));
const reviewAll = clone(P.withApplyScope(cust, ALL));
const va = (o) => { const r = A.validateApplyRequest({ apply: true, academyId: S0c.academyId, ...o }); return r.ok ? "ok" : r.reason.slice(0, 12); };
// 1단계 항목이 있는 계획(cust)에서 --stages 0 을 만든다 — 단계 거르기가 빠지면 1단계 문이 섞여 나온다
const ops0 = S.buildOps(A.mergeApprovals(cust, review0), { academyId: S0c.academyId, includeJobs: true, stages: [0] });
const hashScope = clone(review0);
hashScope.applyScope.hash = "0000000000000000";
out.stageScope = {
  counts: [cust.stage0.items.length, cust.stage1.items.length],
  hash0Stable: P.planHash(cust, [0]) === P.planHash(custS1Changed, [0]),
  hash0Changes: P.planHash(cust, [0]) !== P.planHash(custS0Changed, [0]),
  hashAllChanges: cust.planHash !== custS1Changed.planHash,
  applyScope: review0.applyScope.stages,
  validate: [
    va({ stages: [0], reviewedPlan: review0, recomputed: custS1Changed }),
    va({ stages: ALL, reviewedPlan: reviewAll, recomputed: custS1Changed }),
    va({ stages: [0, 1], reviewedPlan: review0, recomputed: cust }),
    va({ stages: ALL, reviewedPlan: review0, recomputed: cust }),
    va({ stages: [0], reviewedPlan: review0, recomputed: custS0Changed }),
    va({ stages: [0], reviewedPlan: hashScope, recomputed: cust }),
    va({ stages: [0], reviewedPlan: clone(P.withApplyScope(bad0, [0])), recomputed: bad0 }),
  ],
  ops0: ops0.map((o) => o.label.split(" ").slice(0, 3).join(" ")),
  ops0Targets: [...new Set(ops0.map((o) => o.params[0]))],
  opsAll: S.buildOps(cust, { academyId: S0c.academyId, includeJobs: true }).map((o) => o.label.split(" ").slice(0, 3).join(" ")),
  undo0: S.buildUndo(cust, { academyId: S0c.academyId, includeJobs: true, stages: [0] }).length,
};
// 0단계 검토 대기(근거 없는 TOPIC) — 승인 전에는 --stages 0 에도 들어가지 않는다
const unprovenApproved = { ...unproven0, relinkReview: { items: unproven0.relinkReview.items.map((i) => ({ ...i, approved: true })) } };
out.stage0Pending = [
  S.buildOps(unproven0, { academyId: S0c.academyId, includeJobs: false, stages: [0] }).length,
  S.buildOps(unprovenApproved, { academyId: S0c.academyId, includeJobs: false, stages: [0] }).length,
  S.buildOps(unprovenApproved, { academyId: S0c.academyId, includeJobs: false, stages: [1] }).length,
];
// 값까지 넣은 SQL(승인 문서용) — 한 DO 블록 · 문마다 행 수 확인 · 따옴표 이스케이프 · 넣은 값 재치환 없음
const lit = S.renderLiteralSql([
  ...ops0.slice(0, 2),
  // 뒤 번호 값 안의 「$1」 — 번호를 내려가며 여러 번 치환하면 이 글자가 다시 치환된다
  { label: "odd", sql: "UPDATE t SET a = $1, b = $2, c = $3", params: ["x", "it's $1 %", null], expectRows: 1 },
], "title");
out.literal = {
  doBlocks: (lit.match(/^DO \$orphan_backfill\$$/gm) ?? []).length,
  checks: (lit.match(/GET DIAGNOSTICS n = ROW_COUNT;/g) ?? []).length,
  first: lit.split("\n").find((l) => l.trim().startsWith("UPDATE questions")),
  odd: lit.split("\n").find((l) => l.includes("UPDATE t SET")),
  oddRaise: lit.split("\n").find((l) => l.includes("RAISE") && l.includes("odd")),
};
const merged = A.mergeApprovals(plan2, payloadEdit);
const mergedS1 = merged.stage2.items.find((i) => i.questionId === "s1");
out.merge = {
  approved: merged.stage2.items.filter((i) => i.approved).map((i) => i.questionId),
  payloadFromRecomputed: !("hacked" in mergedS1.after.structuredData),
  relinkApproved: merged.relinkReview.items.filter((i) => i.approved).map((i) => i.questionId),
  retargetedApprovalDropped: A.mergeApprovals(plan2, retarget).relinkReview.items.filter((i) => i.approved).length,
};
console.log(JSON.stringify(out));
`;

let cached = null;
function runHarness() {
  if (cached) return cached;
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".orphan-passage-backfill-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "" } });
    cached = JSON.parse(raw.trim().split("\n").pop());
    return cached;
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const P0_TOPIC = "cmucv3klh00bjl604xl64glgb"; // STAGE0.expectedQuestionIds[3]
const PASS_A = "Alpha one begins the story here beside the old river bank. Alpha two continues with more detail about the river and its many bridges. Alpha three explains why the small town grew so quickly after the war. Alpha four describes the market that opened every Sunday morning. Alpha five tells how the farmers carried grain across the hills. Alpha six notes that the school doubled in size within a decade. Alpha seven recalls the flood that nearly destroyed everything. Alpha eight ends with a lesson for careful readers.";

test("reconstruction: SENTENCE_ORDER reassembles by the correct order (digit or circled answer), bad answer → null", () => {
  const r = runHarness();
  assert.equal(r.reassemble, PASS_A);
  assert.equal(r.reassembleCircled, PASS_A);
  assert.equal(r.reassembleBadAnswer, null);
});

test("reconstruction: insert/irrelevant/blank rebuild the plain passage; display markers are stripped", () => {
  const r = runHarness();
  assert.equal(r.insert, "First sentence is long enough to count. Second one follows. Middle sentence goes here. Third one ends.");
  assert.equal(r.irrelevant, "Intro text. Keep this line. Keep that line.");
  assert.equal(r.blank, "The answer is right words in this sentence.");
  assert.equal(r.strip, "He runs fast and goes home now.");
  assert.deepEqual(r.recallVsSim, [1, 0.967, true], "recall ignores instruction words; similarity does not");
});

test("job proof: only a single-question job whose clientTempId names the deleted passage (and no job pointing elsewhere) proves a question's source", () => {
  assert.deepEqual(runHarness().jobProof, [true, false, false, false, false, false]);
});

test("partition: exact/consistent auto; no-evidence auto only when job-proven AND an exact member is job-proven (anchor); else pending review", () => {
  const { anchored, unanchored } = runHarness().partition;
  assert.deepEqual(anchored, { auto: ["e1:exact", "c1:consistent", "n1:job-1to1"], pending: ["n2"] });
  assert.deepEqual(unanchored, { auto: ["e1:exact", "c1:consistent"], pending: ["n1", "n2"] }, "without an anchor the deleted passage ≡ target is not proven");
});

test("per-question evidence: a mixed-passage job group links only questions whose own text matches; source-type questions need a homogeneous group", () => {
  const { mixed, homo } = runHarness();
  assert.equal(mixed.homogeneous, false);
  assert.deepEqual(mixed.linkable, ["a1", "a2"]);
  assert.deepEqual(mixed.byQ, { a1: "exact", a2: "exact", b1: "inconsistent", t1: "no-evidence", sw: "no-evidence" }, "a long SUMMARY_COMPLETE stem is not passage evidence");
  assert.equal(homo.homogeneous, true);
  assert.deepEqual(homo.linkable, ["a1", "e1", "t1", "sw"]);
});

test("plan stage 1: exact identity + corroboration relinks to the OLDEST identical live passage; mixed group keeps only matching members; single-source → review", () => {
  const p = runHarness().plan;
  assert.equal(p.version, 3);
  assert.equal(p.stage0, "not-in-scope");
  assert.deepEqual(p.s1groups, [
    ["R1", "L1", ["a1", "a2", "aT"], [], true, []],
    ["R3", "L1", ["m1", "m2"], [], false, ["m3:inconsistent", "mT:no-evidence"]],
    ["R7", "L1", ["p1", "p2"], ["pT", "pJ"], true, []],
  ]);
  assert.deepEqual(p.review, ["single-source-exact:R2"]);
});

test("plan stage 1 (AB-R1): no-evidence members never auto-apply on group homogeneity alone — job-proven+anchored → auto, otherwise relinkReview (not approved)", () => {
  const p = runHarness().plan;
  assert.deepEqual(p.s1evidence, ["a1:exact", "a2:exact", "aT:job-1to1", "m1:exact", "m2:exact", "p1:exact", "p2:exact"]);
  assert.deepEqual(p.relinkReview, [
    ["pT", 1, "L1", "no-evidence", false, true, false],
    ["pJ", 1, "L1", "no-evidence", true, true, false],
  ], "pJ's own job proves it, but no exact member of R7 is job-proven, so R7 ≡ L1 is not anchored");
  assert.deepEqual(p.counts, [7, 1, 2]);
  assert.deepEqual(p.s1jobs, ["jR1"], "jobs are relinked only for homogeneous single-target groups with nothing pending (R3 mixed, R7 pending)");
  assert.deepEqual(p.s1jobsSkipped, ["jR1a:PASSAGE_ANALYSIS"], "GA-2: an analysis job of the same deleted passage is reported, never relinked");
});

test("plan stage 2: own builder snapshot → _sourcePassage (review required, not approved); heterogeneous/no-source → unrecoverable; embedded & already-detached untouched", () => {
  const p = runHarness().plan;
  // bT: R2 는 재연결 안 됨(증거 1건) → 균질한 무리의 형제 재조립을 빌림. s2: 같은 무리(R4) 형제 s1 의 저장본을 빌림.
  assert.deepEqual(p.s2.map((x) => x.slice(0, 3)), [["bT", "reassembly", "b1"], ["s1", "snapshot", "s1"], ["s2", "snapshot", "s1"]]);
  for (const x of p.s2) assert.deepEqual(x.slice(4), [true, false]);
  const s1 = p.s2after[p.s2.findIndex((x) => x[0] === "s1")];
  assert.deepEqual(s1, { passageId: "R4", title: "Snap P", content: "Snapshot passage text for the s group, long enough to be a passage body.", detachedAt: "2026-09-30T00:00:00.000Z" });
  assert.deepEqual(p.unrec, ["mT:heterogeneous-group"], "a source-type question in a mixed-passage group borrows nothing");
  // 지문 내장형으로 잇지 않은 b1(R2)·m3(R3 제외)·x1(R5) 3문항은 손대지 않는다(인쇄에 별도 지문이 필요 없다).
  assert.deepEqual(p.untouched, { embeddedOrNoPassageNeeded: 3, alreadyDetached: 1 });
});

test("plan hash ignores generatedAt/approvals but changes when the data to write changes", () => {
  assert.deepEqual(runHarness().hash, { stable: true, changes: true });
});

test("stage 0 (customer): ready only when a reconstruction equals day 6 exactly; otherwise blocked with zero items; other academy scope → not-in-scope", () => {
  const s0 = runHarness().stage0;
  assert.deepEqual(s0.ok, ["ready", ["cmu72l2t90001l504hnlmakrh", "cmu72l2t90001l504hnlmakrh"], 0, 12, true]);
  assert.deepEqual(s0.leftUnlinked, ["jc:QUESTION_GENERATION", "ja:PASSAGE_ANALYSIS"], "GA-2: stage 0 relinks no job (generation or analysis) — they are only reported");
  assert.equal(s0.jobOps, 0, "--include-jobs yields no stage-0 job statement");
  assert.deepEqual(s0.okEvidence, ["exact", "job-1to1"], "the TOPIC member rides on its 1:1 fast-path job (RCA F1), anchored by the exact member's job");
  assert.deepEqual(s0.unproven, ["ready", ["exact"], [[P0_TOPIC, 0]], 0], "without job proof the TOPIC member waits for review and job records are not relinked");
  assert.deepEqual(s0.bad, ["blocked", 0, true]);
  assert.equal(s0.other, "not-in-scope");
});

test("SQL: every write re-checks plan-time state; relink-review & stage 2 only approved; jobs only with --include-jobs; academy scope enforced; undo mirrors", () => {
  const s = runHarness().sql;
  assert.deepEqual(s.labels, [...Array(7).fill("stage1 relink question"), "stage1 relink question*", "stage2 _sourcePassage s1"]);
  assert.deepEqual(s.reviewedTarget, [["L1", "pT"]], "only the approved pending relink (pT), not pJ");
  assert.match(s.relinkGuard, /"passageId" IS NULL AND "deletedAt" IS NULL AND "academyId" = \$3/);
  assert.match(s.s2Guard, /md5\(coalesce\("structuredData"::text, ''\)\) = \$3 AND "academyId" = \$4/);
  assert.deepEqual(s.s2Params, ["s1", "m-s1", "ac1"]);
  assert.equal(s.jobs, 1);
  assert.equal(s.other, 0);
  assert.deepEqual(s.expect, [1]);
  assert.equal(s.undo.length, 9);
  assert.deepEqual(s.undo[0], ["questions", "passageId", 'UPDATE questions SET "passageId" = NULL ']);
  assert.deepEqual(s.undo[8].slice(0, 2), ["questions", "structuredData"]);
  assert.deepEqual(s.jsonb, ['{"a":1}', '"{\\"a\\":1}"', null], "JSON-string structuredData stays a jsonb string");
});

test("apply: aborts on the first unexpected row count (transaction rollback), refuses unless --apply+--academy+matching reviewed plan, takes only approvals from the file", () => {
  const r = runHarness();
  assert.deepEqual(r.execFail, { err: "ApplyMismatchError:0", calls: 2 });
  assert.deepEqual(r.execOk, { applied: 9 });
  assert.equal(r.validate[0].startsWith("dry-run"), true);
  assert.equal(r.validate[1].startsWith("--apply 는"), true);
  assert.equal(r.validate[2].startsWith("--plan"), true);
  assert.equal(r.validate[3].startsWith("검토본의 범위"), true);
  assert.equal(r.validate[4].startsWith("검토본의 쓰기"), true);
  assert.equal(r.validate[5].startsWith("검토 뒤 데이터"), true);
  assert.equal(r.validate[6], "ok", "approval flags (stage 2 and relink review) are outside the hash");
  assert.equal(r.validate[7].startsWith("계획 형식"), true, "an older plan format is refused");
  assert.equal(r.validate[8].startsWith("검토본의 쓰기"), true, "retargeting a pending relink in the reviewed file is refused");
  assert.equal(r.validate[9].startsWith("검토본에 적용 범위"), true, "a reviewed plan without applyScope (not produced by dry-run --stages) is refused");
  assert.equal(r.validate[10].startsWith("--stages"), true, "--apply without --stages is refused (no default approval unit)");
  assert.deepEqual(r.merge, { approved: ["s1"], payloadFromRecomputed: true, relinkApproved: ["pT"], retargetedApprovalDropped: 0 });
});

test("COH-13: identity normalization IS the delete guard's normalizePassageContent (single source, not a copy)", () => {
  const r = runHarness();
  assert.equal(r.singleSource.same, true, "reconstruct.normalizeForIdentity must be the same function object as passage-delete-guard.normalizePassageContent");
  assert.equal(r.singleSource.nbsp, "a b");
});

test("--stages parsing: 0 · 0,1 · all; anything else is rejected", () => {
  assert.deepEqual(runHarness().parseStages, [[0], [0, 1], [0, 1], [0, 1, 2], [0, 1, 2], null, null, null]);
});

test("GA-1: stage 0 is its own approval unit — own hash scope, applies alone even when stage-1 data changed, refuses unreviewed stages", () => {
  const g = runHarness().stageScope;
  assert.deepEqual(g.counts, [2, 2], "fixture: customer academy has a stage-0 group and a stage-1 group (like day 6 14 + day 2 8)");
  assert.equal(g.hash0Stable, true, "stage-0 hash ignores stage-1 data");
  assert.equal(g.hash0Changes, true, "stage-0 hash follows stage-0 data");
  assert.equal(g.hashAllChanges, true);
  assert.deepEqual(g.applyScope, [0]);
  const [okStage0, allDrift, widened, widenedAll, s0Drift, tamperedScope, notReady] = g.validate;
  assert.equal(okStage0, "ok", "stage 0 applies although stage 1 changed after review");
  assert.equal(allDrift.startsWith("검토 뒤 데이터"), true, "the old all-stage unit is still refused on any drift");
  assert.equal(widened.startsWith("적용 범위가"), true, "a stage-0 review cannot apply stages 0,1");
  assert.equal(widenedAll.startsWith("적용 범위가"), true, "a stage-0 review cannot apply all stages");
  assert.equal(s0Drift.startsWith("검토 뒤 데이터"), true, "stage-0 data drift is refused");
  assert.equal(tamperedScope.startsWith("검토본의 쓰기"), true, "editing applyScope.hash is refused");
  assert.equal(notReady.startsWith("0단계가 ready"), true, "stage 0 must be ready at apply time");
  assert.deepEqual(g.ops0, ["stage0 relink question", "stage0 relink question"], "--stages 0 writes only stage-0 question relinks — no stage 1, no job even with --include-jobs");
  assert.deepEqual(g.ops0Targets, ["cmu72l2t90001l504hnlmakrh"]);
  assert.deepEqual(g.opsAll, ["stage0 relink question", "stage0 relink question", "stage1 relink question", "stage1 relink question"]);
  assert.equal(g.undo0, 2);
});

test("GA-1: an unreviewed stage-0 pending relink stays out of --stages 0 until approved, and never leaks into --stages 1", () => {
  assert.deepEqual(runHarness().stage0Pending, [1, 2, 0]);
});

test("literal SQL (approval packet): one DO block, row-count check per statement, quotes escaped, values not re-substituted", () => {
  const l = runHarness().literal;
  assert.equal(l.doBlocks, 1);
  assert.equal(l.checks, 3);
  assert.match(l.first, /^\s*UPDATE questions SET "passageId" = 'cmu72l2t90001l504hnlmakrh' WHERE id = 'cmucv[a-z0-9]+' AND "passageId" IS NULL AND "deletedAt" IS NULL AND "academyId" = 'cmtrdob3m0000jm04nf2ce50c';$/);
  assert.equal(l.odd.trim(), "UPDATE t SET a = 'x', b = 'it''s $1 %', c = NULL;");
  assert.match(l.oddRaise, /RAISE EXCEPTION 'odd: % row\(s\), expected 1', n;/);
});
