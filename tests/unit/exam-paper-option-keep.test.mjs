import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// 선지 묶음(keep-together) 조판 규칙 — docs/EXAM-PAPER-MODEL.md §9 (26-09-29, pagination-keep.ts).
// 앞 문항 본문 길이를 한 단어씩 바꿔 가며 선지 묶음이 칸 경계에 걸리는 배치를 전수로 만든 뒤,
//   - 미리보기(exam-font) 기본값: 선지 묶음이 칸·쪽 경계에서 쪼개지지 않는다(한 칸보다 긴 묶음만 예외).
//   - 발문 바로 뒤 선지인 문항은 발문만 칸 바닥에 남지 않는다.
//   - 지문·본문 줄은 계속 줄 단위로 흐른다(묶지 않는다).
//   - legacy(HWPX break-plan 이 쓰는 설정)는 기본 꺼짐 → 종전처럼 쪼개질 수 있다(쪽 나눔 불변).
//   - 어떤 경우에도 선지는 빠짐·중복 없이 순서대로 한 번씩 놓인다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as paperUtilsMod from "@/components/exams/paper-builder/paper-item-utils";
import * as paginationMod from "@/components/exams/paper-builder/pagination";
import * as metricsMod from "@/components/exams/paper-builder/pagination-metrics";
const paperUtils = paperUtilsMod.default ?? paperUtilsMod;
const pagination = paginationMod.default ?? paginationMod;
const metrics = metricsMod.default ?? metricsMod;
const { buildGroups, makePaperItem } = paperUtils;
const { paginateGroups } = pagination;
const { pageMetrics } = metrics;

const WORDS = "the careful reader notices how every small detail in a long argument quietly supports the larger claim that the author wants to defend".split(" ");
function words(n, seed) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(WORDS[(i * 7 + seed) % WORDS.length]);
  return out.join(" ") + ".";
}

function question(id, questionText, options) {
  return {
    id,
    type: "MULTIPLE_CHOICE",
    subType: null,
    questionText,
    structuredData: null,
    options: JSON.stringify(options.map((text, i) => ({ label: String(i + 1), text }))),
    correctAnswer: "1",
    points: 2,
    difficulty: "INTERMEDIATE",
    tags: null,
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: "2026-09-29T00:00:00.000Z",
    setId: null,
    passage: null,
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

const SHORT_OPTS = [
  "The first plausible option that wraps onto a second line in a narrow column",
  "The second plausible option",
  "The third plausible option that is long enough to wrap onto another line as well",
  "The fourth plausible option",
  "The fifth plausible option",
];
const TALL_OPTS = Array.from({ length: 5 }, (_, i) => words(260, i * 3));

// 한 배치: [본문 긴 문항(filler)] + [발문만 있는 문항(stem-only)] + [본문 있는 문항(body)] × 반복
function scenario(fillerWords, tall = false) {
  const qs = [];
  for (let k = 0; k < 6; k += 1) {
    qs.push(question("f" + k, "Read the passage and answer the question " + k + ".\\n\\n" + words(fillerWords + k * 13, k), SHORT_OPTS));
    qs.push(question("s" + k, "Which of the following best completes the idea discussed in question " + k + "?", tall && k === 2 ? TALL_OPTS : SHORT_OPTS));
    qs.push(question("b" + k, "What is the main idea of the passage below?\\n\\n" + words(90 + k * 17, k + 5), SHORT_OPTS));
  }
  const items = [];
  qs.forEach((q, i) => items.push(makePaperItem(q, i + 1, items)));
  return buildGroups(items);
}

const BASE = {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "boxed",
  showAnswerSpace: true,
  showPassageTitle: true,
  showQuestionMeta: false,
  template: "clean",
};
const EXAM_FONT = { ...BASE, textMetrics: "exam-font" };
const LEGACY_HWPX = { ...BASE, showQuestionMeta: true, multiBlankOptionLayout: "inline" };

function analyze(result, settings) {
  const where = new Map();
  const bareStem = new Set();
  const seen = new Map();
  let bodyLineSplits = 0;
  result.pages.forEach((page, p) =>
    page.forEach((col, c) =>
      col.forEach((frag) =>
        frag.parts.forEach((part) => {
          const id = part.source.localId;
          if (part.questionStartLineIndex > 0 && part.questionRenderedLines.length > 0) bodyLineSplits += 1;
          if (part.showHeader && part.options.length === 0 && part.questionRenderedLines.length === 0 && part.structRows.length === 0) {
            bareStem.add(id);
          }
          if (part.options.length === 0) return;
          if (!where.has(id)) where.set(id, new Set());
          where.get(id).add(p + ":" + c);
          if (!seen.has(id)) seen.set(id, []);
          seen.get(id).push(...part.options.map((o) => o.originalIndex));
        }),
      ),
    ),
  );
  const splitIds = [...where].filter(([, set]) => set.size > 1).map(([id]) => id);
  const orphanStems = [...where.keys()].filter((id) => bareStem.has(id));
  const optionOrderOk = [...seen.values()].every((list) => list.every((v, i) => v === i));
  return { pages: result.pages.length, splitIds, orphanStems, optionOrderOk, optionItems: where.size, bodyLineSplits };
}

const runs = [];
for (let filler = 20; filler <= 200; filler += 3) {
  const groups = scenario(filler);
  const row = { filler };
  for (const [label, settings] of [
    ["examFont", EXAM_FONT],
    ["examFontOff", { ...EXAM_FONT, keepOptionGroups: false }],
    ["legacy", LEGACY_HWPX],
    ["legacyOn", { ...LEGACY_HWPX, keepOptionGroups: true }],
  ]) {
    row[label] = analyze(paginateGroups(groups, settings), settings);
  }
  runs.push(row);
}

// 한 칸보다 긴 선지 묶음 — 예외로 쪼개져야 하고, 선지는 순서대로 한 번씩 놓여야 한다.
const tallGroups = scenario(60, true);
const tallRes = paginateGroups(tallGroups, EXAM_FONT);
const tallItem = tallGroups.flatMap((g) => g.items).find((it) => it.sourceQuestion.id === "s2");
const tallAnalysis = analyze(tallRes, EXAM_FONT);

// 칸 아래 여백(추정) — 마지막 쪽 제외 최대치. 선지 묶음(≈ 칸의 1/4)보다 크면 다른 것까지 묶고 있다는 뜻.
const cap = pageMetrics(EXAM_FONT, 1).capacity;
let maxGap = 0;
for (let filler = 20; filler <= 200; filler += 3) {
  const res = paginateGroups(scenario(filler), EXAM_FONT);
  (res.columns ?? []).slice(0, -1).forEach((info) =>
    info.used.forEach((u, i) => { if (info.blocks[i] > 0) maxGap = Math.max(maxGap, info.capacity[i] - u); }),
  );
}

process.stdout.write(JSON.stringify({
  runs,
  tall: {
    analysis: tallAnalysis,
    splitsTall: tallAnalysis.splitIds.includes(tallItem.localId),
    tallLocalId: tallItem.localId,
    overflowItems: [...tallRes.overflowItems],
  },
  capacity: cap,
  maxGap,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-paper-option-keep-harness.mts");
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

test("keep-together: the sweep really puts option groups on column boundaries (legacy splits them)", () => {
  const legacySplits = runs.reduce((n, r) => n + r.legacy.splitIds.length, 0);
  const offSplits = runs.reduce((n, r) => n + r.examFontOff.splitIds.length, 0);
  assert.ok(legacySplits > 0, "legacy(HWPX break-plan 설정)는 기본 꺼짐이라 선지가 갈리는 배치가 있어야 한다");
  assert.ok(offSplits > 0, "exam-font 에서 keepOptionGroups:false 로 끄면 종전처럼 갈리는 배치가 있어야 한다");
});

test("keep-together: preview (exam-font default) never splits an option group that fits in a column", () => {
  const bad = runs.filter((r) => r.examFont.splitIds.length > 0).map((r) => `filler=${r.filler}: ${r.examFont.splitIds.join(",")}`);
  assert.deepEqual(bad, [], "exam-font 기본값에서 선지 묶음이 칸/쪽 경계에서 쪼개졌다");
});

test("keep-together: the flag also works on legacy metrics when explicitly enabled", () => {
  const bad = runs.filter((r) => r.legacyOn.splitIds.length > 0).map((r) => r.filler);
  assert.deepEqual(bad, []);
});

test("keep-together: a stem directly followed by options is never left alone at a column bottom", () => {
  const bad = runs.filter((r) => r.examFont.orphanStems.length > 0).map((r) => `filler=${r.filler}: ${r.examFont.orphanStems.join(",")}`);
  assert.deepEqual(bad, []);
});

test("keep-together: options stay complete and ordered in every configuration", () => {
  for (const r of runs) {
    for (const key of ["examFont", "examFontOff", "legacy", "legacyOn"]) {
      assert.equal(r[key].optionOrderOk, true, `filler=${r.filler} ${key}: 선지 순서/중복 이상`);
      assert.equal(r[key].optionItems, 18, `filler=${r.filler} ${key}: 선지가 있는 문항 수`);
    }
  }
});

test("keep-together: body/passage lines keep flowing across columns (not atomized)", () => {
  const flowing = runs.filter((r) => r.examFont.bodyLineSplits > 0).length;
  assert.ok(flowing > runs.length / 2, `본문이 칸 경계에서 줄 단위로 이어지는 배치가 대부분이어야 한다(${flowing}/${runs.length})`);
});

test("keep-together: column-bottom gap stays bounded by one option group", () => {
  assert.ok(result.maxGap < result.capacity * 0.3, `칸 아래 여백 최대 ${Math.round(result.maxGap)}px (칸 ${Math.round(result.capacity)}px)`);
});

test("keep-together: an option group taller than a column still splits (exception) without losing options", () => {
  assert.equal(result.tall.splitsTall, true, "한 칸보다 긴 선지 묶음은 쪼개져야 한다");
  assert.equal(result.tall.analysis.optionOrderOk, true);
  assert.deepEqual(result.tall.overflowItems, []);
  assert.deepEqual(
    result.tall.analysis.splitIds.filter((id) => id !== result.tall.tallLocalId),
    [],
    "다른 문항의 선지는 여전히 묶여 있어야 한다",
  );
});
