import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

interface PilotAssignment {
  ordinal: number;
  plan: "STANDARD" | "PREMIUM";
  modelId: string;
  candidateOpportunityCap: number;
  physicalFetchCap: number;
  outerAttemptCap: number;
  sdkRetryCap: number;
  maxOutputTokens: number;
  frozenWorstCaseUsdCap: number;
}

interface PilotProtocol {
  schemaVersion: string;
  status: string;
  source: {
    rowPublicId: string;
    questionType: string;
    publicCorpusSha256: string;
    excludedFromS1S2S3S4: boolean;
  };
  assignments: PilotAssignment[];
  campaignBounds: {
    globalCandidateLimit: number;
    requiredPrePilotUsedCandidates: number;
    reservedCandidates: number;
    maximumPostPilotUsedCandidates: number;
    maximumPhysicalFetches: number;
    maximumStartedAssignments: number;
    concurrency: number;
    replacementAllowed: boolean;
    topUpAllowed: boolean;
    automaticRetryAllowed: boolean;
    totalFrozenWorstCaseUsdCap: number;
  };
  exactProviderContract: {
    provider: Record<string, unknown>;
    reasoning: Record<string, unknown>;
    strictJsonSchema: boolean;
    completionCount: number;
  };
  admissionHolds: string[];
  credentialPolicy: {
    fullS1RequiresDedicatedZeroUsageHardCappedCredential: boolean;
    microPilotMayUseExistingCredential: boolean;
    providerSideHardCapProvenForMicroPilot: boolean;
  };
  accounting: {
    generationAuthorized: boolean;
    currentApiCandidatesConsumed: number;
  };
}

interface PublicCorpusRow {
  publicId: string;
  questionType: string;
  processingScopeStatus: string;
  passageSha256: string;
  machinePiiPatternHits: number;
  manualPiiObserved: boolean;
}

interface PublicCorpus {
  status: string;
  row: PublicCorpusRow;
  separation: { excludedFromS1S2S3S4: boolean };
}

interface PrivateCorpus {
  row: { publicId: string; passageText: string };
}

const protocol = JSON.parse(
  readFileSync(path.join(here, "protocol.json"), "utf8"),
) as PilotProtocol;
const corpus = JSON.parse(
  readFileSync(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
    ),
    "utf8",
  ),
) as PublicCorpus;

assert.equal(protocol.schemaVersion, "question-quality-v6-connectivity-pilot-v1");
assert.equal(protocol.status, "DESIGN_ONLY_EXECUTION_BLOCKED");
assert.equal(protocol.accounting.generationAuthorized, false);
assert.equal(protocol.accounting.currentApiCandidatesConsumed, 0);
assert.equal(protocol.source.rowPublicId, "OCVP-B01");
assert.equal(protocol.source.questionType, "BLANK_INFERENCE");
assert.equal(corpus.status, "SEALED_ORIGINAL_RUN_IN_SOURCE_NOT_DISPATCH_AUTHORIZATION");
const sourceRow = corpus.row;
assert.equal(sourceRow.publicId, protocol.source.rowPublicId);
assert.equal(sourceRow.questionType, protocol.source.questionType);
assert.equal(
  sourceRow.processingScopeStatus,
  "PERMITTED_BY_REQUESTING_USER_FOR_V6_CONNECTIVITY_PILOT_ONLY",
);
assert.equal(sourceRow.machinePiiPatternHits, 0);
assert.equal(sourceRow.manualPiiObserved, false);
assert.equal(corpus.separation.excludedFromS1S2S3S4, true);
assert.equal(protocol.source.excludedFromS1S2S3S4, true);
assert.equal(
  createHash("sha256")
    .update(
      readFileSync(
        path.join(
          repoRoot,
          "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json",
        ),
      ),
    )
    .digest("hex"),
  protocol.source.publicCorpusSha256,
);

assert.equal(protocol.assignments.length, 2);
assert.deepEqual(
  protocol.assignments.map((row) => row.ordinal),
  [1, 2],
);
assert.deepEqual(
  protocol.assignments.map((row) => row.plan),
  ["STANDARD", "PREMIUM"],
);
assert.deepEqual(
  protocol.assignments.map((row) => row.modelId),
  ["google/gemini-3.5-flash", "google/gemini-3.1-pro-preview"],
);
for (const assignment of protocol.assignments) {
  assert.equal(assignment.candidateOpportunityCap, 1);
  assert.equal(assignment.physicalFetchCap, 1);
  assert.equal(assignment.outerAttemptCap, 1);
  assert.equal(assignment.sdkRetryCap, 0);
  assert.equal(assignment.maxOutputTokens, 4000);
  assert(assignment.frozenWorstCaseUsdCap > 0);
}

const bounds = protocol.campaignBounds;
assert.equal(bounds.globalCandidateLimit, 1000);
assert.equal(bounds.requiredPrePilotUsedCandidates, 0);
assert.equal(bounds.reservedCandidates, 2);
assert.equal(bounds.maximumPostPilotUsedCandidates, 2);
assert.equal(bounds.maximumPhysicalFetches, 2);
assert.equal(bounds.maximumStartedAssignments, 2);
assert.equal(bounds.concurrency, 1);
assert.equal(bounds.replacementAllowed, false);
assert.equal(bounds.topUpAllowed, false);
assert.equal(bounds.automaticRetryAllowed, false);
const summedCost = protocol.assignments.reduce(
  (sum, row) => sum + row.frozenWorstCaseUsdCap,
  0,
);
assert(Math.abs(summedCost - bounds.totalFrozenWorstCaseUsdCap) < 1e-12);

assert.deepEqual(protocol.exactProviderContract.provider, {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
});
assert.deepEqual(protocol.exactProviderContract.reasoning, {
  enabled: false,
  effort: "none",
  exclude: true,
});
assert.equal(protocol.exactProviderContract.strictJsonSchema, true);
assert.equal(protocol.exactProviderContract.completionCount, 1);
assert(protocol.admissionHolds.length >= 7);
assert.equal(
  protocol.credentialPolicy.fullS1RequiresDedicatedZeroUsageHardCappedCredential,
  true,
);
assert.equal(protocol.credentialPolicy.microPilotMayUseExistingCredential, true);
assert.equal(protocol.credentialPolicy.providerSideHardCapProvenForMicroPilot, false);

const publicBytes = [
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(path.join(here, "protocol.json"), "utf8"),
].join("\n");
assert(!/sk-or-v1-[A-Za-z0-9_-]{16,}/.test(publicBytes));
const privateText = readFileSync(
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/private/pilot-source.private.json",
  ),
  "utf8",
);
const privateCorpus = JSON.parse(privateText) as PrivateCorpus;
assert.equal(privateCorpus.row.publicId, protocol.source.rowPublicId);
const exactPassage = privateCorpus.row.passageText;
assert(typeof exactPassage === "string");
assert(!publicBytes.includes(exactPassage));

const manifestPath = path.join(here, "MANIFEST.sha256");
if (existsSync(manifestPath)) {
  const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
  assert.equal(manifestLines.length, 5);
  for (const line of manifestLines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    const [, expected, name] = match;
    const actual = createHash("sha256")
      .update(readFileSync(path.join(here, name)))
      .digest("hex");
    assert.equal(actual, expected, `manifest mismatch: ${name}`);
  }
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS_DESIGN_ONLY_EXECUTION_BLOCKED",
      assignments: 2,
      reservedCandidates: 2,
      maximumPhysicalFetches: 2,
      maximumUsd: bounds.totalFrozenWorstCaseUsdCap,
      sourceRowPublicCommitment: sourceRow.passageSha256,
      protocolSha256: createHash("sha256")
        .update(readFileSync(path.join(here, "protocol.json")))
        .digest("hex"),
      apiCandidatesConsumed: 0,
      networkCalls: 0,
      modelCalls: 0,
    },
    null,
    2,
  ),
);
