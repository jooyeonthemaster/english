import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 스튜디오 라이브 투영(projectLayoutDocWithSpec) — **모든 스펙 컨트롤**이 미리보기에
// 실제로 반영되는지 강박적으로 고정한다(박스 테두리 미반영 버그 회귀 방지).
// 생성 전용 힌트(언어/길이감/밑줄대상/답형태/강조/복수정답/정답수)는 시각 투영 대상이
// 아님을 명시적으로 확인한다.

const harnessSource = `
import * as formatSpecModule from "@/lib/custom-question-types/format-spec";
import * as layoutDocModule from "@/lib/custom-question-types/layout-doc";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { parseFormatSpec } = unwrap(formatSpecModule);
const { projectLayoutDocWithSpec, composeQuestionTextFromLayoutDoc, parseLayoutDoc } = unwrap(layoutDocModule);

// 원본 구조 문서(실제 텍스트 보유) — 투영이 끌어다 쓸 소스.
const SOURCE = parseLayoutDoc({
  direction: "원본 발문입니다.",
  blocks: [
    {
      kind: "BOX",
      label: "",
      text: "Cultural competence is key to thriving in a globalized world. Language learning involves both linguistic forms and ways of thinking and behaving across many different cultures.",
      items: [],
      tableHeaders: [],
      tableRows: [],
    },
  ],
  choices: {
    markerStyle: "CIRCLED_NUM",
    layout: "VERTICAL",
    itemPattern: "TEXT",
    pairSeparator: "",
    columnHeaders: [],
    items: [
      { label: "①", text: "first option", cells: [] },
      { label: "②", text: "second option", cells: [] },
      { label: "③", text: "third option", cells: [] },
      { label: "④", text: "fourth option", cells: [] },
      { label: "⑤", text: "fifth option", cells: [] },
    ],
  },
  answerLineCount: 0,
});

// 기준 형식: 객관식 5선지 + 산문 지문(박스).
const BASE = parseFormatSpec({
  stem: { pattern: "다음 글의 내용으로 가장 적절한 것은?", language: "ko" },
  stimulus: { present: true, form: "PASSAGE", boxed: true, language: "en" },
  choices: { present: true, count: 5, markerStyle: "CIRCLED_NUM", layout: "VERTICAL", itemPattern: "TEXT" },
  answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
});

const baseDoc = projectLayoutDocWithSpec(SOURCE, BASE);

function project(overrides) {
  const fmt = parseFormatSpec({ ...JSON.parse(JSON.stringify(BASE)), ...overrides });
  return projectLayoutDocWithSpec(SOURCE, fmt);
}
function projectDeep(mutate) {
  const raw = JSON.parse(JSON.stringify(BASE));
  mutate(raw);
  return projectLayoutDocWithSpec(SOURCE, parseFormatSpec(raw));
}

function passageBlock(doc) {
  return doc.blocks.find((b) => b.kind === "TEXT" || b.kind === "BOX");
}
function blockByKind(doc, kind) {
  return doc.blocks.find((b) => b.kind === kind);
}
function countBlanks(text) {
  return (text.match(/_{3,}|□{2,}|\\(\\s{4,}\\)/g) || []).length;
}
function countUnderlines(text) {
  return (text.match(/__[^_]+__/g) || []).length;
}

const r = {};

// ── 선지 ──
r.choices_present_off = projectDeep((f) => { f.choices.present = false; }).choices;
r.choices_count = project({ choices: { ...BASE.choices, count: 4 } }).choices?.items.length;
r.choices_markerStyle = project({ choices: { ...BASE.choices, markerStyle: "PAREN_ALPHA_LOWER" } }).choices?.items[0].label;
r.choices_layout = project({ choices: { ...BASE.choices, layout: "TWO_COLUMN" } }).choices?.layout;
const pairChoices = project({ choices: { ...BASE.choices, itemPattern: "PAIR", columnHeaders: ["X", "Y"] } }).choices;
r.choices_pairCells = pairChoices?.items[0].cells.length;
const tripleChoices = projectDeep((f) => { f.choices.itemPattern = "TRIPLE"; f.choices.columnHeaders = ["X","Y","Z"]; }).choices;
r.choices_tripleCells = tripleChoices?.items[0].cells.length;
r.choices_columnHeaders = project({ choices: { ...BASE.choices, columnHeaders: ["W", "M"] } }).choices?.columnHeaders;

// ── 자료 ──
r.stim_present_off = projectDeep((f) => { f.stimulus.present = false; }).blocks.filter((b) => b.kind === "TEXT" || b.kind === "BOX").length;
r.stim_form_none = projectDeep((f) => { f.stimulus.form = "NONE"; }).blocks.filter((b) => b.kind === "TEXT" || b.kind === "BOX").length;
r.stim_boxed_on = passageBlock(baseDoc)?.kind; // BASE has boxed:true
r.stim_boxed_off = passageBlock(projectDeep((f) => { f.stimulus.boxed = false; }))?.kind;
r.stim_titleLine = passageBlock(projectDeep((f) => { f.stimulus.titleLine = true; }))?.label;
r.stim_blanks_count = countBlanks(passageBlock(projectDeep((f) => { f.stimulus.blanks.count = 3; }))?.text || "");
r.stim_blanks_paren = passageBlock(projectDeep((f) => { f.stimulus.blanks.count = 2; f.stimulus.blanks.renderStyle = "PAREN"; }))?.text.includes("(            )");
r.stim_blanks_label = passageBlock(projectDeep((f) => { f.stimulus.blanks.count = 2; f.stimulus.blanks.labelStyle = "PAREN_ALPHA_UPPER"; }))?.text.includes("(A)");
r.stim_underline_count = countUnderlines(passageBlock(projectDeep((f) => { f.stimulus.underlineMarks.count = 4; }))?.text || "");
r.stim_underline_label = passageBlock(projectDeep((f) => { f.stimulus.underlineMarks.count = 3; f.stimulus.underlineMarks.labelStyle = "CIRCLED_ALPHA_LOWER"; }))?.text.includes("ⓐ");
const paraDoc = projectDeep((f) => { f.stimulus.paragraphLabels.count = 3; f.stimulus.paragraphLabels.style = "PAREN_ALPHA_UPPER"; });
r.stim_paras_count = blockByKind(paraDoc, "LABELED_PARAS")?.items.length;
r.stim_paras_label = blockByKind(paraDoc, "LABELED_PARAS")?.items[0].label;
r.stim_numbered = passageBlock(projectDeep((f) => { f.stimulus.numberedSentences.present = true; f.stimulus.numberedSentences.style = "CIRCLED_NUM"; }))?.text.includes("①");
r.stim_bullets = passageBlock(projectDeep((f) => { f.stimulus.bulletSections.present = true; f.stimulus.bulletSections.headerCount = 2; f.stimulus.bulletSections.bulletMarker = "•"; }))?.text.includes("•");

// ── 박스 ──
const condBoxDoc = projectDeep((f) => { f.boxes = [{ kind: "CONDITIONS", label: "조건", ordered: true, itemCount: 2, columnHeaders: [], notes: "" }]; });
r.box_added = !!blockByKind(condBoxDoc, "CONDITIONS");
r.box_itemCount = blockByKind(condBoxDoc, "CONDITIONS")?.items.length;
const tableBoxDoc = projectDeep((f) => { f.boxes = [{ kind: "TABLE", label: "표", ordered: false, itemCount: 0, columnHeaders: ["A", "B"], notes: "" }]; });
r.box_tableHeaders = blockByKind(tableBoxDoc, "TABLE")?.tableHeaders;

// ── 정답/답안 ──
r.answer_subjective_noChoices = projectDeep((f) => { f.answer.shape = "SHORT_ANSWER"; f.choices.present = false; }).choices;
// 서술형이면 choices.present 가 true 라도 선지는 숨겨야 한다(생성기와 일치).
r.answer_subjective_choicesPresentButHidden = projectDeep((f) => { f.answer.shape = "SHORT_ANSWER"; }).choices;
r.answer_lineCount = projectDeep((f) => { f.answer.shape = "SHORT_ANSWER"; f.answer.subjective.answerLineCount = 5; }).answerLineCount;
const slotDoc = projectDeep((f) => { f.answer.shape = "SHORT_ANSWER"; f.answer.subjective.answerBlankCount = 2; f.answer.subjective.blankLabelStyle = "PAREN_ALPHA_UPPER"; });
r.answer_slots = blockByKind(slotDoc, "ANSWER_FORM")?.items.length;
r.answer_slotLabel = blockByKind(slotDoc, "ANSWER_FORM")?.items[0].label;
const condCountDoc = projectDeep((f) => { f.answer.shape = "SHORT_ANSWER"; f.answer.subjective.conditionsCount = 3; });
r.answer_conditions = blockByKind(condCountDoc, "CONDITIONS")?.items.length;

// ── 발문 ──
r.stem_pattern = projectDeep((f) => { f.stem.pattern = "완전히 새로운 발문!"; }).direction;
r.stem_negative = projectDeep((f) => { f.stem.pattern = "다음 중 옳은 것은?"; f.stem.negativeForm = true; }).direction.includes("부정형");
r.stem_points = projectDeep((f) => { f.stem.pointsVisible = true; f.stem.points = 3.5; }).direction.includes("[3.5점]");

// ── 생성 전용(시각 투영 X) — 미리보기가 동일해야 정상 ──
const baseStr = JSON.stringify(baseDoc);
r.genonly_language_same = JSON.stringify(projectDeep((f) => { f.choices.language = "en"; f.stimulus.language = "ko"; })) === baseStr;
r.genonly_lengthHint_same = JSON.stringify(projectDeep((f) => { f.choices.itemLengthHint = "LONG"; })) === baseStr;
r.genonly_correctCount_same = JSON.stringify(projectDeep((f) => { f.answer.correctCount = 2; f.answer.multipleAnswers = true; })) === baseStr;

// 종합: composeQuestionText 가 빈칸 변경을 반영하는지(시험지 경로 무결성).
r.compose_reflectsBlanks = composeQuestionTextFromLayoutDoc(projectDeep((f) => { f.stimulus.blanks.count = 2; })).match(/_{3,}/g)?.length ?? 0;

console.log(JSON.stringify(r));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".custom-layout-projection-harness.mts");
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

const r = runHarness();

test("선지 컨트롤이 전부 미리보기에 반영된다", () => {
  assert.equal(r.choices_present_off, null, "선지 끄면 choices null");
  assert.equal(r.choices_count, 4, "선지 수");
  assert.equal(r.choices_markerStyle, "(a)", "마커 스킴");
  assert.equal(r.choices_layout, "TWO_COLUMN", "배치");
  assert.equal(r.choices_pairCells, 2, "PAIR 2칸");
  assert.equal(r.choices_tripleCells, 3, "TRIPLE 3칸");
  assert.deepEqual(r.choices_columnHeaders, ["W", "M"], "열 헤더");
});

test("자료 컨트롤이 전부 미리보기에 반영된다", () => {
  assert.equal(r.stim_present_off, 0, "자료 끄면 지문 블록 없음");
  assert.equal(r.stim_form_none, 0, "form NONE이면 지문 블록 없음");
  assert.equal(r.stim_boxed_on, "BOX", "박스 테두리 ON → BOX");
  assert.equal(r.stim_boxed_off, "TEXT", "박스 테두리 OFF → TEXT (사용자가 발견한 버그)");
  assert.equal(r.stim_titleLine, "자료 제목", "제목 라인");
  assert.equal(r.stim_blanks_count, 3, "빈칸 3개");
  assert.equal(r.stim_blanks_paren, true, "빈칸 표기 괄호");
  assert.equal(r.stim_blanks_label, true, "빈칸 라벨");
  assert.equal(r.stim_underline_count, 4, "밑줄 4개");
  assert.equal(r.stim_underline_label, true, "밑줄 라벨 ⓐ");
  assert.equal(r.stim_paras_count, 3, "분할 단락 3개");
  assert.equal(r.stim_paras_label, "(A)", "단락 라벨");
  assert.equal(r.stim_numbered, true, "문장 앞 번호");
  assert.equal(r.stim_bullets, true, "불릿 섹션");
});

test("박스 컨트롤이 미리보기에 반영된다", () => {
  assert.equal(r.box_added, true, "박스 추가");
  assert.equal(r.box_itemCount, 2, "박스 항목 수");
  assert.deepEqual(r.box_tableHeaders, ["A", "B"], "표 헤더");
});

test("정답/답안 컨트롤이 미리보기에 반영된다", () => {
  assert.equal(r.answer_subjective_noChoices, null, "서술형이면 선지 없음");
  assert.equal(r.answer_subjective_choicesPresentButHidden, null, "서술형이면 선지있음이어도 숨김(생성기 일치)");
  assert.equal(r.answer_lineCount, 5, "답란 줄 수");
  assert.equal(r.answer_slots, 2, "답 슬롯 수");
  assert.equal(r.answer_slotLabel, "(A)", "슬롯 라벨");
  assert.equal(r.answer_conditions, 3, "조건 수");
});

test("발문 컨트롤이 미리보기에 반영된다", () => {
  assert.equal(r.stem_pattern, "완전히 새로운 발문!", "발문 패턴");
  assert.equal(r.stem_negative, true, "부정형 표시");
  assert.equal(r.stem_points, true, "배점 표시");
});

test("생성 전용 힌트는 미리보기를 바꾸지 않는다(의도된 동작)", () => {
  assert.equal(r.genonly_language_same, true, "언어는 시각 투영 대상 아님");
  assert.equal(r.genonly_lengthHint_same, true, "선지 길이감은 시각 투영 대상 아님");
  assert.equal(r.genonly_correctCount_same, true, "정답 수/복수정답은 시각 투영 대상 아님");
});

test("composeQuestionText(시험지 경로)도 빈칸 변경을 반영한다", () => {
  assert.equal(r.compose_reflectsBlanks, 2, "questionText DSL에 빈칸 2개");
});
