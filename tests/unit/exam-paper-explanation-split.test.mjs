import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// 「PDF 해설」 인라인 해설의 칸 · 쪽 분할(26-09-30 PRINT-R3 · R9, explanation-layout.ts).
//   - 한 칸보다 긴 해설도 칸을 넘치지 않는다(추정 사용 높이 ≤ 칸 용량). 종전(원자 블록 = legacy 경로)은 넘친다.
//   - 갈라진 해설은 줄 단위로 이어지고, 조각들을 이으면 원문 행이 빠짐 · 중복 없이 그대로 복원된다.
//   - 뒷조각은 「(N번 계속)」 조각(isContinuation)에서 시작하고 첫 행 위 여백을 그리지 않는다(추정도 뺀다).
//   - 선지 묶음(keep-together)은 해설 모드에서도 그대로다.
//   - 줄 나눔은 Chromium 실측 골든(tests/unit/fixtures/explanation-wrap-golden.json)과 한 글자도 다르지 않다.
//   - 굵게(**…**) · 인라인 코드 · 줄머리 글머리(- ) 처리.
//   - 「쪽당 N문제」(forceTwoPerPage)는 해설 모드에서 쓰지 않는다(E1 — 강제 배치는 칸 용량 ∞ · 가드 꺼짐이라
//     해설이 종이 끝에서 잘렸다). 해설 없는 강제 배치는 종전 그대로 칸마다 문항 하나다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const goldenPath = path.join(__dirname, "fixtures", "explanation-wrap-golden.json").replace(/\\/g, "/");

const harnessSource = `
import { readFileSync } from "node:fs";
import * as paperUtilsMod from "@/components/exams/paper-builder/paper-item-utils";
import * as paginationMod from "@/components/exams/paper-builder/pagination";
import * as metricsMod from "@/components/exams/paper-builder/pagination-metrics";
import * as layoutMod from "@/components/exams/paper-builder/explanation-layout";
import * as contentMod from "@/components/exams/paper-builder/explanation-content";
import * as keepMod from "@/components/exams/paper-builder/pagination-keep";
const pick = (m) => m.default ?? m;
const { forcedPerPageEnabled, keepOptionGroupsEnabled } = pick(keepMod);
const { buildGroups, makePaperItem } = pick(paperUtilsMod);
const { paginateGroups } = pick(paginationMod);
const { pageMetrics } = pick(metricsMod);
const { parseExplanationInline, wrapExplanationGlyphs, explanationFlowRow, explanationTypography } = pick(layoutMod);
const { buildExplanationRows } = pick(contentMod);

const WORDS = "the careful reader notices how every small detail in a long argument quietly supports the larger claim that the author wants to defend".split(" ");
function words(n, seed) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(WORDS[(i * 7 + seed) % WORDS.length]);
  return out.join(" ") + ".";
}
const KO = "손으로 글을 쓰는 행위가 인지 발달의 발판이 되며 글자를 직접 형성하는 과정이 뇌를 감각-운동 고리(sensory-motor loop)에 참여시킨다는 주장을 제시합니다.";
function koText(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(KO);
  return out.join(" ");
}

function question(id, questionText, explanation) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType: null,
    questionText,
    structuredData: null,
    options: JSON.stringify(["first option", "second option", "third option that is a little longer", "fourth", "fifth"].map((text, i) => ({ label: String(i + 1), text }))),
    correctAnswer: "4",
    points: 2,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: "2026-09-30T00:00:00.000Z",
    setId: null,
    passage: null,
    explanation,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

// 실측 결함 재현형: 순서 배열 1,085자 해설과 같은 모양(굵은 소제목 · 글머리 · 핵심 포인트 · 오답 분석)을 더 길게.
const HUGE = {
  id: "x",
  content: [
    "정답은 ④ (C)-(A)-(B)입니다.",
    "",
    "**전체 논리 흐름 분석:**",
    "",
    "**[주어진 글]** " + koText(3),
    "",
    "**[→ (C)]** 'Research indicates'로 " + koText(3),
    "**[→ (A)]** " + koText(2) + " \`This cognitive effort\`",
    "**핵심 연결 단서:**",
    "- (C) 첫머리의 'Research indicates'는 " + koText(1),
    "- (A) 첫머리의 'This cognitive effort'는 " + koText(2),
  ].join("\\n"),
  keyPoints: JSON.stringify([koText(1), koText(2), "짧은 포인트"]),
  wrongOptionExplanations: JSON.stringify({ "1": koText(2), "2": "**역할 전도**: " + koText(1), "3": koText(1) + " 함정**", "5": koText(2) }),
};
const SMALL = { id: "y", content: "짧은 해설입니다. **굵게** 한 곳.", keyPoints: null, wrongOptionExplanations: null };

function scenario(filler) {
  const qs = [
    question("a", "Read the passage and answer.\\n\\n" + words(filler, 1), SMALL),
    question("b", "Which option best completes the passage?\\n\\n" + words(60, 3), HUGE),
    question("c", "What is the main idea?\\n\\n" + words(80, 5), SMALL),
    question("d", "Choose the best title.\\n\\n" + words(70, 7), HUGE),
  ];
  const items = [];
  qs.forEach((q, i) => items.push(makePaperItem(q, i + 1, items)));
  return buildGroups(items);
}

const BASE = { paperSize: "A4", columns: 2, density: "comfortable", passageStyle: "boxed", showAnswerSpace: false, showPassageTitle: true, showQuestionMeta: false, template: "clean", includeAnswers: true };
const VARIANTS = {
  examFont: { ...BASE, textMetrics: "exam-font" },
  examFontCompact: { ...BASE, textMetrics: "exam-font", density: "compact" },
  examFontOneCol: { ...BASE, textMetrics: "exam-font", columns: 1 },
  // 빌더 「쪽당 2문제」 · 「쪽당 1문제」 + [PDF 해설](E1)
  examFontForce2: { ...BASE, textMetrics: "exam-font", forceTwoPerPage: true },
  examFontForce1: { ...BASE, textMetrics: "exam-font", columns: 1, forceTwoPerPage: true },
  legacyAtomic: { ...BASE },
};

function rowText(piece) {
  return piece.segments.map((s) => s.text).join("");
}

function analyze(result, settings, groups) {
  const cap = (p) => pageMetrics(settings, p).capacity;
  let overCapacity = 0;
  (result.columns ?? []).forEach((info, p) => info.used.forEach((u) => { if (u > cap(p) + 0.001) overCapacity += 1; }));
  const byItem = new Map();
  const problems = [];
  let optionSplits = 0;
  const optionParts = new Map();
  result.pages.forEach((page, p) => page.forEach((col, c) => col.forEach((frag) => frag.parts.forEach((part) => {
    const id = part.source.localId;
    if (part.options.length > 0) optionParts.set(id, (optionParts.get(id) ?? 0) + 1);
    if (!part.showExplanation) return;
    const list = byItem.get(id) ?? [];
    list.push({ p, c, part });
    byItem.set(id, list);
  }))));
  optionParts.forEach((n) => { if (n > 1) optionSplits += 1; });
  let splitItems = 0;
  let roundTripOk = true;
  let continuationOk = true;
  let estConsistent = true;
  const compact = settings.density === "compact";
  const columnWidth = pageMetrics(settings, 0).columnWidth;
  for (const group of groups) for (const item of group.items) {
    const list = byItem.get(item.localId) ?? [];
    if (list.length > 1) splitItems += 1;
    if (settings.textMetrics !== "exam-font") continue;
    // 조각 이어 붙이기 → 원문 행 복원
    const rebuilt = new Map();
    const order = [];
    list.forEach(({ part }, k) => {
      const slice = part.explanation;
      if (!slice) { roundTripOk = false; problems.push("slice 없음"); return; }
      if (k === 0 && !slice.containerStart) { continuationOk = false; problems.push("첫 조각 containerStart 아님"); }
      if (k > 0) {
        if (slice.containerStart || !slice.atPartStart || !part.isContinuation) { continuationOk = false; problems.push("뒷조각 플래그 " + JSON.stringify({ cs: slice.containerStart, at: slice.atPartStart, cont: part.isContinuation })); }
      }
      slice.pieces.forEach((piece, i) => {
        const key = piece.kind === "answer" ? "answer" : piece.kind === "label" ? "label:" + piece.text : piece.kind + ":" + piece.row;
        if (piece.kind === "answer" || piece.kind === "label") { order.push(key); return; }
        const continuing = !piece.rowStart;
        if (continuing && !(k > 0 && i === 0)) { roundTripOk = false; problems.push("줄 이음 조각이 조각 머리가 아님"); }
        if (!rebuilt.has(key)) order.push(key);
        rebuilt.set(key, (rebuilt.get(key) ?? "") + rowText(piece));
      });
      if (typeof slice.estHeight !== "number") estConsistent = false;
    });
    const rows = buildExplanationRows(item);
    const { fontPx } = explanationTypography(compact);
    const expected = [];
    rows.forEach((row, index) => {
      if (row.type === "answer") { expected.push("answer"); return; }
      if (row.type === "label") { expected.push("label:" + row.text); return; }
      const flow = explanationFlowRow(row, columnWidth, fontPx);
      if (!flow) return;
      const key = flow.kind + ":" + index;
      expected.push(key);
      if ((rebuilt.get(key) ?? "") !== flow.segments.map((s) => s.text).join("")) { roundTripOk = false; problems.push("행 복원 불일치 " + key); }
    });
    if (JSON.stringify(order) !== JSON.stringify(expected)) { roundTripOk = false; problems.push("행 순서 불일치"); }
  }
  return { pages: result.pages.length, overCapacity, splitItems, roundTripOk, continuationOk, estConsistent, optionSplits, overflowItems: result.overflowItems.size, problems: problems.slice(0, 5) };
}

const runs = [];
for (let filler = 20; filler <= 320; filler += 20) {
  const groups = scenario(filler);
  const row = { filler };
  for (const [label, settings] of Object.entries(VARIANTS)) row[label] = analyze(paginateGroups(groups, settings), settings, groups);
  runs.push(row);
}

// Chromium 실측 골든 — 모델 줄 머리 == 브라우저 줄 머리
const golden = JSON.parse(readFileSync(${JSON.stringify(goldenPath)}, "utf8")).rows;
const goldenResults = golden.map((g) => {
  const { fontPx } = explanationTypography(g.compact);
  const labelSeg = g.segs[0]?.tone === "label" ? g.segs[0] : null;
  const rest = labelSeg ? g.segs.slice(1) : g.segs;
  const text = rest.map((s) => (s.bold ? "**" + s.text + "**" : s.text)).join("");
  const row = g.kind === "wrong" ? { type: "wrong", label: labelSeg.text.trim(), text } : { type: g.kind, text };
  const flow = explanationFlowRow(row, g.col, fontPx);
  const starts = wrapExplanationGlyphs(flow.segments, flow.widthPx, fontPx).map((l) => l.start);
  return { segsSame: JSON.stringify(flow.segments) === JSON.stringify(g.segs), starts, browser: g.browserStarts };
});

const parse = {
  bold: parseExplanationInline("**전체 흐름:** 본문   \`code\` 끝"),
  lone: parseExplanationInline("'X' 선택지는 도입부 소재 함정**: 설명"),
  blanks: parseExplanationInline("빈칸 ______ 과 __밑줄__ [I](a) <Dr. M>"),
  bullets: buildExplanationRows({
    options: [{ label: "1", text: "a" }],
    correctAnswer: "1",
    sourceQuestion: { subType: null, type: "MULTIPLE_CHOICE", correctAnswer: "1", structuredData: null, explanation: { content: "머리 문장\\n- 첫째 항목\\n* 둘째 항목\\n-> 화살표는 글머리가 아님\\n1. 번호는 그대로", keyPoints: null, wrongOptionExplanations: null } },
  }).map((r) => r.type + ":" + (r.text ?? "")),
};

// 강제 배치 판정 — 해설 모드에서만 끈다. 해설 없는 강제 배치는 종전처럼 칸마다 문항 머리 하나.
const forced = (() => {
  const plain = { ...BASE, textMetrics: "exam-font", includeAnswers: false, forceTwoPerPage: true };
  const result = paginateGroups(scenario(40), plain);
  return {
    predicate: [{ forceTwoPerPage: true }, { forceTwoPerPage: true, includeAnswers: true }, { includeAnswers: true }, {}].map(forcedPerPageEnabled),
    keepPlain: keepOptionGroupsEnabled(plain),
    keepExplanation: keepOptionGroupsEnabled({ ...plain, includeAnswers: true }),
    plainPages: result.pages.length,
    plainHeadersPerColumn: result.pages.flatMap((page) => page.map((col) => col.reduce((n, frag) => n + frag.parts.filter((part) => part.showHeader).length, 0))),
  };
})();

process.stdout.write(JSON.stringify({ runs, goldenResults, parse, forced }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-paper-explanation-split-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx --tsconfig ./tsconfig.json "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      maxBuffer: 64 * 1024 * 1024,
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

const result = runHarness();
const runs = result.runs;
const EXAM_FONT_VARIANTS = ["examFont", "examFontCompact", "examFontOneCol", "examFontForce2", "examFontForce1"];
const ONE_COLUMN_VARIANTS = new Set(["examFontOneCol", "examFontForce1"]);

test("explanation split: the sweep really has explanations taller than a column (legacy atomic overflows)", () => {
  const legacyOver = runs.reduce((n, r) => n + r.legacyAtomic.overCapacity, 0);
  assert.ok(legacyOver > 0, "종전 원자 블록(legacy 경로)은 한 칸보다 긴 해설로 칸 용량을 넘겨야 한다(시험 조건)");
});

test("explanation split: preview/print (exam-font) never puts more than a column's capacity in a column", () => {
  for (const r of runs) for (const v of EXAM_FONT_VARIANTS) {
    assert.equal(r[v].overCapacity, 0, `filler=${r.filler} ${v}: 칸 용량 초과 ${r[v].overCapacity}`);
    assert.equal(r[v].overflowItems, 0, `filler=${r.filler} ${v}: overflowItems ${r[v].overflowItems}`);
  }
});

test("explanation split: long explanations are split across columns/pages", () => {
  for (const v of EXAM_FONT_VARIANTS) {
    const split = runs.reduce((n, r) => n + r[v].splitItems, 0);
    // 2단은 긴 해설 두 개가 모든 배치에서, 1단(칸이 넓고 높다)은 배치마다 적어도 하나가 갈라진다.
    const need = ONE_COLUMN_VARIANTS.has(v) ? runs.length : runs.length * 2;
    assert.ok(split >= need, `${v}: 갈라진 해설 ${split}개(기대 ≥ ${need})`);
  }
});

test("explanation split: pieces rebuild every row exactly once and in order", () => {
  for (const r of runs) for (const v of EXAM_FONT_VARIANTS) {
    assert.ok(r[v].roundTripOk, `filler=${r.filler} ${v}: ${r[v].problems.join(" / ")}`);
    assert.ok(r[v].estConsistent, `filler=${r.filler} ${v}: 조각 추정 높이 누락`);
  }
});

test("explanation split: continued pieces sit in (N번 계속) parts without the head/top gap", () => {
  for (const r of runs) for (const v of EXAM_FONT_VARIANTS) {
    assert.ok(r[v].continuationOk, `filler=${r.filler} ${v}: ${r[v].problems.join(" / ")}`);
  }
});

test("explanation split: option keep-together still holds in explanation mode", () => {
  for (const r of runs) for (const v of EXAM_FONT_VARIANTS) {
    assert.equal(r[v].optionSplits, 0, `filler=${r.filler} ${v}: 선지 묶음이 갈렸다`);
  }
});

test("explanation wrap: line starts equal Chromium's (golden, exam font)", () => {
  assert.ok(result.goldenResults.length >= 20);
  result.goldenResults.forEach((g, i) => {
    assert.ok(g.segsSame, `골든 ${i}: 인라인 파싱이 달라졌다`);
    assert.deepEqual(g.starts, g.browser, `골든 ${i}: 줄 머리`);
  });
});

test("explanation markdown: bold, inline code, lone markers, literal blanks, list bullets", () => {
  assert.deepEqual(result.parse.bold, [
    { text: "전체 흐름:", bold: true },
    { text: " 본문 code 끝", bold: false },
  ]);
  assert.deepEqual(result.parse.lone, [{ text: "'X' 선택지는 도입부 소재 함정: 설명", bold: false }]);
  assert.deepEqual(result.parse.blanks, [{ text: "빈칸 ______ 과 __밑줄__ [I](a) <Dr. M>", bold: false }]);
  assert.deepEqual(result.parse.bullets.slice(1), [
    "label:해설",
    "text:머리 문장",
    "bullet:첫째 항목",
    "bullet:둘째 항목",
    "text:-> 화살표는 글머리가 아님",
    "text:1. 번호는 그대로",
  ]);
});

test("explanation split: 「쪽당 N문제」 is not used in explanation mode, plain forced layout unchanged (E1)", () => {
  const f = result.forced;
  assert.deepEqual(f.predicate, [true, false, false, false], "강제 배치 판정: 해설 모드에서만 끈다");
  assert.equal(f.keepPlain, false, "해설 없는 강제 배치는 선지 묶음을 쓰지 않는다(종전)");
  assert.equal(f.keepExplanation, true, "해설 모드는 칸 용량으로 흘리므로 선지 묶음이 켜진다");
  assert.equal(f.plainPages, 2, "해설 없는 쪽당 2문제: 4문항 → 2쪽");
  assert.deepEqual(f.plainHeadersPerColumn, [1, 1, 1, 1], "해설 없는 쪽당 2문제: 칸마다 문항 머리 하나");
});
