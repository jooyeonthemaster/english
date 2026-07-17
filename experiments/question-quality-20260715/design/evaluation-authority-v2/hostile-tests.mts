import assert from "node:assert/strict";
import { buildProtocol, validateProtocol } from "./authority-core.mts";

function clone(): any {
  return JSON.parse(JSON.stringify(buildProtocol()));
}

let passed = 0;
function reject(name: string, mutate: (protocol: any) => void): void {
  const protocol = clone();
  mutate(protocol);
  let rejected = false;
  try {
    validateProtocol(protocol);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, `${name} must be rejected`);
  passed += 1;
}

validateProtocol(buildProtocol());

reject("status escalation", (p) => { p.status = "AUTHORIZED"; });
reject("evaluator authority escalation", (p) => { p.permanentDesignBoundary.evaluatorAuthorityGranted = true; });
reject("scoring authority escalation", (p) => { p.permanentDesignBoundary.scoringAuthorityGranted = true; });
reject("reviewer escalation", (p) => { p.permanentDesignBoundary.authorizedReviewers = 2; });
reject("adjudicator escalation", (p) => { p.permanentDesignBoundary.authorizedAdjudicators = 1; });
reject("old total allocation", (p) => { p.exactCandidateAllocation.sum = 998; });
reject("old S4 allocation", (p) => { p.exactCandidateAllocation.S4_ROUTE_PARITY = 240; });
reject("outcome reallocation", (p) => { p.exactCandidateAllocation.outcomeDrivenReallocationAllowed = true; });
reject("replacement topup", (p) => { p.exactCandidateAllocation.replacementOrTopupAllowed = true; });
reject("missing upstream", (p) => { p.upstreams.pop(); });
reject("changed upstream hash", (p) => { p.upstreams[0].sha256 = "0".repeat(64); });
reject("changed subject manifest", (p) => { p.upstreamAuthorityBoundary.productionTypeBindingV4.subjectManifestSha256 = "0".repeat(64); });
reject("changed independent audit manifest", (p) => { p.upstreamAuthorityBoundary.productionTypeBindingV4.independentAuditManifestSha256 = "0".repeat(64); });
reject("legacy pointFamily leakage", (p) => { p.taxonomySemantics.grammar.pointFamily = "singleton"; });
reject("legacy primaryIntentAxis leakage", (p) => { p.taxonomySemantics.blank.primaryIntentAxis = "polarity"; });
reject("legacy divergentAxes leakage", (p) => { p.taxonomySemantics.blank.divergentAxes = ["polarity"]; });
reject("legacy 998+2 prose leakage", (p) => { p.claims.note = "use 998 + 2"; });
reject("pilot count drift", (p) => { p.calibrationSequence.exactOrder[0].freshItems = 10; });
reject("main count drift", (p) => { p.calibrationSequence.exactOrder[1].freshItems = 12; });
reject("holdout count drift", (p) => { p.calibrationSequence.exactOrder[3].freshItems = 12; });
reject("phase reorder", (p) => { [p.calibrationSequence.exactOrder[1], p.calibrationSequence.exactOrder[2]] = [p.calibrationSequence.exactOrder[2], p.calibrationSequence.exactOrder[1]]; });
reject("state reorder", (p) => { [p.accessControl.stateOrder[1], p.accessControl.stateOrder[2]] = [p.accessControl.stateOrder[2], p.accessControl.stateOrder[1]]; });
reject("transition skip", (p) => { p.stateMachine.transitions[0].to = "MAIN_CERTIFICATION_24_ISSUED"; });
reject("transition gate missing", (p) => { p.stateMachine.transitions[0].gates = []; });
reject("evidenceless transition allowed", (p) => { p.stateMachine.transitionWithoutImmutableEvidenceAllowed = true; });
reject("advanced state without access evidence", (p) => { p.accessControl.currentState = "TAXONOMY_PILOT_12_ISSUED"; });
reject("snapshot advanced without evidence", (p) => { p.activationSnapshot.currentState = "TAXONOMY_PILOT_12_ISSUED"; });
reject("access event field deleted", (p) => { p.accessControl.immutableAccessEventSchema.requiredFields.pop(); });
["capabilityTokenSha256", "authorizationEventSha256", "authorizedAtRfc3339", "openedAtRfc3339", "closedAtRfc3339", "resourceSha256", "visibleSurfaceSha256"].forEach((field) => {
  reject(`access event ${field} deleted`, (p) => {
    p.accessControl.immutableAccessEventSchema.requiredFields = p.accessControl.immutableAccessEventSchema.requiredFields.filter((x: string) => x !== field);
  });
});
reject("access timestamp order weakened", (p) => { p.accessControl.immutableAccessEventSchema.timeOrder = "openedAt <= authorizedAt"; });
reject("access receipt constraint deleted", (p) => { p.accessControl.immutableAccessEventSchema.constraints.pop(); });
reject("DENY open receipt allowed", (p) => { p.accessControl.immutableAccessEventSchema.denyHasOpenReceipt = true; });
reject("retroactive event allowed", (p) => { p.accessControl.immutableAccessEventSchema.retroactiveEventsAllowed = true; });
reject("receipt no longer binds capability", (p) => { p.accessControl.immutableAccessEventSchema.receiptBinding.pop(); });
reject("denied attempts unrecorded", (p) => { p.accessControl.immutableAccessEventSchema.deniedAttemptsMustBeRecorded = false; });
reject("deny sets removed", (p) => { p.accessControl.denySets = {}; });
reject("pilot-passed deny set missing", (p) => { delete p.accessControl.denySets.TAXONOMY_PILOT_12_PASSED_SEALED; });
reject("holdout-issued deny set empty", (p) => { p.accessControl.denySets.ACTIVATION_HOLDOUT_24_ISSUED = []; });
reject("activation deny set weakened", (p) => { p.accessControl.denySets.EVALUATOR_AUTHORITY_GRANTED.pop(); });
reject("S1 packet seal removed", (p) => { p.accessControl.requiredPhaseSeals = p.accessControl.requiredPhaseSeals.filter((x: string) => !x.startsWith("S1_BLIND")); });
reject("one reviewer", (p) => { p.roles.requiredForActivation.certifiedReviewers = 1; });
reject("no fresh adjudicator", (p) => { p.roles.requiredForActivation.freshAdjudicators = 0; });
reject("role incompatibility weakened", (p) => { p.roles.samePersonAcrossIncompatibleRolesAllowed = true; });
reject("auditor taxonomy-pilot incompatibility removed", (p) => { p.roles.roleIncompatibilities = p.roles.roleIncompatibilities.filter((x: string[]) => !(x[0] === "TRUSTED_GOLD_AUDITOR" && x[1] === "TAXONOMY_PILOT_RATER")); });
reject("auditor main-certification incompatibility removed", (p) => { p.roles.roleIncompatibilities = p.roles.roleIncompatibilities.filter((x: string[]) => !(x[0] === "TRUSTED_GOLD_AUDITOR" && x[1] === "MAIN_CERTIFICATION_RATER")); });
reject("auditor holdout incompatibility removed", (p) => { p.roles.roleIncompatibilities = p.roles.roleIncompatibilities.filter((x: string[]) => !(x[0] === "TRUSTED_GOLD_AUDITOR" && x[1] === "ACTIVATION_HOLDOUT_RATER")); });
reject("S1 n ranking", (p) => { p.s1EvaluationGate.forbiddenAtN6 = p.s1EvaluationGate.forbiddenAtN6.filter((x: string) => x !== "ARM_RANKING"); });
reject("S1 cell size drift", (p) => { p.s1EvaluationGate.minimumCellN = 12; });
["PLAN", "MODEL_PROVIDER_ROUTE", "PROFILE_PROMPT_ARM", "COST_TOKEN_USAGE", "STORED_ANSWER_KEY", "EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS", "AUTHOR_TARGET_GRADE", "GENERATION_METADATA"].forEach((hiddenClass) => {
  reject(`S1 phase-1 ${hiddenClass} leakage`, (p) => {
    p.s1EvaluationGate.phase1VisibleSurface.allowOnly.push(`leaked:${hiddenClass}`);
  });
});
reject("S1 hidden commitment merged into visible surface", (p) => { p.s1EvaluationGate.hiddenCommitment.separateFromPhase1VisibleSurface = false; });
reject("S1 hidden commitment not presealed", (p) => { p.s1EvaluationGate.hiddenCommitment.sealedBeforePacketIssue = false; });
reject("S1 hidden commitment visible", (p) => { p.s1EvaluationGate.hiddenCommitment.commitmentContentVisibleInPhase1 = true; });
reject("S1 score claim", (p) => { p.s1EvaluationGate.preAuthorityClaims.itemScoresAllowed = true; });
reject("S1 aggregate claim", (p) => { p.s1EvaluationGate.preAuthorityClaims.aggregateScoresAllowed = true; });
reject("profile selection claim", (p) => { p.s1EvaluationGate.preAuthorityClaims.profileSelectionAllowed = true; });
reject("release claim", (p) => { p.s1EvaluationGate.preAuthorityClaims.releaseClaimAllowed = true; });
reject("eligible assignments escalation", (p) => { p.s1EvaluationGate.eligibleAssignments = 180; });
reject("claim escalation", (p) => { p.claims.scoringAuthority = "GRANTED"; });
reject("unexpected access evidence", (p) => { p.accessControl.observedAccessEvents.push({ eventId: "forged" }); });
reject("unexpected phase seal", (p) => { p.accessControl.observedPhaseSeals.push({ seal: "forged" }); });

assert.equal(passed, 73);
console.log(`evaluation-authority-v2 hostile tests: PASS ${passed}/73`);
