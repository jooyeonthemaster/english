// Wave-2 desync 게이트 계약 테스트 — 정답 라벨/갭 단일 진실원 교차검증(IRRELEVANT·
// SENTENCE_INSERT), 네모 어법 해설 잘림, REFERENCE 형식 무결성, FILL_BLANK_KEY 프레임
// 보존, 영작 계열 verbatim 통째 복사 승격, SUMMARY_WRITING 해석 누수/발문-렌더 불일치가
// 결함 픽스처는 차단(BLOCK)하고 정상 픽스처는 통과(PASS)시키는지, 새 코드가 전부
// RELAXED_BLOCKING_QUALITY_CODES 에 등록됐는지 검증한다.
// (tsx 하니스 패턴 — tests/unit/wave1-integrity-gates.test.mjs 를 따른다.)
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { RELAXED_BLOCKING_QUALITY_CODES } = generationConstants;

const errorCodes = (issues) =>
  issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);

// ── IRRELEVANT: 해설/렌더 정답 라벨 desync ──────────────────────────────────
const irrIntro = "For ages red was the only true color in the West.";
const irrSources = [
  "Red held the highest rank among colors in early Western culture.",
  "Painters learned to produce many tones of red before any other color family.",
  "The vocabulary of early languages treated red as the default color word for painters.",
  "In several languages the words for red and beautiful share one common root.",
];
const irrIntruder =
  "This focus on producing varied colors made it hard for early painters to balance other color tones.";
const irrPassage = [irrIntro, ...irrSources].join(" ");
const irrSlots = [irrSources[0], irrSources[1], irrIntruder, irrSources[2], irrSources[3]];

function irrelevantQuestion(overrides) {
  return {
    direction: "다음 글에서 전체 흐름과 관계 없는 문장은?",
    sentences: irrSlots,
    irrelevantIndex: 2,
    correctAnswer: "③",
    options: ["①", "②", "③", "④", "⑤"].map((label) => ({ label, text: label })),
    wrongOptionExplanations: {
      "①": "원문 문장입니다.",
      "②": "원문 문장입니다.",
      "④": "원문 문장입니다.",
      "⑤": "원문 문장입니다.",
    },
    explanation:
      "이 글은 빨간색의 위상을 설명합니다. 무관한 문장인 ③번 문장(" +
      irrIntruder +
      ")은 색 혼합 기술이라는 다른 주제로 흐름을 깹니다.",
    keyPoints: ["흐름 파악"],
    tags: ["무관한 문장"],
    difficulty: "INTERMEDIATE",
    ...overrides,
  };
}

const irrRun = (overrides) =>
  errorCodes(validateQuestionQuality({
    typeId: "IRRELEVANT",
    question: irrelevantQuestion(overrides),
    passage: irrPassage,
    requestedDifficulty: "INTERMEDIATE",
  }));

const irrPass = irrRun({});
// 해설이 무관 문장을 ②라고 주장 + 삽입문 인용도 ② 밑에 (실측 runIndex 29 형태).
const irrProseBlock = irrRun({
  explanation:
    "이 글은 빨간색의 위상을 설명합니다. 무관한 문장인 ②번 문장(" +
    irrIntruder +
    ")은 색 혼합 기술이라는 다른 주제로 흐름을 깹니다.",
});
// 렌더된 지문에서 정답 마커(③)가 삽입문이 아닌 원문 문장을 감쌈.
const irrRenderBlock = irrRun({
  passageWithNumbers:
    irrIntro +
    " ① __" + irrSources[0] + "__ ② __" + irrIntruder + "__ ③ __" + irrSources[1] +
    "__ ④ __" + irrSources[2] + "__ ⑤ __" + irrSources[3] + "__",
});
// 오답 해설 맵이 정답 라벨(③)을 포함.
const irrWrongMapBlock = irrRun({
  wrongOptionExplanations: {
    "①": "원문 문장입니다.",
    "②": "원문 문장입니다.",
    "③": "원문 문장입니다.",
    "⑤": "원문 문장입니다.",
  },
});

// ── SENTENCE_INSERT: 정답 갭 desync ─────────────────────────────────────────
const siS0 = "The market opened before sunrise in the old town.";
const siS1 = "Merchants arranged their goods in careful rows along the square.";
const siGiven = "However, the fish sellers claimed the busiest corner for themselves.";
const siS3 = "Their stalls drew the largest crowds of the whole morning.";
const siS4 = "By noon most of the goods were already gone from the tables.";
const siS5 = "The last visitors left the square as the evening bells rang.";
const siPassage = [siS0, siS1, siGiven, siS3, siS4, siS5].join(" ");
const siMarked =
  siS0 + " ① " + siS1 + " ② " + siS3 + " ③ " + siS4 + " ④ " + siS5 + " ⑤";

function sentenceInsertQuestion(overrides) {
  return {
    direction: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
    givenSentence: siGiven,
    sourceSentenceToOmit: siGiven,
    omittedSourceSentence: siGiven,
    markerAfterSentenceIndices: [0, 1, 3, 4, 5],
    passageWithMarkers: siMarked,
    correctAnswer: "②",
    options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: ["①","②","③","④","⑤"][n-1] })),
    explanation: "주어진 문장은 ②에 들어가는 것이 가장 적절합니다.",
    wrongOptionExplanations: {
      "1": "흐름이 끊깁니다.",
      "3": "지시 관계가 어긋납니다.",
      "4": "예시 사이가 끊깁니다.",
      "5": "결론과 어긋납니다.",
    },
    keyPoints: ["연결사 However"],
    tags: ["문장 삽입"],
    difficulty: "INTERMEDIATE",
    ...overrides,
  };
}

const siRun = (overrides) =>
  errorCodes(validateQuestionQuality({
    typeId: "SENTENCE_INSERT",
    question: sentenceInsertQuestion(overrides),
    passage: siPassage,
    requestedDifficulty: "INTERMEDIATE",
  }));

const siPass = siRun({});
// 재구성은 ②에서만 원문 복원되는데 correctAnswer 가 ④ (mis-key).
const siMiskeyBlock = siRun({ correctAnswer: "④" });
// correctAnswer(②)는 옳지만 해설이 ④를 주장 + 오답해설이 ②(정답)를 포함 (실측 runIndex 12 형태).
const siProseBlock = siRun({
  explanation: "주어진 문장은 흐름상 ④에 들어가는 것이 가장 적절합니다.",
  wrongOptionExplanations: {
    "1": "흐름이 끊깁니다.",
    "2": "지시 관계가 어긋납니다.",
    "3": "예시 사이가 끊깁니다.",
    "5": "결론과 어긋납니다.",
  },
});

// ── GRAMMAR_CHOICE_COMBO: 해설 잘림 ────────────────────────────────────────
const comboSlots = [
  { label: "(A)", correctExpression: "outpaces", wrongExpression: "outpace", surroundingText: "The new startup outpaces its older rivals in every market segment" },
  { label: "(B)", correctExpression: "which", wrongExpression: "what", surroundingText: "the platform which connects strangers has grown quickly" },
  { label: "(C)", correctExpression: "is", wrongExpression: "are", surroundingText: "the disease that spreads fastest is often the least studied" },
];
const comboRun = (explanation) =>
  errorCodes(validateQuestionQuality({
    typeId: "GRAMMAR_CHOICE_COMBO",
    question: {
      direction: "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
      slots: comboSlots,
      explanation,
      keyPoints: ["어법"],
      tags: ["어법"],
      difficulty: "INTERMEDIATE",
    },
    requestedDifficulty: "INTERMEDIATE",
  }));

const comboTruncBlock = comboRun(
  "(A) 주어와 수일치하는 outpaces 가 옳습니다. (B) 관계대명사 which 가 옳습니다. (C) ",
);
const comboTruncPass = comboRun(
  "(A) 주어와 수일치하는 outpaces 가 옳습니다. (B) 관계대명사 which 가 옳습니다. (C) 단수 주어와 수일치하는 is 가 옳습니다.",
);

// ── REFERENCE: 형식 무결성 ─────────────────────────────────────────────────
const refPassage =
  "Not that __they__ did not exist, but they had to wait a long time before they were considered colors.";
function referenceQuestion(overrides) {
  return {
    direction: "밑줄 친 'they'가 가리키는 것으로 가장 적절한 것은?",
    underlinedPronoun: "they",
    surroundingText: "Not that they did not exist, but they had to wait",
    passageWithUnderline: refPassage,
    options: [
      { label: "①", text: "인류의 첫 실험들" },
      { label: "②", text: "물질문화의 규범들" },
      { label: "③", text: "고대 서양인들" },
      { label: "④", text: "빨간색 이외의 다른 색들" },
      { label: "⑤", text: "언어 속 색채 용어들" },
    ],
    correctAnswer: "④",
    explanation: "앞 문장의 다른 색들을 가리킵니다.",
    wrongOptionExplanations: { "①": "아님", "②": "아님", "③": "아님", "⑤": "아님" },
    keyPoints: ["지칭"],
    tags: ["지칭추론"],
    difficulty: "INTERMEDIATE",
    ...overrides,
  };
}
const refRun = (overrides) =>
  errorCodes(validateQuestionQuality({
    typeId: "REFERENCE",
    question: referenceQuestion(overrides),
    passage: refPassage.replaceAll("__", ""),
    requestedDifficulty: "INTERMEDIATE",
  }));

const refPass = refRun({});
// 선지 라벨에 마크업 오염 (실측 runIndex 23 형태).
const refMarkupBlock = refRun({
  options: [
    { label: "①", text: "인류의 첫 실험들" },
    { label: "②", text: "물질문화의 규범들" },
    { label: "<b>③</b>", text: "고대 서양인들" },
    { label: "④", text: "빨간색 이외의 다른 색들" },
    { label: "⑤", text: "언어 속 색채 용어들" },
  ],
});
// odd-one-out 발문인데 지문 밑줄은 1개 (실측 runIndex 24 형태).
const refOddOneOutBlock = refRun({
  direction: "밑줄 친 'they'가 가리키는 대상이 나머지 넷과 다른 것은?",
});

// ── FILL_BLANK_KEY: 프레임 보존 ────────────────────────────────────────────
const fbkPassage =
  "Not that they did not exist, but they had to wait a long time before they were considered colors and then played a comparable role. It was with red that humans did their first color experiments.";
const fbkRun = (sentenceWithBlank, answer) =>
  errorCodes(validateQuestionQuality({
    typeId: "FILL_BLANK_KEY",
    question: {
      direction: "다음 빈칸에 들어갈 알맞은 말을 본문에서 찾아 쓰시오.",
      sentenceWithBlank,
      answer,
      correctAnswer: answer,
      explanation: "테스트",
      keyPoints: ["핵심 표현"],
      tags: ["빈칸"],
      difficulty: "INTERMEDIATE",
    },
    passage: fbkPassage,
    requestedDifficulty: "INTERMEDIATE",
  }));

// 빈칸 복원문이 원문에 없음(어형 변형 + 문장 잘림 — 실측 runIndex 41 형태).
const fbkFrameBlock = fbkRun(
  "Not that they did not exist, but they had to wait a long time before they _____.",
  "to be considered colors",
);
// 정답 스팬만 빈칸으로 바꾼 verbatim 프레임 → 통과.
const fbkFramePass = fbkRun(
  "Not that they did not exist, but they had to wait a long time before they _____ and then played a comparable role.",
  "were considered colors",
);

// ── 영작 계열: 통째 verbatim 복사 승격 ─────────────────────────────────────
const cwPassage = fbkPassage;
const cwRun = (modelAnswer) =>
  errorCodes(validateQuestionQuality({
    typeId: "CONDITIONAL_WRITING",
    question: {
      direction: "다음 우리말을 주어진 조건에 맞게 영작하시오.",
      referenceSentence: "그것들은 색으로 여겨지기까지 오랜 시간을 기다려야 했다.",
      conditions: ["'before'를 사용할 것"],
      modelAnswer,
      correctAnswer: modelAnswer,
      explanation: "테스트",
      keyPoints: ["영작"],
      tags: ["조건부 영작"],
      difficulty: "INTERMEDIATE",
    },
    passage: cwPassage,
    requestedDifficulty: "INTERMEDIATE",
  }));

// 지문 문장 통째 복사 (실측 runIndex 37/38 형태).
const cwVerbatimBlock = cwRun(
  "they had to wait a long time before they were considered colors and then played a comparable role",
);
// 패러프레이즈 정답 → 통과(부분 겹침 경고까지만).
const cwVerbatimPass = cwRun(
  "Other colors needed many years before people accepted them as true colors in daily life.",
);

const woVerbatimBlock = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    direction: "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오.",
    scrambledWords: ["and then played", "they had to wait", "a comparable role", "before they were considered colors", "a long time"],
    modelAnswer: "they had to wait a long time before they were considered colors and then played a comparable role",
    correctAnswer: "they had to wait a long time before they were considered colors and then played a comparable role",
    explanation: "테스트",
    keyPoints: ["어순"],
    tags: ["배열"],
    difficulty: "INTERMEDIATE",
  },
  passage: cwPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

// ── SUMMARY_WRITING: 해석 누수 / 발문-렌더 불일치 ─────────────────────────
function summaryWritingQuestion(overrides) {
  return {
    direction:
      "다음 글의 요약문 빈칸 (A)에 들어갈 말을 [해석]을 참고하여 [보기]에서 필요한 단어만 골라 영작하시오.",
    summaryWithBlanks: "For ages red managed to (A)",
    koreanGloss: "오랫동안 빨간색은 다른 색들에 대해 절대적인 독점을 유지했다.",
    wordBank: ["other", "hold", "monopoly", "absolute", "colors", "an", "over"],
    wordBankDistractors: [],
    wordBankPolicy: "usePartial",
    blanks: [
      {
        label: "(A)",
        answer: "hold an absolute monopoly over other colors",
        targetWordCount: 7,
      },
    ],
    modelAnswer: "For ages red managed to hold an absolute monopoly over other colors",
    explanation: "테스트",
    keyPoints: ["요약"],
    tags: ["요약문 영작"],
    difficulty: "INTERMEDIATE",
    ...overrides,
  };
}
const swRun = (overrides) =>
  errorCodes(validateQuestionQuality({
    typeId: "SUMMARY_WRITING",
    question: summaryWritingQuestion(overrides),
    requestedDifficulty: "INTERMEDIATE",
  }));

// [해석] 전문 + [보기] 칩 전부 정답(미끼 0) (실측 runIndex 45 형태).
const swGlossLeakBlock = swRun({});
// 실재 미끼 칩이 있으면 통과.
const swGlossLeakPass = swRun({
  wordBank: ["other", "hold", "monopoly", "absolute", "colors", "an", "over", "restrict"],
  wordBankDistractors: ["restrict"],
});
// 발문이 [보기]를 지시하는데 wordBank 가 비어 있음.
const swDirectionBlock = swRun({
  wordBank: [],
  wordBankDistractors: [],
  wordBankPolicy: "none",
});
// 발문 참조 상자([해석]·[보기])가 모두 렌더되면 통과.
const swDirectionPass = swGlossLeakPass;

// ── RELAXED_BLOCKING 등록 ───────────────────────────────────────────────────
const relaxedMembership = Object.fromEntries(
  [
    "irrelevant-answer-desync",
    "irrelevant-too-many-new-terms",
    "sentence-insert-answer-desync",
    "combo-explanation-truncated",
    "reference-marker-shape",
    "fbk-frame-altered",
    "cond-writing-verbatim-answer",
    "writing-answer-verbatim-copy",
    "sw-gloss-answer-leak",
    "sw-direction-wordbank-mismatch",
  ].map((code) => [code, RELAXED_BLOCKING_QUALITY_CODES.has(code)]),
);

console.log(JSON.stringify({
  irrPass, irrProseBlock, irrRenderBlock, irrWrongMapBlock,
  siPass, siMiskeyBlock, siProseBlock,
  comboTruncBlock, comboTruncPass,
  refPass, refMarkupBlock, refOddOneOutBlock,
  fbkFrameBlock, fbkFramePass,
  cwVerbatimBlock, cwVerbatimPass, woVerbatimBlock,
  swGlossLeakBlock, swGlossLeakPass, swDirectionBlock, swDirectionPass,
  relaxedMembership,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave2-desync-gates-harness.mts");
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

test("IRRELEVANT desync: consistent prose/labels pass", () => {
  assert.ok(!result.irrPass.includes("irrelevant-answer-desync"), JSON.stringify(result.irrPass));
});

test("IRRELEVANT desync: explanation asserting a different circled intruder blocks", () => {
  assert.ok(result.irrProseBlock.includes("irrelevant-answer-desync"), JSON.stringify(result.irrProseBlock));
});

test("IRRELEVANT desync: rendered answer marker wrapping the wrong sentence blocks", () => {
  assert.ok(result.irrRenderBlock.includes("irrelevant-answer-desync"), JSON.stringify(result.irrRenderBlock));
});

test("IRRELEVANT desync: wrongOptionExplanations covering the answer label blocks", () => {
  assert.ok(result.irrWrongMapBlock.includes("irrelevant-answer-desync"), JSON.stringify(result.irrWrongMapBlock));
});

test("SENTENCE_INSERT desync: consistent key/prose passes", () => {
  assert.ok(!result.siPass.includes("sentence-insert-answer-desync"), JSON.stringify(result.siPass));
});

test("SENTENCE_INSERT desync: keyed gap that fails source reconstruction blocks", () => {
  assert.ok(result.siMiskeyBlock.includes("sentence-insert-answer-desync"), JSON.stringify(result.siMiskeyBlock));
});

test("SENTENCE_INSERT desync: prose asserting another gap / wrong-map covering the answer blocks", () => {
  assert.ok(result.siProseBlock.includes("sentence-insert-answer-desync"), JSON.stringify(result.siProseBlock));
});

test("GRAMMAR_CHOICE_COMBO: explanation ending with an empty slot label blocks", () => {
  assert.ok(result.comboTruncBlock.includes("combo-explanation-truncated"), JSON.stringify(result.comboTruncBlock));
});

test("GRAMMAR_CHOICE_COMBO: fully explained slots pass", () => {
  assert.ok(!result.comboTruncPass.includes("combo-explanation-truncated"), JSON.stringify(result.comboTruncPass));
});

test("REFERENCE: clean single-pronoun format passes", () => {
  assert.ok(!result.refPass.includes("reference-marker-shape"), JSON.stringify(result.refPass));
});

test("REFERENCE: markup-polluted option label blocks", () => {
  assert.ok(result.refMarkupBlock.includes("reference-marker-shape"), JSON.stringify(result.refMarkupBlock));
});

test("REFERENCE: odd-one-out direction with a single underline blocks", () => {
  assert.ok(result.refOddOneOutBlock.includes("reference-marker-shape"), JSON.stringify(result.refOddOneOutBlock));
});

test("FILL_BLANK_KEY: altered restore frame blocks", () => {
  assert.ok(result.fbkFrameBlock.includes("fbk-frame-altered"), JSON.stringify(result.fbkFrameBlock));
});

test("FILL_BLANK_KEY: verbatim frame passes", () => {
  assert.ok(!result.fbkFramePass.includes("fbk-frame-altered"), JSON.stringify(result.fbkFramePass));
});

test("CONDITIONAL_WRITING: near-full verbatim copy of a passage sentence blocks", () => {
  assert.ok(result.cwVerbatimBlock.includes("cond-writing-verbatim-answer"), JSON.stringify(result.cwVerbatimBlock));
});

test("CONDITIONAL_WRITING: paraphrased answer passes", () => {
  assert.ok(!result.cwVerbatimPass.includes("cond-writing-verbatim-answer"), JSON.stringify(result.cwVerbatimPass));
  assert.ok(!result.cwVerbatimPass.includes("writing-answer-verbatim-copy"), JSON.stringify(result.cwVerbatimPass));
});

test("WORD_ORDER: verbatim copied model answer blocks with the writing-family code", () => {
  assert.ok(result.woVerbatimBlock.includes("writing-answer-verbatim-copy"), JSON.stringify(result.woVerbatimBlock));
});

test("SUMMARY_WRITING: full gloss + all-answer word bank (no distractors) blocks", () => {
  assert.ok(result.swGlossLeakBlock.includes("sw-gloss-answer-leak"), JSON.stringify(result.swGlossLeakBlock));
});

test("SUMMARY_WRITING: real distractor chips pass the gloss-leak gate", () => {
  assert.ok(!result.swGlossLeakPass.includes("sw-gloss-answer-leak"), JSON.stringify(result.swGlossLeakPass));
});

test("SUMMARY_WRITING: direction referencing an empty [보기] blocks", () => {
  assert.ok(result.swDirectionBlock.includes("sw-direction-wordbank-mismatch"), JSON.stringify(result.swDirectionBlock));
});

test("SUMMARY_WRITING: direction with rendered [보기]/[해석] passes", () => {
  assert.ok(!result.swDirectionPass.includes("sw-direction-wordbank-mismatch"), JSON.stringify(result.swDirectionPass));
});

test("all wave-2 codes are RELAXED_BLOCKING", () => {
  for (const [code, isBlocking] of Object.entries(result.relaxedMembership)) {
    assert.equal(isBlocking, true, `${code} must be in RELAXED_BLOCKING_QUALITY_CODES`);
  }
});
