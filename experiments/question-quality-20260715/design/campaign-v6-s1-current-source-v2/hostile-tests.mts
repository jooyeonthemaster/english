import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertExactResealBytes,
  buildCurrentSourceReseal,
  paths,
} from "./build.mjs";

const baseline = buildCurrentSourceReseal();
const privateRaw = readFileSync(paths.privateQueue, "utf8");
const publicRaw = readFileSync(paths.publicArtifact, "utf8");
assertExactResealBytes(publicRaw, privateRaw);

type Mutation = {
  id: string;
  target: "public" | "private";
  mutate: (value: Record<string, any>) => void;
};

const mutations: Mutation[] = [
  { id: "authorize", target: "public", mutate: (v) => { v.authorization.generationAuthorized = true; } },
  { id: "eligibility", target: "public", mutate: (v) => { v.authorization.campaignEligibleAssignments = 180; } },
  { id: "freeze", target: "public", mutate: (v) => { v.authorization.frozenForExecution = true; } },
  { id: "connectivity-pass", target: "public", mutate: (v) => { v.connectivityAuthority.status = "PASS"; } },
  { id: "connectivity-placeholder", target: "public", mutate: (v) => { v.connectivityAuthority.subjectManifestSha256 = "0".repeat(64); } },
  { id: "accept-v5", target: "public", mutate: (v) => { v.connectivityAuthority.v5AcceptedAsAuthority = true; } },
  { id: "subject-pin", target: "public", mutate: (v) => { v.productionTypeAuthority.subjectManifestSha256 = "0".repeat(64); } },
  { id: "audit-pin", target: "public", mutate: (v) => { v.productionTypeAuthority.independentAuditManifestSha256 = "0".repeat(64); } },
  { id: "drift-count", target: "public", mutate: (v) => { v.currentSourceClosure.driftFromOldSeal.count = 6; } },
  { id: "source-hash", target: "public", mutate: (v) => { v.currentSourceClosure.files[0].sha256 = "0".repeat(64); } },
  { id: "queue-hash", target: "public", mutate: (v) => { v.immutableQueuePreservation.privateQueueFileSha256 = "0".repeat(64); } },
  { id: "reassignment", target: "public", mutate: (v) => { v.immutableQueuePreservation.reassignmentAllowed = true; } },
  { id: "replacement", target: "public", mutate: (v) => { v.immutableQueuePreservation.replacementAllowed = true; } },
  { id: "top-up", target: "public", mutate: (v) => { v.immutableQueuePreservation.topUpAllowed = true; } },
  { id: "candidate-cap", target: "public", mutate: (v) => { v.exactExperimentContract.candidateOpportunityPerAssignment = 2; } },
  { id: "fetch-cap", target: "public", mutate: (v) => { v.exactExperimentContract.physicalFetchPerAssignment = 2; } },
  { id: "retry", target: "public", mutate: (v) => { v.exactExperimentContract.sdkRetryPerAssignment = 1; } },
  { id: "model", target: "public", mutate: (v) => { v.exactExperimentContract.models.STANDARD = "other"; } },
  { id: "route", target: "public", mutate: (v) => { v.exactExperimentContract.providerRouting.only = ["other"]; } },
  { id: "reasoning", target: "public", mutate: (v) => { v.exactExperimentContract.reasoning.enabled = true; } },
  { id: "candidate-use", target: "public", mutate: (v) => { v.safety.apiCandidatesConsumed = 1; } },
  { id: "secret-read", target: "public", mutate: (v) => { v.safety.secretReads = 1; } },
  { id: "private-order", target: "private", mutate: (v) => { [v.assignments[0], v.assignments[1]] = [v.assignments[1], v.assignments[0]]; } },
  { id: "private-profile", target: "private", mutate: (v) => { v.assignments[0].profileId = "MUTATED"; } },
  { id: "private-passage", target: "private", mutate: (v) => { v.passages[0].passageContentExact += " "; } },
  { id: "private-top-up", target: "private", mutate: (v) => { v.noReplacementOrTopUp = false; } },
];

let rejected = 0;
for (const fixture of mutations) {
  const publicValue = JSON.parse(publicRaw) as Record<string, any>;
  const privateValue = JSON.parse(privateRaw) as Record<string, any>;
  fixture.mutate(fixture.target === "public" ? publicValue : privateValue);
  const mutantPublic = fixture.target === "public"
    ? `${JSON.stringify(publicValue, null, 2)}\n`
    : publicRaw;
  const mutantPrivate = fixture.target === "private"
    ? `${JSON.stringify(privateValue, null, 2)}\n`
    : privateRaw;
  assert.throws(
    () => {
      assert.equal(mutantPrivate, baseline.privateRaw, "private seal mismatch");
      assert.equal(mutantPublic, baseline.publicBytes, "public seal mismatch");
    },
    `${fixture.id} was not rejected`,
  );
  rejected += 1;
}

assert.equal(rejected, mutations.length);
assert.equal(baseline.queue.assignments.length, 180);
process.stdout.write(`${JSON.stringify({
  verdict: "PASS_HOSTILE_RESEAL_MUTATIONS_REJECTED",
  hostileFixtures: mutations.length,
  rejected,
  networkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  apiCandidatesConsumed: 0,
}, null, 2)}\n`);
