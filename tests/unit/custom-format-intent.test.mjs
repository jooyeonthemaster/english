import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 형식 지시 결정 해석기(interpretFormatInstruction) — 스튜디오 AI 어시스턴트가 자연어 형식
// 명령을 LLM 없이 100% 반영하는지 강박적으로 고정한다. 사용자 신고("서술형 문제로 해줘=무반응",
// "지문에서 ⓔ 다 지워줘=업데이트됐다지만 미반영") 의 정확한 문구를 회귀 테스트로 박제한다.
// 단순히 format 필드만 보는 게 아니라, 그 format 을 실제로 투영했을 때 미리보기가 바뀌는지까지 검증.

const harnessSource = `
import * as formatSpecModule from "@/lib/custom-question-types/format-spec";
import * as intentModule from "@/lib/custom-question-types/format-intent";
import * as layoutDocModule from "@/lib/custom-question-types/layout-doc";

const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { parseFormatSpec } = unwrap(formatSpecModule);
const { interpretFormatInstruction, describeFormatDelta } = unwrap(intentModule);
const { projectLayoutDocWithSpec, parseLayoutDoc } = unwrap(layoutDocModule);

// 원본 구조 문서 — 지문에 ⓐ~ⓔ 라벨 밑줄 5개를 박아 둔다(사용자 화면 재현).
const SOURCE = parseLayoutDoc({
  direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
  blocks: [
    {
      kind: "BOX",
      label: "",
      text: "Some people consider four ⓐ __unlucky__, others value ⓑ __endurance__, many see it ⓒ __universally__, it earned a bad ⓓ __reputation__, a symbol of ⓔ __misfortune__ in old stories.",
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
      { label: "①", text: "first", cells: [] },
      { label: "②", text: "second", cells: [] },
      { label: "③", text: "third", cells: [] },
      { label: "④", text: "fourth", cells: [] },
      { label: "⑤", text: "fifth", cells: [] },
    ],
  },
  answerLineCount: 0,
});

// 기준 형식(사용자 화면): 객관식 5선지·산문 박스·밑줄 마커 5개(ⓐ~ⓔ)·빈칸 4개.
const BASE = parseFormatSpec({
  stem: { pattern: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?", language: "ko" },
  stimulus: {
    present: true, form: "PASSAGE", boxed: true, language: "en",
    underlineMarks: { count: 5, labelStyle: "CIRCLED_ALPHA_LOWER", target: "어법 요소" },
    blanks: { count: 4, labelStyle: "PAREN_ALPHA_UPPER", renderStyle: "UNDERSCORES" },
  },
  choices: { present: true, count: 5, markerStyle: "CIRCLED_NUM", layout: "VERTICAL", itemPattern: "TEXT" },
  answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
});

// 서술형 기준(객관식 전환 테스트용).
const SUBJ = parseFormatSpec({
  stem: { pattern: "윗글의 내용을 한 문장으로 요약하시오.", language: "ko" },
  stimulus: { present: true, form: "PASSAGE", boxed: true },
  choices: { present: false, count: 0 },
  answer: { shape: "SHORT_ANSWER", correctCount: 1, subjective: { answerLineCount: 3 } },
});

const interp = (text) => interpretFormatInstruction(BASE, text);
const fmt = (text) => { const i = interp(text); return i ? i.format : null; };
const proj = (text) => { const f = fmt(text); return f ? projectLayoutDocWithSpec(SOURCE, f) : null; };
const passage = (doc) => doc && doc.blocks.find((b) => b.kind === "TEXT" || b.kind === "BOX");
const blockOf = (doc, kind) => doc && doc.blocks.find((b) => b.kind === kind);
// 렌더러(renderPassageFormatted)와 동일 우선순위: 빈칸(_{3,})을 먼저 소거한 뒤 밑줄(__x__)만 센다.
// (인접 빈칸의 언더스코어가 __x__ 로 오인되는 것을 방지 — 실제 렌더는 _{3,} 를 먼저 소비한다.)
const ulCount = (t) => ((t || "").replace(/_{3,}/g, " ").match(/__[^_]+__/g) || []).length;

const r = {};

// ── 사용자 신고 #1: "서술형 문제로 해줘"(원래 무반응) + 변형들 ──
r.subj_a = fmt("서술형 문제로 해줘")?.answer.shape;
r.subj_a_choices = fmt("서술형 문제로 해줘")?.choices.present;
r.subj_b = fmt("서술형으로 바꿔줘")?.answer.shape;
r.subj_c = fmt("주관식으로 만들어줘")?.answer.shape;
r.subj_d = fmt("단답형으로")?.answer.shape;
r.subj_lines = fmt("서술형 문제로 해줘")?.answer.subjective.answerLineCount; // 0→2 자동
r.subj_proj_noChoices = proj("서술형으로 바꿔줘")?.choices; // null 이어야

// ── 사용자 신고 #2: "지문에서 ⓔ 이런 것들 다 지워줘"(업데이트됐다며 미반영) ──
r.ul_remove_count = fmt("지문에서 ⓔ 이런 것들 다 지워줘")?.stimulus.underlineMarks.count; // 0
r.ul_remove_proj = ulCount(passage(proj("지문에서 ⓔ 이런 것들 다 지워줘"))?.text); // 0
r.ul_remove_noMarkerChar = passage(proj("지문에서 ⓔ 이런 것들 다 지워줘"))?.text.includes("ⓐ"); // false
// 기준 보존(빈칸 간섭 배제 위해 blanks 0 으로 측정) — count 일치 시 원본 5개 밑줄 단어 보존.
const baseNoBlanks = parseFormatSpec(JSON.parse(JSON.stringify(BASE)));
baseNoBlanks.stimulus.blanks.count = 0;
r.ul_base_proj = ulCount(passage(projectLayoutDocWithSpec(SOURCE, baseNoBlanks))?.text); // 5
r.ul_word_alt = fmt("지문 밑줄 다 없애줘")?.stimulus.underlineMarks.count; // 0
r.ul_set_count = fmt("밑줄 3개로 해줘")?.stimulus.underlineMarks.count; // 3
// 회귀 가드: ⓔ 제거 요청이 선지 마커 스킴을 건드리면 안 된다(제거 대상 문자를 스킴으로 오인 금지).
r.ul_remove_keepsChoiceMarker = fmt("지문에서 ⓔ 이런 것들 다 지워줘")?.choices.markerStyle; // CIRCLED_NUM 유지

// ── 추천 칩 4종 ──
r.chip_marker = fmt("선지를 (a)~(e)로 바꿔줘")?.choices.markerStyle; // PAREN_ALPHA_LOWER
r.chip_marker_proj = proj("선지를 (a)~(e)로 바꿔줘")?.choices?.items[0].label; // (a)
r.chip_blank = fmt("빈칸을 2개로 줄여줘")?.stimulus.blanks.count; // 2
r.chip_cond_box = !!fmt("조건 박스를 추가해줘")?.boxes.find((b) => b.kind === "CONDITIONS");
r.chip_cond_proj = !!blockOf(proj("조건 박스를 추가해줘"), "CONDITIONS");
r.chip_subj = fmt("서술형으로 바꿔줘")?.answer.shape;

// ── 박스 테두리(이전 세션의 버그 + 자연어 경로) ──
r.box_off = fmt("지문 박스 테두리 없애줘")?.stimulus.boxed; // false
r.box_off_proj = passage(proj("지문 박스 테두리 없애줘"))?.kind; // TEXT

// ── 선지 개수/배치 ──
r.choice_count = fmt("선지 4개로 해줘")?.choices.count; // 4
r.choice_layout_table = fmt("선지를 표로 바꿔줘")?.choices.layout; // TABLE
r.choice_layout_2col = fmt("선지를 2단으로")?.choices.layout; // TWO_COLUMN

// ── 빈칸/번호/배점/부정형 ──
r.blank_zero = fmt("빈칸 없애줘")?.stimulus.blanks.count; // 0
r.numbered = fmt("문장마다 번호 매겨줘")?.stimulus.numberedSentences.present; // true
r.points = fmt("배점 3점으로 표시해줘")?.stem.points; // 3
r.points_visible = fmt("배점 3점으로 표시해줘")?.stem.pointsVisible; // true
r.points_proj = proj("배점 3점으로 표시해줘")?.direction.includes("[3점]"); // true
r.negative = fmt("틀린 것을 고르는 부정형으로")?.stem.negativeForm; // true

// ── 객관식 전환(서술형 기준) ──
const mcFrom = interpretFormatInstruction(SUBJ, "객관식으로 바꿔줘");
r.mc_shape = mcFrom?.format.answer.shape; // MULTIPLE_CHOICE
r.mc_present = mcFrom?.format.choices.present; // true
r.mc_count = mcFrom?.format.choices.count; // 0→5

// ── 복합 지시(한 문장 다중 의도) ──
const combo = fmt("선지를 (a)~(e)로 바꾸고 빈칸 2개로 줄여줘");
r.combo_marker = combo?.choices.markerStyle; // PAREN_ALPHA_LOWER
r.combo_blank = combo?.stimulus.blanks.count; // 2

// ── 내용 전용 요청은 결정 해석기가 잡지 않는다(→ LLM 폴백) ──
r.content_null_1 = interp("난이도를 더 높여줘"); // null
r.content_null_2 = interp("지문 주제를 환경 문제로 바꿔줘"); // null
r.content_null_3 = interp("오답을 더 매력적으로 만들어줘"); // null

// ── describeFormatDelta 요약 정확성 ──
r.delta_subj = describeFormatDelta(BASE, fmt("서술형으로 바꿔줘")).some((c) => c.startsWith("답형"));
r.delta_ul = describeFormatDelta(BASE, fmt("지문에서 ⓔ 다 지워줘")).some((c) => c.includes("밑줄"));
r.delta_box = describeFormatDelta(BASE, fmt("지문 박스 테두리 없애줘")).some((c) => c.includes("테두리"));

console.log(JSON.stringify(r));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".custom-format-intent-harness.mts");
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

test('사용자 신고 #1: "서술형 문제로 해줘"가 즉시 서술형으로 전환된다', () => {
  assert.equal(r.subj_a, "SHORT_ANSWER", "서술형 문제로 해줘 → SHORT_ANSWER");
  assert.equal(r.subj_a_choices, false, "선지 제거");
  assert.equal(r.subj_b, "SHORT_ANSWER", "서술형으로 바꿔줘");
  assert.equal(r.subj_c, "SHORT_ANSWER", "주관식으로 만들어줘");
  assert.equal(r.subj_d, "SHORT_ANSWER", "단답형으로");
  assert.equal(r.subj_lines, 2, "답란 자동 2줄(빈 미리보기 방지)");
  assert.equal(r.subj_proj_noChoices, null, "투영 시 선지 숨김");
});

test('사용자 신고 #2: "지문에서 ⓔ 다 지워줘"가 실제로 지문 마커를 제거한다', () => {
  assert.equal(r.ul_remove_count, 0, "밑줄 마커 수 0");
  assert.equal(r.ul_remove_proj, 0, "투영된 지문에 밑줄 0개");
  assert.equal(r.ul_remove_noMarkerChar, false, "ⓐ 라벨 문자도 사라짐");
  assert.equal(r.ul_base_proj, 5, "기준 형식은 밑줄 5개 보존(회귀 가드)");
  assert.equal(r.ul_word_alt, 0, '"지문 밑줄 다 없애줘"도 동일');
  assert.equal(r.ul_set_count, 3, '"밑줄 3개로 해줘" → 3');
  assert.equal(r.ul_remove_keepsChoiceMarker, "CIRCLED_NUM", "제거 요청이 선지 마커 스킴을 바꾸지 않음");
});

test("추천 칩 4종이 전부 결정적으로 반영된다", () => {
  assert.equal(r.chip_marker, "PAREN_ALPHA_LOWER", "선지 (a)~(e)");
  assert.equal(r.chip_marker_proj, "(a)", "투영 첫 선지 라벨 (a)");
  assert.equal(r.chip_blank, 2, "빈칸 2개");
  assert.equal(r.chip_cond_box, true, "조건 박스 추가");
  assert.equal(r.chip_cond_proj, true, "투영에 조건 블록");
  assert.equal(r.chip_subj, "SHORT_ANSWER", "서술형");
});

test("박스 테두리·선지·빈칸·번호·배점·부정형 자연어 경로", () => {
  assert.equal(r.box_off, false, "박스 테두리 OFF");
  assert.equal(r.box_off_proj, "TEXT", "투영 지문 블록 TEXT");
  assert.equal(r.choice_count, 4, "선지 4개");
  assert.equal(r.choice_layout_table, "TABLE", "선지 표 배치");
  assert.equal(r.choice_layout_2col, "TWO_COLUMN", "선지 2단");
  assert.equal(r.blank_zero, 0, "빈칸 없애기");
  assert.equal(r.numbered, true, "문장 번호");
  assert.equal(r.points, 3, "배점 3점");
  assert.equal(r.points_visible, true, "배점 표시 ON");
  assert.equal(r.points_proj, true, "투영 발문에 [3점]");
  assert.equal(r.negative, true, "부정형 발문");
});

test("서술형→객관식 전환과 복합 지시", () => {
  assert.equal(r.mc_shape, "MULTIPLE_CHOICE", "객관식 전환");
  assert.equal(r.mc_present, true, "선지 표시");
  assert.equal(r.mc_count, 5, "선지 수 0→5 기본값");
  assert.equal(r.combo_marker, "PAREN_ALPHA_LOWER", "복합: 마커");
  assert.equal(r.combo_blank, 2, "복합: 빈칸");
});

test("내용 전용 요청은 결정 해석기가 잡지 않는다(LLM 폴백)", () => {
  assert.equal(r.content_null_1, null, "난이도 요청 null");
  assert.equal(r.content_null_2, null, "지문 주제 변경 null");
  assert.equal(r.content_null_3, null, "오답 매력도 null");
});

test("describeFormatDelta 가 변경을 정확히 요약한다", () => {
  assert.equal(r.delta_subj, true, "답형 변경 요약");
  assert.equal(r.delta_ul, true, "밑줄 변경 요약");
  assert.equal(r.delta_box, true, "테두리 변경 요약");
});
