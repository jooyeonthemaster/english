import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This verifier is intentionally filesystem-only. Any accidental transport use
// is a hard failure rather than a silent audit side effect.
globalThis.fetch = async () => {
  throw new Error("NETWORK_FORBIDDEN_BY_OFFLINE_AUDIT");
};

const bundle = dirname(fileURLToPath(import.meta.url));
const root = resolve(bundle, "../../../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString("utf8");
const json = (path) => JSON.parse(text(path));
let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};
const equal = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  checks += 1;
};

const sourceIndex = json(
  "experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/source-files.json",
);
equal(sourceIndex.schemaVersion, 1, "source index schema");
for (const entry of sourceIndex.files) {
  equal(sha256(read(entry.path)), entry.sha256, `source drift: ${entry.path}`);
}

const envelope = json(
  "experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/envelope.json",
);
equal(envelope.schemaVersion, 2, "envelope schema");

const concurrency = text("src/lib/concurrency-config.ts");
for (const anchor of [
  "QUESTION_GENERATION_APPLICATION_RETRY_HARD_CAP = 2",
  "QUESTION_GENERATION_SDK_MAX_RETRIES = 2",
  "QUESTION_GENERATION_OUTER_ATTEMPT_HARD_CAP = 2",
  "WORKBENCH_QUESTION_TRIGGER_ATTEMPT_HARD_CAP = 2",
  "normalizeQuestionGenerationApplicationRetries",
  "normalizeQuestionGenerationOuterAttempts",
  "WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS",
  "GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS",
]) check(concurrency.includes(anchor), `missing concurrency anchor: ${anchor}`);

const llm = text("src/lib/question-generation-llm.ts");
for (const anchor of [
  "normalizeQuestionGenerationApplicationRetries(maxRetries)",
  "QUESTION_GENERATION_SDK_MAX_RETRIES",
  "attempt <= effectiveApplicationMaxRetries",
  "maxRetries: effectiveSdkMaxRetries",
  "generateObjectViaJsonFallback",
  "repairPremiumJsonOutput",
  "maxOutputTokens: 32_000",
  "minOutputTokens: 24_000",
  "experimental_repairText",
]) check(llm.includes(anchor), `missing LLM topology anchor: ${anchor}`);

const aiPackage = json("node_modules/ai/package.json");
const providerPackage = json("node_modules/@ai-sdk/provider/package.json");
const compatiblePackage = json("node_modules/@ai-sdk/openai-compatible/package.json");
equal(aiPackage.version, "6.0.99", "installed AI SDK version");
equal(providerPackage.version, "3.0.8", "installed provider package version");
equal(compatiblePackage.version, "2.0.56", "installed compatible provider version");
const aiDist = text("node_modules/ai/dist/index.js");
check(aiDist.includes("maxRetries = 2"), "installed SDK retry default anchor");
check(aiDist.includes("const maxRetriesResult = maxRetries != null ? maxRetries : 2"), "SDK retry normalization anchor");
check(aiDist.includes("parseAndValidateObjectResultWithRepair"), "SDK parse-repair topology anchor");
const providerDist = text("node_modules/@ai-sdk/provider/dist/index.js");
for (const anchor of ["statusCode === 408", "statusCode === 409", "statusCode === 429", "statusCode >= 500"]) {
  check(providerDist.includes(anchor), `retryable status anchor: ${anchor}`);
}

const ladder = text(
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
);
for (const anchor of [
  "GRAMMAR_PREMIUM_MAX_REGENS = 2",
  "researchTransportPolicy?.ladderParseMaxRetries ?? 1",
  "QUESTION_GENERATION_SDK_MAX_RETRIES",
  "attempt <= 1 + ctx.parseMaxRetries",
  "repairedThisCycle = false",
  "soft.length > 0 && !repairedThisCycle",
  "repairs++",
]) check(ladder.includes(anchor), `missing ladder anchor: ${anchor}`);

const engine = text(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
);
for (const anchor of [
  "Math.max(10, requestedMaxAttempts)",
  "Math.max(6, requestedMaxAttempts)",
  "Math.max(5, requestedMaxAttempts)",
  "Math.max(4, requestedMaxAttempts)",
  "PREMIUM_STRICT_ATTEMPT_CAP = 5",
  "STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP = 4",
  "Math.min(rawAttempts, PREMIUM_STRICT_ATTEMPT_CAP, requestedMaxAttempts)",
  "runGrammarPremiumLadder",
  "repairQuestionCandidate",
  "runGrammarSolverGate",
  "runGrammarScarceBestEffort",
  "runUniversalSalvage",
]) check(engine.includes(anchor), `missing engine anchor: ${anchor}`);

const atlas = text("src/lib/atlas-ai.ts");
for (const anchor of [
  'const GEMINI_FLASH_MODEL = "google/gemini-3.5-flash"',
  '"google/gemini-3.1-pro-preview"',
  "fetch: atlasProductionAssignmentFetch",
]) check(atlas.includes(anchor), `missing model/boundary anchor: ${anchor}`);

const policy = text("src/lib/question-generation-assignment-budget-policy.ts");
check(policy.includes('|| "OFF"'), "assignment budget default OFF");
check(policy.includes('effectiveMode = "SHADOW"'), "non-canary shadow downgrade");
const budgetRuntime = text("src/lib/question-generation-assignment-budget.ts");
check(budgetRuntime.includes('if (admission.mode === "OFF") return fn()'), "OFF exact bypass");
check(budgetRuntime.includes("runWithAtlasProductionAssignmentScope"), "active durable scope");

const fast = text("src/app/api/workbench/ai-jobs/question-generation/fast/route.ts");
check(fast.includes("max(1).default(1)"), "fast route exact count=1");
check(fast.includes("runWithQuestionGenerationAssignmentBudget"), "fast budget wrapper");
check(fast.includes('route: "FAST"'), "fast descriptor");
const trigger = text("src/trigger/workbench-question-generation.ts");
check(trigger.includes("maxAttempts: WORKBENCH_QUESTION_TRIGGER_MAX_ATTEMPTS"), "Trigger attempt cap wiring");
check(trigger.includes("runWithQuestionGenerationAssignmentBudget"), "Trigger budget wrapper");
check(trigger.includes('route: "TRIGGER"'), "Trigger descriptor");
check(trigger.includes('{ status: "PROCESSING", triggerRunId: ctx.run.id }'), "same-run PROCESSING reentry");

for (const path of envelope.durableAssignmentBudget.engineConsumersNotCovered) {
  const source = text(path);
  check(source.includes("runQuestionGenerationWithEmptyRetry"), `engine consumer anchor: ${path}`);
  check(!source.includes("runWithQuestionGenerationAssignmentBudget"), `unexpected budget wrapper: ${path}`);
}

const price = json("experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json");
equal(price.snapshotSha256, envelope.modelsAndPricing.localPricingEvidence.snapshotSha256Field, "pricing snapshot field");
const flash = price.models.find((model) => model.id === "google/gemini-3.5-flash");
const pro = price.models.find((model) => model.id === "google/gemini-3.1-pro-preview");
check(Math.abs(flash.conservativeRates.promptAnyTierUsdPerToken * 1_000_000 - 2.7) < 1e-12, "Flash emergency input rate");
check(Math.abs(flash.conservativeRates.completionAnyTierUsdPerToken * 1_000_000 - 16.2) < 1e-12, "Flash emergency output rate");
check(Math.abs(pro.conservativeRates.promptAnyTierUsdPerToken * 1_000_000 - 7.2) < 1e-12, "Pro emergency input rate");
check(Math.abs(pro.conservativeRates.completionAnyTierUsdPerToken * 1_000_000 - 32.4) < 1e-12, "Pro emergency output rate");

const R = envelope.sourceCaps.applicationMaxRetries;
const H = envelope.sourceCaps.physicalFetchesPerExplicitSdkInvocation;
equal((R + 1) * 3, envelope.atomic.ordinaryFullSchemaWrapper.candidateOrEvaluationLogicalResponses, "wrapper logical arithmetic");
equal((R + 1) * 3 * H, envelope.atomic.ordinaryFullSchemaWrapper.physicalProviderFetches, "wrapper physical arithmetic");
equal(3 * 3 * 2 * H, envelope.atomic.premiumGrammarLadder.physicalProviderFetches, "ladder 54 arithmetic");

const cells = envelope.perAttemptEnvelopeCount1;
equal(cells.STANDARD_BLANK_INFERENCE_KILLER_SINGLE.candidateWrapperInvocations * 27, 648, "Standard blank envelope");
equal(cells.PREMIUM_BLANK_INFERENCE.candidateWrapperInvocations * 27, 162, "Premium blank envelope");
equal((cells.STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS.candidateWrapperInvocations + cells.STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS.solverWrapperInvocations) * 27, 675, "Standard grammar extended envelope");
equal((cells.STANDARD_GRAMMAR_ERROR_FIVE_MARKER_OR_KILLER.candidateWrapperInvocations + cells.STANDARD_GRAMMAR_ERROR_FIVE_MARKER_OR_KILLER.solverWrapperInvocations) * 27, 513, "Standard grammar five-marker envelope");
equal(cells.PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE.designLogicalResponses * H + cells.PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE.candidateLogicalResponses * H + cells.PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE.evaluationLogicalResponses * H, 378, "Premium grammar ladder envelope");
equal((cells.PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE.candidateLogicalResponses + cells.PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE.evaluationLogicalResponses) * H, 270, "Premium grammar legacy envelope");

const W = (m) => 9 * m + 504_000;
const reservations = envelope.modelsAndPricing.outputOnlyEmergencyDiagnostics.wrapperReservations;
equal(W(4_096), reservations.m4096, "W(4096)");
equal(W(8_192), reservations.m8192, "W(8192)");
equal(W(12_288), reservations.m12288, "W(12288)");
equal(W(20_000), reservations.m20000, "W(20000)");
equal(W(2_048), reservations.solverM2048, "W(2048)");

const manifestText = text(
  "experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/MANIFEST.sha256",
);
for (const line of manifestText.trim().split(/\r?\n/u)) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/u);
  check(match, `malformed manifest line: ${line}`);
  equal(sha256(read(`experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/${match[2]}`)), match[1], `bundle drift: ${match[2]}`);
}

console.log(JSON.stringify({
  status: "PASS",
  auditId: envelope.auditId,
  checks,
  externalNetworkCalls: 0,
  modelCalls: 0,
  apiCalls: 0,
  databaseCalls: 0,
  secretOrEnvironmentValueReads: 0,
  premiumGrammarLadderPhysicalFetches: 54,
  shipReadyUsdCap: "NOT_PROVEN"
}));
