import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";

const { validateQuestionQuality } = quality;

const badSentenceOrder = {
  direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  givenSentence:
    "We are taught from an early age that sharing is caring. We tell our children to share their toys. A trouble shared is a trouble halved, the saying goes. The sharing economy certainly sounds like a good thing. Advocates claim that the sharing economy is driven by the desire to benefit society. Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents.",
  paragraphs: [
    { label: "(A)", text: "This should be good for the owner, the community, and the environment." },
    { label: "(B)", text: "And because both parties review each other, these digital platforms create a trusting environment among complete strangers." },
    { label: "(C)", text: "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business." },
  ],
  options: [
    { label: "1", text: "(A)-(C)-(B)" },
    { label: "2", text: "(B)-(A)-(C)" },
    { label: "3", text: "(B)-(C)-(A)" },
    { label: "4", text: "(C)-(A)-(B)" },
    { label: "5", text: "(C)-(B)-(A)" },
  ],
  correctAnswer: "2",
  wrongOptionExplanations: {
    "1": "(A) 뒤에 바로 (C)가 오면 긍정적 설명에서 반전으로 넘어가는 연결이 급격하다.",
    "3": "(B) 다음 (C)는 플랫폼 신뢰 설명 뒤 사업화 비판으로 바로 넘어가므로 중간 연결이 부족하다.",
    "4": "(C)를 먼저 두면 true sharing과 business의 대조가 너무 이르게 제시된다.",
    "5": "(C)-(B)는 비판 뒤 신뢰 설명으로 되돌아가 흐름이 역행한다.",
  },
  explanation: "불량 예시",
  keyPoints: ["글의 순서", "분량 균형", "주어진 글"],
  tags: ["순서"],
  difficulty: "INTERMEDIATE",
};

const goodSentenceOrder = {
  ...badSentenceOrder,
  givenSentence:
    "We are taught from an early age that sharing is caring. We tell our children to share their toys.",
  paragraphs: [
    {
      label: "(A)",
      text: "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business. This shift matters because the moral appeal of sharing can hide the fact that a company is simply charging fees for access.",
    },
    {
      label: "(B)",
      text: "Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents. This should be good for the owner, the community, and the environment.",
    },
    {
      label: "(C)",
      text: "And because both parties review each other, these digital platforms create a trusting environment among complete strangers. According to one of its earliest supporters, author Rachel Botsman, the gig economy takes advantage of idle capacity to better utilize assets.",
    },
  ],
  options: [
    { label: "1", text: "(A)-(C)-(B)" },
    { label: "2", text: "(B)-(C)-(A)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(C)-(A)-(B)" },
    { label: "5", text: "(C)-(B)-(A)" },
  ],
  correctAnswer: "2",
};

const emptyParagraphSentenceOrder = {
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === 1 ? { ...paragraph, text: " \\n\\t " } : paragraph,
  ),
};

const zeroWidthParagraphSentenceOrder = {
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === 1 ? { ...paragraph, text: "\u200B\u2060\uFEFF" } : paragraph,
  ),
};

const formatOnlyParagraphSentenceOrders = [
  "\u200E",
  "\u200F",
  "\u202A",
  "\u202E",
  "\u2061",
  "\u2063",
  "\u00AD",
  " \u200E\u202A\u2061\u00AD ",
].map((formatText) => ({
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === 1 ? { ...paragraph, text: formatText } : paragraph,
  ),
}));

const labelContaminatedSentenceOrder = {
  ...goodSentenceOrder,
  givenSentence:
    "We are taught from an early age that sharing is caring. (A) We tell our children to share their toys.",
};

const lowercaseLabelContaminatedSentenceOrder = {
  ...goodSentenceOrder,
  givenSentence:
    "We are taught from an early age that sharing is caring. (a) We tell our children to share their toys.",
};

const nonLabelParentheticalSentenceOrder = {
  ...goodSentenceOrder,
  givenSentence:
    "Vitamin A (retinol) supports normal vision. A category (ABC) code can contain the same letter without becoming a paragraph label.",
};

const paragraphBodyLabelSentenceOrders = [
  "(A) The first team stored every observation. It archived the measurements securely.",
  "[B] The second team checked the archive. Its independent readings matched.",
  "Ⓒ Both teams compared their methods. The agreement supported the conclusion.",
  "The envelope carried storage code (A) in its ordinary body prose. The archive retained that contaminated copy for later review.",
  "The ledger repeats [B] between two otherwise complete sentences. Reviewers therefore cannot reconstruct a clean source paragraph.",
  "The field note inserts Ⓒ after its opening claim. A second sentence then pads the malformed paragraph.",
].map((contaminatedText, contaminatedIndex) => ({
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === contaminatedIndex % 3 ? { ...paragraph, text: contaminatedText } : paragraph,
  ),
}));

const paragraphBodyLabelBoundarySentenceOrders = [
  'The transcript preserves the quoted token "(A)" exactly as spoken. The quotation is source content rather than a structural heading.',
  "The appendix calls this setting '(B)' in a direct quotation. The surrounding prose remains a complete source paragraph.",
  "The formula f(A) stayed constant after calibration. Its value was independently reproduced in the second trial.",
  "Vitamin A (retinol) supports ordinary vision. The category (ABC) records a longer code rather than a paragraph heading.",
  "The team adopted an (A-level) calibration standard. A parenthetical (advanced protocol) explains the ordinary modifier.",
].map((cleanText, cleanIndex) => ({
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === cleanIndex % 3 ? { ...paragraph, text: cleanText } : paragraph,
  ),
}));

const dependentFragmentSentenceOrders = [
  "Because the instrument failed during calibration",
  "While several members reviewed the new estimate",
  "Although the northern plots remained dry",
  "To compare the two migration routes",
  "Which had been omitted from the first draft",
].map((fragment) => ({
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === 0 ? { ...paragraph, text: fragment } : paragraph,
  ),
}));

const completeDependentOpenerSentenceOrders = [
  "Because the instrument failed, technicians replaced its sensor. The next reading was stable.",
  "While several members reviewed the estimate, the council paused. It reconvened after lunch.",
  "To compare the routes, researchers tagged birds at both sites. Receivers logged their arrivals.",
  "Although Dr. Patel inspected the kiln, the glaze remained pliable. Reviewers recorded the complete result.",
  "Although the notation used e.g. two labels, the main clause remained explicit. Reviewers retained the source wording.",
  "When did the cedar clock strike? Reviewers answered the independent question in the following sentence.",
  "Which option had been omitted? The editor restored the answer after checking the complete interrogative.",
  "That was the decisive result. Reviewers retained this independent demonstrative-subject sentence.",
  "To err is human. The proverb uses an infinitival phrase as the subject of a complete independent clause.",
].map((completeText) => ({
  ...goodSentenceOrder,
  paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
    index === 0 ? { ...paragraph, text: completeText } : paragraph,
  ),
}));

const punctuatedDependentPairs = [
  ["Although the kiln cooled before sunrise", "the glaze remained pliable"],
  ["Because the tide retreated beyond the outer marker", "the surveyors exposed the channel"],
  ["When the cedar clock struck the ninth chime", "the shutters opened automatically"],
  ["While the violet dye settled in the basin", "the artisan prepared fresh linen"],
  ["If the northern seal warms above ten degrees", "the hatch releases its latch"],
  ["Unless the orchard mirror is tilted westward", "the lower branches remain shaded"],
  ["Since the paper bridge dried overnight", "its folded ribs can bear the model train"],
  ["After the dune beacon flashed twice", "the caravan changed its heading"],
  ["Before the copper reservoir reaches the red mark", "the relief valve begins to hum"],
  ["Even though the archive lamp looked dim", "its ultraviolet strip revealed the erased date"],
  ["Whereas the eastern reed valve closes quickly", "the western valve releases water gradually"],
  ["As soon as the moss dial absorbed the mist", "a blue ring appeared at its edge"],
  ["Once the basalt tray stopped vibrating", "the powder formed an even layer"],
  ["Whenever the glass roots catch afternoon light", "the seedlings turn toward the wall"],
  ["Provided that both linen tags remain attached", "the parcel retains its verified history"],
  ["So that the cliff bells could be heard inland", "the keeper rotated their bronze mouths"],
];

const punctuatedDependentFragmentSentenceOrders = punctuatedDependentPairs.map(
  ([dependent]) => ({
    ...goodSentenceOrder,
    paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
      index === 0
        ? {
            ...paragraph,
            text:
              dependent +
              ". Additional observers documented the later stage in a separate field ledger.",
          }
        : paragraph,
    ),
  }),
);

const punctuatedCompleteDependentSentenceOrders = punctuatedDependentPairs.map(
  ([dependent, main]) => ({
    ...goodSentenceOrder,
    paragraphs: goodSentenceOrder.paragraphs.map((paragraph, index) =>
      index === 0
        ? {
            ...paragraph,
            text:
              dependent +
              ", " +
              main +
              ". Additional observers documented the later stage in a separate field ledger.",
          }
        : paragraph,
    ),
  }),
);

const badQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: badSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const goodQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: goodSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const emptyParagraphQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: emptyParagraphSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const zeroWidthParagraphQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: zeroWidthParagraphSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const formatOnlyParagraphQualities = formatOnlyParagraphSentenceOrders.map((question) =>
  validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }),
);

const labelContaminatedQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: labelContaminatedSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const lowercaseLabelContaminatedQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: lowercaseLabelContaminatedSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const nonLabelParentheticalQuality = validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: nonLabelParentheticalSentenceOrder,
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
});

const paragraphBodyLabelQualities = paragraphBodyLabelSentenceOrders.map((question) =>
  validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }),
);

const paragraphBodyLabelBoundaryQualities = paragraphBodyLabelBoundarySentenceOrders.map(
  (question) =>
    validateQuestionQuality({
      typeId: "SENTENCE_ORDER",
      question,
      passage: "",
      requestedDifficulty: "INTERMEDIATE",
    }),
);

const dependentFragmentQualities = dependentFragmentSentenceOrders.map((question) =>
  validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }),
);

const completeDependentOpenerQualities = completeDependentOpenerSentenceOrders.map((question) =>
  validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }),
);

const punctuatedDependentFragmentQualities = punctuatedDependentFragmentSentenceOrders.map(
  (question) =>
    validateQuestionQuality({
      typeId: "SENTENCE_ORDER",
      question,
      passage: "",
      requestedDifficulty: "INTERMEDIATE",
    }),
);

const punctuatedCompleteDependentQualities = punctuatedCompleteDependentSentenceOrders.map(
  (question) =>
    validateQuestionQuality({
      typeId: "SENTENCE_ORDER",
      question,
      passage: "",
      requestedDifficulty: "INTERMEDIATE",
    }),
);

process.stdout.write(JSON.stringify({
  badQuality,
  goodQuality,
  emptyParagraphQuality,
  zeroWidthParagraphQuality,
  formatOnlyParagraphQualities,
  labelContaminatedQuality,
  lowercaseLabelContaminatedQuality,
  nonLabelParentheticalQuality,
  paragraphBodyLabelQualities,
  paragraphBodyLabelBoundaryQualities,
  dependentFragmentQualities,
  completeDependentOpenerQualities,
  punctuatedDependentFragmentQualities,
  punctuatedCompleteDependentQualities,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".sentence-order-quality-harness.mts");
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

test("SENTENCE_ORDER rejects overlong given text and one-sentence A/B/C chunks", () => {
  const codes = new Set(result.badQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-order-given-too-long"), true);
  assert.equal(codes.has("sentence-order-given-too-long-relative"), true);
  assert.equal(codes.has("sentence-order-paragraph-too-short"), true);
});

test("SENTENCE_ORDER accepts a balanced CSAT-style split", () => {
  assert.deepEqual(
    result.goodQuality.filter((issue) => issue.severity === "error"),
    [],
    JSON.stringify(result.goodQuality),
  );
});

test("SENTENCE_ORDER emits a dedicated empty-paragraph code before craft diagnostics", () => {
  const codes = result.emptyParagraphQuality.map((issue) => issue.code);
  const emptyIndex = codes.indexOf("sentence-order-empty-paragraph");
  const shortIndex = codes.indexOf("sentence-order-paragraph-too-short");
  const thinIndex = codes.indexOf("sentence-order-paragraph-too-thin");

  assert.notEqual(emptyIndex, -1, JSON.stringify(result.emptyParagraphQuality));
  assert.ok(emptyIndex < shortIndex, JSON.stringify(result.emptyParagraphQuality));
  assert.ok(emptyIndex < thinIndex, JSON.stringify(result.emptyParagraphQuality));
});

test("SENTENCE_ORDER treats zero-width-only paragraph text as empty", () => {
  const codes = new Set(result.zeroWidthParagraphQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-order-empty-paragraph"), true);
});

test("SENTENCE_ORDER treats every Unicode format-control-only paragraph as empty", () => {
  for (const issues of result.formatOnlyParagraphQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-empty-paragraph"), true, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER separates given-label contamination from length craft", () => {
  const codes = new Set(result.labelContaminatedQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-order-given-contains-paragraph-label"), true);
  assert.equal(codes.has("sentence-order-given-too-long"), false);
});

test("SENTENCE_ORDER catches lowercase paragraph labels in the given text", () => {
  const codes = new Set(
    result.lowercaseLabelContaminatedQuality.map((issue) => issue.code),
  );
  assert.equal(codes.has("sentence-order-given-contains-paragraph-label"), true);
});

test("SENTENCE_ORDER does not treat ordinary parentheticals as paragraph labels", () => {
  const codes = new Set(result.nonLabelParentheticalQuality.map((issue) => issue.code));
  assert.equal(codes.has("sentence-order-given-contains-paragraph-label"), false);
});

test("SENTENCE_ORDER rejects duplicate structural labels inside paragraph bodies", () => {
  for (const issues of result.paragraphBodyLabelQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-paragraph-body-label"), true, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER preserves quoted, formula, and ordinary parenthetical boundaries", () => {
  for (const issues of result.paragraphBodyLabelBoundaryQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-paragraph-body-label"), false, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER emits a dedicated code for bounded dependent fragments", () => {
  for (const issues of result.dependentFragmentQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-dependent-fragment"), true, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER accepts complete dependent openers with an independent main clause", () => {
  for (const issues of result.completeDependentOpenerQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-dependent-fragment"), false, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER rejects terminally punctuated dependent fragments despite later padding", () => {
  for (const issues of result.punctuatedDependentFragmentQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-dependent-fragment"), true, JSON.stringify(issues));
  }
});

test("SENTENCE_ORDER preserves the paired dependent openers with explicit main clauses", () => {
  for (const issues of result.punctuatedCompleteDependentQualities) {
    const codes = new Set(issues.map((issue) => issue.code));
    assert.equal(codes.has("sentence-order-dependent-fragment"), false, JSON.stringify(issues));
  }
});
