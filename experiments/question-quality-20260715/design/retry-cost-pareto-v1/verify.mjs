import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildProfileComparison,
  buildScenarioMatrix,
  wrapperLogicalResponses,
  wrapperOutputTokens,
  wrapperPhysicalFetches,
} from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`VERIFY_FAIL: ${message}`);
}

function equal(actual, expected, message) {
  check(
    Object.is(actual, expected),
    `${message}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  );
}

function deepEqual(actual, expected, message) {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: canonical JSON differs`,
  );
}

const formulas = readJson(path.join(here, "formulas.json"));
const sourceHashes = readJson(path.join(here, "source-hashes.json"));
const matrix = readJson(path.join(here, "scenario-matrix.json"));
const profiles = readJson(path.join(here, "profile-comparison.json"));

equal(formulas.scope.networkCalls, 0, "declared network calls");
equal(formulas.scope.modelCalls, 0, "declared model calls");
equal(formulas.scope.apiCalls, 0, "declared API calls");
equal(formulas.scope.databaseCalls, 0, "declared database calls");
equal(
  formulas.scope.secretOrEnvironmentValueReads,
  0,
  "declared secret/environment reads",
);
equal(formulas.scope.candidateQuestionsCreated, 0, "declared candidates");

for (const entry of sourceHashes.files) {
  const bytes = readFileSync(path.join(root, entry.path));
  equal(sha256(bytes), entry.sha256, `source hash ${entry.path}`);
}

const sealedEnvelope = readJson(
  path.join(
    root,
    "experiments/question-quality-20260715/reviews/current-callgraph-topology-audit-v2/envelope.json",
  ),
);
equal(
  sealedEnvelope.auditId,
  sourceHashes.sealedTopologyAuditId,
  "sealed topology audit id",
);
equal(
  sealedEnvelope.verdict.premiumGrammarLadderPhysicalFetches,
  54,
  "sealed ladder physical ceiling",
);
equal(
  sealedEnvelope.durableAssignmentBudget.defaultMode,
  "OFF",
  "durable budget default",
);
equal(
  sealedEnvelope.durableAssignmentBudget.coverageVerdict,
  "PASS for the two current Workbench engine executions; FAIL as a universal guard over every production consumer of the shared engine",
  "universal budget coverage verdict",
);

const pricing = readJson(
  path.join(
    root,
    "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
  ),
);
const flash = pricing.models.find(
  (model) => model.id === formulas.models.flash.sourceDefaultId,
);
const pro = pricing.models.find(
  (model) => model.id === formulas.models.pro.sourceDefaultId,
);
check(Boolean(flash), "Flash price row exists");
check(Boolean(pro), "Pro price row exists");
equal(
  flash.conservativeRates.completionAnyTierUsdPerToken,
  formulas.models.flash.staleEmergencyOutputUsdPerToken,
  "Flash stale emergency output rate",
);
equal(
  pro.conservativeRates.completionAnyTierUsdPerToken,
  formulas.models.pro.staleEmergencyOutputUsdPerToken,
  "Pro stale emergency output rate",
);
equal(
  flash.conservativeRates.promptAnyTierUsdPerToken,
  formulas.models.flash.staleEmergencyInputUsdPerToken,
  "Flash stale emergency input rate",
);
equal(
  pro.conservativeRates.promptAnyTierUsdPerToken,
  formulas.models.pro.staleEmergencyInputUsdPerToken,
  "Pro stale emergency input rate",
);

equal(wrapperLogicalResponses(3), 9, "current wrapper logical responses");
equal(wrapperPhysicalFetches(3, 3), 27, "current wrapper physical fetches");
equal(
  wrapperOutputTokens(4096, 3, 3),
  540864,
  "W(4096,current)",
);
equal(
  wrapperOutputTokens(8192, 3, 3),
  577728,
  "W(8192,current)",
);
equal(
  wrapperOutputTokens(12000, 3, 3),
  612000,
  "W(12000,current)",
);
equal(
  wrapperOutputTokens(12288, 3, 3),
  614592,
  "W(12288,current)",
);
equal(
  wrapperOutputTokens(20000, 3, 3),
  684000,
  "W(20000,current)",
);
equal(
  wrapperOutputTokens(2048, 3, 3),
  522432,
  "W(2048,current)",
);

deepEqual(matrix, buildScenarioMatrix(), "scenario matrix deterministic rebuild");
deepEqual(profiles, buildProfileComparison(), "profile comparison deterministic rebuild");
equal(matrix.scenarioCount, 2952, "full-factorial scenario count");
deepEqual(
  matrix.cellScenarioCounts,
  {
    STANDARD_BLANK_INFERENCE_KILLER_SINGLE: 144,
    PREMIUM_BLANK_INFERENCE: 72,
    STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS: 288,
    STANDARD_GRAMMAR_ERROR_FIVE_MARKER_INTERMEDIATE: 288,
    STANDARD_GRAMMAR_ERROR_KILLER_RESCUE: 288,
    PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE: 1728,
    PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE: 144,
  },
  "per-cell matrix counts",
);

for (const row of matrix.scenarios) {
  const A = row.controls.wrapperApplicationAttempts;
  const S = row.controls.sdkPhysicalMultiplier;
  const T = row.controls.triggerExecutions;
  const stages = row.stageCountsPerEngine;
  equal(
    row.physicalFetchesPerEngine.candidateWrappers,
    (stages.candidateGenerationWrappers + stages.candidateRepairWrappers) *
      3 *
      A *
      S,
    `candidate physical arithmetic ${row.scenarioId}`,
  );
  equal(
    row.physicalFetchesPerEngine.evaluation,
    stages.evaluationWrappers * 3 * A * S,
    `evaluation physical arithmetic ${row.scenarioId}`,
  );
  equal(
    row.physicalFetchesPerEngine.total * T,
    row.triggerChainCeiling.physicalProviderFetches,
    `Trigger multiplication ${row.scenarioId}`,
  );
  equal(
    row.outputReservationPerEngine.totalTokens * T,
    row.outputReservationTriggerChain.totalTokens,
    `output multiplication ${row.scenarioId}`,
  );
  equal(row.totalUsdCeiling, null, `unbounded total USD ${row.scenarioId}`);
  equal(
    row.providerVisibleQuestionsArrayMaxItems,
    null,
    `unbounded questions cardinality ${row.scenarioId}`,
  );
}

const current = profiles.profiles.find(
  (profile) => profile.profileId === "CURRENT_SOURCE_CEILING",
);
check(Boolean(current), "current profile exists");
const expectedCurrent = {
  STANDARD_BLANK_INFERENCE_KILLER_SINGLE: {
    candidate: 432,
    design: 0,
    evaluation: 0,
    physical: 1296,
  },
  PREMIUM_BLANK_INFERENCE: {
    candidate: 108,
    design: 0,
    evaluation: 0,
    physical: 324,
  },
  STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS: {
    candidate: 324,
    design: 0,
    evaluation: 126,
    physical: 1350,
  },
  STANDARD_GRAMMAR_ERROR_FIVE_MARKER_INTERMEDIATE: {
    candidate: 252,
    design: 0,
    evaluation: 90,
    physical: 1026,
  },
  STANDARD_GRAMMAR_ERROR_KILLER_RESCUE: {
    candidate: 252,
    design: 0,
    evaluation: 90,
    physical: 1026,
  },
  PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE: {
    candidate: 192,
    design: 24,
    evaluation: 36,
    physical: 756,
  },
  PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE: {
    candidate: 144,
    design: 0,
    evaluation: 36,
    physical: 540,
  },
};
for (const [cellId, expected] of Object.entries(expectedCurrent)) {
  const actual = current.cells[cellId];
  equal(
    actual.candidateCapableLogicalResponses,
    expected.candidate,
    `${cellId} current Trigger candidate logical`,
  );
  equal(
    actual.designLogicalResponses,
    expected.design,
    `${cellId} current Trigger design logical`,
  );
  equal(
    actual.evaluationLogicalResponses,
    expected.evaluation,
    `${cellId} current Trigger evaluation logical`,
  );
  equal(
    actual.physicalProviderFetches,
    expected.physical,
    `${cellId} current Trigger physical`,
  );
}

equal(
  expectedCurrent.STANDARD_BLANK_INFERENCE_KILLER_SINGLE.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1.STANDARD_BLANK_INFERENCE_KILLER_SINGLE
    .physicalProviderFetches,
  "sealed Standard blank physical",
);
equal(
  expectedCurrent.PREMIUM_BLANK_INFERENCE.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1.PREMIUM_BLANK_INFERENCE
    .physicalProviderFetches,
  "sealed Premium blank physical",
);
equal(
  expectedCurrent.STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1.STANDARD_GRAMMAR_ERROR_EXTENDED_SETTINGS
    .physicalProviderFetches,
  "sealed Standard grammar extended physical",
);
equal(
  expectedCurrent.STANDARD_GRAMMAR_ERROR_FIVE_MARKER_INTERMEDIATE.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1
    .STANDARD_GRAMMAR_ERROR_FIVE_MARKER_OR_KILLER.physicalProviderFetches,
  "sealed Standard grammar five-marker physical",
);
equal(
  expectedCurrent.PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1.PREMIUM_GRAMMAR_ERROR_LADDER_ELIGIBLE
    .physicalProviderFetches,
  "sealed Premium grammar ladder physical",
);
equal(
  expectedCurrent.PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE.physical / 2,
  sealedEnvelope.perAttemptEnvelopeCount1.PREMIUM_GRAMMAR_ERROR_LADDER_INELIGIBLE
    .physicalProviderFetches,
  "sealed Premium grammar ineligible physical",
);

const expectedArtifactFiles = [
  "README.md",
  "REPORT.md",
  "build.mjs",
  "evidence-plan.md",
  "formulas.json",
  "implementation-proposal.md",
  "profile-comparison.json",
  "scenario-matrix.json",
  "source-hashes.json",
  "verify.mjs",
].sort();
const manifestLines = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const manifestFiles = [];
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  check(Boolean(match), `manifest syntax ${line}`);
  const [, expectedHash, relativePath] = match;
  check(!relativePath.includes(".."), `manifest traversal ${relativePath}`);
  equal(
    sha256(readFileSync(path.join(here, relativePath))),
    expectedHash,
    `manifest hash ${relativePath}`,
  );
  manifestFiles.push(relativePath);
}
deepEqual(manifestFiles.sort(), expectedArtifactFiles, "manifest exact file set");
const onDisk = readdirSync(here)
  .filter((name) => name !== "MANIFEST.sha256")
  .sort();
deepEqual(onDisk, expectedArtifactFiles, "artifact directory exact file set");

process.stdout.write(
  `${JSON.stringify({
    status: "PASS",
    studyId: formulas.studyId,
    checks,
    scenarioCount: matrix.scenarioCount,
    profileCount: profiles.profiles.length,
    sealedCurrentPhysicalBoundsReproduced: true,
    totalUsdCeiling: null,
    networkCalls: 0,
    modelCalls: 0,
    apiCalls: 0,
    databaseCalls: 0,
    secretOrEnvironmentValueReads: 0,
    candidateQuestionsCreated: 0,
  })}\n`,
);
