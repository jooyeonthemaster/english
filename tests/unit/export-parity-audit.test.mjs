// AUDIT-BACKFILL (26-09-30) — scripts/exam-pagination/export-parity-audit 의 대조 로직 단위 테스트.
// DB·렌더러 없이: 사건 스트림 → 문항별 면(귀속 규칙), 면 비교(불일치 종류), 정답표 번호 대응, 머리 차례 매칭,
// 배지 정규식, 탐침 주입(원본 불변·판정 불변), 라우트 앵커, 웹 정본 면(공용 CORE 모듈) 을 잠근다.
// AB-R2/R3(26-09-30): 웹 정본 절대 불변 조건(지문 두 번 · 실어야 할 지문 없음)과 빈 감사 게이트도 잠근다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import * as compareMod from "../scripts/exam-pagination/export-parity/compare";
import * as probeMod from "../scripts/exam-pagination/export-parity/probe";
import * as commonMod from "../scripts/exam-pagination/export-parity/export-common";
import * as webMod from "../scripts/exam-pagination/export-parity/web-facets";
import * as policyMod from "@/components/exams/paper-builder/passage-policy";
const pick = (m) => m.default ?? m["module.exports"] ?? m;
const C = pick(compareMod);
const P = pick(probeMod);
const X = pick(commonMod);
const W = pick(webMod);
const policy = pick(policyMod);
const out = {};
const facetsOf = (stream) => Object.fromEntries([...stream.byQuestion].map(([k, v]) => [k, v]));
const noGroups = { webGroupOf: () => undefined, webExpect: () => undefined };

// ── facetsFromStream 귀속 ──
out.inlineAfterHead = facetsOf(C.facetsFromStream([
  { kind: "head", questionId: "q1", orderNum: 1, unit: 0 },
  { kind: "passage", owner: "q1", unit: 1 },
], noGroups));
out.preBeforeHead = facetsOf(C.facetsFromStream([
  { kind: "passage", owner: "q1", unit: 0 },
  { kind: "head", questionId: "q1", orderNum: 1, unit: 1 },
], noGroups));
const setGroup = new Set(["q1", "q2"]);
out.groupMemberBox = facetsOf(C.facetsFromStream([
  { kind: "passage", owner: "q2", unit: 0 },
  { kind: "head", questionId: "q1", orderNum: 1, unit: 1 },
  { kind: "head", questionId: "q2", orderNum: 2, unit: 2 },
], { webGroupOf: (q) => (setGroup.has(q) ? setGroup : undefined), webExpect: () => undefined }));
const strayStream = C.facetsFromStream([
  { kind: "head", questionId: "q1", orderNum: 1, unit: 0 },
  { kind: "passage", owner: "q9", unit: 1 },
  { kind: "head", questionId: "q2", orderNum: 2, unit: 2 },
], noGroups);
out.stray = strayStream.strays;
const amb = (expect) => facetsOf(C.facetsFromStream([
  { kind: "head", questionId: "q1", orderNum: 1, unit: 0 },
  { kind: "passage", owner: "q1", unit: 1 },
  { kind: "head", questionId: "q2", orderNum: 2, unit: 2 },
], { webGroupOf: (q) => (setGroup.has(q) ? setGroup : undefined), webExpect: (q) => expect[q] }));
out.ambInlineFirst = amb({ q1: { pre: 0, inline: 1 }, q2: { pre: 1, inline: 0 } });
out.ambPreWhenInlineFull = amb({ q1: { pre: 0, inline: 0 }, q2: { pre: 1, inline: 0 } });
out.ambDefaultInline = amb({ q1: { pre: 0, inline: 0 }, q2: { pre: 0, inline: 0 } });
out.dedupeUnit = facetsOf(C.facetsFromStream([
  { kind: "head", questionId: "q1", orderNum: 1, unit: 0 },
  { kind: "passage", owner: "q1", unit: 1 },
  { kind: "passage", owner: "q1", unit: 1 },
  { kind: "passage", owner: "q1", unit: 2 },
], noGroups));
const ans = C.facetsFromStream([
  { kind: "answerLine", unit: 0 },
  { kind: "head", questionId: "q1", orderNum: 1, unit: 1 },
  { kind: "meta", unit: 1 },
  { kind: "answerLine", unit: 2 },
  { kind: "answerLine", unit: 3 },
  { kind: "head", questionId: "q2", orderNum: 2, unit: 4 },
  { kind: "answerBox", unit: 5 },
  { kind: "answerLine", unit: 6 },
  { kind: "head", questionId: null, orderNum: 7, unit: 7 },
], noGroups);
out.answers = { facets: facetsOf(ans), orphan: ans.orphanAnswerLines, unmapped: ans.unmappedHeads };

// ── compareFacets 종류 ──
const F = (o) => ({ questionId: o.id, orderNum: 1, passage: { pre: 0, inline: 0 }, answerSpace: { present: false, lines: 0 }, metaBadge: false, answerKey: "①", ...o, questionId: o.id });
const cmp = (w, e, strays) => C.compareFacets(new Map(w.map((f) => [f.questionId, f])), new Map(e.map((f) => [f.questionId, f])), strays).map((m) => m.kind + ":" + m.questionId);
out.kinds = {
  equal: cmp([F({ id: "a" })], [F({ id: "a" })]),
  missing: cmp([F({ id: "a" })], []),
  extraQ: cmp([], [F({ id: "b" })]),
  passageExtra: cmp([F({ id: "a" })], [F({ id: "a", passage: { pre: 1, inline: 0 } })]),
  passageMissing: cmp([F({ id: "a", passage: { pre: 0, inline: 1 } })], [F({ id: "a" })]),
  placement: cmp([F({ id: "a", passage: { pre: 1, inline: 0 } })], [F({ id: "a", passage: { pre: 0, inline: 1 } })]),
  answerPresence: cmp([F({ id: "a", answerSpace: { present: true, lines: 4 } })], [F({ id: "a" })]),
  answerLines: cmp([F({ id: "a", answerSpace: { present: true, lines: 4 } })], [F({ id: "a", answerSpace: { present: true, lines: 3 } })]),
  answerLinesUncountable: cmp([F({ id: "a", answerSpace: { present: true, lines: 4 } })], [F({ id: "a", answerSpace: { present: true, lines: null } })]),
  meta: cmp([F({ id: "a" })], [F({ id: "a", metaBadge: true })]),
  keySymbol: cmp([F({ id: "a" })], [F({ id: "a", answerKey: "1" })]),
  keyWhitespace: cmp([F({ id: "a", answerKey: "(A) done " })], [F({ id: "a", answerKey: "(A)  done" })]),
  keyAbsent: cmp([F({ id: "a" })], [F({ id: "a", answerKey: null })]),
  stray: cmp([F({ id: "a" })], [F({ id: "a" })], [{ owner: "a", afterQuestion: null, beforeQuestion: null }]),
};
out.facetOfKindComplete = Object.keys(C.FACET_OF_KIND).sort();

// ── 절대 불변 조건(웹 정본) · 게이트 ──
const IF = (id, pre, inline) => F({ id, passage: { pre, inline } });
const invFacets = new Map([IF("dbl", 1, 1), IF("abs", 0, 0), IF("mem", 0, 0), IF("lead", 1, 0), IF("free", 0, 0), IF("own", 0, 1), IF("pre2", 2, 0)].map((f) => [f.questionId, f]));
const grp = new Set(["lead", "mem"]);
out.invariants = C.passageInvariantViolations({
  facets: invFacets,
  groupOf: (q) => (grp.has(q) ? grp : undefined),
  requiresPassage: new Set(["dbl", "abs", "mem", "own"]),
}).map((v) => v.kind + ":" + v.questionId);
const REP = pick(await import("../scripts/exam-pagination/export-parity/report"));
const gate = (o) => { const r = REP.gateOf({ mismatchRows: 0, errors: 0, invariants: 0, exams: 3, formats: 2, probeLost: 0, ...o }); return r.gate + ":" + r.reasons.length; };
out.gate = [gate({}), gate({ exams: 0 }), gate({ formats: 0 }), gate({ invariants: 1 }), gate({ probeLost: 2 }), gate({ mismatchRows: 1, errors: 1 })];

// ── 정답표 번호 대응 · 머리 차례 매칭 ──
out.answerKeyDup = Object.fromEntries(C.answerKeyByQuestion(
  [{ orderNum: 1, answer: "①" }, { orderNum: 1, answer: "②" }, { orderNum: 2, answer: "x" }, { orderNum: 9, answer: "y" }],
  new Map([[1, ["a", "b"]], [2, ["c"]]]),
));
const hm = X.makeHeadMatcher([{ orderNum: 1, questionId: "a" }, { orderNum: 2, questionId: "b" }, { orderNum: 3, questionId: "c" }, { orderNum: 4, questionId: "d" }]);
out.headSeq = [hm.take(1), hm.take(1), hm.take(2), hm.take(1), hm.take(4), hm.take(3)];
const hm2 = X.makeHeadMatcher([{ orderNum: 1, questionId: "a" }, { orderNum: 2, questionId: "b" }, { orderNum: 3, questionId: "c" }, { orderNum: 4, questionId: "d" }, { orderNum: 5, questionId: "e" }, { orderNum: 6, questionId: "f" }], 3);
out.headLookahead = [hm2.take(1), hm2.take(6), hm2.take(5)];
out.badge = ["[3점]", "[1점 · 어법]", "[2.5 점]", "문장 [3점]", "[3점] 추가", "[점]"].map((s) => X.META_BADGE_RE.test(s.trim()));
out.glue = X.assertRouteGlue("r.ts", "const a =\n   f({ x,\n y });\nconst b = 2;", ["const a = f({ x, y });", "const c = 3;"], "f");

// ── 탐침 ──
out.tokens = [P.sentinelToken(0), P.sentinelToken(1), P.sentinelToken(26), P.sentinelToken(26 ** 4 - 1)];
out.tokenRange = (() => { try { P.sentinelToken(26 ** 4); return "no-throw"; } catch { return "throws"; } })();
out.append = [P.appendSentinel("Body text.\n\n", "qzxvaaab"), P.appendSentinel("", "qzxvaaab"), P.appendSentinel("   \n", "qzxvaaab"), P.appendSentinel(null, "qzxvaaab")];
out.find = P.findSentinels("a qzxvaaab b qzxvzzzz qzxvAAAA qzxvab");
out.strip = P.stripSentinels("Body qzxvaaab end");
const eqs = [
  { orderNum: 1, points: 2, question: { id: "Q1", structuredData: { _sourcePassage: { content: "Kept text", title: "t" } }, passage: { content: "DB passage" } } },
  { orderNum: 2, points: 2, question: { id: "Q2", structuredData: JSON.stringify({ _sourcePassage: { content: "Detached" } }), passage: null } },
  { orderNum: 3, points: 2, question: { id: "Q3", structuredData: null, passage: { content: "  " } } },
];
const settings = JSON.stringify({ source: "exam-paper-builder-v2", items: [{ questionId: "Q1", passageContent: "Snap" }, { questionId: "Q3", passageContent: "" }], blocks: [{ blockType: "question", questionId: "Q1", passageContent: "Snap" }, { blockType: "text", blockText: "hi" }] });
const frozen = JSON.stringify(eqs);
const inj = P.injectPassageSentinels(eqs, settings);
const s2 = JSON.parse(inj.settingsRaw);
out.inject = {
  tokens: Object.fromEntries(inj.tokenByQuestion),
  q1db: inj.examQuestions[0].question.passage.content,
  q1detached: inj.examQuestions[0].question.structuredData._sourcePassage.content,
  q2detached: JSON.parse(inj.examQuestions[1].question.structuredData)._sourcePassage.content,
  q3db: inj.examQuestions[2].question.passage.content,
  itemSnap: s2.items[0].passageContent,
  emptySnap: s2.items[1].passageContent,
  blockSnap: s2.blocks[0].passageContent,
  textBlock: s2.blocks[1],
  injected: inj.injected,
  originalUntouched: JSON.stringify(eqs) === frozen,
};
// 판정 불변: 지문 끝 토큰이 passage-policy 판정을 바꾸지 않는다.
const SUBS = ["TOPIC", "TITLE", "CONTENT_MATCH", "BLANK_INFERENCE", "SENTENCE_INSERT", "WORD_ORDER", "SUMMARY_COMPLETE", "SUMMARY_WRITING", "CONDITIONAL_WRITING", "GRAMMAR_ERROR", "SYNONYM"];
const QT = ["다음 글의 주제로 가장 적절한 것은?", "__underlined__ text ".repeat(20) + "① ② ③"];
const PASS = ["A passage about memory.", "   ", ""];
const diffs = [];
for (const subType of SUBS) for (const questionText of QT) for (const content of PASS) {
  const q = { subType, questionText, structuredData: null, passage: { content } };
  const q2 = { ...q, passage: { content: P.appendSentinel(content, "qzxvaaaa") } };
  for (const fn of ["shouldForceSourcePassage", "questionHasEmbeddedPassage", "shouldIncludeSourcePassageByDefault", "isSourcePassageForcedForPrint"]) {
    if (policy[fn](q) !== policy[fn](q2)) diffs.push(fn + ":" + subType + ":" + JSON.stringify(content));
  }
  const r1 = policy.resolvePrintablePassage({ savedPassageContent: content, savedPassageTitle: "", question: { ...q, passage: { title: "", content: "DB" } } });
  const r2 = policy.resolvePrintablePassage({ savedPassageContent: P.appendSentinel(content, "qzxvaaaa"), savedPassageTitle: "", question: { ...q, passage: { title: "", content: "DB" } } });
  if (r1.origin !== r2.origin) diffs.push("resolvePrintablePassage:" + subType + ":" + JSON.stringify(content));
}
out.policyInvariant = diffs;

// ── 웹 정본 면(공용 CORE 모듈) ──
const FIVE = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "choice " + n })));
const mkEq = (id, subType, o = {}) => ({
  orderNum: o.orderNum ?? 1, points: 2,
  question: { id, type: o.type ?? "MULTIPLE_CHOICE", subType, questionText: o.qt ?? "다음 글의 제목으로 가장 적절한 것은?", structuredData: o.sd ?? {}, options: o.options === undefined ? FIVE : o.options, correctAnswer: o.answer ?? "2", difficulty: "", points: 2, setId: o.setId ?? null, passage: o.passage === undefined ? { id: "p-" + id, title: "T", content: "A shared passage about how memory works in the brain and why recall differs." } : o.passage, explanation: null },
});
const webEqs = [
  mkEq("t1", "TITLE", { orderNum: 1 }),
  mkEq("w1", "WORD_ORDER", { orderNum: 2, options: null, qt: "다음 글을 참고하여 주어진 단어를 배열하시오.\n\n[배열 단어] memory / is / an / archive" }),
  mkEq("s1", "BLANK_INFERENCE", { orderNum: 3, setId: "SET1", qt: "빈칸 ________ 에 들어갈 말은?" }),
  mkEq("s2", "BLANK_INFERENCE", { orderNum: 4, setId: "SET1", qt: "빈칸 ________ 에 들어갈 말은?" }),
];
const webSettings = JSON.stringify({ source: "exam-paper-builder-v2", layout: { showQuestionMeta: true, showAnswerSpace: true }, items: [
  { questionId: "t1", orderNum: 1, includePassage: true },
  { questionId: "w1", orderNum: 2, includePassage: false },
  { questionId: "s1", orderNum: 3, groupId: "set:SET1" },
  { questionId: "s2", orderNum: 4, groupId: "set:SET1" },
] });
const wp = P.injectPassageSentinels(webEqs, webSettings);
const wm = W.buildWebModel(wp.examQuestions, wp.settingsRaw, wp.ownerByToken);
out.web = { facets: Object.fromEntries(wm.facets), groupOfS2: [...(wm.groupOf.get("s2") ?? [])].sort(), probeLost: wm.probeLost };
out.webRequires = [...wm.requiresPassage].sort();
out.webInvariants = wm.invariants;
// 비세트 지문 묶음 선두가 TITLE(문항 안 지문)이고 뒤 문항(VOCAB_CHOICE)이 그룹 박스를 켜는 모양 — 운영 cmppijdnd 41번.
// CORE 가 한 번만 찍으면(own ≤ 1) 위반 없음, 두 번 찍으면 반드시 invariant.passage.multiple 이 떠야 한다.
const SHARED = { id: "PX", title: "T", content: "Shared passage for a title and a vocabulary question about how memory works and why recall differs." };
const dblEqs = [
  mkEq("dt", "TITLE", { orderNum: 1, qt: "윗글의 제목으로 가장 적절한 것은?", passage: { ...SHARED } }),
  mkEq("dv", "VOCAB_CHOICE", { orderNum: 2, qt: "밑줄 친 낱말 중 문맥상 쓰임이 적절하지 않은 것은?", passage: { ...SHARED } }),
];
const dblSettings = JSON.stringify({ source: "exam-paper-builder-v2", items: [
  { questionId: "dt", orderNum: 1, groupId: "passage:PX", includePassage: true },
  { questionId: "dv", orderNum: 2, groupId: "passage:PX", includePassage: true },
] });
const dp = P.injectPassageSentinels(dblEqs, dblSettings);
const dm = W.buildWebModel(dp.examQuestions, dp.settingsRaw, dp.ownerByToken);
const dtF = dm.facets.get("dt").passage;
out.dbl = { own: dtF.pre + dtF.inline, flagged: dm.invariants.some((v) => v.kind === "invariant.passage.multiple" && v.questionId === "dt"), requires: [...dm.requiresPassage].sort() };
const nullModel = W.buildWebModel(wp.examQuestions, null, wp.ownerByToken);
out.webNull = Object.fromEntries([...nullModel.facets].map(([k, v]) => [k, { meta: v.metaBadge, lines: v.answerSpace.lines, pre: v.passage.pre, inline: v.passage.inline }]));

// ── 형식별 인식기(답란 한 줄)와 라우트 계약 앵커 ──
const H = pick(await import("../scripts/exam-pagination/export-parity/hwpx-adapter"));
const D = pick(await import("../scripts/exam-pagination/export-parity/docx-adapter"));
const docx = pick(await import("docx"));
const borders = pick(await import("@/app/api/exams/[examId]/export-docx/_lib/borders"));
const NO = { type: "NONE", widthMm: 0.1, color: "#000000" };
const LINE = { type: "SOLID", widthMm: 0.12, color: "#999999" };
const cell = (runs) => ({ widthHpu: 100, heightHpu: 720, blocks: [{ kind: "p", runs }] });
out.hwpxLine = [
  H.isHwpxAnswerLineTable({ kind: "tbl", colWidthsHpu: [100], borders: { left: NO, right: NO, top: NO, bottom: LINE }, rows: [{ heightHpu: 720, cells: [cell([])] }] }),
  H.isHwpxAnswerLineTable({ kind: "tbl", colWidthsHpu: [100], borders: { left: NO, right: NO, top: LINE, bottom: NO }, rows: [{ heightHpu: 220, cells: [cell([])] }] }),
  H.isHwpxAnswerLineTable({ kind: "tbl", colWidthsHpu: [100], borders: { left: NO, right: NO, top: NO, bottom: LINE }, rows: [{ heightHpu: 720, cells: [cell([{ kind: "text", text: "정답" }])] }] }),
  H.isHwpxAnswerLineTable({ kind: "tbl", colWidthsHpu: [50, 50], borders: { bottom: LINE }, rows: [{ heightHpu: 720, cells: [cell([]), cell([])] }] }),
  H.isHwpxAnswerLineTable({ kind: "tbl", colWidthsHpu: [100], borders: { left: LINE, right: LINE, top: LINE, bottom: LINE }, rows: [{ heightHpu: 720, cells: [cell([])] }] }),
];
const para = (color, text) => new docx.Paragraph({ border: { bottom: borders.bdr(docx.BorderStyle.SINGLE, 4, color), top: borders.NONE, left: borders.NONE, right: borders.NONE }, children: [new docx.TextRun({ text })] });
out.docxLine = [D.isDocxBuilderAnswerLine(para("999999", " ")), D.isDocxBuilderAnswerLine(borders.hrule()), D.isDocxBuilderAnswerLine(para("999999", "정답")), D.isDocxBuilderAnswerLine(new docx.Paragraph({ children: [new docx.TextRun(" ")] }))];
out.routeGlue = [H.checkHwpxGlue(process.cwd()), D.checkDocxGlue(process.cwd())].map((g) => ({ entry: g.entry, ok: g.ok, missing: g.missing }));
const SIM = pick(await import("../scripts/exam-pagination/export-parity/simulate-plan"));
const simExam = { id: "e", title: "t", academyId: "a", settings: null, printCount: 0, questions: [
  { orderNum: 1, points: 1, question: { id: "orphan", passage: null, structuredData: { k: 1 } } },
  { orderNum: 2, points: 1, question: { id: "linked", passage: { id: "keep", title: "K", content: "keep me" }, structuredData: null } },
  { orderNum: 3, points: 1, question: { id: "detach", passage: null, structuredData: { k: 2 } } },
] };
const sim = { relinkTo: new Map([["orphan", { id: "P", title: "T", content: "C" }], ["linked", { id: "X", title: "X", content: "X" }]]), structuredDataOf: new Map([["detach", { k: 2, _sourcePassage: { content: "S" } }]]), counts: { relinks: 2, sourcePassages: 1 } };
const simmed = SIM.applyPlanSimulation(simExam, sim);
out.sim = { q: simmed.questions.map((eq) => [eq.question.id, eq.question.passage?.id ?? null, eq.question.structuredData]), untouched: simExam.questions[0].question.passage === null };
// GA-1: 계획 파일의 적용 범위(applyScope)만 입힌다 — 0단계 전용 계획은 0단계(+ 승인된 stage 0 검토 대기)만
const planLike = {
  stage0: { status: "ready", items: [{ questionId: "a", toPassageId: "D6" }] },
  stage1: { items: [{ questionId: "b", toPassageId: "D2" }] },
  relinkReview: { items: [{ questionId: "c", toPassageId: "D6", stage: 0, approved: true }, { questionId: "d", toPassageId: "D2", stage: 1, approved: true }, { questionId: "e", toPassageId: "D6", stage: 0, approved: false }] },
  stage2: { items: [{ questionId: "f", approved: true, after: { structuredData: {} } }, { questionId: "g", approved: false, after: { structuredData: {} } }] },
};
const pick2 = (r) => [r.relinks.map((x) => x.questionId).sort().join(""), r.stage2.map((x) => x.questionId).join("")];
out.selectWrites = {
  noScope: pick2(SIM.selectPlanWrites(planLike, {})),
  s0: pick2(SIM.selectPlanWrites({ ...planLike, applyScope: { stages: [0] } }, {})),
  s1: pick2(SIM.selectPlanWrites({ ...planLike, applyScope: { stages: [1] } }, {})),
  s2: pick2(SIM.selectPlanWrites({ ...planLike, applyScope: { stages: [2] } }, {})),
  s0Unapproved: pick2(SIM.selectPlanWrites({ ...planLike, applyScope: { stages: [0] } }, { includeUnapproved: true })),
  s0Blocked: pick2(SIM.selectPlanWrites({ ...planLike, stage0: { ...planLike.stage0, status: "blocked" }, applyScope: { stages: [0] } }, {})),
};
console.log(JSON.stringify(out));
`;

let cached = null;
function runHarness() {
  if (cached) return cached;
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".export-parity-audit-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
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

test("passage attribution: after head = inline, before head = pre (owner or web-group member), else stray", () => {
  const r = runHarness();
  assert.deepEqual(r.inlineAfterHead.q1.passage, { pre: 0, inline: 1 });
  assert.deepEqual(r.preBeforeHead.q1.passage, { pre: 1, inline: 0 });
  assert.deepEqual(r.groupMemberBox.q1.passage, { pre: 1, inline: 0 }, "merged set box carrying another member's probe belongs to the group leader");
  assert.deepEqual(r.groupMemberBox.q2.passage, { pre: 0, inline: 0 });
  assert.deepEqual(r.stray, [{ owner: "q9", afterQuestion: "q1", beforeQuestion: "q2" }]);
});

test("passage attribution: ambiguous box between two members fills web expectation (inline first), else owner inline", () => {
  const r = runHarness();
  assert.deepEqual([r.ambInlineFirst.q1.passage, r.ambInlineFirst.q2.passage], [{ pre: 0, inline: 1 }, { pre: 0, inline: 0 }]);
  assert.deepEqual([r.ambPreWhenInlineFull.q1.passage, r.ambPreWhenInlineFull.q2.passage], [{ pre: 0, inline: 0 }, { pre: 1, inline: 0 }]);
  assert.deepEqual([r.ambDefaultInline.q1.passage, r.ambDefaultInline.q2.passage], [{ pre: 0, inline: 1 }, { pre: 0, inline: 0 }]);
});

test("same owner twice in one paragraph counts once; separate paragraphs count separately", () => {
  assert.deepEqual(runHarness().dedupeUnit.q1.passage, { pre: 0, inline: 2 });
});

test("answer lines/meta attach to the previous head; legacy box = uncountable; pre-first-head lines are orphans", () => {
  const { facets, orphan, unmapped } = runHarness().answers;
  assert.deepEqual(facets.q1.answerSpace, { present: true, lines: 2 });
  assert.equal(facets.q1.metaBadge, true);
  assert.deepEqual(facets.q2.answerSpace, { present: true, lines: null });
  assert.equal(facets.q2.metaBadge, false);
  assert.equal(orphan, 1);
  assert.deepEqual(unmapped, [7]);
});

test("compareFacets: every mismatch kind fires, equal facets and uncountable line counts do not", () => {
  const k = runHarness().kinds;
  assert.deepEqual(k.equal, []);
  assert.deepEqual(k.missing, ["question.missing:a"]);
  assert.deepEqual(k.extraQ, ["question.extra:b"]);
  assert.deepEqual(k.passageExtra, ["passage.extra:a"]);
  assert.deepEqual(k.passageMissing, ["passage.missing:a"]);
  assert.deepEqual(k.placement, ["passage.placement:a"]);
  assert.deepEqual(k.answerPresence, ["answerSpace.presence:a"]);
  assert.deepEqual(k.answerLines, ["answerSpace.lines:a"]);
  assert.deepEqual(k.answerLinesUncountable, []);
  assert.deepEqual(k.meta, ["meta:a"]);
  assert.deepEqual(k.keySymbol, ["answerKey.symbol:a"]);
  assert.deepEqual(k.keyWhitespace, []);
  assert.deepEqual(k.keyAbsent, ["answerKey.absent:a"]);
  assert.deepEqual(k.stray, ["passage.stray:a"]);
  assert.deepEqual(runHarness().facetOfKindComplete, [
    "answerKey.absent", "answerKey.symbol", "answerSpace.lines", "answerSpace.presence", "meta",
    "passage.extra", "passage.missing", "passage.placement", "passage.stray", "question.extra", "question.missing",
  ]);
});

test("absolute invariants (AB-R2): own passage printed ≥2 → multiple; required passage with no own box and no group box → absent; group box covers members", () => {
  assert.deepEqual(runHarness().invariants, [
    "invariant.passage.multiple:dbl",
    "invariant.passage.absent:abs",
    "invariant.passage.multiple:pre2",
  ]);
});

test("gate (AB-R3): PASS only when something was audited and nothing is red — 0 exams / 0 formats / invariants / probe loss all FAIL", () => {
  assert.deepEqual(runHarness().gate, ["PASS:0", "FAIL:1", "FAIL:1", "FAIL:1", "FAIL:1", "FAIL:2"]);
});

test("web invariants use the shared policy: forced TITLE requires its passage, toggled-off WORD_ORDER and embedded-flow set members do not; a double-printing group leader is flagged", () => {
  const r = runHarness();
  assert.deepEqual(r.webRequires, ["t1"]);
  assert.deepEqual(r.webInvariants, []);
  assert.deepEqual(r.dbl.requires, ["dt"]);
  assert.equal(r.dbl.flagged, r.dbl.own > 1, `own=${r.dbl.own}: a leader printing the passage twice must be flagged, once must not`);
});

test("answer-key numbers map to questions in order (duplicate numbers consumed sequentially, unknown dropped)", () => {
  assert.deepEqual(runHarness().answerKeyDup, { a: "①", b: "②", c: "x" });
});

test("head matcher accepts only the next question number (bold '1.' list lines inside a question are not heads)", () => {
  const r = runHarness();
  assert.deepEqual(r.headSeq, ["a", null, "b", null, "d", null]);
  assert.deepEqual(r.headLookahead, ["a", null, "e"], "lookahead 3 skips at most 3 missing questions");
});

test("meta badge regex matches whole-run badges only; route anchors ignore whitespace", () => {
  const r = runHarness();
  assert.deepEqual(r.badge, [true, true, true, false, false, false]);
  assert.equal(r.glue.ok, false);
  assert.deepEqual(r.glue.missing, ["const c = 3;"]);
});

test("probe tokens: 4-letter base26, bounded, appended before trailing whitespace, never on empty text", () => {
  const r = runHarness();
  assert.deepEqual(r.tokens, ["qzxvaaaa", "qzxvaaab", "qzxvaaba", "qzxvzzzz"]);
  assert.equal(r.tokenRange, "throws");
  assert.deepEqual(r.append, ["Body text. qzxvaaab\n\n", "", "   \n", null]);
  assert.deepEqual(r.find, ["qzxvaaab", "qzxvzzzz"]);
  assert.equal(r.strip, "Body end");
});

test("probe injection: DB passage, builder snapshots (items+blocks, same token), detached _sourcePassage (object/JSON); empty untouched; input not mutated", () => {
  const i = runHarness().inject;
  assert.deepEqual(i.tokens, { Q1: "qzxvaaaa", Q2: "qzxvaaab", Q3: "qzxvaaac" });
  assert.equal(i.q1db, "DB passage qzxvaaaa");
  assert.equal(i.q1detached, "Kept text qzxvaaaa");
  assert.equal(i.q2detached, "Detached qzxvaaab");
  assert.equal(i.q3db, "  ");
  assert.equal(i.itemSnap, "Snap qzxvaaaa");
  assert.equal(i.blockSnap, "Snap qzxvaaaa");
  assert.equal(i.emptySnap, "");
  assert.deepEqual(i.textBlock, { blockType: "text", blockText: "hi" });
  assert.deepEqual(i.injected, { db: 1, snapshot: 2, detached: 2 });
  assert.equal(i.originalUntouched, true);
});

test("probe invariance: a trailing token never changes passage-policy decisions (force/embedded/default/print-force/§2.5 origin)", () => {
  assert.deepEqual(runHarness().policyInvariant, []);
});

test("answer-line recognizers: HWPX bottom-only empty 1x1 table (not divider/text/2-col/full box); DOCX 999999 bottom-border blank paragraph (not hrule/text/plain)", () => {
  const r = runHarness();
  assert.deepEqual(r.hwpxLine, [true, false, false, false, false]);
  assert.deepEqual(r.docxLine, [true, false, false, false]);
});

test("route contract tripwire: both export routes still build through the entry points the audit calls", () => {
  // 실패하면 라우트 조립이 바뀐 것 — export-parity/{hwpx,docx}-adapter 의 진입점·앵커를 새 조립에 맞춰야
  // 감사가 다시 라우트를 대변한다(감사 CLI 도 같은 검사로 종료코드 2).
  assert.deepEqual(runHarness().routeGlue, [
    { entry: "buildExamHwpxDocument", ok: true, missing: [] },
    { entry: "buildExamDocxDocument", ok: true, missing: [] },
  ]);
});

test("plan simulation (in memory): relinks only passage-less questions, swaps structuredData for stage-2 items, never mutates the loaded exam", () => {
  const r = runHarness().sim;
  assert.deepEqual(r.q, [
    ["orphan", "P", { k: 1 }],
    ["linked", "keep", null],
    ["detach", null, { k: 2, _sourcePassage: { content: "S" } }],
  ]);
  assert.equal(r.untouched, true);
});

test("web facets come from the shared CORE model (groups, inline passage, answer lines, meta, circled answer key)", () => {
  const r = runHarness();
  const f = r.web.facets;
  assert.deepEqual(f.t1.passage, { pre: 0, inline: 1 }, "TITLE solo prints its passage inside the question");
  assert.deepEqual(f.w1.passage, { pre: 0, inline: 0 }, "WORD_ORDER saved includePassage=false is respected (§2.4)");
  assert.deepEqual([f.s1.passage.pre, f.s2.passage.pre], [1, 0], "set group box once, on the leader");
  assert.deepEqual(r.web.groupOfS2, ["s1", "s2"]);
  assert.deepEqual(f.w1.answerSpace, { present: true, lines: 4 });
  assert.deepEqual(f.t1.answerSpace, { present: false, lines: 0 });
  assert.equal(f.t1.metaBadge, true);
  assert.equal(f.t1.answerKey, "②");
  assert.deepEqual(r.web.probeLost, []);
  assert.equal(r.webNull.t1.meta, false, "settings NULL → meta badge off (resolvePaperLayout)");
  assert.equal(r.webNull.w1.lines, 4, "settings NULL subjective → 4 answer lines");
});

test("simulate-plan honors the plan's applyScope (GA-1): a stage-0 plan simulates only stage-0 relinks (+ approved stage-0 review items)", () => {
  assert.deepEqual(runHarness().selectWrites, {
    noScope: ["abcd", "f"],
    s0: ["ac", ""],
    s1: ["bd", ""],
    s2: ["", "f"],
    s0Unapproved: ["ace", ""],
    s0Blocked: ["", ""],
  });
});
