import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import surface from "@/lib/passage-report/analysis-report/worksheet-surface";

const {
  worksheetAnswersAreHidden,
  normalizeStudentFacingMarkup,
  studentFacingMarkupIssues,
  toStudentVocabularyClozePassage,
  vocabularyClozeSurfaceIssues,
  consolidateWordOrders,
  wordOrderItemIssues,
} = surface;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

const circled1 = String.fromCodePoint(0x2460);
const circled2 = String.fromCodePoint(0x2461);
const vocabBlanks = [
  { no: 1, answer: "tremendous", meaning: "huge", clue: "amount clue" },
  { no: 2, answer: "exceeded", meaning: "surpassed", clue: "limit clue" },
];
const leakyVocab =
  "The fast-growing [tremendous]" + circled1 + " amount of data has [exceeded]" + circled2 + " our ability.";
const studentVocab = toStudentVocabularyClozePassage(leakyVocab, vocabBlanks);
check("vocab cloze hides bracketed answer 1", !studentVocab.includes("[tremendous]"));
check("vocab cloze hides bracketed answer 2", !studentVocab.includes("[exceeded]"));
check("vocab cloze prints blank 1", studentVocab.includes("(1) __________"));
check("vocab cloze prints blank 2", studentVocab.includes("(2) __________"));
check("vocab surface audit passes sanitized output", vocabularyClozeSurfaceIssues(leakyVocab, vocabBlanks).length === 0);

check("answers hidden by default", worksheetAnswersAreHidden({}) === true);
check("answers hidden when true", worksheetAnswersAreHidden({ hiddenAnswers: true }) === true);
check("answers shown only when false", worksheetAnswersAreHidden({ hiddenAnswers: false }) === false);

const htmlPrompt =
  "밑줄 친 <span style='text-decoration:underline;'>turn data tombs into &quot;golden nuggets&quot; of knowledge</span>의 의미는?";
const normalizedPrompt = normalizeStudentFacingMarkup(htmlPrompt);
check("student prompt strips literal span tag", !normalizedPrompt.includes("<span"));
check("student prompt keeps target phrase", normalizedPrompt.includes("turn data tombs into \\"golden nuggets\\" of knowledge"));
check("student prompt converts underline to stable marker", normalizedPrompt.includes("__turn data tombs into \\"golden nuggets\\" of knowledge__"));
check("markup audit catches raw html tag", studentFacingMarkupIssues(htmlPrompt, "prompt").length >= 1);
check("markup audit passes normalized prompt", studentFacingMarkupIssues(normalizedPrompt, "prompt").length === 0);

const answer1 =
  "Consequently, important decisions are often made based not on the information-rich data stored in data repositories but rather on a decision maker's intuition";
const answer2 =
  "The widening gap between data and information calls for the systematic development of data mining tools that can turn data tombs into golden nuggets of knowledge";
const primaryOrders = [
  {
    no: 1,
    korean: "중요한 결정은 데이터보다 직관에 근거한다.",
    chunks: [
      "Consequently, important decisions",
      "are often made",
      "based not on the information-rich data",
      "stored in data repositories",
      "but rather on a decision maker's intuition",
    ],
    answer: answer1,
  },
];
const drillOrders = [
  {
    no: 1,
    korean: "같은 문장의 중복 항목",
    chunks: [
      "stored in data repositories",
      "are often made",
      "Consequently, important decisions",
      "based not on the information-rich data",
      "but rather on a decision maker's intuition",
    ],
    answer: answer1,
  },
  {
    no: 2,
    korean: "데이터와 정보 사이의 간극은 도구 개발을 요구한다.",
    chunks: [
      "calls for the systematic development",
      "between data and information",
      "The widening gap",
      "of data mining tools",
      "that can turn data tombs into",
      "golden nuggets of knowledge",
    ],
    answer: answer2,
  },
];

const merged = consolidateWordOrders(primaryOrders, drillOrders);
check("word order duplicate removed by answer", merged.length === 2);
check("word order numbers are sequential", merged.every((item, index) => item.no === index + 1));
check("word order chunks are not answer order", merged.every((item) => item.chunks.join(" ") !== item.answer));
check("word order valid items pass audit", merged.flatMap(wordOrderItemIssues).length === 0);

const badOrder = {
  no: 9,
  chunks: answer2.split(" "),
  answer: answer2,
};
check("word order audit catches unscrambled chunks", wordOrderItemIssues(badOrder).some((issue) => issue.includes("answer order")));

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".analysis-report-worksheet-surface-harness.mts");
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

const summary = runHarness();

test("analysis-report worksheet surface keeps student sheet clean", () => {
  assert.equal(summary.failed, 0, `worksheet surface failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 18, `expected at least 18 checks, got ${summary.passed}`);
});
