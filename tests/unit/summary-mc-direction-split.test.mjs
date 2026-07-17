import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";
import summaryMc from "@/lib/question-quality/validators/summary/mc";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { findSummaryMcAnswerObjectMismatch } = summaryMc;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

const passage =
  "Careful teams compare independent measurements before making a decision. " +
  "This practice reduces the risk that one noisy result will determine the outcome.";

const baseQuestion = {
  direction: "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  summaryWithBlanks:
    "Teams can make more (A) decisions by comparing measurements, thereby reducing their reliance on (B) results.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / consistent", blankA: "reliable", blankB: "consistent" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / consistent", blankA: "hasty", blankB: "consistent" },
    { label: "5", text: "random / stable", blankA: "random", blankB: "stable" },
  ],
  correctAnswer: "1",
  explanation: "Independent measurements support reliable decisions and reduce reliance on noisy results.",
};

function directionIssues(direction) {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...baseQuestion, direction },
    passage,
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) => issue.code.startsWith("summary-mc-direction") || issue.code === "summary-mc-missing-direction");
}

const bindingOptions = [
  { label: "1", text: "ritual marker" },
  { label: "2", text: "silver reeds" },
  { label: "3", text: "amber reeds" },
  { label: "4", text: "remote shelter" },
  { label: "5", text: "quiet turbines" },
];
const bindingFinding = (text, correctAnswer = "3", options = bindingOptions) =>
  findSummaryMcAnswerObjectMismatch(text, options, correctAnswer);

const bindingFaithful = [
  "정답 ③번 amber reeds 골라야 한다.",
  "요약 빈칸 amber reeds 넣는 선택은 ③번이다.",
  "완성어 amber reeds 택하면 ③번이 된다.",
  "따라서 ③번 amber reeds 선택한다.",
  "정답으로서는는 ③번을, 완성어로도는 amber reeds을 취한다.",
  "요약의 대상으로서는도 amber reeds을, 번호로는는 ③번을 고른다.",
  "③번, 곧 amber reeds의 선택이 요구된다.",
  "amber reeds이 들어간 ③번이 선정되도록 되어 있다.",
  "반대 후보 silver reeds를 대조하면, 관계절이 수식하는 대상은 amber reeds이고 채택할 선지는 ③번이다.",
  "선택지의 silver reeds와 보호 대상을 함께 보더라도 빈칸의 주어가 되는 것은 amber reeds이며 번호는 ③번이다.",
  "Reject silver reeds; choose amber reeds for the completed summary.",
  "The correct answer is amber reeds.",
  "완성 대상으로 amber reeds을 택할 것이 요구되며 번호는 ③번이다.",
  "결론의 핵심으로서도는 amber reeds을 택하므로 정답은 ③번이다.",
  "자료 표현과 보조 목적어를 함께 보더라도 which절의 귀착점은 amber reeds이므로 ③번을 택한다.",
  "운송장과 서명자를 구분하면 who절의 행위자는 amber reeds이므로 ③번이 답이다.",
].map((text) => bindingFinding(text) === null);

const bindingDefects = [
  "정답 ③번 silver reeds 골라야 한다.",
  "요약 빈칸 silver reeds 넣는 선택은 ③번이다.",
  "완성어 silver reeds 택하면 ③번이 된다.",
  "따라서 ③번 silver reeds 선택한다.",
  "정답으로서는는 ③번을, 완성어로도는 silver reeds을 취한다.",
  "요약의 대상으로서는도 silver reeds을, 번호로는는 ③번을 고른다.",
  "③번, 곧 silver reeds의 선택이 요구된다.",
  "silver reeds이 들어간 ③번이 선정되도록 되어 있다.",
  "반대 후보 amber reeds를 대조하면, 관계절이 수식하는 대상은 silver reeds이고 채택할 선지는 ③번이다.",
  "선택지의 amber reeds와 보호 대상을 함께 보더라도 빈칸의 주어가 되는 것은 silver reeds이며 번호는 ③번이다.",
  "Reject amber reeds; choose silver reeds for the completed summary.",
  "The correct answer is silver reeds.",
  "완성 대상으로 silver reeds을 택할 것이 요구되며 번호는 ③번이다.",
  "결론의 핵심으로서도는 silver reeds을 택하므로 정답은 ③번이다.",
  "자료 표현과 보조 목적어를 함께 보더라도 which절의 귀착점은 silver reeds이므로 ③번을 택한다.",
  "운송장과 서명자를 구분하면 who절의 행위자는 silver reeds이므로 ③번이 답이다.",
].map((text) => Boolean(bindingFinding(text)));

const bindingAbstentionControls = [
  bindingFinding("Complete the summary by choosing the most appropriate pair."),
  bindingFinding("The explanation compares amber reeds with silver reeds."),
  bindingFinding("Reject silver reeds; therefore choose amber reeds."),
  bindingFinding("Amber reeds, not silver reeds, is the correct answer."),
  bindingFinding("The source passage calls silver reeds a distractor; amber reeds is selected."),
  bindingFinding("A later example uses the words silver reeds without making an answer claim."),
  bindingFinding("정답을 검토할 때 silver reeds는 오답이고 amber reeds를 고른다."),
  bindingFinding("정답 ③번 amber reeds 골라야 한다.", "3", [
    { label: "1", text: "amber reeds" },
    { label: "2", text: "silver reeds" },
    { label: "3", text: "amber reeds" },
  ]),
].map((finding) => finding === null);

function answerObjectIssues(surface, text) {
  const question = {
    ...baseQuestion,
    direction: surface === "direction"
      ? baseQuestion.direction + " " + text
      : baseQuestion.direction,
    explanation: surface === "explanation" ? text : baseQuestion.explanation,
  };
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question,
    passage,
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) => issue.code === "summary-mc-answer-object-mismatch");
}

console.log(JSON.stringify({
  missing: directionIssues("   "),
  koreanTitle: directionIssues("다음 글의 내용을 가장 잘 요약한 제목으로 적절한 것은?"),
  englishGrammar: directionIssues("Which of the underlined expressions is grammatically incorrect?"),
  canonical: directionIssues("다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?"),
  summaryWithoutLabels: directionIssues("Complete the summary by choosing the most appropriate pair of words."),
  genericDirection: directionIssues("Choose the most appropriate answer."),
  summaryTopicContext: directionIssues("다음 글의 주제를 요약한 문장의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?"),
  explicitGrammarWordsFrame: directionIssues("Complete the summary by choosing the grammatically correct words for (A) and (B)."),
  blankInferenceTask: directionIssues("Choose the phrase that best fits the blank in the passage."),
  pluralBlankInferenceTask: directionIssues("Choose the words that best fit the blanks in the passage."),
  mixedSummaryAndGrammarTask: directionIssues("Complete the summary by choosing words for (A) and (B). Then identify which underlined expression is grammatically incorrect."),
  mixedSummaryAndBlankTask: directionIssues("Complete the summary by choosing words for (A) and (B). Then choose the phrase that best fits the blank in the passage."),
  validSecondOption: directionIssues("Complete the summary for (A) and (B). Then select the grammatically correct option for each blank."),
  mixedSameClauseAnd: directionIssues("Complete the summary for (A) and (B), and identify which underlined expression is grammatically incorrect."),
  mixedColon: directionIssues("Complete the summary for (A) and (B): choose the phrase that best fits the blank in the passage."),
  mixedKoreanSameClause: directionIssues("다음 요약문의 빈칸 (A), (B)를 완성하고 밑줄 친 표현 중 어법상 틀린 것을 고르시오."),
  v3ValidBound: [
    "Complete the summary for (A) and (B). Then select the grammatically correct option for both blanks.",
    "Complete the summary for (A) and (B). Next choose the grammatically correct option for all blanks.",
    "Complete the summary for (A) and (B): select the grammatically correct option for the two blanks.",
    "Complete the summary for (A) and (B). Also select the grammatically correct options for blanks (A) and (B).",
    "Complete the summary for (A) and (B). Then select the grammatically correct option for (A) and (B).",
    "다음 요약문의 빈칸 (A), (B)를 완성하시오. 각 빈칸에 어법상 옳은 선택지를 고르시오.",
    "다음 요약문의 빈칸 (A), (B)를 완성하시오. 두 빈칸에 어법상 옳은 선택지를 고르시오.",
    "Complete the summary for (A) and (B) and choose the grammatically correct option for each blank.",
  ].map(directionIssues),
  v3Mixed: [
    "Complete the summary for (A) and (B) and identify which underlined expression is grammatically incorrect.",
    "Complete the summary for (A) and (B) while identifying which underlined expression is grammatically incorrect.",
    "Complete the summary for (A) and (B) (also identify which underlined expression is grammatically incorrect).",
    "Complete the summary for (A) and (B) / choose the title that best represents the passage.",
    "Complete the summary for (A) and (B) — identify which underlined expression is grammatically incorrect.",
    "다음 요약문의 빈칸 (A), (B)를 완성하며 밑줄 친 표현 중 어법상 틀린 것을 고르시오.",
    "다음 요약문의 빈칸 (A), (B)를 완성한 뒤 밑줄 친 표현 중 어법상 틀린 것을 고르시오.",
    "Complete the summary for (A) and (B), and then choose which statement is false according to the passage.",
  ].map(directionIssues),
  v4Mixed: [
    "Complete the summary for (A) and (B) and also decide which underlined clause is grammatically unacceptable.",
    "Complete the summary for (A) and (B); afterward, select the highlighted sentence that contains a grammar error.",
    "Complete the summary for (A) and (B) — separately, identify the boldfaced phrase that is grammatically incorrect.",
    "Complete the summary for (A) and (B) / independently, choose the numbered expression whose grammar is wrong.",
    "Complete the summary for (A) and (B) (in addition, choose the heading that best captures the text.)",
    "Complete the summary for (A) and (B) and also state the central idea of the passage.",
    "Complete the summary for (A) and (B); afterward, identify which claim is unsupported according to the passage.",
    "Complete the summary for (A) and (B) — separately, choose the numbered sentence that is irrelevant to the flow.",
    "Complete the summary for (A) and (B) / independently, determine where the supplied sentence should be inserted.",
    "Complete the summary for (A) and (B) while you also arrange the following paragraphs into their logical order.",
    "Complete the summary for (A) and (B) (in addition, identify what the highlighted pronoun refers to.)",
    "Complete the summary for (A) and (B) and also select the contextually inappropriate highlighted word.",
    "Complete the summary for (A) and (B); afterward, choose the statement that contradicts the text.",
    "Complete the summary for (A) and (B) — separately, locate the sentence that disrupts the argument's coherence.",
    "Complete the summary for (A) and (B) / independently, write the best title for the reading passage.",
    "요약문의 (A), (B)를 완성한 뒤 강조된 문장 중 문법적으로 잘못된 것을 고르시오.",
    "요약문의 (A), (B)를 완성하는 것에 더하여 본문의 빈칸에 들어갈 별도의 어구를 고르시오.",
    "요약문의 (A), (B)를 완성하고, 이와 별개로 본문의 중심 생각을 진술하시오.",
    "요약문의 (A), (B)를 완성한 다음 글의 내용과 모순되는 진술을 찾으시오.",
    "요약문의 (A), (B)를 완성할 뿐 아니라 흐름을 방해하는 문장도 고르시오.",
    "요약문의 (A), (B)를 완성하면서 주어진 문장이 삽입될 위치도 정하시오.",
    "요약문의 (A), (B)를 완성하고 이어질 단락의 논리적 순서를 별도로 배열하시오.",
    "요약문의 (A), (B)를 완성한 후 강조된 대명사가 가리키는 대상을 찾으시오.",
    "요약문의 (A), (B)를 완성하는 데 이어 문맥상 부적절한 강조 낱말을 고르시오.",
    "요약문의 (A), (B)를 완성하는 한편 본문에 근거하지 않은 주장을 고르시오.",
    "요약문의 두 자리 (A), (B)를 채우시오. 그와 별개로, 글의 내용에 근거하지 않은 주장을 고르시오.",
  ].map(directionIssues),
  v6EvidenceMixed: [
    "요약문 빈칸 (A), (B)를 먼저 완성하시오. 별개 과제로 글의 내용을 근거로 옳지 않은 진술을 고르시오.",
    "요약문의 빈칸 (A)와 (B)에 단어를 넣으시오. 또한 본문 내용을 근거로 사실이 아닌 주장을 찾으시오.",
    "요약문 빈칸 (A), (B)를 완성하시오. 이와 독립적으로 글에서 뒷받침할 근거가 없는 주장을 고르시오.",
    "요약문의 빈자리 (A), (B)를 채우시오. 두 번째 과제로 본문이 뒷받침하지 않는 진술을 선택하시오.",
    "요약문 빈칸 (A)와 (B)를 완성하시오. 별도로 글의 증거로 정당화할 수 없는 주장을 찾으시오.",
    "요약문의 두 빈칸 (A), (B)를 채우시오. 추가로 본문에 제시된 증거가 지지하지 않는 진술을 고르시오.",
    "Complete summary blanks (A) and (B). As a separate task, choose the claim for which the passage provides no evidence.",
    "Fill (A) and (B) in the summary. Independently select the statement not supported by evidence in the text.",
    "Complete the summary at (A) and (B); then identify the assertion with no textual support in the source passage.",
    "Choose the pair for summary slots (A) and (B). Separately, select the claim that cannot be justified from the passage.",
  ].map(directionIssues),
  v6EvidenceBound: [
    "글의 내용을 근거로 요약문의 빈칸 (A), (B)에 가장 적절한 단어 쌍을 고르시오.",
    "본문의 내용을 근거로 요약문 빈칸 (A)와 (B)를 완성할 표현을 선택하시오.",
    "글에서 뒷받침되는 단어 조합으로 요약문의 빈칸 (A), (B)를 채우시오.",
    "본문 근거와 일치하도록 요약문 빈자리 (A)와 (B)에 들어갈 한 쌍을 고르시오.",
    "글의 내용과 모순되지 않게 요약문의 두 빈칸 (A), (B)를 완성하시오.",
    "본문에 근거한 요약이 되도록 빈칸 (A)와 (B)에 알맞은 표현을 넣으시오.",
    "근거 없는 단어 조합은 피하고 요약문 빈칸 (A), (B)에 들어갈 한 쌍만 선택하시오.",
    "본문이 뒷받침하는 두 표현을 골라 요약문의 빈자리 (A)와 (B)를 채우시오.",
    "Using evidence from the passage, complete summary blanks (A) and (B) with one option pair.",
    "Choose the pair for summary positions (A) and (B) that is supported by the source text.",
    "Complete summary slots (A) and (B) without contradicting the passage's content.",
    "Select expressions for summary blanks (A) and (B) that are grounded in passage evidence.",
    "For summary positions (A) and (B), reject unsupported pairs and choose the one backed by the text.",
    "Fill summary blanks (A) and (B) so the completed summary matches the evidence in the passage.",
    "Based only on the source text, choose one pair to complete summary labels (A) and (B).",
    "Complete the summary at (A) and (B) with the two words best justified by the passage.",
  ].map(directionIssues),
  v7ClaimObjects: [
    "본문상 옳은 주장을 하나 고르시오.",
    "사실인 진술을 지문으로 볼 때 찾으시오.",
    "요약문 아래에 제시된 설명 중 글에 비추어 근거가 뒷받침하는 명제을 고르시오.",
    "※ 내용 확인 문항\n제시 근거상, 다섯 진술 가운데 본문과 일치하는 설명을 찾으시오.",
    "요약의 (A)/(B) 쌍과 별개로 본문의 주장 중 옳은 주장을 고르시오.",
    "단어 쌍은 참고만 하고 지문의 진술 중 뒷받침되지 않는 진술을 선택하시오.",
    "표현 조합을 읽되 글의 명제 중 증거가 지지하는 명제를 선택하시오.",
    "말의 쌍과 별개로 지문의 진술 중 근거가 부족한 진술을 선택하시오.",
  ].map(directionIssues),
  v7CompletionObjects: [
    "본문의 주장과 일치하는 (A)/(B) 표현 쌍을 고르시오.",
    "지문의 진술과 일치하는 두 빈칸 단어 조합을 선택하시오.",
    "본문의 옳은 주장이 되도록 빈칸 표현 쌍을 고르시오.",
    "지문의 사실인 진술이 되게 하는 단어 조합을 선택하시오.",
    "본문의 진술이 사실인 문장이 되도록 (A)/(B) 짝을 찾으시오.",
    "지문의 명제가 옳은 요약이 되게 할 두 단어를 고르시오.",
    "본문의 주장에 일치하는 두 빈칸 표현을 고르시오.",
    "글의 명제에 일치하는 빈칸 조합을 판단하시오.",
  ].map(directionIssues),
  bindingFaithful,
  bindingDefects,
  bindingAbstentionControls,
  integratedDirectionMismatch: answerObjectIssues(
    "direction",
    "정답 ①번이지만 hasty / noisy를 고른다.",
  ),
  integratedExplanationMismatch: answerObjectIssues(
    "explanation",
    "정답 ①번이지만 hasty / noisy를 고른다.",
  ),
  integratedFaithful: answerObjectIssues(
    "explanation",
    "정답 ①번 reliable / noisy를 고른다.",
  ),
  answerObjectFatalPolicy:
    RELAXED_BLOCKING_QUALITY_CODES.has("summary-mc-answer-object-mismatch") &&
    !SALVAGE_RELAXABLE_CODES.has("summary-mc-answer-object-mismatch"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".summary-mc-direction-split-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const raw = execFileSync(process.execPath, [tsxCli, harnessPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // best-effort cleanup
    }
  }
}

const result = runHarness();

test("missing SUMMARY_COMPLETE_MC direction emits only the precise fatal diagnostic", () => {
  assert.deepEqual(result.missing.map(({ code, severity }) => ({ code, severity })), [
    { code: "summary-mc-missing-direction", severity: "error" },
  ]);
});

test("high-confidence Korean and English competing tasks emit the task-mismatch fatal diagnostic", () => {
  for (const issues of [result.koreanTitle, result.englishGrammar]) {
    assert.deepEqual(issues.map(({ code, severity }) => ({ code, severity })), [
      { code: "summary-mc-direction-task-mismatch", severity: "error" },
    ]);
  }
});

test("canonical summary-completion direction emits no direction diagnostic", () => {
  assert.deepEqual(result.canonical, []);
});

test("valid summary task without literal blank labels remains a craft warning", () => {
  assert.deepEqual(result.summaryWithoutLabels.map(({ code, severity }) => ({ code, severity })), [
    { code: "summary-mc-direction-frame", severity: "warning" },
  ]);
});

test("generic direction remains a warning because its task cannot be classified safely", () => {
  assert.deepEqual(result.genericDirection.map(({ code, severity }) => ({ code, severity })), [
    { code: "summary-mc-direction-frame", severity: "warning" },
  ]);
});

test("a topic mentioned inside an explicit summary-completion frame is not misclassified", () => {
  assert.deepEqual(result.summaryTopicContext, []);
});

test("grammar wording inside an explicit summary-completion frame is not a competing grammar task", () => {
  assert.deepEqual(result.explicitGrammarWordsFrame, []);
  assert.deepEqual(result.validSecondOption, []);
  for (const issues of result.v3ValidBound) assert.deepEqual(issues, []);
});

test("an explicit passage-blank inference task is rejected as a competing task", () => {
  for (const issues of [
    result.blankInferenceTask,
    result.pluralBlankInferenceTask,
    result.mixedSummaryAndGrammarTask,
    result.mixedSummaryAndBlankTask,
    result.mixedSameClauseAnd,
    result.mixedColon,
    result.mixedKoreanSameClause,
  ]) {
    assert.deepEqual(
      issues.map(({ code, severity }) => ({ code, severity })),
      [{ code: "summary-mc-direction-task-mismatch", severity: "error" }],
    );
  }
  for (const issues of result.v3Mixed) {
    assert.deepEqual(
      issues.map(({ code, severity }) => ({ code, severity })),
      [{ code: "summary-mc-direction-task-mismatch", severity: "error" }],
    );
  }
  for (const issues of result.v4Mixed) {
    assert.deepEqual(
      issues.map(({ code, severity }) => ({ code, severity })),
      [{ code: "summary-mc-direction-task-mismatch", severity: "error" }],
    );
  }
  for (const issues of result.v6EvidenceMixed) {
    assert.deepEqual(
      issues.map(({ code, severity }) => ({ code, severity })),
      [{ code: "summary-mc-direction-task-mismatch", severity: "error" }],
    );
  }
  for (const issues of result.v6EvidenceBound) assert.deepEqual(issues, []);
});

test("content-evidence tasks bind the selection verb to its actual answer object", () => {
  for (const issues of result.v7ClaimObjects) {
    assert.deepEqual(
      issues.map(({ code, severity }) => ({ code, severity })),
      [{ code: "summary-mc-direction-task-mismatch", severity: "error" }],
    );
  }
  for (const issues of result.v7CompletionObjects) {
    assert.equal(
      issues.some((issue) => issue.code === "summary-mc-direction-task-mismatch"),
      false,
    );
  }
});

test("명시된 선택 객체를 실제 keyed option text에 결박", () => {
  assert.equal(
    result.bindingFaithful.every(Boolean),
    true,
    JSON.stringify(result.bindingFaithful),
  );
  assert.equal(
    result.bindingDefects.every(Boolean),
    true,
    JSON.stringify(result.bindingDefects),
  );
  assert.equal(result.integratedDirectionMismatch.length, 1);
  assert.equal(result.integratedExplanationMismatch.length, 1);
  assert.equal(result.integratedFaithful.length, 0);
  assert.equal(result.answerObjectFatalPolicy, true);
});

test("비교·배제 설명, 비선택 언급, 중복 표면형은 answer-object 판정을 보류", () => {
  assert.equal(result.bindingAbstentionControls.every(Boolean), true);
});
