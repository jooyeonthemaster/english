// T10 구조형 유형 무결성 결정형 게이트 3종 회귀 테스트.
//  (a) SENTENCE_ORDER: 조각화 seam 문장 유실/중복 차단 (V1-SENTENCE-OMISSION /
//      V1-SENTENCE-DROPPED-SEAM, campaign-20260716 P006·P007).
//  (b) SENTENCE_INSERT: 마커 문장경계 정합(문장중간 마커·인접 빈갭) 차단, 마커 spread·
//      지문끝 마커는 통과 (V1-MARKER-DESYNC / V1-MARKER-PLACEMENT-MISMATCH, P008).
//  (c) IRRELEVANT: 번호 마킹 형식 무결성(개수·번호연속·스팬↔문장) 차단, 의도된 spread
//      (비인접 번호 문장)는 통과 (FORMAT-NONCONSECUTIVE-MARKING, P004·P009).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";

const { validateQuestionQuality } = quality;

function issues(input: Record<string, unknown>) {
  return validateQuestionQuality(input as any);
}

// ─────────────────────────────────────────────────────────────────────────
// (a) SENTENCE_ORDER — 무손실 분할 게이트
// ─────────────────────────────────────────────────────────────────────────
const S = [
  "The ancient library at Alexandria once held the largest collection of scrolls in the known world.",
  "Scholars traveled from many distant lands to study the rare manuscripts kept within its quiet halls.",
  "The royal collection grew steadily as officials ordered every visiting ship to surrender its books.",
  "A devastating fire eventually destroyed countless irreplaceable texts that could never again be found.",
  "Modern historians still argue about exactly how the terrible blaze first began so very long ago.",
  "Some blame a stray accidental spark while others suspect a deliberate act of political sabotage.",
  "Whatever the real cause, the loss of that accumulated knowledge remains a tragedy for all humanity.",
  "Today only fragments and secondhand descriptions survive to hint at the treasures once stored there.",
  "Its destruction is remembered as one of the greatest cultural losses in all recorded human history.",
];
const orderOptions = [
  { label: "1", text: "(A)-(C)-(B)" },
  { label: "2", text: "(B)-(A)-(C)" },
  { label: "3", text: "(B)-(C)-(A)" },
  { label: "4", text: "(C)-(A)-(B)" },
  { label: "5", text: "(C)-(B)-(A)" },
];
const orderBase = {
  typeId: "SENTENCE_ORDER",
  requestedDifficulty: "INTERMEDIATE",
  question: {
    direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
    difficulty: "INTERMEDIATE",
    options: orderOptions,
    correctAnswer: "2",
  },
};

// 건강 1: 세 단락이 원문을 무손실·연속으로 분할.
const orderHealthy = issues({
  ...orderBase,
  passage: S.join(" "),
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: S[2] + " " + S[3] },
      { label: "(B)", text: S[4] + " " + S[5] },
      { label: "(C)", text: S[6] + " " + S[7] },
    ],
  },
});

// 건강 2: 단락 라벨을 원문 위치와 다르게 섞어도(정답 순열) 무손실이면 통과.
const orderHealthyScrambled = issues({
  ...orderBase,
  passage: S.join(" "),
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: S[6] + " " + S[7] },
      { label: "(B)", text: S[2] + " " + S[3] },
      { label: "(C)", text: S[4] + " " + S[5] },
    ],
  },
});

// 결함 1: seam 문장 유실 — 원문에 S[4] 가 있으나 어느 단락에도 없음(단락 (A)와 (B) 사이 구멍).
const orderOmission = issues({
  ...orderBase,
  passage: S.join(" "),
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: S[2] + " " + S[3] },
      { label: "(B)", text: S[5] + " " + S[6] },
      { label: "(C)", text: S[7] + " " + S[8] },
    ],
  },
});

// 결함 2: 단락 중복 — (A)와 (B)가 원문의 같은 구간을 사용(동일 텍스트).
const orderDuplication = issues({
  ...orderBase,
  passage: S.slice(0, 6).join(" "),
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: S[2] + " " + S[3] },
      { label: "(B)", text: S[2] + " " + S[3] },
      { label: "(C)", text: S[4] + " " + S[5] },
    ],
  },
});

// 대조: 원문 미제공이면 침묵(대조 불가).
const orderNoPassage = issues({
  ...orderBase,
  passage: "",
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: S[2] + " " + S[3] },
      { label: "(B)", text: S[5] + " " + S[6] },
      { label: "(C)", text: S[7] + " " + S[8] },
    ],
  },
});

// 대조: 단락이 패러프레이즈(비-verbatim)면 침묵(not-source-backed 축 담당).
const orderParaphrased = issues({
  ...orderBase,
  passage: S.join(" "),
  question: {
    ...orderBase.question,
    givenSentence: S[0] + " " + S[1],
    paragraphs: [
      { label: "(A)", text: "Completely rewritten paraphrase text that shares no verbatim run with the source passage at all here." },
      { label: "(B)", text: S[5] + " " + S[6] },
      { label: "(C)", text: S[7] + " " + S[8] },
    ],
  },
});

// ─────────────────────────────────────────────────────────────────────────
// (b) SENTENCE_INSERT — 렌더-계약 마커 게이트
// ─────────────────────────────────────────────────────────────────────────
const insertBase = {
  typeId: "SENTENCE_INSERT",
  requestedDifficulty: "INTERMEDIATE",
  sentenceInsertSlotCount: 5,
};
const insertQ = (passageWithMarkers) => ({
  direction: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
  difficulty: "INTERMEDIATE",
  givenSentence: "As a result, the whole plan quietly collapsed under its own weight.",
  correctAnswer: "3",
  passageWithMarkers,
});

// 건강 1: 마커가 매 문장 뒤(연속) + ⑤ 지문 끝.
const insertHealthyConsecutive = issues({
  ...insertBase,
  question: insertQ(
    "The storm approached the coast quickly. ① Waves crashed against the jagged rocks. ② The lighthouse keeper watched nervously. ③ Rain began to fall heavily. ④ The night grew darker still. ⑤",
  ),
});

// 건강 2: 마커 spread(마커 사이 문장 2개) — 계약상 정상.
const insertHealthySpread = issues({
  ...insertBase,
  question: insertQ(
    "The storm approached the coast quickly. ① Waves crashed against the jagged rocks. The wind howled loudly through the night. ② The lighthouse keeper watched nervously. ③ Rain began to fall heavily. ④ The night grew darker still. ⑤",
  ),
});

// 결함 1: 문장 중간 마커 — ② 이 "crashed" 뒤(문장 내부).
const insertMidSentence = issues({
  ...insertBase,
  question: insertQ(
    "The storm approached the coast quickly. ① Waves crashed ② against the jagged rocks. ③ The keeper watched nervously. ④ Rain fell heavily now. ⑤",
  ),
});

// 결함 2: 인접 빈 갭 — ① ② 사이에 문장이 없음.
const insertEmptyGap = issues({
  ...insertBase,
  question: insertQ(
    "The storm approached the coast quickly. ① ② Waves crashed against the rocks. ③ The keeper watched nervously. ④ Rain fell heavily now. ⑤",
  ),
});

// ─────────────────────────────────────────────────────────────────────────
// (c) IRRELEVANT — 번호 마킹 형식 무결성 게이트
// ─────────────────────────────────────────────────────────────────────────
const IS = [
  "Bees communicate the location of flowers through an intricate waggle dance.",
  "The angle of the dance indicates the direction relative to the position of the sun.",
  "Honey has been used by humans as a natural sweetener for many thousands of years.",
  "The duration of each waggle run encodes the distance to the discovered food source.",
  "Other workers decode this information and fly directly to the freshly discovered blossoms.",
];
const irrIntro = "A foraging bee returns to the busy hive with important news to share.";
const irrOptions = [
  { label: "①", text: "①" },
  { label: "②", text: "②" },
  { label: "③", text: "③" },
  { label: "④", text: "④" },
  { label: "⑤", text: "⑤" },
];
const irrBase = {
  typeId: "IRRELEVANT",
  requestedDifficulty: "INTERMEDIATE",
  question: {
    direction: "다음 글에서 전체 흐름과 관계 없는 문장은?",
    difficulty: "INTERMEDIATE",
    sentences: IS,
    irrelevantIndex: 2,
    correctAnswer: "3",
    options: irrOptions,
  },
};
const marked = (n, text) => n + " __" + text + "__";

// 건강 1: 번호 ①~⑤ 연속, 스팬이 sentences 와 정합.
const irrHealthyConsecutive = issues({
  ...irrBase,
  question: {
    ...irrBase.question,
    passageWithNumbers:
      irrIntro + " " + marked("①", IS[0]) + " " + marked("②", IS[1]) + " " +
      marked("③", IS[2]) + " " + marked("④", IS[3]) + " " + marked("⑤", IS[4]),
  },
});

// 건강 2: spread(번호 문장 사이 무마커 컨텍스트 문장) — 계약상 정상.
const irrHealthySpread = issues({
  ...irrBase,
  question: {
    ...irrBase.question,
    passageWithNumbers:
      irrIntro + " " + marked("①", IS[0]) +
      " A plain verbatim context sentence sits here between two marked ones. " + marked("②", IS[1]) + " " +
      marked("③", IS[2]) +
      " Another plain context sentence appears here as well. " + marked("④", IS[3]) + " " +
      marked("⑤", IS[4]),
  },
});

// 결함 1: 스팬 개수 불일치 — 4개만 렌더(⑤ 스팬 누락).
const irrCountMismatch = issues({
  ...irrBase,
  question: {
    ...irrBase.question,
    passageWithNumbers:
      irrIntro + " " + marked("①", IS[0]) + " " + marked("②", IS[1]) + " " +
      marked("③", IS[2]) + " " + marked("④", IS[3]),
  },
});

// 결함 2: 번호 비연속 — ③ 을 건너뛰고 ①②④⑤⑥.
const irrNonconsecutive = issues({
  ...irrBase,
  question: {
    ...irrBase.question,
    passageWithNumbers:
      irrIntro + " " + marked("①", IS[0]) + " " + marked("②", IS[1]) + " " +
      marked("④", IS[2]) + " " + marked("⑤", IS[3]) + " " + marked("⑥", IS[4]),
  },
});

// 결함 3: 스팬↔문장 desync — ③ 스팬이 sentences[2] 가 아닌 다른 문장을 감쌈.
const irrSpanDesync = issues({
  ...irrBase,
  question: {
    ...irrBase.question,
    passageWithNumbers:
      irrIntro + " " + marked("①", IS[0]) + " " + marked("②", IS[1]) + " " +
      marked("③", "This wrapped sentence does not correspond to the third choice at all whatsoever.") + " " +
      marked("④", IS[3]) + " " + marked("⑤", IS[4]),
  },
});

process.stdout.write(JSON.stringify({
  orderHealthy, orderHealthyScrambled, orderOmission, orderDuplication, orderNoPassage, orderParaphrased,
  insertHealthyConsecutive, insertHealthySpread, insertMidSentence, insertEmptyGap,
  irrHealthyConsecutive, irrHealthySpread, irrCountMismatch, irrNonconsecutive, irrSpanDesync,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".t10-structural-integrity-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`node node_modules/tsx/dist/cli.mjs "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const codes = (issues) => new Set(issues.map((issue) => issue.code));
const has = (issues, code) => codes(issues).has(code);
const errorFor = (issues, code) =>
  issues.find((issue) => issue.code === code && issue.severity === "error");

// ── (a) SENTENCE_ORDER ────────────────────────────────────────────────────
test("SENTENCE_ORDER blocks a dropped seam sentence (omission)", () => {
  assert.ok(
    errorFor(result.orderOmission, "sentence-order-source-sentence-omitted"),
    JSON.stringify(result.orderOmission),
  );
});

test("SENTENCE_ORDER blocks overlapping/duplicated paragraph coverage", () => {
  assert.ok(
    errorFor(result.orderDuplication, "sentence-order-source-sentence-duplicated"),
    JSON.stringify(result.orderDuplication),
  );
});

test("SENTENCE_ORDER passes a lossless split (contiguous, and label-scrambled)", () => {
  for (const [name, issues] of [
    ["orderHealthy", result.orderHealthy],
    ["orderHealthyScrambled", result.orderHealthyScrambled],
  ]) {
    assert.equal(has(issues, "sentence-order-source-sentence-omitted"), false, name + ": " + JSON.stringify(issues));
    assert.equal(has(issues, "sentence-order-source-sentence-duplicated"), false, name + ": " + JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER coverage gate stays silent without a source passage or on paraphrased chunks", () => {
  for (const [name, issues] of [
    ["orderNoPassage", result.orderNoPassage],
    ["orderParaphrased", result.orderParaphrased],
  ]) {
    assert.equal(has(issues, "sentence-order-source-sentence-omitted"), false, name + ": " + JSON.stringify(issues));
    assert.equal(has(issues, "sentence-order-source-sentence-duplicated"), false, name + ": " + JSON.stringify(issues));
  }
});

// ── (b) SENTENCE_INSERT ───────────────────────────────────────────────────
test("SENTENCE_INSERT blocks a mid-sentence marker", () => {
  assert.ok(
    errorFor(result.insertMidSentence, "sentence-insert-marker-mid-sentence"),
    JSON.stringify(result.insertMidSentence),
  );
});

test("SENTENCE_INSERT blocks an adjacent empty-gap marker pair", () => {
  assert.ok(
    errorFor(result.insertEmptyGap, "sentence-insert-marker-empty-gap"),
    JSON.stringify(result.insertEmptyGap),
  );
});

test("SENTENCE_INSERT passes consecutive markers and end marker", () => {
  assert.equal(has(result.insertHealthyConsecutive, "sentence-insert-marker-mid-sentence"), false, JSON.stringify(result.insertHealthyConsecutive));
  assert.equal(has(result.insertHealthyConsecutive, "sentence-insert-marker-empty-gap"), false, JSON.stringify(result.insertHealthyConsecutive));
});

test("SENTENCE_INSERT passes spread markers (2+ sentences between markers is contractual)", () => {
  assert.equal(has(result.insertHealthySpread, "sentence-insert-marker-mid-sentence"), false, JSON.stringify(result.insertHealthySpread));
  assert.equal(has(result.insertHealthySpread, "sentence-insert-marker-empty-gap"), false, JSON.stringify(result.insertHealthySpread));
});

// ── (c) IRRELEVANT ────────────────────────────────────────────────────────
test("IRRELEVANT blocks a numbered-span count mismatch", () => {
  assert.ok(
    errorFor(result.irrCountMismatch, "irrelevant-marking-count-mismatch"),
    JSON.stringify(result.irrCountMismatch),
  );
});

test("IRRELEVANT blocks non-consecutive numbering", () => {
  assert.ok(
    errorFor(result.irrNonconsecutive, "irrelevant-nonconsecutive-marking"),
    JSON.stringify(result.irrNonconsecutive),
  );
});

test("IRRELEVANT blocks a span/sentence marking desync", () => {
  assert.ok(
    errorFor(result.irrSpanDesync, "irrelevant-marking-sentence-desync"),
    JSON.stringify(result.irrSpanDesync),
  );
});

test("IRRELEVANT passes consecutive marking and the intended spread layout", () => {
  for (const [name, issues] of [
    ["irrHealthyConsecutive", result.irrHealthyConsecutive],
    ["irrHealthySpread", result.irrHealthySpread],
  ]) {
    assert.equal(has(issues, "irrelevant-marking-count-mismatch"), false, name + ": " + JSON.stringify(issues));
    assert.equal(has(issues, "irrelevant-nonconsecutive-marking"), false, name + ": " + JSON.stringify(issues));
    assert.equal(has(issues, "irrelevant-marking-sentence-desync"), false, name + ": " + JSON.stringify(issues));
  }
});
