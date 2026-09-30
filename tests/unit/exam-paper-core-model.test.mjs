// CORE-MODEL (26-09-30) — 「무엇을 찍을지」 공용 정본 픽스처 테스트.
// docs/EXAM-PAPER-MODEL.md §2(includePassage = 강제 ? true : 저장값 boolean ? 저장값 : 기본값) ·
// 같은 문서 §3(지문 = 비어 있지 않은 스냅숏 → DB 지문 → structuredData._sourcePassage) 를
// NULL / builder-v2(blocks) / builder-v1(items) / similar-v1 × 영어·국어·기출 세트 ×
// 내장·출처·강제 유형 × 저장값 true/false/없음 × 스냅숏 ''/텍스트/없음 × DB 지문 있음/없음 ×
// 보관본(_sourcePassage) 으로 교차 검증한다. 기대값은 구현을 부르지 않는 독립 오라클이 계산한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import * as savedMod from "@/components/exams/paper-builder/saved-paper-items";
import * as policyMod from "@/components/exams/paper-builder/passage-policy";
import * as groupsMod from "@/components/exams/paper-builder/paper-item-groups";
import * as layoutMod from "@/components/exams/paper-builder/paper-layout-defaults";
import * as entriesMod from "@/components/exams/paper-builder/answer-key-entries";
import * as exportMod from "@/components/exams/paper-builder/paper-export-items";
import * as reopenMod from "@/components/exams/exam-paper-builder-existing";
import * as utilsMod from "@/components/exams/paper-builder/paper-item-utils";
import * as bodyMod from "@/components/exams/paper-builder/question-body-layout";
import * as constantsMod from "@/components/exams/paper-builder/constants";

const pick = (m) => m.default ?? m["module.exports"] ?? m;
const saved = pick(savedMod);
const policy = pick(policyMod);
const groupsApi = pick(groupsMod);
const layoutApi = pick(layoutMod);
const entriesApi = pick(entriesMod);
const exportApi = pick(exportMod);
const reopenApi = pick(reopenMod);
const utils = pick(utilsMod);
const body = pick(bodyMod);
const constants = pick(constantsMod);

const SNAP = "Snapshot passage text about memory and recall in the brain archive.";
const DBP = "Database passage text describing recognition and recall as two methods.";
const SPX = "Detached passage text preserved when the original passage was deleted.";
const FIVE = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "choice " + n })));

// subType → [questionText, options, structuredData]
const FIXTURES = {
  WORD_ORDER: ["다음 글을 참고하여 주어진 단어를 바르게 배열하시오.\n\n[배열 단어] memory / is / an / archive", null, {}],
  TITLE: ["다음 글의 제목으로 가장 적절한 것은?", FIVE, {}],
  BLANK_INFERENCE: [
    "다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\nThe brain stores data in a vast ________ that we access in two ways, recall and recognition, and each one works differently for learners.",
    FIVE,
    { passageWithBlank: "The brain stores data in a vast ________ archive." },
  ],
  SUMMARY_COMPLETE: ["다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸에 알맞은 말을 쓰시오.\n\n[요약문] Memory relies on (A) ______ and (B) ______.", null, {}],
  CONDITIONAL_WRITING: ["[영작할 우리말] 기억은 두 가지 방법에 의존한다.\n\n[조건] 1. 주어진 단어를 활용할 것", null, {}],
};

function makeQuestion(id, subType, o = {}) {
  const [questionText, options, sd] = FIXTURES[subType] ?? [o.questionText ?? "문항", o.options ?? FIVE, {}];
  let structuredData = { ...(sd ?? {}), ...(o.structuredData ?? {}) };
  if (o.sourcePassage) structuredData._sourcePassage = o.sourcePassage;
  if (o.structuredAsString) structuredData = JSON.stringify(structuredData);
  return {
    id,
    type: options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
    subType,
    questionText: o.questionText ?? questionText,
    structuredData,
    options: o.options !== undefined ? o.options : options,
    correctAnswer: o.correctAnswer ?? "3",
    points: 2,
    difficulty: "MEDIUM",
    tags: null,
    aiGenerated: true,
    approved: true,
    starred: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    setId: o.setId ?? null,
    passage: o.db === null ? null : { id: "p-" + id, title: "DB title", content: o.db ?? DBP, grade: null, semester: null, publisher: null, school: null },
    explanation: { id: "x-" + id, content: "해설", keyPoints: null, wrongOptionExplanations: null },
    collectionItems: [],
    _count: { examLinks: 1 },
  };
}
const eqOf = (question, orderNum) => ({ id: "eq-" + question.id, orderNum, points: 3, question });

function savedEntry(question, overrides) {
  const out = { localId: "L-" + question.id, blockType: "question", questionId: question.id, orderNum: 1, points: 3, groupId: "single:L-" + question.id };
  for (const [k, v] of Object.entries(overrides)) if (v !== "__omit__") out[k] = v;
  return out;
}

function hasInlinePassage(item) {
  try {
    return body.structuredSegments(item).some((s) => s.kind === "box" && s.boxStyle === "passage");
  } catch {
    return false;
  }
}

function printedPassage(items) {
  // 문항별: 그룹 선두 지문 박스(별도) 또는 문항 안 지문 박스(인라인)가 찍히는가.
  const groups = groupsApi.buildGroups(items);
  const out = {};
  for (const g of groups) {
    const qs = g.items.filter((i) => i.blockType === "question");
    qs.forEach((it, idx) => {
      out[it.questionId] = {
        sep: idx === 0 && g.includePassage && Boolean(g.passageContent.trim()),
        inline: hasInlinePassage(it),
        groupPassage: g.passageContent,
        setPrompt: g.setPrompt,
      };
    });
  }
  return out;
}

const results = { matrix: [], sets: {}, misc: {} };

// ── 1) 저장본 매트릭스: 유형 × 저장값 × 스냅숏 × DB × 보관본 × 저장 형식 ─────────────
const SUBTYPES = Object.keys(FIXTURES);
const SAVED = [true, false, "__omit__"];
const SNAPS = ["__omit__", "", "   ", SNAP];
const DBS = [DBP, null];
const SPS = [null, { passageId: "p-deleted", title: "보관 제목", content: SPX, detachedAt: "2026-09-29T00:00:00.000Z" }];
const FORMATS = ["v2-blocks", "v1-items"];
let n = 0;
for (const subType of SUBTYPES) for (const S of SAVED) for (const snap of SNAPS) for (const db of DBS) for (const sp of SPS) for (const format of FORMATS) {
  n += 1;
  const q = makeQuestion("q" + n, subType, { db, sourcePassage: sp ?? undefined, structuredAsString: n % 2 === 0 });
  const entry = savedEntry(q, { includePassage: S, passageContent: snap, passageTitle: snap === "__omit__" ? "__omit__" : "" });
  const settings = format === "v2-blocks"
    ? { source: "exam-paper-builder-v2", blocks: [entry], items: [entry] }
    : { source: "exam-paper-builder-v1", items: [entry] };
  const items = saved.buildPaperItemsFromExam([eqOf(q, 1)], settings);
  const item = items[0];
  const withOrigins = saved.buildPaperItemsWithPassageOrigins([eqOf(q, 1)], settings);
  const pp = printedPassage(items)[q.id];
  results.matrix.push({
    subType, S, snap, db: db === null ? "none" : "db", sp: Boolean(sp), format,
    include: item.includePassage,
    passageContent: item.passageContent,
    passageTitle: item.passageTitle,
    passageId: item.sourceQuestion.passage?.id ?? null,
    origin: withOrigins.passageOrigins.get(item.localId),
    missing: saved.isPaperItemSourcePassageMissing(item),
    printed: pp.sep || pp.inline,
  });
}

// ── 2) settings NULL · similar-v1 (저장값 없음 → makePaperItem 기본값 + 강제) ────────────
{
  const qs = SUBTYPES.map((s, i) => makeQuestion("n" + i, s));
  const nullItems = saved.buildPaperItemsFromExam(qs.map((q, i) => eqOf(q, i + 1)), null);
  const similar = {
    source: "exam-paper-builder-v1",
    items: qs.map((q, i) => ({ questionId: q.id, orderNum: i + 1, points: 2, groupId: null, sectionTitle: "", teacherNote: "", breakBefore: "auto", keepWithPrev: false })),
    similarExam: { mode: "PATTERN_PROFILE_DRIVEN" },
  };
  const simItems = saved.buildPaperItemsFromExam(qs.map((q, i) => eqOf(q, i + 1)), similar);
  results.misc.nullPath = nullItems.map((it) => ({ subType: it.sourceQuestion.subType, include: it.includePassage, lines: it.answerSpaceLines, points: it.points, content: it.passageContent }));
  results.misc.similar = simItems.map((it) => ({ subType: it.sourceQuestion.subType, include: it.includePassage, group: it.groupId?.startsWith("single:") ?? false }));
  // NULL 시험지의 보관본 지문 복구
  const orphan = makeQuestion("orph", "TITLE", { db: null, sourcePassage: { passageId: "p-x", title: "Old", content: SPX } });
  const orphanItem = saved.buildPaperItemsFromExam([eqOf(orphan, 1)], null)[0];
  results.misc.nullDetached = { content: orphanItem.passageContent, title: orphanItem.passageTitle, include: orphanItem.includePassage, missing: saved.isPaperItemSourcePassageMissing(orphanItem) };
  const bare = makeQuestion("bare", "TITLE", { db: null });
  results.misc.nullMissing = saved.isPaperItemSourcePassageMissing(saved.buildPaperItemsFromExam([eqOf(bare, 1)], null)[0]);
  const bareEmbedded = makeQuestion("bareE", "BLANK_INFERENCE", { db: null });
  results.misc.nullEmbeddedMissing = saved.isPaperItemSourcePassageMissing(saved.buildPaperItemsFromExam([eqOf(bareEmbedded, 1)], null)[0]);
}

// ── 3) 세트 ───────────────────────────────────────────────────────────────────
{
  // 영어 세트(codex): 그룹 선두 지문 1회 + 세트 안내문 — 멤버 저장값과 무관하게 그룹 지문이 찍힌다(현행).
  const e1 = makeQuestion("en1", "BLANK_INFERENCE", { setId: "S-EN" });
  const e2 = makeQuestion("en2", "BLANK_INFERENCE", { setId: "S-EN" });
  const nullItems = saved.buildPaperItemsFromExam([eqOf(e1, 1), eqOf(e2, 2)], null);
  const g = groupsApi.buildGroups(nullItems);
  const offSettings = { source: "exam-paper-builder-v2", blocks: [e1, e2].map((q, i) => savedEntry(q, { orderNum: i + 1, groupId: "set:S-EN", includePassage: false, passageContent: DBP })) };
  const off = groupsApi.buildGroups(saved.buildPaperItemsFromExam([eqOf(e1, 1), eqOf(e2, 2)], offSettings));
  const noGroupSettings = { source: "exam-paper-builder-v1", items: [e1, e2].map((q, i) => ({ questionId: q.id, orderNum: i + 1, groupId: null })) };
  const noGroup = saved.buildPaperItemsFromExam([eqOf(e1, 1), eqOf(e2, 2)], noGroupSettings);
  results.sets.english = {
    nullGroups: g.length, nullInclude: nullItems.map((i) => i.includePassage), nullGroupId: nullItems.map((i) => i.groupId),
    nullPrompt: g[0].setPrompt, nullPassage: g[0].includePassage,
    offGroups: off.length, offPassage: off[0].includePassage, offPrompt: off[0].setPrompt,
    noGroupIds: noGroup.map((i) => i.groupId),
  };

  // 국어 세트: 멤버 includePassage=false(공유지문 1박스는 그룹이 그림), 지문 원문 개행 보존.
  const koPassage = "첫째 줄 문법 설명\n둘째 줄 이어지는 설명\n셋째 줄";
  const k1 = makeQuestion("ko1", "KO_GR_READ", { setId: "S-KO", db: koPassage, questionText: "윗글에 대한 이해로 적절한 것은?" });
  const k2 = makeQuestion("ko2", "KO_GR_READ", { setId: "S-KO", db: koPassage, questionText: "윗글을 바탕으로 할 때 적절한 것은?" });
  const koNull = saved.buildPaperItemsFromExam([eqOf(k1, 1), eqOf(k2, 2)], null);
  const koSaved = saved.buildPaperItemsFromExam([eqOf(k1, 1), eqOf(k2, 2)], {
    source: "exam-paper-builder-v2",
    blocks: [k1, k2].map((q, i) => savedEntry(q, { orderNum: i + 1, groupId: "set:S-KO", includePassage: true, passageContent: koPassage })),
  });
  const koGroups = groupsApi.buildGroups(koSaved);
  results.sets.korean = {
    nullInclude: koNull.map((i) => i.includePassage), savedInclude: koSaved.map((i) => i.includePassage),
    savedKeepsNewlines: koSaved[0].passageContent.includes("\n"),
    groups: koGroups.length, groupPassage: koGroups[0].includePassage, directive: koGroups[0].passageContent.split("\n")[0],
  };

  // 기출 장문 세트: 강제 규칙 미적용 — 저장값 boolean 존중(세트 전체 토글), 없으면 지문 있음=true.
  const gd = { _gichul: { set: { key: "2027_09-q41-42", label: "41~42", qNums: [41, 42] } } };
  const g1 = makeQuestion("gi1", "TITLE", { setId: "S-GI", structuredData: gd });
  const g2 = makeQuestion("gi2", "VOCAB_CHOICE", { setId: "S-GI", structuredData: gd, questionText: "밑줄 친 (a)~(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?" });
  const gichul = (S) => {
    const st = { source: "exam-paper-builder-v2", blocks: [g1, g2].map((q, i) => savedEntry(q, { orderNum: i + 1, groupId: "set:S-GI", includePassage: S, passageContent: DBP })) };
    const items = saved.buildPaperItemsFromExam([eqOf(g1, 1), eqOf(g2, 2)], st);
    const groups = groupsApi.buildGroups(items);
    return { include: items.map((i) => i.includePassage), groupPassage: groups[0].includePassage, groups: groups.length };
  };
  results.sets.gichul = {
    savedTrue: gichul(true), savedFalse: gichul(false), savedOmit: gichul("__omit__"),
    nullInclude: saved.buildPaperItemsFromExam([eqOf(g1, 1), eqOf(g2, 2)], null).map((i) => i.includePassage),
  };
}

// ── 4) 재오픈 = 상세(같은 입력 → 같은 PaperItem[]) ───────────────────────────────
{
  const qs = [makeQuestion("r1", "WORD_ORDER"), makeQuestion("r2", "GRAMMAR_CORRECTION", { options: null, questionText: "다음 글에서 어법상 틀린 부분을 찾아 고치시오." }), makeQuestion("r3", "SENTENCE_INSERT", { questionText: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?" })];
  const settings = { source: "exam-paper-builder-v2", blocks: [
    { localId: "t0", blockType: "text", blockText: "머리 글" },
    ...qs.map((q, i) => savedEntry(q, { orderNum: i + 1, includePassage: false, passageContent: "", answerSpaceLines: 0, options: q.options ? JSON.parse(q.options) : undefined })),
  ] };
  const exam = { questions: qs.map((q, i) => eqOf(q, i + 1)) };
  const a = reopenApi.buildPaperItemsFromExam(exam, reopenApi.parseBuilderSettings(JSON.stringify(settings)));
  const b = saved.buildPaperItemsFromExam(exam.questions, saved.parseSavedPaperSettings(JSON.stringify(settings)));
  // 비문항 블록의 합성 문항은 생성 시각(createdAt)을 찍는다 — 비교에서 뺀다.
  const stable = (items) => JSON.stringify(items.map((i) => i.blockType === "question" ? i : { ...i, sourceQuestion: { ...i.sourceQuestion, createdAt: "" } }));
  results.misc.reopenParity = stable(a) === stable(b);
  results.misc.reopenGcLines = a.find((i) => i.questionId === "r2")?.answerSpaceLines;
  results.misc.reopenEmptySnapshotRecovered = a.find((i) => i.questionId === "r1")?.passageContent;
  results.misc.blockOrder = a.map((i) => [i.blockType, i.orderNum]);
}

// ── 5) 레이아웃 기본값 · 정답표 · 내보내기 어댑터 ────────────────────────────────
{
  results.misc.layoutNull = layoutApi.resolvePaperLayout(null);
  results.misc.layoutSet = layoutApi.resolvePaperLayout({ template: "mock", layout: { columns: 1, paperSize: "B4", density: "compact", showAnswerSpace: false, showQuestionMeta: true, forceTwoPerPage: true }, header: { instructions: "", studentNameLabel: "" }, cover: { enabled: true } });
  results.misc.defaultInstructions = constants.DEFAULT_INSTRUCTIONS;
  const mc = saved.buildPaperItemsFromExam([eqOf(makeQuestion("a1", "TITLE", { correctAnswer: "3" }), 1), eqOf(makeQuestion("a2", "WORD_ORDER", { correctAnswer: "memory is an archive" }), 2), eqOf(makeQuestion("a3", "TITLE", { correctAnswer: "2, 4" }), 3)], null);
  results.misc.answers = entriesApi.answerKeyEntries([utils.makeCustomPaperBlock("text", 0), ...mc]);
  const exp = exportApi.toPaperExportItems([utils.makeCustomPaperBlock("section", 0), ...mc]);
  results.misc.exportItems = exp.map((e) => ({ questionId: e.questionId, orderNum: e.orderNum, include: e.includePassage, passage: e.sourceQuestion.passage, explanation: e.sourceQuestion.explanation, options: e.options.length, breakBefore: e.breakBefore, keys: Object.keys(e).sort() }));
}

// ── 6) 규칙 함수 직접 ─────────────────────────────────────────────────────────
results.misc.printable = [
  policy.resolvePrintablePassage({ savedPassageContent: "", question: { passage: { title: "T", content: DBP } } }),
  policy.resolvePrintablePassage({ savedPassageContent: SNAP, savedPassageTitle: "", question: { passage: { title: "T", content: DBP } } }),
  policy.resolvePrintablePassage({ savedPassageContent: "", question: { passage: null, structuredData: JSON.stringify({ _sourcePassage: { passageId: "p9", title: "Z", content: SPX } }) } }),
  policy.resolvePrintablePassage({ question: { passage: { title: "", content: "  " }, structuredData: { _sourcePassage: { content: "   " } } } }),
];
results.misc.alwaysInline = [...policy.ALWAYS_INLINE_SOURCE_PASSAGE_SUBTYPES].sort();

process.stdout.write(JSON.stringify(results));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-paper-core-model-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
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

const R = runHarness();

// ── 독립 오라클(구현 함수를 부르지 않는다) ───────────────────────────────────
const SNAP = "Snapshot passage text about memory and recall in the brain archive.";
const DBP = "Database passage text describing recognition and recall as two methods.";
const SPX = "Detached passage text preserved when the original passage was deleted.";
const FORCED = new Set(["TITLE", "SUMMARY_COMPLETE"]); // TITLE=shouldForce(source·비HIDEABLE), SUMMARY_COMPLETE=웹 항상 인라인
const DEFAULT_ON = new Set(["WORD_ORDER", "TITLE", "SUMMARY_COMPLETE"]); // 기본값: 출처 흐름·비정답노출 유형
const PRINTS_WHEN_INCLUDED = new Set(["WORD_ORDER", "TITLE", "SUMMARY_COMPLETE", "BLANK_INFERENCE", "CONDITIONAL_WRITING"]);
const SOURCE_FLOW = new Set(["WORD_ORDER", "TITLE", "SUMMARY_COMPLETE", "CONDITIONAL_WRITING"]);

function oracle(row) {
  const snapText = typeof row.snap === "string" && row.snap !== "__omit__" && row.snap.trim() ? row.snap : "";
  const content = snapText || (row.db === "db" ? DBP : "") || (row.sp ? SPX : "");
  const origin = snapText ? "snapshot" : row.db === "db" ? "db" : row.sp ? "detached" : "missing";
  const has = Boolean(content);
  const forced = has && FORCED.has(row.subType);
  // 저장값 없음의 기본값은 지문이 없어도 「지문이 있다면」의 기본값이다(source 흐름 — DEFAULT_ON 은 모두 source). 26-09-30 MODEL-FINISH.
  const include = forced ? true : typeof row.S === "boolean" ? row.S : DEFAULT_ON.has(row.subType);
  const printed = row.subType === "SUMMARY_COMPLETE" ? has : has && include && PRINTS_WHEN_INCLUDED.has(row.subType);
  // 「원문 지문 없음」 = 찍을 지문 없음 ∧ source 흐름 ∧ 지문이 있었다면 찍었음(강제 ∨ 저장값 true ∨ 저장값 없음·기본값 켬).
  const wouldPrint = FORCED.has(row.subType) || (typeof row.S === "boolean" ? row.S : DEFAULT_ON.has(row.subType));
  return { content, origin, include, printed, missing: !has && SOURCE_FLOW.has(row.subType) && wouldPrint };
}

test("matrix covers every subtype × saved × snapshot × db × detached × format cell", () => {
  assert.equal(R.matrix.length, 5 * 3 * 4 * 2 * 2 * 2);
});

// 아래 두 테스트 이름의 §2.4 · §2.5 는 옛 스펙 번호다 = docs/EXAM-PAPER-MODEL.md §2 · §3(문서 머리 「옛 번호 대응」).
test("§2.4 includePassage = forced ? true : saved boolean ? saved : default (every matrix cell)", () => {
  const bad = R.matrix.filter((row) => row.include !== oracle(row).include);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cells disagree`);
});

test("§2.5 passage = non-empty snapshot → DB passage → _sourcePassage (empty/blank snapshot = none)", () => {
  const bad = R.matrix.filter((row) => row.passageContent !== oracle(row).content || row.origin !== oracle(row).origin);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cells disagree`);
});

test("web print (groups + inline segments) follows the resolved rule — saved false hides WORD_ORDER, forced types stay", () => {
  const bad = R.matrix.filter((row) => row.printed !== oracle(row).printed);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cells disagree`);
  const wo = R.matrix.find((r) => r.subType === "WORD_ORDER" && r.S === false && r.snap === SNAP && r.db === "db" && !r.sp);
  assert.equal(wo.printed, false);
  const title = R.matrix.find((r) => r.subType === "TITLE" && r.S === false && r.snap === SNAP && r.db === "db");
  assert.equal(title.printed, true);
});

test("detached passage: title falls back to the preserved title and passage id is detached:<id>", () => {
  const row = R.matrix.find((r) => r.snap === "__omit__" && r.db === "none" && r.sp && r.subType === "TITLE");
  assert.equal(row.passageTitle, "보관 제목");
  assert.equal(row.passageId, "detached:p-deleted");
});

test("「원문 지문 없음」 flag only for source-flow items with nothing to print that would print a passage", () => {
  const bad = R.matrix.filter((row) => row.missing !== oracle(row).missing);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} cells disagree`);
  assert.equal(R.misc.nullMissing, true);
  assert.equal(R.misc.nullEmbeddedMissing, false);
  assert.deepEqual(R.misc.nullDetached, { content: SPX, title: "Old", include: true, missing: false });
});

test("settings NULL uses makePaperItem defaults (+ force) — embedded/answer-bearing off, subjective 4 answer lines", () => {
  const bySub = Object.fromEntries(R.misc.nullPath.map((r) => [r.subType, r]));
  assert.equal(bySub.WORD_ORDER.include, true);
  assert.equal(bySub.TITLE.include, true);
  assert.equal(bySub.BLANK_INFERENCE.include, false);
  assert.equal(bySub.SUMMARY_COMPLETE.include, true);
  assert.equal(bySub.CONDITIONAL_WRITING.include, false);
  assert.equal(bySub.WORD_ORDER.lines, 4);
  assert.equal(bySub.TITLE.lines, 0);
  assert.equal(bySub.TITLE.points, 3);
  assert.equal(bySub.TITLE.content, DBP);
});

test("similar-v1 (no includePassage saved) resolves to the same defaults as NULL", () => {
  assert.deepEqual(
    R.misc.similar.map((r) => [r.subType, r.include]),
    R.misc.nullPath.map((r) => [r.subType, r.include]),
  );
  assert.ok(R.misc.similar.every((r) => r.group));
});

test("English set: one group, merged prompt, shared passage printed regardless of member toggles", () => {
  const e = R.sets.english;
  assert.equal(e.nullGroups, 1);
  assert.deepEqual(e.nullInclude, [true, true]);
  assert.deepEqual(e.nullGroupId, ["set:S-EN", "set:S-EN"]);
  assert.equal(e.nullPrompt, "[1~2] 다음 글을 읽고, 물음에 답하시오.");
  assert.equal(e.nullPassage, true);
  assert.equal(e.offGroups, 1);
  assert.equal(e.offPassage, true);
  assert.deepEqual(e.noGroupIds, ["set:S-EN", "set:S-EN"]);
});

test("Korean set: members never carry their own passage; shared box + directive; raw line breaks kept", () => {
  const k = R.sets.korean;
  assert.deepEqual(k.nullInclude, [false, false]);
  assert.deepEqual(k.savedInclude, [false, false]);
  assert.equal(k.savedKeepsNewlines, true);
  assert.equal(k.groups, 1);
  assert.equal(k.groupPassage, true);
  assert.equal(k.directive, "[1~2] 다음 글을 읽고 물음에 답하시오.");
});

test("gichul set: saved toggle respected for the whole set (no force), default on", () => {
  const g = R.sets.gichul;
  assert.deepEqual(g.savedTrue, { include: [true, true], groupPassage: true, groups: 1 });
  assert.deepEqual(g.savedFalse, { include: [false, false], groupPassage: false, groups: 1 });
  assert.deepEqual(g.savedOmit, { include: [true, true], groupPassage: true, groups: 1 });
  assert.deepEqual(g.nullInclude, [true, true]);
});

test("builder reopen and detail/print build identical PaperItem[] (single source of truth)", () => {
  assert.equal(R.misc.reopenParity, true);
  assert.equal(R.misc.reopenGcLines, 0);
  assert.equal(R.misc.reopenEmptySnapshotRecovered, DBP);
  assert.deepEqual(R.misc.blockOrder, [["text", 0], ["question", 1], ["question", 2], ["question", 3]]);
});

test("resolvePaperLayout defaults equal the web detail defaults", () => {
  const d = R.misc.layoutNull;
  assert.equal(d.columns, 2);
  assert.equal(d.paperSize, "A4");
  assert.equal(d.density, "comfortable");
  assert.equal(d.template, "clean");
  assert.equal(d.showAnswerSpace, true);
  assert.equal(d.showPassageTitle, false);
  assert.equal(d.showQuestionMeta, false);
  assert.equal(d.forceTwoPerPage, false);
  assert.equal(d.header.instructions, R.misc.defaultInstructions);
  assert.equal(d.header.studentNameLabel, "이름");
  assert.equal(d.cover.enabled, false);
  const s = R.misc.layoutSet;
  assert.deepEqual(
    [s.template, s.columns, s.paperSize, s.density, s.showAnswerSpace, s.showQuestionMeta, s.forceTwoPerPage, s.cover.enabled],
    ["mock", 1, "B4", "compact", false, true, true, true],
  );
  assert.equal(s.header.instructions, R.misc.defaultInstructions);
});

test("answer key entries: numeric objective answers become circled, others untouched, blocks skipped", () => {
  assert.deepEqual(R.misc.answers, [
    { orderNum: 1, answer: "③" },
    { orderNum: 2, answer: "memory is an archive" },
    { orderNum: 3, answer: "2, 4" },
  ]);
});

test("export adapter: question items only, resolved includePassage and printable passage, BuilderItemResolved keys", () => {
  const items = R.misc.exportItems;
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => [i.questionId, i.orderNum, i.include]), [["a1", 1, true], ["a2", 2, true], ["a3", 3, true]]);
  assert.deepEqual(items[0].passage, { title: "DB title", content: DBP });
  assert.deepEqual(items[0].explanation, { content: "해설", keyPoints: null, wrongOptionExplanations: null });
  assert.equal(items[0].breakBefore, "auto");
  assert.deepEqual(items[0].keys, [
    "answerSpaceLines", "blockAlign", "blockBold", "blockFontPt", "blockItalic", "breakBefore", "correctAnswer",
    "groupId", "includePassage", "keepWithPrev", "localId", "objectiveAnswerSlots", "objectiveAnswerTexts", "options",
    "orderNum", "passageContent", "passageTitle", "points", "printInlinePassage", "questionId", "questionText", "sectionTitle", "sourceQuestion",
    "teacherNote",
  ]);
});

test("resolvePrintablePassage priority and blank handling", () => {
  const [emptySnap, snap, detached, blank] = R.misc.printable;
  assert.deepEqual(emptySnap, { content: DBP, title: "T", origin: "db", detachedPassageId: null });
  assert.deepEqual(snap, { content: SNAP, title: "T", origin: "snapshot", detachedPassageId: null });
  assert.deepEqual(detached, { content: SPX, title: "Z", origin: "detached", detachedPassageId: "p9" });
  assert.equal(blank.origin, "missing");
  assert.equal(blank.content, "");
});

test("always-inline force list matches the web renderer branches", () => {
  assert.deepEqual(R.misc.alwaysInline, ["SUMMARY_COMPLETE", "SUMMARY_COMPLETE_MC", "SUMMARY_WRITING", "TOPIC_SENTENCE_WRITING"]);
  const layout = readFileSync(path.join(repoRoot, "src/components/exams/paper-builder/question-body-layout.ts"), "utf8");
  // structuredSegments 의 세 분기가 includePassage 를 보지 않고 지문 박스를 넣는다 — 이 목록의 근거.
  assert.match(layout, /if \(isSummaryCompleteSubtype\(subType\)\) \{\s*const passage = summaryCompleteMcPassageForItem\(item\);/);
  assert.match(layout, /if \(isSummaryWritingSubtype\(subType\)\) \{\s*const passage = summaryCompleteMcPassageForItem\(item\);/);
  assert.match(layout, /if \(isTopicSentenceWritingSubtype\(subType\)\) \{\s*const passage = summaryCompleteMcPassageForItem\(item\);/);
});

test("web surfaces delegate to the shared module (no forked savedItemToPaperItem)", () => {
  const detail = readFileSync(path.join(repoRoot, "src/components/exams/exam-detail-paper-preview.tsx"), "utf8");
  const reopen = readFileSync(path.join(repoRoot, "src/components/exams/exam-paper-builder-existing.ts"), "utf8");
  for (const [name, src] of [["detail", detail], ["reopen", reopen]]) {
    assert.doesNotMatch(src, /function savedItemToPaperItem|shouldIncludeSourcePassageByDefault|includePassage\s*[!=]==/, name);
    assert.match(src, /buildPaperItemsFromExam/, name);
  }
});
