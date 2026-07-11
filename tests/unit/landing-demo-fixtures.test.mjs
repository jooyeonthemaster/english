import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// 랜딩 인터랙티브 데모 fixture 가 실제 워크벤치 계약과 어긋나지 않는지 잠근다:
// 1) Step2 AnalysisReport fixture 가 zod 스키마를 통과하는지 (스키마 드리프트 가드)
// 2) Step4 BuilderQuestion fixture 가 makePaperItem→buildGroups→paginateGroups
//    파이프라인을 통과해 실제 페이지를 만들어내는지
// 3) Step3 문제 fixture 가 각 유형의 구조화 게이트 필드를 갖췄는지(폴백 렌더 방지)
// (기존 tsx 하네스 패턴: analysis-report-worksheet-surface.test.mjs)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import { analysisReportSchema } from "@/lib/passage-report/analysis-report/schema";
import { LANDING_ANALYSIS_REPORT } from "@/components/landing/demo/fixtures/analysis-report";
import { DEMO_BUILDER_QUESTIONS } from "@/components/landing/demo/fixtures/builder-questions";
import { DEMO_QUESTIONS, DEMO_QUESTION_TYPE_IDS } from "@/components/landing/demo/fixtures/questions";
import { makePaperItem, buildGroups } from "@/components/exams/paper-builder/paper-item-utils";
import { paginateGroups } from "@/components/exams/paper-builder/pagination";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// 1) Step2 — zod 파스
const parsed = analysisReportSchema.safeParse(LANDING_ANALYSIS_REPORT);
check(
  "analysis report fixture passes zod schema" +
    (parsed.success ? "" : " :: " + JSON.stringify(parsed.error.issues.slice(0, 3))),
  parsed.success,
);

// 2) Step4 — 실제 조판 파이프라인 통과
const items = DEMO_BUILDER_QUESTIONS.map((q, i) => makePaperItem(q, i + 1, []));
check("builder questions produce paper items", items.length === DEMO_BUILDER_QUESTIONS.length);
check("paper items keep options parsed", items.every((it) => it.options.length === 5));
const { pages, overflowItems } = paginateGroups(buildGroups(items), {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "plain",
  showAnswerSpace: true,
  showPassageTitle: true,
  showQuestionMeta: false,
  template: "clean",
});
check("pagination yields at least one page", pages.length >= 1);
check("no overflow items in demo fixture", overflowItems.size === 0);

// 3) Step3 — 유형별 구조화 게이트 필드(hasStructuredFields 계약 미러)
// hasStructuredFields(question-renderers.tsx:695) 게이트 미러 — 전 유형.
const GATES: Record<string, string[]> = {
  BLANK_INFERENCE: ["passageWithBlank", "direction"],
  GRAMMAR_ERROR: ["passageWithMarkers", "direction"],
  GRAMMAR_CHOICE_COMBO: ["passageWithMarkers", "direction"],
  VOCAB_CHOICE: ["passageWithMarkers", "direction"],
  SENTENCE_ORDER: ["givenSentence", "paragraphs"],
  SENTENCE_INSERT: ["givenSentence", "passageWithMarkers"],
  TOPIC: ["direction", "options"],
  MAIN_IDEA: ["direction", "options"],
  TITLE: ["direction", "options"],
  IMPLIED_MEANING: ["passageWithUnderline", "direction"],
  REFERENCE: ["passageWithUnderline", "direction"],
  CONTENT_MATCH: ["direction", "options"],
  SUMMARY_COMPLETE_MC: ["direction", "summaryWithBlanks", "options"],
  IRRELEVANT: ["passageWithNumbers", "direction"],
  CONDITIONAL_WRITING: ["referenceSentence", "conditions"],
  SENTENCE_TRANSFORM: ["originalSentence", "conditions"],
  FILL_BLANK_KEY: ["sentenceWithBlank"],
  SUMMARY_COMPLETE: ["summaryWithBlanks", "blanks"],
  SUMMARY_WRITING: ["summaryWithBlanks", "blanks"],
  WORD_ORDER: ["scrambledWords"],
  TOPIC_SENTENCE_WRITING: ["mode", "scrambledWords"],
  GRAMMAR_CORRECTION: ["passageWithUnderline", "underlinedSegments", "correctedPart"],
  CONTEXT_MEANING: ["passageWithUnderline", "direction"],
  SYNONYM: ["targetWord", "contextSentence"],
  ANTONYM: ["passageWithMarkers", "direction"],
};
for (const typeId of DEMO_QUESTION_TYPE_IDS) {
  const q = DEMO_QUESTIONS[typeId] as Record<string, unknown>;
  check(typeId + " fixture has _typeId", q._typeId === typeId);
  for (const field of GATES[typeId] ?? []) {
    check(typeId + " fixture has gate field " + field, Boolean(q[field]));
  }
  check(typeId + " fixture has answer + explanation", Boolean(q.correctAnswer) && Boolean(q.explanation));
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".landing-demo-fixtures-harness.mts");
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

test("landing demo fixtures satisfy workbench contracts", () => {
  assert.equal(
    summary.failed,
    0,
    `landing demo fixture failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed > 0, "harness ran no checks");
});
