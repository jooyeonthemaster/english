import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PACKAGE_REL = "experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v2";

const EXPECTED_UPSTREAMS = [
  ["evaluation-authority-v2-public-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/public-manifest.json", "c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd"],
  ["evaluation-authority-v2-subject-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/MANIFEST.sha256", "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180"],
  ["evaluation-authority-v2-independent-audit-manifest", "experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/MANIFEST.sha256", "0cdf9d676bdec820e728a3b3890237b3b80d201caa2c20afc7af46ed6482adf5"],
  ["production-type-binding-v4-subject-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/MANIFEST.sha256", "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04"],
  ["production-type-binding-v4-independent-audit-manifest", "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/MANIFEST.sha256", "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d"],
  ["reviewer-calibration-v3-replacement-v1-protocol", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/protocol.json", "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162"],
  ["reviewer-calibration-v3-replacement-v1-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/MANIFEST.sha256", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"],
];

const TYPES = [
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE", "SENTENCE_ORDER",
  "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC", "IRRELEVANT", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING", "SYNONYM", "ANTONYM",
];

const FAMILIES = [
  ["NF-F1-GLOBAL_MEANING_SELECTION", ["TOPIC", "MAIN_IDEA", "TITLE"]],
  ["NF-F2-LOCAL_INFERENCE_AND_REFERENCE", ["IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH"]],
  ["NF-F3-DISCOURSE_STRUCTURE", ["SENTENCE_ORDER", "SENTENCE_INSERT", "IRRELEVANT"]],
  ["NF-F4-GRAMMAR_FORM_DIAGNOSIS", ["GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"]],
  ["NF-F5-LEXICAL_SEMANTICS", ["VOCAB_CHOICE", "CONTEXT_MEANING", "SYNONYM", "ANTONYM"]],
  ["NF-F6-SUMMARY_AND_COMPRESSION", ["SUMMARY_COMPLETE_MC", "SUMMARY_COMPLETE", "SUMMARY_WRITING"]],
  ["NF-F7-CONTROLLED_REWRITE_AND_ORDER", ["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "WORD_ORDER"]],
  ["NF-F8-TARGETED_CONSTRUCTED_EXPRESSION", ["FILL_BLANK_KEY", "TOPIC_SENTENCE_WRITING"]],
];

const STATES = [
  "PRE_ACCESS_UNAUTHORIZED",
  "TAXONOMY_PILOT_12_ISSUED",
  "TAXONOMY_PILOT_12_PASSED_SEALED",
  "MAIN_CERTIFICATION_24_ISSUED",
  "MAIN_CERTIFICATION_24_PASSED_SEALED",
  "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASSED_SEALED",
  "ACTIVATION_HOLDOUT_24_ISSUED",
  "ACTIVATION_HOLDOUT_24_PASSED_SEALED",
  "EVALUATOR_AUTHORITY_GRANTED",
];

const AUDITOR_INCOMPATIBLE = [
  "ANY_PACKET_AUTHOR", "TAXONOMY_PILOT_RATER", "MAIN_CERTIFICATION_RATER", "ACTIVATION_HOLDOUT_RATER",
  "S1_REVIEWER", "S1_ADJUDICATOR", "S1_RESULT_CUSTODIAN",
];

const PHASE1_ALLOW = ["BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK"];

const HIDDEN_CLASSES = [
  "ITEM_IDENTITY_AND_SOURCE",
  "ANSWER_KEY",
  "TRUSTED_GOLD",
  "EXPLANATION_AND_SCORING_EVIDENCE",
  "AUTHOR_HYPOTHESIS_AND_TARGET",
  "REJECTION_AND_SURPLUS_HISTORY",
  "OTHER_RATER_RECORDS",
  "ADJUDICATION_DRAFT",
  "TYPE_FAMILY_ROTATION_EPOCH",
  "MODEL_PROVIDER_ROUTE_PROFILE_PROMPT_COST_USAGE_GENERATION_METADATA",
];

const HIDDEN_BINDINGS = [
  "SLOT_ID", "PHASE_BLOCK_AND_ORDINAL", "ITEM_IDENTITY_AND_SOURCE", "VISIBLE_SURFACE_SHA256", "ANSWER_KEY",
  "TRUSTED_GOLD_AND_ACCEPTED_EQUIVALENCE_OR_CONSTRAINTS", "EXPLANATION_AND_FATAL_CRAFT_EVIDENCE",
  "AUTHOR_HYPOTHESIS_AND_TARGET", "REJECTION_AND_SURPLUS_HISTORY_COMMITMENT", "TYPE_FAMILY_ROTATION_EPOCH",
  "PACKET_ORDER_AND_RELABEL_COMMITMENT",
];

const PHASE_SEALS = [
  "ROLE_REGISTRY_SHA256",
  "TAXONOMY_PILOT_PACKET_SHA256",
  "TAXONOMY_PILOT_ALL_RESPONSE_SHA256S",
  "TAXONOMY_PILOT_DECISION_SHA256",
  "MAIN_PACKET_SHA256",
  "MAIN_ALL_PHASE1_RESPONSE_SHA256S",
  "MAIN_REVEAL_SHA256",
  "MAIN_ALL_PHASE2_RESPONSE_SHA256S",
  "MAIN_DECISION_SHA256",
  "TRUSTED_GOLD_AUDIT_INPUT_SHA256",
  "TRUSTED_GOLD_AUDIT_ACCESS_EVENTS_SHA256",
  "TRUSTED_GOLD_AUDIT_REPORT_SHA256",
  "HOLDOUT_PACKET_SHA256",
  "HOLDOUT_ALL_RESPONSE_SHA256S",
  "HOLDOUT_DECISION_SHA256",
  "TWO_DISTINCT_REVIEWER_CERTIFICATES_SHA256S",
  "FRESH_ADJUDICATOR_BINDING_SHA256",
  "SEPARATE_ACTIVATION_EVENT_SHA256",
  "SEPARATE_ACTIVATION_AUDIT_MANIFEST_SHA256",
];

const PACKAGE_FILES = [
  "event-schemas.json",
  "hostile-fixtures.json",
  "protocol.json",
  "PROTOCOL.md",
  "public-manifest.json",
  "README.md",
  "registries.json",
  "verify.mjs",
];

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function equal(a, b) {
  return stable(a) === stable(b);
}

function setEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].map(stable).sort().every((value, index) => value === [...b].map(stable).sort()[index]);
}

function add(errors, condition, code, detail = "") {
  if (!condition) errors.push({ code, detail });
}

function forbiddenPath(relativePath) {
  const parts = relativePath.replace(/\\/g, "/").split("/").map((part) => part.toLowerCase());
  return parts.includes("private") || parts.includes(".env") || parts.some((part) => part.startsWith(".env.")) || parts.includes("budget-ledger.json") || parts.some((part) => /^(?:gold|answers?|reveal)(?:[._-]|$)/.test(part));
}

async function readRepo(relativePath) {
  if (forbiddenPath(relativePath)) throw new Error(`refused forbidden path: ${relativePath}`);
  const absolute = path.resolve(REPO_ROOT, ...relativePath.replace(/\\/g, "/").split("/"));
  if (!absolute.startsWith(`${REPO_ROOT}${path.sep}`)) throw new Error(`refused path escape: ${relativePath}`);
  return readFile(absolute);
}

function parseManifest(text) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`malformed manifest row: ${line}`);
    return { sha256: match[1], path: match[2].replace(/\\/g, "/") };
  });
}

async function verifyManifest(manifestRel) {
  const manifestBytes = await readRepo(manifestRel);
  const rows = parseManifest(manifestBytes.toString("utf8"));
  const base = path.posix.dirname(manifestRel);
  const mismatches = [];
  let verified = 0;
  let refused = 0;
  for (const row of rows) {
    const relativePath = row.path.startsWith("experiments/") ? row.path : path.posix.join(base, row.path);
    if (forbiddenPath(relativePath)) {
      refused += 1;
      continue;
    }
    const observed = sha256(await readRepo(relativePath));
    if (observed !== row.sha256) mismatches.push({ path: relativePath, expected: row.sha256, observed });
    verified += 1;
  }
  return { manifestRel, manifestSha256: sha256(manifestBytes), rows: rows.length, verified, refused, mismatches };
}

function selectedAt(order, epoch, role) {
  const base = (epoch - 1) % order.length;
  const index = role === "main" ? base : (base + Math.ceil(order.length / 2)) % order.length;
  return { index, typeId: order[index] };
}

function generatedSlotIds() {
  const rows = [];
  for (const [phase, counts] of [["TP", { G: 4, B: 4, N: 4 }], ["MC", { G: 8, B: 8, N: 8 }], ["AH", { G: 8, B: 8, N: 8 }]]) {
    for (const block of ["G", "B", "N"]) for (let ordinal = 1; ordinal <= counts[block]; ordinal += 1) rows.push(`${phase}-${block}-${String(ordinal).padStart(2, "0")}`);
  }
  return rows;
}

function validateProtocol(p) {
  const errors = [];
  add(errors, p?.schemaVersion === "reviewer-calibration-v4-production-bound-protocol-2" && p?.artifactId === "reviewer-calibration-v4-production-bound-v2", "IDENTITY");
  add(errors, p?.status === "DESIGN_ONLY_UNISSUED_EXECUTION_BLOCKED", "STATUS_DESIGN_ONLY");
  const boundary = p?.permanentDesignBoundary ?? {};
  add(errors, boundary.designOnly === true && boundary.thisArtifactTransitions === false && boundary.issued === false, "STATUS_DESIGN_ONLY");
  for (const [key, value] of Object.entries(boundary)) if (typeof value === "boolean" && !["designOnly", "separateImmutableExecutionPackageRequired", "separateIndependentlyAuditedActivationEventRequired"].includes(key)) add(errors, value === false, "PERMANENT_FALSE", key);
  add(errors, boundary.separateImmutableExecutionPackageRequired === true && boundary.separateIndependentlyAuditedActivationEventRequired === true, "PERMANENT_BOUNDARY");
  for (const key of ["reviewerCertificatesIssued", "authorizedReviewers", "authorizedAdjudicators"]) add(errors, boundary[key] === 0, "PERMANENT_ZERO", key);

  add(errors, Array.isArray(p?.upstreams) && p.upstreams.length === EXPECTED_UPSTREAMS.length, "UPSTREAM_PIN");
  for (const [id, upstreamPath, hash] of EXPECTED_UPSTREAMS) {
    const row = p?.upstreams?.find((candidate) => candidate.id === id);
    add(errors, row?.path === upstreamPath && row?.sha256 === hash, "UPSTREAM_PIN", id);
  }
  const typeRow = p?.upstreams?.find((row) => row.id === "production-type-binding-v4-subject-manifest");
  add(errors, typeRow?.subjectSnapshotSha256 === "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967" && typeRow?.bindingJsonSha256 === "47df395f54179538d27a714ac0df4dc9e82f04b767bc82f45b8473c38d04cc3d", "TYPE_BINDING_SNAPSHOT");
  const v3 = p?.upstreams?.find((row) => row.id === "reviewer-calibration-v3-replacement-v1-protocol");
  add(errors, v3?.normativeUse === "METHODOLOGY_CONSTRUCT_THRESHOLDS_AND_FAIL_CLOSED_SCORING_PRINCIPLES_ONLY" && v3.explicitlyNonAuthoritativeFor?.includes("PRODUCTION_TYPE_IDS") && v3.explicitlyNonAuthoritativeFor?.includes("REVIEWER_CERTIFICATE"), "V3_METHODOLOGY_ONLY");
  add(errors, p?.supersession?.onlyAcceptedBinding === "reviewer-calibration-v3-production-type-binding-v4", "ONLY_BINDING_V4");
  add(errors, p?.supersession?.legacyArtifactsMayPopulateSlots === false && p?.supersession?.legacyArtifactsMayGrantContactCoverageCertificationOrExecution === false, "LEGACY_NO_AUTHORITY");
  for (const id of ["reviewer-calibration-v4-production-bound-v1", "reviewer-calibration-v3-production-type-binding-v1", "reviewer-calibration-v3-production-type-binding-v2"]) add(errors, p?.supersession?.thisArtifactSupersedes?.some((row) => row.artifactId === id && row.disposition.includes("NO_AUTHORITY")), "LEGACY_NO_AUTHORITY", id);

  const universe = p?.typeUniverse ?? {};
  add(errors, universe.uiTypeCount === 25 && universe.nonfocusTypeCount === 23 && equal(universe.uiTypeIdsInOrder, TYPES) && equal(universe.focusTypeIds, TYPES.slice(0, 2)) && equal(universe.nonfocusTypeIdsInUiOrder, TYPES.slice(2)) && universe.noAliasesOrLegacySchemaOnlyIds === true, "TYPE_UNIVERSE");
  const expectedFamilies = FAMILIES.map(([familyId, rotationOrder]) => ({ familyId, rotationOrder }));
  add(errors, universe.familyCount === 8 && equal(universe.families, expectedFamilies), "FAMILY_BINDING");
  const rotation = p?.rotation ?? {};
  add(errors, rotation.epochIsOneBased === true && rotation.mainIndexFormula === "(epoch - 1) mod familySize" && rotation.holdoutIndexFormula === "(epoch - 1 + ceil(familySize / 2)) mod familySize", "ROTATION_FORMULA");
  add(errors, rotation.failureDoesNotAdvanceRotation === true && rotation.outcomeAwareSkippingForbidden === true && rotation.pilotDoesNotCountTowardCoverage === true && rotation.formulaRowsAndCoverageMustUseSameFunction === true, "ROTATION_FAIL_CLOSED");
  add(errors, rotation.contactIsCertification === false && rotation.singleEpochAllTypeClaimAllowed === false && rotation.singleEpochDistinctCanonicalTypes === 16 && rotation.mainPlusHoldoutEpochsToContactAll23 === 2 && rotation.mainOnlyEpochsToContactAll23 === 4, "CONTACT_NOT_CERTIFICATION");
  add(errors, rotation.scheduleRows === 32 && rotation.bindingV4CanonicalBindingSha256 === "433d72598f123a19950b57e4684d0ba004031d3beb0860fc5d5d226ddcf8022b", "ROTATION_BINDING");

  const sequence = p?.calibrationSequence ?? {};
  const expectedPhases = [["TAXONOMY_PILOT", 12], ["MAIN_CERTIFICATION", 24], ["INDEPENDENT_TRUSTED_GOLD_AUDIT", 0], ["ACTIVATION_HOLDOUT", 24], ["SEPARATE_INDEPENDENTLY_AUDITED_ACTIVATION_EVENT", 0]];
  add(errors, sequence.exactOrder?.length === expectedPhases.length && expectedPhases.every(([phase, count], index) => sequence.exactOrder[index]?.phase === phase && sequence.exactOrder[index]?.freshItems === count), "SEQUENCE_EXACT");
  add(errors, sequence.exactOrder?.[4]?.containedInThisArtifact === false && sequence.totalFutureItemSlots === 60 && sequence.currentFilledItemSlots === 0, "SEPARATE_ACTIVATION");
  for (const key of ["phaseOverlapAllowed", "phaseSkipOrReorderAllowed", "taxonomyRevisionAfterLaterPacketOpenAllowed", "thresholdRelaxationAfterOpeningAllowed", "retroactivePassAllowed", "failedItemReplayAllowed", "replacementOrBackfillIntoOpenedPacketAllowed"]) add(errors, sequence[key] === false, "SEQUENCE_FAIL_CLOSED", key);
  add(errors, sequence.pairwiseDisjointByNormalizedTextWindowTopicScenarioAuthorAndSurfaceFingerprint === true, "SEQUENCE_FAIL_CLOSED");

  add(errors, p?.methodology?.source === "reviewer-calibration-v3-replacement-v1" && p.methodology.sourceStatus === "DESIGN_ONLY_UNISSUED" && p.methodology.sourceGrantsCertificate === false && p.methodology.sourceGrantsScoringAuthority === false && p.methodology.sourceGrantsExecutionAuthority === false, "V3_METHODOLOGY_ONLY");
  add(errors, p?.methodology?.grammar?.singletonPointFamilyRequired === false && p.methodology.grammar.acceptedPointFamilySetPresealed === true && p.methodology.grammar.postIssueExpansionAllowed === false, "METHODOLOGY_GRAMMAR");
  add(errors, p?.methodology?.blank?.singletonPrimaryIntentRequired === false && p.methodology.blank.propositionAxes?.length === 7 && p.methodology.blank.decisiveAxesMinimum === 1 && p.methodology.blank.decisiveAxesMaximum === 2 && p.methodology.blank.postIssueExpansionAllowed === false, "METHODOLOGY_BLANK");

  const roles = p?.roles ?? {};
  add(errors, roles.requiredForSeparateActivation?.distinctCertificationReviewers === 2 && roles.requiredForSeparateActivation?.freshAdjudicators === 1 && roles.currentAssignedActors === 0 && roles.reviewersMustBeDistinct === true, "ROLE_REQUIREMENTS");
  add(errors, setEqual(roles.trustedGoldAuditorIncompatibleWith, AUDITOR_INCOMPATIBLE), "AUDITOR_ROLE_COLLISION");
  for (const role of AUDITOR_INCOMPATIBLE) add(errors, roles.roleIncompatibilities?.some((pair) => setEqual(pair, ["TRUSTED_GOLD_AUDITOR", role])), "AUDITOR_ROLE_COLLISION", role);
  add(errors, roles.sameActorAcrossIncompatibleRolesAllowed === false && roles.saltedPseudonymRegistryRequiredBeforeAnyPacketIssue === true, "ROLE_REQUIREMENTS");

  const access = p?.accessControl ?? {};
  add(errors, access.currentState === STATES[0] && equal(access.stateOrder, STATES), "ACCESS_STATES");
  add(errors, access.eventOrder === "AUTHORIZATION_SEALED_BEFORE_OPEN_THEN_CLOSE_RECEIPT" && access.authorizationMustPrecedeOpenInHashChain === true, "ACCESS_ORDER");
  add(errors, access.timestampRule === "authorizedAtRfc3339 < openedAtRfc3339 <= closedAtRfc3339", "ACCESS_TIME_ORDER");
  add(errors, access.authorizationBinds?.length === 7 && access.receiptBinds?.length === 8 && access.authorizationBinds.includes("CAPABILITY_TOKEN_SHA256") && access.receiptBinds.includes("PRIOR_ALLOW_AUTHORIZATION_EVENT_SHA256") && access.receiptBinds.includes("DENY_SET_SHA256"), "ACCESS_BINDINGS");
  add(errors, access.capabilitySingleUse === true && access.capabilityExpiresAtPhaseClose === true, "CAPABILITY_BOUNDARY");
  add(errors, access.lateOrBackfilledAuthorizationAllowed === false && access.retroactiveEventInsertionAllowed === false && access.eventDeletionOrRewriteAllowed === false, "ACCESS_NO_BACKFILL");
  add(errors, access.denyEventHasOpenReceipt === false && access.everyDeniedAttemptAppendOnlyRecorded === true, "DENY_NO_RECEIPT");
  add(errors, access.currentAccessEvents === 0, "EMPTY_STATE_ZERO");
  add(errors, Object.keys(access.denySets ?? {}).length === STATES.length && STATES.every((state) => Array.isArray(access.denySets[state]) && access.denySets[state].length > 0), "DENY_SETS");
  add(errors, equal(access.phaseResourcePolicy?.PHASE1_ALLOW_ONLY, PHASE1_ALLOW), "PHASE1_ALLOWLIST");
  for (const resource of ["ITEM_IDENTITY", "ANSWER_KEY", "TRUSTED_GOLD", "REJECTION_HISTORY", "OTHER_RATER_SUBMISSION"]) add(errors, access.phaseResourcePolicy?.PHASE1_DENY?.includes(resource), "PHASE1_ALLOWLIST", resource);
  add(errors, access.phaseResourcePolicy?.PHASE2_PRECONDITION === "OWN_PHASE1_RESPONSE_SEALED_AND_BOUND_ALLOW_RECEIPT" && access.phaseResourcePolicy?.HOLDOUT_ISSUE_PRECONDITION === "INDEPENDENT_TRUSTED_GOLD_AUDIT_PASS_SEALED", "ACCESS_ORDER");

  const hidden = p?.hiddenCommitments ?? {};
  add(errors, hidden.sealedBeforePacketIssue === true && hidden.separateFromVisibleSurface === true && hidden.hashAlgorithm === "SHA-256", "HIDDEN_COMMITMENT");
  add(errors, equal(hidden.requiredPerSlotBindings, HIDDEN_BINDINGS), "HIDDEN_BINDINGS");
  add(errors, equal(hidden.hiddenFromPhase1Classes, HIDDEN_CLASSES), "HIDDEN_CLASSES");
  add(errors, hidden.visibleSurfaceRequiresPreAccessCapability === true, "SURFACE_CAPABILITY");
  add(errors, hidden.hiddenRevealRequiresOwnResponseSealAndNewBoundCapability === true, "HIDDEN_REVEAL_GATE");
  add(errors, hidden.rejectionHistoryNeverVisibleToRaters === true, "REJECTION_HISTORY_HIDDEN");
  add(errors, hidden.leakDisposition?.includes("NO_SCORE_NO_CERTIFICATE"), "HIDDEN_LEAK_FAIL_CLOSED");
  add(errors, equal(p?.requiredPhaseSeals, PHASE_SEALS), "PHASE_SEALS");

  const activation = p?.activation ?? {};
  add(errors, activation.containedInThisArtifact === false && activation.currentActivationEvents === 0 && activation.separateIndependentAuditRequired === true && activation.requiredAuditVerdict === "PASS_NO_BLOCKERS" && activation.retroactiveActivationAllowed === false && activation.thisDesignMayBeEditedIntoActivation === false, "SEPARATE_ACTIVATION");
  add(errors, activation.activationMayOccurOnlyAfter?.includes("TWO_DISTINCT_CURRENT_REVIEWER_CERTIFICATES") && activation.activationMayOccurOnlyAfter?.includes("ONE_FRESH_ADJUDICATOR_BINDING") && activation.separateActivationEventMustBind?.includes("THIS_DESIGN_MANIFEST_SHA256"), "SEPARATE_ACTIVATION");
  add(errors, Object.values(p?.claims ?? {}).every((value) => value === "NONE"), "CLAIMS_NONE");
  add(errors, Object.values(p?.emptyOperationalState ?? {}).every((value) => value === 0), "EMPTY_STATE_ZERO");
  add(errors, Object.values(p?.activity ?? {}).every((value) => value === 0), "ACTIVITY_ZERO");
  add(errors, Object.values(p?.publicOnlyBoundary?.activity ?? {}).every((value) => value === 0), "ACTIVITY_ZERO");
  return errors;
}

function validateRegistries(r) {
  const errors = [];
  add(errors, r?.schemaVersion === "reviewer-calibration-v4-production-bound-registries-2" && r?.artifactId === "reviewer-calibration-v4-production-bound-v2" && r?.status === "IMMUTABLE_EMPTY_SLOT_REGISTRIES_ONLY", "REGISTRY_IDENTITY");
  add(errors, r?.epoch?.value === 1 && r.epoch.oneBased === true && r.epoch.advanceAuthorized === false && r.epoch.failureDoesNotAdvance === true && r.epoch.outcomeAwareSkippingAllowed === false, "ROTATION_FAIL_CLOSED");
  const roles = r?.roleRegistry ?? {};
  add(errors, roles.sealed === false && roles.registrySha256 === null && roles.assignedActorCount === 0 && roles.saltedPseudonymCount === 0 && roles.ready === false, "REGISTRY_EMPTY");
  add(errors, roles.slots?.length === 9 && roles.slots.every((slot) => slot.actorPseudonym === null && slot.assignmentEventSha256 === null), "REGISTRY_EMPTY");
  add(errors, Array.isArray(roles.incompatibilityProofs) && roles.incompatibilityProofs.length === 0, "REGISTRY_EMPTY");
  const slots = r?.slotRegistry ?? {};
  add(errors, slots.totalFutureSlots === 60 && slots.filledSlots === 0 && slots.eligibleSlots === 0 && slots.issuedSlots === 0, "SLOT_COUNT");
  add(errors, equal(slots.expandedSlotIds, generatedSlotIds()) && new Set(slots.expandedSlotIds ?? []).size === 60, "SLOT_IDS");
  add(errors, Array.isArray(slots.slotPayloads) && slots.slotPayloads.length === 0 && Object.values(slots.stateTemplate ?? {}).every((value) => value === null || value === false), "REGISTRY_EMPTY");
  add(errors, equal(slots.generators?.map((row) => row.total), [12, 24, 24]), "SLOT_COUNT");
  const mainTargets = slots.generators?.[1]?.blocks?.[2]?.epochOneTargets ?? [];
  const holdoutTargets = slots.generators?.[2]?.blocks?.[2]?.epochOneTargets ?? [];
  add(errors, mainTargets.length === 8 && holdoutTargets.length === 8, "EPOCH_ONE_ROTATION");
  FAMILIES.forEach(([familyId, order], index) => {
    const main = selectedAt(order, 1, "main");
    const holdout = selectedAt(order, 1, "holdout");
    add(errors, mainTargets[index]?.ordinal === index + 1 && mainTargets[index]?.familyId === familyId && mainTargets[index]?.typeId === main.typeId, "EPOCH_ONE_ROTATION", `${familyId}:main`);
    add(errors, holdoutTargets[index]?.ordinal === index + 1 && holdoutTargets[index]?.familyId === familyId && holdoutTargets[index]?.typeId === holdout.typeId && holdout.typeId !== main.typeId, "EPOCH_ONE_ROTATION", `${familyId}:holdout`);
  });
  add(errors, new Set([...mainTargets, ...holdoutTargets].map((row) => row.typeId)).size === 16, "EPOCH_ONE_ROTATION");
  const emptyArrays = [
    ...Object.values(r?.phaseEvidenceRegistries ?? {}), ...Object.values(r?.accessRegistries ?? {}),
    ...Object.values(r?.contentCommitmentRegistries ?? {}), r?.coverageRegistry?.contactEvents, r?.coverageRegistry?.passedFreshCoverageEvents,
  ];
  add(errors, emptyArrays.every((value) => Array.isArray(value) && value.length === 0), "REGISTRY_EMPTY");
  add(errors, r?.coverageRegistry?.contactCount === 0 && r.coverageRegistry.certifiedCanonicalTypeCount === 0 && r.coverageRegistry.contactIsCertification === false && r.coverageRegistry.singleEpochAllTypeClaimAllowed === false, "CONTACT_NOT_CERTIFICATION");
  add(errors, Object.entries(r?.operationalState ?? {}).every(([key, value]) => key === "currentState" ? value === "PRE_ACCESS_UNAUTHORIZED" : key === "executionAuthorized" ? value === false : value === 0), "REGISTRY_EMPTY");
  return errors;
}

function validateSchemas(s) {
  const errors = [];
  add(errors, s?.$id === "reviewer-calibration-v4-production-bound-v2-events" && s?.oneOf?.length === 9, "SCHEMA_IDENTITY");
  for (const name of ["roleAssignment", "slotMaterialization", "capabilityAuthorization", "accessReceipt", "denialEvent", "phaseSeal", "reviewerCertificate", "freshAdjudicatorBinding", "separateActivationEvent"]) add(errors, Boolean(s?.$defs?.[name]), "SCHEMA_IDENTITY", name);
  add(errors, Object.values(s?.["x-currentInstanceCounts"] ?? {}).length === 9 && Object.values(s["x-currentInstanceCounts"]).every((value) => value === 0), "SCHEMA_INSTANCE_ZERO");
  add(errors, s?.$defs?.separateActivationEvent?.allOf?.[1]?.properties?.reviewerCertificateSha256s?.minItems === 2 && s.$defs.separateActivationEvent.allOf[1].properties.reviewerCertificateSha256s.maxItems === 2 && s.$defs.separateActivationEvent.allOf[1].properties.independentActivationAuditVerdict.const === "PASS_NO_BLOCKERS", "SCHEMA_ACTIVATION_TWO_REVIEWERS");
  add(errors, s?.$defs?.denialEvent?.allOf?.[1]?.properties?.hasOpenReceipt?.const === false && s.$defs.denialEvent.allOf[1].properties.authorizationEventSha256.type === "null" && s.$defs.denialEvent.allOf[1].properties.openedAtRfc3339.type === "null" && s.$defs.denialEvent.allOf[1].properties.closedAtRfc3339.type === "null", "SCHEMA_DENY");
  add(errors, s?.$defs?.capabilityAuthorization?.allOf?.[1]?.properties?.openedAtRfc3339?.type === "null" && s.$defs.capabilityAuthorization.allOf[1].properties.closedAtRfc3339.type === "null" && s.$defs.capabilityAuthorization.allOf[1].properties.authorizationEventSha256.type === "null", "SCHEMA_AUTHORIZATION_PREOPEN");
  for (const text of ["AUTHORIZATION_EVENT_MUST_BE_SEALED_EARLIER_IN_THE_CHAIN_THAN_ITS_ACCESS_RECEIPT", "AUTHORIZED_AT_MUST_BE_STRICTLY_EARLIER_THAN_OPENED_AT_AND_OPENED_AT_NO_LATER_THAN_CLOSED_AT", "NO_RETROACTIVE_INSERTION_REWRITE_OR_LATE_AUTHORIZATION"]) add(errors, s?.["x-semanticConstraints"]?.includes(text), "SCHEMA_SEMANTICS", text);
  return errors;
}

function validateAll(p, r, s) {
  return [...validateProtocol(p), ...validateRegistries(r), ...validateSchemas(s)];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveTarget(bundle, target) {
  const parts = target.split(".");
  let parent = bundle;
  for (let index = 0; index < parts.length - 1; index += 1) parent = parent[parts[index]];
  return { parent, key: parts.at(-1) };
}

function applyMutation(bundle, fixture) {
  const { parent, key } = resolveTarget(bundle, fixture.target);
  if (fixture.mutation === "SET") parent[key] = clone(fixture.value);
  else if (fixture.mutation === "DELETE") Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key];
  else if (fixture.mutation === "REMOVE_VALUE") parent[key] = parent[key].filter((value) => !equal(value, fixture.value));
  else if (fixture.mutation === "APPEND") parent[key].push(clone(fixture.value));
  else throw new Error(`unknown mutation: ${fixture.mutation}`);
}

function runExplicitMutations(protocol, registries, schemas, fixtures) {
  return fixtures.explicitCases.map((fixture) => {
    const bundle = { protocol: clone(protocol), registries: clone(registries), schemas: clone(schemas) };
    applyMutation(bundle, fixture);
    const errors = validateAll(bundle.protocol, bundle.registries, bundle.schemas);
    return { id: fixture.id, detected: errors.some((error) => error.code === fixture.expectedError), expectedError: fixture.expectedError, errorCodes: errors.map((error) => error.code) };
  });
}

function runGeneratedMutations(protocol, registries, schemas) {
  const results = [];
  const run = (id, mutate, expected) => {
    const p = clone(protocol); const r = clone(registries); const s = clone(schemas);
    mutate(p, r, s);
    const errors = validateAll(p, r, s);
    results.push({ id, detected: errors.some((error) => error.code === expected), expectedError: expected, errorCodes: errors.map((error) => error.code) });
  };
  for (const [key, value] of Object.entries(protocol.permanentDesignBoundary)) if (typeof value === "boolean" && value === false) run(`permanent-false-${key}`, (p) => { p.permanentDesignBoundary[key] = true; }, "PERMANENT_FALSE");
  for (const key of Object.keys(protocol.emptyOperationalState)) run(`empty-counter-${key}`, (p) => { p.emptyOperationalState[key] = 1; }, "EMPTY_STATE_ZERO");
  for (const state of STATES) {
    run(`deny-missing-${state}`, (p) => { delete p.accessControl.denySets[state]; }, "DENY_SETS");
    run(`deny-empty-${state}`, (p) => { p.accessControl.denySets[state] = []; }, "DENY_SETS");
  }
  for (const seal of PHASE_SEALS) run(`seal-missing-${seal}`, (p) => { p.requiredPhaseSeals = p.requiredPhaseSeals.filter((value) => value !== seal); }, "PHASE_SEALS");
  for (const hidden of HIDDEN_CLASSES) run(`hidden-class-missing-${hidden}`, (p) => { p.hiddenCommitments.hiddenFromPhase1Classes = p.hiddenCommitments.hiddenFromPhase1Classes.filter((value) => value !== hidden); }, "HIDDEN_CLASSES");
  for (const binding of HIDDEN_BINDINGS) run(`hidden-binding-missing-${binding}`, (p) => { p.hiddenCommitments.requiredPerSlotBindings = p.hiddenCommitments.requiredPerSlotBindings.filter((value) => value !== binding); }, "HIDDEN_BINDINGS");
  for (const role of AUDITOR_INCOMPATIBLE) run(`auditor-role-missing-${role}`, (p) => { p.roles.trustedGoldAuditorIncompatibleWith = p.roles.trustedGoldAuditorIncompatibleWith.filter((value) => value !== role); }, "AUDITOR_ROLE_COLLISION");
  for (let index = 0; index < EXPECTED_UPSTREAMS.length; index += 1) run(`upstream-drift-${index}`, (p) => { p.upstreams[index].sha256 = "f".repeat(64); }, "UPSTREAM_PIN");
  const registryArrayPaths = [
    ["roleRegistry", "incompatibilityProofs"],
    ...Object.keys(registries.phaseEvidenceRegistries).map((key) => ["phaseEvidenceRegistries", key]),
    ...Object.keys(registries.accessRegistries).map((key) => ["accessRegistries", key]),
    ...Object.keys(registries.contentCommitmentRegistries).map((key) => ["contentCommitmentRegistries", key]),
    ["coverageRegistry", "contactEvents"], ["coverageRegistry", "passedFreshCoverageEvents"],
  ];
  for (const [group, key] of registryArrayPaths) run(`registry-nonempty-${group}-${key}`, (_p, r) => { r[group][key].push({ injected: true }); }, "REGISTRY_EMPTY");
  for (const key of Object.keys(schemas["x-currentInstanceCounts"])) run(`schema-instance-${key}`, (_p, _r, s) => { s["x-currentInstanceCounts"][key] = 1; }, "SCHEMA_INSTANCE_ZERO");
  return results;
}

function validateAccessScenario(authorization, receipt) {
  const errors = [];
  if (authorization?.eventKind !== "AUTHORIZATION" || authorization?.decision !== "ALLOW") errors.push("PRIOR_ALLOW");
  if (receipt?.eventKind !== "ACCESS_RECEIPT" || receipt?.decision !== "ALLOW") errors.push("RECEIPT");
  if (authorization && receipt) {
    if (!(authorization.eventOrdinal < receipt.eventOrdinal)) errors.push("ORDER");
    if (receipt.authorizationEventSha256 !== authorization.eventSha256) errors.push("AUTH_HASH");
    for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256", "denySetSha256"]) if (authorization[key] !== receipt[key]) errors.push(`BIND_${key}`);
    const times = [receipt.authorizedAtRfc3339, receipt.openedAtRfc3339, receipt.closedAtRfc3339].map(Date.parse);
    if (!times.every(Number.isFinite) || !(times[0] < times[1] && times[1] <= times[2])) errors.push("TIME");
  }
  return errors;
}

function runAccessScenarios() {
  const authorization = {
    eventKind: "AUTHORIZATION", decision: "ALLOW", eventOrdinal: 1, eventSha256: "a".repeat(64), actorPseudonym: "reviewer-pseudonym-0001",
    actorRole: "MAIN_CERTIFICATION_RATER", phase: "MAIN_CERTIFICATION_PHASE1", resourceSha256: "b".repeat(64), visibleSurfaceSha256: "c".repeat(64), capabilityTokenSha256: "d".repeat(64), denySetSha256: "e".repeat(64),
  };
  const receipt = {
    ...authorization, eventKind: "ACCESS_RECEIPT", eventOrdinal: 2, eventSha256: "f".repeat(64), authorizationEventSha256: authorization.eventSha256,
    authorizedAtRfc3339: "2026-07-16T00:00:00.000Z", openedAtRfc3339: "2026-07-16T00:00:00.001Z", closedAtRfc3339: "2026-07-16T00:00:00.002Z",
  };
  const rows = [{ id: "valid-bound-receipt", passed: validateAccessScenario(authorization, receipt).length === 0 }];
  for (const key of ["actorPseudonym", "actorRole", "phase", "resourceSha256", "visibleSurfaceSha256", "capabilityTokenSha256", "denySetSha256"]) rows.push({ id: `reject-${key}-mismatch`, passed: validateAccessScenario(authorization, { ...receipt, [key]: `${receipt[key]}-x` }).includes(`BIND_${key}`) });
  rows.push({ id: "reject-authorization-hash-mismatch", passed: validateAccessScenario(authorization, { ...receipt, authorizationEventSha256: "0".repeat(64) }).includes("AUTH_HASH") });
  rows.push({ id: "reject-backfilled-authorization", passed: validateAccessScenario({ ...authorization, eventOrdinal: 3 }, receipt).includes("ORDER") });
  rows.push({ id: "reject-equal-authorization-open", passed: validateAccessScenario(authorization, { ...receipt, authorizedAtRfc3339: receipt.openedAtRfc3339 }).includes("TIME") });
  rows.push({ id: "reject-open-after-close", passed: validateAccessScenario(authorization, { ...receipt, openedAtRfc3339: "2026-07-16T00:00:00.003Z" }).includes("TIME") });
  return rows;
}

const [protocolBytes, registriesBytes, schemasBytes, fixturesBytes] = await Promise.all([
  readFile(path.join(HERE, "protocol.json")),
  readFile(path.join(HERE, "registries.json")),
  readFile(path.join(HERE, "event-schemas.json")),
  readFile(path.join(HERE, "hostile-fixtures.json")),
]);
const protocol = JSON.parse(protocolBytes);
const registries = JSON.parse(registriesBytes);
const schemas = JSON.parse(schemasBytes);
const fixtures = JSON.parse(fixturesBytes);
const baseErrors = validateAll(protocol, registries, schemas);
if (baseErrors.length) throw new Error(`base contract failed: ${JSON.stringify(baseErrors, null, 2)}`);

const upstreamObservations = [];
for (const [id, upstreamPath, expected] of EXPECTED_UPSTREAMS) {
  const observed = sha256(await readRepo(upstreamPath));
  if (observed !== expected) throw new Error(`upstream drift ${id}: ${observed}`);
  upstreamObservations.push({ id, path: upstreamPath, expectedSha256: expected, observedSha256: observed });
}

const lineagePaths = EXPECTED_UPSTREAMS.filter(([, upstreamPath]) => upstreamPath.endsWith("MANIFEST.sha256")).map(([, upstreamPath]) => upstreamPath);
const lineages = [];
for (const manifestRel of lineagePaths) lineages.push(await verifyManifest(manifestRel));
if (lineages.some((row) => row.mismatches.length)) throw new Error(`upstream manifest mismatch: ${JSON.stringify(lineages)}`);

const evaluationManifest = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[0][1])).toString("utf8"));
if (evaluationManifest.status !== "DESIGN_ONLY_EXECUTION_BLOCKED" || evaluationManifest.authority?.evaluatorAuthorityGranted !== false || evaluationManifest.authority?.authorizedReviewers !== 0 || evaluationManifest.authority?.authorizedAdjudicators !== 0) throw new Error("evaluation-authority public manifest escalated");
for (const row of evaluationManifest.upstreams ?? []) {
  if (forbiddenPath(row.path)) throw new Error(`evaluation public manifest contains forbidden direct upstream: ${row.path}`);
  const observed = sha256(await readRepo(row.path));
  if (observed !== row.sha256 || observed !== row.observedSha256) throw new Error(`evaluation nested upstream drift: ${row.id}`);
}

const evaluationAudit = JSON.parse((await readRepo("experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/audit.json")).toString("utf8"));
if (evaluationAudit.verdict !== "PASS_NO_BLOCKERS" || evaluationAudit.subject?.publicManifestSha256 !== EXPECTED_UPSTREAMS[0][2] || evaluationAudit.disposition?.evaluatorAuthorityGranted !== false || evaluationAudit.disposition?.authorizedReviewers !== 0 || evaluationAudit.disposition?.eligibleAssignments !== 0) throw new Error("evaluation-authority independent audit binding failed");

const binding = JSON.parse((await readRepo("experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/binding.json")).toString("utf8"));
if (!equal(binding.canonicalUniverse?.uiTypeIdsInOrder, TYPES) || !equal(binding.canonicalUniverse?.focusTypeIds, TYPES.slice(0, 2)) || !equal(binding.canonicalUniverse?.nonfocusTypeIdsInUiOrder, TYPES.slice(2))) throw new Error("binding-v4 canonical universe mismatch");
if (!equal(binding.families, FAMILIES.map(([familyId, rotationOrder]) => ({ familyId, rotationOrder })))) throw new Error("binding-v4 family mismatch");
if (binding.rotation?.contactIsCertification !== false || binding.rotation?.singleEpochAllTypeClaimAllowed !== false || binding.scheduleRows?.length !== 32) throw new Error("binding-v4 rotation claim mismatch");
for (const [familyId, order] of FAMILIES) {
  for (let epoch = 1; epoch <= 4; epoch += 1) {
    const row = binding.scheduleRows.find((candidate) => candidate.familyId === familyId && candidate.epoch === epoch);
    const main = selectedAt(order, epoch, "main"); const holdout = selectedAt(order, epoch, "holdout");
    if (!row || row.mainIndex !== main.index || row.mainTypeId !== main.typeId || row.holdoutIndex !== holdout.index || row.holdoutTypeId !== holdout.typeId) throw new Error(`binding-v4 schedule mismatch: ${familyId}/${epoch}`);
  }
}
const bindingAudit = JSON.parse((await readRepo("experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/audit.json")).toString("utf8"));
if (bindingAudit.verdict !== "PASS_NO_BLOCKERS" || bindingAudit.subject?.manifestSha256 !== EXPECTED_UPSTREAMS[3][2] || bindingAudit.subject?.snapshotSha256 !== "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967" || bindingAudit.astEvidence?.uiTypeCount !== 25) throw new Error("binding-v4 audit mismatch");

const methodology = JSON.parse((await readRepo(EXPECTED_UPSTREAMS[5][1])).toString("utf8"));
if (methodology.status !== "DESIGN_ONLY_UNISSUED" || methodology.grammarConstruct?.equivalenceRules?.singletonPointFamilyRequired !== false || methodology.blankConstruct?.rules?.everyOptionHasAllSevenAxes !== true) throw new Error("v3 methodology mismatch");

const explicit = runExplicitMutations(protocol, registries, schemas, fixtures);
const generated = runGeneratedMutations(protocol, registries, schemas);
const mutations = [...explicit, ...generated];
const undetected = mutations.filter((row) => !row.detected);
if (undetected.length) throw new Error(`undetected hostile mutations: ${JSON.stringify(undetected, null, 2)}`);
const scenarios = runAccessScenarios();
if (scenarios.some((row) => !row.passed)) throw new Error(`access scenario failure: ${JSON.stringify(scenarios.filter((row) => !row.passed))}`);

const publicManifestPath = path.join(HERE, "public-manifest.json");
const manifestPath = path.join(HERE, "MANIFEST.sha256");
const publicManifestExists = await readFile(publicManifestPath).then(() => true, () => false);
const manifestExists = await readFile(manifestPath).then(() => true, () => false);
if (publicManifestExists || manifestExists) {
  if (!(publicManifestExists && manifestExists)) throw new Error("public manifest and MANIFEST must appear together");
  const publicManifestBytes = await readFile(publicManifestPath);
  const publicManifest = JSON.parse(publicManifestBytes);
  if (publicManifest.status !== protocol.status || publicManifest.authority?.evaluatorAuthorityGranted !== false || publicManifest.authority?.authorizedReviewers !== 0 || publicManifest.authority?.eligibleSlots !== 0) throw new Error("public manifest authority mismatch");
  if (!equal(publicManifest.upstreams, upstreamObservations)) throw new Error("public manifest upstream observation mismatch");
  const packageEntries = (await readdir(HERE, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedPackageEntries = [...PACKAGE_FILES, "MANIFEST.sha256"].sort();
  if (!equal(packageEntries, expectedPackageEntries)) throw new Error(`package file set mismatch: ${packageEntries.join(",")}`);
  const manifestRows = parseManifest((await readFile(manifestPath, "utf8")));
  if (!setEqual(manifestRows.map((row) => row.path), PACKAGE_FILES)) throw new Error("MANIFEST exact set mismatch");
  for (const row of manifestRows) if (sha256(await readFile(path.join(HERE, row.path))) !== row.sha256) throw new Error(`MANIFEST row mismatch: ${row.path}`);
}

console.log(JSON.stringify({
  verdict: "PASS_DESIGN_ONLY_ZERO_AUTHORITY",
  artifactId: protocol.artifactId,
  status: protocol.status,
  upstreams: `${upstreamObservations.length}/${upstreamObservations.length}`,
  publicLineageRowsRehashed: lineages.reduce((sum, row) => sum + row.verified, 0),
  forbiddenManifestRowsRefused: lineages.reduce((sum, row) => sum + row.refused, 0),
  uiTypes: 25,
  focusTypes: 2,
  nonfocusTypes: 23,
  families: 8,
  futureSlots: 60,
  filledSlots: 0,
  assignedActors: 0,
  accessEvents: 0,
  certificates: 0,
  activationEvents: 0,
  explicitMutations: `${explicit.length}/${explicit.length}`,
  generatedMutations: `${generated.length}/${generated.length}`,
  totalMutations: `${mutations.length}/${mutations.length}`,
  accessScenarios: `${scenarios.length}/${scenarios.length}`,
  prohibitedActivity: 0,
}, null, 2));
