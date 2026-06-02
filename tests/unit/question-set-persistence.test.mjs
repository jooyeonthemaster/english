import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// The load-bearing leakage fix: a set member must store NO baked passage copy.
// Round-trip: process → prepareSetMember (strip + extract anchors) → reconstruct
// must reproduce the original baked view, and questionText/structuredData must be
// passage-free.
const harnessSource = `
import pp from "@/lib/question-postprocess";
import persistence from "@/lib/question-sets/persistence";
import recon from "@/lib/question-sets/reconstruct";
const { postProcessQuestion } = pp;
const { prepareSetMember } = persistence;
const { reconstructPassageView } = recon;

const base =
  "Reliable sources confirm the news. The committee will review it carefully. They decided to delay the project because of concerns.";
const BAKED = ["passageWithBlank", "passageWithMarkers", "passageWithUnderline", "passageWithNumbers"];

const cases = [
  { type: "REFERENCE", field: "passageWithUnderline", spanCount: 1, ai: {
      direction: "밑줄 친 They가 가리키는 대상으로 가장 적절한 것은?",
      underlinedPronoun: "They",
      surroundingText: "They decided to delay the project",
      options: [{ label: "①", text: "sources" }, { label: "②", text: "committee" }],
      correctAnswer: "②",
  } },
  { type: "BLANK_INFERENCE", field: "passageWithBlank", spanCount: 1, ai: {
      direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
      originalExpression: "review it carefully",
      surroundingText: "The committee will review it carefully.",
      options: [{ label: "①", text: "review it carefully" }],
      correctAnswer: "①",
  } },
  { type: "GRAMMAR_ERROR", field: "passageWithMarkers", spanCount: 2, ai: {
      direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      markedExpressions: [
        { label: "A", expression: "confirm", isError: false, surroundingText: "Reliable sources confirm the news." },
        { label: "B", expression: "decided", isError: false, surroundingText: "They decided to delay the project" },
      ],
      correctAnswer: "A",
  } },
];

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1; else failures.push(name);
}

for (const c of cases) {
  const result = postProcessQuestion(c.type, base, c.ai);
  const expected = result?.data?.[c.field];
  const member = prepareSetMember(c.type, result.data, false);

  // structuredData carries no baked passage, but keeps reconstruction source fields.
  const sdHasBaked = BAKED.some((f) => member.structuredData[f] !== undefined);
  check(c.type + ": structuredData has no baked passage", sdHasBaked === false);
  check(c.type + ": _setMember flag set", member.structuredData._setMember === true);
  check(c.type + ": spans extracted", Array.isArray(member.spans) && member.spans.length === c.spanCount);

  // questionText is passage-free (no _____ blanks, no __..__ markers, no full passage).
  const qt = member.questionText || "";
  check(c.type + ": questionText has no blank", !/_{3,}/.test(qt));
  check(c.type + ": questionText has no marker", !/__[^_]+__/.test(qt));
  check(c.type + ": questionText keeps direction", qt.includes(c.ai.direction));

  // The anchors reconstruct EXACTLY the original baked view.
  const recon = reconstructPassageView(base, member.spans).text;
  check(c.type + ": anchors reconstruct baked view", typeof expected === "string" && recon === expected);
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-set-persistence-harness.mts");
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

test("set-aware persistence: members carry anchors, not baked passage", () => {
  assert.equal(
    summary.failed,
    0,
    `persistence failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.ok(summary.passed >= 18, `expected ≥18 checks, got ${summary.passed}`);
});
