// MISSING-PASSAGE-UI (26-09-30) — 「원문 지문 없음」 경고(배너·칩·내보내기/인쇄 토스트)의 판정과 배선 계약.
// 판정은 CORE saved-paper-items.isPaperItemSourcePassageMissing 하나(감사와 같음 — MODEL-FINISH 통일)이고
// 넣는 지문만 기준마다 다르다.
//  · web(화면·인쇄·PDF): item.passageContent 가 비면 sourceQuestion.passage.content(buildGroups 와 같은 폴백)
//  · export(HWPX·DOCX): resolvePrintablePassage(스냅숏 → DB → _sourcePassage 보관본) — 서버와 같은 결정
// 감독 결정: 지문이 있었다면 찍었을 문항만 경고한다 — 강제 유형(저장값 무관), 저장값 true, 저장값 없음(NULL)의 기본값.
// 끌 수 있는 유형·정답 노출형의 저장값 false 는 선생님 선택이라 경고하지 않는다.
// 기대값은 구현을 부르지 않는 독립 오라클(유형 흐름표 + 지문 원천 + 토글)로 계산한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");

const harnessSource = String.raw`
import * as savedMod from "@/components/exams/paper-builder/saved-paper-items";
import * as modelMod from "@/components/exams/paper-builder/paper-item-model";
import * as missingMod from "@/components/exams/paper-builder/components/a4-paper-page-parts/missing-passage-items";

const pick = (m) => m.default ?? m["module.exports"] ?? m;
const saved = pick(savedMod);
const model = pick(modelMod);
const mp = pick(missingMod);

const DBP = "Database passage text describing recognition and recall as two methods of memory access.";
const SNAP = "Snapshot passage text about memory and recall in the brain archive of every learner.";
const SPX = "Detached passage text preserved when the original passage was deleted by the academy.";
const FIVE = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "choice " + n })));
const EMBEDDED_BODY = "다음 빈칸에 들어갈 말로 가장 적절한 것은?\n\nThe brain stores data in a vast ________ that we access in two ways, recall and recognition, and each one works differently for learners who study.";

const FIXTURES = {
  TITLE: ["다음 글의 제목으로 가장 적절한 것은?", FIVE, {}],
  TOPIC: ["다음 글의 주제로 가장 적절한 것은?", FIVE, {}],
  CONTENT_MATCH: ["다음 글의 내용과 일치하지 않는 것은?", FIVE, {}],
  SUMMARY_COMPLETE_MC: ["다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?", FIVE, {}],
  WORD_ORDER: ["다음 글을 참고하여 주어진 단어를 바르게 배열하시오.\n\n[배열 단어] memory / is / an / archive", null, {}],
  CONDITIONAL_WRITING: ["[영작할 우리말] 기억은 두 가지 방법에 의존한다.\n\n[조건] 1. 주어진 단어를 활용할 것", null, {}],
  SENTENCE_TRANSFORM: ["다음 문장을 조건에 맞게 바꾸어 쓰시오.\n\n[원문] Memory depends on recall.\n\n[조건] 수동태로 쓸 것", null, {}],
  BLANK_INFERENCE: [EMBEDDED_BODY, FIVE, { passageWithBlank: "The brain stores data in a vast ________ archive." }],
  SENTENCE_ORDER: ["주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?", FIVE, { paragraphs: ["(A) one", "(B) two", "(C) three"] }],
};

function makeQuestion(id, subType, o = {}) {
  const [questionText, options, sd] = FIXTURES[subType];
  const structuredData = { ...sd };
  if (o.sourcePassage) structuredData._sourcePassage = o.sourcePassage;
  return {
    id, type: options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER", subType, questionText, structuredData,
    options, correctAnswer: "3", points: 2, difficulty: "MEDIUM", tags: null, aiGenerated: true, approved: true,
    starred: false, createdAt: "2026-09-01T00:00:00.000Z", setId: null,
    passage: o.db ? { id: "p-" + id, title: "DB title", content: o.db, grade: null, semester: null, publisher: null, school: null } : null,
    explanation: null, collectionItems: [], _count: { examLinks: 1 },
  };
}
const eqOf = (question, orderNum) => ({ id: "eq-" + question.id, orderNum, points: 3, question });
const DETACHED = { passageId: "p-gone", title: "보관", content: SPX, detachedAt: "2026-09-29T00:00:00.000Z" };
const judge = (item) => ({
  web: mp.isPaperItemPrintedWithoutSourcePassage(item),
  export: mp.isPaperItemExportedWithoutSourcePassage(item),
  core: saved.isPaperItemSourcePassageMissing(item),
  includePassage: item.includePassage,
});

// 지문 원천: none(아무것도 없음) · db · snapshot(빌더 저장 스냅숏) · detached(_sourcePassage 보관본) · emptySnap(빈 스냅숏, DB 없음)
// 저장 형식: null(settings NULL → 기본값) · v2off(블록 includePassage=false) · v2on(블록 includePassage=true)
const SOURCES = ["none", "db", "snapshot", "detached", "emptySnap"];
const results = { matrix: [], builderNew: [], misc: {} };
let n = 0;
for (const subType of Object.keys(FIXTURES)) for (const src of SOURCES) for (const format of ["null", "v2off", "v2on"]) {
  if (format === "null" && (src === "snapshot" || src === "emptySnap")) continue;
  n += 1;
  const q = makeQuestion("q" + n, subType, {
    db: src === "db" ? DBP : null,
    sourcePassage: src === "detached" ? DETACHED : null,
  });
  const settings = format === "null" ? null : {
    source: "exam-paper-builder-v2", version: 2,
    blocks: [
      { localId: "T-" + n, blockType: "text", blockText: "머리말" },
      { localId: "L-" + n, blockType: "question", questionId: q.id, orderNum: 1, points: 3, groupId: "single:L-" + n,
        includePassage: format === "v2on",
        ...(src === "snapshot" ? { passageContent: SNAP } : src === "emptySnap" ? { passageContent: "" } : {}) },
    ],
  };
  const items = saved.buildPaperItemsFromExam([eqOf(q, 1)], settings);
  const web = mp.collectMissingPassageItems(items);
  const exp = mp.collectMissingPassageItems(items, "export");
  results.matrix.push({
    subType, src, format,
    flagged: web.length === 1,
    exportFlagged: exp.length === 1,
    orderNum: web[0]?.orderNum ?? null,
    core: items.filter(saved.isPaperItemSourcePassageMissing).length === 1,
    includePassage: items.find((it) => it.blockType === "question")?.includePassage ?? null,
    blocks: items.length,
  });
}

// 빌더에 새로 담은 문항(makePaperItem) — 지문 원천별. 보관본은 서버(HWPX·DOCX)가 싣는다(export=false).
for (const subType of ["TITLE", "WORD_ORDER", "CONDITIONAL_WRITING", "BLANK_INFERENCE"]) {
  for (const src of ["none", "db", "detached"]) {
    const q = makeQuestion("b-" + subType + "-" + src, subType, {
      db: src === "db" ? DBP : null,
      sourcePassage: src === "detached" ? DETACHED : null,
    });
    const item = model.makePaperItem(q, 1, []);
    // 저장 → 다시 열기(v2 블록에 빌더 값 그대로) 뒤의 판정 — 새 문항과 같아야 한다.
    const reopened = saved.buildPaperItemsFromExam([eqOf(q, 1)], {
      source: "exam-paper-builder-v2", version: 2,
      blocks: [{ localId: item.localId, blockType: "question", questionId: q.id, orderNum: 1, points: 3, groupId: item.groupId,
        includePassage: item.includePassage, passageContent: item.passageContent, passageTitle: item.passageTitle }],
    })[0];
    results.builderNew.push({
      subType, src, ...judge(item), passageLen: item.passageContent.length,
      passageId: item.sourceQuestion.passage?.id ?? null, passageTitle: item.passageTitle,
      reopenedWeb: mp.isPaperItemPrintedWithoutSourcePassage(reopened),
    });
    if (subType === "CONDITIONAL_WRITING" && src === "none") {
      results.builderNew.push({ subType, src, toggledOn: true, ...judge({ ...item, includePassage: true }) });
    }
  }
}

// 빌더에서 지문 박스 글을 모두 지운 문항 — 웹은 sourceQuestion.passage 로, 서버는 DB 지문으로 폴백해 찍는다.
{
  const q = makeQuestion("edit", "TITLE", { db: DBP });
  const [item] = saved.buildPaperItemsFromExam([eqOf(q, 1)], null);
  results.misc.clearedEdit = judge({ ...item, passageContent: "" });
}

// 순서·번호: 비문항 블록은 건너뛰고 시험지 번호(문항만 1부터)를 쓴다.
{
  const qs = ["TITLE", "BLANK_INFERENCE", "TOPIC", "CONTENT_MATCH"].map((t, i) => makeQuestion("o" + i, t, { db: t === "BLANK_INFERENCE" ? DBP : null }));
  const settings = { source: "exam-paper-builder-v2", version: 2, blocks: [
    { localId: "S1", blockType: "section", blockTitle: "1부" },
    ...qs.map((q, i) => ({ localId: "Q" + i, blockType: "question", questionId: q.id, orderNum: i + 1, points: 3, groupId: "single:Q" + i })),
  ] };
  const items = saved.buildPaperItemsFromExam(qs.map((q, i) => eqOf(q, i + 1)), settings);
  results.misc.order = mp.collectMissingPassageItems(items);
}

results.misc.format = {
  none: mp.formatMissingPassageNumbers([]),
  two: mp.formatMissingPassageNumbers([{ orderNum: 27 }, { orderNum: 31 }]),
  cut: mp.formatMissingPassageNumbers([1, 2, 3, 4, 5].map((orderNum) => ({ orderNum })), 3),
};
results.misc.scope = { same: mp.describeMissingPassageScope(5, 5), diff: mp.describeMissingPassageScope(3, 1) };

const part = (localId) => ({ source: { localId }, partKey: localId + "@x" });
const pages = [
  [[{ parts: [part("a"), part("b")] }], []],
  [[{ parts: [part("c")] }], [{ parts: [part("b"), part("d")] }]],
];
results.misc.pageIndex = ["a", "b", "c", "d", "zz"].map((id) => mp.findItemPageIndex(pages, id));

// 번호 이동 스크롤 계산 — 스크롤러만 움직인다.
const G = (o) => ({ scrollTop: 1000, rootTop: 250, rootBottom: 850, viewportHeight: 900, targetTop: 1200, targetHeight: 100, ...o });
results.misc.reveal = {
  center: mp.computeRevealScrollTop(G({}), "center"),
  start: mp.computeRevealScrollTop(G({}), "start"),
  tall: mp.computeRevealScrollTop(G({ targetHeight: 900 }), "center"),
  cutBelow: mp.computeRevealScrollTop(G({ rootTop: 400, rootBottom: 1020, viewportHeight: 768, targetTop: 1500 }), "center"),
  clampZero: mp.computeRevealScrollTop(G({ scrollTop: 0, targetTop: 260 }), "center"),
  nudgeFits: mp.computeRevealWindowNudge({ rootTop: 250, rootBottom: 850, viewportHeight: 900 }),
  nudgeCutOk: mp.computeRevealWindowNudge({ rootTop: 400, rootBottom: 1020, viewportHeight: 768 }),
  nudgeNearBottom: mp.computeRevealWindowNudge({ rootTop: 700, rootBottom: 1320, viewportHeight: 768 }),
  nudgeShortRoot: mp.computeRevealWindowNudge({ rootTop: 700, rootBottom: 800, viewportHeight: 768 }),
  nudgeCutAbove: mp.computeRevealWindowNudge({ rootTop: -500, rootBottom: 100, viewportHeight: 768 }),
  minBand: mp.REVEAL_MIN_VISIBLE_BAND,
};

results.misc.css = {
  empty: mp.buildMissingPassageChipCss([]),
  one: mp.buildMissingPassageChipCss(["cmx-1"]),
  evil: mp.buildMissingPassageChipCss(['a"b\\c</style><script>x']),
  selector: mp.missingPassageItemSelector("cmx-1"),
  label: mp.MISSING_PASSAGE_CHIP_LABEL,
};

process.stdout.write(JSON.stringify(results));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".missing-passage-warning-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
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

// 독립 오라클: 따로 싣는(source 흐름) 유형 ∧ 찍을 지문 없음 ∧ 본문에 박힌 지문 없음
//             ∧ 지문이 있었다면 찍었음 = 강제 유형 ∨ 저장값 true(v2on) ∨ (저장값 없음(NULL) ∧ 기본값 켬).
const SOURCE_FLOW = new Set(["TITLE", "TOPIC", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC", "WORD_ORDER", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM"]);
const ANSWER_BEARING = new Set(["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM"]);
const FORCED = new Set(["TITLE", "TOPIC", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"]); // source·끌 수 없음(강제)
const DEFAULT_ON = new Set([...FORCED, "WORD_ORDER"]); // 지문이 있을 때의 기본값(정답 노출형은 끔)
const passageAbsent = (src) => src === "none" || src === "emptySnap";
const wouldPrint = ({ subType, format }) =>
  FORCED.has(subType) || format === "v2on" || (format === "null" && DEFAULT_ON.has(subType));
const oracle = (row) => SOURCE_FLOW.has(row.subType) && passageAbsent(row.src) && wouldPrint(row);

test("판정 매트릭스: 유형 × 지문 원천(없음·DB·스냅숏·보관본·빈 스냅숏) × 저장(NULL·v2 끔·v2 켬)", () => {
  assert.ok(R.matrix.length >= 100, `매트릭스 ${R.matrix.length}칸`);
  const wrong = R.matrix.filter((row) => row.flagged !== oracle(row));
  assert.deepEqual(wrong, [], "오라클과 다른 칸");
  // 저장본은 서버와 같은 지문을 이미 담는다 — HWPX·DOCX 판정 = 웹 판정.
  assert.deepEqual(R.matrix.filter((row) => row.exportFlagged !== row.flagged), [], "저장본에서 web ≠ export");
  // v2 는 머리 텍스트 블록이 있어도 문항 번호는 1이다.
  for (const row of R.matrix.filter((r) => r.flagged)) assert.equal(row.orderNum, 1, JSON.stringify(row));
});

test("감독 결정: 저장값 false(끌 수 있는 유형·정답 노출형)는 선생님 선택 — 경고 없음, 강제 유형은 false 여도 경고", () => {
  // 정답 노출형: 켜지 않은 칸의 includePassage 는 false(지문이 있어도 안 실림) → 경고 없음. 켰으면 경고.
  const ab = R.matrix.filter((r) => ANSWER_BEARING.has(r.subType));
  for (const row of ab.filter((r) => r.format !== "v2on")) {
    assert.equal(row.includePassage, false, JSON.stringify(row));
    assert.equal(row.flagged, false, JSON.stringify(row));
  }
  assert.ok(ab.some((r) => r.format === "v2on" && r.src === "none" && r.flagged));
  // 끌 수 있는 유형(WORD_ORDER): 저장 false 는 경고 없음, 저장값 없음(NULL)은 기본값(켬)이라 경고.
  const wo = (format) => R.matrix.find((r) => r.subType === "WORD_ORDER" && r.format === format && r.src === "none");
  assert.equal(wo("v2off").flagged, false);
  assert.equal(wo("v2on").flagged, true);
  assert.equal(wo("null").flagged, true);
  assert.equal(wo("null").includePassage, true, "저장값 없음의 기본값은 지문이 있다고 보고 정한다(의도 기록)");
  // 강제 유형은 저장값 false 여도 지문이 있었다면 찍혔다 → 경고.
  for (const sub of FORCED) assert.equal(R.matrix.find((r) => r.subType === sub && r.format === "v2off" && r.src === "none").flagged, true, sub);
  // 단일 판정: UI(web) = CORE(감사가 쓰는 함수) — 모든 칸.
  assert.deepEqual(R.matrix.filter((r) => r.flagged !== r.core), []);
});

test("MPUI-3: 빌더에 새로 담은 문항(makePaperItem)도 보관본(_sourcePassage)을 지문으로 쓴다 — 화면·서버 같음", () => {
  const row = (subType, src, extra = {}) =>
    R.builderNew.find((r) => r.subType === subType && r.src === src && Boolean(r.toggledOn) === Boolean(extra.toggledOn));
  // 보관본 문항: 빌더 화면·인쇄부터 보관본을 찍는다(저장 전) → 두 기준 모두 경고 없음. 지문 모양은 저장본 경로와 같다.
  for (const r of R.builderNew.filter((x) => x.src === "detached")) {
    assert.ok(r.passageLen > 0, JSON.stringify(r));
    assert.equal(r.web, false, JSON.stringify(r));
    assert.equal(r.export, false, JSON.stringify(r));
    assert.equal(r.passageId, "detached:p-gone", JSON.stringify(r));
    assert.equal(r.passageTitle, "보관", JSON.stringify(r));
  }
  // 기본값은 지문이 있을 때와 같다(보관본을 읽기 전에는 지문 없음 기본값 false 였다).
  assert.equal(row("TITLE", "detached").includePassage, true);
  assert.equal(row("WORD_ORDER", "detached").includePassage, true);
  assert.equal(row("CONDITIONAL_WRITING", "detached").includePassage, false);
  // 지문 없음·DB 지문: 두 기준이 같다.
  assert.equal(row("TITLE", "none").web, true);
  assert.equal(row("TITLE", "none").export, true);
  assert.equal(row("TITLE", "db").web, false);
  assert.equal(row("TITLE", "db").export, false);
  assert.equal(row("BLANK_INFERENCE", "none").web, false);
  // 끌 수 있는 유형의 새 문항: 기본값(지문이 있다고 보고 켬) → 경고. 정답 노출형: 기본값 꺼짐 → 경고 없음, 켜면 경고.
  assert.equal(row("WORD_ORDER", "none").includePassage, true);
  assert.equal(row("WORD_ORDER", "none").web, true);
  assert.equal(row("CONDITIONAL_WRITING", "none").includePassage, false);
  assert.equal(row("CONDITIONAL_WRITING", "none").web, false);
  assert.equal(row("CONDITIONAL_WRITING", "none", { toggledOn: true }).web, true);
  assert.equal(row("CONDITIONAL_WRITING", "none", { toggledOn: true }).export, true);
  // 새 문항의 판정 = 저장하고 다시 연 판정(빌더 값이 그대로 저장되므로 경고가 저장 전후로 바뀌지 않는다).
  for (const r of R.builderNew.filter((x) => !x.toggledOn)) assert.equal(r.reopenedWeb, r.web, JSON.stringify(r));
  // 서버 판정 ⊆ 웹 판정(배너 문구가 「그중 N문항」이라고 말할 수 있는 근거).
  for (const r of [...R.builderNew, ...R.matrix.map((m) => ({ web: m.flagged, export: m.exportFlagged }))]) {
    assert.ok(!r.export || r.web, JSON.stringify(r));
  }
});

test("빌더에서 지문 글을 모두 지운 문항: 웹·서버·CORE(감사) 모두 원문으로 폴백하므로 경고하지 않는다", () => {
  assert.equal(R.misc.clearedEdit.web, false);
  assert.equal(R.misc.clearedEdit.export, false);
  assert.equal(R.misc.clearedEdit.core, false, "CORE 판정도 buildGroups 와 같은 폴백을 쓴다(거짓 양성 수리)");
});

test("목록은 시험지 순서 · 시험지 번호 · 비문항 블록 제외", () => {
  assert.deepEqual(
    R.misc.order.map((m) => [m.orderNum, m.subType]),
    [
      [1, "TITLE"],
      [3, "TOPIC"],
      [4, "CONTENT_MATCH"],
    ],
  );
  assert.ok(R.misc.order.every((m) => typeof m.localId === "string" && m.localId));
});

test("번호 표기 · 배너 범위 문구 · 쪽 찾기", () => {
  assert.equal(R.misc.format.none, "");
  assert.equal(R.misc.format.two, "27·31번");
  assert.equal(R.misc.format.cut, "1·2·3번 외 2문항");
  assert.match(R.misc.scope.same, /\(인쇄·PDF·HWPX·DOCX 모두 같음\)\.$/);
  assert.doesNotMatch(R.misc.scope.diff, /모두 같음/);
  assert.match(R.misc.scope.diff, /\(화면·인쇄·PDF\)\. HWPX·DOCX 에는 그중 2문항의 원문 지문이 들어갑니다/);
  assert.deepEqual(R.misc.pageIndex, [0, 0, 1, 1, -1]);
});

test("MPUI-2: 번호 이동은 스크롤러만 — 보이는 띠 가운데, 문서는 스크롤러가 창 아래 끝에 걸릴 때만 최소한", () => {
  const r = R.misc.reveal;
  // 띠 250..850(600) · 대상 100 → 대상 윗변이 250 + 250 = 500 에 오도록: 1000 + (1200 - 250) - 250
  assert.equal(r.center, 1700);
  assert.equal(r.start, 1000 + (1200 - 250) - 12);
  assert.equal(r.tall, 1000 + (1200 - 250) - 12, "띠보다 큰 대상은 위쪽 맞춤");
  // 창 아래로 잘린 스크롤러(400..1020, 창 768): 보이는 띠 400..768(368) 가운데 — 문서는 그대로.
  assert.equal(r.cutBelow, 1000 + (1500 - 400) - (368 - 100) / 2);
  assert.equal(r.clampZero, 0);
  assert.equal(r.nudgeFits, 0);
  assert.equal(r.nudgeCutOk, 0);
  assert.equal(r.nudgeNearBottom, r.minBand - (768 - 700), "보이는 띠 68px → 240px 까지만 내린다");
  assert.equal(r.nudgeShortRoot, 800 - 768, "스크롤러 아래 끝을 넘겨 내리지 않는다");
  assert.equal(r.nudgeCutAbove, 0, "위로 잘린 스크롤러는 내리지 않는다(더 가려진다)");
});

test("칩 CSS: 화면 전용(@media screen) · 미리보기 루트 A4 쪽으로 한정 · 인젝션 불가", () => {
  const { empty, one, evil, selector, label } = R.misc.css;
  assert.equal(empty, "");
  assert.equal(label, "원문 지문 없음");
  assert.equal(selector, '#exam-paper-print-root .exam-a4-page [data-paper-item-id="cmx-1"]');
  assert.match(one, /^@media screen \{\n/);
  assert.match(one, /\}\n\}$/);
  assert.ok(one.includes(`${selector}::after {`));
  assert.ok(one.includes('content: "원문 지문 없음";'));
  assert.match(one, /position: absolute;/, "흐름 밖(absolute)이어야 조판 높이에 영향이 없다");
  assert.doesNotMatch(one, /@media print/);
  // 따옴표·역슬래시·태그 글자는 전부 \HEX 로 — 규칙·<style> 을 깰 수 없다.
  const evilSelector = evil.split("\n")[1];
  assert.doesNotMatch(evil, /<|>(?!\s)/);
  assert.equal((evilSelector.match(/"/g) || []).length, 2, evilSelector);
  assert.ok(evilSelector.includes("\\22 ") && evilSelector.includes("\\5c ") && evilSelector.includes("\\3c "), evilSelector);
});

test("배선 계약: 툴바 → 인쇄 상태 표시줄 → 배너 순서 · 인쇄 빠른 경로 무개입 · 인쇄 뒤 토스트 · no-print", () => {
  const detail = read("src/components/exams/exam-detail-paper-preview.tsx");
  const builder = read("src/components/exams/exam-paper-builder-client.tsx");
  for (const [name, src] of [["detail", detail], ["builder", builder]]) {
    // [data-preview-toolbar] + [role="status"] (print-harness STATUS) 인접 계약을 지키려면 배너는 상태 표시줄 뒤다.
    assert.match(src, /<PrintStatusBar controller=\{printCtl\} \/>\s*<MissingPassageBanner state=\{missingPassage\}/, name);
    assert.match(src, /const missingPassage = useMissingSourcePassage\(paperItems\);/, name);
  }
  // 내보내기는 경고 뒤 그대로 진행(막지 않음) — 상세는 핸들러 감싸기, 빌더는 다운로드 발사 지점.
  assert.equal((detail.match(/missingPassage\.wrapExport\("(?:DOCX|HWPX)", handleDownload\w+\)/g) || []).length, 4);
  assert.match(builder, /function triggerDocxDownload[^{]*\{\s*missingPassage\.warnExport\("DOCX"\);/);
  assert.match(builder, /function triggerHwpxDownload[^{]*\{\s*missingPassage\.warnExport\("HWPX"\);/);
  // 인쇄 버튼 경로에는 경고를 끼우지 않는다(사용자 제스처 빠른 경로 보존 — 배너가 상시 경고).
  assert.match(detail, /onPrint=\{\(\) => printCtl\.print\("plain"\)\}/);
  assert.match(builder, /const printPlain = \(\) => printCtl\.print\("plain"\);/);
  // MPUI-4: 카드 인쇄 대화상자·?print=1·빠른보기 자동 인쇄는 afterprint 뒤(잡 종료 콜백) 토스트로 알린다.
  assert.match(detail, /onFinished: missingPassage\.withPrintWarning\(onPrintFinished\),/);
  const banner = read("src/components/exams/exam-paper-builder-client-parts/missing-passage-warning.tsx");
  assert.match(banner, /className="no-print print:hidden" data-missing-passage-banner=""/);
  assert.doesNotMatch(banner, /\bwindow\.print\s*\(|\bsetTimeout\s*\(|confirm\s*\(/);
  // MPUI-2: 조상(문서)까지 굴리는 scrollIntoView 금지 — 스크롤러 scrollTo 만.
  assert.doesNotMatch(banner, /scrollIntoView/);
  assert.match(banner, /root\.scrollTo\(\{ top, behavior \}\)/);
  // MPUI-3: 내보내기 토스트는 서버 기준 목록(exportItems)으로 센다.
  assert.match(banner, /collectMissingPassageItems\(paperItems, "export"\)/);
  assert.match(banner, /\$\{kind\} 파일에 \$\{exportItems\.length\}문항이 원문 지문 없이 들어갑니다/);
  const actions = read("src/components/exams/paper-builder/components/a4-paper-page-parts/paper-item-actions.tsx");
  assert.match(actions, /const passageMissing = isPaperItemPrintedWithoutSourcePassage\(item\);/);
  assert.ok(detail.split("\n").length <= 500, `exam-detail-paper-preview.tsx ${detail.split("\n").length}줄`);
});
