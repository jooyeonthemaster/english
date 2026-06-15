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

const { validateQuestionQuality, buildQuestionTargetCandidateBlock } = quality;

const thinPassage =
  "Rational decision-making, by contrast, requires people to slow down and compare possible outcomes before acting. " +
  "It also depends on evidence that can be tested, choices that remain open, and habits that make people careful.";

const thinGrammarError = {
  direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
  difficulty: "KILLER",
  passageWithMarkers:
    "Rational decision-making, by contrast, __(A) require__ people to slow down and compare possible outcomes before acting. " +
    "It also depends on evidence __(B) that__ can be tested, choices __(C) that__ remain open, and habits that __(D) make__ people __(E) careful__.",
  markedExpressions: [
    { label: "A", expression: "requires", errorExpression: "require", correction: "requires", isError: true, pointCode: "d", surroundingText: "Rational decision-making, by contrast, requires people to slow down" },
    { label: "B", expression: "that", isError: false, pointCode: "b", surroundingText: "evidence that can be tested" },
    { label: "C", expression: "remain open", isError: false, pointCode: "f", surroundingText: "choices that remain open" },
    { label: "D", expression: "make", isError: false, pointCode: "h", surroundingText: "habits that make people careful" },
    { label: "E", expression: "careful", isError: false, pointCode: "f", surroundingText: "make people careful" },
  ],
  options: [
    { label: "A", text: "require" },
    { label: "B", text: "that" },
    { label: "C", text: "remain open" },
    { label: "D", text: "make" },
    { label: "E", text: "careful" },
  ],
  correctAnswer: "A",
  wrongOptionExplanations: {
    B: "that은 evidence를 선행사로 하는 관계대명사로 가능하다.",
    C: "remain open은 보어 자리의 형용사 open이 와서 적절하다.",
    D: "make는 관계절 안 동사로 주어 habits와 호응한다.",
    E: "careful은 목적격보어 자리의 형용사로 적절하다.",
  },
  explanation: "동명사구 Rational decision-making이 단수 주어이므로 requires가 맞다.",
};

const richPassage =
  "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can change habits.";

const richGrammarError = {
  ...thinGrammarError,
  passageWithMarkers:
    "The reports __(A) that__ the committee reviewed, __(B) which was__ based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can __(E) change__ habits.",
  markedExpressions: [
    { label: "A", expression: "that", isError: false, pointCode: "b", surroundingText: "reports that the committee reviewed" },
    { label: "B", expression: "which were", errorExpression: "which was", correction: "which were", isError: true, pointCode: "d", surroundingText: "reports that the committee reviewed, which were based on interviews" },
    { label: "C", expression: "show", isError: false, pointCode: "d", surroundingText: "The reports ... show how policies" },
    { label: "D", expression: "designed", isError: false, pointCode: "c", surroundingText: "policies designed to reduce waste" },
    { label: "E", expression: "change", isError: false, pointCode: "a", surroundingText: "can change habits" },
  ],
  options: [
    { label: "A", text: "that" },
    { label: "B", text: "which was" },
    { label: "C", text: "show" },
    { label: "D", text: "designed" },
    { label: "E", text: "change" },
  ],
  correctAnswer: "B",
  wrongOptionExplanations: {
    A: "that은 목적격 관계대명사로 가능하다.",
    C: "주어 reports가 복수이므로 show가 맞다.",
    D: "policies를 수식하는 과거분사 designed가 맞다.",
    E: "조동사 can 뒤에는 동사원형 change가 온다.",
  },
  explanation: "which의 선행사는 reports이므로 which were가 맞고 which was는 수일치 오류다.",
};

const thinGrammarCorrection = {
  direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  difficulty: "KILLER",
  passageWithUnderline: "__Rational decision-making require people to compare outcomes before they act.__",
  underlinedSegments: [
    {
      sourceText: "Rational decision-making requires people to compare outcomes before they act.",
      displayedText: "Rational decision-making require people to compare outcomes before they act.",
      isError: true,
      errorPart: "require",
      correctedPart: "requires",
    },
  ],
  errorPart: "require",
  correctedPart: "requires",
  correctAnswer: "(A) requires",
  explanation: "동명사구 Rational decision-making이 단수 주어이므로 requires가 필요하다.",
  keyPoints: ["수일치", "동명사 주어", "동사 형태"],
};

const richGrammarCorrection = {
  direction: thinGrammarCorrection.direction,
  difficulty: "KILLER",
  passageWithUnderline: "__The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.__",
  underlinedSegments: [
    {
      sourceText: richPassage,
      displayedText: "The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.",
      isError: true,
      errorPart: "which was",
      correctedPart: "which were",
    },
  ],
  errorPart: "which was",
  correctedPart: "which were",
  correctAnswer: "(A) which were",
  explanation: "which의 선행사가 복수 reports이므로 which were가 필요하다.",
  keyPoints: ["관계절", "선행사 reports", "수일치"],
};

const thinGrammarErrorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: thinGrammarError,
  passage: thinPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const richGrammarErrorQuality = validateQuestionQuality({
  typeId: "GRAMMAR_ERROR",
  question: richGrammarError,
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const thinGrammarCorrectionQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: thinGrammarCorrection,
  passage: "Rational decision-making requires people to compare outcomes before they act.",
  requestedDifficulty: "KILLER",
  grammarCorrectionErrorCount: 1,
});

const richGrammarCorrectionQuality = validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: richGrammarCorrection,
  passage: richPassage,
  requestedDifficulty: "KILLER",
  grammarCorrectionErrorCount: 1,
});

const candidateBlock = buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", richPassage, {
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

process.stdout.write(JSON.stringify({
  thinGrammarErrorQuality,
  richGrammarErrorQuality,
  thinGrammarCorrectionQuality,
  richGrammarCorrectionQuality,
  candidateBlock,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".grammar-generation-quality-harness.mts");
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

test("GRAMMAR_ERROR rejects when a KILLER answer is only a thin local agreement flip", () => {
  assert.ok(
    result.thinGrammarErrorQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-killer-thin-answer",
    ),
    JSON.stringify(result.thinGrammarErrorQuality),
  );
});

test("GRAMMAR_ERROR does not warn for structurally loaded KILLER agreement", () => {
  assert.equal(
    result.richGrammarErrorQuality.some((issue) => issue.code === "grammar-killer-thin-answer"),
    false,
    JSON.stringify(result.richGrammarErrorQuality),
  );
  assert.deepEqual(
    result.richGrammarErrorQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("GRAMMAR_CORRECTION applies the same KILLER depth check to hidden errors", () => {
  assert.ok(
    result.thinGrammarCorrectionQuality.some(
      (issue) => issue.severity === "error" && issue.code === "grammar-correction-killer-thin-segment",
    ),
    JSON.stringify(result.thinGrammarCorrectionQuality),
  );
  assert.equal(
    result.richGrammarCorrectionQuality.some((issue) => issue.code === "grammar-correction-killer-thin-segment"),
    false,
    JSON.stringify(result.richGrammarCorrectionQuality),
  );
});

test("grammar candidate blocks include PDF-derived difficulty policy and source-backed targets", () => {
  assert.match(result.candidateBlock, /어법 1000제 PDF 분석 기반 난이도 보정/);
  assert.match(result.candidateBlock, /Source-backed grammar target candidates/);
  assert.match(result.candidateBlock, /tier=killer/);
  assert.match(result.candidateBlock, /code=\(b\)|code=\(c\)|code=\(d\)|code=\(i\)/);
});
