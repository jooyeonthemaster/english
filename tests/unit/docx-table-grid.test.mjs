import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// DOCX 표 그리드 계약(26-09-30 DOCX-TABLES → DOCX-CONSUMER 영구화).
//
// docx.js 는 Table 에 columnWidths 를 주지 않으면 <w:gridCol w:w="100"/>(≈1.8mm)을 박는다. Word 는
// 백분율로 다시 계산해 멀쩡해 보이지만 한컴·LibreOffice·Google Docs 는 tblGrid 를 믿어 FIXED 표가
// 한 글자 폭 기둥으로 무너진다(RCA P5/P6 — 선지 표·정답표·1쪽 머리표). 그래서:
//   G1 모든 gridCol > 100
//   G2 tblW 는 dxa 이고 sum(gridCol) 과 같다(빌더 경로에 pct/fill 표 없음)
//   G3 최상위 표: sum(gridCol) == 그 표가 속한 구역의 한 단 폭(생성 XML 의 sectPr 로 계산 —
//      floor((pgW − 좌 − 우 − 간격×(단−1)) / 단)). 중첩 표: == 부모 셀 tcW − 셀 좌우 여백
//   G4 모든 tcW 는 dxa 이고 gridSpan 을 고려한 gridCol 합과 같다
//   S  src 안에서 `new Table(` 은 export-docx/_lib/table-geometry.ts 한 곳에만 있다
// 픽스처: 빌더 v2(머리표+로고·다중 빈칸 표·세트·서술형·커스텀 블록) × 용지/단/밀도 5변형 + 정답포함,
// settings NULL 시험지(라우트가 쓰는 buildExamDocxDocument 순수 진입점), 단일 문항 호환 입력.
const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";
import * as assembleModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildBuilderExamDocument, buildExamDocxDocument } = unwrap(assembleModule);

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const passage =
  "Cities grow when people find new ways to share space. Early towns were built around markets, " +
  "and later ones around factories and railways. Today, many planners argue that walkable streets " +
  "matter more than highways, because they let neighbors meet and small shops survive.";

function eq(id: string, subType: string, questionText: string, options: any, correctAnswer: string, extra: any = {}) {
  return {
    orderNum: 0,
    points: 2,
    question: {
      id,
      type: options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
      subType,
      questionText,
      structuredData: null,
      options: options ? JSON.stringify(options) : null,
      correctAnswer,
      difficulty: "INTERMEDIATE",
      passage: { title: "Walkable Cities", content: passage },
      explanation: { content: "Explanation text.", keyPoints: null, wrongOptionExplanations: null },
      ...extra,
    },
  };
}

const multiBlank = [
  { label: "1", text: "shared …… markets" },
  { label: "2", text: "private …… highways" },
  { label: "3", text: "shared …… railways" },
  { label: "4", text: "empty …… factories" },
  { label: "5", text: "crowded …… shops" },
];
const titleOptions = [
  { label: "1", text: "Why Streets Matter" },
  { label: "2", text: "The End of Markets" },
  { label: "3", text: "Railways Forever" },
  { label: "4", text: "Highways First" },
  { label: "5", text: "Factories and Towns" },
];

const examQuestions = [
  eq("q-blank", "BLANK_INFERENCE",
    "Which pair best fills blanks (A) and (B)?\\n\\nCities grow when people find (A) _____ ways to share space around (B) _____ and later factories.",
    multiBlank, "1"),
  eq("q-title", "TITLE", "Which is the best title of the passage?", titleOptions, "1"),
  eq("q-cw", "CONDITIONAL_WRITING", "Translate the Korean sentence using the conditions.\\n\\n[영작할 우리말] 걷기 좋은 거리가 중요하다.", null, "Streets matter."),
  eq("q-set1", "BLANK_INFERENCE", "Which best fills the blank in the passage?", titleOptions, "2", { setId: "set-1" }),
  eq("q-set2", "TOPIC", "What is the passage mainly about?", titleOptions, "3", { setId: "set-1" }),
];

const blocks = [
  { localId: "b-sec", blockType: "section", blockTitle: "Part A" },
  { localId: "L1", blockType: "question", questionId: "q-blank" },
  { localId: "L2", blockType: "question", questionId: "q-title" },
  { localId: "b-txt", blockType: "text", blockText: "Read carefully." },
  { localId: "L3", blockType: "question", questionId: "q-cw", answerSpaceLines: 3 },
  { localId: "b-div", blockType: "divider" },
  { localId: "L4", blockType: "question", questionId: "q-set1", groupId: "set:set-1" },
  { localId: "L5", blockType: "question", questionId: "q-set2", groupId: "set:set-1" },
];

function settingsFor(layout: any) {
  return {
    source: "exam-paper-builder-v2",
    version: 2,
    template: "clean",
    layout: { showAnswerSpace: true, showPassageTitle: true, showQuestionMeta: false, ...layout },
    header: {
      subtitle: "Unit test",
      schoolName: "Test High",
      className: "2-1",
      studentNameLabel: "Name",
      instructions: "",
      academyLogoDataUrl: PNG_1PX,
    },
    items: [],
    blocks: blocks.map((b) => ({ ...b })),
  };
}

const variants: Array<[string, any, boolean]> = [
  ["a4-2col-comfortable", { paperSize: "A4", columns: 2, density: "comfortable" }, false],
  ["a4-2col-compact", { paperSize: "A4", columns: 2, density: "compact" }, false],
  ["a4-1col-comfortable", { paperSize: "A4", columns: 1, density: "comfortable" }, false],
  ["b4-2col-comfortable", { paperSize: "B4", columns: 2, density: "comfortable" }, false],
  ["b4-1col-compact", { paperSize: "B4", columns: 1, density: "compact" }, false],
  ["a4-2col-compact-answers", { paperSize: "A4", columns: 2, density: "compact" }, true],
];

async function xmlOf(doc: any) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return zip.file("word/document.xml")!.async("string");
}

async function main() {
  const out: Record<string, string> = {};
  for (const [name, layout, includeAnswers] of variants) {
    out["builder-" + name] = await xmlOf(
      buildExamDocxDocument({ title: "Grid " + name, examQuestions, settings: settingsFor(layout), includeAnswers }),
    );
  }
  out["null-settings"] = await xmlOf(
    buildExamDocxDocument({ title: "Grid NULL", examQuestions, settings: null, includeAnswers: false }),
  );
  out["null-settings-answers"] = await xmlOf(
    buildExamDocxDocument({ title: "Grid NULL", examQuestions, settings: null, includeAnswers: true }),
  );
  // 호환 입력(단일 문항 내보내기 라우트 모양 — 1단·정답표 없음)
  const single = examQuestions[0];
  out["compat-single"] = await xmlOf(
    buildBuilderExamDocument({
      title: "Grid single",
      settings: { source: "exam-paper-builder-v2", items: [], layout: { columns: 1 } },
      resolvedItems: [{ questionId: single.question.id, orderNum: 1, points: 2, questionText: single.question.questionText, includePassage: true, sourceQuestion: single.question }],
      includeAnswers: true,
      fullExamQuestions: [],
    }),
  );
  process.stdout.write(JSON.stringify(out));
}

void main();
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".docx-table-grid-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
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

// ── document.xml 표 분석(의존성 없는 태그 토크나이저 — docx.js 출력은 정형이다) ──────────────
const WORD_DEFAULT_CELL_MARGIN = 108;

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`w:${name}="([^"]*)"`));
  return m ? m[1] : null;
}

export function analyzeTables(xml) {
  const tagRe = /<(\/?)w:([A-Za-z]+)((?:\s[^>]*?)?)(\/?)>/g;
  const tables = [];
  const sections = [];
  const tblStack = [];
  const cellStack = [];
  let marginMode = null; // { kind: "tc", cell } | { kind: "tbl", table }
  let sect = null;
  let m;
  while ((m = tagRe.exec(xml))) {
    const [, closing, name, attrs, selfClosing] = m;
    const top = tblStack[tblStack.length - 1];
    const cell = cellStack[cellStack.length - 1];
    if (closing) {
      if (name === "tbl") tblStack.pop();
      else if (name === "tc") cellStack.pop();
      else if (name === "tcMar" || name === "tblCellMar") marginMode = null;
      else if (name === "sectPr" && sect) {
        sections.push(sect);
        sect = null;
      }
      continue;
    }
    switch (name) {
      case "tbl": {
        const t = {
          depth: tblStack.length,
          section: sections.length,
          parentCell: cell && cell.table === top ? cell : null,
          grid: [],
          tblW: null,
          cellMarL: null,
          cellMarR: null,
          rows: [],
        };
        tables.push(t);
        tblStack.push(t);
        break;
      }
      case "gridCol":
        if (top) top.grid.push(Number(attr(attrs, "w")));
        break;
      case "tblW":
        if (top && !(cell && cell.table === top)) top.tblW = { w: Number(attr(attrs, "w")), type: attr(attrs, "type") };
        break;
      case "tr":
        if (top) top.rows.push([]);
        break;
      case "tc": {
        const c = { table: top, w: null, type: null, span: 1, marL: null, marR: null };
        top.rows[top.rows.length - 1].push(c);
        if (!selfClosing) cellStack.push(c);
        break;
      }
      case "tcW":
        if (cell && cell.table === top) {
          cell.w = Number(attr(attrs, "w"));
          cell.type = attr(attrs, "type");
        }
        break;
      case "gridSpan":
        if (cell && cell.table === top) cell.span = Number(attr(attrs, "val")) || 1;
        break;
      case "tcMar":
        if (!selfClosing && cell && cell.table === top) marginMode = { kind: "tc", cell };
        break;
      case "tblCellMar":
        if (!selfClosing && top) marginMode = { kind: "tbl", table: top };
        break;
      case "left":
      case "start":
      case "right":
      case "end": {
        if (!marginMode) break;
        const w = attr(attrs, "w");
        if (w === null) break;
        const isLeft = name === "left" || name === "start";
        if (marginMode.kind === "tc") marginMode.cell[isLeft ? "marL" : "marR"] = Number(w);
        else marginMode.table[isLeft ? "cellMarL" : "cellMarR"] = Number(w);
        break;
      }
      case "sectPr":
        if (!selfClosing) sect = { pgW: 0, left: 0, right: 0, num: 1, space: 0 };
        break;
      case "pgSz":
        if (sect) sect.pgW = Number(attr(attrs, "w"));
        break;
      case "pgMar":
        if (sect) {
          sect.left = Number(attr(attrs, "left"));
          sect.right = Number(attr(attrs, "right"));
        }
        break;
      case "cols":
        if (sect) {
          sect.num = Number(attr(attrs, "num") ?? 1) || 1;
          sect.space = Number(attr(attrs, "space") ?? 0) || 0;
        }
        break;
      default:
        break;
    }
  }
  const columnWidth = (s) => Math.floor((s.pgW - s.left - s.right - s.space * (s.num - 1)) / s.num);
  const failures = [];
  tables.forEach((t, i) => {
    const label = `t${i}(depth${t.depth})`;
    const sum = t.grid.reduce((a, b) => a + b, 0);
    if (t.grid.length === 0 || t.grid.some((g) => !(g > 100))) failures.push(`G1 ${label} gridCol<=100 ${JSON.stringify(t.grid)}`);
    if (!t.tblW || t.tblW.type !== "dxa" || t.tblW.w !== sum) failures.push(`G2 ${label} tblW ${JSON.stringify(t.tblW)} vs sum ${sum}`);
    let container = null;
    if (t.depth === 0) {
      const s = sections[t.section];
      container = s ? columnWidth(s) : null;
    } else if (t.parentCell) {
      const p = t.parentCell;
      const marL = p.marL ?? p.table.cellMarL ?? WORD_DEFAULT_CELL_MARGIN;
      const marR = p.marR ?? p.table.cellMarR ?? WORD_DEFAULT_CELL_MARGIN;
      container = p.w - marL - marR;
    }
    if (container === null || sum !== container) failures.push(`G3 ${label} sum(grid) ${sum} != container ${container}`);
    t.rows.forEach((row, ri) => {
      let ci = 0;
      for (const c of row) {
        const expect = t.grid.slice(ci, ci + c.span).reduce((a, b) => a + b, 0);
        if (c.type !== "dxa" || c.w !== expect) failures.push(`G4 ${label} r${ri}c${ci} tcW ${c.w}/${c.type} != ${expect}`);
        ci += c.span;
      }
    });
  });
  return {
    tables: tables.length,
    nested: tables.filter((t) => t.depth > 0).length,
    grids: tables.map((t) => ({
      depth: t.depth,
      section: t.section,
      cols: t.grid.length,
      sum: t.grid.reduce((a, b) => a + b, 0),
    })),
    sections: sections.map((s) => ({ ...s, columnWidth: columnWidth(s) })),
    failures,
  };
}

function listSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function tableConstructorSites(root) {
  return listSourceFiles(path.join(root, "src"))
    .filter((file) => /\bnew\s+Table\s*\(/.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file).split(path.sep).join("/"));
}

const docs = runHarness();

test("DOCX tables: every w:tbl has sane grid (G1), dxa tblW == grid (G2), grid == section column / parent cell (G3), tcW == grid (G4)", () => {
  const summary = {};
  for (const [name, xml] of Object.entries(docs)) {
    const r = analyzeTables(xml);
    summary[name] = { tables: r.tables, nested: r.nested, cols: r.sections.map((s) => s.columnWidth) };
    assert.deepEqual(r.failures, [], `${name}: ${r.failures.join(" | ")}`);
    assert.ok(r.tables >= 3, `${name}: expected header/answer tables, got ${r.tables}`);
    assert.ok(r.nested >= 1, `${name}: expected nested header tables`);
  }
  // 변형이 실제로 서로 다른 그릇 폭을 탔는지(같은 폭이면 검사가 한 가지만 본 것이다).
  const bodyWidths = new Set(Object.values(summary).map((s) => s.cols[s.cols.length - 1]));
  assert.ok(bodyWidths.size >= 4, `expected ≥4 distinct body column widths, got ${[...bodyWidths]}`);
});

test("DOCX tables: builder fixtures cover multi-blank option table, answer key and answer-badge tables", () => {
  // 다중 빈칸 표(헤더 (A)(B) + 5행)·정답표(5열)·정답 배지(정답포함) — 폭 계약의 대상이 실제로 생성됐는지.
  const plain = docs["builder-a4-2col-comfortable"];
  assert.match(plain, /정 답 표/, "answer key present");
  assert.ok((plain.match(/<w:tbl>/g) || []).length >= 5, "header(outer + 2 nested) + multi-blank + answer key");
  const multiBlankTable = plain
    .split("<w:tbl>")
    .some((chunk) => /<w:t[^>]*>\(A\)<\/w:t>/.test(chunk) && /<w:t[^>]*>\(B\)<\/w:t>/.test(chunk));
  assert.ok(multiBlankTable, "multi-blank (A)/(B) option table present");
  const answerKeyTable = plain.split("<w:tbl>").some((chunk) => /<w:t[^>]*>문항<\/w:t>/.test(chunk));
  assert.ok(answerKeyTable, "answer key rendered as a grid table");
  const answers = docs["builder-a4-2col-compact-answers"];
  assert.doesNotMatch(answers, /정 답 표/, "answers mode has no answer key");
  assert.ok((answers.match(/<w:tbl>/g) || []).length >= 3 + 5, "answer badge table per question");
  assert.match(docs["null-settings"], /정 답 표/, "NULL exam goes through the builder document (answer key)");
});

test("DOCX tables: compact A4 answer key uses the real section column width (not the A4 comfortable estimate)", () => {
  // Wave 1 에서는 정답표 폭을 A4·comfortable 추정치(5169, fill)로 그렸다 — compact 실제 단 폭과 어긋났다.
  const r = analyzeTables(docs["builder-a4-2col-compact"]);
  const bodyIndex = r.sections.length - 1;
  const body = r.sections[bodyIndex];
  assert.equal(body.num, 2);
  assert.notEqual(body.columnWidth, 5169, "compact column differs from comfortable 5169");
  const answerKey = r.grids.find((g) => g.depth === 0 && g.cols === 5 && g.section === bodyIndex);
  assert.ok(answerKey, "5-column answer key table in the body section");
  assert.equal(answerKey.sum, body.columnWidth);
  assert.equal(r.failures.length, 0);
});

test("DOCX table analyzer: flags docx.js default grid (100), pct tblW, wrong container and tcW (self-check)", () => {
  // 검사기 자체의 음성 표본 — HEAD 의 붕괴 모양(gridCol 100 + pct)과 폭 어긋남을 반드시 잡아야 한다.
  const sect = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:right="533" w:bottom="0" w:left="533"/><w:cols w:space="501" w:num="2"/></w:sectPr></w:pPr></w:p>';
  const bad =
    '<w:body><w:tbl><w:tblPr><w:tblW w:type="pct" w:w="100%"/></w:tblPr><w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:type="pct" w:w="50%"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="90"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>' +
    sect + "</w:body>";
  const kinds = new Set(analyzeTables(bad).failures.map((f) => f.slice(0, 2)));
  assert.deepEqual([...kinds].sort(), ["G1", "G2", "G3", "G4"]);
  const good =
    '<w:body><w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="5169"/></w:tblPr><w:tblGrid><w:gridCol w:w="2585"/><w:gridCol w:w="2584"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="2585"/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="2584"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>' +
    sect + "</w:body>";
  assert.deepEqual(analyzeTables(good).failures, []);
});

test("DOCX: `new Table(` appears only in export-docx/_lib/table-geometry.ts", () => {
  assert.deepEqual(tableConstructorSites(repoRoot), [
    "src/app/api/exams/[examId]/export-docx/_lib/table-geometry.ts",
  ]);
});

test("DOCX: builder documents carry no <w:keepNext w:val=\"false\"/> (conditional spread)", () => {
  for (const [name, xml] of Object.entries(docs)) {
    assert.equal(xml.includes('<w:keepNext w:val="false"/>'), false, name);
  }
});
