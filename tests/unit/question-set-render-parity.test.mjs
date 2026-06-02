import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// Parity: reconstructPassageView(base, extractAnchors(type, ai)) must byte-equal
// the post-processor's baked passageWith* for every inline-mark type. Proves the
// set's stored-anchors path renders identically to today's single-question path.
const harnessSource = `
import pp from "@/lib/question-postprocess";
import extraction from "@/lib/question-sets/anchor-extraction";
import recon from "@/lib/question-sets/reconstruct";
const { postProcessQuestion } = pp;
const { extractAnchors } = extraction;
const { reconstructPassageView } = recon;

const base =
  "Reliable sources confirm the news. The committee will review it carefully. They decided to delay the project because of concerns.";

const cases = [
  { type: "BLANK_INFERENCE", field: "passageWithBlank", ai: {
      originalExpression: "review it carefully",
      surroundingText: "The committee will review it carefully.",
      options: [{ label: "①", text: "review it carefully" }],
      correctAnswer: "①",
  } },
  { type: "FILL_BLANK_KEY", field: "passageWithBlank", ai: {
      answer: "carefully",
      sentenceWithBlank: "The committee will review it _____.",
  } },
  { type: "GRAMMAR_ERROR", field: "passageWithMarkers", ai: {
      markedExpressions: [
        { label: "A", expression: "confirm", isError: false, surroundingText: "Reliable sources confirm the news." },
        { label: "B", expression: "decided", isError: false, surroundingText: "They decided to delay the project" },
      ],
      correctAnswer: "A",
  } },
  { type: "VOCAB_CHOICE", field: "passageWithMarkers", ai: {
      markedWords: [
        { label: "①", originalWord: "Reliable", isInappropriate: false, surroundingText: "Reliable sources confirm" },
      ],
  } },
  { type: "ANTONYM", field: "passageWithMarkers", ai: {
      markedWords: [
        { label: "①", word: "carefully", antonym: "carelessly", surroundingText: "review it carefully" },
      ],
  } },
  { type: "REFERENCE", field: "passageWithUnderline", ai: {
      underlinedPronoun: "They",
      surroundingText: "They decided to delay the project",
  } },
  { type: "SYNONYM", field: "passageWithUnderline", ai: {
      targetWord: "confirm",
      contextSentence: "Reliable sources confirm the news.",
  } },
  { type: "CONTEXT_MEANING", field: "passageWithUnderline", ai: {
      underlinedWord: "delay",
      surroundingText: "delay the project because of concerns",
  } },
  { type: "IMPLIED_MEANING", field: "passageWithUnderline", ai: {
      underlinedExpression: "delay the project",
      surroundingText: "decided to delay the project because",
  } },
];

const failures = [];
let passed = 0;
for (const c of cases) {
  const result = postProcessQuestion(c.type, base, c.ai);
  const expected = result?.data?.[c.field];
  const anchors = extractAnchors(c.type, c.ai);
  const got = reconstructPassageView(base, anchors).text;
  if (typeof expected === "string" && expected.length > 0 && expected === got) {
    passed += 1;
  } else {
    failures.push({ type: c.type, expected: expected ?? null, got, anchors });
  }
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-set-parity-harness.mts");
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

test("render-from-spans parity: reconstructed === baked for all 9 inline types", () => {
  assert.equal(
    summary.failed,
    0,
    `parity failures: ${JSON.stringify(summary.failures, null, 2)}`,
  );
  assert.equal(summary.passed, 9, `expected 9 parity checks, got ${summary.passed}`);
});
