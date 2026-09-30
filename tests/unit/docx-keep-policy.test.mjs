import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// DOCX 묶음 유지(keep) 계약(26-09-30 DOCX-KEEP — HW-1·HW-2·HW-3·HW-4, docs/EXAM-PAPER-MODEL.md §9, COH-3).
// 역할 → 속성 대응은 export-docx/_lib/keep-policy.ts 머리 표가 정본이다. 여기서는 빌더 경로가 만든
// document.xml 을 최상위 문단·표 순서로 읽어 다음을 잠근다:
//   R1 본문 문단(역할 없음)은 keepNext 를 받지 않는다 — HW-1: 한컴 2024가 keepNext 문단을 통째로 옮겨
//      선지 쪼개짐·머리 줄 고아·74~82% 빈 단을 냈다
//   R2 keepNext 문단은 200자를 넘지 않는다(긴 머리는 KEEP_MAX_LINES 상한으로 역할을 잃는다)
//   R3 선지 묶음: 마지막을 뺀 모두 keepNext+keepLines, 마지막은 keepLines 만
//   R4 keepNext 가 붙은 머리 문단은 keepLines 도 있다
//   R5 caption 라벨(주어진 문장·해설·핵심 포인트·오답 분석·↓·세트 안내문)은 keepNext+keepLines
//   R6 정답 배지 표: 행 cantSplit, 뒤에 해설 라벨이 오면 셀 문단과 사이 간격 문단이 keepNext
//   R7 선지 → 배지 다리 없음(의도된 차이 — keep-policy.ts): 배지 바로 앞 간격 문단·마지막 선지에 keepNext 없음
const harnessSource = `
import JSZip from "jszip";
import { Packer } from "docx";
import * as assembleModule from "../src/app/api/exams/[examId]/export-docx/_lib/build-builder-document/assemble";
import * as keepModule from "../src/app/api/exams/[examId]/export-docx/_lib/keep-policy";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { buildExamDocxDocument } = unwrap(assembleModule);
const { docxKeep, bridgeKeep, estimateTextLines, isStandaloneLabelLine, KEEP_MAX_LINES } = unwrap(keepModule);

const longPassage =
  "Cities grow when people find new ways to share space. Early towns were built around markets, and later ones " +
  "around factories and railways. Today, many planners argue that walkable streets matter more than highways, because " +
  "they let neighbors meet and small shops survive. When a street is designed for people rather than cars, it becomes " +
  "a place where strangers turn into acquaintances and acquaintances into a _____ that supports everyone who lives there. " +
  "Research on neighborhood life shows that such everyday encounters build trust over many years.";

const options = [
  { label: "1", text: "community" },
  { label: "2", text: "highway" },
  { label: "3", text: "market" },
  { label: "4", text: "factory" },
  { label: "5", text: "railway" },
];

const explanation = {
  content: "The passage says walkable streets turn strangers into a supportive group.",
  keyPoints: JSON.stringify(["Streets designed for people", "Everyday encounters build trust"]),
  wrongOptionExplanations: JSON.stringify({ "2": "Highways are contrasted.", "3": "Markets are early towns." }),
};

function eq(id: string, subType: string, questionText: string, opts: any, extra: any = {}) {
  return {
    orderNum: 0,
    points: 2,
    question: {
      id,
      type: opts ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
      subType,
      questionText,
      structuredData: null,
      options: opts ? JSON.stringify(opts) : null,
      correctAnswer: "1",
      difficulty: "INTERMEDIATE",
      passage: null,
      explanation,
      ...extra,
    },
  };
}

const examQuestions = [
  // 선지 앞 마지막 본문 문단이 긴 지문 한 문단(HW-1 모양)
  eq("q-long", "BLANK_INFERENCE", "다음 빈칸에 들어갈 말로 가장 적절한 것은?\\n\\n" + longPassage, options),
  // 「주어진 문장」 라벨 + 내용(HW-3)
  eq("q-insert", "SENTENCE_INSERT",
    "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?\\n\\n[주어진 문장] However, the plan failed at first.\\n\\n" + longPassage,
    options),
  // 첫 줄에 지문이 통째로 붙은 저장본 — 머리가 KEEP_MAX_LINES 를 넘는다(역할을 잃어야 한다)
  eq("q-longhead", "TOPIC", "What is the passage mainly about? " + longPassage + " " + longPassage, options),
  // 라벨 표에 없는 유형 — 메타 배지는 [n점] 만(HW-4)
  eq("q-meta", "UNKNOWN", "Which word best fits the context?", options),
  // 본문 안 단독 라벨 줄 「[조건]」 — caption(HWPX 구역 라벨과 같다)
  eq("q-cond", "CONDITIONAL_WRITING", "Write one sentence in English.\\n\\n[조건]\\n(a) Use the word because.\\n(b) Use at most 12 words.", null),
];

const blocks = examQuestions.map((q, i) => ({ localId: "L" + i, blockType: "question", questionId: q.question.id }));

const settings = {
  source: "exam-paper-builder-v2",
  version: 2,
  template: "clean",
  layout: { paperSize: "A4", columns: 2, density: "comfortable", showAnswerSpace: true, showPassageTitle: true, showQuestionMeta: true },
  header: { subtitle: "Keep test", schoolName: "", className: "", studentNameLabel: "Name", instructions: "" },
  items: [],
  blocks,
};

async function xmlOf(doc: any) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
  return zip.file("word/document.xml")!.async("string");
}

async function main() {
  const docs: Record<string, string> = {};
  docs.plain = await xmlOf(buildExamDocxDocument({ title: "Keep plain", examQuestions, settings, includeAnswers: false }));
  docs.answers = await xmlOf(buildExamDocxDocument({ title: "Keep answers", examQuestions, settings, includeAnswers: true }));
  docs.nullPlain = await xmlOf(buildExamDocxDocument({ title: "Keep NULL", examQuestions, settings: null, includeAnswers: false }));
  const policy = {
    maxLines: KEEP_MAX_LINES,
    headShort: docxKeep("questionHead", { hasNext: true, lines: 2 }),
    headLast: docxKeep("questionHead", { hasNext: false, lines: 2 }),
    headLong: docxKeep("questionHead", { hasNext: true, lines: KEEP_MAX_LINES + 1 }),
    captionAtCap: docxKeep("caption", { hasNext: true, lines: KEEP_MAX_LINES }),
    optionMid: docxKeep("option", { hasNext: true, lines: 99 }),
    optionLast: docxKeep("option", { hasNext: false }),
    badgeNext: docxKeep("badge", { hasNext: true }),
    badgeLast: docxKeep("badge", { hasNext: false }),
    bridgeOn: bridgeKeep(true),
    bridgeOff: bridgeKeep(false),
    linesShort: estimateTextLines("1. Which is correct?", 20, 5169),
    linesHangul: estimateTextLines("가".repeat(60), 20, 5169),
    linesLatin: estimateTextLines("a".repeat(60), 20, 5169),
    linesHuge: estimateTextLines("a".repeat(900), 20, 5169),
    labelLines: ["[조건]", " <요약문> ", "〈보기〉", "【보기】", "[영작할 우리말] 걷기 좋은 거리", "(A) value", "[1~3] 다음 글을 읽고"].map((t) => isStandaloneLabelLine(t)),
  };
  process.stdout.write(JSON.stringify({ docs, policy }));
}

void main();
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".docx-keep-policy-harness.mts");
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

// ── document.xml 최상위 블록 읽기(docx.js 출력은 정형이다) ─────────────────────────────────────
const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function paragraphInfo(p) {
  const pPr = (p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || ["", ""])[1];
  return {
    kind: "p",
    kwn: /<w:keepNext\/>/.test(pPr),
    kl: /<w:keepLines\/>/.test(pPr),
    text: decode((p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join("")),
  };
}

/** body 의 최상위 문단·표 목록. 표는 행 cantSplit·셀 문단 정보를 담는다. */
export function topLevelBlocks(xml) {
  const body = xml.slice(xml.indexOf("<w:body>") + 8, xml.lastIndexOf("</w:body>"));
  const out = [];
  let i = 0;
  while (i < body.length) {
    if (body.startsWith("<w:tbl>", i)) {
      let depth = 0;
      let j = i;
      for (;;) {
        const open = body.indexOf("<w:tbl>", j);
        const close = body.indexOf("</w:tbl>", j);
        if (open !== -1 && open < close) {
          depth += 1;
          j = open + 7;
        } else {
          depth -= 1;
          j = close + 8;
          if (depth === 0) break;
        }
      }
      const tbl = body.slice(i, j);
      const rows = tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
      const cellParas = (tbl.match(/<w:p>[\s\S]*?<\/w:p>/g) || []).map(paragraphInfo);
      out.push({
        kind: "tbl",
        // 정답 배지 = 한 행·한 칸, 음영 F5F5F5, 「정답」으로 시작(정답표 그리드와 구별)
        badge:
          rows.length === 1 &&
          (tbl.match(/<w:tc>/g) || []).length === 1 &&
          /w:fill="F5F5F5"/.test(tbl) &&
          /^정답/.test(cellParas.map((p) => p.text).join("").trim()),
        rowsCantSplit: rows.length > 0 && rows.every((r) => /<w:cantSplit\/>/.test(r)),
        cellParas,
      });
      i = j;
    } else if (body.startsWith("<w:p>", i) || body.startsWith("<w:p ", i)) {
      const j = body.indexOf("</w:p>", i) + 6;
      out.push(paragraphInfo(body.slice(i, j)));
      i = j;
    } else {
      const next = [body.indexOf("<w:p>", i), body.indexOf("<w:p ", i), body.indexOf("<w:tbl>", i)].filter((k) => k !== -1);
      i = next.length ? Math.min(...next) : body.length;
    }
  }
  return out;
}

const CAPTIONS = new Set(["주어진 문장", "해설", "핵심 포인트", "오답 분석", "↓"]);
export function roleOf(block) {
  if (block.kind !== "p") return "table";
  const t = block.text.trim();
  if (!t) return "empty";
  // 선지 문단 = 원문자 + 공백 2칸(render: 번호 런 + "  " 런). 오답 분석 줄(「① 설명」)·지문 속 진술(「① Country…」)은 1칸 = 본문.
  if (/^[①-⑩](?: {2}|$)/.test(t)) return "option";
  if (/^\d{1,3}\.\s/.test(t)) return "questionHead";
  if (CAPTIONS.has(t) || /^\[\d+\s*[~∼～-]\s*\d+\]/.test(t)) return "caption";
  if (/^(?:\[[^[\]]{1,12}\]|<[^<>]{1,12}>|〈[^〈〉]{1,12}〉|【[^【】]{1,12}】)$/.test(t)) return "caption"; // 단독 라벨 줄
  if (t.length <= 80 && /^[A-Z0-9][A-Z0-9 '’:,.\-]*$/.test(t)) return "caption"; // 지문 제목(대문자)
  return "body";
}

/** R1~R7 위반 목록. */
export function analyzeKeeps(xml) {
  const blocks = topLevelBlocks(xml);
  const failures = [];
  const label = (b, i) => `#${i} ${roleOf(b)} ${JSON.stringify((b.text || "").slice(0, 40))}`;
  blocks.forEach((b, i) => {
    if (b.kind !== "p") return;
    const role = roleOf(b);
    if (role === "body" && b.kwn) failures.push(`R1 body keepNext ${label(b, i)}`);
    if (b.kwn && b.text.length > 200) failures.push(`R2 long keepNext (${b.text.length}ch) ${label(b, i)}`);
    if (role === "questionHead" && b.kwn && !b.kl) failures.push(`R4 head keepNext without keepLines ${label(b, i)}`);
    if (role === "caption" && !(b.kwn && b.kl)) failures.push(`R5 caption not kept ${label(b, i)}`);
  });
  // R3 선지 묶음
  for (let i = 0; i < blocks.length; ) {
    if (roleOf(blocks[i]) !== "option") {
      i += 1;
      continue;
    }
    let j = i;
    while (j < blocks.length && roleOf(blocks[j]) === "option") j += 1;
    for (let k = i; k < j; k += 1) {
      const last = k === j - 1;
      const b = blocks[k];
      if (!b.kl) failures.push(`R3 option without keepLines ${label(b, k)}`);
      if (!last && !b.kwn) failures.push(`R3 option inside bundle without keepNext ${label(b, k)}`);
      if (last && b.kwn) failures.push(`R3/R7 last option carries keepNext ${label(b, k)}`);
    }
    i = j;
  }
  // R6·R7 정답 배지
  blocks.forEach((b, i) => {
    if (b.kind !== "tbl" || !b.badge) return;
    if (!b.rowsCantSplit) failures.push(`R6 badge row splittable #${i}`);
    const gap = blocks[i + 1];
    const afterGap = blocks[i + 2];
    const explained = gap && roleOf(gap) === "empty" && afterGap && roleOf(afterGap) === "caption";
    if (explained) {
      if (!b.cellParas.every((p) => p.kwn && p.kl)) failures.push(`R6 badge cell not keepNext #${i}`);
      if (!gap.kwn) failures.push(`R6 badge gap not keepNext #${i + 1}`);
    }
    const before = blocks[i - 1];
    if (before && before.kind === "p" && roleOf(before) === "empty" && before.kwn) {
      failures.push(`R7 option→badge bridge present #${i - 1}`);
    }
  });
  return { blocks, failures };
}

const { docs, policy } = runHarness();

test("DOCX keep: builder documents satisfy R1–R7 (plain · answers · settings NULL)", () => {
  for (const [name, xml] of Object.entries(docs)) {
    const { failures, blocks } = analyzeKeeps(xml);
    assert.deepEqual(failures, [], `${name}: ${failures.join(" | ")}`);
    // 선지 목록이 있는 3문항(문장 삽입은 지문 마커 유형이라 선지 목록 없음) × 5
    assert.equal(blocks.filter((b) => roleOf(b) === "option").length, 15, `${name}: 3 bundles × 5 options`);
  }
});

test("DOCX keep: the long passage paragraph before the options carries no keepNext (HW-1)", () => {
  const blocks = topLevelBlocks(docs.plain);
  const firstOption = blocks.findIndex((b) => roleOf(b) === "option");
  const before = blocks[firstOption - 1];
  assert.equal(roleOf(before), "body");
  assert.ok(before.text.length > 400, `fixture shape: long body paragraph (${before.text.length})`);
  assert.equal(before.kwn, false);
  const head = blocks.find((b) => roleOf(b) === "questionHead" && b.text.includes("빈칸"));
  assert.ok(head && head.kwn && head.kl, "short question head keeps with its first body line");
});

test("DOCX keep: over-long head (passage glued to line 1) loses its role flags (KEEP_MAX_LINES)", () => {
  const head = topLevelBlocks(docs.plain).find((b) => roleOf(b) === "questionHead" && b.text.includes("mainly about"));
  assert.ok(head, "long head present");
  assert.ok(head.text.length > 800);
  assert.equal(head.kwn, false);
  assert.equal(head.kl, false);
});

test("DOCX keep: 「주어진 문장」 label and answer-mode labels keep with their content (HW-2·HW-3)", () => {
  const plain = topLevelBlocks(docs.plain);
  const given = plain.filter((b) => b.kind === "p" && b.text.trim() === "주어진 문장");
  assert.equal(given.length, 1);
  assert.ok(given[0].kwn && given[0].kl);
  const answers = topLevelBlocks(docs.answers);
  for (const labelText of ["해설", "핵심 포인트", "오답 분석"]) {
    const labels = answers.filter((b) => b.kind === "p" && b.text.trim() === labelText);
    assert.ok(labels.length >= 3, `${labelText} labels rendered (${labels.length})`);
    assert.ok(labels.every((b) => b.kwn && b.kl), `${labelText} keepNext+keepLines`);
  }
  const badges = answers.filter((b) => b.kind === "tbl" && b.badge);
  assert.equal(badges.length, 5, "one answer badge per question");
  assert.ok(badges.every((b) => b.rowsCantSplit && b.cellParas.every((p) => p.kwn)), "badge keeps with 해설");
  // 본문 안 단독 라벨 줄은 caption, 뒤 조건 줄은 본문
  const cond = plain.findIndex((b) => b.kind === "p" && b.text.trim() === "[조건]");
  assert.ok(cond > 0, "[조건] line rendered");
  assert.ok(plain[cond].kwn && plain[cond].kl, "[조건] keeps with its first condition");
  assert.equal(plain[cond + 1].kwn, false, "condition lines are body");
});

test("DOCX meta badge: unknown subtype prints only [n점], never the raw code (HW-4)", () => {
  const xml = docs.plain;
  assert.equal(xml.includes("UNKNOWN"), false);
  const head = topLevelBlocks(xml).find((b) => roleOf(b) === "questionHead" && b.text.includes("best fits the context"));
  assert.ok(head.text.includes("[2점]"), head.text);
  // 라벨 표에 있는 유형은 그대로 「[n점 · 라벨]」
  assert.match(xml, /\[2점 · [^\]<]+\]/);
});

test("DOCX keep-policy: role → flags table and line estimate", () => {
  assert.deepEqual(policy.headShort, { keepNext: true, keepLines: true });
  assert.deepEqual(policy.headLast, { keepLines: true });
  assert.deepEqual(policy.headLong, {});
  assert.deepEqual(policy.captionAtCap, { keepNext: true, keepLines: true });
  assert.deepEqual(policy.optionMid, { keepNext: true, keepLines: true }, "options ignore the line cap");
  assert.deepEqual(policy.optionLast, { keepLines: true });
  assert.deepEqual(policy.badgeNext, { keepNext: true, keepLines: true });
  assert.deepEqual(policy.badgeLast, { keepLines: true });
  assert.deepEqual(policy.bridgeOn, { keepNext: true });
  assert.deepEqual(policy.bridgeOff, {});
  assert.equal(policy.linesShort, 1);
  assert.ok(policy.linesHangul > policy.linesLatin, "Hangul is wider than Latin");
  assert.ok(policy.linesHuge > policy.maxLines, "a 900-char line exceeds the cap");
  assert.deepEqual(policy.labelLines, [true, true, true, true, false, false, false], "standalone label lines only");
});

test("DOCX keep analyzer: flags body keepNext, long keepNext, broken bundles, unkept captions and badge chains (self-check)", () => {
  const p = (text, { kwn = false, kl = false } = {}) =>
    `<w:p><w:pPr>${kwn ? "<w:keepNext/>" : ""}${kl ? "<w:keepLines/>" : ""}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const empty = (kwn) => `<w:p><w:pPr>${kwn ? "<w:keepNext/>" : ""}<w:spacing w:after="60"/></w:pPr></w:p>`;
  const badge = (cellKwn, cantSplit) =>
    `<w:tbl><w:tr>${cantSplit ? "<w:trPr><w:cantSplit/></w:trPr>" : ""}<w:tc><w:tcPr><w:shd w:fill="F5F5F5"/></w:tcPr>${p("정답  ①", { kwn: cellKwn, kl: true })}</w:tc></w:tr></w:tbl>`;
  const long = "x".repeat(260);
  const bad =
    "<w:body>" +
    p("1. Which is correct?", { kwn: true }) + // R4 (kl 없음)
    p(long, { kwn: true }) + // R1 + R2
    p("①  one", { kl: true }) + // R3 (묶음 안 kwn 없음)
    p("②  two", { kwn: true, kl: true }) + // R3/R7 (마지막 kwn)
    empty(true) + // R7 다리
    badge(false, false) + // R6 cantSplit·셀 kwn
    empty(false) + // R6 간격 kwn 없음
    p("해설") + // R5
    p("Because.") +
    "</w:body>";
  const kinds = new Set(analyzeKeeps(bad).failures.map((f) => f.split(" ")[0]));
  assert.deepEqual([...kinds].sort(), ["R1", "R2", "R3", "R3/R7", "R4", "R5", "R6", "R7"]);
  const good =
    "<w:body>" +
    p("1. Which is correct?", { kwn: true, kl: true }) +
    p(long) +
    p("①  one", { kwn: true, kl: true }) +
    p("②  two", { kl: true }) +
    empty(false) +
    badge(true, true) +
    empty(true) +
    p("해설", { kwn: true, kl: true }) +
    p("Because.") +
    "</w:body>";
  assert.deepEqual(analyzeKeeps(good).failures, []);
});
