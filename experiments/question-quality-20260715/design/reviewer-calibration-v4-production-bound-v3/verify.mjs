import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("REPO_ROOT_NOT_FOUND");
    current = parent;
  }
}

const REPO_ROOT = findRepoRoot(PKG_DIR);
const ZERO_HASH = "0".repeat(64);
const HEX_HASH = /^[0-9a-f]{64}$/;

class VerificationError extends Error {
  constructor(code, message = code) {
    super(`${code}: ${message}`);
    this.name = "VerificationError";
    this.code = code;
  }
}

function ensure(condition, code, message = code) {
  if (!condition) throw new VerificationError(code, message);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function clone(value) {
  return structuredClone(value);
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function objectKeysExact(object, keys) {
  return same(Object.keys(object).sort(), [...keys].sort());
}

function allZero(object) {
  return Object.values(object).every((value) => value === 0);
}

function getJsonDuplicateKeys(text) {
  let i = 0;
  const duplicates = [];

  function whitespace() {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  }

  function stringToken() {
    ensure(text[i] === '"', "JSON_SCANNER_STRING");
    const start = i;
    i += 1;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
      } else if (text[i] === '"') {
        i += 1;
        return JSON.parse(text.slice(start, i));
      } else {
        i += 1;
      }
    }
    throw new VerificationError("JSON_SCANNER_UNTERMINATED_STRING");
  }

  function value(path) {
    whitespace();
    if (text[i] === "{") return object(path);
    if (text[i] === "[") return array(path);
    if (text[i] === '"') {
      stringToken();
      return;
    }
    const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    ensure(Boolean(match), "JSON_SCANNER_VALUE", `invalid token at byte ${i}`);
    i += match[0].length;
  }

  function object(path) {
    i += 1;
    whitespace();
    const seen = new Set();
    if (text[i] === "}") {
      i += 1;
      return;
    }
    while (i < text.length) {
      whitespace();
      const key = stringToken();
      if (seen.has(key)) duplicates.push(`${path}.${key}`);
      seen.add(key);
      whitespace();
      ensure(text[i] === ":", "JSON_SCANNER_COLON");
      i += 1;
      value(`${path}.${key}`);
      whitespace();
      if (text[i] === "}") {
        i += 1;
        return;
      }
      ensure(text[i] === ",", "JSON_SCANNER_OBJECT_COMMA");
      i += 1;
    }
    throw new VerificationError("JSON_SCANNER_UNTERMINATED_OBJECT");
  }

  function array(path) {
    i += 1;
    whitespace();
    if (text[i] === "]") {
      i += 1;
      return;
    }
    let index = 0;
    while (i < text.length) {
      value(`${path}[${index}]`);
      index += 1;
      whitespace();
      if (text[i] === "]") {
        i += 1;
        return;
      }
      ensure(text[i] === ",", "JSON_SCANNER_ARRAY_COMMA");
      i += 1;
    }
    throw new VerificationError("JSON_SCANNER_UNTERMINATED_ARRAY");
  }

  value("$");
  whitespace();
  ensure(i === text.length, "JSON_SCANNER_TRAILING_BYTES");
  return duplicates;
}

function readJsonStrict(path, code = "JSON") {
  const text = readFileSync(path, "utf8");
  const duplicates = getJsonDuplicateKeys(text);
  ensure(duplicates.length === 0, `${code}_DUPLICATE_KEY`, duplicates.join(", "));
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new VerificationError(`${code}_PARSE`, error.message);
  }
}

function repoPath(repoRelativePath) {
  ensure(typeof repoRelativePath === "string" && repoRelativePath.length > 0, "PATH_EMPTY");
  ensure(!isAbsolute(repoRelativePath), "PATH_ABSOLUTE", repoRelativePath);
  const target = resolve(REPO_ROOT, repoRelativePath);
  const rel = relative(REPO_ROOT, target);
  ensure(rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..", "PATH_ESCAPES_REPO", repoRelativePath);
  return target;
}

const TYPES = [
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE", "SENTENCE_ORDER",
  "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC", "IRRELEVANT", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING", "SYNONYM", "ANTONYM"
];

const FOCUS_BINDING_ORDER = ["BLANK_INFERENCE", "GRAMMAR_ERROR"];
const FOCUS_GATE_ORDER = ["GRAMMAR_ERROR", "BLANK_INFERENCE"];
const NONFOCUS = TYPES.filter((typeId) => !FOCUS_BINDING_ORDER.includes(typeId));

const FAMILIES = [
  { familyId: "NF-F1-GLOBAL_MEANING_SELECTION", rotationOrder: ["TOPIC", "MAIN_IDEA", "TITLE"] },
  { familyId: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE", rotationOrder: ["IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH"] },
  { familyId: "NF-F3-DISCOURSE_STRUCTURE", rotationOrder: ["SENTENCE_ORDER", "SENTENCE_INSERT", "IRRELEVANT"] },
  { familyId: "NF-F4-GRAMMAR_FORM_DIAGNOSIS", rotationOrder: ["GRAMMAR_CHOICE_COMBO", "GRAMMAR_CORRECTION"] },
  { familyId: "NF-F5-LEXICAL_SEMANTICS", rotationOrder: ["VOCAB_CHOICE", "CONTEXT_MEANING", "SYNONYM", "ANTONYM"] },
  { familyId: "NF-F6-SUMMARY_AND_COMPRESSION", rotationOrder: ["SUMMARY_COMPLETE_MC", "SUMMARY_COMPLETE", "SUMMARY_WRITING"] },
  { familyId: "NF-F7-CONTROLLED_REWRITE_AND_ORDER", rotationOrder: ["CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "WORD_ORDER"] },
  { familyId: "NF-F8-TARGETED_CONSTRUCTED_EXPRESSION", rotationOrder: ["FILL_BLANK_KEY", "TOPIC_SENTENCE_WRITING"] }
];

const FAMILY_IDS = FAMILIES.map(({ familyId }) => familyId);

const ROLES = [
  "PACKET_AUTHOR", "ITEM_AUTHOR", "GOLD_AUTHOR", "TAXONOMY_PILOT_RATER", "MAIN_CERTIFICATION_RATER",
  "ACTIVATION_HOLDOUT_RATER", "CERTIFICATION_REVIEWER", "TRUSTED_GOLD_AUDITOR", "CALIBRATION_ADJUDICATOR",
  "S1_REVIEWER", "S1_ADJUDICATOR", "S1_RESULT_CUSTODIAN", "S1_RESULT_VIEWER",
  "ACTIVATION_CANDIDATE_AUTHOR", "INDEPENDENT_ACTIVATION_AUDITOR", "ACTIVATION_GRANT_AUTHOR"
];

const TRUSTED_INCOMPATIBLE = ROLES.filter((role) => role !== "TRUSTED_GOLD_AUDITOR");
const ACTIVATION_INCOMPATIBLE = ROLES.filter((role) => role !== "INDEPENDENT_ACTIVATION_AUDITOR");
const FRESH_ADJUDICATOR_INCOMPATIBLE = [
  "PACKET_AUTHOR", "ITEM_AUTHOR", "GOLD_AUTHOR", "CERTIFICATION_REVIEWER", "TRUSTED_GOLD_AUDITOR",
  "S1_RESULT_CUSTODIAN", "S1_RESULT_VIEWER", "INDEPENDENT_ACTIVATION_AUDITOR"
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
  "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE",
  "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
  "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
  "ACTIVATION_GRANTED"
];

const RESOURCE_CLASSES = [
  "BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK", "OWN_PHASE1_RESPONSE",
  "BOUND_ANSWER_EXPLANATION_REVEAL", "TRUSTED_GOLD_AUDIT_BUNDLE", "ADJUDICATION_BUNDLE",
  "ACTIVATION_CANDIDATE_BYTES", "ACTIVATION_AUDIT_REPORT_BYTES", "S1_RESULT_SCOPE_BOUND",
  "OUT_OF_SCOPE_S1_RESULT", "OTHER_RATER_IDENTITY", "RAW_HIDDEN_COMMITMENT", "REJECTION_SURPLUS_HISTORY",
  "RAW_PRIVATE_TRUSTED_GOLD"
];

const SLOT_COMMITMENTS = [
  "ITEM_IDENTITY_AND_SOURCE_SHA256", "VISIBLE_SURFACE_SHA256", "ANSWER_KEY_SHA256", "TRUSTED_GOLD_SHA256",
  "EXPLANATION_FATAL_CRAFT_EVIDENCE_SHA256", "AUTHOR_HYPOTHESIS_TARGET_SHA256", "REJECTION_HISTORY_ROOT_SHA256",
  "SURPLUS_HISTORY_ROOT_SHA256", "PACKET_ORDER_RELABEL_SHA256", "RIGHTS_PII_EVIDENCE_SHA256",
  "NORMALIZED_FINGERPRINT_BUNDLE_SHA256", "TYPE_FAMILY_ROTATION_PROOF_SHA256"
];

const SLOT_REQUIRED_FIELDS = [
  "SLOT_ID", "PHASE", "BLOCK", "ORDINAL", "CANONICAL_TYPE_ID", "CANONICAL_FAMILY_ID_OR_NULL", "ROTATION_EPOCH"
];

const SLOT_SCHEMA_FIELDS = [
  "itemIdentityAndSourceSha256", "visibleSurfaceSha256", "answerKeySha256", "trustedGoldSha256",
  "explanationFatalCraftEvidenceSha256", "authorHypothesisTargetSha256", "rejectionHistoryRootSha256",
  "surplusHistoryRootSha256", "packetOrderRelabelSha256", "rightsPiiEvidenceSha256", "fingerprintBundle",
  "typeFamilyRotationProofSha256"
];

const FINGERPRINT_COMPONENTS = [
  "NORMALIZED_FULL_TEXT_SHA256", "HASHED_EIGHT_WORD_WINDOW_SET_SHA256", "TOPIC_TAG_SET_SHA256",
  "SCENARIO_ENTITY_TUPLE_SHA256", "ITEM_AUTHOR_PSEUDONYM_SHA256", "SURFACE_TEMPLATE_FINGERPRINT_SHA256",
  "COMPOSITE_FINGERPRINT_SHA256"
];

const FINGERPRINT_SCHEMA_FIELDS = [
  "normalizedFullTextSha256", "hashedEightWordWindowSetSha256", "topicTagSetSha256",
  "scenarioEntityTupleSha256", "itemAuthorPseudonymSha256", "surfaceTemplateFingerprintSha256",
  "compositeFingerprintSha256"
];

const EVENT_DEFS = [
  "roleAssignment", "artifactAuthorshipRecord", "slotMaterialization", "fingerprintReservation",
  "fingerprintTombstone", "disjointnessProof", "passedCoverageEvent", "reviewerCertificate",
  "freshAdjudicatorBinding", "trustedGoldAuditReport", "authorization", "openEvent", "capabilityConsume",
  "closeEvent", "denial", "phaseTransition", "certificationEvidenceSeal", "activationCandidate",
  "activationCandidateAuditReport", "activationGrant"
];

const BLOCKER_CODES = [
  "B1_TRUSTED_GOLD_SELF_AUDIT_NOT_EXCLUDED",
  "B2_ACTIVATION_AUDITOR_SELF_REVIEW_NOT_EXCLUDED",
  "B3_EXACT_TYPE_COVERAGE_NOT_BOUND_TO_CERTIFICATE_OR_ACTIVATION",
  "B4_ACTIVATION_AUDIT_DEPENDENCY_IS_CIRCULAR",
  "B5_SLOT_MATERIALIZATION_CANNOT_BIND_REQUIRED_HIDDEN_AND_TYPE_EVIDENCE",
  "B6_FRESH_DISJOINT_NO_REPLAY_SEQUENCE_HAS_NO_MATERIAL_PROOF",
  "B7_ACCESS_AUTHORIZATION_DOES_NOT_BIND_RESOURCE_CLASS_OR_CURRENT_STATE",
  "B8_PREOPEN_AND_SINGLE_USE_CAPABILITY_CLAIMS_LACK_CHAIN_EVIDENCE"
];

const BLOCKER_CLOSURES = {
  B1: "EXPLICIT_PACKET_ITEM_GOLD_AUTHOR_ROLES_PLUS_AUDITOR_ROLE_AND_ARTIFACT_AUTHORSHIP_EXCLUSION_PROOFS",
  B2: "ACTIVATION_AUDITOR_INCOMPATIBLE_WITH_EVERY_AUTHOR_REVIEWER_AUDITOR_ADJUDICATOR_CUSTODIAN_RESULT_VIEWER_AND_OWN_ARTIFACTS",
  B3: "CERTIFICATES_AND_CANDIDATE_BIND_SCOPE_ENUM_EXACT_CANONICAL_IDS_COUNTS_AND_PER_TYPE_PASSED_COVERAGE_EVENT_HASHES",
  B4: "AUTHORITY_FALSE_CANDIDATE_THEN_EXACT_CANDIDATE_AUDIT_THEN_FINAL_GRANT_BOUND_TO_PASS_AUDIT",
  B5: "SLOT_SCHEMA_REQUIRES_ALL_HIDDEN_COMMITMENTS_RIGHTS_PII_EXACT_TYPE_FAMILY_ROTATION_EPOCH_AND_PROOF",
  B6: "MATERIAL_FINGERPRINT_RESERVATION_TOMBSTONE_DISJOINTNESS_AND_NO_REPLAY_PROOF_EVENTS",
  B7: "AUTHORIZATION_AND_DENIAL_BIND_CURRENT_STATE_RESOURCE_CLASS_POLICY_ALLOWLIST_DENY_DIGESTS_AND_PROOF",
  B8: "APPEND_ONLY_AUTHORIZATION_OPEN_CONSUME_CLOSE_CHAIN_PLUS_UNIQUE_SINGLE_USE_CAPABILITY_REGISTRY"
};

const UPSTREAMS = [
  ["predecessor-v2-subject-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v2/MANIFEST.sha256", "10801e127bb612e2bb6909acf857ff6fa2ef0cac667a0fd7e4e39f774e656413"],
  ["predecessor-v2-independent-fail-audit-manifest", "experiments/question-quality-20260715/reviews/reviewer-calibration-v4-production-bound-v2-independent-audit-v1/MANIFEST.sha256", "f78ba69b164f737b6531c2e7415bd26cf147afc6012265a13a8434882b891bc5"],
  ["evaluation-authority-v2-public-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/public-manifest.json", "c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd"],
  ["evaluation-authority-v2-subject-manifest", "experiments/question-quality-20260715/design/evaluation-authority-v2/MANIFEST.sha256", "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180"],
  ["evaluation-authority-v2-independent-audit-manifest", "experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/MANIFEST.sha256", "0cdf9d676bdec820e728a3b3890237b3b80d201caa2c20afc7af46ed6482adf5"],
  ["production-type-binding-v4-subject-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/MANIFEST.sha256", "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04"],
  ["production-type-binding-v4-independent-audit-manifest", "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/MANIFEST.sha256", "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d"],
  ["reviewer-calibration-v3-replacement-v1-protocol", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/protocol.json", "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162"],
  ["reviewer-calibration-v3-replacement-v1-manifest", "experiments/question-quality-20260715/design/reviewer-calibration-v3-replacement-v1/MANIFEST.sha256", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"]
];

const EXPECTED_TRANSITIONS = [
  [STATES[0], STATES[1], "PHASE_TRANSITION"],
  [STATES[1], STATES[2], "PHASE_TRANSITION"],
  [STATES[2], STATES[3], "PHASE_TRANSITION"],
  [STATES[3], STATES[4], "PHASE_TRANSITION"],
  [STATES[4], STATES[5], "TRUSTED_GOLD_AUDIT_REPORT"],
  [STATES[5], STATES[6], "PHASE_TRANSITION"],
  [STATES[6], STATES[7], "PHASE_TRANSITION"],
  [STATES[7], STATES[8], "CERTIFICATION_EVIDENCE_SEAL"],
  [STATES[8], STATES[9], "ACTIVATION_CANDIDATE"],
  [STATES[9], STATES[10], "ACTIVATION_CANDIDATE_AUDIT_REPORT"],
  [STATES[10], STATES[11], "ACTIVATION_GRANT"]
];

function validateProtocol(p) {
  ensure(p.schemaVersion === "reviewer-calibration-v4-production-bound-protocol-3", "PROTOCOL_IDENTITY");
  ensure(p.artifactId === "reviewer-calibration-v4-production-bound-v3", "PROTOCOL_IDENTITY");
  ensure(p.status === "DESIGN_ONLY_UNISSUED_EXECUTION_BLOCKED_PENDING_FRESH_AUDIT", "PROTOCOL_STATUS");
  ensure(p.authorEvidenceDisposition === "AUTHOR_EVIDENCE_COMPLETE_FRESH_INDEPENDENT_AUDIT_REQUIRED_NO_PASS_CLAIM", "PROTOCOL_DISPOSITION");

  const boundary = p.permanentDesignBoundary;
  for (const key of ["thisArtifactTransitions", "issued", "executionAuthorized", "evaluatorAuthorityGranted", "scoringAuthorityGranted", "resultAccessAuthorized", "generationAuthorized"]) {
    ensure(boundary[key] === false, "BOUNDARY_FALSE", key);
  }
  for (const key of ["reviewerCertificatesIssued", "authorizedReviewers", "authorizedAdjudicators", "activationCandidates", "activationAuditReports", "activationGrants"]) {
    ensure(boundary[key] === 0, "BOUNDARY_ZERO", key);
  }
  ensure(boundary.freshIndependentAuditRequired === true && boundary.separateImmutableExecutionPackageRequired === true, "BOUNDARY_FRESH_AUDIT");
  ensure(p.publicOnlyBoundary.allowed === "EXACT_PUBLIC_UPSTREAM_BYTES_AND_SAFE_PUBLIC_MANIFEST_ROWS_ONLY", "PUBLIC_BOUNDARY");
  ensure(Array.isArray(p.publicOnlyBoundary.forbidden) && p.publicOnlyBoundary.forbidden.length >= 8, "PUBLIC_BOUNDARY");
  ensure(allZero(p.publicOnlyBoundary.activity), "PUBLIC_ACTIVITY_ZERO");

  ensure(p.upstreams.length === UPSTREAMS.length, "UPSTREAM_COUNT");
  for (let i = 0; i < UPSTREAMS.length; i += 1) {
    const [id, path, hash] = UPSTREAMS[i];
    const upstream = p.upstreams[i];
    ensure(upstream.id === id && upstream.path === path && upstream.sha256 === hash, "UPSTREAM_PIN", id);
    if (id !== "reviewer-calibration-v3-replacement-v1-protocol") ensure(upstream.grantsAuthority === false, "UPSTREAM_AUTHORITY", id);
  }
  const predecessorAudit = p.upstreams[1];
  ensure(predecessorAudit.auditJsonSha256 === "48550f4b9cffc72fd2e30e5ede45a6f70fa1f794f087e7fd2bc4453e8102feba", "PREDECESSOR_AUDIT_PIN");
  ensure(predecessorAudit.requiredVerdict === "FAIL_BLOCKERS" && same(predecessorAudit.requiredBlockerCodes, BLOCKER_CODES), "PREDECESSOR_FAILURE_REQUIREMENTS");
  ensure(p.upstreams[5].snapshotSha256 === "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967", "TYPE_BINDING_SNAPSHOT_PIN");
  ensure(p.upstreams[5].bindingJsonSha256 === "47df395f54179538d27a714ac0df4dc9e82f04b767bc82f45b8473c38d04cc3d", "TYPE_BINDING_JSON_PIN");

  ensure(p.predecessorDisposition.v2Accepted === false, "PREDECESSOR_DISPOSITION");
  ensure(p.predecessorDisposition.v2AuditVerdict === "FAIL_BLOCKERS", "PREDECESSOR_DISPOSITION");
  ensure(p.predecessorDisposition.v2MayExecute === false && p.predecessorDisposition.v2MayIssueCertificates === false, "PREDECESSOR_DISPOSITION");
  ensure(p.predecessorDisposition.v2MayProduceActivationCandidateOrGrant === false, "PREDECESSOR_DISPOSITION");
  ensure(p.predecessorDisposition.v3CurrentlyAcceptedAsAuditedSuccessor === false && p.predecessorDisposition.freshIndependentAuditRequiredBeforeAnyV3Acceptance === true, "PREDECESSOR_DISPOSITION");
  ensure(p.predecessorDisposition.currentV3AuthorityBeforeFreshAudit === "NONE", "PREDECESSOR_DISPOSITION");
  ensure(same(p.blockerClosureMap, BLOCKER_CLOSURES), "BLOCKER_CLOSURE_MAP");

  ensure(p.typeUniverse.uiTypeCount === 25 && same(p.typeUniverse.uiTypeIdsInOrder, TYPES), "TYPE_UNIVERSE");
  ensure(same(p.typeUniverse.focusTypeIds, FOCUS_BINDING_ORDER), "TYPE_FOCUS_BINDING_ORDER");
  ensure(p.typeUniverse.nonfocusTypeCount === 23 && same(p.typeUniverse.nonfocusTypeIds, NONFOCUS), "TYPE_NONFOCUS");
  ensure(same(p.typeUniverse.families, FAMILIES), "TYPE_FAMILIES");
  ensure(p.typeUniverse.rotation.bindingV4CanonicalDigest === "433d72598f123a19950b57e4684d0ba004031d3beb0860fc5d5d226ddcf8022b", "TYPE_BINDING_DIGEST");
  ensure(p.typeUniverse.rotation.epochIsOneBased === true, "ROTATION_POLICY");
  ensure(p.typeUniverse.rotation.epoch1MainHoldoutDistinctNonfocusContacts === 16, "ROTATION_POLICY");
  ensure(p.typeUniverse.rotation.epoch1All25ClaimAllowed === false && p.typeUniverse.rotation.contactIsCertification === false, "ROTATION_POLICY");
  ensure(p.typeUniverse.rotation.all25RequiresExactPassedCoverageEvents === 25, "ROTATION_POLICY");

  ensure(same(p.roles.roleEnum, ROLES), "ROLE_ENUM");
  ensure(same(p.roles.trustedGoldAuditorIncompatibleWith, TRUSTED_INCOMPATIBLE), "ROLE_TRUSTED_INCOMPATIBILITY");
  ensure(same(p.roles.activationAuditorIncompatibleWith, ACTIVATION_INCOMPATIBLE), "ROLE_ACTIVATION_INCOMPATIBILITY");
  ensure(same(p.roles.freshAdjudicatorIncompatibleWith, FRESH_ADJUDICATOR_INCOMPATIBLE), "ROLE_FRESH_ADJUDICATOR_INCOMPATIBILITY");
  ensure(same(p.roles.artifactAuthorshipExclusionRequired.trustedGoldAudit, ["ITEM_AUTHOR", "GOLD_AUTHOR", "PACKET_AUTHOR"]), "ROLE_AUTHORSHIP_EXCLUSION");
  ensure(p.roles.artifactAuthorshipExclusionRequired.activationCandidateAudit.includes("ACTIVATION_CANDIDATE_AUTHOR"), "ROLE_AUTHORSHIP_EXCLUSION");
  ensure(p.roles.sameActorAcrossAnyIncompatiblePairAllowed === false && p.roles.currentActorAssignments === 0, "ROLE_CURRENT_ZERO");
  ensure(same(p.roles.requiredForActivationCandidate, { distinctCertificationReviewers: 2, freshAdjudicators: 1, trustedGoldAuditors: 1 }), "ROLE_REQUIRED_COUNTS");

  ensure(p.calibrationSequence.futureItemSlots === 60 && p.calibrationSequence.filledItemSlots === 0, "SEQUENCE_COUNTS");
  ensure(same(p.calibrationSequence.exactOrder.map((row) => [row.phase, row.freshItems]), [
    ["TAXONOMY_PILOT", 12], ["MAIN_CERTIFICATION", 24], ["INDEPENDENT_TRUSTED_GOLD_AUDIT", 0],
    ["ACTIVATION_HOLDOUT", 24], ["ACTIVATION_CANDIDATE", 0], ["INDEPENDENT_ACTIVATION_CANDIDATE_AUDIT", 0],
    ["FINAL_ACTIVATION_GRANT", 0]
  ]), "SEQUENCE_ORDER");
  for (const key of ["phaseOverlapAllowed", "skipOrReorderAllowed", "retroactiveAuthorizationPassOrThresholdChangeAllowed", "replayFailedRejectedOrPreviouslyIssuedFingerprintAllowed", "resultAccessBeforeFinalGrantAllowed"]) {
    ensure(p.calibrationSequence[key] === false, "SEQUENCE_FAIL_CLOSED", key);
  }

  ensure(p.stateMachine.currentState === STATES[0] && same(p.stateMachine.states, STATES), "STATE_MACHINE_STATES");
  ensure(p.stateMachine.transitions.length === EXPECTED_TRANSITIONS.length, "STATE_MACHINE_TRANSITION_COUNT");
  for (let i = 0; i < EXPECTED_TRANSITIONS.length; i += 1) {
    const transition = p.stateMachine.transitions[i];
    const [from, to, kind] = EXPECTED_TRANSITIONS[i];
    ensure(transition.from === from && transition.to === to && transition.eventKind === kind, "STATE_MACHINE_TRANSITION", `${i}`);
    ensure(Array.isArray(transition.requiredSeals) && transition.requiredSeals.length >= 1 && unique(transition.requiredSeals), "STATE_MACHINE_SEALS", `${i}`);
    if (i >= 8 && i <= 9) ensure(transition.authorityAfter === false && transition.resultAccessAfter === false, "STATE_MACHINE_PREGRANT_AUTHORITY", `${i}`);
  }
  ensure(p.stateMachine.activationCandidateContainsFutureAuditHash === false, "STATE_MACHINE_NONCIRCULAR");
  ensure(p.stateMachine.candidateAuditCoversExactCandidateBytes === true && p.stateMachine.finalGrantBindsPreexistingPassAudit === true, "STATE_MACHINE_NONCIRCULAR");
  ensure(p.stateMachine.authorityFalseUntilFinalGrant === true && p.stateMachine.resultAccessFalseUntilFinalGrant === true, "STATE_MACHINE_PREGRANT_AUTHORITY");
  ensure(p.stateMachine.currentCompletedTransitions === 0, "STATE_MACHINE_CURRENT_ZERO");

  const coverage = p.coverageAndCertificatePolicy;
  ensure(same(coverage.scopeEnum, ["FOCUS_ONLY", "ALL_25"]), "COVERAGE_SCOPES");
  ensure(same(coverage.focusOnlyCanonicalTypeIdsExact, FOCUS_GATE_ORDER), "COVERAGE_FOCUS_TYPES");
  ensure(same(coverage.all25CanonicalTypeIdsExact, TYPES), "COVERAGE_ALL25_TYPES");
  for (const key of ["passedCoverageEventRequiredPerCanonicalType", "passedCoverageEventHashMustResolveToExactEventBytes", "passedCoverageEventCanonicalTypeMustEqualMapKey", "passedCoverageEventHashesUniqueWithinCoverageMap", "certificateCoverageMapRootMustRecomputeFromOrderedExactMap", "candidateRequestedScopeMustBeSubsetOfBothReviewerCertificateScopes", "candidatePassedCoverageHashForEachRequestedTypeMustEqualBothCertificates"]) {
    ensure(coverage[key] === true, "COVERAGE_BINDING_RULE", key);
  }
  ensure(coverage.sameCoverageEventMayCreditMoreThanOneCanonicalType === false, "COVERAGE_BINDING_RULE");
  ensure(same(coverage.passedCoverageEventEligiblePhases, ["MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"]), "COVERAGE_PHASES");
  ensure(coverage.pilotOrContactEventAcceptedAsPassedCoverage === false, "COVERAGE_CONTACT_REJECTED");
  ensure(coverage.focusOnlyGate.requiredCount === 2 && same(coverage.focusOnlyGate.requiredExactTypeIds, FOCUS_GATE_ORDER), "COVERAGE_FOCUS_GATE");
  ensure(coverage.focusOnlyGate.bothReviewersMustBindBothExactPassedCoverageEventHashes === true, "COVERAGE_FOCUS_GATE");
  ensure(coverage.all25Gate.requiredCount === 25 && same(coverage.all25Gate.requiredExactTypeIds, TYPES), "COVERAGE_ALL25_GATE");
  ensure(coverage.all25Gate.bothReviewersMustBindAll25ExactPassedCoverageEventHashes === true && coverage.all25Gate.epoch1Contact16CannotSatisfy === true, "COVERAGE_ALL25_GATE");
  ensure(coverage.reviewerCertificateMustBind.includes("PASSED_COVERAGE_EVENT_SHA256_BY_CANONICAL_TYPE"), "COVERAGE_CERTIFICATE_BINDINGS");
  ensure(coverage.activationCandidateMustBind.includes("BOTH_REVIEWER_CERTIFICATES_AND_SCOPES"), "COVERAGE_CANDIDATE_BINDINGS");
  ensure(coverage.mixedOrWiderScopeThanEitherCertificateAllowed === false, "COVERAGE_SCOPE_ESCALATION");

  const slot = p.slotMaterializationPolicy;
  ensure(same(slot.requiredCommitments, SLOT_COMMITMENTS), "SLOT_COMMITMENTS");
  ensure(same(slot.requiredFields, SLOT_REQUIRED_FIELDS), "SLOT_REQUIRED_FIELDS");
  for (const key of ["canonicalTypeIdEnumExact", "canonicalFamilyIdEnumExact", "typeFamilyPairMustMatchBindingV4", "mainHoldoutTypeMustEqualBindingV4SelectedAtForEpoch"]) {
    ensure(slot[key] === true, "SLOT_TYPE_ROTATION", key);
  }
  ensure(same(slot.focusPair, { GRAMMAR: "GRAMMAR_ERROR", BLANK: "BLANK_INFERENCE", familyId: null }), "SLOT_FOCUS_PAIR");
  ensure(slot.slotMaterializationBeforeAllCommitmentsAllowed === false && slot.postMaterializationCommitmentAdditionOrRewriteAllowed === false, "SLOT_IMMUTABLE");
  ensure(slot.currentMaterializedSlots === 0, "SLOT_CURRENT_ZERO");

  const fingerprint = p.fingerprintAndReplayPolicy;
  ensure(same(fingerprint.requiredFingerprintComponents, FINGERPRINT_COMPONENTS), "FINGERPRINT_COMPONENTS");
  ensure(same(fingerprint.pairwiseDisjointPhases, ["TAXONOMY_PILOT", "MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"]), "FINGERPRINT_PHASES");
  ensure(same(fingerprint.requiredCounts, { TAXONOMY_PILOT: 12, MAIN_CERTIFICATION: 24, ACTIVATION_HOLDOUT: 24 }), "FINGERPRINT_COUNTS");
  ensure(fingerprint.fullProofPairCount === 1770, "FINGERPRINT_PAIR_COUNT");
  ensure(fingerprint.proofMustBind.length === 6, "FINGERPRINT_PROOF_BINDINGS");
  ensure(fingerprint.reservationMustPrecedeSlotMaterialization === true && fingerprint.terminalFailureOrRejectionCreatesPermanentTombstone === true, "FINGERPRINT_LIFECYCLE");
  ensure(fingerprint.failedRejectedOrPreviouslyIssuedFingerprintMayBeReservedOrIssuedAgain === false, "FINGERPRINT_NO_REPLAY");
  ensure(fingerprint.currentFingerprintReservations === 0 && fingerprint.currentTombstones === 0 && fingerprint.currentDisjointnessProofs === 0, "FINGERPRINT_CURRENT_ZERO");

  const resource = p.resourceAccessPolicy;
  ensure(same(resource.resourceClassEnum, RESOURCE_CLASSES), "RESOURCE_CLASS_ENUM");
  ensure(resource.policyMatrix.length === 7, "RESOURCE_POLICY_MATRIX");
  for (const row of resource.policyMatrix) {
    ensure(Array.isArray(row.states) && row.states.length >= 1 && row.states.every((state) => STATES.includes(state)), "RESOURCE_POLICY_STATE", row.phase);
    ensure(Array.isArray(row.allow) && row.allow.length >= 1 && unique(row.allow), "RESOURCE_POLICY_ALLOW", row.phase);
    ensure(Array.isArray(row.deny) && row.deny.length >= 1 && unique(row.deny), "RESOURCE_POLICY_DENY", row.phase);
    ensure(row.allow.every((entry) => RESOURCE_CLASSES.includes(entry)) && row.deny.every((entry) => RESOURCE_CLASSES.includes(entry)), "RESOURCE_POLICY_CLASS", row.phase);
    ensure(row.allow.every((entry) => !row.deny.includes(entry)), "RESOURCE_POLICY_OVERLAP", row.phase);
  }
  for (const phase of ["TAXONOMY_PILOT_PHASE1", "MAIN_CERTIFICATION_PHASE1", "ACTIVATION_HOLDOUT_PHASE1"]) {
    const row = resource.policyMatrix.find((entry) => entry.phase === phase);
    ensure(row && same(row.allow, ["BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK"]), "RESOURCE_PHASE1_ALLOW", phase);
    ensure(row.deny.includes("BOUND_ANSWER_EXPLANATION_REVEAL") && row.deny.includes("TRUSTED_GOLD_AUDIT_BUNDLE"), "RESOURCE_PHASE1_DENY", phase);
  }
  const post = resource.policyMatrix.find((entry) => entry.phase === "POST_ACTIVATION_RESULT");
  ensure(post && same(post.states, ["ACTIVATION_GRANTED"]), "RESOURCE_POST_GRANT_STATE");
  ensure(post.deny.length >= 5 && post.deny.includes("OUT_OF_SCOPE_S1_RESULT") && post.deny.includes("RAW_PRIVATE_TRUSTED_GOLD"), "RESOURCE_POST_GRANT_DENY");
  ensure(objectKeysExact(resource.stateDenySets, STATES), "RESOURCE_STATE_DENY_KEYS");
  for (const state of STATES) {
    const deny = resource.stateDenySets[state];
    ensure(Array.isArray(deny) && deny.length >= 1 && unique(deny), "RESOURCE_STATE_DENY_NONEMPTY", state);
    ensure(deny.every((entry) => RESOURCE_CLASSES.includes(entry)), "RESOURCE_STATE_DENY_CLASS", state);
  }
  ensure(resource.authorizationMustBind.length === 13 && resource.authorizationMustBind.includes("RESOURCE_CLASS_POLICY_PROOF_SHA256"), "RESOURCE_AUTH_BINDINGS");
  ensure(resource.denialMustBind.length === 10 && resource.denialMustBind.includes("POLICY_DECISION_PROOF_SHA256"), "RESOURCE_DENIAL_BINDINGS");
  ensure(resource.phase1AnswerOrGoldAuthorizationPossible === false && resource.opaqueResourceHashWithoutClassAndPolicyProofAllowed === false, "RESOURCE_PHASE1_FAIL_CLOSED");
  ensure(resource.currentPolicyDigestSha256 === null && resource.currentAuthorizationEvents === 0 && resource.currentDenialEvents === 0, "RESOURCE_CURRENT_ZERO");

  const access = p.accessTransactionPolicy;
  ensure(same(access.eventSequence, ["AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"]), "ACCESS_SEQUENCE");
  ensure(access.canonicalEventBytesRule === "RFC8785_EQUIVALENT_CANONICAL_JSON_EXCLUDING_EVENT_SHA256", "ACCESS_HASH_RULE");
  ensure(access.eventSha256Rule === "SHA256_CANONICAL_EVENT_BYTES", "ACCESS_HASH_RULE");
  for (const key of ["immediateConsecutiveOrdinalsRequired", "eachEventBindsImmediatelyPriorEventSha256", "authorizationOccurredAtEqualsAuthorizedAt", "openOccurredAtEqualsOpenedAt", "consumeOccurredAtEqualsConsumedAt", "closeOccurredAtEqualsClosedAt", "openEventSealedBeforeAnyContentBytes", "consumeEventSealedBeforeContentRelease", "closeRequiredForCompletedAccess", "capabilityUniqueAcrossRegistry", "capabilitySingleUse"]) {
    ensure(access[key] === true, "ACCESS_REQUIRED_RULE", key);
  }
  ensure(access.consumeUseOrdinal === 1, "ACCESS_USE_ORDINAL");
  for (const key of ["secondAuthorizationOpenConsumeOrCloseForCapabilityAllowed", "backdatedOrRetroactivelyInsertedEventAllowed", "eventRewriteOrDeletionAllowed"]) {
    ensure(access[key] === false, "ACCESS_FORBIDDEN_RULE", key);
  }
  for (const key of ["currentAuthorizations", "currentOpens", "currentConsumes", "currentCloses", "currentCapabilitiesIssued", "currentCapabilitiesConsumed"]) {
    ensure(access[key] === 0, "ACCESS_CURRENT_ZERO", key);
  }

  const graph = p.activationEvidenceGraph;
  ensure(graph.candidate.authorityGranted === false && graph.candidate.resultAccessAuthorized === false, "ACTIVATION_CANDIDATE_FALSE");
  ensure(graph.candidate.containsFutureAuditReportOrManifestHash === false && graph.candidate.bindsExactCanonicalBytesSha256 === true, "ACTIVATION_CANDIDATE_NONCIRCULAR");
  ensure(graph.candidateAudit.authorityGranted === false && graph.candidateAudit.resultAccessAuthorized === false, "ACTIVATION_AUDIT_FALSE");
  ensure(graph.candidateAudit.containsOwnFutureAuditManifestHash === false, "ACTIVATION_AUDIT_NONCIRCULAR");
  ensure(graph.candidateAudit.bindsExactCandidateEventSha256 === true && graph.candidateAudit.bindsCandidateCanonicalBytesSha256 === true, "ACTIVATION_AUDIT_BINDING");
  ensure(graph.grant.containedInThisDesign === false && graph.grant.bindsPreexistingAuditReportSha256 === true && graph.grant.bindsPreexistingAuditManifestSha256 === true, "ACTIVATION_GRANT_BINDING");
  ensure(graph.currentCandidates === 0 && graph.currentCandidateAuditReports === 0 && graph.currentGrants === 0, "ACTIVATION_CURRENT_ZERO");

  ensure(allZero(p.emptyOperationalState), "EMPTY_OPERATIONAL_STATE");
  ensure(p.claims.authorDesignPass === "NOT_CLAIMED_PENDING_FRESH_AUDIT", "CLAIMS_NO_PASS");
  ensure(Object.entries(p.claims).filter(([key]) => key !== "authorDesignPass").every(([, value]) => value === "NONE"), "CLAIMS_NONE");
  ensure(allZero(p.activity), "ACTIVITY_ZERO");
}

function selectedAt(rotationOrder, epoch, role) {
  const base = (epoch - 1) % rotationOrder.length;
  if (role === "MAIN") return rotationOrder[base];
  return rotationOrder[(base + Math.ceil(rotationOrder.length / 2)) % rotationOrder.length];
}

function expectedExpandedSlots() {
  const ids = [];
  for (const [prefix, grammar, blank, nonfocus] of [["TP", 4, 4, 4], ["MC", 8, 8, 8], ["AH", 8, 8, 8]]) {
    for (const [block, count] of [["G", grammar], ["B", blank], ["N", nonfocus]]) {
      for (let ordinal = 1; ordinal <= count; ordinal += 1) ids.push(`${prefix}-${block}-${String(ordinal).padStart(2, "0")}`);
    }
  }
  return ids;
}

function validateRegistries(r) {
  ensure(r.schemaVersion === "reviewer-calibration-v4-production-bound-registries-3" && r.artifactId === "reviewer-calibration-v4-production-bound-v3", "REGISTRY_IDENTITY");
  ensure(r.status === "EMPTY_IMMUTABLE_REGISTRY_TEMPLATES_PENDING_FRESH_AUDIT", "REGISTRY_STATUS");
  ensure(same(r.chainGenesis, { nextEventOrdinal: 1, lastEventSha256: ZERO_HASH, eventCount: 0, appendOnly: true }), "REGISTRY_GENESIS");

  const role = r.roleRegistry;
  ensure(role.sealed === false && role.registrySha256 === null && role.assignedActorCount === 0 && role.ready === false, "REGISTRY_ROLE_ZERO");
  ensure(role.slots.length === 17, "REGISTRY_ROLE_SLOT_COUNT");
  const expectedRoleSlots = [
    ["PILOT_PACKET_AUTHOR", "PACKET_AUTHOR"], ["MAIN_PACKET_AUTHOR", "PACKET_AUTHOR"], ["HOLDOUT_PACKET_AUTHOR", "PACKET_AUTHOR"],
    ["ITEM_AUTHOR_POOL", "ITEM_AUTHOR"], ["GOLD_AUTHOR_POOL", "GOLD_AUTHOR"],
    ["CERTIFICATION_REVIEWER_1", "CERTIFICATION_REVIEWER"], ["CERTIFICATION_REVIEWER_2", "CERTIFICATION_REVIEWER"],
    ["TRUSTED_GOLD_AUDITOR", "TRUSTED_GOLD_AUDITOR"], ["CALIBRATION_ADJUDICATOR", "CALIBRATION_ADJUDICATOR"],
    ["S1_REVIEWER_1", "S1_REVIEWER"], ["S1_REVIEWER_2", "S1_REVIEWER"], ["S1_ADJUDICATOR", "S1_ADJUDICATOR"],
    ["S1_RESULT_CUSTODIAN", "S1_RESULT_CUSTODIAN"], ["S1_RESULT_VIEWER_REGISTRY", "S1_RESULT_VIEWER"],
    ["ACTIVATION_CANDIDATE_AUTHOR", "ACTIVATION_CANDIDATE_AUTHOR"], ["INDEPENDENT_ACTIVATION_AUDITOR", "INDEPENDENT_ACTIVATION_AUDITOR"],
    ["ACTIVATION_GRANT_AUTHOR", "ACTIVATION_GRANT_AUTHOR"]
  ];
  ensure(same(role.slots.map((slot) => [slot.slotId, slot.role]), expectedRoleSlots), "REGISTRY_ROLE_SLOTS");
  for (const slot of role.slots) {
    ensure(slot.actorPseudonym === null && slot.assignmentEventSha256 === null, "REGISTRY_ROLE_UNASSIGNED", slot.slotId);
  }
  for (const key of ["actorRoleAssignments", "artifactAuthorshipRecords", "roleExclusionProofs", "artifactAuthorshipExclusionProofs"]) {
    ensure(Array.isArray(role[key]) && role[key].length === 0, "REGISTRY_ROLE_ARRAY_EMPTY", key);
  }

  const slots = r.slotRegistry;
  ensure(slots.epoch === 1 && slots.epochAdvanceAuthorized === false, "REGISTRY_SLOT_EPOCH");
  ensure(slots.totalFutureSlots === 60 && slots.materializedSlots === 0 && slots.eligibleSlots === 0 && slots.issuedSlots === 0, "REGISTRY_SLOT_COUNTS");
  ensure(same(slots.expandedSlotIds, expectedExpandedSlots()) && unique(slots.expandedSlotIds), "REGISTRY_SLOT_IDS");
  ensure(slots.slotMaterializationEvents.length === 0, "REGISTRY_SLOT_EMPTY");
  ensure(same(slots.generators.map((generator) => [generator.phase, generator.total]), [["TAXONOMY_PILOT", 12], ["MAIN_CERTIFICATION", 24], ["ACTIVATION_HOLDOUT", 24]]), "REGISTRY_GENERATORS");
  for (const generator of slots.generators) {
    ensure(generator.blocks.reduce((sum, block) => sum + block.count, 0) === generator.total, "REGISTRY_GENERATOR_COUNT", generator.phase);
    const grammar = generator.blocks.find((block) => block.block === "GRAMMAR");
    const blank = generator.blocks.find((block) => block.block === "BLANK");
    ensure(grammar.typeId === "GRAMMAR_ERROR" && grammar.familyId === null, "REGISTRY_FOCUS_GENERATOR", generator.phase);
    ensure(blank.typeId === "BLANK_INFERENCE" && blank.familyId === null, "REGISTRY_FOCUS_GENERATOR", generator.phase);
    const nonfocus = generator.blocks.find((block) => block.block === "NONFOCUS");
    ensure(nonfocus.targets.length === nonfocus.count, "REGISTRY_NONFOCUS_TARGETS", generator.phase);
    for (const target of nonfocus.targets) {
      const family = FAMILIES.find((entry) => entry.familyId === target.familyId);
      ensure(Boolean(family), "REGISTRY_NONFOCUS_FAMILY", target.familyId);
      if (generator.phase === "MAIN_CERTIFICATION") ensure(target.typeId === selectedAt(family.rotationOrder, 1, "MAIN"), "REGISTRY_MAIN_ROTATION", target.familyId);
      if (generator.phase === "ACTIVATION_HOLDOUT") ensure(target.typeId === selectedAt(family.rotationOrder, 1, "HOLDOUT"), "REGISTRY_HOLDOUT_ROTATION", target.familyId);
    }
  }

  const fingerprintArrays = ["reservedCompositeFingerprints", "pilotFingerprints", "mainFingerprints", "holdoutFingerprints", "failedTombstones", "rejectedTombstones", "previouslyIssuedFingerprints", "reservationEvents", "tombstoneEvents", "disjointnessProofEvents", "uniqueCompositeFingerprintIndex"];
  for (const key of fingerprintArrays) ensure(Array.isArray(r.fingerprintRegistry[key]) && r.fingerprintRegistry[key].length === 0, "REGISTRY_FINGERPRINT_EMPTY", key);
  ensure(r.fingerprintRegistry.hashAlgorithm === "SHA-256" && r.fingerprintRegistry.duplicateCount === 0 && r.fingerprintRegistry.ready === false, "REGISTRY_FINGERPRINT_ZERO");

  const coverage = r.coverageRegistry;
  ensure(coverage.contactEvents.length === 0 && coverage.passedCoverageEvents.length === 0 && objectKeysExact(coverage.passedCoverageEventSha256ByCanonicalType, []), "REGISTRY_COVERAGE_EMPTY");
  ensure(coverage.focusOnlyTemplate.scopeEnum === "FOCUS_ONLY" && same(coverage.focusOnlyTemplate.canonicalTypeIds, FOCUS_GATE_ORDER) && coverage.focusOnlyTemplate.coverageCount === 2, "REGISTRY_FOCUS_TEMPLATE");
  ensure(objectKeysExact(coverage.focusOnlyTemplate.passedCoverageEventSha256ByCanonicalType, FOCUS_GATE_ORDER), "REGISTRY_FOCUS_MAP");
  ensure(Object.values(coverage.focusOnlyTemplate.passedCoverageEventSha256ByCanonicalType).every((value) => value === null) && coverage.focusOnlyTemplate.complete === false, "REGISTRY_FOCUS_MAP");
  ensure(coverage.all25Template.scopeEnum === "ALL_25" && same(coverage.all25Template.canonicalTypeIds, TYPES) && coverage.all25Template.coverageCount === 25, "REGISTRY_ALL25_TEMPLATE");
  ensure(objectKeysExact(coverage.all25Template.passedCoverageEventSha256ByCanonicalType, TYPES), "REGISTRY_ALL25_MAP");
  ensure(Object.values(coverage.all25Template.passedCoverageEventSha256ByCanonicalType).every((value) => value === null) && coverage.all25Template.complete === false, "REGISTRY_ALL25_MAP");
  ensure(coverage.contactIsCertification === false && coverage.epoch1ContactCount === 0 && coverage.certifiedTypeCount === 0 && coverage.ready === false, "REGISTRY_COVERAGE_ZERO");

  ensure(r.policyRegistry.policyMatrixSha256 === null && objectKeysExact(r.policyRegistry.allowlistSha256ByPhaseState, []) && objectKeysExact(r.policyRegistry.denySetSha256ByPhaseState, []), "REGISTRY_POLICY_EMPTY");
  ensure(r.policyRegistry.resourceClassPolicyProofs.length === 0 && r.policyRegistry.stateTransitionEvidence.length === 0 && r.policyRegistry.ready === false, "REGISTRY_POLICY_EMPTY");
  for (const [registryName, keys] of [
    ["capabilityRegistry", ["issuedCapabilityHashes", "consumedCapabilityHashes", "revokedCapabilityHashes", "uniqueCapabilityIndex", "authorizationEvents", "openEvents", "consumeEvents", "closeEvents", "denialEvents", "completedTransactions"]],
    ["certificateRegistry", ["reviewerCertificates", "freshAdjudicatorBindings", "certificateScopeRoots", "distinctReviewerProofs"]],
    ["phaseEvidenceRegistry", ["packetSeals", "responseSeals", "revealSeals", "decisionSeals", "trustedGoldAuditReports", "rightsPiiEvidence", "hiddenCommitmentRoots", "phaseTransitions"]]
  ]) {
    for (const key of keys) ensure(Array.isArray(r[registryName][key]) && r[registryName][key].length === 0, "REGISTRY_OPERATIONAL_ARRAY_EMPTY", `${registryName}.${key}`);
  }
  ensure(r.capabilityRegistry.duplicateIssueCount === 0 && r.capabilityRegistry.duplicateConsumeCount === 0 && r.capabilityRegistry.ready === false, "REGISTRY_CAPABILITY_ZERO");
  ensure(r.certificateRegistry.ready === false, "REGISTRY_CERTIFICATE_ZERO");
  for (const key of ["activationCandidateEvents", "activationCandidateAuditReports", "activationCandidateAuditManifests", "activationGrantEvents", "resultAccessEvents"]) ensure(r.activationRegistry[key].length === 0, "REGISTRY_ACTIVATION_EMPTY", key);
  for (const key of ["currentCandidateSha256", "currentAuditReportSha256", "currentAuditManifestSha256", "currentGrantSha256"]) ensure(r.activationRegistry[key] === null, "REGISTRY_ACTIVATION_NULL", key);
  ensure(r.activationRegistry.authorityGranted === false && r.activationRegistry.resultAccessAuthorized === false && r.activationRegistry.ready === false, "REGISTRY_ACTIVATION_FALSE");

  ensure(r.operationalState.currentState === STATES[0], "REGISTRY_OPERATIONAL_STATE");
  for (const [key, value] of Object.entries(r.operationalState)) {
    if (key === "currentState") continue;
    ensure(value === 0 || value === false, "REGISTRY_OPERATIONAL_ZERO", key);
  }
}

function objectPart(definition) {
  if (definition.type === "object" && definition.properties) return definition;
  if (!Array.isArray(definition.allOf)) return null;
  return [...definition.allOf].reverse().find((entry) => entry.type === "object" && entry.properties) ?? null;
}

function requiredIncludes(definition, fields, code) {
  const part = objectPart(definition);
  ensure(part && Array.isArray(part.required), code, "missing object required list");
  for (const field of fields) ensure(part.required.includes(field), code, field);
  return part;
}

function validateSchemas(s) {
  ensure(s.$schema === "https://json-schema.org/draft/2020-12/schema" && s.$id === "reviewer-calibration-v4-production-bound-v3-events", "SCHEMA_IDENTITY");
  ensure(s.description === "Schemas only; this design contains zero event instances.", "SCHEMA_DESCRIPTION");
  ensure(s.oneOf.length === EVENT_DEFS.length, "SCHEMA_EVENT_REF_COUNT");
  ensure(same(s.oneOf.map((entry) => entry.$ref), EVENT_DEFS.map((name) => `#/$defs/${name}`)), "SCHEMA_EVENT_REFS");
  ensure(Array.isArray(s["x-semanticConstraints"]) && s["x-semanticConstraints"].length >= 19, "SCHEMA_SEMANTIC_CONSTRAINTS");
  const defs = s.$defs;
  ensure(same(defs.state.enum, STATES), "SCHEMA_STATE_ENUM");
  ensure(same(defs.role.enum, ROLES), "SCHEMA_ROLE_ENUM");
  ensure(same(defs.typeId.enum, TYPES), "SCHEMA_TYPE_ENUM");
  ensure(same(defs.familyId.enum, FAMILY_IDS), "SCHEMA_FAMILY_ENUM");
  ensure(same(defs.resourceClass.enum, RESOURCE_CLASSES), "SCHEMA_RESOURCE_ENUM");
  ensure(defs.sha256.pattern === "^[0-9a-f]{64}$", "SCHEMA_HASH_PATTERN");
  requiredIncludes(defs.baseEvent, ["schemaVersion", "eventKind", "eventId", "eventOrdinal", "priorEventSha256", "occurredAtRfc3339", "artifactId", "eventSha256"], "SCHEMA_BASE_REQUIRED");

  const roleAssignment = requiredIncludes(defs.roleAssignment, ["roleSlotId", "actorPseudonym", "role", "roleRegistryBeforeSha256", "roleRegistryAfterSha256", "roleExclusionProofSha256", "artifactAuthorshipExclusionProofSha256", "decision"], "SCHEMA_ROLE_ASSIGNMENT");
  ensure(roleAssignment.properties.eventKind.const === "ROLE_ASSIGNMENT", "SCHEMA_ROLE_ASSIGNMENT");
  const authorship = requiredIncludes(defs.artifactAuthorshipRecord, ["artifactSha256", "artifactClass", "authorPseudonym", "authorRole", "authorshipRegistryBeforeSha256", "authorshipRegistryAfterSha256"], "SCHEMA_AUTHORSHIP_RECORD");
  ensure(authorship.properties.artifactClass.enum.length === 8, "SCHEMA_AUTHORSHIP_CLASSES");
  const authorshipMappings = defs.artifactAuthorshipRecord.allOf.filter((entry) => entry.if && entry.then);
  ensure(authorshipMappings.length === 8, "SCHEMA_AUTHORSHIP_ROLE_MAPPING");
  const expectedClassRole = {
    PACKET: "PACKET_AUTHOR", ITEM: "ITEM_AUTHOR", GOLD: "GOLD_AUTHOR", REVIEWER_CERTIFICATE: "CERTIFICATION_REVIEWER",
    TRUSTED_GOLD_AUDIT: "TRUSTED_GOLD_AUDITOR", ACTIVATION_CANDIDATE: "ACTIVATION_CANDIDATE_AUTHOR",
    ACTIVATION_AUDIT_REPORT: "INDEPENDENT_ACTIVATION_AUDITOR", ACTIVATION_GRANT: "ACTIVATION_GRANT_AUTHOR"
  };
  for (const mapping of authorshipMappings) {
    const artifactClass = mapping.if.properties.artifactClass.const;
    ensure(mapping.then.properties.authorRole.const === expectedClassRole[artifactClass], "SCHEMA_AUTHORSHIP_ROLE_MAPPING", artifactClass);
  }

  const slot = requiredIncludes(defs.slotMaterialization, ["slotId", "phase", "block", "slotOrdinal", "canonicalTypeId", "canonicalFamilyId", "rotationEpoch", ...SLOT_SCHEMA_FIELDS, "fingerprintReservationEventSha256", "bindingV4ManifestSha256", "decision"], "SCHEMA_SLOT_REQUIRED");
  ensure(slot.properties.bindingV4ManifestSha256.const === UPSTREAMS[5][2], "SCHEMA_SLOT_BINDING_PIN");
  ensure(defs.slotMaterialization.allOf.filter((entry) => entry.if && entry.then).length === 3, "SCHEMA_SLOT_FOCUS_CONDITIONS");
  ensure(same(defs.fingerprintBundle.required, FINGERPRINT_SCHEMA_FIELDS), "SCHEMA_FINGERPRINT_FIELDS");
  requiredIncludes(defs.fingerprintReservation, ["fingerprintBundle", "failedRejectedPriorIssuedTombstoneRootSha256", "collisionCheckProofSha256"], "SCHEMA_FINGERPRINT_RESERVATION");
  requiredIncludes(defs.fingerprintTombstone, ["terminalDisposition", "neverReissue"], "SCHEMA_FINGERPRINT_TOMBSTONE");
  const disjoint = requiredIncludes(defs.disjointnessProof, ["pilotCount", "mainCount", "holdoutCount", "pairwiseComparisonCount", "allPairwiseComparisonsRootSha256", "failedRejectedTombstoneRootSha256", "priorIssuedFingerprintRootSha256", "noCollisionVerdict"], "SCHEMA_DISJOINTNESS");
  ensure(disjoint.properties.pilotCount.const === 12 && disjoint.properties.mainCount.const === 24 && disjoint.properties.holdoutCount.const === 24 && disjoint.properties.pairwiseComparisonCount.const === 1770, "SCHEMA_DISJOINTNESS_COUNTS");
  requiredIncludes(defs.passedCoverageEvent, ["canonicalTypeId", "phase", "decisionSealSha256", "uniqueAnswerCheckPassed", "fatalChecksPassed", "coverageVerdict"], "SCHEMA_PASSED_COVERAGE");

  ensure(same(defs.focusCoverageEvidence.properties.canonicalTypeIds.prefixItems.map((entry) => entry.const), FOCUS_GATE_ORDER), "SCHEMA_FOCUS_TYPES");
  ensure(defs.focusCoverageEvidence.properties.coverageCount.const === 2, "SCHEMA_FOCUS_COUNT");
  ensure(same(defs.focusCoverageEvidence.properties.passedCoverageEventSha256ByCanonicalType.required, FOCUS_GATE_ORDER), "SCHEMA_FOCUS_MAP");
  ensure(same(defs.all25CoverageEvidence.properties.canonicalTypeIds.prefixItems.map((entry) => entry.const), TYPES), "SCHEMA_ALL25_TYPES");
  ensure(defs.all25CoverageEvidence.properties.coverageCount.const === 25, "SCHEMA_ALL25_COUNT");
  ensure(same(defs.all25CoverageMap.required, TYPES) && objectKeysExact(defs.all25CoverageMap.properties, TYPES), "SCHEMA_ALL25_MAP");
  requiredIncludes(defs.reviewerCertificate, ["reviewerPseudonym", "coverageEvidence", "pilotDecisionSha256", "mainDecisionSha256", "trustedGoldAuditReportSha256", "holdoutDecisionSha256", "certificateVerdict"], "SCHEMA_REVIEWER_CERTIFICATE");
  const adjudicator = requiredIncludes(defs.freshAdjudicatorBinding, ["adjudicatorPseudonym", "adjudicatorRole", "freshnessProofSha256", "roleExclusionProofSha256", "resultViewerExclusionProofSha256"], "SCHEMA_ADJUDICATOR");
  ensure(adjudicator.properties.adjudicatorRole.const === "S1_ADJUDICATOR", "SCHEMA_ADJUDICATOR_ROLE");
  const goldAudit = requiredIncludes(defs.trustedGoldAuditReport, ["auditorPseudonym", "auditorRole", "goldAuthorRegistrySha256", "itemAuthorRegistrySha256", "packetAuthorRegistrySha256", "roleExclusionProofSha256", "artifactAuthorshipExclusionProofSha256", "verdict"], "SCHEMA_GOLD_AUDIT");
  ensure(goldAudit.properties.auditorRole.const === "TRUSTED_GOLD_AUDITOR", "SCHEMA_GOLD_AUDITOR_ROLE");

  const authorization = requiredIncludes(defs.authorization, ["transactionId", "currentState", "phase", "resourceClass", "resourceSha256", "visibleSurfaceSha256", "actorPseudonym", "actorRole", "capabilityTokenSha256", "capabilityUniquenessProofSha256", "policyMatrixSha256", "allowlistSha256", "denySetSha256", "resourceClassPolicyProofSha256", "stateTransitionEvidenceSha256", "authorizedAtRfc3339", "decision"], "SCHEMA_AUTHORIZATION");
  ensure(authorization.properties.decision.const === "ALLOW", "SCHEMA_AUTHORIZATION");
  const authConditional = defs.authorization.allOf.find((entry) => entry.if && entry.then);
  ensure(Boolean(authConditional), "SCHEMA_PHASE1_CONDITIONAL");
  ensure(same(authConditional.then.properties.resourceClass.enum, ["BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK"]), "SCHEMA_PHASE1_CONDITIONAL");
  requiredIncludes(defs.openEvent, ["transactionId", "authorizationEventSha256", "authorizationEventOrdinal", "capabilityTokenSha256", "openedAtRfc3339", "contentBytesReleasedBeforeOpenSeal", "decision"], "SCHEMA_OPEN");
  const consume = requiredIncludes(defs.capabilityConsume, ["transactionId", "authorizationEventSha256", "openEventSha256", "openEventOrdinal", "capabilityTokenSha256", "capabilityRegistryBeforeSha256", "capabilityUniquenessProofSha256", "useOrdinal", "consumedAtRfc3339", "contentBytesReleasedBeforeConsumeSeal", "capabilityRegistryAfterSha256", "decision"], "SCHEMA_CONSUME");
  ensure(consume.properties.useOrdinal.const === 1 && consume.properties.contentBytesReleasedBeforeConsumeSeal.const === 0, "SCHEMA_CONSUME_SINGLE_USE");
  requiredIncludes(defs.closeEvent, ["transactionId", "authorizationEventSha256", "openEventSha256", "consumeEventSha256", "consumeEventOrdinal", "capabilityTokenSha256", "authorizedAtRfc3339", "openedAtRfc3339", "consumedAtRfc3339", "closedAtRfc3339", "bytesRead", "contentReadSha256", "decision"], "SCHEMA_CLOSE");
  const denial = requiredIncludes(defs.denial, ["currentState", "phase", "resourceClass", "resourceSha256", "actorPseudonym", "actorRole", "policyMatrixSha256", "allowlistSha256", "denySetSha256", "policyDecisionProofSha256", "capabilityTokenSha256", "authorizationEventSha256", "openedAtRfc3339", "closedAtRfc3339", "hasOpenConsumeOrClose", "decision", "reasonCode"], "SCHEMA_DENIAL");
  ensure(denial.properties.hasOpenConsumeOrClose.const === false && denial.properties.decision.const === "DENY", "SCHEMA_DENIAL_FAIL_CLOSED");

  const candidate = requiredIncludes(defs.activationCandidate, ["stateBefore", "stateAfter", "candidateAuthorPseudonym", "candidateAuthorRole", "reviewerCertificateSha256s", "reviewerPseudonyms", "reviewerCertificateScopeEnums", "requestedCoverageEvidence", "freshAdjudicatorBindingSha256", "zeroPreauthorityResultAccessProofSha256", "candidateCanonicalBytesSha256", "authorityGranted", "resultAccessAuthorized", "decision"], "SCHEMA_CANDIDATE");
  ensure(candidate.properties.candidateAuthorRole.const === "ACTIVATION_CANDIDATE_AUTHOR", "SCHEMA_CANDIDATE_ROLE");
  ensure(candidate.properties.authorityGranted.const === false && candidate.properties.resultAccessAuthorized.const === false, "SCHEMA_CANDIDATE_FALSE");
  ensure(!Object.keys(candidate.properties).some((key) => /candidateAudit|auditManifest|activationAudit/i.test(key)), "SCHEMA_CANDIDATE_FUTURE_AUDIT");
  const audit = requiredIncludes(defs.activationCandidateAuditReport, ["stateBefore", "stateAfter", "auditorPseudonym", "auditorRole", "candidateEventSha256", "candidateCanonicalBytesSha256", "candidateAuthorPseudonym", "roleRegistrySha256", "artifactAuthorshipRegistrySha256", "auditorRoleExclusionProofSha256", "auditorArtifactAuthorshipExclusionProofSha256", "auditReportCanonicalBytesSha256", "verdict", "authorityGranted", "resultAccessAuthorized"], "SCHEMA_CANDIDATE_AUDIT");
  ensure(audit.properties.auditorRole.const === "INDEPENDENT_ACTIVATION_AUDITOR", "SCHEMA_CANDIDATE_AUDITOR_ROLE");
  ensure(audit.properties.authorityGranted.const === false && audit.properties.resultAccessAuthorized.const === false, "SCHEMA_CANDIDATE_AUDIT_FALSE");
  ensure(!Object.keys(audit.properties).some((key) => /auditManifest/i.test(key)), "SCHEMA_AUDIT_FUTURE_MANIFEST");
  const grant = requiredIncludes(defs.activationGrant, ["stateBefore", "stateAfter", "grantAuthorPseudonym", "grantAuthorRole", "candidateEventSha256", "candidateCanonicalBytesSha256", "candidateAuditReportSha256", "candidateAuditManifestSha256", "candidateAuditVerdict", "grantedCoverageEvidence", "deterministicGrantProofSha256", "authorityGranted", "resultAccessAuthorized", "decision"], "SCHEMA_GRANT");
  ensure(grant.properties.grantAuthorRole.const === "ACTIVATION_GRANT_AUTHOR", "SCHEMA_GRANT_ROLE");
  ensure(grant.properties.candidateAuditVerdict.const === "PASS_NO_BLOCKERS" && grant.properties.authorityGranted.const === true && grant.properties.resultAccessAuthorized.const === true, "SCHEMA_GRANT_BINDING");

  ensure(objectKeysExact(s["x-currentInstanceCounts"], EVENT_DEFS), "SCHEMA_INSTANCE_COUNT_KEYS");
  ensure(allZero(s["x-currentInstanceCounts"]), "SCHEMA_INSTANCE_COUNTS_ZERO");
}

function validateHostileSpec(h) {
  ensure(h.schemaVersion === "reviewer-calibration-v4-production-bound-hostile-fixtures-3" && h.artifactId === "reviewer-calibration-v4-production-bound-v3", "HOSTILE_IDENTITY");
  ensure(h.status === "SYNTHETIC_PUBLIC_MUTATION_SPEC_ONLY_NO_ITEMS_GOLD_ACTORS_OR_EVENTS", "HOSTILE_STATUS");
  ensure(h.minimums.structuralMutations >= 250 && h.minimums.semanticBypasses >= 50 && h.minimums.allMustBeDetectedOrRejected === true, "HOSTILE_MINIMUMS");
  ensure(same(h.requiredBlockerFamilies.map(({ code }) => code), Object.keys(BLOCKER_CLOSURES)), "HOSTILE_BLOCKER_FAMILIES");
  ensure(h.requiredBlockerFamilies.every((family) => Array.isArray(family.attacks) && family.attacks.length >= 6), "HOSTILE_ATTACKS");
  ensure(h.expectedDisposition === "AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY", "HOSTILE_DISPOSITION");
  ensure(allZero(h.activity), "HOSTILE_ACTIVITY_ZERO");
}

function validateBundle(bundle) {
  validateProtocol(bundle.protocol);
  validateRegistries(bundle.registries);
  validateSchemas(bundle.schemas);
  validateHostileSpec(bundle.hostile);
}

function parseManifest(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line, index) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    ensure(Boolean(match), "MANIFEST_ROW_FORMAT", `${path}:${index + 1}`);
    return { sha256: match[1], path: match[2] };
  });
}

function hasForbiddenComponent(path) {
  return path.replaceAll("\\", "/").split("/").some((part) => part.toLowerCase() === "private");
}

function verifyManifestRows(manifestPath, allowRefusal) {
  const rows = parseManifest(manifestPath);
  let rehashed = 0;
  let refused = 0;
  for (const row of rows) {
    if (hasForbiddenComponent(row.path)) {
      ensure(allowRefusal, "MANIFEST_FORBIDDEN_ROW", row.path);
      refused += 1;
      continue;
    }
    ensure(!isAbsolute(row.path) && !row.path.replaceAll("\\", "/").split("/").includes(".."), "MANIFEST_ROW_PATH", row.path);
    const normalizedRowPath = row.path.replaceAll("\\", "/");
    const target = normalizedRowPath.startsWith("experiments/")
      ? resolve(REPO_ROOT, normalizedRowPath)
      : resolve(dirname(manifestPath), normalizedRowPath);
    const rel = relative(REPO_ROOT, target);
    ensure(rel !== ".." && !rel.startsWith(`..${sep}`), "MANIFEST_ROW_ESCAPES_REPO", row.path);
    ensure(existsSync(target) && statSync(target).isFile(), "MANIFEST_ROW_MISSING", row.path);
    ensure(sha256File(target) === row.sha256, "MANIFEST_ROW_HASH", row.path);
    rehashed += 1;
  }
  return { rows: rows.length, rehashed, refused };
}

function verifyUpstreams(p) {
  for (const [, path, hash] of UPSTREAMS) {
    const target = repoPath(path);
    ensure(existsSync(target), "UPSTREAM_MISSING", path);
    ensure(sha256File(target) === hash, "UPSTREAM_HASH", path);
  }

  const manifestIndexes = [0, 1, 3, 4, 5, 6, 8];
  let directManifestRows = 0;
  for (const index of manifestIndexes) {
    const result = verifyManifestRows(repoPath(UPSTREAMS[index][1]), false);
    directManifestRows += result.rehashed;
  }
  ensure(directManifestRows === 38, "UPSTREAM_DIRECT_MANIFEST_ROWS", `${directManifestRows}`);

  const evaluationPublic = readJsonStrict(repoPath(UPSTREAMS[2][1]), "EVALUATION_PUBLIC_MANIFEST");
  ensure(evaluationPublic.status === "DESIGN_ONLY_EXECUTION_BLOCKED" && evaluationPublic.publicOnly === true, "EVALUATION_PUBLIC_STATUS");
  ensure(same(evaluationPublic.forbiddenPathComponents, ["private"]), "EVALUATION_PUBLIC_BOUNDARY");
  ensure(evaluationPublic.upstreams.length === 10, "EVALUATION_PUBLIC_UPSTREAM_COUNT");
  let nestedManifestRows = 0;
  let nestedSafeRows = 0;
  let forbiddenRowsRefused = 0;
  for (const upstream of evaluationPublic.upstreams) {
    const target = repoPath(upstream.path);
    ensure(sha256File(target) === upstream.sha256 && upstream.observedSha256 === upstream.sha256, "EVALUATION_NESTED_UPSTREAM", upstream.id);
    if (upstream.path.endsWith("MANIFEST.sha256")) {
      const result = verifyManifestRows(target, true);
      nestedManifestRows += result.rows;
      nestedSafeRows += result.rehashed;
      forbiddenRowsRefused += result.refused;
    }
  }
  ensure(nestedManifestRows === 24 && nestedSafeRows === 23 && forbiddenRowsRefused === 1, "EVALUATION_NESTED_MANIFEST_ROWS", `${nestedManifestRows}/${nestedSafeRows}/${forbiddenRowsRefused}`);
  ensure(evaluationPublic.authority.evaluatorAuthorityGranted === false && evaluationPublic.authority.scoringAuthorityGranted === false, "EVALUATION_PUBLIC_AUTHORITY");

  const predecessorAuditPath = repoPath("experiments/question-quality-20260715/reviews/reviewer-calibration-v4-production-bound-v2-independent-audit-v1/audit.json");
  ensure(sha256File(predecessorAuditPath) === p.upstreams[1].auditJsonSha256, "PREDECESSOR_AUDIT_JSON_HASH");
  const predecessorAudit = readJsonStrict(predecessorAuditPath, "PREDECESSOR_AUDIT");
  ensure(predecessorAudit.verdict === "FAIL_BLOCKERS" && predecessorAudit.subject.manifestSha256 === UPSTREAMS[0][2], "PREDECESSOR_AUDIT_VERDICT");
  ensure(same(predecessorAudit.blockers.map(({ code }) => code), BLOCKER_CODES), "PREDECESSOR_AUDIT_BLOCKERS");
  ensure(predecessorAudit.disposition.designAccepted === false && predecessorAudit.disposition.activationAuthorized === false && predecessorAudit.disposition.executionAuthorized === false, "PREDECESSOR_AUDIT_DISPOSITION");

  const evaluationAudit = readJsonStrict(repoPath("experiments/question-quality-20260715/reviews/evaluation-authority-v2-independent-audit-v1/audit.json"), "EVALUATION_AUDIT");
  ensure(evaluationAudit.verdict === "PASS_NO_BLOCKERS", "EVALUATION_AUDIT_VERDICT");
  const typeAudit = readJsonStrict(repoPath("experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/audit.json"), "TYPE_AUDIT");
  ensure(typeAudit.verdict === "PASS_NO_BLOCKERS", "TYPE_AUDIT_VERDICT");
  ensure(typeAudit.subject.snapshotSha256 === "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967", "TYPE_AUDIT_SNAPSHOT");
  const binding = readJsonStrict(repoPath("experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/binding.json"), "TYPE_BINDING");
  ensure(same(binding.canonicalUniverse.uiTypeIdsInOrder, TYPES) && same(binding.canonicalUniverse.focusTypeIds, FOCUS_BINDING_ORDER), "TYPE_BINDING_CANONICAL");
  ensure(same(binding.families, FAMILIES), "TYPE_BINDING_FAMILIES");
  ensure(binding.semanticDigests.canonicalBindingSha256 === "433d72598f123a19950b57e4684d0ba004031d3beb0860fc5d5d226ddcf8022b", "TYPE_BINDING_SEMANTIC_DIGEST");
  ensure(binding.issuance.executionEligibleByThisArtifactAlone === false, "TYPE_BINDING_NO_EXECUTION");
  const methodology = readJsonStrict(repoPath(UPSTREAMS[7][1]), "METHODOLOGY");
  ensure(methodology.status === "DESIGN_ONLY_UNISSUED", "METHODOLOGY_STATUS");

  return {
    directUpstreamBytesRehashed: UPSTREAMS.length,
    directManifestRowsRehashed: directManifestRows,
    evaluationNestedUpstreamBytesRehashed: evaluationPublic.upstreams.length,
    evaluationNestedManifestRows: nestedManifestRows,
    evaluationNestedSafeRowsRehashed: nestedSafeRows,
    forbiddenPrivateRowsRefusedUnopened: forbiddenRowsRefused,
    predecessorVerdict: predecessorAudit.verdict,
    predecessorBlockers: predecessorAudit.blockers.length,
    evaluationAuthorityAuditVerdict: evaluationAudit.verdict,
    productionTypeBindingAuditVerdict: typeAudit.verdict
  };
}

function makeHash(seed) {
  return sha256Bytes(String(seed));
}

function makeCoverage(scope = "ALL_25") {
  const types = scope === "FOCUS_ONLY" ? FOCUS_GATE_ORDER : TYPES;
  const map = {};
  const events = {};
  types.forEach((typeId, index) => {
    const hash = makeHash(`coverage-${scope}-${index}-${typeId}`);
    map[typeId] = hash;
    events[hash] = {
      eventKind: "PASSED_COVERAGE_EVENT",
      canonicalTypeId: typeId,
      phase: index % 2 === 0 ? "MAIN_CERTIFICATION" : "ACTIVATION_HOLDOUT",
      uniqueAnswerCheckPassed: true,
      fatalChecksPassed: true,
      coverageVerdict: "PASS"
    };
  });
  return { evidence: { scopeEnum: scope, canonicalTypeIds: [...types], coverageCount: types.length, passedCoverageEventSha256ByCanonicalType: map, coverageMapRootSha256: makeHash(`map-${scope}`) }, events };
}

function validateCoverageRuntime(evidence, events, reviewerCertificates = []) {
  const expectedTypes = evidence.scopeEnum === "FOCUS_ONLY" ? FOCUS_GATE_ORDER : evidence.scopeEnum === "ALL_25" ? TYPES : null;
  ensure(Boolean(expectedTypes), "SEM_COVERAGE_SCOPE");
  ensure(same(evidence.canonicalTypeIds, expectedTypes), "SEM_COVERAGE_TYPES");
  ensure(evidence.coverageCount === expectedTypes.length, "SEM_COVERAGE_COUNT");
  ensure(objectKeysExact(evidence.passedCoverageEventSha256ByCanonicalType, expectedTypes), "SEM_COVERAGE_MAP_KEYS");
  const hashes = Object.values(evidence.passedCoverageEventSha256ByCanonicalType);
  ensure(hashes.every((hash) => HEX_HASH.test(hash)) && unique(hashes), "SEM_COVERAGE_HASHES");
  for (const typeId of expectedTypes) {
    const event = events[evidence.passedCoverageEventSha256ByCanonicalType[typeId]];
    ensure(Boolean(event), "SEM_COVERAGE_EVENT_RESOLUTION", typeId);
    ensure(event.eventKind === "PASSED_COVERAGE_EVENT" && event.canonicalTypeId === typeId, "SEM_COVERAGE_EVENT_TYPE", typeId);
    ensure(["MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"].includes(event.phase), "SEM_COVERAGE_EVENT_PHASE", typeId);
    ensure(event.uniqueAnswerCheckPassed === true && event.fatalChecksPassed === true && event.coverageVerdict === "PASS", "SEM_COVERAGE_EVENT_PASS", typeId);
  }
  for (const certificate of reviewerCertificates) {
    const allowed = certificate.scopeEnum === "ALL_25" ? TYPES : certificate.scopeEnum === "FOCUS_ONLY" ? FOCUS_GATE_ORDER : [];
    ensure(expectedTypes.every((typeId) => allowed.includes(typeId)), "SEM_COVERAGE_SCOPE_ESCALATION");
    ensure(expectedTypes.every((typeId) => certificate.map[typeId] === evidence.passedCoverageEventSha256ByCanonicalType[typeId]), "SEM_COVERAGE_CERTIFICATE_MAP");
  }
  return true;
}

function validateRoleRuntime(assignments, artifactAuthors) {
  const actorFor = (role) => assignments[role];
  const trusted = actorFor("TRUSTED_GOLD_AUDITOR");
  const activationAuditor = actorFor("INDEPENDENT_ACTIVATION_AUDITOR");
  const adjudicator = actorFor("S1_ADJUDICATOR");
  ensure(typeof trusted === "string" && typeof activationAuditor === "string" && typeof adjudicator === "string", "SEM_ROLE_REQUIRED_ACTORS");
  for (const role of TRUSTED_INCOMPATIBLE) if (assignments[role] !== undefined) ensure(actorFor(role) !== trusted, "SEM_ROLE_TRUSTED_COLLISION", role);
  for (const role of ACTIVATION_INCOMPATIBLE) if (assignments[role] !== undefined) ensure(actorFor(role) !== activationAuditor, "SEM_ROLE_ACTIVATION_COLLISION", role);
  for (const role of FRESH_ADJUDICATOR_INCOMPATIBLE) if (assignments[role] !== undefined) ensure(actorFor(role) !== adjudicator, "SEM_ROLE_ADJUDICATOR_COLLISION", role);
  for (const artifactClass of ["PACKET", "ITEM", "GOLD"]) ensure(artifactAuthors[artifactClass] !== trusted, "SEM_ROLE_TRUSTED_AUTHORSHIP", artifactClass);
  for (const artifactClass of ["PACKET", "ITEM", "GOLD", "REVIEWER_CERTIFICATE", "TRUSTED_GOLD_AUDIT", "ACTIVATION_CANDIDATE", "ACTIVATION_GRANT"]) ensure(artifactAuthors[artifactClass] !== activationAuditor, "SEM_ROLE_ACTIVATION_AUTHORSHIP", artifactClass);
  return true;
}

function makeSlotRuntimeFixture() {
  return {
    phase: "MAIN_CERTIFICATION",
    block: "NONFOCUS",
    canonicalTypeId: "TOPIC",
    canonicalFamilyId: "NF-F1-GLOBAL_MEANING_SELECTION",
    rotationEpoch: 1,
    eventOrdinal: 20,
    fingerprintReservationEventOrdinal: 19,
    fingerprintReservationEventSha256: makeHash("slot-reservation"),
    bindingV4ManifestSha256: UPSTREAMS[5][2],
    commitments: Object.fromEntries(SLOT_COMMITMENTS.map((field) => [field, makeHash(`slot-${field}`)]))
  };
}

function validateSlotRuntime(slot) {
  ensure(["TAXONOMY_PILOT", "MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"].includes(slot.phase), "SEM_SLOT_PHASE");
  ensure(["GRAMMAR", "BLANK", "NONFOCUS"].includes(slot.block), "SEM_SLOT_BLOCK");
  ensure(TYPES.includes(slot.canonicalTypeId), "SEM_SLOT_TYPE");
  ensure(Number.isInteger(slot.rotationEpoch) && slot.rotationEpoch >= 1, "SEM_SLOT_EPOCH");
  ensure(objectKeysExact(slot.commitments, SLOT_COMMITMENTS), "SEM_SLOT_COMMITMENTS");
  ensure(Object.values(slot.commitments).every((hash) => HEX_HASH.test(hash)), "SEM_SLOT_COMMITMENT_HASH");
  ensure(slot.bindingV4ManifestSha256 === UPSTREAMS[5][2], "SEM_SLOT_BINDING_PIN");
  ensure(HEX_HASH.test(slot.fingerprintReservationEventSha256) && slot.fingerprintReservationEventOrdinal < slot.eventOrdinal, "SEM_SLOT_RESERVATION_PRECEDES");
  if (slot.block === "GRAMMAR") {
    ensure(slot.canonicalTypeId === "GRAMMAR_ERROR" && slot.canonicalFamilyId === null, "SEM_SLOT_GRAMMAR_BINDING");
  } else if (slot.block === "BLANK") {
    ensure(slot.canonicalTypeId === "BLANK_INFERENCE" && slot.canonicalFamilyId === null, "SEM_SLOT_BLANK_BINDING");
  } else {
    const family = FAMILIES.find((entry) => entry.familyId === slot.canonicalFamilyId);
    ensure(Boolean(family), "SEM_SLOT_FAMILY");
    ensure(family.rotationOrder.includes(slot.canonicalTypeId), "SEM_SLOT_TYPE_FAMILY");
    if (slot.phase === "MAIN_CERTIFICATION") ensure(slot.canonicalTypeId === selectedAt(family.rotationOrder, slot.rotationEpoch, "MAIN"), "SEM_SLOT_MAIN_ROTATION");
    if (slot.phase === "ACTIVATION_HOLDOUT") ensure(slot.canonicalTypeId === selectedAt(family.rotationOrder, slot.rotationEpoch, "HOLDOUT"), "SEM_SLOT_HOLDOUT_ROTATION");
  }
  return true;
}

function makeFingerprintRuntimeFixture() {
  const entries = [];
  for (const [phase, count] of [["TAXONOMY_PILOT", 12], ["MAIN_CERTIFICATION", 24], ["ACTIVATION_HOLDOUT", 24]]) {
    for (let index = 0; index < count; index += 1) {
      entries.push({
        phase,
        bundle: Object.fromEntries(FINGERPRINT_COMPONENTS.map((component) => [component, makeHash(`${phase}-${index}-${component}`)]))
      });
    }
  }
  return {
    entries,
    failedTombstones: new Set(),
    rejectedTombstones: new Set(),
    previouslyIssued: new Set(),
    proof: {
      pilotCount: 12,
      mainCount: 24,
      holdoutCount: 24,
      pairwiseComparisonCount: 1770,
      all60CompositeFingerprintRootSha256: makeHash("all60-root"),
      componentRootsByPhaseSha256: makeHash("component-roots"),
      allPairwiseComparisonsRootSha256: makeHash("pairwise-root"),
      failedRejectedTombstoneRootSha256: makeHash("tombstone-root"),
      priorIssuedFingerprintRootSha256: makeHash("prior-root"),
      noCollisionVerdict: true
    }
  };
}

function validateFingerprintRuntime(fixture) {
  const expectedCounts = { TAXONOMY_PILOT: 12, MAIN_CERTIFICATION: 24, ACTIVATION_HOLDOUT: 24 };
  for (const [phase, count] of Object.entries(expectedCounts)) ensure(fixture.entries.filter((entry) => entry.phase === phase).length === count, "SEM_FP_PHASE_COUNT", phase);
  ensure(fixture.entries.length === 60, "SEM_FP_TOTAL_COUNT");
  const composites = [];
  for (const entry of fixture.entries) {
    ensure(objectKeysExact(entry.bundle, FINGERPRINT_COMPONENTS), "SEM_FP_COMPONENT_KEYS");
    ensure(Object.values(entry.bundle).every((hash) => HEX_HASH.test(hash)), "SEM_FP_COMPONENT_HASH");
    composites.push(entry.bundle.COMPOSITE_FINGERPRINT_SHA256);
  }
  ensure(unique(composites), "SEM_FP_DUPLICATE");
  for (const composite of composites) {
    ensure(!fixture.failedTombstones.has(composite), "SEM_FP_FAILED_REPLAY");
    ensure(!fixture.rejectedTombstones.has(composite), "SEM_FP_REJECTED_REPLAY");
    ensure(!fixture.previouslyIssued.has(composite), "SEM_FP_PRIOR_REPLAY");
  }
  ensure(fixture.proof.pilotCount === 12 && fixture.proof.mainCount === 24 && fixture.proof.holdoutCount === 24, "SEM_FP_PROOF_COUNTS");
  ensure(fixture.proof.pairwiseComparisonCount === (60 * 59) / 2, "SEM_FP_PAIR_COUNT");
  for (const field of ["all60CompositeFingerprintRootSha256", "componentRootsByPhaseSha256", "allPairwiseComparisonsRootSha256", "failedRejectedTombstoneRootSha256", "priorIssuedFingerprintRootSha256"]) ensure(HEX_HASH.test(fixture.proof[field]), "SEM_FP_PROOF_HASH", field);
  ensure(fixture.proof.noCollisionVerdict === true, "SEM_FP_COLLISION_VERDICT");
  return true;
}

function makeAuthorizationRequest(registries, phase, currentState, resourceClass) {
  const key = `${phase}|${currentState}`;
  const resourceProof = registries.policyRegistry.resourceClassPolicyProofs.find((proof) => proof.key === key && proof.resourceClass === resourceClass);
  const stateProof = registries.policyRegistry.stateTransitionEvidence.find((proof) => proof.state === currentState);
  return {
    phase,
    currentState,
    resourceClass,
    resourceSha256: makeHash(`resource-${key}-${resourceClass}`),
    actorPseudonym: "synthetic-reviewer-0001",
    actorRole: "CERTIFICATION_REVIEWER",
    capabilityTokenSha256: makeHash(`capability-${key}-${resourceClass}`),
    policyMatrixSha256: registries.policyRegistry.policyMatrixSha256,
    allowlistSha256: registries.policyRegistry.allowlistSha256ByPhaseState[key],
    denySetSha256: registries.policyRegistry.denySetSha256ByPhaseState[key],
    resourceClassPolicyProofSha256: resourceProof?.sha256,
    stateTransitionEvidenceSha256: stateProof?.sha256
  };
}

function validateAuthorizationRuntime(protocol, registries, request) {
  const policy = registries.policyRegistry;
  ensure(policy.ready === true, "SEM_AUTH_POLICY_NOT_READY");
  ensure(HEX_HASH.test(policy.policyMatrixSha256), "SEM_AUTH_POLICY_DIGEST");
  const key = `${request.phase}|${request.currentState}`;
  ensure(HEX_HASH.test(policy.allowlistSha256ByPhaseState[key]), "SEM_AUTH_ALLOWLIST_DIGEST");
  ensure(HEX_HASH.test(policy.denySetSha256ByPhaseState[key]), "SEM_AUTH_DENY_DIGEST");
  const resourceProof = policy.resourceClassPolicyProofs.find((proof) => proof.key === key && proof.resourceClass === request.resourceClass);
  const stateProof = policy.stateTransitionEvidence.find((proof) => proof.state === request.currentState);
  ensure(resourceProof && HEX_HASH.test(resourceProof.sha256), "SEM_AUTH_RESOURCE_PROOF");
  ensure(stateProof && HEX_HASH.test(stateProof.sha256), "SEM_AUTH_STATE_PROOF");
  ensure(request.policyMatrixSha256 === policy.policyMatrixSha256, "SEM_AUTH_POLICY_BINDING");
  ensure(request.allowlistSha256 === policy.allowlistSha256ByPhaseState[key], "SEM_AUTH_ALLOWLIST_BINDING");
  ensure(request.denySetSha256 === policy.denySetSha256ByPhaseState[key], "SEM_AUTH_DENY_BINDING");
  ensure(request.resourceClassPolicyProofSha256 === resourceProof.sha256, "SEM_AUTH_RESOURCE_PROOF_BINDING");
  ensure(request.stateTransitionEvidenceSha256 === stateProof.sha256, "SEM_AUTH_STATE_PROOF_BINDING");
  ensure(HEX_HASH.test(request.resourceSha256) && HEX_HASH.test(request.capabilityTokenSha256), "SEM_AUTH_RESOURCE_CAPABILITY_HASH");
  ensure(ROLES.includes(request.actorRole) && typeof request.actorPseudonym === "string" && request.actorPseudonym.length >= 16, "SEM_AUTH_ACTOR_BINDING");
  const row = protocol.resourceAccessPolicy.policyMatrix.find((entry) => entry.phase === request.phase && entry.states.includes(request.currentState));
  ensure(Boolean(row), "SEM_AUTH_PHASE_STATE");
  ensure(row.allow.includes(request.resourceClass), "SEM_AUTH_NOT_ALLOWED");
  ensure(!row.deny.includes(request.resourceClass), "SEM_AUTH_EXPLICIT_DENY");
  ensure(!protocol.resourceAccessPolicy.stateDenySets[request.currentState].includes(request.resourceClass), "SEM_AUTH_STATE_DENY");
  if (["TAXONOMY_PILOT_PHASE1", "MAIN_CERTIFICATION_PHASE1", "ACTIVATION_HOLDOUT_PHASE1"].includes(request.phase)) {
    ensure(["BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK"].includes(request.resourceClass), "SEM_AUTH_PHASE1_RESOURCE");
  }
  if (request.phase === "POST_ACTIVATION_RESULT") {
    ensure(registries.activationRegistry.authorityGranted === true && registries.activationRegistry.resultAccessAuthorized === true, "SEM_AUTH_NO_GRANT");
    ensure(HEX_HASH.test(registries.activationRegistry.currentGrantSha256), "SEM_AUTH_NO_GRANT_HASH");
  }
  return true;
}

function makeDenialRequest(registries, phase, currentState, resourceClass) {
  const request = makeAuthorizationRequest(registries, phase, currentState, resourceClass);
  return {
    ...request,
    policyDecisionProofSha256: request.resourceClassPolicyProofSha256,
    capabilityTokenSha256: null,
    authorizationEventSha256: null,
    openedAtRfc3339: null,
    closedAtRfc3339: null,
    hasOpenConsumeOrClose: false,
    decision: "DENY"
  };
}

function validateDenialRuntime(protocol, registries, request) {
  const policy = registries.policyRegistry;
  ensure(policy.ready === true && HEX_HASH.test(policy.policyMatrixSha256), "SEM_DENY_POLICY_NOT_READY");
  const key = `${request.phase}|${request.currentState}`;
  const row = protocol.resourceAccessPolicy.policyMatrix.find((entry) => entry.phase === request.phase && entry.states.includes(request.currentState));
  ensure(Boolean(row), "SEM_DENY_PHASE_STATE");
  const proof = policy.resourceClassPolicyProofs.find((entry) => entry.key === key && entry.resourceClass === request.resourceClass);
  ensure(proof && HEX_HASH.test(proof.sha256), "SEM_DENY_POLICY_PROOF");
  ensure(request.policyMatrixSha256 === policy.policyMatrixSha256, "SEM_DENY_POLICY_BINDING");
  ensure(request.allowlistSha256 === policy.allowlistSha256ByPhaseState[key], "SEM_DENY_ALLOWLIST_BINDING");
  ensure(request.denySetSha256 === policy.denySetSha256ByPhaseState[key], "SEM_DENY_SET_BINDING");
  ensure(request.policyDecisionProofSha256 === proof.sha256, "SEM_DENY_PROOF_BINDING");
  ensure(!row.allow.includes(request.resourceClass) || row.deny.includes(request.resourceClass) || protocol.resourceAccessPolicy.stateDenySets[request.currentState].includes(request.resourceClass), "SEM_DENY_ALLOWED_RESOURCE");
  ensure(request.capabilityTokenSha256 === null && request.authorizationEventSha256 === null, "SEM_DENY_CAPABILITY_CREATED");
  ensure(request.openedAtRfc3339 === null && request.closedAtRfc3339 === null && request.hasOpenConsumeOrClose === false, "SEM_DENY_ACCESS_EVENT_CREATED");
  ensure(request.decision === "DENY", "SEM_DENY_DECISION");
  return true;
}

function makeReadyPolicyRegistry(protocol) {
  const registry = {
    policyMatrixSha256: makeHash("policy"),
    allowlistSha256ByPhaseState: {},
    denySetSha256ByPhaseState: {},
    resourceClassPolicyProofs: [],
    stateTransitionEvidence: [],
    ready: true
  };
  for (const row of protocol.resourceAccessPolicy.policyMatrix) {
    for (const state of row.states) {
      const key = `${row.phase}|${state}`;
      registry.allowlistSha256ByPhaseState[key] = makeHash(`allow-${key}`);
      registry.denySetSha256ByPhaseState[key] = makeHash(`deny-${key}`);
      for (const resourceClass of RESOURCE_CLASSES) registry.resourceClassPolicyProofs.push({ key, resourceClass, sha256: makeHash(`proof-${key}-${resourceClass}`) });
      registry.stateTransitionEvidence.push({ state, sha256: makeHash(`state-${state}`) });
    }
  }
  return registry;
}

function makeTransaction() {
  const capability = makeHash("capability");
  const tx = "transaction-0001";
  const times = ["2026-07-16T00:00:00.000Z", "2026-07-16T00:00:01.000Z", "2026-07-16T00:00:01.000Z", "2026-07-16T00:00:02.000Z"];
  const hashes = [makeHash("auth-event"), makeHash("open-event"), makeHash("consume-event"), makeHash("close-event")];
  return [
    { eventKind: "AUTHORIZATION", transactionId: tx, eventOrdinal: 10, priorEventSha256: makeHash("prior"), eventSha256: hashes[0], capabilityTokenSha256: capability, occurredAtRfc3339: times[0], authorizedAtRfc3339: times[0] },
    { eventKind: "OPEN", transactionId: tx, eventOrdinal: 11, priorEventSha256: hashes[0], eventSha256: hashes[1], capabilityTokenSha256: capability, occurredAtRfc3339: times[1], openedAtRfc3339: times[1], authorizationEventSha256: hashes[0], authorizationEventOrdinal: 10, contentBytesReleasedBeforeOpenSeal: 0 },
    { eventKind: "CAPABILITY_CONSUME", transactionId: tx, eventOrdinal: 12, priorEventSha256: hashes[1], eventSha256: hashes[2], capabilityTokenSha256: capability, occurredAtRfc3339: times[2], consumedAtRfc3339: times[2], authorizationEventSha256: hashes[0], openEventSha256: hashes[1], openEventOrdinal: 11, useOrdinal: 1, contentBytesReleasedBeforeConsumeSeal: 0 },
    { eventKind: "CLOSE", transactionId: tx, eventOrdinal: 13, priorEventSha256: hashes[2], eventSha256: hashes[3], capabilityTokenSha256: capability, occurredAtRfc3339: times[3], authorizedAtRfc3339: times[0], openedAtRfc3339: times[1], consumedAtRfc3339: times[2], closedAtRfc3339: times[3], authorizationEventSha256: hashes[0], openEventSha256: hashes[1], consumeEventSha256: hashes[2], consumeEventOrdinal: 12 }
  ];
}

function validateTransactionRuntime(events, issuedCapabilities = new Set(), consumedCapabilities = new Set()) {
  ensure(Array.isArray(events) && events.length === 4, "SEM_TX_EVENT_COUNT");
  ensure(same(events.map(({ eventKind }) => eventKind), ["AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"]), "SEM_TX_SEQUENCE");
  const [authorization, open, consume, close] = events;
  ensure(unique(events.map(({ eventSha256 }) => eventSha256)) && events.every(({ eventSha256 }) => HEX_HASH.test(eventSha256)), "SEM_TX_EVENT_HASHES");
  for (let i = 1; i < events.length; i += 1) {
    ensure(events[i].eventOrdinal === events[i - 1].eventOrdinal + 1, "SEM_TX_ORDINAL");
    ensure(events[i].priorEventSha256 === events[i - 1].eventSha256, "SEM_TX_PRIOR_HASH");
  }
  ensure(events.every((event) => event.transactionId === authorization.transactionId), "SEM_TX_TRANSACTION_ID");
  ensure(events.every((event) => event.capabilityTokenSha256 === authorization.capabilityTokenSha256), "SEM_TX_CAPABILITY");
  ensure(!issuedCapabilities.has(authorization.capabilityTokenSha256) && !consumedCapabilities.has(authorization.capabilityTokenSha256), "SEM_TX_CAPABILITY_REUSE");
  ensure(open.authorizationEventSha256 === authorization.eventSha256 && open.authorizationEventOrdinal === authorization.eventOrdinal, "SEM_TX_OPEN_BINDING");
  ensure(consume.authorizationEventSha256 === authorization.eventSha256 && consume.openEventSha256 === open.eventSha256 && consume.openEventOrdinal === open.eventOrdinal, "SEM_TX_CONSUME_BINDING");
  ensure(close.authorizationEventSha256 === authorization.eventSha256 && close.openEventSha256 === open.eventSha256 && close.consumeEventSha256 === consume.eventSha256 && close.consumeEventOrdinal === consume.eventOrdinal, "SEM_TX_CLOSE_BINDING");
  ensure(authorization.occurredAtRfc3339 === authorization.authorizedAtRfc3339, "SEM_TX_AUTH_TIME_BINDING");
  ensure(open.occurredAtRfc3339 === open.openedAtRfc3339, "SEM_TX_OPEN_TIME_BINDING");
  ensure(consume.occurredAtRfc3339 === consume.consumedAtRfc3339, "SEM_TX_CONSUME_TIME_BINDING");
  ensure(close.occurredAtRfc3339 === close.closedAtRfc3339, "SEM_TX_CLOSE_TIME_BINDING");
  ensure(close.authorizedAtRfc3339 === authorization.authorizedAtRfc3339 && close.openedAtRfc3339 === open.openedAtRfc3339 && close.consumedAtRfc3339 === consume.consumedAtRfc3339, "SEM_TX_CLOSE_TIMES");
  const [authorizedAt, openedAt, consumedAt, closedAt] = [authorization.authorizedAtRfc3339, open.openedAtRfc3339, consume.consumedAtRfc3339, close.closedAtRfc3339].map((value) => Date.parse(value));
  ensure([authorizedAt, openedAt, consumedAt, closedAt].every(Number.isFinite), "SEM_TX_TIME_FORMAT");
  ensure(authorizedAt < openedAt && openedAt <= consumedAt && consumedAt <= closedAt, "SEM_TX_TIME_ORDER");
  ensure(open.contentBytesReleasedBeforeOpenSeal === 0 && consume.contentBytesReleasedBeforeConsumeSeal === 0, "SEM_TX_PRESEAL_RELEASE");
  ensure(consume.useOrdinal === 1, "SEM_TX_USE_ORDINAL");
  return true;
}

function validateGrantRuntime(registries, grant) {
  ensure(registries.policyRegistry.ready === true && HEX_HASH.test(registries.policyRegistry.policyMatrixSha256), "SEM_GRANT_POLICY_READY");
  ensure(Object.keys(registries.policyRegistry.allowlistSha256ByPhaseState).length > 0, "SEM_GRANT_ALLOWLIST_EMPTY");
  ensure(Object.keys(registries.policyRegistry.denySetSha256ByPhaseState).length > 0, "SEM_GRANT_DENY_EMPTY");
  ensure(registries.policyRegistry.resourceClassPolicyProofs.length > 0 && registries.policyRegistry.stateTransitionEvidence.length > 0, "SEM_GRANT_POLICY_PROOFS_EMPTY");
  ensure(HEX_HASH.test(grant.candidateEventSha256) && HEX_HASH.test(grant.candidateAuditReportSha256) && HEX_HASH.test(grant.candidateAuditManifestSha256), "SEM_GRANT_EVIDENCE_HASH");
  ensure(grant.candidateAuditVerdict === "PASS_NO_BLOCKERS", "SEM_GRANT_AUDIT_VERDICT");
  ensure(grant.authorityGranted === true && grant.resultAccessAuthorized === true, "SEM_GRANT_AUTHORITY");
  ensure(grant.candidateAuthorityBeforeGrant === false && grant.auditAuthorityBeforeGrant === false, "SEM_GRANT_PREAUTHORITY");
  ensure(grant.requestedScope === "FOCUS_ONLY" || grant.requestedScope === "ALL_25", "SEM_GRANT_SCOPE");
  ensure(grant.requestedScope === "FOCUS_ONLY" || (grant.certificateScopes[0] === "ALL_25" && grant.certificateScopes[1] === "ALL_25"), "SEM_GRANT_SCOPE_ESCALATION");
  return true;
}

function makeActivationRuntimeFixture() {
  const candidate = {
    eventSha256: makeHash("activation-candidate-event"),
    candidateCanonicalBytesSha256: makeHash("activation-candidate-bytes"),
    authorityGranted: false,
    resultAccessAuthorized: false,
    requestedScope: "FOCUS_ONLY"
  };
  const audit = {
    eventSha256: makeHash("activation-audit-report"),
    candidateEventSha256: candidate.eventSha256,
    candidateCanonicalBytesSha256: candidate.candidateCanonicalBytesSha256,
    verdict: "PASS_NO_BLOCKERS",
    authorityGranted: false,
    resultAccessAuthorized: false
  };
  const grant = {
    candidateEventSha256: candidate.eventSha256,
    candidateCanonicalBytesSha256: candidate.candidateCanonicalBytesSha256,
    candidateAuditReportSha256: audit.eventSha256,
    candidateAuditManifestSha256: makeHash("activation-audit-manifest"),
    candidateAuditVerdict: "PASS_NO_BLOCKERS",
    grantedScope: "FOCUS_ONLY",
    authorityGranted: true,
    resultAccessAuthorized: true
  };
  return { candidate, audit, grant, preGrantResultAccesses: 0 };
}

function validateActivationRuntime(fixture) {
  const { candidate, audit, grant } = fixture;
  ensure(HEX_HASH.test(candidate.eventSha256) && HEX_HASH.test(candidate.candidateCanonicalBytesSha256), "SEM_ACTIVATION_CANDIDATE_HASH");
  ensure(candidate.authorityGranted === false && candidate.resultAccessAuthorized === false, "SEM_ACTIVATION_CANDIDATE_FALSE");
  ensure(!Object.keys(candidate).some((key) => /auditReport|auditManifest|candidateAudit/i.test(key)), "SEM_ACTIVATION_CANDIDATE_FUTURE_AUDIT");
  ensure(audit.candidateEventSha256 === candidate.eventSha256 && audit.candidateCanonicalBytesSha256 === candidate.candidateCanonicalBytesSha256, "SEM_ACTIVATION_AUDIT_CANDIDATE_BINDING");
  ensure(audit.verdict === "PASS_NO_BLOCKERS" && audit.authorityGranted === false && audit.resultAccessAuthorized === false, "SEM_ACTIVATION_AUDIT_FALSE");
  ensure(!Object.keys(audit).some((key) => /auditManifest/i.test(key)), "SEM_ACTIVATION_AUDIT_FUTURE_MANIFEST");
  ensure(grant.candidateEventSha256 === candidate.eventSha256 && grant.candidateCanonicalBytesSha256 === candidate.candidateCanonicalBytesSha256, "SEM_ACTIVATION_GRANT_CANDIDATE_BINDING");
  ensure(grant.candidateAuditReportSha256 === audit.eventSha256 && HEX_HASH.test(grant.candidateAuditManifestSha256), "SEM_ACTIVATION_GRANT_AUDIT_BINDING");
  ensure(grant.candidateAuditVerdict === "PASS_NO_BLOCKERS" && grant.authorityGranted === true && grant.resultAccessAuthorized === true, "SEM_ACTIVATION_GRANT_AUTHORITY");
  ensure(grant.grantedScope === candidate.requestedScope, "SEM_ACTIVATION_GRANT_SCOPE");
  ensure(fixture.preGrantResultAccesses === 0, "SEM_ACTIVATION_PREGRANT_RESULT_ACCESS");
  return true;
}

function runStructuralMutations(baseline) {
  const cases = [];
  function mutation(name, mutate) {
    const subject = clone(baseline);
    mutate(subject);
    let detected = false;
    let code = "NO_REJECTION";
    try {
      validateBundle(subject);
    } catch (error) {
      ensure(error instanceof VerificationError, "MUTATION_HARNESS_ERROR", `${name}: ${error.stack}`);
      detected = true;
      code = error.code;
    }
    ensure(detected, "MUTATION_NOT_DETECTED", name);
    cases.push(`${name}:${code}`);
  }

  const p = baseline.protocol;
  for (const key of Object.keys(p.permanentDesignBoundary)) mutation(`boundary-${key}`, (b) => { const value = b.protocol.permanentDesignBoundary[key]; b.protocol.permanentDesignBoundary[key] = typeof value === "boolean" ? !value : value + 1; });
  for (const key of Object.keys(p.publicOnlyBoundary.activity)) mutation(`public-activity-${key}`, (b) => { b.protocol.publicOnlyBoundary.activity[key] = 1; });
  UPSTREAMS.forEach(([, ,], index) => mutation(`upstream-hash-${index}`, (b) => { b.protocol.upstreams[index].sha256 = makeHash(`bad-upstream-${index}`); }));
  BLOCKER_CODES.forEach((_, index) => mutation(`predecessor-blocker-${index}`, (b) => { b.protocol.upstreams[1].requiredBlockerCodes.splice(index, 1); }));
  Object.keys(BLOCKER_CLOSURES).forEach((key) => mutation(`closure-${key}`, (b) => { delete b.protocol.blockerClosureMap[key]; }));

  TYPES.forEach((_, index) => mutation(`protocol-type-${index}`, (b) => { b.protocol.typeUniverse.uiTypeIdsInOrder[index] = `BROKEN_TYPE_${index}`; }));
  TYPES.forEach((_, index) => mutation(`coverage-type-${index}`, (b) => { b.protocol.coverageAndCertificatePolicy.all25CanonicalTypeIdsExact[index] = `BROKEN_COVERAGE_${index}`; }));
  TYPES.forEach((_, index) => mutation(`schema-type-${index}`, (b) => { b.schemas.$defs.typeId.enum[index] = `BROKEN_SCHEMA_${index}`; }));
  TYPES.forEach((typeId, index) => mutation(`registry-map-${index}`, (b) => { delete b.registries.coverageRegistry.all25Template.passedCoverageEventSha256ByCanonicalType[typeId]; }));
  FAMILIES.forEach((_, index) => mutation(`family-${index}`, (b) => { b.protocol.typeUniverse.families[index].familyId = `BROKEN_FAMILY_${index}`; }));
  FAMILIES.forEach((_, index) => mutation(`schema-family-${index}`, (b) => { b.schemas.$defs.familyId.enum[index] = `BROKEN_SCHEMA_FAMILY_${index}`; }));

  ROLES.forEach((_, index) => mutation(`protocol-role-${index}`, (b) => { b.protocol.roles.roleEnum[index] = `BROKEN_ROLE_${index}`; }));
  ROLES.forEach((_, index) => mutation(`schema-role-${index}`, (b) => { b.schemas.$defs.role.enum[index] = `BROKEN_SCHEMA_ROLE_${index}`; }));
  TRUSTED_INCOMPATIBLE.forEach((_, index) => mutation(`trusted-incompat-${index}`, (b) => { b.protocol.roles.trustedGoldAuditorIncompatibleWith.splice(index, 1); }));
  ACTIVATION_INCOMPATIBLE.forEach((_, index) => mutation(`activation-incompat-${index}`, (b) => { b.protocol.roles.activationAuditorIncompatibleWith.splice(index, 1); }));
  FRESH_ADJUDICATOR_INCOMPATIBLE.forEach((_, index) => mutation(`adjudicator-incompat-${index}`, (b) => { b.protocol.roles.freshAdjudicatorIncompatibleWith.splice(index, 1); }));
  baseline.schemas.$defs.artifactAuthorshipRecord.allOf.filter((entry) => entry.if && entry.then).forEach((_, index) => mutation(`authorship-role-map-${index}`, (b) => { b.schemas.$defs.artifactAuthorshipRecord.allOf.splice(index + 1, 1); }));

  STATES.forEach((_, index) => mutation(`protocol-state-${index}`, (b) => { b.protocol.stateMachine.states[index] = `BROKEN_STATE_${index}`; }));
  STATES.forEach((_, index) => mutation(`schema-state-${index}`, (b) => { b.schemas.$defs.state.enum[index] = `BROKEN_SCHEMA_STATE_${index}`; }));
  STATES.forEach((state) => mutation(`state-deny-delete-${state}`, (b) => { delete b.protocol.resourceAccessPolicy.stateDenySets[state]; }));
  STATES.forEach((state) => mutation(`state-deny-empty-${state}`, (b) => { b.protocol.resourceAccessPolicy.stateDenySets[state] = []; }));
  EXPECTED_TRANSITIONS.forEach((_, index) => mutation(`transition-${index}`, (b) => { b.protocol.stateMachine.transitions[index].to = STATES[0]; }));

  RESOURCE_CLASSES.forEach((_, index) => mutation(`protocol-resource-${index}`, (b) => { b.protocol.resourceAccessPolicy.resourceClassEnum[index] = `BROKEN_RESOURCE_${index}`; }));
  RESOURCE_CLASSES.forEach((_, index) => mutation(`schema-resource-${index}`, (b) => { b.schemas.$defs.resourceClass.enum[index] = `BROKEN_SCHEMA_RESOURCE_${index}`; }));
  p.resourceAccessPolicy.policyMatrix.forEach((_, index) => mutation(`policy-allow-empty-${index}`, (b) => { b.protocol.resourceAccessPolicy.policyMatrix[index].allow = []; }));
  p.resourceAccessPolicy.policyMatrix.forEach((_, index) => mutation(`policy-deny-empty-${index}`, (b) => { b.protocol.resourceAccessPolicy.policyMatrix[index].deny = []; }));

  SLOT_COMMITMENTS.forEach((_, index) => mutation(`slot-commitment-${index}`, (b) => { b.protocol.slotMaterializationPolicy.requiredCommitments.splice(index, 1); }));
  SLOT_SCHEMA_FIELDS.forEach((field) => mutation(`slot-schema-required-${field}`, (b) => { const part = objectPart(b.schemas.$defs.slotMaterialization); part.required = part.required.filter((entry) => entry !== field); }));
  FINGERPRINT_COMPONENTS.forEach((_, index) => mutation(`fingerprint-component-${index}`, (b) => { b.protocol.fingerprintAndReplayPolicy.requiredFingerprintComponents.splice(index, 1); }));
  FINGERPRINT_SCHEMA_FIELDS.forEach((field) => mutation(`fingerprint-schema-${field}`, (b) => { b.schemas.$defs.fingerprintBundle.required = b.schemas.$defs.fingerprintBundle.required.filter((entry) => entry !== field); }));

  EVENT_DEFS.forEach((eventDef) => mutation(`instance-count-${eventDef}`, (b) => { b.schemas["x-currentInstanceCounts"][eventDef] = 1; }));
  Object.keys(p.emptyOperationalState).forEach((key) => mutation(`empty-state-${key}`, (b) => { b.protocol.emptyOperationalState[key] = 1; }));
  Object.keys(p.activity).forEach((key) => mutation(`activity-${key}`, (b) => { b.protocol.activity[key] = 1; }));
  Object.keys(baseline.registries.operationalState).filter((key) => key !== "currentState").forEach((key) => mutation(`registry-operational-${key}`, (b) => { b.registries.operationalState[key] = typeof b.registries.operationalState[key] === "boolean" ? true : 1; }));

  const criticalRequired = {
    roleAssignment: ["roleExclusionProofSha256", "artifactAuthorshipExclusionProofSha256"],
    trustedGoldAuditReport: ["goldAuthorRegistrySha256", "itemAuthorRegistrySha256", "packetAuthorRegistrySha256", "artifactAuthorshipExclusionProofSha256"],
    authorization: ["currentState", "resourceClass", "policyMatrixSha256", "allowlistSha256", "denySetSha256", "resourceClassPolicyProofSha256", "stateTransitionEvidenceSha256"],
    denial: ["currentState", "resourceClass", "policyMatrixSha256", "allowlistSha256", "denySetSha256", "policyDecisionProofSha256"],
    openEvent: ["authorizationEventSha256", "authorizationEventOrdinal", "contentBytesReleasedBeforeOpenSeal"],
    capabilityConsume: ["openEventSha256", "openEventOrdinal", "capabilityUniquenessProofSha256", "useOrdinal", "contentBytesReleasedBeforeConsumeSeal"],
    closeEvent: ["consumeEventSha256", "consumeEventOrdinal", "closedAtRfc3339"],
    activationCandidate: ["reviewerCertificateSha256s", "requestedCoverageEvidence", "authorityGranted", "resultAccessAuthorized"],
    activationCandidateAuditReport: ["candidateEventSha256", "candidateCanonicalBytesSha256", "auditorRoleExclusionProofSha256", "auditorArtifactAuthorshipExclusionProofSha256", "authorityGranted"],
    activationGrant: ["candidateAuditReportSha256", "candidateAuditManifestSha256", "candidateAuditVerdict", "deterministicGrantProofSha256"]
  };
  for (const [eventDef, fields] of Object.entries(criticalRequired)) {
    for (const field of fields) mutation(`schema-required-${eventDef}-${field}`, (b) => { const part = objectPart(b.schemas.$defs[eventDef]); part.required = part.required.filter((entry) => entry !== field); });
  }

  ensure(cases.length >= baseline.hostile.minimums.structuralMutations, "MUTATION_MINIMUM", `${cases.length}`);
  return { cases: cases.length, detected: cases.length, digest: sha256Bytes(cases.join("\n")) };
}

function runSemanticBypasses(baseline) {
  const cases = [];
  function rejected(name, fn) {
    let wasRejected = false;
    let code = "NO_REJECTION";
    try {
      fn();
    } catch (error) {
      ensure(error instanceof VerificationError, "SEMANTIC_HARNESS_ERROR", `${name}: ${error.stack}`);
      wasRejected = true;
      code = error.code;
    }
    ensure(wasRejected, "SEMANTIC_BYPASS_ACCEPTED", name);
    cases.push(`${name}:${code}`);
  }

  const all25 = makeCoverage("ALL_25");
  ensure(validateCoverageRuntime(all25.evidence, all25.events), "SEMANTIC_BASELINE_COVERAGE");
  TYPES.forEach((typeId) => rejected(`coverage-missing-type-${typeId}`, () => { const fixture = clone(all25); fixture.evidence.canonicalTypeIds = fixture.evidence.canonicalTypeIds.filter((entry) => entry !== typeId); validateCoverageRuntime(fixture.evidence, fixture.events); }));
  TYPES.forEach((typeId) => rejected(`coverage-missing-map-${typeId}`, () => { const fixture = clone(all25); delete fixture.evidence.passedCoverageEventSha256ByCanonicalType[typeId]; validateCoverageRuntime(fixture.evidence, fixture.events); }));
  TYPES.forEach((typeId) => rejected(`coverage-wrong-event-type-${typeId}`, () => { const fixture = clone(all25); const hash = fixture.evidence.passedCoverageEventSha256ByCanonicalType[typeId]; fixture.events[hash].canonicalTypeId = "GRAMMAR_ERROR" === typeId ? "BLANK_INFERENCE" : "GRAMMAR_ERROR"; validateCoverageRuntime(fixture.evidence, fixture.events); }));
  rejected("coverage-duplicate-hash", () => { const fixture = clone(all25); fixture.evidence.passedCoverageEventSha256ByCanonicalType[TYPES[1]] = fixture.evidence.passedCoverageEventSha256ByCanonicalType[TYPES[0]]; validateCoverageRuntime(fixture.evidence, fixture.events); });
  rejected("coverage-contact-not-pass", () => { const fixture = clone(all25); const hash = fixture.evidence.passedCoverageEventSha256ByCanonicalType[TYPES[0]]; fixture.events[hash].eventKind = "CONTACT_EVENT"; validateCoverageRuntime(fixture.evidence, fixture.events); });
  rejected("coverage-pilot-not-eligible", () => { const fixture = clone(all25); const hash = fixture.evidence.passedCoverageEventSha256ByCanonicalType[TYPES[0]]; fixture.events[hash].phase = "TAXONOMY_PILOT"; validateCoverageRuntime(fixture.evidence, fixture.events); });
  rejected("coverage-epoch1-contact16-as-all25", () => { const fixture = clone(all25); fixture.evidence.canonicalTypeIds = fixture.evidence.canonicalTypeIds.slice(0, 16); fixture.evidence.coverageCount = 25; validateCoverageRuntime(fixture.evidence, fixture.events); });
  rejected("coverage-wider-than-focus-certificate", () => { const fixture = clone(all25); const certificate = { scopeEnum: "FOCUS_ONLY", map: Object.fromEntries(FOCUS_GATE_ORDER.map((typeId) => [typeId, fixture.evidence.passedCoverageEventSha256ByCanonicalType[typeId]])) }; validateCoverageRuntime(fixture.evidence, fixture.events, [certificate, certificate]); });

  const assignments = Object.fromEntries(ROLES.map((role, index) => [role, `actor-${index}`]));
  const artifactAuthors = { PACKET: assignments.PACKET_AUTHOR, ITEM: assignments.ITEM_AUTHOR, GOLD: assignments.GOLD_AUTHOR, REVIEWER_CERTIFICATE: assignments.CERTIFICATION_REVIEWER, TRUSTED_GOLD_AUDIT: assignments.TRUSTED_GOLD_AUDITOR, ACTIVATION_CANDIDATE: assignments.ACTIVATION_CANDIDATE_AUTHOR, ACTIVATION_GRANT: assignments.ACTIVATION_GRANT_AUTHOR };
  ensure(validateRoleRuntime(assignments, artifactAuthors), "SEMANTIC_BASELINE_ROLES");
  TRUSTED_INCOMPATIBLE.forEach((role) => rejected(`trusted-role-collision-${role}`, () => { const fixture = clone(assignments); fixture[role] = fixture.TRUSTED_GOLD_AUDITOR; validateRoleRuntime(fixture, artifactAuthors); }));
  ACTIVATION_INCOMPATIBLE.forEach((role) => rejected(`activation-role-collision-${role}`, () => { const fixture = clone(assignments); fixture[role] = fixture.INDEPENDENT_ACTIVATION_AUDITOR; validateRoleRuntime(fixture, artifactAuthors); }));
  FRESH_ADJUDICATOR_INCOMPATIBLE.forEach((role) => rejected(`adjudicator-role-collision-${role}`, () => { const fixture = clone(assignments); fixture[role] = fixture.S1_ADJUDICATOR; validateRoleRuntime(fixture, artifactAuthors); }));
  for (const artifactClass of ["PACKET", "ITEM", "GOLD"]) rejected(`trusted-authorship-${artifactClass}`, () => { const fixture = clone(artifactAuthors); fixture[artifactClass] = assignments.TRUSTED_GOLD_AUDITOR; validateRoleRuntime(assignments, fixture); });
  for (const artifactClass of ["PACKET", "ITEM", "GOLD", "REVIEWER_CERTIFICATE", "TRUSTED_GOLD_AUDIT", "ACTIVATION_CANDIDATE", "ACTIVATION_GRANT"]) rejected(`activation-authorship-${artifactClass}`, () => { const fixture = clone(artifactAuthors); fixture[artifactClass] = assignments.INDEPENDENT_ACTIVATION_AUDITOR; validateRoleRuntime(assignments, fixture); });

  const slot = makeSlotRuntimeFixture();
  ensure(validateSlotRuntime(slot), "SEMANTIC_BASELINE_SLOT");
  SLOT_COMMITMENTS.forEach((field) => rejected(`slot-missing-commitment-${field}`, () => { const fixture = clone(slot); delete fixture.commitments[field]; validateSlotRuntime(fixture); }));
  rejected("slot-alias-type", () => { const fixture = clone(slot); fixture.canonicalTypeId = "TOPIC_ALIAS"; validateSlotRuntime(fixture); });
  rejected("slot-unknown-family", () => { const fixture = clone(slot); fixture.canonicalFamilyId = "NF-UNKNOWN"; validateSlotRuntime(fixture); });
  rejected("slot-wrong-family", () => { const fixture = clone(slot); fixture.canonicalFamilyId = "NF-F2-LOCAL_INFERENCE_AND_REFERENCE"; validateSlotRuntime(fixture); });
  rejected("slot-main-wrong-epoch-type", () => { const fixture = clone(slot); fixture.canonicalTypeId = "MAIN_IDEA"; validateSlotRuntime(fixture); });
  rejected("slot-holdout-wrong-epoch-type", () => { const fixture = clone(slot); fixture.phase = "ACTIVATION_HOLDOUT"; validateSlotRuntime(fixture); });
  rejected("slot-reservation-after-materialization", () => { const fixture = clone(slot); fixture.fingerprintReservationEventOrdinal = fixture.eventOrdinal + 1; validateSlotRuntime(fixture); });
  rejected("slot-binding-pin-drift", () => { const fixture = clone(slot); fixture.bindingV4ManifestSha256 = makeHash("wrong-binding"); validateSlotRuntime(fixture); });

  const fingerprints = makeFingerprintRuntimeFixture();
  ensure(validateFingerprintRuntime(fingerprints), "SEMANTIC_BASELINE_FINGERPRINTS");
  FINGERPRINT_COMPONENTS.forEach((component) => rejected(`fingerprint-missing-component-${component}`, () => { const fixture = clone(fingerprints); delete fixture.entries[0].bundle[component]; validateFingerprintRuntime(fixture); }));
  rejected("fingerprint-cross-phase-duplicate", () => { const fixture = clone(fingerprints); fixture.entries[12].bundle.COMPOSITE_FINGERPRINT_SHA256 = fixture.entries[0].bundle.COMPOSITE_FINGERPRINT_SHA256; validateFingerprintRuntime(fixture); });
  rejected("fingerprint-failed-replay", () => { const fixture = clone(fingerprints); fixture.failedTombstones.add(fixture.entries[0].bundle.COMPOSITE_FINGERPRINT_SHA256); validateFingerprintRuntime(fixture); });
  rejected("fingerprint-rejected-replay", () => { const fixture = clone(fingerprints); fixture.rejectedTombstones.add(fixture.entries[0].bundle.COMPOSITE_FINGERPRINT_SHA256); validateFingerprintRuntime(fixture); });
  rejected("fingerprint-prior-issued-replay", () => { const fixture = clone(fingerprints); fixture.previouslyIssued.add(fixture.entries[0].bundle.COMPOSITE_FINGERPRINT_SHA256); validateFingerprintRuntime(fixture); });
  rejected("fingerprint-pilot-count-11", () => { const fixture = clone(fingerprints); fixture.entries.splice(0, 1); validateFingerprintRuntime(fixture); });
  rejected("fingerprint-pair-count-1769", () => { const fixture = clone(fingerprints); fixture.proof.pairwiseComparisonCount = 1769; validateFingerprintRuntime(fixture); });
  rejected("fingerprint-collision-verdict-false", () => { const fixture = clone(fingerprints); fixture.proof.noCollisionVerdict = false; validateFingerprintRuntime(fixture); });
  rejected("fingerprint-proof-root-empty", () => { const fixture = clone(fingerprints); fixture.proof.allPairwiseComparisonsRootSha256 = null; validateFingerprintRuntime(fixture); });

  const readyRegistries = clone(baseline.registries);
  readyRegistries.policyRegistry = makeReadyPolicyRegistry(baseline.protocol);
  readyRegistries.activationRegistry.authorityGranted = true;
  readyRegistries.activationRegistry.resultAccessAuthorized = true;
  readyRegistries.activationRegistry.currentGrantSha256 = makeHash("grant");
  for (const row of baseline.protocol.resourceAccessPolicy.policyMatrix) {
    const state = row.states[0];
    for (const resourceClass of row.allow) ensure(validateAuthorizationRuntime(baseline.protocol, readyRegistries, makeAuthorizationRequest(readyRegistries, row.phase, state, resourceClass)), "SEMANTIC_BASELINE_AUTH");
    for (const resourceClass of RESOURCE_CLASSES.filter((resource) => !row.allow.includes(resource))) {
      rejected(`auth-bypass-${row.phase}-${resourceClass}`, () => validateAuthorizationRuntime(baseline.protocol, readyRegistries, makeAuthorizationRequest(readyRegistries, row.phase, state, resourceClass)));
    }
    const deniedResource = RESOURCE_CLASSES.find((resource) => !row.allow.includes(resource));
    ensure(validateDenialRuntime(baseline.protocol, readyRegistries, makeDenialRequest(readyRegistries, row.phase, state, deniedResource)), "SEMANTIC_BASELINE_DENIAL");
    const wrongState = STATES.find((candidate) => !row.states.includes(candidate));
    rejected(`auth-wrong-state-${row.phase}`, () => validateAuthorizationRuntime(baseline.protocol, readyRegistries, makeAuthorizationRequest(readyRegistries, row.phase, wrongState, row.allow[0])));
  }
  const basicRequest = makeAuthorizationRequest(readyRegistries, "MAIN_CERTIFICATION_PHASE1", "MAIN_CERTIFICATION_24_ISSUED", "BLIND_STUDENT_VISIBLE_SURFACE");
  rejected("auth-empty-design-policy-registry", () => validateAuthorizationRuntime(baseline.protocol, baseline.registries, basicRequest));
  rejected("auth-empty-allow-digest", () => { const fixture = clone(readyRegistries); fixture.policyRegistry.allowlistSha256ByPhaseState[`${basicRequest.phase}|${basicRequest.currentState}`] = null; validateAuthorizationRuntime(baseline.protocol, fixture, basicRequest); });
  rejected("auth-empty-deny-digest", () => { const fixture = clone(readyRegistries); fixture.policyRegistry.denySetSha256ByPhaseState[`${basicRequest.phase}|${basicRequest.currentState}`] = null; validateAuthorizationRuntime(baseline.protocol, fixture, basicRequest); });
  rejected("auth-empty-resource-proof", () => { const fixture = clone(readyRegistries); fixture.policyRegistry.resourceClassPolicyProofs = []; validateAuthorizationRuntime(baseline.protocol, fixture, basicRequest); });
  rejected("auth-empty-state-proof", () => { const fixture = clone(readyRegistries); fixture.policyRegistry.stateTransitionEvidence = []; validateAuthorizationRuntime(baseline.protocol, fixture, basicRequest); });
  rejected("auth-wrong-policy-binding", () => { const fixture = clone(basicRequest); fixture.policyMatrixSha256 = makeHash("wrong-policy"); validateAuthorizationRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("auth-wrong-allow-binding", () => { const fixture = clone(basicRequest); fixture.allowlistSha256 = makeHash("wrong-allow"); validateAuthorizationRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("auth-wrong-deny-binding", () => { const fixture = clone(basicRequest); fixture.denySetSha256 = makeHash("wrong-deny"); validateAuthorizationRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("auth-wrong-resource-proof-binding", () => { const fixture = clone(basicRequest); fixture.resourceClassPolicyProofSha256 = makeHash("wrong-resource-proof"); validateAuthorizationRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("auth-wrong-state-proof-binding", () => { const fixture = clone(basicRequest); fixture.stateTransitionEvidenceSha256 = makeHash("wrong-state-proof"); validateAuthorizationRuntime(baseline.protocol, readyRegistries, fixture); });
  const deniedRequest = makeDenialRequest(readyRegistries, "MAIN_CERTIFICATION_PHASE1", "MAIN_CERTIFICATION_24_ISSUED", "BOUND_ANSWER_EXPLANATION_REVEAL");
  rejected("denial-wrong-policy-binding", () => { const fixture = clone(deniedRequest); fixture.policyMatrixSha256 = makeHash("wrong-denial-policy"); validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-wrong-allow-binding", () => { const fixture = clone(deniedRequest); fixture.allowlistSha256 = makeHash("wrong-denial-allow"); validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-wrong-deny-binding", () => { const fixture = clone(deniedRequest); fixture.denySetSha256 = makeHash("wrong-denial-deny"); validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-wrong-proof-binding", () => { const fixture = clone(deniedRequest); fixture.policyDecisionProofSha256 = makeHash("wrong-denial-proof"); validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-creates-capability", () => { const fixture = clone(deniedRequest); fixture.capabilityTokenSha256 = makeHash("forbidden-capability"); validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-claims-open", () => { const fixture = clone(deniedRequest); fixture.hasOpenConsumeOrClose = true; validateDenialRuntime(baseline.protocol, readyRegistries, fixture); });
  rejected("denial-of-allowed-resource", () => validateDenialRuntime(baseline.protocol, readyRegistries, makeDenialRequest(readyRegistries, "MAIN_CERTIFICATION_PHASE1", "MAIN_CERTIFICATION_24_ISSUED", "BLIND_STUDENT_VISIBLE_SURFACE")));

  const transaction = makeTransaction();
  ensure(validateTransactionRuntime(transaction), "SEMANTIC_BASELINE_TRANSACTION");
  [0, 1, 2, 3].forEach((index) => rejected(`tx-missing-event-${index}`, () => { const fixture = clone(transaction); fixture.splice(index, 1); validateTransactionRuntime(fixture); }));
  [[0, 1], [1, 2], [2, 3]].forEach(([a, b]) => rejected(`tx-reorder-${a}-${b}`, () => { const fixture = clone(transaction); [fixture[a], fixture[b]] = [fixture[b], fixture[a]]; validateTransactionRuntime(fixture); }));
  [1, 2, 3].forEach((index) => rejected(`tx-ordinal-gap-${index}`, () => { const fixture = clone(transaction); fixture[index].eventOrdinal += 1; validateTransactionRuntime(fixture); }));
  [1, 2, 3].forEach((index) => rejected(`tx-prior-hash-${index}`, () => { const fixture = clone(transaction); fixture[index].priorEventSha256 = makeHash(`wrong-prior-${index}`); validateTransactionRuntime(fixture); }));
  [1, 2, 3].forEach((index) => rejected(`tx-capability-mismatch-${index}`, () => { const fixture = clone(transaction); fixture[index].capabilityTokenSha256 = makeHash(`wrong-cap-${index}`); validateTransactionRuntime(fixture); }));
  [1, 2, 3].forEach((index) => rejected(`tx-transaction-mismatch-${index}`, () => { const fixture = clone(transaction); fixture[index].transactionId = `wrong-transaction-${index}`; validateTransactionRuntime(fixture); }));
  [0, 1, 2, 3].forEach((index) => rejected(`tx-occurred-at-mismatch-${index}`, () => { const fixture = clone(transaction); fixture[index].occurredAtRfc3339 = "2026-07-17T00:00:00.000Z"; validateTransactionRuntime(fixture); }));
  rejected("tx-content-before-open", () => { const fixture = clone(transaction); fixture[1].contentBytesReleasedBeforeOpenSeal = 1; validateTransactionRuntime(fixture); });
  rejected("tx-content-before-consume", () => { const fixture = clone(transaction); fixture[2].contentBytesReleasedBeforeConsumeSeal = 1; validateTransactionRuntime(fixture); });
  rejected("tx-use-ordinal-two", () => { const fixture = clone(transaction); fixture[2].useOrdinal = 2; validateTransactionRuntime(fixture); });
  rejected("tx-capability-reuse-issued", () => validateTransactionRuntime(transaction, new Set([transaction[0].capabilityTokenSha256]), new Set()));
  rejected("tx-capability-reuse-consumed", () => validateTransactionRuntime(transaction, new Set(), new Set([transaction[0].capabilityTokenSha256])));
  rejected("tx-backdated-authorization", () => { const fixture = clone(transaction); fixture[0].authorizedAtRfc3339 = "2026-07-16T00:00:02.000Z"; fixture[0].occurredAtRfc3339 = fixture[0].authorizedAtRfc3339; fixture[3].authorizedAtRfc3339 = fixture[0].authorizedAtRfc3339; validateTransactionRuntime(fixture); });
  rejected("tx-close-before-consume", () => { const fixture = clone(transaction); fixture[3].closedAtRfc3339 = "2026-07-16T00:00:00.500Z"; fixture[3].occurredAtRfc3339 = fixture[3].closedAtRfc3339; validateTransactionRuntime(fixture); });

  const grantRegistries = clone(readyRegistries);
  const grant = { candidateEventSha256: makeHash("candidate"), candidateAuditReportSha256: makeHash("audit-report"), candidateAuditManifestSha256: makeHash("audit-manifest"), candidateAuditVerdict: "PASS_NO_BLOCKERS", authorityGranted: true, resultAccessAuthorized: true, candidateAuthorityBeforeGrant: false, auditAuthorityBeforeGrant: false, requestedScope: "FOCUS_ONLY", certificateScopes: ["FOCUS_ONLY", "FOCUS_ONLY"] };
  ensure(validateGrantRuntime(grantRegistries, grant), "SEMANTIC_BASELINE_GRANT");
  rejected("grant-empty-policy-registry", () => validateGrantRuntime(baseline.registries, grant));
  rejected("grant-empty-allowlist", () => { const fixture = clone(grantRegistries); fixture.policyRegistry.allowlistSha256ByPhaseState = {}; validateGrantRuntime(fixture, grant); });
  rejected("grant-empty-deny", () => { const fixture = clone(grantRegistries); fixture.policyRegistry.denySetSha256ByPhaseState = {}; validateGrantRuntime(fixture, grant); });
  rejected("grant-empty-resource-proof", () => { const fixture = clone(grantRegistries); fixture.policyRegistry.resourceClassPolicyProofs = []; validateGrantRuntime(fixture, grant); });
  rejected("grant-empty-state-proof", () => { const fixture = clone(grantRegistries); fixture.policyRegistry.stateTransitionEvidence = []; validateGrantRuntime(fixture, grant); });
  rejected("grant-no-audit-report", () => { const fixture = clone(grant); fixture.candidateAuditReportSha256 = null; validateGrantRuntime(grantRegistries, fixture); });
  rejected("grant-no-audit-manifest", () => { const fixture = clone(grant); fixture.candidateAuditManifestSha256 = null; validateGrantRuntime(grantRegistries, fixture); });
  rejected("grant-audit-not-pass", () => { const fixture = clone(grant); fixture.candidateAuditVerdict = "FAIL_BLOCKERS"; validateGrantRuntime(grantRegistries, fixture); });
  rejected("grant-candidate-preauthority-true", () => { const fixture = clone(grant); fixture.candidateAuthorityBeforeGrant = true; validateGrantRuntime(grantRegistries, fixture); });
  rejected("grant-audit-preauthority-true", () => { const fixture = clone(grant); fixture.auditAuthorityBeforeGrant = true; validateGrantRuntime(grantRegistries, fixture); });
  rejected("grant-all25-over-focus-certificate", () => { const fixture = clone(grant); fixture.requestedScope = "ALL_25"; validateGrantRuntime(grantRegistries, fixture); });

  const activation = makeActivationRuntimeFixture();
  ensure(validateActivationRuntime(activation), "SEMANTIC_BASELINE_ACTIVATION");
  rejected("activation-candidate-authority", () => { const fixture = clone(activation); fixture.candidate.authorityGranted = true; validateActivationRuntime(fixture); });
  rejected("activation-candidate-result-access", () => { const fixture = clone(activation); fixture.candidate.resultAccessAuthorized = true; validateActivationRuntime(fixture); });
  rejected("activation-candidate-future-audit-hash", () => { const fixture = clone(activation); fixture.candidate.candidateAuditManifestSha256 = makeHash("future-audit"); validateActivationRuntime(fixture); });
  rejected("activation-audit-wrong-candidate-event", () => { const fixture = clone(activation); fixture.audit.candidateEventSha256 = makeHash("wrong-candidate-event"); validateActivationRuntime(fixture); });
  rejected("activation-audit-wrong-candidate-bytes", () => { const fixture = clone(activation); fixture.audit.candidateCanonicalBytesSha256 = makeHash("wrong-candidate-bytes"); validateActivationRuntime(fixture); });
  rejected("activation-audit-authority", () => { const fixture = clone(activation); fixture.audit.authorityGranted = true; validateActivationRuntime(fixture); });
  rejected("activation-audit-own-future-manifest", () => { const fixture = clone(activation); fixture.audit.auditManifestSha256 = makeHash("future-own-manifest"); validateActivationRuntime(fixture); });
  rejected("activation-grant-wrong-audit-report", () => { const fixture = clone(activation); fixture.grant.candidateAuditReportSha256 = makeHash("wrong-audit-report"); validateActivationRuntime(fixture); });
  rejected("activation-grant-missing-audit-manifest", () => { const fixture = clone(activation); fixture.grant.candidateAuditManifestSha256 = null; validateActivationRuntime(fixture); });
  rejected("activation-grant-scope-escalation", () => { const fixture = clone(activation); fixture.grant.grantedScope = "ALL_25"; validateActivationRuntime(fixture); });
  rejected("activation-pregrant-result-access", () => { const fixture = clone(activation); fixture.preGrantResultAccesses = 1; validateActivationRuntime(fixture); });

  ensure(cases.length >= baseline.hostile.minimums.semanticBypasses, "SEMANTIC_MINIMUM", `${cases.length}`);
  return { cases: cases.length, rejected: cases.length, digest: sha256Bytes(cases.join("\n")) };
}

const PACKAGE_CORE_FILES = ["PROTOCOL.md", "README.md", "event-schemas.json", "hostile-fixtures.json", "protocol.json", "registries.json", "verify.mjs"];

function verifyOwnPackage(structural, semantic) {
  const publicPath = resolve(PKG_DIR, "public-manifest.json");
  const manifestPath = resolve(PKG_DIR, "MANIFEST.sha256");
  if (!existsSync(publicPath) && !existsSync(manifestPath)) return { status: "NOT_YET_SEALED", publicManifestPresent: false, manifestPresent: false };
  ensure(existsSync(publicPath) && existsSync(manifestPath), "PACKAGE_SEAL_PARTIAL");
  const publicManifest = readJsonStrict(publicPath, "PUBLIC_MANIFEST");
  ensure(publicManifest.schemaVersion === "reviewer-calibration-v4-production-bound-v3-public-manifest-1" && publicManifest.artifactId === "reviewer-calibration-v4-production-bound-v3", "PUBLIC_MANIFEST_IDENTITY");
  ensure(publicManifest.status === "AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY", "PUBLIC_MANIFEST_STATUS");
  ensure(publicManifest.authority.executionAuthorized === false && publicManifest.authority.evaluatorAuthorityGranted === false && publicManifest.authority.scoringAuthorityGranted === false && publicManifest.authority.resultAccessAuthorized === false, "PUBLIC_MANIFEST_AUTHORITY");
  ensure(publicManifest.authority.reviewerCertificatesIssued === 0 && publicManifest.authority.activationCandidates === 0 && publicManifest.authority.activationAuditReports === 0 && publicManifest.authority.activationGrants === 0, "PUBLIC_MANIFEST_AUTHORITY_ZERO");
  ensure(publicManifest.hostileEvidence.structuralMutations === structural.cases && publicManifest.hostileEvidence.detectedStructuralMutations === structural.detected, "PUBLIC_MANIFEST_HOSTILE_COUNTS");
  ensure(publicManifest.hostileEvidence.semanticBypasses === semantic.cases && publicManifest.hostileEvidence.rejectedSemanticBypasses === semantic.rejected, "PUBLIC_MANIFEST_HOSTILE_COUNTS");
  ensure(publicManifest.hostileEvidence.structuralDigestSha256 === structural.digest && publicManifest.hostileEvidence.semanticDigestSha256 === semantic.digest, "PUBLIC_MANIFEST_HOSTILE_DIGESTS");
  ensure(publicManifest.upstreams.length === UPSTREAMS.length, "PUBLIC_MANIFEST_UPSTREAMS");
  for (let i = 0; i < UPSTREAMS.length; i += 1) ensure(publicManifest.upstreams[i].id === UPSTREAMS[i][0] && publicManifest.upstreams[i].path === UPSTREAMS[i][1] && publicManifest.upstreams[i].sha256 === UPSTREAMS[i][2], "PUBLIC_MANIFEST_UPSTREAM_PIN", `${i}`);
  ensure(same(publicManifest.packageFiles.map(({ path }) => path), PACKAGE_CORE_FILES), "PUBLIC_MANIFEST_PACKAGE_FILES");
  for (const entry of publicManifest.packageFiles) {
    const target = resolve(PKG_DIR, entry.path);
    ensure(statSync(target).size === entry.bytes && sha256File(target) === entry.sha256, "PUBLIC_MANIFEST_PACKAGE_HASH", entry.path);
  }
  ensure(allZero(publicManifest.activity), "PUBLIC_MANIFEST_ACTIVITY");
  const manifestRows = parseManifest(manifestPath);
  const expectedManifestFiles = [...PACKAGE_CORE_FILES, "public-manifest.json"].sort();
  ensure(same(manifestRows.map(({ path }) => path), expectedManifestFiles), "PACKAGE_MANIFEST_FILE_LIST");
  for (const row of manifestRows) ensure(sha256File(resolve(PKG_DIR, row.path)) === row.sha256, "PACKAGE_MANIFEST_HASH", row.path);
  return {
    status: "SEALED_AUTHOR_EVIDENCE_PENDING_FRESH_AUDIT",
    publicManifestPresent: true,
    manifestPresent: true,
    packageFilesRehashed: manifestRows.length,
    publicManifestSha256: sha256File(publicPath),
    manifestSha256: sha256File(manifestPath)
  };
}

function main() {
  const baseline = {
    protocol: readJsonStrict(resolve(PKG_DIR, "protocol.json"), "PROTOCOL"),
    registries: readJsonStrict(resolve(PKG_DIR, "registries.json"), "REGISTRIES"),
    schemas: readJsonStrict(resolve(PKG_DIR, "event-schemas.json"), "SCHEMAS"),
    hostile: readJsonStrict(resolve(PKG_DIR, "hostile-fixtures.json"), "HOSTILE")
  };
  validateBundle(baseline);
  const lineage = verifyUpstreams(baseline.protocol);
  const structural = runStructuralMutations(baseline);
  const semantic = runSemanticBypasses(baseline);
  const packageIntegrity = verifyOwnPackage(structural, semantic);
  const caseDigestSha256 = sha256Bytes([structural.digest, semantic.digest].join("\n"));
  const result = {
    artifactId: "reviewer-calibration-v4-production-bound-v3",
    disposition: "AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY",
    subjectOnlyAuthorEvidence: true,
    independentAuditCompletedInThisArtifact: false,
    blockerClosureEvidence: Object.fromEntries(Object.keys(BLOCKER_CLOSURES).map((code) => [code, "STRUCTURE_AND_EXECUTABLE_HOSTILE_CHECKED"])),
    lineage,
    hostile: {
      structuralMutations: structural.cases,
      detectedStructuralMutations: structural.detected,
      structuralDigestSha256: structural.digest,
      semanticBypasses: semantic.cases,
      rejectedSemanticBypasses: semantic.rejected,
      semanticDigestSha256: semantic.digest,
      caseDigestSha256
    },
    packageIntegrity,
    currentAuthority: {
      executionAuthorized: false,
      evaluatorAuthorityGranted: false,
      scoringAuthorityGranted: false,
      resultAccessAuthorized: false,
      reviewerCertificatesIssued: 0,
      activationCandidates: 0,
      activationAuditReports: 0,
      activationGrants: 0
    },
    activity: {
      privateReads: 0,
      itemAnswerGoldRevealReadsOrWrites: 0,
      actorReadsOrWrites: 0,
      environmentOrSecretReads: 0,
      networkCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      databaseCalls: 0,
      ledgerReadsOrWrites: 0,
      questionGeneration: 0
    }
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
