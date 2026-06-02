import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// leakage-gate / text-utils are TS with `@/...` aliases → run a tsx harness that
// exercises them and emits a JSON summary, mirroring hwpx-break-plan.test.mjs.
const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import gate from "@/lib/question-sets/leakage-gate";
import textUtils from "@/lib/question-postprocess/text-utils";
const { kindsLeak, validateSetComposition, scanSetForLeakage, labelGlyphFamily } = gate;
const { findExpressionInPassageStrict } = textUtils;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── kindsLeak matrix ──
check("BLANK×UNDERLINE leaks", kindsLeak("BLANK", "UNDERLINE") === true);
check("UNDERLINE×UNDERLINE safe", kindsLeak("UNDERLINE", "UNDERLINE") === false);
check("UNDERLINE×BLOCK safe (43~45)", kindsLeak("UNDERLINE", "BLOCK") === false);
check("BLOCK×NUMBER leaks", kindsLeak("BLOCK", "NUMBER") === true);
check("MARKER×UNDERLINE leaks", kindsLeak("MARKER", "UNDERLINE") === true);
check("UNDERLINE×SENTENCE safe", kindsLeak("UNDERLINE", "SENTENCE") === false);
check("NUMBER×CIRCLED_LETTER leaks", kindsLeak("NUMBER", "CIRCLED_LETTER") === true);

// ── validateSetComposition ──
const c1 = validateSetComposition(
  [{ typeId: "SENTENCE_ORDER" }, { typeId: "REFERENCE" }, { typeId: "CONTENT_MATCH" }],
  "SENTENCE_ORDER",
);
check("43~45 preset valid", c1.ok === true && c1.structuralType === "SENTENCE_ORDER");

const c2 = validateSetComposition([{ typeId: "BLANK_INFERENCE" }, { typeId: "REFERENCE" }], "NONE");
check("blank+other rejected", c2.ok === false);

const c3 = validateSetComposition([{ typeId: "GRAMMAR_ERROR" }], "NONE");
check("grammar solo allowed", c3.ok === true);

const c4 = validateSetComposition([{ typeId: "IRRELEVANT" }, { typeId: "REFERENCE" }], "NONE");
check("irrelevant+other rejected", c4.ok === false);

const c5 = validateSetComposition(
  [{ typeId: "SENTENCE_ORDER" }, { typeId: "SENTENCE_INSERT" }, { typeId: "REFERENCE" }],
  "SENTENCE_ORDER",
);
check("two structural rejected", c5.ok === false);

const c6 = validateSetComposition(
  [{ typeId: "REFERENCE" }, { typeId: "IMPLIED_MEANING" }, { typeId: "TITLE" }, { typeId: "CONTENT_MATCH" }],
  "NONE",
);
check("underline+source allowed", c6.ok === true);

const c7 = validateSetComposition([{ typeId: "SENTENCE_ORDER" }, { typeId: "REFERENCE" }], "NONE");
check("structural without mode rejected", c7.ok === false);

const c8 = validateSetComposition([{ typeId: "REFERENCE" }], "SENTENCE_ORDER");
check("mode without structural member rejected", c8.ok === false);

// ── scanSetForLeakage ──
const base = "The cat sat on the mat. The dog ran in the park.";
function span(text, kind, occ = 0) {
  let i = -1;
  for (let k = 0; k <= occ; k++) i = base.indexOf(text, i + 1);
  return { start: i, end: i + text.length, kind };
}
function member(index, typeId, isStructural, spans) {
  return { index, typeId, isStructural, spans };
}

const sA = scanSetForLeakage(
  [member(0, "REFERENCE", false, [span("cat", "UNDERLINE")]),
   member(1, "REFERENCE", false, [span("dog", "UNDERLINE")])],
  base,
);
check("two distinct underlines OK", sA.status === "OK");

const sB = scanSetForLeakage(
  [member(0, "REFERENCE", false, [span("cat", "UNDERLINE")]),
   member(1, "REFERENCE", false, [span("cat", "UNDERLINE")])],
  base,
);
check("same-token underlines CONFLICT", sB.status === "CONFLICT");

const sC = scanSetForLeakage(
  [member(0, "BLANK_INFERENCE", false, [span("cat", "BLANK")]),
   member(1, "GRAMMAR_ERROR", false, [span("mat", "MARKER")])],
  base,
);
check("blank+marker same sentence CONFLICT", sC.status === "CONFLICT");

const sD = scanSetForLeakage(
  [member(0, "SENTENCE_ORDER", true, [{ start: 0, end: base.length, kind: "BLOCK" }]),
   member(1, "REFERENCE", false, [span("dog", "UNDERLINE")])],
  base,
);
check("structural BLOCK + underline OK (43~45)", sD.status === "OK");

// ── findExpressionInPassageStrict ──
const ambig = findExpressionInPassageStrict("the cat and the dog and the bird", "the");
check("repeated token is ambiguous", ambig.ambiguous === true && ambig.count === 3);

const uniq = findExpressionInPassageStrict("the cat and the dog and the bird", "cat");
check("unique token is not ambiguous", uniq.ambiguous === false && uniq.count === 1 && uniq.pos !== null);

const longPassage = "The dog barked. " + "filler ".repeat(20) + "The dog ran away.";
const ctx = findExpressionInPassageStrict(longPassage, "dog", "The dog barked");
check("surrounding context isolates one of two", ctx.ambiguous === false && ctx.count === 1);

// ── labelGlyphFamily ──
check("circled num family", labelGlyphFamily("②") === "CIRCLED_NUM");
check("circled letter family", labelGlyphFamily("ⓐ") === "CIRCLED_LETTER");
check("paren alpha family", labelGlyphFamily("(A)") === "PAREN_ALPHA");

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-set-leakage-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
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

test("question-set leakage gate: all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `leakage-gate failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 25, `expected ≥25 checks, got ${summary.passed}`);
});
