import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import * as constantsModule from "@/app/api/ai/generate-questions-auto/_lib/constants";

import {
  BLANK_PROFILES,
  CAMPAIGN_ID,
  DESIGN_CEILING_USD,
  DESIGN_EMERGENCY_RATES_USD_PER_1M,
  DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
  DESIGN_SAFETY_MULTIPLIER,
  DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT,
  DIFFICULTIES,
  GRADE_INFO,
  GRAMMAR_PROFILES,
  MANIFEST_FILES,
  MODELS,
  PLANS,
  PROVIDER_ROUTING,
  REASONING_OFF,
  SCHOOL_TYPE,
  SEED,
  buildCampaignV6S1,
  fileSha256,
  here,
  paths,
  repoRoot,
  sha256,
  stableJson,
  type PrivateAssignment,
  type PrivatePassage,
  type PrivateQueue,
  type QuestionType,
} from "./build.mjs";

const constants =
  (constantsModule as unknown as { default?: typeof constantsModule }).default ??
  constantsModule;
const { DIFF_DESCRIPTION } = constants;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function verifyManifest(): void {
  const lines = readFileSync(paths.manifest, "utf8").trim().split(/\r?\n/u);
  assert.equal(lines.length, MANIFEST_FILES.length);
  assert.deepEqual(
    lines.map((line) => line.replace(/^[a-f0-9]{64}  /u, "")),
    [...MANIFEST_FILES],
  );
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    assert.equal(fileSha256(path.join(here, match[2])), match[1]);
  }
  assert.equal(readFileSync(paths.manifest, "utf8").includes("s1-queue-v6.json"), false);
}

function assertPrivateArtifactIgnored(): void {
  const relative = path.relative(repoRoot, paths.privateQueue).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "-q", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, "private queue must be gitignored");
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, "private queue must not be tracked");
}

function profilesFor(type: QuestionType): readonly string[] {
  return type === "GRAMMAR_ERROR" ? GRAMMAR_PROFILES : BLANK_PROFILES;
}

function validatePassage(passage: PrivatePassage): void {
  assert(SAFE_ID.test(passage.passageToken));
  assert(SHA256.test(passage.passageUtf8Sha256));
  assert.equal(
    Buffer.byteLength(passage.passageContentExact, "utf8"),
    passage.passageUtf8Bytes,
  );
  assert.equal(sha256(passage.passageContentExact), passage.passageUtf8Sha256);
  assert.equal(passage.historicalDbRequirement, "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE");
  assert(SHA256.test(passage.fullPrivateRowCommitmentSha256));
  assert(SHA256.test(passage.rights.rightsRecordHash));
  assert(SHA256.test(passage.rights.sourceRightsEvidenceHash));
  assert.equal(passage.rights.authorship, "CAMPAIGN_ORIGINAL");
  assert.equal(passage.rights.externalModelProcessingAuthorized, true);
  assert.equal(passage.rights.piiReview, "NO_PII_FOUND");
  assert.equal(passage.rights.passageUtf8Sha256, passage.passageUtf8Sha256);
  assert.equal(passage.rights.campaignScopeId, CAMPAIGN_ID);
  const materializerRightsRecord = {
    authorship: passage.rights.authorship,
    externalModelProcessingAuthorized: passage.rights.externalModelProcessingAuthorized,
    piiReview: passage.rights.piiReview,
    passageUtf8Sha256: passage.rights.passageUtf8Sha256,
  };
  assert.equal(
    passage.rights.rightsRecordHash,
    sha256(stableJson(materializerRightsRecord)),
    "rightsRecordHash must be the exact durable-materializer four-field hash",
  );
}

function validateAssignment(
  row: PrivateAssignment,
  passageByToken: ReadonlyMap<string, PrivatePassage>,
  index: number,
): void {
  const passage = passageByToken.get(row.passageToken);
  assert(passage, `${row.assignmentId}: missing passage`);
  assert.equal(row.queueOrdinal, index + 1);
  assert(SAFE_ID.test(row.assignmentId));
  assert(SAFE_ID.test(row.assignmentKey));
  assert.equal(row.orderRank, sha256(`${SEED}|order|${row.assignmentKey}`));
  assert.equal(
    row.assignmentId,
    `S1V6-${String(index + 1).padStart(3, "0")}-${row.orderRank.slice(0, 12)}`,
  );
  assert.equal(row.questionType, passage.questionType);
  assert(profilesFor(row.questionType).includes(row.profileId));
  assert(PLANS.includes(row.plan));
  assert(DIFFICULTIES.includes(row.difficulty));
  assert.equal(row.modelId, MODELS[row.plan]);
  assert.deepEqual(row.request.plan, [{
    subType: row.questionType,
    count: 1,
    reason: "S1 v6 immutable prompt-profile mechanism-screen assignment",
    targetPoints: [],
  }]);
  assert.equal(row.request.schoolType, SCHOOL_TYPE);
  assert.equal(row.request.gradeInfo, GRADE_INFO);
  assert.equal(row.request.passageContentRef, row.passageToken);
  assert.equal(row.request.teacherIntentBlock, "");
  assert.equal(row.request.analysisContext, "");
  assert.equal(row.request.customPrompt, "");
  assert.equal(row.request.diffLabel, row.difficulty);
  assert.equal(row.request.diffInstruction, DIFF_DESCRIPTION[row.difficulty]);
  assert.equal(row.request.generationPlan, row.plan);
  assert.deepEqual(row.wireContract.providerRouting, PROVIDER_ROUTING);
  assert.deepEqual(row.wireContract.reasoning, REASONING_OFF);
  assert.equal(row.wireContract.questionsMinItems, 1);
  assert.equal(row.wireContract.questionsMaxItems, 1);
  assert.equal(
    row.wireContract.maxOutputTokens,
    row.questionType === "GRAMMAR_ERROR" ? 6_000 : 4_000,
  );
  assert.equal(row.admission.candidateOpportunityCap, 1);
  assert.equal(row.admission.physicalFetchCap, 1);
  assert.equal(row.admission.fullQuestionSemanticCap, 1);
  assert.equal(row.admission.outerAttempts, 1);
  assert.equal(row.admission.sdkRetries, 0);
  assert.equal(row.admission.qualityMode, "strict");
  assert.equal(row.admission.attemptIndex, 0);
  assert.equal(row.admission.debitGlobalCandidateBudgetOnStartedOpportunity, 1);
  assert.equal(
    row.admission.pricingAuthority,
    "FRESH_SCHEMA_V2_EXACT_TAG_PROOF_PLUS_DURABLE_CONTROLLER",
  );
  assert.equal(row.admission.pricingAttached, false);
  assert.equal(row.topology.runner, "runQuestionGeneration.productionCore");
  assert.equal(row.topology.directSingleShotMechanismScreen, true);
  for (const forbidden of [
    "triggerTaskUsed",
    "ladderUsed",
    "repairUsed",
    "solverUsed",
    "fallbackUsed",
    "salvageUsed",
  ]) assert.equal(row.topology[forbidden], false);
  assert.equal(row.replacementAllowed, false);
  assert.equal(row.topUpAllowed, false);
  assert.equal(row.campaignEligible, false);
  assert.equal(row.generationAuthorized, false);
}

verifyManifest();
assertPrivateArtifactIgnored();

const privateRaw = readFileSync(paths.privateQueue, "utf8");
const publicRaw = readFileSync(paths.publicArtifact, "utf8");
const queue = JSON.parse(privateRaw) as PrivateQueue;
const publicArtifact = JSON.parse(publicRaw) as Record<string, unknown>;
assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v6-private-queue-v1");
assert.equal(queue.status, "IMMUTABLE_QUEUE_EXECUTION_BLOCKED");
assert.equal(queue.campaignId, CAMPAIGN_ID);
assert.equal(queue.seed, SEED);
assert.equal(queue.passages.length, 12);
assert.equal(queue.assignments.length, 180);
assert.equal(queue.noReplacementOrTopUp, true);
assert.equal(queue.campaignEligibleAssignments, 0);
assert.equal(queue.generationAuthorized, false);
assert.deepEqual(queue.safety, {
  modelApiCalls: 0,
  providerCalls: 0,
  networkCalls: 0,
  databaseCalls: 0,
  secretReads: 0,
  apiCandidatesConsumed: 0,
});
const queueCore = { ...queue } as Partial<PrivateQueue>;
delete queueCore.privateQueueSemanticSha256;
assert.equal(queue.privateQueueSemanticSha256, sha256(stableJson(queueCore)));

const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
assert.equal(passageByToken.size, 12);
assert.equal(new Set(queue.passages.map((row) => row.publicId)).size, 12);
assert.equal(new Set(queue.passages.map((row) => row.passageUtf8Sha256)).size, 12);
queue.passages.forEach(validatePassage);
queue.assignments.forEach((row, index) => validateAssignment(row, passageByToken, index));
assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);
assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
assert.deepEqual(countBy(queue.assignments.map((row) => row.questionType)), {
  BLANK_INFERENCE: 84,
  GRAMMAR_ERROR: 96,
});
assert.deepEqual(countBy(queue.assignments.map((row) => row.plan)), {
  PREMIUM: 84,
  STANDARD: 96,
});
assert.deepEqual(countBy(queue.assignments.map((row) => row.difficulty)), {
  INTERMEDIATE: 90,
  KILLER: 90,
});
assert.deepEqual(countBy(queue.assignments.map((row) => row.profileId)), {
  B0_CURRENT_CONTROL: 24,
  B1_TYPE_SCOPED_TAIL: 12,
  B2_POSITIVE_COMPACT: 24,
  B3_OPTION_INTENT_LEDGER: 24,
  G0_CURRENT_CONTROL: 24,
  G1_FINAL_CHECKLIST_ABLATION: 24,
  G2_POSITIVE_COMPACT: 24,
  G3_SITE_CERTIFICATE: 24,
});
assert.equal(
  queue.assignments.filter(
    (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
  ).length,
  0,
);
assert.equal(
  queue.assignments.reduce((sum, row) => sum + row.wireContract.maxOutputTokens, 0),
  912_000,
);
assert.equal(privateRaw.includes("perCallUsdCapCents"), false);
assert.equal(publicRaw.includes("perCallUsdCapCents"), false);

assert.equal(publicArtifact.schemaVersion, "question-quality-s1-campaign-v6-public-v1");
assert.equal(publicArtifact.status, "IMMUTABLE_DESIGN_EXECUTION_BLOCKED");
const frozenRuntime = publicArtifact.frozenRuntime as Record<string, unknown>;
const profileEvidence = frozenRuntime.profileEvidence as Record<string, unknown>;
assert.equal(profileEvidence.historicalIntegrationAuditRole, "HISTORICAL_BASELINE_ONLY");
assert.equal(profileEvidence.currentNegativeEvidenceAuditVerdict, "PASS_REMEDIATED_OFFLINE");
assert.equal(
  profileEvidence.currentNegativeEvidenceResultsSha256,
  fileSha256(paths.negativeProfileAuditResults),
);
assert.equal(
  profileEvidence.currentNegativeEvidenceFindingsSha256,
  fileSha256(paths.negativeProfileAuditFindings),
);
assert.equal(
  profileEvidence.currentNegativeEvidenceSourceClosureSha256,
  fileSha256(paths.negativeProfileAuditSourceClosure),
);
assert.equal(
  profileEvidence.currentNegativeEvidenceManifestSha256,
  fileSha256(paths.negativeProfileAuditManifest),
);
assert.equal(profileEvidence.liveQualityImprovementClaimed, false);
const publicQueue = publicArtifact.privateQueue as Record<string, unknown>;
assert.equal(publicQueue.fileSha256, fileSha256(paths.privateQueue));
assert.equal(publicQueue.semanticSha256, queue.privateQueueSemanticSha256);
assert.equal(publicQueue.utf8Bytes, Buffer.byteLength(privateRaw, "utf8"));
assert.equal(publicQueue.publicRowMembershipExposed, false);
const authorization = publicArtifact.authorization as Record<string, unknown>;
assert.equal(authorization.status, "BLOCKED");
assert.equal(authorization.campaignEligibleAssignments, 0);
assert.equal(authorization.generationAuthorized, false);
assert.equal(authorization.apiCandidatesConsumed, 0);
assert.equal(authorization.executionPricingAttached, false);
assert.equal(authorization.exactWirePreflightAttached, false);
assert.equal(authorization.durableControllerMaterialized, false);
const cost = publicArtifact.costAdmission as Record<string, unknown>;
assert.equal(cost.designCeilingUsd, DESIGN_CEILING_USD);
assert.equal(cost.designCeilingIsExecutionAuthorization, false);
assert.equal(cost.staleV5FlatPerCallCapsAcceptedAsExecutionAuthority, false);
const arithmetic = cost.planningArithmetic as Record<string, unknown>;
assert.equal(arithmetic.totalOutputTokens, 912_000);
assert.equal(
  arithmetic.exactWireBodyUtf8BytesCeiling,
  DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
);
assert.deepEqual(arithmetic.outputTokensByPlan, { STANDARD: 480_000, PREMIUM: 432_000 });
assert.deepEqual(arithmetic.emergencyRatesUsdPer1M, DESIGN_EMERGENCY_RATES_USD_PER_1M);
assert.equal(
  arithmetic.serverTokenOverheadUpperBoundPerAssignment,
  DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT,
);
assert.equal(arithmetic.safetyMultiplier, DESIGN_SAFETY_MULTIPLIER);
assert.equal(arithmetic.ratesAreLiveExecutionAuthority, false);
assert.equal(arithmetic.computedMaximumUsdAtDesignByteCeiling, 99.1229184);
assert(Number(arithmetic.computedMaximumUsdAtDesignByteCeiling) < DESIGN_CEILING_USD);

const publicRelease = [
  publicRaw,
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(paths.manifest, "utf8"),
].join("\n");
for (const passage of queue.passages) {
  for (const secret of [
    passage.publicId,
    passage.passageToken,
    passage.passageContentExact,
    passage.passageUtf8Sha256,
    passage.fullPrivateRowCommitmentSha256,
    passage.rights.rightsRecordHash,
    passage.rights.sourceRightsEvidenceHash,
    passage.rights.rightsProvenanceCommitmentSha256,
  ]) assert.equal(publicRelease.includes(secret), false, `public release leaked row member ${passage.publicId}`);
}
for (const row of queue.assignments) {
  for (const secret of [row.assignmentId, row.assignmentKey, row.orderRank]) {
    assert.equal(publicRelease.includes(secret), false, `public release leaked assignment ${row.queueOrdinal}`);
  }
}
for (const forbiddenField of [
  '"passageContentExact"',
  '"passageToken"',
  '"publicId"',
  '"assignmentId"',
  '"assignmentKey"',
  '"orderRank"',
  '"rightsRecordHash"',
]) assert.equal(publicRaw.includes(forbiddenField), false);

const reproduced = buildCampaignV6S1();
assert.equal(reproduced.privateBytes, privateRaw, "private queue is not reproducible");
assert.equal(reproduced.publicBytes, publicRaw, "public artifact is not reproducible");

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_IMMUTABLE_V6_S1_DESIGN_EXECUTION_BLOCKED",
  passages: queue.passages.length,
  assignments: queue.assignments.length,
  allocation: {
    grammar: 96,
    blankStandard: 48,
    blankPremium: 36,
    b1Premium: 0,
  },
  candidateOpportunityCap: 180,
  physicalFetchCap: 180,
  totalOutputTokenCeiling: 912_000,
  designCeilingUsd: 100,
  privateQueueFileSha256: fileSha256(paths.privateQueue),
  privateQueueSemanticSha256: queue.privateQueueSemanticSha256,
  publicArtifactSha256: fileSha256(paths.publicArtifact),
  manifestSha256: fileSha256(paths.manifest),
  apiCandidatesConsumed: 0,
}, null, 2)}\n`);
