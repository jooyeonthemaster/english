import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 커스텀 유형 v2 계약 테스트 — 실제 내신 기출의 괴랄한 형식들을 FormatSpec/LayoutDoc 으로
// 모델링해 (1) 마커 라벨, (2) DSL 조립, (3) 스튜디오 투영, (4) 생성 검증 게이트,
// (5) spec v1→v2 하위호환을 고정한다.

const harnessSource = `
import * as formatSpecModule from "@/lib/custom-question-types/format-spec";
import * as layoutDocModule from "@/lib/custom-question-types/layout-doc";
import * as typesModule from "@/lib/custom-question-types/types";
import * as generatorStructuredModule from "@/lib/custom-question-types/generator-structured";
import * as formatSeedModule from "@/lib/custom-question-types/format-seed";

// tsx 의 CJS 인터롭에서 named export 감지가 불완전해 default 로 풀어 구조분해(레포 테스트 컨벤션).
const unwrap = (m: any) => m.default ?? m["module.exports"] ?? m;
const { markerLabel, markerLabels, parseFormatSpec } = unwrap(formatSpecModule);
const {
  composeQuestionTextFromLayoutDoc,
  flattenLayoutChoices,
  normalizeMarkerToken,
  collectAnswerMarkerTokens,
  parseLayoutDoc,
  projectLayoutDocWithSpec,
} = unwrap(layoutDocModule);
const { parseCompiledCustomType } = unwrap(typesModule);
const { validateStructuredOutput } = unwrap(generatorStructuredModule);
const { seedFormatSpecFromSpec } = unwrap(formatSeedModule);

// ── 픽스처 1: 단어-뜻 표 매칭 (지문 ⓐ~ⓔ 라벨 밑줄 + 표 선지) ──
const wordTableFormat = parseFormatSpec({
  stem: { pattern: "다음 글의 문맥상 ⓐ~ⓔ의 의미로 가장 적절한 것은?", language: "ko", negativeForm: false },
  stimulus: {
    present: true,
    form: "PASSAGE",
    boxed: true,
    underlineMarks: { count: 5, labelStyle: "CIRCLED_ALPHA_LOWER", target: "어휘/구" },
    blanks: { count: 0, labelStyle: "NONE", renderStyle: "UNDERSCORES" },
    language: "en",
  },
  choices: {
    present: true,
    count: 5,
    markerStyle: "CIRCLED_NUM",
    layout: "TABLE",
    itemPattern: "TABLE_ROW",
    columnHeaders: ["Word / Phrase", "Meaning"],
    language: "en",
  },
  answer: { shape: "MULTIPLE_CHOICE", correctCount: 1, multipleAnswers: false },
});

const wordTableOutput = {
  direction: "Which meaning best matches the underlined word in context?",
  blocks: [
    {
      kind: "BOX",
      label: "",
      text: "Consider the case of Jackie, a \\u24D0 __hypothetical__ worker profiled by writer Matthew Biggins. Compared with her \\u24D1 __entry-level__ job, driving sounds like a dream. Because so many drivers join, supply \\u24D2 __outpaces__ demand, and she pays for gas and \\u24D3 __maintenance__ of her car, driving at \\u24D4 __unsociable hours__ to earn more.",
      items: [],
      tableHeaders: [],
      tableRows: [],
    },
  ],
  choicePlan: [
    { label: "\\u2460", discriminator: "hypothetical 의 실제 문맥 의미", fitsContext: true },
    { label: "\\u2461", discriminator: "entry-level 의 오의미(최상위 직급)", fitsContext: false },
    { label: "\\u2462", discriminator: "outpaces 의 반대 의미", fitsContext: false },
    { label: "\\u2463", discriminator: "maintenance 의 유사-그럴듯 의미", fitsContext: false },
    { label: "\\u2464", discriminator: "unsociable hours 의 반대 의미", fitsContext: false },
  ],
  choices: [
    { label: "\\u2460", text: "", cells: ["\\u24D0 hypothetical", "based on situations that are imagined rather than real"] },
    { label: "\\u2461", text: "", cells: ["\\u24D1 entry-level", "at the highest rank in a company"] },
    { label: "\\u2462", text: "", cells: ["\\u24D2 outpaces", "falls behind, becomes slower than"] },
    { label: "\\u2463", text: "", cells: ["\\u24D3 maintenance", "the process of keeping something in good condition"] },
    { label: "\\u2464", text: "", cells: ["\\u24D4 unsociable hours", "hours when most people are normally working"] },
  ],
  correctAnswer: "\\u2460",
  correctAnswers: [],
  optionVerdicts: [
    { label: "\\u2460", isCorrect: true, why: "가정 인물이므로 imagined 가 문맥 의미." },
    { label: "\\u2461", isCorrect: false, why: "entry-level 은 최하위 직급." },
    { label: "\\u2462", isCorrect: false, why: "outpace 는 앞지른다는 뜻." },
    { label: "\\u2463", isCorrect: false, why: "maintenance 정의는 맞아 보이지만 발문상 오답 설계." },
    { label: "\\u2464", isCorrect: false, why: "unsociable hours 는 일반 근무 외 시간." },
  ],
  subjectiveAnswer: "",
  explanation: "문맥상 가정된 사례임을 파악해야 한다.",
  keyPoints: ["문맥 어휘 추론"],
};

const wordTableErrors = validateStructuredOutput(wordTableFormat, wordTableOutput as any);

// 변형 1: 셀 1개 누락 → TABLE_ROW 셀 수 위반
const brokenCells = JSON.parse(JSON.stringify(wordTableOutput));
brokenCells.choices[2].cells = ["\\u24D2 outpaces"];
const brokenCellErrors = validateStructuredOutput(wordTableFormat, brokenCells);

// 변형 2: 라벨 마커 스킴 위반((a) 로 보내면 CIRCLED_NUM 계약 위반이어야 — 정규화로는 통과되면 안 됨)
const brokenLabels = JSON.parse(JSON.stringify(wordTableOutput));
brokenLabels.choices = brokenLabels.choices.map((c: any, i: number) => ({ ...c, label: "(" + String.fromCharCode(97 + i) + ")" }));
brokenLabels.optionVerdicts = brokenLabels.optionVerdicts.map((v: any, i: number) => ({ ...v, label: "(" + String.fromCharCode(97 + i) + ")" }));
brokenLabels.correctAnswer = "(a)";
const brokenLabelErrors = validateStructuredOutput(wordTableFormat, brokenLabels);

// 변형 3: 정답 2개(계약 1개) → 정답 수 위반
const brokenAnswerCount = JSON.parse(JSON.stringify(wordTableOutput));
brokenAnswerCount.correctAnswers = ["\\u2460", "\\u2462"];
brokenAnswerCount.optionVerdicts[2].isCorrect = true;
const brokenAnswerErrors = validateStructuredOutput(wordTableFormat, brokenAnswerCount);

// ── 픽스처 2: (X)(Y)(Z) 3칸 연결어 조합 ──
const tripleFormat = parseFormatSpec({
  stem: { pattern: "(X), (Y), (Z)에 들어갈 말로 가장 적절한 것은?", language: "ko" },
  stimulus: {
    present: true,
    form: "PASSAGE",
    blanks: { count: 3, labelStyle: "PAREN_ALPHA_UPPER", renderStyle: "LABELED_UNDERSCORES" },
    language: "en",
  },
  choices: {
    present: true,
    count: 5,
    markerStyle: "CIRCLED_NUM",
    layout: "TABLE",
    itemPattern: "TRIPLE",
    columnHeaders: ["(X)", "(Y)", "(Z)"],
    language: "en",
  },
  answer: { shape: "MULTIPLE_CHOICE", correctCount: 1 },
});

const tripleOutput = {
  direction: "Considering the context, what are the best expressions for (X), (Y), and (Z)?",
  blocks: [
    {
      kind: "TEXT",
      label: "",
      text: "People who depend on the gig economy are less likely to be satisfied. (X) _____, they report weaker safety nets. Many still choose it. (Y) _____, the flexibility appeals to them. (Z) _____, the shift will not only cause dissatisfaction but also create less stable labor conditions.",
      items: [],
      tableHeaders: [],
      tableRows: [],
    },
  ],
  choicePlan: [
    { label: "\\u2460", discriminator: "결과-역접-부가 조합", fitsContext: false },
    { label: "\\u2461", discriminator: "결과-양보-부가 조합", fitsContext: false },
    { label: "\\u2462", discriminator: "역접-역접-대안 조합", fitsContext: false },
    { label: "\\u2463", discriminator: "역접-양보-부가 (문맥 정합)", fitsContext: true },
    { label: "\\u2464", discriminator: "역접-양보-대안 조합", fitsContext: false },
  ],
  choices: [
    { label: "\\u2460", text: "", cells: ["As a result", "Moreover", "Furthermore"] },
    { label: "\\u2461", text: "", cells: ["As a result", "Yet", "Furthermore"] },
    { label: "\\u2462", text: "", cells: ["However", "Moreover", "Otherwise"] },
    { label: "\\u2463", text: "", cells: ["However", "Yet", "Furthermore"] },
    { label: "\\u2464", text: "", cells: ["However", "Yet", "Otherwise"] },
  ],
  correctAnswer: "\\u2463",
  correctAnswers: [],
  optionVerdicts: [
    { label: "\\u2460", isCorrect: false, why: "첫 칸은 역접이어야." },
    { label: "\\u2461", isCorrect: false, why: "첫 칸은 역접이어야." },
    { label: "\\u2462", isCorrect: false, why: "둘째 칸은 양보." },
    { label: "\\u2463", isCorrect: true, why: "역접-양보-부가가 문맥 정합." },
    { label: "\\u2464", isCorrect: false, why: "셋째 칸은 부가." },
  ],
  subjectiveAnswer: "",
  explanation: "연결어 3칸 조합.",
  keyPoints: [],
};
const tripleErrors = validateStructuredOutput(tripleFormat, tripleOutput as any);

// 변형: 본문 빈칸 2개만 (계약 3개) → 빈칸 수 위반
const brokenBlanks = JSON.parse(JSON.stringify(tripleOutput));
brokenBlanks.blocks[0].text = "Only (X) _____ and (Y) _____ remain in this text.";
const brokenBlankErrors = validateStructuredOutput(tripleFormat, brokenBlanks);

// ── 픽스처 3: 서술형 — 조건 박스 + 답 슬롯 2개 ──
const essayFormat = parseFormatSpec({
  stem: { pattern: "위 글의 빈칸에 들어갈 말을 조건에 맞게 서술하시오.", language: "ko" },
  stimulus: { present: true, form: "PASSAGE", blanks: { count: 1, labelStyle: "NONE", renderStyle: "UNDERSCORES" }, language: "en" },
  boxes: [{ kind: "CONDITIONS", label: "조건", ordered: true, itemCount: 2 }],
  choices: { present: false, count: 0 },
  answer: {
    shape: "SHORT_ANSWER",
    correctCount: 1,
    subjective: { answerLineCount: 3, answerBlankCount: 2, blankLabelStyle: "PAREN_ALPHA_UPPER", answerFormat: "한 단어씩 2개", conditionsCount: 2 },
  },
});

const essayOutput = {
  direction: "위 글의 빈칸 (A), (B)에 들어갈 말을 조건에 맞게 쓰시오.",
  blocks: [
    { kind: "TEXT", label: "", text: "Learning a language _____ both effort and exposure.", items: [], tableHeaders: [], tableRows: [] },
    {
      kind: "CONDITIONS",
      label: "조건",
      text: "",
      items: [
        { label: "1.", text: "본문의 단어를 활용할 것" },
        { label: "2.", text: "각 빈칸에 한 단어만 쓸 것" },
      ],
      tableHeaders: [],
      tableRows: [],
    },
    {
      kind: "ANSWER_FORM",
      label: "",
      text: "",
      items: [
        { label: "(A)", text: "" },
        { label: "(B)", text: "" },
      ],
      tableHeaders: [],
      tableRows: [],
    },
  ],
  choicePlan: [],
  choices: [],
  correctAnswer: "",
  correctAnswers: [],
  optionVerdicts: [],
  subjectiveAnswer: "(A) requires / (B) rewards",
  explanation: "동사 형태와 문맥.",
  keyPoints: [],
};
const essayErrors = validateStructuredOutput(essayFormat, essayOutput as any);

// 변형: 조건 1개만 → 조건 수 위반
const brokenConditions = JSON.parse(JSON.stringify(essayOutput));
brokenConditions.blocks[1].items = [{ label: "1.", text: "본문의 단어를 활용할 것" }];
const brokenConditionErrors = validateStructuredOutput(essayFormat, brokenConditions);

// ── DSL 조립 검사 ──
const composedEssay = composeQuestionTextFromLayoutDoc(parseLayoutDoc({
  direction: essayOutput.direction,
  blocks: essayOutput.blocks,
  choices: null,
  answerLineCount: 3,
}));

const orderDoc = parseLayoutDoc({
  direction: "Choose the best order of (A), (B), and (C) following the given sentence.",
  blocks: [
    { kind: "GIVEN", label: "", text: "Princeton recently announced that all students would study an additional language.", items: [], tableHeaders: [], tableRows: [] },
    {
      kind: "LABELED_PARAS",
      label: "",
      text: "",
      items: [
        { label: "(A)", text: "There have been many conflicts on campuses." },
        { label: "(B)", text: "More universities should follow the lead." },
        { label: "(C)", text: "Because of this, a little more tolerance would help." },
      ],
      tableHeaders: [],
      tableRows: [],
    },
  ],
  choices: {
    markerStyle: "CIRCLED_NUM",
    layout: "VERTICAL",
    itemPattern: "SEQUENCE",
    pairSeparator: "",
    columnHeaders: [],
    items: [
      { label: "\\u2460", text: "(A)-(B)-(C)", cells: [] },
      { label: "\\u2461", text: "(B)-(A)-(C)", cells: [] },
      { label: "\\u2462", text: "(B)-(C)-(A)", cells: [] },
      { label: "\\u2463", text: "(C)-(A)-(B)", cells: [] },
      { label: "\\u2464", text: "(C)-(B)-(A)", cells: [] },
    ],
  },
  answerLineCount: 0,
});
const composedOrder = composeQuestionTextFromLayoutDoc(orderDoc);
const flattenedOrderChoices = flattenLayoutChoices(orderDoc.choices);

const tableDoc = parseLayoutDoc({
  direction: "표를 참고하여 물음에 답하시오.",
  blocks: [
    {
      kind: "TABLE",
      label: "Word / Phrase — Meaning",
      text: "",
      items: [],
      tableHeaders: ["Word / Phrase", "Meaning"],
      tableRows: [["\\u24D0 hypothetical", "imagined rather than real"], ["\\u24D1 entry-level", "lowest rank"]],
    },
  ],
  choices: null,
  answerLineCount: 0,
});
const composedTable = composeQuestionTextFromLayoutDoc(tableDoc);

// ── 스튜디오 투영 검사 ──
const projected = projectLayoutDocWithSpec(
  parseLayoutDoc({
    direction: wordTableOutput.direction,
    blocks: wordTableOutput.blocks,
    choices: {
      markerStyle: "CIRCLED_NUM",
      layout: "TABLE",
      itemPattern: "TABLE_ROW",
      pairSeparator: "",
      columnHeaders: ["Word / Phrase", "Meaning"],
      items: wordTableOutput.choices,
    },
    answerLineCount: 0,
  }),
  parseFormatSpec({
    ...wordTableFormat,
    choices: { ...wordTableFormat.choices, count: 4, markerStyle: "PAREN_ALPHA_LOWER", layout: "VERTICAL" },
  }),
);

// ── spec 하위호환 ──
const v1Spec = parseCompiledCustomType({
  specFormat: 1,
  tier: "GENERIC",
  answerShape: "MULTIPLE_CHOICE",
  optionCount: 5,
  correctAnswerCount: 1,
  prompt: "v1 prompt",
  invariants: ["기존 본질"],
});
const seeded = seedFormatSpecFromSpec(v1Spec);

console.log(JSON.stringify({
  markers: {
    circledNum3: markerLabel("CIRCLED_NUM", 2),
    parenAlphaLower0: markerLabel("PAREN_ALPHA_LOWER", 0),
    circledAlphaLower4: markerLabel("CIRCLED_ALPHA_LOWER", 4),
    koreanGanada1: markerLabel("KOREAN_GANADA", 1),
    circledKorean2: markerLabel("CIRCLED_KOREAN", 2),
    alphaUpperDot2: markerLabel("ALPHA_UPPER_DOT", 2),
    labels5: markerLabels("CIRCLED_NUM", 5),
  },
  norm: {
    circled: normalizeMarkerToken("\\u2462"),
    parenAlpha: normalizeMarkerToken("(C)."),
    circledAlpha: normalizeMarkerToken("\\u24D2"),
    answerTokens: [...collectAnswerMarkerTokens(["\\u2460, \\u2462", "(b)"])].sort(),
  },
  gates: {
    wordTableErrors,
    brokenCellErrors,
    brokenLabelErrors,
    brokenAnswerErrors,
    tripleErrors,
    brokenBlankErrors,
    essayErrors,
    brokenConditionErrors,
  },
  dsl: {
    composedEssay,
    composedOrder,
    composedTable,
    flattenedOrderChoices,
  },
  projection: {
    choiceCount: projected.choices?.items.length ?? 0,
    firstLabel: projected.choices?.items[0]?.label ?? "",
    lastText: projected.choices?.items[3]?.text ?? "",
    layout: projected.choices?.layout ?? "",
  },
  compat: {
    v1FormatIsNull: v1Spec.format === null,
    v1Prompt: v1Spec.prompt,
    seededChoiceCount: seeded.choices.count,
    seededShape: seeded.answer.shape,
  },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".custom-layout-harness.mts");
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

const result = runHarness();

test("marker label schemes produce the exact printed markers", () => {
  assert.equal(result.markers.circledNum3, "③");
  assert.equal(result.markers.parenAlphaLower0, "(a)");
  assert.equal(result.markers.circledAlphaLower4, "ⓔ");
  assert.equal(result.markers.koreanGanada1, "나.");
  assert.equal(result.markers.circledKorean2, "㉢");
  assert.equal(result.markers.alphaUpperDot2, "C.");
  assert.deepEqual(result.markers.labels5, ["①", "②", "③", "④", "⑤"]);
});

test("marker normalization absorbs decoration but keeps scheme distinctions detectable", () => {
  assert.equal(result.norm.circled, "3");
  assert.equal(result.norm.parenAlpha, "c");
  assert.equal(result.norm.circledAlpha, "c");
  assert.deepEqual(result.norm.answerTokens, ["1", "3", "b"]);
});

test("word/meaning table fixture passes the generation gate", () => {
  assert.deepEqual(result.gates.wordTableErrors, []);
});

test("structural mutations are rejected by the gate", () => {
  assert.ok(result.gates.brokenCellErrors.length > 0, "missing table cell must fail");
  assert.ok(
    result.gates.brokenCellErrors.some((e) => e.includes("cells")),
    `cell error mentions cells: ${result.gates.brokenCellErrors.join(" / ")}`,
  );
  assert.ok(result.gates.brokenAnswerErrors.length > 0, "extra correct answer must fail");
  assert.ok(
    result.gates.brokenLabelErrors.some((e) => e.includes("라벨")),
    `marker-scheme violation must fail: ${result.gates.brokenLabelErrors.join(" / ")}`,
  );
});

test("triple-connector (X)(Y)(Z) fixture passes; blank-count mutation fails", () => {
  assert.deepEqual(result.gates.tripleErrors, []);
  assert.ok(result.gates.brokenBlankErrors.some((e) => e.includes("빈칸")), "blank count gate");
});

test("subjective fixture with conditions and answer slots passes; condition-count mutation fails", () => {
  assert.deepEqual(result.gates.essayErrors, []);
  assert.ok(result.gates.brokenConditionErrors.some((e) => e.includes("조건")), "condition count gate");
});

test("composed questionText uses the exam-pipeline DSL", () => {
  // 발문이 첫 문단, 조건 박스는 [조건] 브래킷, 답란은 라벨 + 밑줄.
  assert.match(result.dsl.composedEssay, /^위 글의 빈칸 \(A\), \(B\)에/);
  assert.match(result.dsl.composedEssay, /\[조건\]\n1\. 본문의 단어를 활용할 것\n2\. 각 빈칸에 한 단어만 쓸 것/);
  assert.match(result.dsl.composedEssay, /\(A\) _{4,}/);
  // 주어진 문장 + (A)(B)(C) 단락.
  assert.match(result.dsl.composedOrder, /\[주어진 문장\] Princeton recently announced/);
  assert.match(result.dsl.composedOrder, /\(A\) There have been many conflicts/);
  assert.match(result.dsl.composedOrder, /\(C\) Because of this/);
  // 선지는 questionText 에 포함되지 않는다(options 컬럼 담당).
  assert.doesNotMatch(result.dsl.composedOrder, /\(A\)-\(B\)-\(C\)/);
  // 표는 헤더 + 행 라인.
  assert.match(result.dsl.composedTable, /Word \/ Phrase {2}\| {2}Meaning/);
  assert.match(result.dsl.composedTable, /ⓐ hypothetical {2}\| {2}imagined rather than real/);
  assert.doesNotMatch(result.dsl.composedEssay, /undefined/);
});

test("flattened choices keep stored labels and sequence text", () => {
  assert.equal(result.dsl.flattenedOrderChoices[0].label, "①");
  assert.equal(result.dsl.flattenedOrderChoices[0].text, "(A)-(B)-(C)");
});

test("studio projection retargets marker scheme and choice count deterministically", () => {
  assert.equal(result.projection.choiceCount, 4);
  assert.equal(result.projection.firstLabel, "(a)");
  assert.equal(result.projection.layout, "VERTICAL");
});

test("v1 specs parse with format=null and seed a sane default format", () => {
  assert.equal(result.compat.v1FormatIsNull, true);
  assert.equal(result.compat.v1Prompt, "v1 prompt");
  assert.equal(result.compat.seededChoiceCount, 5);
  assert.equal(result.compat.seededShape, "MULTIPLE_CHOICE");
});
