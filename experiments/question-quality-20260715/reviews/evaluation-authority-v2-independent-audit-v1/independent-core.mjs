import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "../../../..");
export const SUBJECT_REL = "experiments/question-quality-20260715/design/evaluation-authority-v2";
export const SUBJECT_DIR = path.join(REPO_ROOT, ...SUBJECT_REL.split("/"));

export const EXPECTED = Object.freeze({
  protocolSha256: "149228ef8ce2273f143a8a265c070a69735124d5a140e2e0ca2bca3d88b479fa",
  publicManifestSha256: "c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd",
  manifestSha256: "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180",
  typeBindingSubjectManifestSha256: "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
  typeBindingAuditManifestSha256: "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d",
});

const STATES = Object.freeze([
  "PRE_ACCESS_UNAUTHORIZED",
  "TAXONOMY_PILOT_12_ISSUED",
  "TAXONOMY_PILOT_12_PASSED_SEALED",
  "MAIN_CERTIFICATION_24_ISSUED",
  "MAIN_CERTIFICATION_24_PASSED_SEALED",
  "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED",
  "ACTIVATION_HOLDOUT_24_ISSUED",
  "ACTIVATION_HOLDOUT_24_PASSED_SEALED",
  "EVALUATOR_AUTHORITY_GRANTED",
]);

const CALIBRATION_PHASES = Object.freeze([
  ["TAXONOMY_PILOT", 12],
  ["MAIN_CERTIFICATION", 24],
  ["INDEPENDENT_TRUSTED_GOLD_AUDIT", 0],
  ["ACTIVATION_HOLDOUT", 24],
]);

const EXACT_ALLOCATION = Object.freeze({
  C0_CONNECTIVITY: 2,
  S1_FOCUS_PROFILE_SCREEN: 180,
  S2_FOCUS_HELDOUT: 480,
  S3_NONFOCUS_SENTINELS: 92,
  S4_ROUTE_PARITY: 144,
  S5_FOCUS_RISK_GRID: 102,
});

const EXPECTED_UPSTREAMS = Object.freeze([
  ["all-types-evaluation-rubric-v1-rubric", "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/rubric.json", "17960b41393df681a3626786aa638bd4b001a9fc39e6f838c6eb5a4942c86d3a"],
  ["all-types-evaluation-rubric-v1-manifest", "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/MANIFEST.sha256", "9067d8641e463a5c955a5b73af162bf63fd181289f0ce67e95911c2c5beadf4d"],
  ["global-candidate-registry-v2-registry", "experiments/question-quality-20260715/design/global-candidate-registry-v2/registry.json", "1e2fc90252de8790ebd7df86e81602825c3fd8b50f5fa96de237ec3cc8fdbab1"],
  ["global-candidate-registry-v2-manifest", "experiments/question-quality-20260715/design/global-candidate-registry-v2/MANIFEST.sha256", "13f5fdb997c616694b297c6e3c22c22a2f60b97668bbe549589807a3acdd3f1e"],
  ["campaign-v6-s1-current-source-v2-plan", "experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/campaign-v6-s1-current-source-v2.json", "3fdff5bcbb6cc24f981dd09f3c53a0d2418c6089287fea906223b104097339a2"],
  ["campaign-v6-s1-current-source-v2-manifest", "experiments/question-quality-20260715/design/campaign-v6-s1-current-source-v2/MANIFEST.sha256", "8554231197d0e2a5194ef9a44c36750e820333183cb3ce6c4299d5e69c307d43"],
  ["reviewer-calibration-v3-replacement-v1-protocol", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/protocol.json", "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162"],
  ["reviewer-calibration-v3-replacement-v1-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/MANIFEST.sha256", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"],
  ["reviewer-calibration-v3-production-type-binding-v4-subject-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/MANIFEST.sha256", EXPECTED.typeBindingSubjectManifestSha256],
  ["reviewer-calibration-v3-production-type-binding-v4-independent-audit-manifest", "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/MANIFEST.sha256", EXPECTED.typeBindingAuditManifestSha256],
]);

const EXPECTED_PACKAGE_FILES = Object.freeze([
  "authority-core.mts",
  "build.mts",
  "hostile-tests.mts",
  "MANIFEST.sha256",
  "protocol.json",
  "PROTOCOL.md",
  "public-manifest.json",
  "README.md",
  "tsconfig.json",
  "verify.mts",
]);

const REQUIRED_ACCESS_FIELDS = Object.freeze([
  "eventId", "eventOrdinal", "priorEventSha256", "occurredAtRfc3339", "actorPseudonym", "actorRole",
  "phase", "action", "artifactId", "artifactSha256", "packetSha256", "resourceSha256",
  "visibleSurfaceSha256", "capabilityTokenSha256", "authorizationEventSha256", "authorizedAtRfc3339",
  "openedAtRfc3339", "closedAtRfc3339", "decision", "reasonCode", "eventSha256",
]);

const REQUIRED_RECEIPT_BINDINGS = Object.freeze([
  "PRIOR_ALLOW_AUTHORIZATION_EVENT_SHA256",
  "ACTOR_PSEUDONYM_AND_ROLE",
  "PHASE",
  "RESOURCE_SHA256",
  "VISIBLE_SURFACE_SHA256",
  "CAPABILITY_TOKEN_SHA256",
]);

const REQUIRED_ACCESS_CONSTRAINTS = Object.freeze([
  "AUTHORIZATION_EVENT_MUST_PRECEDE_THE_BOUND_ACCESS_RECEIPT_IN_THE_APPEND_ONLY_CHAIN",
  "AUTHORIZED_AT_MUST_BE_STRICTLY_EARLIER_THAN_OPENED_AT",
  "OPENED_AT_MUST_BE_EARLIER_THAN_OR_EQUAL_TO_CLOSED_AT",
  "ACCESS_RECEIPT_MUST_BIND_PRIOR_ALLOW_EVENT_ACTOR_PHASE_RESOURCE_VISIBLE_SURFACE_AND_CAPABILITY_TOKEN",
  "AUTHORIZATION_EVENT_SHA256_MUST_RESOLVE_TO_THE_PRIOR_ALLOW_EVENT",
  "DENY_EVENT_MUST_HAVE_NULL_AUTHORIZATION_EVENT_OPENED_AT_CLOSED_AT_AND_NO_ACCESS_RECEIPT",
  "EVENT_ORDINAL_TIMESTAMP_AND_PRIOR_HASH_CHAIN_FORBID_RETROACTIVE_INSERTION_OR_REWRITE",
]);

const REQUIRED_PHASE_SEALS = Object.freeze([
  "TAXONOMY_PILOT_PACKET_SHA256",
  "TAXONOMY_PILOT_ALL_RESPONSE_SHA256S",
  "TAXONOMY_PILOT_DECISION_SHA256",
  "MAIN_PACKET_SHA256",
  "MAIN_ALL_PHASE1_RESPONSE_SHA256S",
  "MAIN_REVEAL_SHA256",
  "MAIN_ALL_PHASE2_RESPONSE_SHA256S",
  "MAIN_DECISION_SHA256",
  "TRUSTED_GOLD_AUDIT_INPUT_SHA256",
  "TRUSTED_GOLD_AUDIT_REPORT_SHA256",
  "HOLDOUT_PACKET_SHA256",
  "HOLDOUT_ALL_RESPONSE_SHA256S",
  "HOLDOUT_DECISION_SHA256",
  "AUTHORITY_ACTIVATION_SHA256",
  "S1_BLIND_PACKET_SHA256_BEFORE_ANY_RESULT_ACCESS",
]);

const HIDDEN_CLASSES = Object.freeze([
  "PLAN",
  "MODEL_PROVIDER_ROUTE",
  "PROFILE_PROMPT_ARM",
  "COST_TOKEN_USAGE",
  "STORED_ANSWER_KEY",
  "EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS",
  "AUTHOR_TARGET_GRADE",
  "GENERATION_METADATA",
]);

const HIDDEN_BINDINGS = Object.freeze([
  "PLAN_MODEL_PROVIDER_ROUTE",
  "PROFILE_PROMPT_ARM",
  "COST_TOKEN_USAGE",
  "STORED_ANSWER_KEY",
  "EXPLANATION_KEYPOINTS_WRONG_OPTION_EXPLANATIONS",
  "AUTHOR_TARGET_GRADE",
  "GENERATION_METADATA",
  "VISIBLE_SURFACE_SHA256",
  "PACKET_ORDER_AND_RELABEL_COMMITMENT",
]);

const ALLOWED_PHASE1_FIELDS = Object.freeze([
  "blindedItemId",
  "packetOrdinal",
  "blindedOptionLabelsAndRelabelMapSurface",
  "studentVisibleDirections",
  "studentVisiblePassage",
  "studentVisibleStem",
  "studentVisibleUnderlinesOrMarkers",
  "studentVisibleOptions",
  "studentVisibleResponseSpace",
]);

const FORBIDDEN_N6 = Object.freeze([
  "ARM_RANKING",
  "PROFILE_WINNER_SELECTION",
  "SUPERIORITY_OR_NONINFERIORITY_CLAIM",
  "P_VALUE_OR_CONFIDENCE_INTERVAL_RANKING",
  "RELEASE_OR_MODEL_QUALITY_CLAIM",
]);

const ROLE_PAIRS = Object.freeze([
  ["PACKET_AUTHOR", "TAXONOMY_PILOT_RATER"],
  ["PACKET_AUTHOR", "MAIN_CERTIFICATION_RATER"],
  ["PACKET_AUTHOR", "TRUSTED_GOLD_AUDITOR"],
  ["PACKET_AUTHOR", "ACTIVATION_HOLDOUT_RATER"],
  ["PACKET_AUTHOR", "S1_REVIEWER"],
  ["PACKET_AUTHOR", "S1_ADJUDICATOR"],
  ["TRUSTED_GOLD_AUDITOR", "TAXONOMY_PILOT_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "MAIN_CERTIFICATION_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "ACTIVATION_HOLDOUT_RATER"],
  ["TRUSTED_GOLD_AUDITOR", "S1_REVIEWER"],
  ["TRUSTED_GOLD_AUDITOR", "S1_ADJUDICATOR"],
  ["S1_REVIEWER", "S1_ADJUDICATOR"],
  ["S1_RESULT_CUSTODIAN", "S1_REVIEWER"],
  ["S1_RESULT_CUSTODIAN", "S1_ADJUDICATOR"],
]);

const FRESH_ADJUDICATOR_EXCLUSIONS = Object.freeze([
  "PACKET_AUTHOR",
  "TRUSTED_GOLD_AUDITOR",
  "CERTIFIED_REVIEWER_1",
  "CERTIFIED_REVIEWER_2",
  "ANY_PRIOR_S1_RESULT_VIEWER",
]);

const EXPECTED_TYPES = Object.freeze([
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE", "SENTENCE_ORDER",
  "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC", "IRRELEVANT", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING", "SYNONYM", "ANTONYM",
]);

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function arrayEqual(a, b) {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => stable(value) === stable(b[index]));
}

function unorderedEqual(a, b) {
  return Array.isArray(a) && a.length === b.length && [...a].map(stable).sort().every((value, i) => value === [...b].map(stable).sort()[i]);
}

function push(errors, condition, code, detail = "") {
  if (!condition) errors.push({ code, detail });
}

function hasPair(pairs, left, right) {
  return Array.isArray(pairs) && pairs.some((pair) => Array.isArray(pair) && pair.length === 2 && (
    (pair[0] === left && pair[1] === right) || (pair[0] === right && pair[1] === left)
  ));
}

function noLegacySingletonKeys(value, pointer = "") {
  const failures = [];
  if (!value || typeof value !== "object") return failures;
  for (const [key, child] of Object.entries(value)) {
    const next = `${pointer}/${key}`;
    if (["pointFamily", "primaryIntentAxis", "divergentAxes"].includes(key)) failures.push(next);
    failures.push(...noLegacySingletonKeys(child, next));
  }
  return failures;
}

export function validateProtocolSemantics(p) {
  const errors = [];
  push(errors, p?.schemaVersion === "evaluation-authority-v2", "SCHEMA_VERSION");
  push(errors, p?.artifactId === "evaluation-authority-v2", "ARTIFACT_ID");
  push(errors, p?.status === "DESIGN_ONLY_EXECUTION_BLOCKED", "STATUS_BLOCKED");

  const boundary = p?.permanentDesignBoundary ?? {};
  for (const key of ["evaluatorAuthorityGranted", "scoringAuthorityGranted", "generationAuthorized", "s1ResultAccessAuthorized", "s1ScoringAuthorized", "profileSelectionAuthorized", "releaseClaimAuthorized"]) {
    push(errors, boundary[key] === false, `PERMANENT_FALSE_${key}`);
  }
  push(errors, boundary.authorizedReviewers === 0, "PERMANENT_ZERO_REVIEWERS");
  push(errors, boundary.authorizedAdjudicators === 0, "PERMANENT_ZERO_ADJUDICATORS");
  push(errors, typeof boundary.mutationRule === "string" && boundary.mutationRule.includes("NEVER_TRANSITIONS") && boundary.mutationRule.includes("SEPARATE_IMMUTABLE_EXECUTION_EVIDENCE_PACKAGE"), "PERMANENT_IMMUTABLE_DESIGN");

  const publicBoundary = p?.publicOnlyBoundary ?? {};
  push(errors, publicBoundary.allowed === "EXACT_PUBLIC_FILES_LISTED_IN_UPSTREAMS_ONLY", "PUBLIC_EXACT_ALLOWLIST");
  for (const required of ["ANY_PATH_COMPONENT_NAMED_PRIVATE", "TRUSTED_OR_PENDING_GOLD_CONTENT", "ANSWER_OR_REVEAL_PAYLOAD", "ENV_OR_SECRET", "DATABASE", "NETWORK", "MODEL_OR_API", "BUDGET_LEDGER"]) {
    push(errors, publicBoundary.forbidden?.includes(required), `PUBLIC_FORBIDDEN_${required}`);
  }
  push(errors, Object.values(publicBoundary.activity ?? {}).every((value) => value === 0), "PUBLIC_ACTIVITY_ZERO");

  push(errors, Array.isArray(p?.upstreams) && p.upstreams.length === EXPECTED_UPSTREAMS.length, "UPSTREAM_CARDINALITY");
  for (const [id, upstreamPath, hash] of EXPECTED_UPSTREAMS) {
    const row = p?.upstreams?.find((candidate) => candidate.id === id);
    push(errors, row?.path === upstreamPath && row?.sha256 === hash, `UPSTREAM_PIN_${id}`);
  }
  push(errors, new Set((p?.upstreams ?? []).map((row) => row.id)).size === EXPECTED_UPSTREAMS.length, "UPSTREAM_IDS_UNIQUE");

  const allocation = p?.exactCandidateAllocation ?? {};
  const allocationSum = Object.entries(EXACT_ALLOCATION).reduce((sum, [key, expected]) => {
    push(errors, allocation[key] === expected, `ALLOCATION_${key}`);
    return sum + Number(allocation[key] ?? 0);
  }, 0);
  push(errors, allocation.cap === 1000 && allocation.sum === 1000 && allocation.currentUsed === 0 && allocationSum === 1000, "ALLOCATION_EXACT_1000");
  push(errors, allocation.outcomeDrivenReallocationAllowed === false && allocation.replacementOrTopupAllowed === false, "ALLOCATION_NO_DRIFT_TOPUP");
  push(errors, p?.supersession?.legacyAllocationExplicitlyRejected?.scheduledRows === 998 && p?.supersession?.legacyAllocationExplicitlyRejected?.connectivityRows === 2, "LEGACY_998_2_EXPLICIT_REJECTION");
  push(errors, p?.supersession?.legacyAllocationExplicitlyRejected?.disposition?.includes("GLOBAL_CANDIDATE_REGISTRY_V2_EXACT_1000"), "LEGACY_ALLOCATION_SUPERSEDED");
  push(errors, unorderedEqual(p?.supersession?.legacySingletonFieldsExplicitlyRejected, ["pointFamily", "primaryIntentAxis", "divergentAxes"]), "LEGACY_SINGLETON_EXPLICIT_REJECTION");
  push(errors, noLegacySingletonKeys(p?.taxonomySemantics).length === 0, "NO_LEGACY_SINGLETON_TAXONOMY_KEYS", noLegacySingletonKeys(p?.taxonomySemantics).join(","));

  const grammar = p?.taxonomySemantics?.grammar ?? {};
  push(errors, grammar.singletonPointFamilyRequired === false && grammar.exactCorrectionStringRequired === false && grammar.postIssueExpansionAllowed === false, "GRAMMAR_SET_EQUIVALENCE");
  push(errors, grammar.acceptedPointFamilies?.includes("SEALED_SET") && grammar.acceptedCorrectionEquivalenceSets?.includes("SEMANTIC_EQUIVALENCE_GROUPS"), "GRAMMAR_SEALED_SETS");
  const blank = p?.taxonomySemantics?.blank ?? {};
  push(errors, blank.everyOptionHasAllSevenAxes === true && blank.propositionAxes?.length === 7 && blank.axisRelations?.length === 8, "BLANK_SEVEN_AXIS_VECTOR");
  push(errors, blank.decisiveAxesMinimum === 1 && blank.decisiveAxesMaximum === 2 && blank.singletonIntentRequired === false, "BLANK_ONE_OR_TWO_AXES");
  push(errors, blank.irreducibleCompoundDisposition?.includes("REJECT") && blank.postIssueExpansionAllowed === false, "BLANK_COMPOUND_FAIL_CLOSED");

  const sequence = p?.calibrationSequence ?? {};
  push(errors, Array.isArray(sequence.exactOrder) && sequence.exactOrder.length === CALIBRATION_PHASES.length, "CALIBRATION_PHASE_COUNT");
  CALIBRATION_PHASES.forEach(([phase, count], index) => {
    const row = sequence.exactOrder?.[index];
    push(errors, row?.phase === phase && row?.freshItems === count, `CALIBRATION_ORDER_${index}`);
  });
  push(errors, sequence.pairwiseDisjoint === true, "CALIBRATION_PAIRWISE_DISJOINT");
  for (const [key, expected] of [["taxonomyRevisionAfterAnyLaterPacketOpen", false], ["retroactivePass", false], ["thresholdRelaxationAfterOpening", false], ["failedItemReplay", false]]) {
    push(errors, sequence[key] === expected, `CALIBRATION_FAIL_CLOSED_${key}`);
  }
  push(errors, sequence.trustedGoldAuditBoundary?.includes("DOES_NOT_GRANT_PRODUCTION_SCORING_AUTHORITY"), "TRUSTED_GOLD_NO_SCORING_AUTHORITY");

  const roles = p?.roles ?? {};
  push(errors, roles.requiredForActivation?.certifiedReviewers === 2, "TWO_REVIEWERS");
  push(errors, roles.requiredForActivation?.freshAdjudicators === 1, "ONE_FRESH_ADJUDICATOR");
  push(errors, roles.freshness?.reviewersMustBeDistinct === true, "REVIEWERS_DISTINCT");
  for (const role of FRESH_ADJUDICATOR_EXCLUSIONS) push(errors, roles.freshness?.adjudicatorMustBeDistinctFrom?.includes(role), `ADJUDICATOR_FRESH_${role}`);
  for (const [left, right] of ROLE_PAIRS) push(errors, hasPair(roles.roleIncompatibilities, left, right), `ROLE_INCOMPATIBLE_${left}_${right}`);
  push(errors, roles.samePersonAcrossIncompatibleRolesAllowed === false && roles.saltedPseudonymRegistryRequired === true, "ROLE_REGISTRY_FAIL_CLOSED");

  const access = p?.accessControl ?? {};
  push(errors, access.currentState === STATES[0] && arrayEqual(access.stateOrder, STATES), "ACCESS_STATE_ORDER");
  push(errors, Array.isArray(access.observedAccessEvents) && access.observedAccessEvents.length === 0, "NO_OBSERVED_ACCESS_EVENTS");
  push(errors, Array.isArray(access.observedPhaseSeals) && access.observedPhaseSeals.length === 0, "NO_OBSERVED_PHASE_SEALS");
  const schema = access.immutableAccessEventSchema ?? {};
  push(errors, unorderedEqual(schema.requiredFields, REQUIRED_ACCESS_FIELDS), "ACCESS_REQUIRED_FIELDS");
  push(errors, schema.hashAlgorithm === "SHA-256" && schema.appendOnly === true && schema.ordinalStartsAt === 1 && /^0{64}$/.test(schema.priorHashGenesis ?? ""), "ACCESS_APPEND_ONLY_CHAIN");
  push(errors, unorderedEqual(schema.eventKinds, ["AUTHORIZATION", "ACCESS_RECEIPT", "DENIAL"]), "ACCESS_EVENT_KINDS");
  push(errors, unorderedEqual(schema.decisions, ["ALLOW", "DENY"]), "ACCESS_DECISIONS");
  push(errors, schema.timeOrder === "authorizedAtRfc3339 < openedAtRfc3339 <= closedAtRfc3339", "ACCESS_TIME_INEQUALITY");
  push(errors, unorderedEqual(schema.receiptBinding, REQUIRED_RECEIPT_BINDINGS), "ACCESS_RECEIPT_BINDINGS");
  push(errors, unorderedEqual(schema.constraints, REQUIRED_ACCESS_CONSTRAINTS), "ACCESS_CONSTRAINTS");
  push(errors, schema.deniedAttemptsMustBeRecorded === true && schema.denyHasOpenReceipt === false && schema.retroactiveEventsAllowed === false && schema.deletionOrRewriteAllowed === false, "ACCESS_DENY_NO_BACKFILL");
  push(errors, Object.keys(access.denySets ?? {}).length === STATES.length, "DENY_SET_NINE_STATES");
  for (const state of STATES) push(errors, Array.isArray(access.denySets?.[state]) && access.denySets[state].length > 0, `DENY_SET_NONEMPTY_${state}`);
  push(errors, unorderedEqual(access.requiredPhaseSeals, REQUIRED_PHASE_SEALS), "REQUIRED_PHASE_SEALS_EXACT");
  for (const rule of [
    "EVERY_OPEN_REQUIRES_A_PRIOR_SEALED_ALLOW_AUTHORIZATION_AND_CAPABILITY_TOKEN",
    "EVERY_COMPLETED_OPEN_REQUIRES_A_CLOSE_RECEIPT_WITH_AUTHORIZED_OPENED_CLOSED_TIME_ORDER",
    "RECEIPT_BINDS_ACTOR_PHASE_RESOURCE_VISIBLE_SURFACE_CAPABILITY_AND_PRIOR_ALLOW_EVENT",
    "DENIED_ATTEMPT_HAS_NO_OPEN_RECEIPT_AND_IS_STILL_APPEND_ONLY_RECORDED",
    "RETROACTIVE_AUTHORIZATION_OR_EVENT_INSERTION_IS_FORBIDDEN",
    "S1_RESULT_ACCESS_REQUIRES_AUTHORITY_TWO_CERTIFIED_REVIEWERS_FRESH_ADJUDICATOR_AND_PRESEALED_S1_PACKET",
  ]) push(errors, access.accessRules?.includes(rule), `ACCESS_RULE_${rule}`);

  const machine = p?.stateMachine ?? {};
  push(errors, machine.initial === STATES[0] && machine.currentCompletedTransitions === 0, "MACHINE_INITIAL_ZERO");
  push(errors, machine.skippedOrReorderedTransitionAllowed === false && machine.transitionWithoutImmutableEvidenceAllowed === false, "MACHINE_NO_SKIP_REORDER");
  push(errors, Array.isArray(machine.transitions) && machine.transitions.length === STATES.length - 1, "MACHINE_TRANSITION_COUNT");
  for (let index = 0; index < STATES.length - 1; index += 1) {
    const transition = machine.transitions?.[index];
    push(errors, transition?.from === STATES[index] && transition?.to === STATES[index + 1], `MACHINE_TRANSITION_${index}`);
    push(errors, Array.isArray(transition?.gates) && transition.gates.length >= 3, `MACHINE_GATES_${index}`);
  }

  const s1 = p?.s1EvaluationGate ?? {};
  push(errors, s1.allocation?.total === 180 && s1.allocation?.grammar === 96 && s1.allocation?.blank === 84 && s1.allocation?.standard === 96 && s1.allocation?.premium === 84 && s1.allocation?.intermediate === 90 && s1.allocation?.killer === 90, "S1_ALLOCATION_EXACT");
  push(errors, s1.minimumCellN === 6 && s1.inferenceUnit === "PASSAGE_CLUSTER", "S1_N6_CLUSTER_ONLY");
  push(errors, unorderedEqual(s1.forbiddenAtN6, FORBIDDEN_N6), "S1_N6_FORBIDDEN_CLAIMS");
  push(errors, s1.s1BlindPacketMustSealBeforeAnyResultAccess === true, "S1_PACKET_PRESEALED");
  push(errors, s1.s1BlindPacketRequiredBindings?.length === 6 && s1.s1BlindPacketRequiredBindings.includes("ALL_180_ASSIGNMENT_IDS_AND_CLUSTER_HASHES"), "S1_PACKET_BINDINGS");
  const visible = s1.phase1VisibleSurface ?? {};
  push(errors, arrayEqual(visible.allowOnly, ALLOWED_PHASE1_FIELDS), "S1_PHASE1_EXACT_ALLOWLIST");
  push(errors, arrayEqual(visible.hiddenClasses, HIDDEN_CLASSES), "S1_PHASE1_HIDDEN_CLASSES");
  push(errors, visible.studentVisibleOnly === true && visible.blindedIdentityOrderAndRelabelOnly === true, "S1_PHASE1_STUDENT_BLIND_ONLY");
  push(errors, visible.leakageDisposition?.includes("QUARANTINE_PACKET_REVOKE_CAPABILITY_RECORD_DENY_EVENT_NO_RESULT_ACCESS"), "S1_PHASE1_LEAK_FAIL_CLOSED");
  for (const hidden of HIDDEN_CLASSES) {
    push(errors, Array.isArray(visible.hiddenFieldExamples?.[hidden]) && visible.hiddenFieldExamples[hidden].length > 0, `S1_HIDDEN_EXAMPLES_${hidden}`);
    push(errors, !visible.allowOnly?.includes(hidden), `S1_HIDDEN_NOT_ALLOWED_${hidden}`);
  }
  const commitment = s1.hiddenCommitment ?? {};
  push(errors, commitment.separateFromPhase1VisibleSurface === true && commitment.sealedBeforePacketIssue === true && commitment.commitmentContentVisibleInPhase1 === false, "S1_HIDDEN_COMMITMENT_PRESEALED_SEPARATE");
  push(errors, unorderedEqual(commitment.requiredBindings, HIDDEN_BINDINGS), "S1_HIDDEN_COMMITMENT_BINDINGS");
  push(errors, commitment.revealRequiresOwnPhase1ResponseSealAndBoundAllowReceipt === true, "S1_HIDDEN_REVEAL_AFTER_OWN_SEAL");
  for (const requirement of ["EVALUATOR_AUTHORITY_GRANTED", "TWO_CERTIFIED_REVIEWERS", "ONE_FRESH_ADJUDICATOR", "S1_BLIND_PACKET_SEALED_BEFORE_FIRST_RESULT_ACCESS", "IMMUTABLE_ALLOW_EVENT_FOR_EACH_ACCESS"]) {
    push(errors, s1.resultAccessRequires?.includes(requirement), `S1_RESULT_GATE_${requirement}`);
  }
  push(errors, Object.values(s1.preAuthorityClaims ?? {}).length === 5 && Object.values(s1.preAuthorityClaims).every((value) => value === false), "S1_PREAUTHORITY_NO_CLAIMS");
  push(errors, s1.eligibleAssignments === 0, "S1_ZERO_ELIGIBLE");

  const snapshot = p?.activationSnapshot ?? {};
  push(errors, snapshot.currentState === STATES[0] && snapshot.evaluatorAuthorityGranted === false && snapshot.authorizedReviewers === 0 && snapshot.authorizedAdjudicators === 0 && snapshot.accessEventCount === 0 && snapshot.phaseSealCount === 0 && snapshot.s1PacketSealed === false && snapshot.s1ResultAccessAuthorized === false, "ACTIVATION_SNAPSHOT_ZERO");
  push(errors, p?.claims?.deterministicDesignContractOnly === true, "CLAIM_DESIGN_ONLY");
  for (const key of ["scoringAuthority", "evaluatorAuthority", "reviewerCertificate", "adjudicatorAuthorization", "s1QualityScore", "profileSelection", "release"]) push(errors, p?.claims?.[key] === "NONE", `CLAIM_NONE_${key}`);

  const typeBoundary = p?.upstreamAuthorityBoundary?.productionTypeBindingV4 ?? {};
  push(errors, typeBoundary.subjectManifestSha256 === EXPECTED.typeBindingSubjectManifestSha256 && typeBoundary.independentAuditManifestSha256 === EXPECTED.typeBindingAuditManifestSha256 && typeBoundary.auditVerdict === "PASS_NO_BLOCKERS", "TYPE_BINDING_V4_PASS_PINNED");
  push(errors, typeBoundary.grantsEvaluatorAuthority === false && typeBoundary.grantsScoringAuthority === false, "TYPE_BINDING_NO_AUTHORITY");
  push(errors, p?.upstreamAuthorityBoundary?.calibrationV3 === "TAXONOMY_SEMANTICS_NOT_A_CERTIFICATE_OR_SCORING_AUTHORITY", "CALIBRATION_V3_NO_INHERITED_CERTIFICATE");
  push(errors, p?.upstreamAuthorityBoundary?.globalRegistry === "EXACT_ALLOCATION_NOT_EXECUTION_AUTHORIZATION", "REGISTRY_NO_EXECUTION_AUTHORITY");
  return errors;
}

function parseManifest(text) {
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(rawLine);
    if (!match) throw new Error(`malformed manifest row: ${rawLine}`);
    rows.push({ sha256: match[1], path: match[2].replace(/\\/g, "/") });
  }
  return rows;
}

function forbiddenPath(relativePath) {
  const parts = relativePath.replace(/\\/g, "/").split("/").map((part) => part.toLowerCase());
  return parts.includes("private") || parts.some((part) => /^(?:gold|reveal|answers?)(?:[._-]|$)/i.test(part)) || parts.includes(".env") || parts.some((part) => part.startsWith(".env.")) || parts.includes("budget-ledger.json");
}

async function readRepo(relativePath) {
  if (forbiddenPath(relativePath)) throw new Error(`prohibited path refused: ${relativePath}`);
  const absolute = path.resolve(REPO_ROOT, ...relativePath.replace(/\\/g, "/").split("/"));
  if (!absolute.startsWith(`${REPO_ROOT}${path.sep}`)) throw new Error(`path escape refused: ${relativePath}`);
  return readFile(absolute);
}

async function verifyManifestLineage(manifestRel, { skipForbidden = true } = {}) {
  const manifestBytes = await readRepo(manifestRel);
  const rows = parseManifest(manifestBytes.toString("utf8"));
  const baseRel = path.posix.dirname(manifestRel);
  let verified = 0;
  let skippedForbidden = 0;
  const mismatches = [];
  for (const row of rows) {
    const candidate = row.path.includes("/") && row.path.startsWith("experiments/") ? row.path : path.posix.join(baseRel, row.path);
    if (forbiddenPath(candidate)) {
      if (!skipForbidden) mismatches.push({ path: candidate, reason: "forbidden-declared-row" });
      skippedForbidden += 1;
      continue;
    }
    const bytes = await readRepo(candidate);
    const observed = sha256(bytes);
    if (observed !== row.sha256) mismatches.push({ path: candidate, expected: row.sha256, observed });
    verified += 1;
  }
  return { manifestRel, rows: rows.length, verified, skippedForbidden, mismatches, manifestSha256: sha256(manifestBytes) };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function remove(array, value) {
  const index = array.indexOf(value);
  if (index >= 0) array.splice(index, 1);
}

export function buildMutationCases(protocol) {
  const cases = [];
  const add = (id, mutate, expectedCodePrefix) => cases.push({ id, mutate, expectedCodePrefix });
  add("old-998-cap", (p) => { p.exactCandidateAllocation.cap = 998; }, "ALLOCATION_");
  add("allocation-drift-s1-to-s2", (p) => { p.exactCandidateAllocation.S1_FOCUS_PROFILE_SCREEN -= 1; p.exactCandidateAllocation.S2_FOCUS_HELDOUT += 1; }, "ALLOCATION_");
  add("outcome-driven-reallocation", (p) => { p.exactCandidateAllocation.outcomeDrivenReallocationAllowed = true; }, "ALLOCATION_NO_DRIFT_TOPUP");
  add("replacement-topup", (p) => { p.exactCandidateAllocation.replacementOrTopupAllowed = true; }, "ALLOCATION_NO_DRIFT_TOPUP");
  add("singleton-point-family", (p) => { p.taxonomySemantics.grammar.pointFamily = "subjectVerbAgreement"; }, "NO_LEGACY_SINGLETON");
  add("singleton-blank-axis", (p) => { p.taxonomySemantics.blank.primaryIntentAxis = "polarity"; }, "NO_LEGACY_SINGLETON");
  add("singleton-divergent-axes", (p) => { p.taxonomySemantics.blank.divergentAxes = ["polarity"]; }, "NO_LEGACY_SINGLETON");
  add("unauthorized-item-score", (p) => { p.s1EvaluationGate.preAuthorityClaims.itemScoresAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("unauthorized-aggregate-score", (p) => { p.s1EvaluationGate.preAuthorityClaims.aggregateScoresAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("unauthorized-arm-ranking", (p) => { p.s1EvaluationGate.preAuthorityClaims.armRankingAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("unauthorized-profile-selection", (p) => { p.s1EvaluationGate.preAuthorityClaims.profileSelectionAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("unauthorized-release", (p) => { p.s1EvaluationGate.preAuthorityClaims.releaseClaimAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("authority-granted", (p) => { p.permanentDesignBoundary.evaluatorAuthorityGranted = true; }, "PERMANENT_FALSE_");
  add("reviewer-authorized", (p) => { p.permanentDesignBoundary.authorizedReviewers = 2; }, "PERMANENT_ZERO_REVIEWERS");
  add("adjudicator-authorized", (p) => { p.permanentDesignBoundary.authorizedAdjudicators = 1; }, "PERMANENT_ZERO_ADJUDICATORS");
  add("eligible-assignment", (p) => { p.s1EvaluationGate.eligibleAssignments = 1; }, "S1_ZERO_ELIGIBLE");
  add("phase-reorder", (p) => { [p.calibrationSequence.exactOrder[0], p.calibrationSequence.exactOrder[1]] = [p.calibrationSequence.exactOrder[1], p.calibrationSequence.exactOrder[0]]; }, "CALIBRATION_ORDER_");
  add("phase-overlap", (p) => { p.calibrationSequence.pairwiseDisjoint = false; }, "CALIBRATION_PAIRWISE_DISJOINT");
  add("transition-skip", (p) => { p.stateMachine.transitions[0].to = STATES[2]; }, "MACHINE_TRANSITION_0");
  add("transition-missing", (p) => { p.stateMachine.transitions.splice(3, 1); }, "MACHINE_TRANSITION_COUNT");
  add("taxonomy-post-open-revision", (p) => { p.calibrationSequence.taxonomyRevisionAfterAnyLaterPacketOpen = true; }, "CALIBRATION_FAIL_CLOSED_");
  add("threshold-relax-after-open", (p) => { p.calibrationSequence.thresholdRelaxationAfterOpening = true; }, "CALIBRATION_FAIL_CLOSED_");
  add("failed-item-replay", (p) => { p.calibrationSequence.failedItemReplay = true; }, "CALIBRATION_FAIL_CLOSED_");
  add("one-reviewer", (p) => { p.roles.requiredForActivation.certifiedReviewers = 1; }, "TWO_REVIEWERS");
  add("reviewers-not-distinct", (p) => { p.roles.freshness.reviewersMustBeDistinct = false; }, "REVIEWERS_DISTINCT");
  add("no-fresh-adjudicator", (p) => { p.roles.requiredForActivation.freshAdjudicators = 0; }, "ONE_FRESH_ADJUDICATOR");
  for (const role of FRESH_ADJUDICATOR_EXCLUSIONS) add(`adjudicator-freshness-remove-${role.toLowerCase()}`, (p) => { remove(p.roles.freshness.adjudicatorMustBeDistinctFrom, role); }, "ADJUDICATOR_FRESH_");
  for (const [left, right] of ROLE_PAIRS.filter(([left]) => left === "TRUSTED_GOLD_AUDITOR")) add(`role-collision-${right.toLowerCase()}`, (p) => { p.roles.roleIncompatibilities = p.roles.roleIncompatibilities.filter((pair) => !((pair[0] === left && pair[1] === right) || (pair[0] === right && pair[1] === left))); }, "ROLE_INCOMPATIBLE_");
  for (const state of STATES) {
    add(`deny-set-missing-${state.toLowerCase()}`, (p) => { delete p.accessControl.denySets[state]; }, "DENY_SET_");
    add(`deny-set-empty-${state.toLowerCase()}`, (p) => { p.accessControl.denySets[state] = []; }, "DENY_SET_");
  }
  for (const binding of REQUIRED_RECEIPT_BINDINGS) add(`receipt-binding-remove-${binding.toLowerCase()}`, (p) => { remove(p.accessControl.immutableAccessEventSchema.receiptBinding, binding); }, "ACCESS_RECEIPT_BINDINGS");
  for (const constraint of REQUIRED_ACCESS_CONSTRAINTS) add(`access-constraint-remove-${constraint.toLowerCase()}`, (p) => { remove(p.accessControl.immutableAccessEventSchema.constraints, constraint); }, "ACCESS_CONSTRAINTS");
  add("late-equal-authorization", (p) => { p.accessControl.immutableAccessEventSchema.timeOrder = "authorizedAtRfc3339 <= openedAtRfc3339 <= closedAtRfc3339"; }, "ACCESS_TIME_INEQUALITY");
  add("retroactive-allow", (p) => { p.accessControl.immutableAccessEventSchema.retroactiveEventsAllowed = true; }, "ACCESS_DENY_NO_BACKFILL");
  add("deny-open-receipt", (p) => { p.accessControl.immutableAccessEventSchema.denyHasOpenReceipt = true; }, "ACCESS_DENY_NO_BACKFILL");
  add("rewrite-event-chain", (p) => { p.accessControl.immutableAccessEventSchema.deletionOrRewriteAllowed = true; }, "ACCESS_DENY_NO_BACKFILL");
  for (const seal of REQUIRED_PHASE_SEALS) add(`phase-seal-remove-${seal.toLowerCase()}`, (p) => { remove(p.accessControl.requiredPhaseSeals, seal); }, "REQUIRED_PHASE_SEALS_EXACT");
  add("s1-packet-not-presealed", (p) => { p.s1EvaluationGate.s1BlindPacketMustSealBeforeAnyResultAccess = false; }, "S1_PACKET_PRESEALED");
  add("s1-result-no-packet-gate", (p) => { remove(p.s1EvaluationGate.resultAccessRequires, "S1_BLIND_PACKET_SEALED_BEFORE_FIRST_RESULT_ACCESS"); }, "S1_RESULT_GATE_");
  add("s1-result-no-authority-gate", (p) => { remove(p.s1EvaluationGate.resultAccessRequires, "EVALUATOR_AUTHORITY_GRANTED"); }, "S1_RESULT_GATE_");
  for (const hidden of HIDDEN_CLASSES) {
    add(`hidden-class-remove-${hidden.toLowerCase()}`, (p) => { remove(p.s1EvaluationGate.phase1VisibleSurface.hiddenClasses, hidden); }, "S1_PHASE1_HIDDEN_CLASSES");
    add(`hidden-class-leak-${hidden.toLowerCase()}`, (p) => { p.s1EvaluationGate.phase1VisibleSurface.allowOnly.push(hidden); }, "S1_PHASE1_EXACT_ALLOWLIST");
  }
  for (const binding of HIDDEN_BINDINGS) add(`hidden-binding-remove-${binding.toLowerCase()}`, (p) => { remove(p.s1EvaluationGate.hiddenCommitment.requiredBindings, binding); }, "S1_HIDDEN_COMMITMENT_BINDINGS");
  add("hidden-commitment-visible", (p) => { p.s1EvaluationGate.hiddenCommitment.commitmentContentVisibleInPhase1 = true; }, "S1_HIDDEN_COMMITMENT_PRESEALED_SEPARATE");
  add("hidden-reveal-before-own-seal", (p) => { p.s1EvaluationGate.hiddenCommitment.revealRequiresOwnPhase1ResponseSealAndBoundAllowReceipt = false; }, "S1_HIDDEN_REVEAL_AFTER_OWN_SEAL");
  for (const claim of FORBIDDEN_N6) add(`n6-claim-remove-${claim.toLowerCase()}`, (p) => { remove(p.s1EvaluationGate.forbiddenAtN6, claim); }, "S1_N6_FORBIDDEN_CLAIMS");
  add("n6-winner-selection", (p) => { p.s1EvaluationGate.preAuthorityClaims.profileSelectionAllowed = true; }, "S1_PREAUTHORITY_NO_CLAIMS");
  add("type-binding-subject-missing", (p) => { p.upstreams = p.upstreams.filter((row) => row.id !== "reviewer-calibration-v3-production-type-binding-v4-subject-manifest"); }, "UPSTREAM_CARDINALITY");
  add("type-binding-audit-missing", (p) => { p.upstreams = p.upstreams.filter((row) => row.id !== "reviewer-calibration-v3-production-type-binding-v4-independent-audit-manifest"); }, "UPSTREAM_CARDINALITY");
  add("type-binding-audit-failed", (p) => { p.upstreamAuthorityBoundary.productionTypeBindingV4.auditVerdict = "FAIL_BLOCKERS"; }, "TYPE_BINDING_V4_PASS_PINNED");
  add("failed-v4-draft-inherited", (p) => { p.upstreams.push({ id: "reviewer-calibration-v3-production-type-binding-v4-draft", path: "draft.json", sha256: "0".repeat(64), authority: "INHERITED" }); }, "UPSTREAM_CARDINALITY");
  add("failed-v2-inherited", (p) => { p.upstreams.push({ id: "reviewer-calibration-v2", path: "v2.json", sha256: "0".repeat(64), authority: "INHERITED" }); }, "UPSTREAM_CARDINALITY");
  return cases.map((row) => {
    const mutated = deepClone(protocol);
    row.mutate(mutated);
    const errors = validateProtocolSemantics(mutated);
    const detected = errors.some((error) => error.code.startsWith(row.expectedCodePrefix));
    return { id: row.id, expectedCodePrefix: row.expectedCodePrefix, detected, errorCodes: errors.map((error) => error.code) };
  });
}

export function validateAccessScenario({ authorization, receipt }) {
  const failures = [];
  if (!authorization || authorization.kind !== "AUTHORIZATION" || authorization.decision !== "ALLOW") failures.push("PRIOR_ALLOW_REQUIRED");
  if (!receipt || receipt.kind !== "ACCESS_RECEIPT" || receipt.decision !== "ALLOW") failures.push("ALLOW_RECEIPT_REQUIRED");
  if (authorization && receipt) {
    if (!(authorization.ordinal < receipt.ordinal)) failures.push("AUTHORIZATION_MUST_PRECEDE_RECEIPT");
    if (receipt.authorizationEventSha256 !== authorization.eventSha256) failures.push("AUTHORIZATION_HASH_MISMATCH");
    for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256"]) {
      if (authorization[key] !== receipt[key]) failures.push(`BINDING_MISMATCH_${key}`);
    }
    const authorizedAt = Date.parse(receipt.authorizedAtRfc3339);
    const openedAt = Date.parse(receipt.openedAtRfc3339);
    const closedAt = Date.parse(receipt.closedAtRfc3339);
    if (![authorizedAt, openedAt, closedAt].every(Number.isFinite) || !(authorizedAt < openedAt && openedAt <= closedAt)) failures.push("TIME_ORDER");
  }
  return failures;
}

export function validateDenyScenario(event) {
  const failures = [];
  if (event?.kind !== "DENIAL" || event?.decision !== "DENY") failures.push("DENIAL_EVENT_REQUIRED");
  for (const key of ["authorizationEventSha256", "openedAtRfc3339", "closedAtRfc3339"]) if (event?.[key] !== null) failures.push(`DENY_MUST_NULL_${key}`);
  if (event?.hasOpenReceipt !== false) failures.push("DENY_HAS_NO_OPEN_RECEIPT");
  return failures;
}

function buildScenarioTests() {
  const authorization = {
    kind: "AUTHORIZATION", decision: "ALLOW", ordinal: 1, eventSha256: "a".repeat(64),
    actorPseudonym: "rater-a", actorRole: "S1_REVIEWER", phase: "S1_PHASE1",
    resourceSha256: "b".repeat(64), visibleSurfaceSha256: "c".repeat(64), capabilityTokenSha256: "d".repeat(64),
  };
  const receipt = {
    ...authorization, kind: "ACCESS_RECEIPT", ordinal: 2, eventSha256: "e".repeat(64),
    authorizationEventSha256: authorization.eventSha256,
    authorizedAtRfc3339: "2026-07-16T00:00:00.000Z", openedAtRfc3339: "2026-07-16T00:00:00.001Z", closedAtRfc3339: "2026-07-16T00:00:00.002Z",
  };
  const cases = [];
  cases.push({ id: "valid-bound-receipt", accepted: validateAccessScenario({ authorization, receipt }).length === 0 });
  for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256"]) {
    const bad = { ...receipt, [key]: `${receipt[key]}-mismatch` };
    cases.push({ id: `reject-${key}-mismatch`, accepted: validateAccessScenario({ authorization, receipt: bad }).includes(`BINDING_MISMATCH_${key}`) });
  }
  cases.push({ id: "reject-late-equal-authorization", accepted: validateAccessScenario({ authorization, receipt: { ...receipt, authorizedAtRfc3339: receipt.openedAtRfc3339 } }).includes("TIME_ORDER") });
  cases.push({ id: "reject-backfilled-allow", accepted: validateAccessScenario({ authorization: { ...authorization, ordinal: 3 }, receipt }).includes("AUTHORIZATION_MUST_PRECEDE_RECEIPT") });
  cases.push({ id: "reject-authorization-hash-mismatch", accepted: validateAccessScenario({ authorization, receipt: { ...receipt, authorizationEventSha256: "f".repeat(64) } }).includes("AUTHORIZATION_HASH_MISMATCH") });
  const deny = { kind: "DENIAL", decision: "DENY", authorizationEventSha256: null, openedAtRfc3339: null, closedAtRfc3339: null, hasOpenReceipt: false };
  cases.push({ id: "valid-deny-no-receipt", accepted: validateDenyScenario(deny).length === 0 });
  cases.push({ id: "reject-deny-open-receipt", accepted: validateDenyScenario({ ...deny, openedAtRfc3339: "2026-07-16T00:00:00.000Z", hasOpenReceipt: true }).length >= 2 });
  return cases;
}

export async function runIndependentAudit() {
  const subjectEntries = (await readdir(SUBJECT_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const protocolBytes = await readRepo(`${SUBJECT_REL}/protocol.json`);
  const publicManifestBytes = await readRepo(`${SUBJECT_REL}/public-manifest.json`);
  const manifestBytes = await readRepo(`${SUBJECT_REL}/MANIFEST.sha256`);
  const protocol = JSON.parse(protocolBytes.toString("utf8"));
  const publicManifest = JSON.parse(publicManifestBytes.toString("utf8"));
  const subjectRows = parseManifest(manifestBytes.toString("utf8"));
  const staticErrors = validateProtocolSemantics(protocol);

  const artifactErrors = [];
  push(artifactErrors, sha256(protocolBytes) === EXPECTED.protocolSha256, "SUBJECT_PROTOCOL_HASH");
  push(artifactErrors, sha256(publicManifestBytes) === EXPECTED.publicManifestSha256, "SUBJECT_PUBLIC_MANIFEST_HASH");
  push(artifactErrors, sha256(manifestBytes) === EXPECTED.manifestSha256, "SUBJECT_MANIFEST_HASH");
  push(artifactErrors, arrayEqual(subjectEntries, [...EXPECTED_PACKAGE_FILES].sort()), "SUBJECT_EXACT_FILE_SET");
  push(artifactErrors, unorderedEqual(subjectRows.map((row) => row.path), EXPECTED_PACKAGE_FILES.filter((name) => name !== "MANIFEST.sha256")), "SUBJECT_MANIFEST_EXACT_ROWS");
  for (const row of subjectRows) {
    const bytes = await readRepo(`${SUBJECT_REL}/${row.path}`);
    push(artifactErrors, sha256(bytes) === row.sha256, `SUBJECT_ROW_HASH_${row.path}`);
  }
  push(artifactErrors, publicManifest.status === "DESIGN_ONLY_EXECUTION_BLOCKED" && publicManifest.publicOnly === true, "PUBLIC_MANIFEST_BOUNDARY");
  push(artifactErrors, publicManifest.authority?.evaluatorAuthorityGranted === false && publicManifest.authority?.scoringAuthorityGranted === false && publicManifest.authority?.authorizedReviewers === 0 && publicManifest.authority?.authorizedAdjudicators === 0, "PUBLIC_MANIFEST_ZERO_AUTHORITY");
  push(artifactErrors, Object.values(publicManifest.activity ?? {}).every((value) => value === 0), "PUBLIC_MANIFEST_ZERO_ACTIVITY");

  const observedUpstreams = [];
  for (const [id, relativePath, expectedHash] of EXPECTED_UPSTREAMS) {
    const bytes = await readRepo(relativePath);
    const observedHash = sha256(bytes);
    observedUpstreams.push({ id, path: relativePath, expectedSha256: expectedHash, observedSha256: observedHash, match: observedHash === expectedHash });
    push(artifactErrors, observedHash === expectedHash, `UPSTREAM_BYTES_${id}`);
  }

  const lineageManifestPaths = EXPECTED_UPSTREAMS.filter(([, relativePath]) => relativePath.endsWith("MANIFEST.sha256")).map(([, relativePath]) => relativePath);
  const lineages = [];
  for (const manifestRel of lineageManifestPaths) lineages.push(await verifyManifestLineage(manifestRel));
  for (const lineage of lineages) push(artifactErrors, lineage.mismatches.length === 0, `UPSTREAM_MANIFEST_LINEAGE_${lineage.manifestRel}`);

  const rubric = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[0][1])).toString("utf8"));
  push(artifactErrors, rubric.schemaVersion === "all-types-evaluation-rubric-v1" && arrayEqual(Object.keys(rubric.types ?? {}), EXPECTED_TYPES), "UPSTREAM_RUBRIC_25_TYPES");
  push(artifactErrors, rubric.calibrationCertificateScope?.all25TypesCertified === false, "UPSTREAM_RUBRIC_NO_ALLTYPE_CERTIFICATE");
  push(artifactErrors, rubric.blindEvaluation?.raters === 2 && rubric.blindEvaluation?.adjudicatorOnDisagreement === 1 && rubric.blindEvaluation?.generatorIdentityHidden === true && rubric.blindEvaluation?.solveBeforeKeyAndExplanation === true, "UPSTREAM_RUBRIC_BLIND_POWER");

  const registry = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[2][1])).toString("utf8"));
  const registryStages = Object.fromEntries((registry.stages ?? []).map((row) => [row.stage, row.cap]));
  push(artifactErrors, registry.status === "DESIGN_ONLY_EXECUTION_BLOCKED" && registry.capFullQuestionCandidates === 1000 && registry.currentUsed === 0 && registry.sum === 1000 && registry.reallocationAfterObservedOutcomeAllowed === false, "UPSTREAM_REGISTRY_BOUNDARY");
  for (const [stage, cap] of Object.entries(EXACT_ALLOCATION)) push(artifactErrors, registryStages[stage] === cap, `UPSTREAM_REGISTRY_${stage}`);

  const s1Plan = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[4][1])).toString("utf8"));
  const contract = s1Plan.exactExperimentContract ?? {};
  push(artifactErrors, s1Plan.status === "CURRENT_SOURCE_RESEAL_PREPARED_EXECUTION_BLOCKED" && s1Plan.preparationOnly === true, "UPSTREAM_S1_BLOCKED");
  push(artifactErrors, contract.byType?.GRAMMAR_ERROR === 96 && contract.byType?.BLANK_INFERENCE === 84 && contract.byPlan?.STANDARD === 96 && contract.byPlan?.PREMIUM === 84 && contract.byDifficulty?.INTERMEDIATE === 90 && contract.byDifficulty?.KILLER === 90, "UPSTREAM_S1_EXACT_180");
  push(artifactErrors, contract.candidateOpportunityPerAssignment === 1 && contract.physicalFetchPerAssignment === 1 && contract.semanticQuestionPerAssignment === 1 && contract.outerAttemptPerAssignment === 1 && contract.sdkRetryPerAssignment === 0, "UPSTREAM_S1_SINGLE_SHOT");
  push(artifactErrors, s1Plan.authorization?.generationAuthorized === false && s1Plan.authorization?.campaignEligibleAssignments === 0 && s1Plan.authorization?.frozenForExecution === false, "UPSTREAM_S1_ZERO_AUTHORITY");
  push(artifactErrors, s1Plan.immutableQueuePreservation?.assignments === 180 && s1Plan.immutableQueuePreservation?.replacementAllowed === false && s1Plan.immutableQueuePreservation?.topUpAllowed === false && s1Plan.immutableQueuePreservation?.reassignmentAllowed === false, "UPSTREAM_S1_QUEUE_IMMUTABLE");

  const calibration = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[6][1])).toString("utf8"));
  push(artifactErrors, calibration.status === "DESIGN_ONLY_UNISSUED", "UPSTREAM_CALIBRATION_UNISSUED");
  push(artifactErrors, calibration.grammarConstruct?.equivalenceRules?.singletonPointFamilyRequired === false && calibration.grammarConstruct?.equivalenceRules?.exactCorrectionStringRequired === false && calibration.grammarConstruct?.equivalenceRules?.postIssueExpansionAllowed === false, "UPSTREAM_CALIBRATION_GRAMMAR_SET_SEMANTICS");
  push(artifactErrors, calibration.blankConstruct?.rules?.singletonPrimaryIntentRequired === false && calibration.blankConstruct?.rules?.everyOptionHasAllSevenAxes === true && calibration.blankConstruct?.rules?.decisiveAxesMin === 1 && calibration.blankConstruct?.rules?.decisiveAxesMax === 2, "UPSTREAM_CALIBRATION_BLANK_VECTOR_SEMANTICS");

  const typeAuditRel = "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/audit.json";
  const typeAudit = JSON.parse((await readRepo(typeAuditRel)).toString("utf8"));
  push(artifactErrors, typeAudit.verdict === "PASS_NO_BLOCKERS" && Array.isArray(typeAudit.blockers) && typeAudit.blockers.length === 0, "TYPE_BINDING_AUDIT_PASS");
  push(artifactErrors, typeAudit.subject?.manifestSha256 === EXPECTED.typeBindingSubjectManifestSha256 && typeAudit.independence?.subjectVerifierExecuted === false && typeAudit.independence?.subjectBuilderExecuted === false, "TYPE_BINDING_AUDIT_INDEPENDENT_PIN");
  push(artifactErrors, typeAudit.astEvidence?.uiTypeCount === 25 && typeAudit.astEvidence?.allPickerTypesHaveAiAndFallbackSchemas === true, "TYPE_BINDING_AUDIT_25_TYPES");

  const mutations = buildMutationCases(protocol);
  const mutationFailures = mutations.filter((row) => !row.detected);
  const scenarios = buildScenarioTests();
  const scenarioFailures = scenarios.filter((row) => !row.accepted);
  return {
    verdict: staticErrors.length === 0 && artifactErrors.length === 0 && mutationFailures.length === 0 && scenarioFailures.length === 0 ? "PASS_NO_BLOCKERS" : "FAIL_BLOCKERS",
    blockers: [...staticErrors, ...artifactErrors, ...mutationFailures.map((row) => ({ code: `UNDETECTED_MUTATION_${row.id}`, detail: row.expectedCodePrefix })), ...scenarioFailures.map((row) => ({ code: `SCENARIO_FAILURE_${row.id}`, detail: "" }))],
    subject: {
      path: SUBJECT_REL,
      protocolSha256: sha256(protocolBytes),
      publicManifestSha256: sha256(publicManifestBytes),
      manifestSha256: sha256(manifestBytes),
      fileCount: subjectEntries.length,
      manifestRows: subjectRows.length,
    },
    upstreams: observedUpstreams,
    lineages,
    checks: {
      staticPassed: staticErrors.length === 0,
      staticErrorCount: staticErrors.length,
      artifactPassed: artifactErrors.length === 0,
      artifactErrorCount: artifactErrors.length,
      mutationsPassed: mutations.length - mutationFailures.length,
      mutationsTotal: mutations.length,
      scenariosPassed: scenarios.length - scenarioFailures.length,
      scenariosTotal: scenarios.length,
    },
    mutations,
    scenarios,
    activity: {
      privateReads: 0,
      goldReads: 0,
      revealReads: 0,
      answerPayloadReads: 0,
      envReads: 0,
      databaseCalls: 0,
      networkCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      ledgerReadsOrWrites: 0,
      subjectBuildImportsOrExecutions: 0,
      subjectVerifierImportsOrExecutions: 0,
      subjectHostileImportsOrExecutions: 0,
      subjectWrites: 0,
    },
  };
}
