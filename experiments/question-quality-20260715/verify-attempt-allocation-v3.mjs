import assert from "node:assert/strict";
import fs from "node:fs";

const allocation = JSON.parse(
  fs.readFileSync(new URL("./attempt-allocation-v3.draft.json", import.meta.url), "utf8"),
);

// This verifier proves only that the rejected/non-executable draft is internally
// arithmetically consistent and remains fail-closed. It is intentionally not an
// operational-readiness verifier.
assert.equal(allocation.schemaVersion, 2);
assert.equal(allocation.status, "draft_non_executable");
assert.equal(allocation.auditVerdict, "FAIL_BLOCKED");
assert.equal(allocation.operationallyAuthorizedCandidateAttemptSlots, 0);
assert.equal(allocation.candidateAttemptCap, 1_000);
assert.equal(allocation.allocatedCandidateAttemptSlots, 990);
assert.equal(allocation.permanentSafetyMarginSlots, 10);
assert.deepEqual(allocation.safetyMarginPolicy, {
  executable: false,
  reallocatable: false,
  plannedMaximumAuthorizedSlots: 990,
  overflowProofStatus:
    "unproven_until_single-output-cardinality-and-bounded-concurrency-are-enforced_before_network",
});
assert.match(allocation.unitStatus, /^not_enforceable_/);
assert.match(allocation.productionParityStatus, /^not_established_/);

const expectedPhaseIds = [
  "A1_CORE_ALL_CURRENT",
  "A2_DEV_FOCUS_SCREEN",
  "A3_HOLDOUT_FOCUS_PAIRED",
  "A4_ROUTE_ALL_WINNER",
  "A5_FOCUS_ROBUSTNESS",
];
assert.deepEqual(
  allocation.phases.map(phase => phase.id),
  expectedPhaseIds,
);

let slots = 0;
let assignments = 0;
for (const phase of allocation.phases) {
  const planSlots = Object.values(phase.planQuotas).reduce(
    (sum, plan) => sum + plan.assignments * plan.maxCandidateAttemptsPerAssignment,
    0,
  );
  const declaredPlanSlots = Object.values(phase.planQuotas).reduce(
    (sum, plan) => sum + plan.slots,
    0,
  );
  const planAssignments = Object.values(phase.planQuotas).reduce(
    (sum, plan) => sum + plan.assignments,
    0,
  );
  assert.equal(planSlots, phase.candidateAttemptSlots, `${phase.id}: computed slots`);
  assert.equal(declaredPlanSlots, phase.candidateAttemptSlots, `${phase.id}: declared slots`);
  assert.equal(planAssignments, phase.logicalAssignments, `${phase.id}: assignments`);
  assert.equal(
    phase.candidateCeilingStatus,
    "invalid_placeholder_for_production_parity",
    `${phase.id}: ceiling must remain explicitly non-operational`,
  );
  assert.equal(phase.fixedQueueHash, null, `${phase.id}: unresolved queue hash must block`);
  assert.equal(
    phase.maxPhysicalProviderCalls,
    null,
    `${phase.id}: unresolved provider-call cap must block`,
  );
  assert.equal(phase.maxCostUsd, null, `${phase.id}: unresolved USD cap must block`);
  slots += phase.candidateAttemptSlots;
  assignments += phase.logicalAssignments;
}

assert.equal(slots, allocation.allocatedCandidateAttemptSlots);
assert.equal(assignments, 426);
assert.equal(slots + allocation.permanentSafetyMarginSlots, allocation.candidateAttemptCap);
assert.ok(
  allocation.phases.every(phase => !/safety/i.test(phase.id)),
  "the permanent safety margin must not be represented by an executable phase",
);

const screen = allocation.phases.find(phase => phase.id === "A2_DEV_FOCUS_SCREEN");
assert.ok(screen);
assert.equal(screen.logicalAssignments, 4 * 2 * 2 * 5);
assert.match(screen.assignmentDesign, /every passage-plan block receives all 4 profiles/);
assert.match(screen.winnerPolicyStatus, /^unresolved_/);
assert.equal(screen.winnerPolicyUnit, null);

const confirm = allocation.phases.find(phase => phase.id === "A3_HOLDOUT_FOCUS_PAIRED");
assert.ok(confirm);
assert.equal(confirm.logicalAssignments, 2 * 2 * 60);
assert.equal(confirm.planQuotas.STANDARD.assignments, 2 * 2 * 30);
assert.equal(confirm.planQuotas.PREMIUM.assignments, 2 * 2 * 30);
assert.equal(confirm.multiplicityRule, null);
assert.equal(confirm.primaryEstimand, null);
assert.match(confirm.inferentialStatus, /adequacy is not established/);

assert.ok(allocation.preregistrationHolds.length >= 5);
assert.ok(allocation.executionHold.length >= 6);
assert.ok(
  allocation.executionHold.some(item => /authorizes zero calls/i.test(item)),
  "the draft must explicitly authorize zero calls",
);
assert.ok(
  allocation.executionHold.some(item => /ten slots alone do not prove/i.test(item)),
  "the overflow limitation must remain explicit",
);

console.log(
  "PASS non-executable draft arithmetic/fail-closed invariants; EXECUTION_READINESS=FAIL_BLOCKED",
);
