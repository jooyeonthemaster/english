import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CANONICALIZATION_VERSION,
  CANONICAL_PROFILES,
  canonicalizeJcs,
  canonicalPayloadFrame,
  canonicalPayloadFromStrictJson,
  parseStrictJson,
  validateCanonicalPayloadDigest
} from "./canonicalize.mjs";
import {
  FINGERPRINT_COMPONENT_FIELDS,
  FINGERPRINT_DERIVATION_VERSION,
  FINGERPRINT_FAMILY_BY_TYPE,
  deriveFingerprintBundle,
  deriveSlotFingerprintProof,
  validateSlotFingerprintBinding,
  validateFingerprintBundle
} from "./fingerprint.mjs";
import {
  CANONICAL_FAMILY_BY_TYPE,
  COVERAGE_BINDING_VERSION,
  IDENTITY_BINDING_VERSION,
  POLICY_BINDING_VERSION,
  RESOURCE_CLASSES,
  ROLES,
  STATES,
  createEmptyIdentityRegistry,
  createIdentityCustodianAttestation,
  deriveStablePrincipalBinding,
  materializationRecordRoot,
  recomputeCoverageEvidence,
  registerPrincipalBinding,
  sealIdentityRegistry,
  sealPolicyRegistry,
  validateAuthorizationAgainstPolicy,
  validateCertificateCandidateGrantCoverage,
  validateDenialAgainstPolicy,
  validateGrantAgainstSealedPolicy,
  validatePrincipalRoleSeparation,
  validateRoleAssignmentIdentity
} from "./semantics.mjs";

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
const HASH = /^[0-9a-f]{64}$/;
const ZERO_HASH = "0".repeat(64);

class VerificationError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

function ensure(condition, code, detail = "") {
  if (!condition) throw new VerificationError(code, detail);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function makeHash(seed) {
  return sha256Bytes(Buffer.from(`NARA-QCAL-V4-SYNTHETIC:${seed}`, "utf8"));
}

function clone(value) {
  return structuredClone(value);
}

function same(left, right) {
  return canonicalizeJcs(left) === canonicalizeJcs(right);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function repoPath(repoRelativePath) {
  ensure(typeof repoRelativePath === "string" && repoRelativePath.length > 0, "PATH_EMPTY");
  ensure(!isAbsolute(repoRelativePath), "PATH_ABSOLUTE", repoRelativePath);
  const target = resolve(REPO_ROOT, repoRelativePath);
  const rel = relative(REPO_ROOT, target);
  ensure(rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`), "PATH_ESCAPE", repoRelativePath);
  return target;
}

function readJsonStrict(path, code) {
  try {
    return parseStrictJson(readFileSync(path, "utf8"));
  } catch (error) {
    throw new VerificationError(`${code}_${error.code ?? "PARSE"}`, error.message);
  }
}

function uint64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function framedHash(domain, value) {
  const payload = Buffer.from(typeof value === "string" ? value : canonicalizeJcs(value), "utf8");
  return sha256Bytes(Buffer.concat([Buffer.from(domain, "utf8"), uint64(payload.length), payload]));
}

const TYPES = Object.freeze([
  "BLANK_INFERENCE", "GRAMMAR_ERROR", "GRAMMAR_CHOICE_COMBO", "VOCAB_CHOICE", "SENTENCE_ORDER",
  "SENTENCE_INSERT", "TOPIC", "MAIN_IDEA", "TITLE", "IMPLIED_MEANING", "REFERENCE", "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC", "IRRELEVANT", "CONDITIONAL_WRITING", "SENTENCE_TRANSFORM", "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE", "SUMMARY_WRITING", "WORD_ORDER", "TOPIC_SENTENCE_WRITING", "GRAMMAR_CORRECTION",
  "CONTEXT_MEANING", "SYNONYM", "ANTONYM"
]);

const FOCUS_TYPES = Object.freeze(["GRAMMAR_ERROR", "BLANK_INFERENCE"]);
const FRESH_BLOCKERS = Object.freeze([
  "V3-B1B2-ACTOR_IDENTITY_ALIAS_NOT_MATERIALLY_BOUND",
  "V3-B3-PASSED_EVENT_NOT_BOUND_TO_MATERIALIZED_SLOT",
  "V3-B4-CANONICAL_BYTES_HASH_DOMAIN_UNDEFINED",
  "V3-B6-FINGERPRINTS_NOT_DERIVED_FROM_COMMITTED_CONTENT",
  "V3-B7-POLICY_MATRIX_OMITS_ALLOWED_ROLES",
  "V3-B7-GRANT_NOT_BOUND_TO_NONEMPTY_POLICY_STATE"
]);

const EXPECTED_UPSTREAMS = Object.freeze([
  ["predecessor-v3-subject-manifest", "39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6"],
  ["predecessor-v3-independent-fail-audit-manifest", "d9f8256c9307a47e3ee11408b895f59d0047581058d5f82fa01107d5432adea5"],
  ["predecessor-v2-subject-manifest", "10801e127bb612e2bb6909acf857ff6fa2ef0cac667a0fd7e4e39f774e656413"],
  ["predecessor-v2-independent-fail-audit-manifest", "f78ba69b164f737b6531c2e7415bd26cf147afc6012265a13a8434882b891bc5"],
  ["evaluation-authority-v2-public-manifest", "c62fb02e27b0342ce31fe8fc38ec32034738bfe2ddadec9fe2861a1ae8e614bd"],
  ["evaluation-authority-v2-subject-manifest", "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180"],
  ["evaluation-authority-v2-independent-audit-manifest", "0cdf9d676bdec820e728a3b3890237b3b80d201caa2c20afc7af46ed6482adf5"],
  ["production-type-binding-v4-subject-manifest", "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04"],
  ["production-type-binding-v4-independent-audit-manifest", "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d"],
  ["reviewer-calibration-v3-replacement-v1-protocol", "4c27307bf83586a5ffb5301f4aaa6915ca5da8ec4e985f9a259185da8495e162"],
  ["reviewer-calibration-v3-replacement-v1-manifest", "ea73ff0796f73065f701a294c5ee3b768a9f8ff8d8ffb79979fbe72abe64ba64"]
]);

function verifyManifestRows(manifestPath) {
  const base = dirname(manifestPath);
  const rows = readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean);
  let safeRows = 0;
  let refusedRows = 0;
  for (const row of rows) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(row);
    ensure(Boolean(match), "UPSTREAM_MANIFEST_ROW", row);
    const rowName = match[2].replace(/\\/g, "/");
    if (rowName === "private/.gitignore" || rowName.startsWith("private/")) {
      refusedRows += 1;
      continue;
    }
    ensure(!isAbsolute(rowName) && !rowName.split("/").includes(".."), "UPSTREAM_MANIFEST_PATH", rowName);
    const manifestRelativeTarget = resolve(base, rowName);
    const repoRelativeTarget = resolve(REPO_ROOT, rowName);
    const target = existsSync(manifestRelativeTarget) ? manifestRelativeTarget : repoRelativeTarget;
    const rel = relative(REPO_ROOT, target);
    ensure(rel !== ".." && !rel.startsWith(`..${sep}`), "UPSTREAM_MANIFEST_ESCAPE", rowName);
    ensure(existsSync(target) && statSync(target).isFile(), "UPSTREAM_MANIFEST_FILE", rowName);
    ensure(sha256File(target) === match[1], "UPSTREAM_MANIFEST_HASH", rowName);
    safeRows += 1;
  }
  return { rows: rows.length, safeRows, refusedRows };
}

function verifyLineage(protocol) {
  ensure(protocol.upstreams.length === EXPECTED_UPSTREAMS.length, "UPSTREAM_COUNT");
  let manifestRows = 0;
  let safeManifestRows = 0;
  let forbiddenRowsRefused = 0;
  for (let index = 0; index < EXPECTED_UPSTREAMS.length; index += 1) {
    const upstream = protocol.upstreams[index];
    const [id, digest] = EXPECTED_UPSTREAMS[index];
    ensure(upstream.id === id && upstream.sha256 === digest, "UPSTREAM_PIN", id);
    ensure(upstream.grantsAuthority !== true, "UPSTREAM_AUTHORITY", id);
    const path = repoPath(upstream.path);
    ensure(existsSync(path) && statSync(path).isFile(), "UPSTREAM_MISSING", upstream.path);
    ensure(sha256File(path) === digest, "UPSTREAM_BYTES_DRIFT", id);
    if (path.endsWith("MANIFEST.sha256")) {
      const result = verifyManifestRows(path);
      manifestRows += result.rows;
      safeManifestRows += result.safeRows;
      forbiddenRowsRefused += result.refusedRows;
    }
  }

  const auditPath = repoPath("experiments/question-quality-20260715/reviews/reviewer-calibration-v4-production-bound-v3-independent-audit-v1/audit.json");
  ensure(sha256File(auditPath) === "679e0ead6ae9cae524b2f4072a78c34f523f70ecee7e50c8f3e3cfe695eac80d", "V3_AUDIT_JSON_PIN");
  const audit = readJsonStrict(auditPath, "V3_AUDIT");
  ensure(audit.verdict === "FAIL_BLOCKERS", "V3_AUDIT_VERDICT");
  ensure(JSON.stringify(audit.blockers.map(({ code }) => code)) === JSON.stringify(FRESH_BLOCKERS), "V3_AUDIT_BLOCKERS");
  ensure(audit.subject.manifestSha256 === EXPECTED_UPSTREAMS[0][1], "V3_AUDIT_SUBJECT_PIN");
  const bindingUpstream = protocol.upstreams.find(({ id }) => id === "production-type-binding-v4-subject-manifest");
  ensure(bindingUpstream.bindingJsonSha256 === "47df395f54179538d27a714ac0df4dc9e82f04b767bc82f45b8473c38d04cc3d" && bindingUpstream.snapshotSha256 === "d126aa316d8c1457d71989441a49d7ca93676687b2032a738d4ea71cd6531967", "TYPE_BINDING_AUXILIARY_PINS");
  const bindingPath = repoPath("experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4/binding.json");
  ensure(sha256File(bindingPath) === bindingUpstream.bindingJsonSha256, "TYPE_BINDING_JSON_PIN");
  const binding = readJsonStrict(bindingPath, "TYPE_BINDING");
  ensure(JSON.stringify(binding.canonicalUniverse.uiTypeIdsInOrder) === JSON.stringify(TYPES), "TYPE_BINDING_UNIVERSE");
  ensure(binding.semanticDigests.canonicalBindingSha256 === "433d72598f123a19950b57e4684d0ba004031d3beb0860fc5d5d226ddcf8022b", "TYPE_BINDING_SEMANTIC_DIGEST");
  const typeAuditPath = repoPath("experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1/audit.json");
  const typeAudit = readJsonStrict(typeAuditPath, "TYPE_BINDING_AUDIT");
  ensure(typeAudit.verdict === "PASS_NO_BLOCKERS" && typeAudit.blockers.length === 0 && typeAudit.subject.manifestSha256 === EXPECTED_UPSTREAMS[7][1], "TYPE_BINDING_AUDIT_VERDICT");
  const evaluationPublic = readJsonStrict(repoPath("experiments/question-quality-20260715/design/evaluation-authority-v2/public-manifest.json"), "EVALUATION_PUBLIC");
  ensure(Array.isArray(evaluationPublic.upstreams) && evaluationPublic.upstreams.length === 10, "EVALUATION_NESTED_UPSTREAM_COUNT");
  let evaluationNestedManifestRows = 0;
  let evaluationNestedSafeRows = 0;
  let evaluationNestedForbiddenRows = 0;
  for (const nested of evaluationPublic.upstreams) {
    ensure(HASH.test(nested.sha256) && nested.observedSha256 === nested.sha256, "EVALUATION_NESTED_PIN", nested.id);
    const nestedPath = repoPath(nested.path);
    ensure(existsSync(nestedPath) && statSync(nestedPath).isFile() && sha256File(nestedPath) === nested.sha256, "EVALUATION_NESTED_BYTES", nested.id);
    if (nestedPath.endsWith("MANIFEST.sha256")) {
      const result = verifyManifestRows(nestedPath);
      evaluationNestedManifestRows += result.rows;
      evaluationNestedSafeRows += result.safeRows;
      evaluationNestedForbiddenRows += result.refusedRows;
    }
  }
  ensure(evaluationNestedManifestRows === 24 && evaluationNestedSafeRows === 23 && evaluationNestedForbiddenRows === 1, "EVALUATION_NESTED_MANIFEST_COUNTS");
  return {
    directUpstreamBytesRehashed: EXPECTED_UPSTREAMS.length,
    directManifestRowsRehashed: manifestRows,
    safeManifestRowsRehashed: safeManifestRows,
    forbiddenPrivateRowsRefusedUnopened: forbiddenRowsRefused,
    evaluationNestedUpstreamBytesRehashed: evaluationPublic.upstreams.length,
    evaluationNestedManifestRows,
    evaluationNestedSafeRowsRehashed: evaluationNestedSafeRows,
    evaluationNestedForbiddenPrivateRowsRefusedUnopened: evaluationNestedForbiddenRows,
    productionTypeBindingSnapshotSha256: bindingUpstream.snapshotSha256,
    productionTypeBindingJsonSha256: bindingUpstream.bindingJsonSha256,
    productionTypeBindingSemanticSha256: binding.semanticDigests.canonicalBindingSha256
  };
}

function assertZeroActivity(activity, code) {
  ensure(activity && typeof activity === "object" && !Array.isArray(activity), code);
  for (const [key, value] of Object.entries(activity)) ensure(value === 0, code, `${key}=${value}`);
}

function verifyStatic(protocol, registries, schema, hostile) {
  ensure(protocol.artifactId === "reviewer-calibration-v4-production-bound-v4", "PROTOCOL_ARTIFACT");
  ensure(protocol.status === "DESIGN_ONLY_UNISSUED_EXECUTION_BLOCKED_PENDING_FRESH_AUDIT", "PROTOCOL_STATUS");
  ensure(protocol.authorEvidenceDisposition.includes("FRESH_INDEPENDENT_AUDIT_REQUIRED"), "PROTOCOL_DISPOSITION");
  ensure(protocol.permanentDesignBoundary.thisArtifactTransitions === false, "PROTOCOL_TRANSITION");
  for (const key of ["issued", "executionAuthorized", "evaluatorAuthorityGranted", "scoringAuthorityGranted", "resultAccessAuthorized", "generationAuthorized"])
    ensure(protocol.permanentDesignBoundary[key] === false, "PROTOCOL_ZERO_AUTHORITY", key);
  for (const key of ["reviewerCertificatesIssued", "authorizedReviewers", "authorizedAdjudicators", "activationCandidates", "activationAuditReports", "activationGrants"])
    ensure(protocol.permanentDesignBoundary[key] === 0, "PROTOCOL_ZERO_COUNTER", key);
  assertZeroActivity(protocol.publicOnlyBoundary.activity, "PROTOCOL_ZERO_ACTIVITY");
  ensure(JSON.stringify(protocol.typeUniverse.uiTypeIdsInOrder) === JSON.stringify(TYPES), "TYPE_UNIVERSE");
  ensure(same(CANONICAL_FAMILY_BY_TYPE, FINGERPRINT_FAMILY_BY_TYPE) && JSON.stringify(Object.keys(CANONICAL_FAMILY_BY_TYPE)) === JSON.stringify(TYPES), "TYPE_FAMILY_IMPLEMENTATION_PARITY");
  ensure(JSON.stringify(protocol.coverageAndCertificatePolicy.focusOnlyCanonicalTypeIdsExact) === JSON.stringify(FOCUS_TYPES), "FOCUS_TYPES");
  ensure(JSON.stringify(protocol.coverageAndCertificatePolicy.all25CanonicalTypeIdsExact) === JSON.stringify(TYPES), "ALL25_TYPES");
  ensure(Object.keys(protocol.blockerClosureMap).sort().join(",") === ["B1","B2","B3","B4","B5","B6","B7","B8"].join(","), "B1_B8_CLOSURES");
  ensure(JSON.stringify(Object.keys(protocol.freshAuditBlockerClosureMap)) === JSON.stringify(FRESH_BLOCKERS), "FRESH_BLOCKER_CLOSURES");
  ensure(protocol.identityBindingPolicy.bindingVersion === IDENTITY_BINDING_VERSION, "IDENTITY_VERSION");
  ensure(protocol.fingerprintAndReplayPolicy.derivationVersion === FINGERPRINT_DERIVATION_VERSION, "FINGERPRINT_VERSION");
  ensure(protocol.resourceAccessPolicy.policyBindingVersion === POLICY_BINDING_VERSION, "POLICY_VERSION");
  ensure(protocol.canonicalPayloadPolicy.canonicalizationVersion === CANONICALIZATION_VERSION, "CANON_VERSION");

  const roleSet = new Set(ROLES);
  ensure(roleSet.size === ROLES.length && protocol.roles.roleEnum.length === ROLES.length, "ROLE_COUNT");
  ensure(protocol.roles.roleEnum.every((role) => roleSet.has(role)), "ROLE_ENUM");
  for (const row of protocol.resourceAccessPolicy.policyMatrix) {
    ensure(row.states.length > 0 && row.allow.length > 0 && row.deny.length > 0 && row.allowedRoles.length > 0 && row.deniedRoles.length > 0, "POLICY_ROW_NONEMPTY", row.phase);
    ensure(row.allowedRoles.every((role) => roleSet.has(role)) && row.deniedRoles.every((role) => roleSet.has(role)), "POLICY_ROW_ROLES", row.phase);
    ensure(new Set([...row.allowedRoles, ...row.deniedRoles]).size === ROLES.length, "POLICY_ROLE_PARTITION", row.phase);
    ensure(row.allowedRoles.every((role) => !row.deniedRoles.includes(role)), "POLICY_ROLE_OVERLAP", row.phase);
  }
  ensure(Object.keys(protocol.resourceAccessPolicy.stateDenySets).length === STATES.length, "STATE_DENY_COUNT");
  ensure(STATES.every((state) => protocol.resourceAccessPolicy.stateDenySets[state].length > 0), "STATE_DENY_NONEMPTY");
  const post = protocol.resourceAccessPolicy.policyMatrix.find(({ phase }) => phase === "POST_ACTIVATION_RESULT");
  ensure(same(post.deny, ["OUT_OF_SCOPE_S1_RESULT", "OTHER_RATER_IDENTITY", "RAW_HIDDEN_COMMITMENT", "REJECTION_SURPLUS_HISTORY", "RAW_PRIVATE_TRUSTED_GOLD"]), "POST_DENY_EXACT");

  ensure(registries.artifactId === protocol.artifactId && registries.status.includes("EMPTY"), "REGISTRIES_STATUS");
  ensure(registries.chainGenesis.nextEventOrdinal === 1 && registries.chainGenesis.eventCount === 0 && registries.chainGenesis.lastEventSha256 === ZERO_HASH, "CHAIN_GENESIS");
  ensure(registries.roleRegistry.assignedActorCount === 0 && registries.roleRegistry.actorRoleAssignments.length === 0 && registries.roleRegistry.principalRoleAssignments.length === 0, "ROLE_REGISTRY_EMPTY");
  ensure(registries.identityRegistry.principalCount === 0 && registries.identityRegistry.canonicalPseudonymCount === 0 && registries.identityRegistry.custodianAttestationCount === 0, "IDENTITY_REGISTRY_EMPTY");
  ensure(registries.identityRegistry.ready === false && registries.identityRegistry.sealed === false && registries.identityRegistry.registryRootSha256 === null, "IDENTITY_REGISTRY_UNREADY");
  ensure(registries.slotRegistry.materializedSlots === 0 && registries.slotRegistry.issuedSlots === 0, "SLOT_REGISTRY_EMPTY");
  ensure(registries.fingerprintRegistry.inputCommitmentRoots.length === 0 && registries.fingerprintRegistry.derivationProofEvents.length === 0 && registries.fingerprintRegistry.ready === false, "FP_REGISTRY_EMPTY");
  ensure(registries.coverageRegistry.passedCoverageEvents.length === 0 && registries.coverageRegistry.ready === false, "COVERAGE_REGISTRY_EMPTY");
  ensure(registries.policyRegistry.policyRows.length === 0 && registries.policyRegistry.policyTuples.length === 0 && registries.policyRegistry.ready === false && registries.policyRegistry.sealed === false, "POLICY_REGISTRY_EMPTY");
  ensure(registries.activationRegistry.authorityGranted === false && registries.activationRegistry.resultAccessAuthorized === false && registries.activationRegistry.activationGrantEvents.length === 0, "ACTIVATION_REGISTRY_EMPTY");
  ensure(registries.operationalState.currentState === "PRE_ACCESS_UNAUTHORIZED" && registries.operationalState.authorityGranted === false && registries.operationalState.executionAuthorized === false, "OPERATIONAL_STATE");
  for (const [key, value] of Object.entries(registries.operationalState)) if (typeof value === "number") ensure(value === 0, "OPERATIONAL_COUNTER", key);

  ensure(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "SCHEMA_DRAFT");
  ensure(schema.oneOf.length === 23 && Object.keys(schema["x-currentInstanceCounts"]).length === 23, "SCHEMA_BRANCH_COUNT");
  ensure(Object.values(schema["x-currentInstanceCounts"]).every((value) => value === 0), "SCHEMA_INSTANCE_COUNTS");
  ensure(schema["x-semanticConstraints"].length >= 25, "SCHEMA_SEMANTIC_CONSTRAINTS");
  for (const [kind, definition] of Object.entries({
    ACTIVATION_CANDIDATE: "activationCandidatePayload",
    ACTIVATION_CANDIDATE_AUDIT_REPORT: "activationCandidateAuditPayload",
    ACTIVATION_GRANT: "activationGrantPayload"
  })) ensure(JSON.stringify([...CANONICAL_PROFILES[kind].fields].sort()) === JSON.stringify([...schema.$defs[definition].required].sort()), "CANON_SCHEMA_FIELD_PARITY", kind);
  ensure(hostile.artifactId === protocol.artifactId && hostile.minimums.allMustBeDetectedOrRejected === true, "HOSTILE_SPEC");
  assertZeroActivity(hostile.activity, "HOSTILE_ZERO_ACTIVITY");
}

class SemanticCases {
  constructor() {
    this.rows = [];
    this.acceptedBaselines = 0;
  }

  accepts(id, fn) {
    try {
      ensure(fn() !== false, "SEM_BASELINE_FALSE", id);
      this.acceptedBaselines += 1;
    } catch (error) {
      throw new VerificationError("SEM_BASELINE_REJECTED", `${id}: ${error.code ?? error.message}`);
    }
  }

  rejects(id, fn, expectedCode = null) {
    let error = null;
    try { fn(); } catch (caught) { error = caught; }
    ensure(Boolean(error), "SEM_BYPASS_ACCEPTED", id);
    if (expectedCode) ensure(error.code === expectedCode, "SEM_WRONG_REJECTION", `${id}:${error.code}`);
    this.rows.push({ id, rejectionCode: error.code ?? error.name ?? "ERROR" });
  }

  denies(id, fn, expectedReason = null) {
    const result = fn();
    ensure(result && result.decision === "DENY", "SEM_DENIAL_NOT_PRODUCED", id);
    if (expectedReason) ensure(result.reasonCode === expectedReason, "SEM_DENIAL_REASON", `${id}:${result.reasonCode}`);
    this.rows.push({ id, rejectionCode: result.reasonCode });
  }

  result() {
    return {
      acceptedBaselines: this.acceptedBaselines,
      semanticBypasses: this.rows.length,
      rejectedSemanticBypasses: this.rows.length,
      semanticDigestSha256: sha256Bytes(Buffer.from(canonicalizeJcs(this.rows), "utf8"))
    };
  }
}

function runIdentityCases(cases) {
  const key = Buffer.from("4a".repeat(32), "hex");
  const custodianPrivateKey = `-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIHZRjPg5N4ZzLoDNSScVcMUyIrPP5jzzTX5gvy/49pzH\n-----END PRIVATE KEY-----\n`;
  const custodianPublicKey = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAet1PchkasCnjfDCeut2ntZs7UrIeQ9LtL/4LBCPLIow=\n-----END PUBLIC KEY-----\n`;
  const authorityNamespace = "nara.reviewer.production.v4";
  const custodian = deriveStablePrincipalBinding({ custodianKey: key, authorityNamespace, canonicalPrincipalSourceId: "custodian:independent:0001" });
  const subjectA = deriveStablePrincipalBinding({ custodianKey: key, authorityNamespace, canonicalPrincipalSourceId: "principal:authoritative:0001" });
  const subjectB = deriveStablePrincipalBinding({ custodianKey: key, authorityNamespace, canonicalPrincipalSourceId: "principal:authoritative:0002" });
  const subjectC = deriveStablePrincipalBinding({ custodianKey: key, authorityNamespace, canonicalPrincipalSourceId: "principal:authoritative:0003" });
  const aliasesA = ["reviewer-alias-0001", "reviewer-alias-0002"];
  const aliasesB = ["reviewer-alias-0003"];
  const registry = createEmptyIdentityRegistry({ trustedCustodianPublicKeysByPrincipal: { [custodian.principalCommitmentSha256]: custodianPublicKey } });
  const attestationA = createIdentityCustodianAttestation({ subjectBinding: subjectA, canonicalPseudonyms: aliasesA, custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  const attestationB = createIdentityCustodianAttestation({ subjectBinding: subjectB, canonicalPseudonyms: aliasesB, custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  cases.accepts("identity:register-a", () => registerPrincipalBinding(registry, { binding: subjectA, attestation: attestationA }).decision === "REGISTER");
  cases.accepts("identity:register-b", () => registerPrincipalBinding(registry, { binding: subjectB, attestation: attestationB }).decision === "REGISTER");
  cases.accepts("identity:aliases-same-principal", () => registry.principalByCanonicalPseudonym[aliasesA[0]] === subjectA.principalCommitmentSha256 && registry.principalByCanonicalPseudonym[aliasesA[1]] === subjectA.principalCommitmentSha256);

  cases.rejects("identity:case-normalized-alias-collision", () => createIdentityCustodianAttestation({
    subjectBinding: subjectA,
    canonicalPseudonyms: ["Reviewer-Alias-0099", "reviewer-alias-0099"],
    custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256,
    custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey
  }), "IDENTITY_PSEUDONYM_SET");
  cases.rejects("identity:self-attestation", () => createIdentityCustodianAttestation({
    subjectBinding: subjectA, canonicalPseudonyms: ["reviewer-alias-0098"],
    custodianPrincipalCommitmentSha256: subjectA.principalCommitmentSha256,
    custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey
  }), "IDENTITY_SELF_ATTESTATION");
  const collisionAttestation = createIdentityCustodianAttestation({ subjectBinding: subjectB, canonicalPseudonyms: [aliasesA[0]], custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  cases.denies("identity:pseudonym-collision", () => registerPrincipalBinding(registry, { binding: subjectB, attestation: collisionAttestation }), "IDENTITY_PSEUDONYM_COLLISION");
  ensure(registry.principalByCanonicalPseudonym[aliasesA[0]] === subjectA.principalCommitmentSha256, "IDENTITY_DENIAL_MUTATED_REGISTRY");

  const forgedBinding = { ...subjectC, principalCommitmentSha256: subjectA.principalCommitmentSha256 };
  const forgedAttestation = createIdentityCustodianAttestation({ subjectBinding: forgedBinding, canonicalPseudonyms: ["reviewer-alias-0010"], custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  cases.denies("identity:principal-multiple-sources", () => registerPrincipalBinding(registry, { binding: forgedBinding, attestation: forgedAttestation }), "IDENTITY_PRINCIPAL_TO_MULTIPLE_SOURCES");

  const signedC = createIdentityCustodianAttestation({ subjectBinding: subjectC, canonicalPseudonyms: ["reviewer-alias-0011"], custodianPrincipalCommitmentSha256: custodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  const forgedSignature = { ...signedC, signatureBase64: `${signedC.signatureBase64.slice(0, -4)}AAAA` };
  forgedSignature.attestationSha256 = framedHash("NARA-QCAL-V4-IDENTITY\u0000CUSTODIAN_ATTESTATION\u0000", {
    attestationVersion: forgedSignature.attestationVersion,
    authorityNamespace: forgedSignature.authorityNamespace,
    canonicalPseudonyms: forgedSignature.canonicalPseudonyms,
    canonicalSourceIdCommitmentSha256: forgedSignature.canonicalSourceIdCommitmentSha256,
    custodianPrincipalCommitmentSha256: forgedSignature.custodianPrincipalCommitmentSha256,
    custodianPublicKeySha256: forgedSignature.custodianPublicKeySha256,
    custodianRole: forgedSignature.custodianRole,
    principalCommitmentSha256: forgedSignature.principalCommitmentSha256,
    signatureAlgorithm: forgedSignature.signatureAlgorithm,
    signatureBase64: forgedSignature.signatureBase64,
    verdict: forgedSignature.verdict
  });
  cases.denies("identity:forged-custodian-signature", () => registerPrincipalBinding(registry, { binding: subjectC, attestation: forgedSignature }), "IDENTITY_ATTESTATION_SIGNATURE_INVALID");
  const untrustedCustodian = deriveStablePrincipalBinding({ custodianKey: key, authorityNamespace, canonicalPrincipalSourceId: "custodian:untrusted:0002" });
  const untrustedAttestation = createIdentityCustodianAttestation({ subjectBinding: subjectC, canonicalPseudonyms: ["reviewer-alias-0012"], custodianPrincipalCommitmentSha256: untrustedCustodian.principalCommitmentSha256, custodianRole: "IDENTITY_BINDING_CUSTODIAN", custodianPrivateKey });
  cases.denies("identity:untrusted-custodian", () => registerPrincipalBinding(registry, { binding: subjectC, attestation: untrustedAttestation }), "IDENTITY_UNTRUSTED_CUSTODIAN");

  const identityRoot = sealIdentityRegistry(registry);
  cases.accepts("identity:sealed-root", () => HASH.test(identityRoot));
  const assignmentA = {
    actorPseudonym: aliasesA[1], canonicalPseudonym: aliasesA[1], principalCommitmentSha256: subjectA.principalCommitmentSha256,
    identityCustodianAttestationSha256: attestationA.attestationSha256, identityRegistryRootSha256: identityRoot, role: "ITEM_AUTHOR"
  };
  cases.accepts("identity:role-assignment", () => validateRoleAssignmentIdentity(registry, assignmentA));
  for (const [index, mutation] of [
    { actorPseudonym: "reviewer-alias-0097" },
    { canonicalPseudonym: aliasesB[0] },
    { principalCommitmentSha256: subjectB.principalCommitmentSha256 },
    { identityCustodianAttestationSha256: attestationB.attestationSha256 },
    { identityRegistryRootSha256: makeHash("wrong-identity-root") },
    { role: "FAKE_ROLE" }
  ].entries()) cases.rejects(`identity:role-binding-mutation:${index}`, () => validateRoleAssignmentIdentity(registry, { ...assignmentA, ...mutation }));

  const incompatibility = { ITEM_AUTHOR: ["TRUSTED_GOLD_AUDITOR"], TRUSTED_GOLD_AUDITOR: ["ITEM_AUTHOR"] };
  cases.accepts("identity:separate-principals", () => validatePrincipalRoleSeparation([
    { principalCommitmentSha256: subjectA.principalCommitmentSha256, role: "ITEM_AUTHOR" },
    { principalCommitmentSha256: subjectB.principalCommitmentSha256, role: "TRUSTED_GOLD_AUDITOR" }
  ], incompatibility));
  cases.rejects("identity:alias-self-audit-principal-collision", () => validatePrincipalRoleSeparation([
    { actorPseudonym: aliasesA[0], principalCommitmentSha256: subjectA.principalCommitmentSha256, role: "ITEM_AUTHOR" },
    { actorPseudonym: aliasesA[1], principalCommitmentSha256: subjectA.principalCommitmentSha256, role: "TRUSTED_GOLD_AUDITOR" }
  ], incompatibility), "ROLE_PRINCIPAL_COLLISION");
  return { registry, identityRoot, subjectA, subjectB };
}

function makeCoverageFixture(typeIds) {
  const passedEventsBySha256 = {};
  const materializationsByEventSha256 = {};
  const passedMap = {};
  const materializationMap = {};
  typeIds.forEach((typeId, index) => {
    const materializationEventSha256 = makeHash(`materialization:${index}:${typeId}`);
    const passedEventSha256 = makeHash(`passed:${index}:${typeId}`);
    const phase = index % 2 === 0 ? "MAIN_CERTIFICATION" : "ACTIVATION_HOLDOUT";
    const prefix = phase === "MAIN_CERTIFICATION" ? "MC" : "AH";
    const block = typeId === "GRAMMAR_ERROR" ? "G" : typeId === "BLANK_INFERENCE" ? "B" : "N";
    const materialization = {
      eventSha256: materializationEventSha256,
      slotId: `${prefix}-${block}-${String(index + 1).padStart(2, "0")}`,
      canonicalTypeId: typeId,
      canonicalFamilyId: CANONICAL_FAMILY_BY_TYPE[typeId],
      phase,
      fingerprintCompositeSha256: makeHash(`fp:${index}`),
      fingerprintDerivationProofSha256: makeHash(`fp-proof:${index}`),
      eligible: true,
      terminalDecisionEventSha256: makeHash(`terminal-event:${index}`),
      terminalDecisionSha256: makeHash(`terminal:${index}`),
      terminalDecision: "PASS"
    };
    const event = {
      eventSha256: passedEventSha256,
      materializationEventSha256,
      materializationRecordRootSha256: materializationRecordRoot(materialization),
      materializationEligible: true,
      canonicalTypeId: typeId,
      canonicalFamilyId: materialization.canonicalFamilyId,
      phase: materialization.phase,
      slotId: materialization.slotId,
      fingerprintCompositeSha256: materialization.fingerprintCompositeSha256,
      fingerprintDerivationProofSha256: materialization.fingerprintDerivationProofSha256,
      terminalDecisionEventSha256: materialization.terminalDecisionEventSha256,
      terminalDecisionSha256: materialization.terminalDecisionSha256,
      uniqueAnswerCheckPassed: true,
      fatalChecksPassed: true,
      coverageVerdict: "PASS"
    };
    materializationsByEventSha256[materializationEventSha256] = materialization;
    passedEventsBySha256[passedEventSha256] = event;
    passedMap[typeId] = passedEventSha256;
    materializationMap[typeId] = materializationEventSha256;
  });
  const scopeEnum = typeIds.length === 2 ? "FOCUS_ONLY" : "ALL_25";
  const orderedEntries = typeIds.map((typeId) => {
    const event = passedEventsBySha256[passedMap[typeId]];
    return {
      canonicalTypeId: typeId,
      canonicalFamilyId: event.canonicalFamilyId,
      fingerprintCompositeSha256: event.fingerprintCompositeSha256,
      fingerprintDerivationProofSha256: event.fingerprintDerivationProofSha256,
      materializationEventSha256: event.materializationEventSha256,
      passedCoverageEventSha256: event.eventSha256,
      phase: event.phase,
      slotId: event.slotId,
      terminalDecisionEventSha256: event.terminalDecisionEventSha256,
      terminalDecisionSha256: event.terminalDecisionSha256
    };
  });
  const coverageMapRootSha256 = framedHash("NARA-QCAL-V4-COVERAGE-MAP\u0000", { bindingVersion: COVERAGE_BINDING_VERSION, orderedEntries });
  const coverageRecomputationRootSha256 = framedHash("NARA-QCAL-V4-COVERAGE-RECOMPUTATION\u0000", { bindingVersion: COVERAGE_BINDING_VERSION, coverageMapRootSha256, orderedEntries, scopeEnum });
  const evidence = {
    scopeEnum,
    canonicalTypeIds: [...typeIds],
    coverageCount: typeIds.length,
    passedCoverageEventSha256ByCanonicalType: passedMap,
    materializationEventSha256ByCanonicalType: materializationMap,
    coverageMapRootSha256,
    coverageRecomputationRootSha256
  };
  return { evidence, passedEventsBySha256, materializationsByEventSha256 };
}

function runCoverageCases(cases) {
  const fixture = makeCoverageFixture(TYPES);
  cases.accepts("coverage:all25-recomputed", () => recomputeCoverageEvidence(fixture.evidence, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES) === fixture.evidence.coverageRecomputationRootSha256);
  cases.accepts("coverage:certificate-candidate-grant-same-root", () => validateCertificateCandidateGrantCoverage({
    certificateEvidence: fixture.evidence, candidateEvidence: clone(fixture.evidence), grantEvidence: clone(fixture.evidence),
    passedEventsBySha256: fixture.passedEventsBySha256, materializationsByEventSha256: fixture.materializationsByEventSha256, expectedTypeIds: TYPES
  }) === fixture.evidence.coverageRecomputationRootSha256);

  for (const [index, typeId] of TYPES.entries()) {
    const eventHash = fixture.evidence.passedCoverageEventSha256ByCanonicalType[typeId];
    const bindingFields = ["slotId", "canonicalTypeId", "canonicalFamilyId", "phase", "fingerprintCompositeSha256", "fingerprintDerivationProofSha256", "terminalDecisionEventSha256", "terminalDecisionSha256"];
    for (const field of bindingFields) {
      const events = clone(fixture.passedEventsBySha256);
      events[eventHash][field] = field === "phase" ? "TAXONOMY_PILOT" : field === "canonicalFamilyId" ? "WRONG-FAMILY" : field.endsWith("Sha256") ? makeHash(`wrong:${index}:${field}`) : `wrong-${index}-${field}`;
      cases.rejects(`coverage:type-${index}:event-binding:${field}`, () => recomputeCoverageEvidence(fixture.evidence, events, fixture.materializationsByEventSha256, TYPES));
    }
    for (const field of ["slotId", "canonicalTypeId", "canonicalFamilyId", "phase", "fingerprintCompositeSha256", "fingerprintDerivationProofSha256", "eligible", "terminalDecisionEventSha256", "terminalDecisionSha256", "terminalDecision"]) {
      const materializations = clone(fixture.materializationsByEventSha256);
      const materialization = materializations[fixture.evidence.materializationEventSha256ByCanonicalType[typeId]];
      materialization[field] = field === "eligible" ? false : field === "terminalDecision" ? "FAIL" : field === "phase" ? "TAXONOMY_PILOT" : field === "canonicalFamilyId" ? "WRONG-FAMILY" : field.endsWith("Sha256") ? makeHash(`wrong-materialization:${index}:${field}`) : `wrong-materialization-${index}-${field}`;
      cases.rejects(`coverage:type-${index}:materialization-binding:${field}`, () => recomputeCoverageEvidence(fixture.evidence, fixture.passedEventsBySha256, materializations, TYPES));
    }
    const wrongMaterializationMap = clone(fixture.evidence);
    wrongMaterializationMap.materializationEventSha256ByCanonicalType[typeId] = makeHash(`wrong-materialization-map:${index}`);
    cases.rejects(`coverage:type-${index}:materialization-map`, () => recomputeCoverageEvidence(wrongMaterializationMap, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES));

    const missingPassed = clone(fixture.evidence);
    delete missingPassed.passedCoverageEventSha256ByCanonicalType[typeId];
    cases.rejects(`coverage:type-${index}:missing-pass-map-key`, () => recomputeCoverageEvidence(missingPassed, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES));

    const missingMaterialization = clone(fixture.evidence);
    delete missingMaterialization.materializationEventSha256ByCanonicalType[typeId];
    cases.rejects(`coverage:type-${index}:missing-materialization-map-key`, () => recomputeCoverageEvidence(missingMaterialization, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES));
  }

  const first = TYPES[2], second = TYPES[4];
  const reusedMaterialization = clone(fixture.evidence);
  reusedMaterialization.materializationEventSha256ByCanonicalType[second] = reusedMaterialization.materializationEventSha256ByCanonicalType[first];
  cases.rejects("coverage:reuse-one-materialization", () => recomputeCoverageEvidence(reusedMaterialization, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES));
  const materializations = clone(fixture.materializationsByEventSha256);
  const firstMat = materializations[fixture.evidence.materializationEventSha256ByCanonicalType[first]];
  const secondMat = materializations[fixture.evidence.materializationEventSha256ByCanonicalType[second]];
  secondMat.slotId = firstMat.slotId;
  const events = clone(fixture.passedEventsBySha256);
  events[fixture.evidence.passedCoverageEventSha256ByCanonicalType[second]].slotId = firstMat.slotId;
  events[fixture.evidence.passedCoverageEventSha256ByCanonicalType[second]].materializationRecordRootSha256 = materializationRecordRoot(secondMat);
  cases.rejects("coverage:reuse-one-slot", () => recomputeCoverageEvidence(fixture.evidence, events, materializations, TYPES));
  for (const field of ["coverageMapRootSha256", "coverageRecomputationRootSha256"]) {
    const evidence = { ...fixture.evidence, [field]: makeHash(`wrong-${field}`) };
    cases.rejects(`coverage:wrong-${field}`, () => recomputeCoverageEvidence(evidence, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, TYPES));
  }
  const focus = makeCoverageFixture(FOCUS_TYPES);
  cases.accepts("coverage:focus-two", () => recomputeCoverageEvidence(focus.evidence, focus.passedEventsBySha256, focus.materializationsByEventSha256, FOCUS_TYPES));
  const falseFocus = makeCoverageFixture(["TOPIC", "MAIN_IDEA"]);
  cases.rejects("coverage:false-focus-two-types", () => recomputeCoverageEvidence(falseFocus.evidence, falseFocus.passedEventsBySha256, falseFocus.materializationsByEventSha256, ["TOPIC", "MAIN_IDEA"]), "COVERAGE_SCOPE_TYPES");
  const reorderedTypes = [...TYPES].reverse();
  cases.rejects("coverage:caller-controlled-all25-order", () => recomputeCoverageEvidence(fixture.evidence, fixture.passedEventsBySha256, fixture.materializationsByEventSha256, reorderedTypes), "COVERAGE_SCOPE_TYPES");
  return fixture;
}

function fingerprintInputs(index) {
  return {
    fullText: `Case ${index} presents eight deliberately separated tokens for deterministic fingerprint testing and another distinct tail ${index}.`,
    visibleSurface: `Visible surface ${index}: students compare a precise option with three plausible distractors.`,
    surfaceTemplate: "Passage [STEM] then options [A] [B] [C] [D] [E]",
    topicTags: [`topic-${index}`, "assessment-design"],
    scenarioEntities: [{ entityType: "student", entityId: `student-${index}`, role: "solver" }],
    authorPrincipalCommitmentSha256: makeHash(`fp-author:${index}`),
    canonicalTypeId: TYPES[index % TYPES.length],
    canonicalFamilyId: FINGERPRINT_FAMILY_BY_TYPE[TYPES[index % TYPES.length]],
    rotationEpoch: 1 + (index % 5)
  };
}

function runFingerprintCases(cases) {
  for (let index = 0; index < 80; index += 1) {
    const inputs = fingerprintInputs(index);
    const claimed = deriveFingerprintBundle(inputs);
    cases.accepts(`fingerprint:baseline:${index}`, () => validateFingerprintBundle(inputs, claimed));
    const phase = ["TAXONOMY_PILOT", "MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"][index % 3];
    const prefix = phase === "TAXONOMY_PILOT" ? "TP" : phase === "MAIN_CERTIFICATION" ? "MC" : "AH";
    const block = inputs.canonicalTypeId === "GRAMMAR_ERROR" ? "G" : inputs.canonicalTypeId === "BLANK_INFERENCE" ? "B" : "N";
    const slotBinding = {
      slotId: `${prefix}-${block}-${String((index % 8) + 1).padStart(2, "0")}`,
      phase,
      itemAuthorPrincipalCommitmentSha256: inputs.authorPrincipalCommitmentSha256,
      canonicalTypeId: inputs.canonicalTypeId,
      canonicalFamilyId: inputs.canonicalFamilyId,
      rotationEpoch: inputs.rotationEpoch,
      fingerprintInputCommitmentRootSha256: claimed.inputCommitmentRootSha256,
      fingerprintCompositeSha256: claimed.components.compositeFingerprintSha256,
      fingerprintDerivationProofSha256: ""
    };
    slotBinding.fingerprintDerivationProofSha256 = deriveSlotFingerprintProof({ slotId: slotBinding.slotId, phase, bundle: claimed });
    cases.accepts(`fingerprint:slot-binding:${index}`, () => validateSlotFingerprintBinding(inputs, claimed, slotBinding));
    for (const field of Object.keys(slotBinding)) {
      const mutated = clone(slotBinding);
      mutated[field] = field === "rotationEpoch" ? mutated[field] + 1
        : field === "canonicalFamilyId" ? (inputs.canonicalFamilyId === "NF-F1-GLOBAL_MEANING_SELECTION" ? "NF-F2-LOCAL_INFERENCE_AND_REFERENCE" : "NF-F1-GLOBAL_MEANING_SELECTION")
          : field === "canonicalTypeId" ? TYPES[(index + 1) % TYPES.length]
            : field === "phase" ? (phase === "TAXONOMY_PILOT" ? "MAIN_CERTIFICATION" : "TAXONOMY_PILOT")
              : field === "slotId" ? `${prefix}-${block === "G" ? "B" : "G"}-99`
                : makeHash(`wrong-slot-binding:${index}:${field}`);
      cases.rejects(`fingerprint:slot-binding-mutation:${index}:${field}`, () => validateSlotFingerprintBinding(inputs, claimed, mutated));
    }
    for (const field of FINGERPRINT_COMPONENT_FIELDS) {
      const mutated = clone(claimed);
      mutated.components[field] = makeHash(`component-mutation:${index}:${field}`);
      cases.rejects(`fingerprint:component:${index}:${field}`, () => validateFingerprintBundle(inputs, mutated), "FP_COMPONENT_MISMATCH");
    }
    for (const field of Object.keys(claimed.inputCommitments)) {
      const mutated = clone(claimed);
      mutated.inputCommitments[field] = typeof mutated.inputCommitments[field] === "number" ? mutated.inputCommitments[field] + 1 : mutated.inputCommitments[field] === null ? "forged-family" : `${mutated.inputCommitments[field]}x`;
      cases.rejects(`fingerprint:input-commitment:${index}:${field}`, () => validateFingerprintBundle(inputs, mutated), "FP_INPUT_COMMITMENT_MISMATCH");
    }
    const actualMutations = [
      { fullText: `${inputs.fullText} changed` },
      { visibleSurface: `${inputs.visibleSurface} changed` },
      { authorPrincipalCommitmentSha256: makeHash(`changed-author:${index}`) },
      { canonicalTypeId: TYPES[(index + 1) % TYPES.length] },
      { rotationEpoch: inputs.rotationEpoch + 1 }
    ];
    actualMutations.forEach((mutation, ordinal) => cases.rejects(`fingerprint:actual-input:${index}:${ordinal}`, () => validateFingerprintBundle({ ...inputs, ...mutation }, claimed)));
  }
  const base = fingerprintInputs(999);
  const equivalent = { ...base, fullText: `  ${base.fullText.toUpperCase().replaceAll(" ", "  ")}  ` };
  const a = deriveFingerprintBundle(base), b = deriveFingerprintBundle(equivalent);
  cases.accepts("fingerprint:normalized-full-text-component-stable", () => a.components.normalizedFullTextSha256 === b.components.normalizedFullTextSha256);
  cases.accepts("fingerprint:raw-input-root-detects-malleation", () => a.inputCommitmentRootSha256 !== b.inputCommitmentRootSha256 && a.components.compositeFingerprintSha256 !== b.components.compositeFingerprintSha256);
  cases.rejects("fingerprint:arbitrary-unique-bundle-on-same-surface", () => {
    const forged = clone(a);
    for (const field of FINGERPRINT_COMPONENT_FIELDS) forged.components[field] = makeHash(`arbitrary:${field}`);
    validateFingerprintBundle(base, forged);
  });
}

function policyRows(protocol) {
  return protocol.resourceAccessPolicy.policyMatrix.flatMap((row) => row.states.map((state) => ({
    phase: row.phase,
    state,
    allowResources: [...row.allow],
    denyResources: [...row.deny],
    allowedRoles: [...row.allowedRoles],
    deniedRoles: [...row.deniedRoles]
  })));
}

function makePolicyRegistry(protocol) {
  const rows = policyRows(protocol);
  const resourceProofs = rows.flatMap((row) => RESOURCE_CLASSES.map((resourceClass) => ({
    phase: row.phase, state: row.state, resourceClass, sha256: makeHash(`resource-proof:${row.phase}:${row.state}:${resourceClass}`)
  })));
  const stateTransitionProofs = STATES.slice(1).map((state, index) => ({
    from: STATES[index], to: state, sha256: makeHash(`transition:${STATES[index]}:${state}`)
  }));
  return sealPolicyRegistry({
    policyRows: rows,
    stateDenySets: clone(protocol.resourceAccessPolicy.stateDenySets),
    resourceProofs,
    stateTransitionProofs,
    postActivationScope: { phase: "POST_ACTIVATION_RESULT", state: "ACTIVATION_GRANTED", scope: "S1_RESULT_SCOPE_BOUND", proofSha256: makeHash("post-scope") }
  });
}

function makeCandidateAuditGrant(coverage, policyRegistry) {
  const h = (name) => makeHash(`activation:${name}`);
  const candidatePayload = {
    profile: CANONICAL_PROFILES.ACTIVATION_CANDIDATE.profile,
    stateBefore: "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE",
    stateAfter: "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
    candidateAuthorPrincipalCommitmentSha256: h("candidate-author"),
    designManifestSha256: h("design-manifest"),
    evaluationAuthorityManifestSha256: EXPECTED_UPSTREAMS[5][1],
    productionTypeBindingManifestSha256: EXPECTED_UPSTREAMS[7][1],
    reviewerCertificateSha256s: [h("certificate-1"), h("certificate-2")],
    reviewerPrincipalCommitmentSha256s: [h("reviewer-1"), h("reviewer-2")],
    reviewerCertificateScopeEnums: ["ALL_25", "ALL_25"],
    requestedCoverageEvidence: clone(coverage.evidence),
    coverageRecomputationRootSha256: coverage.evidence.coverageRecomputationRootSha256,
    freshAdjudicatorBindingSha256: h("fresh-adjudicator"),
    allPhaseSealRootSha256: h("all-phase-seal"),
    zeroPreauthorityResultAccessProofSha256: h("zero-access"),
    identityRegistryRootSha256: h("identity-registry"),
    policyDesignContractSha256: policyRegistry.policyDesignContractSha256,
    authorityGranted: false,
    resultAccessAuthorized: false
  };
  const candidateCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_CANDIDATE", candidatePayload).sha256;
  const auditPayload = {
    profile: CANONICAL_PROFILES.ACTIVATION_CANDIDATE_AUDIT_REPORT.profile,
    stateBefore: "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
    stateAfter: "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
    auditorPrincipalCommitmentSha256: h("auditor"),
    candidateEventSha256: h("candidate-event"),
    candidateCanonicalBytesSha256,
    candidateAuthorPrincipalCommitmentSha256: candidatePayload.candidateAuthorPrincipalCommitmentSha256,
    roleRegistrySha256: h("role-registry"),
    identityRegistryRootSha256: candidatePayload.identityRegistryRootSha256,
    artifactAuthorshipRegistrySha256: h("authorship-registry"),
    auditorRoleExclusionProofSha256: h("auditor-role-exclusion"),
    auditorArtifactAuthorshipExclusionProofSha256: h("auditor-artifact-exclusion"),
    coverageRecomputationRootSha256: coverage.evidence.coverageRecomputationRootSha256,
    auditInputRootSha256: h("audit-input"),
    verdict: "PASS_NO_BLOCKERS",
    authorityGranted: false,
    resultAccessAuthorized: false
  };
  const candidateAuditCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_CANDIDATE_AUDIT_REPORT", auditPayload).sha256;
  const grantPayload = {
    profile: CANONICAL_PROFILES.ACTIVATION_GRANT.profile,
    stateBefore: "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
    stateAfter: "ACTIVATION_GRANTED",
    grantAuthorPrincipalCommitmentSha256: h("grant-author"),
    candidateEventSha256: auditPayload.candidateEventSha256,
    candidateCanonicalBytesSha256,
    candidateAuditReportSha256: h("audit-report"),
    candidateAuditCanonicalBytesSha256,
    candidateAuditManifestSha256: h("audit-manifest"),
    candidateAuditVerdict: "PASS_NO_BLOCKERS",
    grantedCoverageEvidence: clone(coverage.evidence),
    coverageRecomputationRootSha256: coverage.evidence.coverageRecomputationRootSha256,
    sealedPolicyRegistryRootSha256: policyRegistry.sealedPolicyRegistryRootSha256,
    ...policyRegistry.roots,
    policyRegistryReady: true,
    policyRegistrySealed: true,
    deterministicGrantProofSha256: h("grant-proof"),
    authorityGranted: true,
    resultAccessAuthorized: true
  };
  const grantCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_GRANT", grantPayload).sha256;
  const preexistingAuditRecord = {
    auditReportSha256: grantPayload.candidateAuditReportSha256,
    auditManifestSha256: grantPayload.candidateAuditManifestSha256,
    auditCanonicalBytesSha256: candidateAuditCanonicalBytesSha256,
    verdict: "PASS_NO_BLOCKERS",
    candidateEventSha256: grantPayload.candidateEventSha256,
    candidateCanonicalBytesSha256,
    candidateEventOrdinal: 100,
    auditReportEventOrdinal: 101,
    auditManifestRecordedOrdinal: 102,
    recordedBeforeGrant: true
  };
  return { candidatePayload, auditPayload, grantPayload, grantCanonicalBytesSha256, grantEventOrdinal: 103, preexistingAuditRecord };
}

function runCanonicalCases(cases, activation) {
  const kinds = [
    ["ACTIVATION_CANDIDATE", activation.candidatePayload],
    ["ACTIVATION_CANDIDATE_AUDIT_REPORT", activation.auditPayload],
    ["ACTIVATION_GRANT", activation.grantPayload]
  ];
  for (const [kind, payload] of kinds) {
    const frame = canonicalPayloadFrame(kind, payload);
    cases.accepts(`canonical:${kind}:digest`, () => validateCanonicalPayloadDigest(kind, payload, frame.sha256));
    const reversed = Object.fromEntries(Object.entries(payload).reverse());
    cases.accepts(`canonical:${kind}:key-order-invariant`, () => canonicalPayloadFrame(kind, reversed).sha256 === frame.sha256);
    for (const field of Object.keys(payload)) {
      const missing = clone(payload); delete missing[field];
      cases.rejects(`canonical:${kind}:missing:${field}`, () => canonicalPayloadFrame(kind, missing));
      const extra = { ...payload, [`unexpected_${field}`]: true };
      cases.rejects(`canonical:${kind}:extra:${field}`, () => canonicalPayloadFrame(kind, extra), "CANON_FIELD_SET");
    }
    cases.rejects(`canonical:${kind}:wrong-digest`, () => validateCanonicalPayloadDigest(kind, payload, makeHash(`wrong-digest:${kind}`)), "CANON_DIGEST_MISMATCH");
    const text = JSON.stringify(payload);
    const firstKey = Object.keys(payload)[0];
    const duplicate = text.replace("{", `{"${firstKey}":null,`);
    cases.rejects(`canonical:${kind}:duplicate-key`, () => canonicalPayloadFromStrictJson(kind, duplicate), "STRICT_JSON_DUPLICATE_KEY");
  }
  cases.rejects("canonical:unknown-kind", () => canonicalPayloadFrame("UNKNOWN_KIND", activation.candidatePayload), "CANON_UNKNOWN_KIND");
  cases.rejects("canonical:self-digest-field", () => canonicalPayloadFrame("ACTIVATION_CANDIDATE", { ...activation.candidatePayload, canonicalPayloadSha256: makeHash("self") }), "CANON_FIELD_SET");
  cases.rejects("canonical:trailing-json", () => parseStrictJson('{"a":1} trailing'), "STRICT_JSON_TRAILING_BYTES");
  cases.rejects("canonical:lone-surrogate", () => canonicalizeJcs({ value: "\ud800" }), "JCS_LONE_HIGH_SURROGATE");
  cases.rejects("canonical:nonfinite", () => canonicalizeJcs({ value: Number.NaN }), "JCS_NONFINITE_NUMBER");
  const sparse = []; sparse.length = 2; sparse[1] = "x";
  cases.rejects("canonical:sparse-array", () => canonicalizeJcs(sparse), "JCS_SPARSE_ARRAY");
  const cycle = {}; cycle.self = cycle;
  cases.rejects("canonical:cycle", () => canonicalizeJcs(cycle), "JCS_CYCLE");
  cases.accepts("canonical:number-negative-zero", () => canonicalizeJcs(-0) === "0");
  cases.accepts("canonical:utf16-property-order", () => canonicalizeJcs({ b: 1, a: 2 }) === '{"a":2,"b":1}');
}

function runPolicyGrantCases(cases, protocol, coverage, identity) {
  const policyRegistry = makePolicyRegistry(protocol);
  cases.accepts("policy:sealed-ready-nonempty", () => policyRegistry.ready && policyRegistry.sealed && policyRegistry.tupleCount > 0 && HASH.test(policyRegistry.sealedPolicyRegistryRootSha256));
  const assignments = [];
  for (const tuple of policyRegistry.tuples.filter(({ resourceDecision }) => resourceDecision === "ALLOW")) {
    const actorRole = tuple.allowedRoles[0];
    const principalCommitmentSha256 = makeHash(`policy-principal:${tuple.phase}:${tuple.state}:${tuple.resourceClass}:${actorRole}`);
    const roleAssignmentEventSha256 = makeHash(`policy-assignment:${tuple.phase}:${tuple.state}:${tuple.resourceClass}:${actorRole}`);
    assignments.push({ principalCommitmentSha256, role: actorRole, active: true, eventSha256: roleAssignmentEventSha256, identityRegistryRootSha256: identity.identityRoot });
    const resourceProof = policyRegistry.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
    const stateProof = policyRegistry.stateTransitionProofs.find((proof) => proof.to === tuple.state);
    const authorization = {
      phase: tuple.phase,
      currentState: tuple.state,
      resourceClass: tuple.resourceClass,
      actorPrincipalCommitmentSha256: principalCommitmentSha256,
      actorRole,
      activeRoleAssignmentEventSha256: roleAssignmentEventSha256,
      identityRegistryRootSha256: identity.identityRoot,
      sealedPolicyRegistryRootSha256: policyRegistry.sealedPolicyRegistryRootSha256,
      allowedRolesRootSha256: tuple.allowedRolesRootSha256,
      deniedRolesRootSha256: tuple.deniedRolesRootSha256,
      policyTupleSha256: tuple.policyTupleSha256,
      resourceClassPolicyProofSha256: resourceProof.sha256,
      stateTransitionEvidenceSha256: stateProof.sha256,
      policyMatrixRootSha256: policyRegistry.roots.policyMatrixRootSha256,
      allStateAllowRootSha256: policyRegistry.roots.allStateAllowRootSha256,
      allStateDenyRootSha256: policyRegistry.roots.allStateDenyRootSha256
    };
    cases.accepts(`policy:allow:${tuple.phase}:${tuple.resourceClass}`, () => validateAuthorizationAgainstPolicy({ policyRegistry, authorization, activeRoleAssignments: assignments }));
    cases.rejects(`policy:inactive-role:${tuple.phase}:${tuple.resourceClass}`, () => validateAuthorizationAgainstPolicy({ policyRegistry, authorization, activeRoleAssignments: assignments.map((entry) => entry.principalCommitmentSha256 === principalCommitmentSha256 ? { ...entry, active: false } : entry) }), "AUTH_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND");
    const deniedRole = tuple.deniedRoles[0];
    cases.rejects(`policy:denied-role:${tuple.phase}:${tuple.resourceClass}`, () => validateAuthorizationAgainstPolicy({ policyRegistry, authorization: { ...authorization, actorRole: deniedRole }, activeRoleAssignments: [...assignments, { principalCommitmentSha256, role: deniedRole, active: true, eventSha256: roleAssignmentEventSha256, identityRegistryRootSha256: identity.identityRoot }] }), "AUTH_ROLE_NOT_ALLOWED");
    for (const [field, value] of [
      ["activeRoleAssignmentEventSha256", makeHash(`wrong-assignment:${tuple.policyTupleSha256}`)],
      ["identityRegistryRootSha256", makeHash(`wrong-identity:${tuple.policyTupleSha256}`)],
      ["allowedRolesRootSha256", makeHash(`wrong-allowed:${tuple.policyTupleSha256}`)],
      ["deniedRolesRootSha256", makeHash(`wrong-denied:${tuple.policyTupleSha256}`)],
      ["policyTupleSha256", makeHash(`wrong-tuple:${tuple.policyTupleSha256}`)],
      ["resourceClassPolicyProofSha256", makeHash(`wrong-resource-proof:${tuple.policyTupleSha256}`)],
      ["stateTransitionEvidenceSha256", makeHash(`wrong-state-proof:${tuple.policyTupleSha256}`)]
    ]) cases.rejects(`policy:tuple-binding:${tuple.phase}:${tuple.resourceClass}:${field}`, () => validateAuthorizationAgainstPolicy({ policyRegistry, authorization: { ...authorization, [field]: value }, activeRoleAssignments: assignments }));
    for (const rootField of ["policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256"]) {
      cases.rejects(`policy:root:${tuple.phase}:${tuple.resourceClass}:${rootField}`, () => validateAuthorizationAgainstPolicy({ policyRegistry, authorization: { ...authorization, [rootField]: makeHash(`wrong:${rootField}`) }, activeRoleAssignments: assignments }), "AUTH_POLICY_ROOT_BINDING");
    }
  }

  for (const tuple of policyRegistry.tuples.filter(({ resourceDecision }) => resourceDecision === "DENY")) {
    const resourceProof = policyRegistry.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
    const denial = {
      phase: tuple.phase,
      currentState: tuple.state,
      resourceClass: tuple.resourceClass,
      actorPrincipalCommitmentSha256: makeHash(`denial-principal:${tuple.policyTupleSha256}`),
      actorRole: tuple.allowedRoles[0],
      identityRegistryRootSha256: identity.identityRoot,
      sealedPolicyRegistryRootSha256: policyRegistry.sealedPolicyRegistryRootSha256,
      policyMatrixRootSha256: policyRegistry.roots.policyMatrixRootSha256,
      allStateAllowRootSha256: policyRegistry.roots.allStateAllowRootSha256,
      allStateDenyRootSha256: policyRegistry.roots.allStateDenyRootSha256,
      allowedRolesRootSha256: tuple.allowedRolesRootSha256,
      deniedRolesRootSha256: tuple.deniedRolesRootSha256,
      policyTupleSha256: tuple.policyTupleSha256,
      policyDecisionProofSha256: resourceProof.sha256,
      capabilityTokenSha256: null,
      authorizationEventSha256: null,
      openedAtRfc3339: null,
      closedAtRfc3339: null,
      hasOpenConsumeOrClose: false,
      decision: "DENY"
    };
    cases.accepts(`policy:deny:${tuple.phase}:${tuple.resourceClass}`, () => validateDenialAgainstPolicy({ policyRegistry, denial }));
    for (const field of ["sealedPolicyRegistryRootSha256", "policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256", "allowedRolesRootSha256", "deniedRolesRootSha256", "policyTupleSha256", "policyDecisionProofSha256"]) {
      cases.rejects(`policy:denial-binding:${tuple.phase}:${tuple.resourceClass}:${field}`, () => validateDenialAgainstPolicy({ policyRegistry, denial: { ...denial, [field]: makeHash(`wrong-denial:${field}:${tuple.policyTupleSha256}`) } }));
    }
    cases.rejects(`policy:denial-created-capability:${tuple.phase}:${tuple.resourceClass}`, () => validateDenialAgainstPolicy({ policyRegistry, denial: { ...denial, capabilityTokenSha256: makeHash(`forbidden-capability:${tuple.policyTupleSha256}`) } }), "DENY_CAPABILITY_CREATED");
  }

  const emptyVariants = [
    { policyRows: [] },
    { stateDenySets: {} },
    { resourceProofs: [] },
    { stateTransitionProofs: [] },
    { postActivationScope: null }
  ];
  for (const [index, variant] of emptyVariants.entries()) cases.rejects(`policy:empty-component:${index}`, () => sealPolicyRegistry({ ...policyRegistry, ...variant }));

  const activation = makeCandidateAuditGrant(coverage, policyRegistry);
  cases.accepts("grant:sealed-policy-bound", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation }));
  cases.rejects("grant:wrong-policy-design-contract", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, candidatePayload: { ...activation.candidatePayload, policyDesignContractSha256: makeHash("wrong-policy-design") } }), "GRANT_POLICY_DESIGN_CONTRACT");
  for (const field of ["auditReportSha256", "auditManifestSha256", "auditCanonicalBytesSha256", "candidateEventSha256", "candidateCanonicalBytesSha256"]) {
    cases.rejects(`grant:preexisting-audit-record:${field}`, () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, preexistingAuditRecord: { ...activation.preexistingAuditRecord, [field]: makeHash(`wrong-audit-record:${field}`) } }));
  }
  cases.rejects("grant:audit-not-preexisting", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, preexistingAuditRecord: { ...activation.preexistingAuditRecord, recordedBeforeGrant: false } }), "GRANT_PREEXISTING_AUDIT_VERDICT");
  cases.rejects("grant:audit-record-not-pass", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, preexistingAuditRecord: { ...activation.preexistingAuditRecord, verdict: "FAIL_BLOCKERS" } }), "GRANT_PREEXISTING_AUDIT_VERDICT");
  cases.rejects("grant:audit-before-candidate-order", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, preexistingAuditRecord: { ...activation.preexistingAuditRecord, candidateEventOrdinal: 101, auditReportEventOrdinal: 100 } }), "GRANT_PREEXISTING_AUDIT_ORDER");
  cases.rejects("grant:manifest-not-before-grant", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, grantEventOrdinal: activation.preexistingAuditRecord.auditManifestRecordedOrdinal }), "GRANT_PREEXISTING_AUDIT_ORDER");
  for (const field of ["sealedPolicyRegistryRootSha256", ...Object.keys(policyRegistry.roots)]) {
    const grantPayload = { ...activation.grantPayload, [field]: makeHash(`wrong-grant:${field}`) };
    cases.rejects(`grant:policy-root:${field}`, () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: activation.candidatePayload, auditPayload: activation.auditPayload, preexistingAuditRecord: activation.preexistingAuditRecord }));
  }
  for (const [field, value] of [["policyRegistryReady", false], ["policyRegistrySealed", false], ["authorityGranted", false], ["resultAccessAuthorized", false]]) {
    cases.rejects(`grant:flag:${field}`, () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload: { ...activation.grantPayload, [field]: value }, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: activation.candidatePayload, auditPayload: activation.auditPayload, preexistingAuditRecord: activation.preexistingAuditRecord }));
  }
  cases.rejects("grant:candidate-authority-before-grant", () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload: activation.grantPayload, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: { ...activation.candidatePayload, authorityGranted: true }, auditPayload: activation.auditPayload, preexistingAuditRecord: activation.preexistingAuditRecord }), "GRANT_CANDIDATE_PREAUTHORITY");
  cases.rejects("grant:audit-authority-before-grant", () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload: activation.grantPayload, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: activation.candidatePayload, auditPayload: { ...activation.auditPayload, authorityGranted: true }, preexistingAuditRecord: activation.preexistingAuditRecord }), "GRANT_AUDIT_PREAUTHORITY");
  cases.rejects("grant:wrong-candidate-canonical-digest", () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload: { ...activation.grantPayload, candidateCanonicalBytesSha256: makeHash("wrong-candidate-canonical") }, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: activation.candidatePayload, auditPayload: activation.auditPayload, preexistingAuditRecord: activation.preexistingAuditRecord }), "GRANT_CANDIDATE_RECORD_BINDING");
  cases.rejects("grant:wrong-audit-canonical-digest", () => validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload: { ...activation.grantPayload, candidateAuditCanonicalBytesSha256: makeHash("wrong-audit-canonical") }, grantCanonicalBytesSha256: activation.grantCanonicalBytesSha256, grantEventOrdinal: activation.grantEventOrdinal, candidatePayload: activation.candidatePayload, auditPayload: activation.auditPayload, preexistingAuditRecord: activation.preexistingAuditRecord }), "GRANT_AUDIT_CANONICAL_RECORD_BINDING");
  cases.rejects("grant:wrong-grant-canonical-digest", () => validateGrantAgainstSealedPolicy({ policyRegistry, ...activation, grantCanonicalBytesSha256: makeHash("wrong-grant-canonical") }), "CANON_DIGEST_MISMATCH");
  const unready = { ...policyRegistry, ready: false };
  cases.rejects("grant:unready-policy", () => validateGrantAgainstSealedPolicy({ policyRegistry: unready, ...activation }), "GRANT_POLICY_UNREADY");
  const unsealed = { ...policyRegistry, sealed: false };
  cases.rejects("grant:unsealed-policy", () => validateGrantAgainstSealedPolicy({ policyRegistry: unsealed, ...activation }), "GRANT_POLICY_UNREADY");
  runCanonicalCases(cases, activation);
  return { policyRegistry, activation };
}

function makeTransaction() {
  const hashes = ["auth", "open", "consume", "close"].map(makeHash);
  const capability = makeHash("capability");
  const times = ["2026-07-16T00:00:00Z", "2026-07-16T00:00:01Z", "2026-07-16T00:00:01Z", "2026-07-16T00:00:02Z"];
  return [
    { eventKind: "AUTHORIZATION", transactionId: "tx-1", eventOrdinal: 10, priorEventSha256: makeHash("prior"), eventSha256: hashes[0], capabilityTokenSha256: capability, occurredAtRfc3339: times[0], authorizedAtRfc3339: times[0] },
    { eventKind: "OPEN", transactionId: "tx-1", eventOrdinal: 11, priorEventSha256: hashes[0], eventSha256: hashes[1], capabilityTokenSha256: capability, occurredAtRfc3339: times[1], openedAtRfc3339: times[1], authorizationEventSha256: hashes[0], authorizationEventOrdinal: 10, contentBytesReleasedBeforeOpenSeal: 0 },
    { eventKind: "CAPABILITY_CONSUME", transactionId: "tx-1", eventOrdinal: 12, priorEventSha256: hashes[1], eventSha256: hashes[2], capabilityTokenSha256: capability, occurredAtRfc3339: times[2], consumedAtRfc3339: times[2], authorizationEventSha256: hashes[0], openEventSha256: hashes[1], openEventOrdinal: 11, useOrdinal: 1, contentBytesReleasedBeforeConsumeSeal: 0 },
    { eventKind: "CLOSE", transactionId: "tx-1", eventOrdinal: 13, priorEventSha256: hashes[2], eventSha256: hashes[3], capabilityTokenSha256: capability, occurredAtRfc3339: times[3], closedAtRfc3339: times[3], authorizationEventSha256: hashes[0], openEventSha256: hashes[1], consumeEventSha256: hashes[2], consumeEventOrdinal: 12, authorizedAtRfc3339: times[0], openedAtRfc3339: times[1], consumedAtRfc3339: times[2] }
  ];
}

function validateTransaction(events, issuedCapabilities = new Set(), consumedCapabilities = new Set()) {
  ensure(events.length === 4, "TX_COUNT");
  ensure(JSON.stringify(events.map(({ eventKind }) => eventKind)) === JSON.stringify(["AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"]), "TX_SEQUENCE");
  const [auth, open, consume, close] = events;
  for (let index = 1; index < events.length; index += 1) {
    ensure(events[index].eventOrdinal === events[index - 1].eventOrdinal + 1, "TX_ORDINAL");
    ensure(events[index].priorEventSha256 === events[index - 1].eventSha256, "TX_PRIOR_HASH");
  }
  ensure(new Set(events.map(({ eventSha256 }) => eventSha256)).size === 4, "TX_EVENT_HASH_UNIQUE");
  ensure(events.every(({ transactionId }) => transactionId === auth.transactionId), "TX_ID");
  ensure(events.every(({ capabilityTokenSha256 }) => capabilityTokenSha256 === auth.capabilityTokenSha256), "TX_CAPABILITY");
  ensure(!issuedCapabilities.has(auth.capabilityTokenSha256) && !consumedCapabilities.has(auth.capabilityTokenSha256), "TX_CAPABILITY_REUSE");
  ensure(open.authorizationEventSha256 === auth.eventSha256 && open.authorizationEventOrdinal === auth.eventOrdinal, "TX_OPEN_BINDING");
  ensure(consume.authorizationEventSha256 === auth.eventSha256 && consume.openEventSha256 === open.eventSha256 && consume.openEventOrdinal === open.eventOrdinal, "TX_CONSUME_BINDING");
  ensure(close.authorizationEventSha256 === auth.eventSha256 && close.openEventSha256 === open.eventSha256 && close.consumeEventSha256 === consume.eventSha256 && close.consumeEventOrdinal === consume.eventOrdinal, "TX_CLOSE_BINDING");
  ensure(auth.occurredAtRfc3339 === auth.authorizedAtRfc3339 && open.occurredAtRfc3339 === open.openedAtRfc3339 && consume.occurredAtRfc3339 === consume.consumedAtRfc3339 && close.occurredAtRfc3339 === close.closedAtRfc3339, "TX_TIME_BINDING");
  ensure(open.contentBytesReleasedBeforeOpenSeal === 0 && consume.contentBytesReleasedBeforeConsumeSeal === 0, "TX_PREOPEN_BYTES");
  ensure(consume.useOrdinal === 1, "TX_SINGLE_USE");
  ensure(Date.parse(auth.authorizedAtRfc3339) < Date.parse(open.openedAtRfc3339) && Date.parse(open.openedAtRfc3339) <= Date.parse(consume.consumedAtRfc3339) && Date.parse(consume.consumedAtRfc3339) <= Date.parse(close.closedAtRfc3339), "TX_TIME_ORDER");
  issuedCapabilities.add(auth.capabilityTokenSha256);
  consumedCapabilities.add(auth.capabilityTokenSha256);
  return true;
}

function runTransactionCases(cases) {
  const tx = makeTransaction();
  cases.accepts("access:auth-open-consume-close", () => validateTransaction(tx));
  cases.rejects("access:capability-already-issued", () => validateTransaction(tx, new Set([tx[0].capabilityTokenSha256]), new Set()), "TX_CAPABILITY_REUSE");
  cases.rejects("access:capability-already-consumed", () => validateTransaction(tx, new Set(), new Set([tx[0].capabilityTokenSha256])), "TX_CAPABILITY_REUSE");
  for (let index = 0; index < tx.length; index += 1) {
    const missing = clone(tx); missing.splice(index, 1);
    cases.rejects(`access:missing:${index}`, () => validateTransaction(missing));
  }
  for (let left = 0; left < 4; left += 1) for (let right = left + 1; right < 4; right += 1) {
    const swapped = clone(tx); [swapped[left], swapped[right]] = [swapped[right], swapped[left]];
    cases.rejects(`access:reorder:${left}:${right}`, () => validateTransaction(swapped));
  }
  const fields = [
    [1, "eventOrdinal", 99], [1, "priorEventSha256", makeHash("bad-prior")], [1, "transactionId", "tx-other"],
    [2, "capabilityTokenSha256", makeHash("capability-other")], [1, "authorizationEventSha256", makeHash("bad-auth")],
    [2, "openEventSha256", makeHash("bad-open")], [3, "consumeEventSha256", makeHash("bad-consume")],
    [1, "contentBytesReleasedBeforeOpenSeal", 1], [2, "contentBytesReleasedBeforeConsumeSeal", 1], [2, "useOrdinal", 2],
    [0, "authorizedAtRfc3339", "2026-07-16T00:00:03Z"], [3, "closedAtRfc3339", "2026-07-15T23:59:59Z"]
  ];
  for (const [index, field, value] of fields) {
    const mutated = clone(tx); mutated[index][field] = value;
    cases.rejects(`access:mutation:${index}:${field}`, () => validateTransaction(mutated));
  }
  const noStrictOpenGap = clone(tx);
  noStrictOpenGap[1].occurredAtRfc3339 = tx[0].authorizedAtRfc3339;
  noStrictOpenGap[1].openedAtRfc3339 = tx[0].authorizedAtRfc3339;
  cases.rejects("access:authorization-and-open-same-time", () => validateTransaction(noStrictOpenGap), "TX_TIME_ORDER");
}

function runStructural() {
  const child = spawnSync("python", [resolve(PKG_DIR, "schema-hostile.py")], {
    cwd: PKG_DIR,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000
  });
  ensure(child.status === 0, "STRUCTURAL_RUN", (child.stderr || child.stdout).trim());
  const result = parseStrictJson(child.stdout.trim());
  ensure(result.branchCount === 23 && result.validBaselines === 23, "STRUCTURAL_BASELINES");
  ensure(result.structuralMutations === result.detectedStructuralMutations && result.structuralMutations >= 650, "STRUCTURAL_CASES");
  return result;
}

function packageRows() {
  return [
    "PROTOCOL.md", "README.md", "canonicalize.mjs", "event-schemas.json", "fingerprint.mjs",
    "hostile-fixtures.json", "protocol.json", "registries.json", "schema-hostile.py", "semantics.mjs", "verify.mjs"
  ].map((name) => {
    const path = resolve(PKG_DIR, name);
    ensure(existsSync(path) && statSync(path).isFile(), "PACKAGE_FILE", name);
    return { path: name, bytes: statSync(path).size, sha256: sha256File(path) };
  });
}

function verifySealedPackage(expected) {
  const publicPath = resolve(PKG_DIR, "public-manifest.json");
  const manifestPath = resolve(PKG_DIR, "MANIFEST.sha256");
  const hasPublicManifest = existsSync(publicPath);
  const hasDigestManifest = existsSync(manifestPath);
  ensure(hasPublicManifest === hasDigestManifest, "PARTIAL_PACKAGE_SEAL");
  const coreNames = [
    "PROTOCOL.md", "README.md", "canonicalize.mjs", "event-schemas.json", "fingerprint.mjs",
    "hostile-fixtures.json", "protocol.json", "registries.json", "schema-hostile.py", "semantics.mjs", "verify.mjs"
  ];
  const expectedNames = [...coreNames, ...(hasPublicManifest ? ["MANIFEST.sha256", "public-manifest.json"] : [])].sort();
  const actualNames = readdirSync(PKG_DIR, { withFileTypes: true }).map((entry) => {
    ensure(entry.isFile(), "PACKAGE_UNMANIFESTED_DIRECTORY", entry.name);
    return entry.name;
  }).sort();
  ensure(JSON.stringify(actualNames) === JSON.stringify(expectedNames), "PACKAGE_EXACT_FILE_SET", actualNames.join(","));
  if (!hasPublicManifest) return { sealed: false, packageFiles: packageRows() };
  const publicManifest = readJsonStrict(publicPath, "PUBLIC_MANIFEST");
  ensure(publicManifest.artifactId === "reviewer-calibration-v4-production-bound-v4", "PUBLIC_ARTIFACT");
  ensure(publicManifest.status === "AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY", "PUBLIC_STATUS");
  ensure(publicManifest.independentAuditCompletedInThisArtifact === false && publicManifest.subjectOnlyAuthorEvidence === true, "PUBLIC_AUTHOR_ONLY");
  ensure(same(publicManifest.acceptedPublicLineage, expected.lineage), "PUBLIC_LINEAGE");
  ensure(same(publicManifest.hostileEvidence, expected.hostileEvidence), "PUBLIC_HOSTILE");
  assertZeroActivity(publicManifest.activity, "PUBLIC_ZERO_ACTIVITY");
  for (const value of Object.values(publicManifest.authority)) ensure(value === false || value === 0, "PUBLIC_ZERO_AUTHORITY");
  const rows = packageRows();
  ensure(same(publicManifest.packageFiles, rows), "PUBLIC_PACKAGE_ROWS");
  const expectedManifestRows = [...rows, { path: "public-manifest.json", bytes: statSync(publicPath).size, sha256: sha256File(publicPath) }]
    .map(({ path, sha256 }) => `${sha256}  ${path}`).join("\n") + "\n";
  ensure(readFileSync(manifestPath, "utf8") === expectedManifestRows, "OWN_MANIFEST_EXACT");
  return { sealed: true, packageFiles: rows, publicManifestSha256: sha256File(publicPath), manifestSha256: sha256File(manifestPath) };
}

function main() {
  const protocol = readJsonStrict(resolve(PKG_DIR, "protocol.json"), "PROTOCOL");
  const registries = readJsonStrict(resolve(PKG_DIR, "registries.json"), "REGISTRIES");
  const schema = readJsonStrict(resolve(PKG_DIR, "event-schemas.json"), "SCHEMA");
  const hostile = readJsonStrict(resolve(PKG_DIR, "hostile-fixtures.json"), "HOSTILE");
  verifyStatic(protocol, registries, schema, hostile);
  const lineage = verifyLineage(protocol);
  const structural = runStructural();
  const cases = new SemanticCases();
  const identity = runIdentityCases(cases);
  const coverage = runCoverageCases(cases);
  runFingerprintCases(cases);
  runPolicyGrantCases(cases, protocol, coverage, identity);
  runTransactionCases(cases);
  const semantic = cases.result();
  ensure(semantic.semanticBypasses >= 1500 && semantic.semanticBypasses === semantic.rejectedSemanticBypasses, "SEMANTIC_CASE_MINIMUM", `${semantic.semanticBypasses}`);
  ensure(structural.structuralMutations + semantic.semanticBypasses >= 1000, "TOTAL_HOSTILE_MINIMUM");
  ensure(hostile.minimums.structuralMutations <= structural.structuralMutations && hostile.minimums.semanticBypasses <= semantic.semanticBypasses && hostile.minimums.totalHostileCases <= structural.structuralMutations + semantic.semanticBypasses, "HOSTILE_DECLARED_MINIMUMS");
  const hostileEvidence = {
    schemaEngine: structural.schemaEngine,
    branchCount: structural.branchCount,
    validStructuralBaselines: structural.validBaselines,
    structuralMutations: structural.structuralMutations,
    detectedStructuralMutations: structural.detectedStructuralMutations,
    structuralDigestSha256: structural.structuralDigestSha256,
    acceptedSemanticBaselines: semantic.acceptedBaselines,
    semanticBypasses: semantic.semanticBypasses,
    rejectedSemanticBypasses: semantic.rejectedSemanticBypasses,
    semanticDigestSha256: semantic.semanticDigestSha256,
    totalHostileCases: structural.structuralMutations + semantic.semanticBypasses,
    caseDigestSha256: sha256Bytes(Buffer.from(`${structural.structuralDigestSha256}\n${semantic.semanticDigestSha256}\n`, "utf8"))
  };
  const packageIntegrity = verifySealedPackage({ lineage, hostileEvidence });
  const output = {
    artifactId: protocol.artifactId,
    verdict: packageIntegrity.sealed ? "PASS_AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_AUTHORITY" : "PASS_PRESEAL_AUTHOR_EVIDENCE_NO_AUTHORITY",
    lineage,
    hostileEvidence,
    packageIntegrity,
    authority: {
      executionAuthorized: false,
      evaluatorAuthorityGranted: false,
      scoringAuthorityGranted: false,
      resultAccessAuthorized: false,
      reviewerCertificatesIssued: 0,
      activationCandidates: 0,
      activationAuditReports: 0,
      activationGrants: 0
    },
    activity: protocol.publicOnlyBoundary.activity
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();
