import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => {
  throw new Error("NETWORK_FORBIDDEN_BY_RETRY_ENVELOPE_CLOSURE_V1");
};

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "../../../..");
const relativeDir = "experiments/question-quality-20260715/design/retry-envelope-closure-v1";
const readRoot = (path) => readFile(resolve(root, path), "utf8");
const hashBuffer = (buffer) => createHash("sha256").update(buffer).digest("hex");
const hashRootFile = async (path) => hashBuffer(await readFile(resolve(root, path)));

const design = JSON.parse(await readRoot(`${relativeDir}/design.json`));
const snapshot = JSON.parse(await readRoot(`${relativeDir}/source-snapshot.json`));

assert.equal(design.schemaVersion, 1);
assert.equal(snapshot.schemaVersion, 1);
assert.equal(design.snapshot.gitHead, snapshot.gitHead);
assert.equal(design.snapshot.networkOrApiCalls, 0);
assert.equal(design.snapshot.databaseCalls, 0);
assert.equal(design.snapshot.productionSourceEdits, 0);
assert.equal(design.currentVerdict.engineInvocationAbsoluteEnvelope, "UNKNOWN_UNBOUNDED_FROM_SOURCE");
assert.equal(design.currentVerdict.triggerAssignmentAbsoluteEnvelope, "UNKNOWN_UNBOUNDED_FROM_SOURCE");
assert.equal(design.currentVerdict.fourCellResearchOperationalRegistry, "BLOCK");

for (const entry of snapshot.files) {
  assert.match(entry.path, /^[^\\]+(?:\/[^\\]+)*$/);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.equal(await hashRootFile(entry.path), entry.sha256, `source drift: ${entry.path}`);
}
assert.equal(snapshot.files.length, 11);

// Verify the current gaps this design closes. These checks intentionally fail after implementation,
// at which point a post-implementation audit must replace this design snapshot.
const concurrency = await readRoot("src/lib/concurrency-config.ts");
assert.match(concurrency, /function readPositiveIntegerEnv[\s\S]*?return integer > 0 \? integer : fallback;/);
assert.match(concurrency, /WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS[\s\S]*?readPositiveIntegerEnv\("TRIGGER_WORKBENCH_QUESTION_MAX_ATTEMPTS", 2\)/);
assert.match(concurrency, /GEMINI_QUESTION_MAX_RETRIES[\s\S]*?readPositiveIntegerEnv\([\s\S]*?2/);
assert.match(concurrency, /GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS[\s\S]*?readPositiveIntegerEnv\("GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS", 2\)/);

const llm = await readRoot("src/lib/question-generation-llm.ts");
assert.match(llm, /maxRetries = GEMINI_QUESTION_MAX_RETRIES/);
assert.match(llm, /for \(let attempt = 0; attempt <= maxRetries; attempt\+\+\)/);
assert.doesNotMatch(llm, /maxRetries:\s*(?:effectiveSdk|maxSdk|QUESTION_GENERATION_SDK)/);
assert.match(llm, /experimental_repairText:[\s\S]*?repairPremiumJsonOutput/);

const ladder = await readRoot("src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts");
assert.match(ladder, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
assert.match(ladder, /const res = await generateObject\(\{/);

const runGeneration = await readRoot("src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts");
assert.match(runGeneration, /const requestedMaxAttempts = Math\.floor\(maxAttempts\)/);
assert.match(runGeneration, /Math\.max\(10, requestedMaxAttempts\)/);
assert.match(runGeneration, /Math\.max\(6, requestedMaxAttempts\)/);

const phaseRunner = await readRoot("experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts");
assert.match(phaseRunner, /maxAttempts\?: number/);
assert.match(phaseRunner, /runQuestionGenerationWithEmptyRetry\(generation, \{[\s\S]*?maxAttempts/);

// Independent arithmetic for current-default == proposed engine absolute after cap=2.
const R = design.proposedServerOwnedCaps.applicationMaxRetries;
const K = design.proposedServerOwnedCaps.sdkMaxRetries;
const E = design.proposedServerOwnedCaps.outerRequestedMaxAttempts;
const T = design.proposedServerOwnedCaps.workbenchTriggerMaxAttempts;
assert.deepEqual({ R, K, E, T }, { R: 2, K: 2, E: 2, T: 2 });
const A = R + 1;
const H = K + 1;
const O = 3 * A;
const standardBlankS = Math.max(10, E);
const premiumS = Math.max(1, Math.min(Math.max(4, E), 5, E));
const standardGrammarS = Math.max(6, E);

const ordinary = {
  STANDARD_BLANK_INFERENCE: {
    candidateResponses: 2 * O * (standardBlankS + 2),
    evaluationResponses: 0,
    designResponses: 0,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidateResponses: 2 * O * (premiumS + 1),
    evaluationResponses: 0,
    designResponses: 0,
  },
  STANDARD_GRAMMAR_ERROR: {
    candidateResponses: 2 * O * (standardGrammarS + 3),
    evaluationResponses: O * (standardGrammarS + 1),
    designResponses: 0,
  },
  PREMIUM_GRAMMAR_ERROR: {
    candidateResponses: premiumS * (12 + 2 * O) + 4 * O,
    evaluationResponses: premiumS * O,
    designResponses: 6 * premiumS,
  },
};

for (const [cell, calculated] of Object.entries(ordinary)) {
  const expected = design.ordinaryProductionEngineAbsoluteAfterProposal[cell];
  assert.equal(calculated.candidateResponses, expected.candidateResponses, `${cell} candidates`);
  assert.equal(calculated.evaluationResponses, expected.evaluationResponses, `${cell} evaluations`);
  assert.equal(calculated.designResponses, expected.designResponses, `${cell} designs`);
  const physical = H * (
    calculated.candidateResponses + calculated.evaluationResponses + calculated.designResponses
  );
  assert.equal(physical, expected.physicalProviderFetches, `${cell} physical`);
  assert.equal(T * physical, expected.triggerAssignmentPhysicalAtMaxAttempts2, `${cell} trigger`);
}

// Research single-dispatch: one SDK invocation/fetch per registered exact stage and
// one fire per ladder stage. Outer production pass topology remains unchanged.
const X = 1;
const research = {
  STANDARD_BLANK_INFERENCE: {
    candidateSlots: 2 * X * (standardBlankS + 2),
    evaluationResponses: 0,
    designResponses: 0,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidateSlots: 2 * X * (premiumS + 1),
    evaluationResponses: 0,
    designResponses: 0,
  },
  STANDARD_GRAMMAR_ERROR: {
    candidateSlots: 2 * X * (standardGrammarS + 3),
    evaluationResponses: X * (standardGrammarS + 1),
    designResponses: 0,
  },
  PREMIUM_GRAMMAR_ERROR: {
    candidateSlots: premiumS * (6 + 2 * X) + 4 * X,
    evaluationResponses: premiumS * X,
    designResponses: 3 * premiumS,
  },
};

for (const [cell, calculated] of Object.entries(research)) {
  const expected = design.researchExactSingleDispatchArithmetic[cell];
  assert.deepEqual(calculated, {
    candidateSlots: expected.candidateSlots,
    evaluationResponses: expected.evaluationResponses,
    designResponses: expected.designResponses,
  }, `${cell} research breakdown`);
  assert.equal(
    calculated.candidateSlots + calculated.evaluationResponses + calculated.designResponses,
    expected.physicalProviderFetches,
    `${cell} research physical`,
  );
}

// No credential-shaped text may enter the artifact set.
for (const name of ["README.md", "design.json", "source-snapshot.json", "verify.mjs"]) {
  assert.doesNotMatch(await readRoot(`${relativeDir}/${name}`), /AIza[0-9A-Za-z_-]{20,}/);
}

const manifestText = await readRoot(`${relativeDir}/MANIFEST.sha256`);
const entries = manifestText.trim().split(/\r?\n/).filter(Boolean).map((line) => {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  assert.ok(match, `invalid manifest line: ${line}`);
  return { hash: match[1], path: match[2] };
});
assert.deepEqual(entries.map((entry) => entry.path), [
  "README.md",
  "design.json",
  "source-snapshot.json",
  "verify.mjs",
]);
for (const entry of entries) {
  assert.equal(await hashRootFile(`${relativeDir}/${entry.path}`), entry.hash, `artifact drift: ${entry.path}`);
}

console.log(JSON.stringify({
  status: "PASS_DESIGN_ONLY",
  sourceFiles: snapshot.files.length,
  networkCalls: 0,
  databaseCalls: 0,
  ordinaryEnginePhysical: Object.fromEntries(
    Object.entries(design.ordinaryProductionEngineAbsoluteAfterProposal)
      .map(([cell, value]) => [cell, value.physicalProviderFetches]),
  ),
  researchSingleDispatchPhysical: Object.fromEntries(
    Object.entries(design.researchExactSingleDispatchArithmetic)
      .filter(([, value]) => typeof value === "object")
      .map(([cell, value]) => [cell, value.physicalProviderFetches]),
  ),
}));

