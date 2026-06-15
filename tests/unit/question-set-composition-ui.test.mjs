import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// The builder can only ever offer VALID choices — prove the case table.
const harnessSource = `
import ui from "@/lib/question-sets/composition-ui";
const { getAddability, deriveStructuralMode, isSetLocked } = ui;

const failures = [];
let passed = 0;
const check = (name, cond) => { if (cond) passed += 1; else failures.push(name); };

// Empty set: anything can start.
check("empty: REFERENCE ok", getAddability("REFERENCE", []).ok === true);
check("empty: SENTENCE_ORDER ok", getAddability("SENTENCE_ORDER", []).ok === true);
check("empty: GRAMMAR_ERROR ok (solo start)", getAddability("GRAMMAR_ERROR", []).ok === true);
check("empty: IRRELEVANT ok (solo start)", getAddability("IRRELEVANT", []).ok === true);

// After a structural member.
const S = ["SENTENCE_ORDER"];
check("structural: REFERENCE ok", getAddability("REFERENCE", S).ok === true);
check("structural: CONTENT_MATCH ok", getAddability("CONTENT_MATCH", S).ok === true);
check("structural: 2nd structural blocked", getAddability("SENTENCE_INSERT", S).ok === false);
check("structural: same structural blocked", getAddability("SENTENCE_ORDER", S).ok === false);
check("structural: GRAMMAR_ERROR blocked (solo-only)", getAddability("GRAMMAR_ERROR", S).ok === false);

// After a solo-only member: fully locked.
check("locked: REFERENCE blocked", getAddability("REFERENCE", ["GRAMMAR_ERROR"]).ok === false);
check("locked: anything blocked", getAddability("TOPIC", ["BLANK_INFERENCE"]).ok === false);
check("isSetLocked grammar", isSetLocked(["GRAMMAR_ERROR"]) === true);
check("empty: GRAMMAR_CHOICE_COMBO ok (solo start)", getAddability("GRAMMAR_CHOICE_COMBO", []).ok === true);
check("locked: combo locks set", isSetLocked(["GRAMMAR_CHOICE_COMBO"]) === true);
check("combo: GRAMMAR_CHOICE_COMBO blocked in mixed set", getAddability("GRAMMAR_CHOICE_COMBO", ["REFERENCE"]).ok === false);
check("isSetLocked irrelevant", isSetLocked(["IRRELEVANT"]) === true);
check("isSetLocked underline false", isSetLocked(["REFERENCE"]) === false);

// Underline + source set can still take ONE structural; no solo-only.
const US = ["REFERENCE", "CONTENT_MATCH"];
check("combo: SENTENCE_ORDER ok", getAddability("SENTENCE_ORDER", US).ok === true);
check("combo: another underline ok", getAddability("IMPLIED_MEANING", US).ok === true);
check("combo: GRAMMAR_ERROR blocked", getAddability("GRAMMAR_ERROR", US).ok === false);

// deriveStructuralMode.
check("mode: order", deriveStructuralMode(["SENTENCE_ORDER", "REFERENCE"]) === "SENTENCE_ORDER");
check("mode: insert", deriveStructuralMode(["SENTENCE_INSERT"]) === "SENTENCE_INSERT");
check("mode: none (underline)", deriveStructuralMode(["REFERENCE", "TITLE"]) === "NONE");
check("mode: none (irrelevant solo)", deriveStructuralMode(["IRRELEVANT"]) === "NONE");

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-set-composition-ui-harness.mts");
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

test("set composition UI: every add/derive case is correct", () => {
  assert.equal(
    summary.failed,
    0,
    `composition-ui failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 21, `expected ≥21 checks, got ${summary.passed}`);
});
