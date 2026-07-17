import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This verifier is intentionally local-only. Any accidental network use fails.
globalThis.fetch = async () => {
  throw new Error("NETWORK_FORBIDDEN_BY_CURRENT_CALLGRAPH_ENVELOPE_AUDIT");
};

const auditDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(auditDir, "../../../..");

const readUtf8 = (path) => readFile(resolve(repoRoot, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = async (path) => sha256(await readFile(resolve(repoRoot, path)));

const envelopePath = "experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/envelope.json";
const sourceFilesPath = "experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/source-files.json";
const auditPath = "experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/audit.md";
const verifyPath = "experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/verify.mjs";
const manifestPath = "experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/MANIFEST.sha256";

const envelope = JSON.parse(await readUtf8(envelopePath));
const sourceFiles = JSON.parse(await readUtf8(sourceFilesPath));

assert.equal(envelope.schemaVersion, 1);
assert.equal(sourceFiles.schemaVersion, 1);
assert.equal(envelope.auditId, sourceFiles.auditId);
assert.equal(envelope.snapshot.networkOrApiCalls, 0);
assert.equal(envelope.snapshot.databaseCalls, 0);
assert.equal(envelope.snapshot.secretsOrEnvironmentValuesRead, false);
assert.equal(envelope.verdict.ordinaryProductionAbsolutePerAssignment, "UNKNOWN_UNBOUNDED_FROM_SOURCE");
assert.equal(envelope.verdict.researchExactOperationalFourCellEnvelope, "BLOCK");

// Bind every audited production/research/test/package file, including installed SDK code.
const seenSourcePaths = new Set();
for (const entry of sourceFiles.files) {
  assert.match(entry.path, /^[^\\]+(?:\/[^\\]+)*$/);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  assert.ok(!seenSourcePaths.has(entry.path), `duplicate source path: ${entry.path}`);
  seenSourcePaths.add(entry.path);
  assert.equal(await hashFile(entry.path), entry.sha256, `source drift: ${entry.path}`);
}
assert.ok(sourceFiles.files.length >= 35);

const packageLock = JSON.parse(await readUtf8("package-lock.json"));
assert.equal(packageLock.packages["node_modules/ai"].version, "6.0.99");
assert.equal(packageLock.packages["node_modules/@ai-sdk/provider"].version, "3.0.8");
assert.equal(packageLock.packages["node_modules/@ai-sdk/openai-compatible"].version, "2.0.56");

const concurrency = await readUtf8("src/lib/concurrency-config.ts");
assert.match(concurrency, /function readPositiveIntegerEnv[\s\S]*?return integer > 0 \? integer : fallback;/);
assert.match(concurrency, /GEMINI_QUESTION_MAX_RETRIES[\s\S]*?"GEMINI_QUESTION_MAX_RETRIES",\s*2/);
assert.match(concurrency, /GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS[\s\S]*?"GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS",\s*2/);
assert.doesNotMatch(concurrency.slice(0, concurrency.indexOf("function capConcurrency")), /Math\.min/);

const llm = await readUtf8("src/lib/question-generation-llm.ts");
assert.match(llm, /for \(let attempt = 0; attempt <= maxRetries; attempt\+\+\)/);
assert.match(llm, /experimental_repairText:[\s\S]*?repairPremiumJsonOutput/);
assert.match(
  llm,
  /if \(hasQuestionGenerationResearchRuntime\(\)\) \{[\s\S]*?prompt-JSON downgrade is disabled[\s\S]*?continue;[\s\S]*?Structured-output rejected by provider[\s\S]*?generateObjectViaJsonFallback/,
);
assert.match(llm, /const result = await generateText\([\s\S]*?let candidate = parseJsonLoose\(rawText\)/);
assert.match(llm, /const repaired = await repairPremiumJsonOutput\(/);
assert.match(llm, /output: Output\.json\(\)/);

const runGeneration = await readUtf8(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
);
assert.match(runGeneration, /hasKillerSingleBlankInference[\s\S]*?Math\.max\(10, requestedMaxAttempts\)/);
assert.match(runGeneration, /hasExtendedRetryType[\s\S]*?Math\.max\(6, requestedMaxAttempts\)/);
assert.match(runGeneration, /const PREMIUM_STRICT_ATTEMPT_CAP = 5/);
assert.match(runGeneration, /const STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP = 4/);
assert.match(runGeneration, /for \(let attempt = 1; attempt <= attempts; attempt \+= 1\)/);
assert.match(runGeneration, /runGrammarScarceBestEffort\(\)[\s\S]*?runUniversalSalvage\(\)/);
assert.match(runGeneration, /qualityMode: "relaxed"/);
assert.match(runGeneration, /qualityMode: "scarce"/);
assert.match(runGeneration, /repairQuestionCandidate\(/);
assert.match(runGeneration, /runGrammarSolverGate\([\s\S]*?generationPlan: "STANDARD"/);
assert.match(runGeneration, /runGrammarPremiumLadder\(/);
assert.match(runGeneration, /falling back to the legacy PREMIUM generation path/);

const ladder = await readUtf8(
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
);
assert.match(ladder, /GRAMMAR_PREMIUM_MAX_REGENS\s*=\s*2/);
assert.match(ladder, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
assert.match(ladder, /repairedThisCycle = false/);
assert.match(ladder, /repairedThisCycle = true/);
const callLadderBody = ladder.slice(
  ladder.indexOf("async function callLadderModel"),
  ladder.indexOf("export async function runGrammarPremiumLadder"),
);
assert.equal((callLadderBody.match(/await fireOnce\(/g) ?? []).length, 1);
assert.doesNotMatch(callLadderBody, /reasoning-fallback/);

const sdk = await readUtf8("node_modules/ai/dist/index.js");
assert.match(sdk, /maxRetries = 2/);
assert.match(sdk, /const maxRetriesResult = maxRetries != null \? maxRetries : 2/);
assert.match(sdk, /const generateResult = await retry\([\s\S]*?model\.doGenerate/);
assert.match(sdk, /const object2 = await parseAndValidateObjectResultWithRepair/);
assert.ok(
  sdk.indexOf("const object2 = await parseAndValidateObjectResultWithRepair") >
    sdk.indexOf("const generateResult = await retry"),
);

const provider = await readUtf8("node_modules/@ai-sdk/provider/dist/index.js");
assert.match(
  provider,
  /statusCode === 408[\s\S]*?statusCode === 409[\s\S]*?statusCode === 429[\s\S]*?statusCode >= 500/,
);

const researchSchema = await readUtf8("src/lib/question-generation-research-schema.ts");
assert.match(researchSchema, /return z\.object\(\{ questions \}\)/);
assert.match(researchSchema, /questions\.length\(researchQuestionCount\)/);

const atlasAi = await readUtf8("src/lib/atlas-ai.ts");
assert.match(atlasAi, /fetch: atlasResearchFetch/);
assert.match(atlasAi, /responseFormat\.type === "json_schema"/);
assert.match(atlasAi, /require_parameters: true/);

const boundary = await readUtf8("src/lib/atlas-research-fetch-boundary.ts");
assert.match(boundary, /responseFormat\.type === "json_object"[\s\S]*?structurallyFixedOutputsPerCompletion: null/);
assert.match(boundary, /minItems !== null && minItems === maxItems \? minItems : null/);
assert.match(boundary, /if \(!internal\) \{[\s\S]*?return delegate\(input, init\)/);
assert.match(boundary, /const physicalOrdinal = \+\+internal\.operationState\.nextPhysicalOrdinal/);

const controller = await readUtf8("experiments/question-quality-20260715/harness/atlas-controller.ts");
assert.match(
  controller,
  /entry\.wire\.structurallyFixedOutputsPerCompletion !==[\s\S]*?entry\.candidateContract\.candidatesPerCompletion[\s\S]*?candidate contract must use a structurally fixed maximum cardinality/,
);

const phaseCRunner = await readUtf8(
  "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
);
assert.match(phaseCRunner, /generation\.plan\.length !== 1/);
assert.match(phaseCRunner, /item\.count !== adapter\.expectedQuestionsPerStructuredCall/);
assert.match(phaseCRunner, /runQuestionGenerationWithEmptyRetry\(generation/);
assert.doesNotMatch(phaseCRunner, /maxRetries/);

const adapter = await readUtf8(
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
);
assert.match(adapter, /repeatRootEntryId/);
assert.match(adapter, /research repeated root stage requires a derived registry entry/);
assert.match(adapter, /unregistered research child stage/);

const fixture = await readUtf8(
  "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts",
);
assert.match(fixture, /process\.env\.GEMINI_QUESTION_MAX_RETRIES = "1"/);
assert.match(fixture, /maxAttempts: 1/);
assert.match(fixture, /deadlineAt: Date\.now\(\) - 1/);
assert.match(fixture, /assert\.equal\(secondRunBodies\.length, 1\)/);

const campaign = JSON.parse(
  await readUtf8("experiments/question-quality-20260715/design/campaign-v4/campaign-v4.json"),
);
assert.equal(campaign.status, "DESIGN_COMPLETE_EXECUTION_BLOCKED");
assert.equal(campaign.authorization.modelApiCalls, 0);
assert.equal(campaign.authorization.operationalCandidateSlots, 0);
assert.equal(campaign.reducedRegistry.operationalAuthorization, 0);
assert.equal(campaign.reducedRegistry.candidateBudget.candidatePhysicalRetries, 0);

// Count the active English UI, registered English schemas, and Korean registry separately.
const questionUi = await readUtf8("src/lib/question-type-ui.ts");
const activeGroupBody = questionUi.slice(
  questionUi.indexOf("export const QUESTION_TYPE_GROUPS ="),
  questionUi.indexOf("export const QUESTION_TYPE_GROUPS_KO"),
);
const activeEnglish = [
  ...new Set(
    [...activeGroupBody.matchAll(/QUESTION_TYPE_UI\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
  ),
];
assert.equal(activeEnglish.length, 25);
assert.ok(!activeEnglish.includes("TOPIC_MAIN_IDEA"));

const questionSchemas = await readUtf8("src/lib/question-schemas.ts");
const englishSchemaBody = questionSchemas.slice(
  questionSchemas.indexOf("export const QUESTION_SCHEMAS"),
  questionSchemas.indexOf("export function getResponseSchema"),
);
const registeredEnglish = [
  ...new Set(
    [...englishSchemaBody.matchAll(/\b([A-Z][A-Z0-9_]*)\s*:/g)].map((match) => match[1]),
  ),
].filter((typeId) => typeId !== "QUESTION_SCHEMAS");
assert.equal(registeredEnglish.length, 26);
assert.ok(registeredEnglish.includes("TOPIC_MAIN_IDEA"));

const koRegistry = await readUtf8("src/lib/korean/registry/index.ts");
const koModuleBody = koRegistry.slice(
  koRegistry.indexOf("const MODULES:"),
  koRegistry.indexOf("export const KO_TYPE_REGISTRY"),
);
const registeredKorean = [
  ...new Set([...koModuleBody.matchAll(/\bKO_[A-Z0-9_]+\b/g)].map((match) => match[0])),
];
assert.equal(registeredKorean.length, 38);
assert.equal(registeredEnglish.length + registeredKorean.length, 64);
assert.deepEqual(envelope.typeCounts, {
  activeEnglishUi: 25,
  registeredEnglishIncludingLegacy: 26,
  legacyEnglishExcludedFromActiveUi: ["TOPIC_MAIN_IDEA"],
  registeredKorean: 38,
  combinedRegisteredRuntime: 64,
  warning: "Do not describe 26 or 64 as the active English UI count.",
});

// Recompute every headline repository-default envelope.
const R = 2;
const E = 2;
const A = R + 1;
const H = 3;
const O = 3 * A;
const X = A;
const standardBlankStrict = Math.max(10, E);
const premiumStrict = Math.min(E, 5);
const standardGrammarStrict = Math.max(6, E);

const expectedOrdinary = {
  STANDARD_BLANK_INFERENCE: {
    candidate: 2 * O * (standardBlankStrict + 2),
    evaluation: 0,
    design: 0,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidate: 2 * O * (premiumStrict + 1),
    evaluation: 0,
    design: 0,
  },
  STANDARD_GRAMMAR_ERROR: {
    candidate: 2 * O * (standardGrammarStrict + 3),
    evaluation: O * (standardGrammarStrict + 1),
    design: 0,
  },
  PREMIUM_GRAMMAR_ERROR: {
    candidate: premiumStrict * (12 + 2 * O) + 4 * O,
    evaluation: premiumStrict * O,
    design: 6 * premiumStrict,
  },
};
const expectedExact = {
  STANDARD_BLANK_INFERENCE: {
    candidate: 2 * X * (standardBlankStrict + 2),
    evaluation: 0,
    design: 0,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidate: 2 * X * (premiumStrict + 1),
    evaluation: 0,
    design: 0,
  },
  STANDARD_GRAMMAR_ERROR: {
    candidate: 2 * X * (standardGrammarStrict + 3),
    evaluation: X * (standardGrammarStrict + 1),
    design: 0,
  },
  PREMIUM_GRAMMAR_ERROR: {
    candidate: premiumStrict * (12 + 2 * X) + 4 * X,
    evaluation: premiumStrict * X,
    design: 6 * premiumStrict,
  },
};

for (const [cell, expected] of Object.entries(expectedOrdinary)) {
  const actual = envelope.ordinaryProductionRepositoryDefaultDiagnostic[cell]
    .maximizingRejectedCandidateChain;
  assert.equal(actual.logicalCandidateResponses, expected.candidate, `${cell} ordinary candidate`);
  assert.equal(actual.logicalEvaluationResponses, expected.evaluation, `${cell} ordinary evaluation`);
  assert.equal(actual.logicalDesignResponses, expected.design, `${cell} ordinary design`);
  assert.equal(
    actual.physicalProviderFetches,
    H * (expected.candidate + expected.evaluation + expected.design),
    `${cell} ordinary physical`,
  );
}

for (const [cell, expected] of Object.entries(expectedExact)) {
  const actual = envelope.researchExactStructuredSourcePolicyDiagnostic[cell]
    .maximizingRejectedCandidateChain;
  assert.equal(actual.logicalCandidateResponses, expected.candidate, `${cell} exact candidate`);
  assert.equal(actual.logicalEvaluationResponses, expected.evaluation, `${cell} exact evaluation`);
  assert.equal(actual.logicalDesignResponses, expected.design, `${cell} exact design`);
  assert.equal(
    actual.physicalProviderFetches,
    H * (expected.candidate + expected.evaluation + expected.design),
    `${cell} exact physical`,
  );
}

assert.equal(envelope.atomicDefaultDiagnostic.premiumGrammarLadder.physicalProviderFetches, 54);
assert.equal(
  envelope.ordinaryProductionRepositoryDefaultDiagnostic.PREMIUM_GRAMMAR_ERROR
    .maximizingRejectedCandidateChain.physicalProviderFetches,
  378,
);
assert.equal(envelope.researchPhaseCCurrentFixture.physicalProviderFetches, 1);
assert.equal(envelope.researchPhaseCCurrentFixture.promptJsonDispatches, 0);

// Ensure no credential-shaped value was copied into the audit artifacts.
for (const path of [auditPath, envelopePath, sourceFilesPath, verifyPath]) {
  assert.doesNotMatch(await readUtf8(path), /AIza[0-9A-Za-z_-]{20,}/, `credential-shaped text: ${path}`);
}

// Verify the artifact manifest last. The manifest deliberately excludes itself.
const manifestText = await readUtf8(manifestPath);
const manifestEntries = manifestText
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, `invalid manifest line: ${line}`);
    return { hash: match[1], path: match[2] };
  });
assert.deepEqual(
  manifestEntries.map((entry) => entry.path),
  ["audit.md", "envelope.json", "source-files.json", "verify.mjs"],
);
for (const entry of manifestEntries) {
  assert.equal(
    await hashFile(`experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/${entry.path}`),
    entry.hash,
    `artifact drift: ${entry.path}`,
  );
}

console.log(
  JSON.stringify({
    status: "PASS",
    networkCalls: 0,
    databaseCalls: 0,
    sourceFiles: sourceFiles.files.length,
    activeEnglish: activeEnglish.length,
    registeredEnglish: registeredEnglish.length,
    registeredKorean: registeredKorean.length,
    ordinaryDefaultPhysical: Object.fromEntries(
      Object.entries(expectedOrdinary).map(([cell, value]) => [
        cell,
        H * (value.candidate + value.evaluation + value.design),
      ]),
    ),
    exactHypotheticalPhysical: Object.fromEntries(
      Object.entries(expectedExact).map(([cell, value]) => [
        cell,
        H * (value.candidate + value.evaluation + value.design),
      ]),
    ),
  }),
);
