import { createHash, createHmac, createPublicKey, sign as signBytes, verify as verifyBytes } from "node:crypto";
import { canonicalizeJcs, canonicalPayloadFrame, validateCanonicalPayloadDigest } from "./canonicalize.mjs";

export const IDENTITY_BINDING_VERSION = "NARA_QCAL_V4_STABLE_PRINCIPAL_HMAC_SHA256_1";
export const IDENTITY_DOMAIN_PREFIX = "NARA-QCAL-V4-IDENTITY\u0000";
export const COVERAGE_BINDING_VERSION = "NARA_QCAL_V4_MATERIALIZED_SLOT_COVERAGE_1";
export const POLICY_BINDING_VERSION = "NARA_QCAL_V4_ROLE_RESOURCE_STATE_POLICY_1";

export const ROLES = Object.freeze([
  "PACKET_AUTHOR", "ITEM_AUTHOR", "GOLD_AUTHOR", "IDENTITY_BINDING_CUSTODIAN",
  "TAXONOMY_PILOT_RATER", "MAIN_CERTIFICATION_RATER", "ACTIVATION_HOLDOUT_RATER",
  "CERTIFICATION_REVIEWER", "TRUSTED_GOLD_AUDITOR", "CALIBRATION_ADJUDICATOR",
  "S1_REVIEWER", "S1_ADJUDICATOR", "S1_RESULT_CUSTODIAN", "S1_RESULT_VIEWER",
  "ACTIVATION_CANDIDATE_AUTHOR", "INDEPENDENT_ACTIVATION_AUDITOR", "ACTIVATION_GRANT_AUTHOR"
]);

export const STATES = Object.freeze([
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
]);

export const RESOURCE_CLASSES = Object.freeze([
  "BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK", "OWN_PHASE1_RESPONSE",
  "BOUND_ANSWER_EXPLANATION_REVEAL", "TRUSTED_GOLD_AUDIT_BUNDLE", "ADJUDICATION_BUNDLE",
  "ACTIVATION_CANDIDATE_BYTES", "ACTIVATION_AUDIT_REPORT_BYTES", "S1_RESULT_SCOPE_BOUND",
  "OUT_OF_SCOPE_S1_RESULT", "OTHER_RATER_IDENTITY", "RAW_HIDDEN_COMMITMENT",
  "REJECTION_SURPLUS_HISTORY", "RAW_PRIVATE_TRUSTED_GOLD"
]);

export const CANONICAL_FAMILY_BY_TYPE = Object.freeze({
  BLANK_INFERENCE: null,
  GRAMMAR_ERROR: null,
  GRAMMAR_CHOICE_COMBO: "NF-F4-GRAMMAR_FORM_DIAGNOSIS",
  VOCAB_CHOICE: "NF-F5-LEXICAL_SEMANTICS",
  SENTENCE_ORDER: "NF-F3-DISCOURSE_STRUCTURE",
  SENTENCE_INSERT: "NF-F3-DISCOURSE_STRUCTURE",
  TOPIC: "NF-F1-GLOBAL_MEANING_SELECTION",
  MAIN_IDEA: "NF-F1-GLOBAL_MEANING_SELECTION",
  TITLE: "NF-F1-GLOBAL_MEANING_SELECTION",
  IMPLIED_MEANING: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE",
  REFERENCE: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE",
  CONTENT_MATCH: "NF-F2-LOCAL_INFERENCE_AND_REFERENCE",
  SUMMARY_COMPLETE_MC: "NF-F6-SUMMARY_AND_COMPRESSION",
  IRRELEVANT: "NF-F3-DISCOURSE_STRUCTURE",
  CONDITIONAL_WRITING: "NF-F7-CONTROLLED_REWRITE_AND_ORDER",
  SENTENCE_TRANSFORM: "NF-F7-CONTROLLED_REWRITE_AND_ORDER",
  FILL_BLANK_KEY: "NF-F8-TARGETED_CONSTRUCTED_EXPRESSION",
  SUMMARY_COMPLETE: "NF-F6-SUMMARY_AND_COMPRESSION",
  SUMMARY_WRITING: "NF-F6-SUMMARY_AND_COMPRESSION",
  WORD_ORDER: "NF-F7-CONTROLLED_REWRITE_AND_ORDER",
  TOPIC_SENTENCE_WRITING: "NF-F8-TARGETED_CONSTRUCTED_EXPRESSION",
  GRAMMAR_CORRECTION: "NF-F4-GRAMMAR_FORM_DIAGNOSIS",
  CONTEXT_MEANING: "NF-F5-LEXICAL_SEMANTICS",
  SYNONYM: "NF-F5-LEXICAL_SEMANTICS",
  ANTONYM: "NF-F5-LEXICAL_SEMANTICS"
});

export const POLICY_STATE_BY_PHASE = Object.freeze({
  TAXONOMY_PILOT_PHASE1: "TAXONOMY_PILOT_12_ISSUED",
  MAIN_CERTIFICATION_PHASE1: "MAIN_CERTIFICATION_24_ISSUED",
  MAIN_CERTIFICATION_PHASE2: "MAIN_CERTIFICATION_24_ISSUED",
  INDEPENDENT_TRUSTED_GOLD_AUDIT: "MAIN_CERTIFICATION_24_PASSED_SEALED",
  ACTIVATION_HOLDOUT_PHASE1: "ACTIVATION_HOLDOUT_24_ISSUED",
  ACTIVATION_CANDIDATE_AUDIT: "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
  POST_ACTIVATION_RESULT: "ACTIVATION_GRANTED"
});

const HASH = /^[0-9a-f]{64}$/;

function fail(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function assert(condition, code, detail = "") {
  if (!condition) fail(code, detail);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function uint64(value) {
  assert(Number.isSafeInteger(value) && value >= 0, "SEM_LENGTH", `${value}`);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function framedHash(domain, value) {
  const prefix = Buffer.from(domain, "utf8");
  const payload = Buffer.from(typeof value === "string" ? value : canonicalizeJcs(value), "utf8");
  return sha256(Buffer.concat([prefix, uint64(payload.length), payload]));
}

function exactKeys(object, expected, code) {
  assert(object && typeof object === "object" && !Array.isArray(object), code);
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), code, actual.join(","));
}

function nonemptyUnique(values, allowed, code) {
  assert(Array.isArray(values) && values.length > 0, code);
  assert(new Set(values).size === values.length, code);
  assert(values.every((value) => allowed.includes(value)), code);
}

export function canonicalizeAuthorityNamespace(value) {
  assert(typeof value === "string", "IDENTITY_AUTHORITY_NAMESPACE_TYPE");
  const normalized = value.normalize("NFKC").trim().replace(/[A-Z]/g, (character) => character.toLowerCase());
  assert(/^[a-z0-9][a-z0-9._:-]{2,127}$/.test(normalized), "IDENTITY_AUTHORITY_NAMESPACE_FORMAT");
  return normalized;
}

export function canonicalizePrincipalSourceId(value) {
  assert(typeof value === "string", "IDENTITY_SOURCE_ID_TYPE");
  const normalized = value.normalize("NFKC").trim().replace(/[A-Z]/g, (character) => character.toLowerCase());
  assert(/^[a-z0-9][a-z0-9._:@-]{2,255}$/.test(normalized), "IDENTITY_SOURCE_ID_FORMAT");
  return normalized;
}

export function canonicalizePseudonym(value) {
  assert(typeof value === "string", "IDENTITY_PSEUDONYM_TYPE");
  const normalized = value.normalize("NFKC").trim().replace(/[A-Z]/g, (character) => character.toLowerCase());
  assert(/^[a-z0-9][a-z0-9._:-]{15,127}$/.test(normalized), "IDENTITY_PSEUDONYM_FORMAT");
  return normalized;
}

function identityHmac(key, label, fields) {
  assert(Buffer.isBuffer(key) && key.length >= 32, "IDENTITY_CUSTODIAN_KEY");
  const domain = Buffer.from(IDENTITY_DOMAIN_PREFIX, "utf8");
  const version = Buffer.from(IDENTITY_BINDING_VERSION, "utf8");
  const labelBytes = Buffer.from(label, "utf8");
  const payload = Buffer.from(canonicalizeJcs(fields), "utf8");
  return createHmac("sha256", key).update(Buffer.concat([
    domain,
    uint64(version.length), version,
    uint64(labelBytes.length), labelBytes,
    uint64(payload.length), payload
  ])).digest("hex");
}

export function deriveStablePrincipalBinding({ custodianKey, authorityNamespace, canonicalPrincipalSourceId }) {
  const namespace = canonicalizeAuthorityNamespace(authorityNamespace);
  const sourceId = canonicalizePrincipalSourceId(canonicalPrincipalSourceId);
  const canonicalSourceIdCommitmentSha256 = identityHmac(custodianKey, "CANONICAL_SOURCE_ID", { namespace, sourceId });
  const principalCommitmentSha256 = identityHmac(custodianKey, "STABLE_PRINCIPAL", {
    canonicalSourceIdCommitmentSha256,
    namespace
  });
  return {
    identityBindingVersion: IDENTITY_BINDING_VERSION,
    authorityNamespace: namespace,
    canonicalSourceIdCommitmentSha256,
    principalCommitmentSha256
  };
}

function custodianPublicKeySha256(publicKey) {
  const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
  const der = key.export({ type: "spki", format: "der" });
  return sha256(der);
}

function custodianAttestationSigningBytes(payload) {
  const domain = Buffer.from(`${IDENTITY_DOMAIN_PREFIX}CUSTODIAN_SIGNED_ASSERTION\u0000`, "utf8");
  const version = Buffer.from(IDENTITY_BINDING_VERSION, "utf8");
  const body = Buffer.from(canonicalizeJcs(payload), "utf8");
  return Buffer.concat([domain, uint64(version.length), version, uint64(body.length), body]);
}

export function createEmptyIdentityRegistry({ trustedCustodianPublicKeysByPrincipal = {} } = {}) {
  const trustedKeys = {};
  const trustedKeyFingerprints = {};
  for (const [principal, publicKey] of Object.entries(trustedCustodianPublicKeysByPrincipal)) {
    assert(HASH.test(principal), "IDENTITY_TRUSTED_CUSTODIAN_PRINCIPAL");
    const key = createPublicKey(publicKey);
    assert(key.asymmetricKeyType === "ed25519", "IDENTITY_CUSTODIAN_KEY_TYPE");
    trustedKeys[principal] = key.export({ type: "spki", format: "pem" }).toString();
    trustedKeyFingerprints[principal] = custodianPublicKeySha256(key);
  }
  return {
    version: IDENTITY_BINDING_VERSION,
    trustedCustodianPublicKeysByPrincipal: trustedKeys,
    trustedCustodianKeySha256ByPrincipal: trustedKeyFingerprints,
    principalRecords: {},
    principalByCanonicalSourceCommitment: {},
    principalByCanonicalPseudonym: {},
    canonicalPseudonymsByPrincipal: {},
    custodianAttestations: {},
    denialRecords: [],
    ready: false,
    sealed: false,
    registryRootSha256: null
  };
}

export function createIdentityCustodianAttestation({ subjectBinding, canonicalPseudonyms, custodianPrincipalCommitmentSha256, custodianRole, custodianPrivateKey }) {
  exactKeys(subjectBinding, ["identityBindingVersion", "authorityNamespace", "canonicalSourceIdCommitmentSha256", "principalCommitmentSha256"], "IDENTITY_SUBJECT_BINDING_FIELDS");
  assert(subjectBinding.identityBindingVersion === IDENTITY_BINDING_VERSION && canonicalizeAuthorityNamespace(subjectBinding.authorityNamespace) === subjectBinding.authorityNamespace, "IDENTITY_SUBJECT_BINDING_VERSION_NAMESPACE");
  assert(HASH.test(subjectBinding.principalCommitmentSha256) && HASH.test(subjectBinding.canonicalSourceIdCommitmentSha256), "IDENTITY_SUBJECT_BINDING");
  assert(HASH.test(custodianPrincipalCommitmentSha256), "IDENTITY_CUSTODIAN_PRINCIPAL");
  assert(custodianRole === "IDENTITY_BINDING_CUSTODIAN", "IDENTITY_CUSTODIAN_ROLE");
  assert(custodianPrincipalCommitmentSha256 !== subjectBinding.principalCommitmentSha256, "IDENTITY_SELF_ATTESTATION");
  const publicKey = createPublicKey(custodianPrivateKey);
  assert(publicKey.asymmetricKeyType === "ed25519", "IDENTITY_CUSTODIAN_KEY_TYPE");
  const pseudonyms = canonicalPseudonyms.map(canonicalizePseudonym).sort();
  assert(pseudonyms.length >= 1 && new Set(pseudonyms).size === pseudonyms.length, "IDENTITY_PSEUDONYM_SET");
  const payload = {
    attestationVersion: IDENTITY_BINDING_VERSION,
    authorityNamespace: subjectBinding.authorityNamespace,
    canonicalPseudonyms: pseudonyms,
    canonicalSourceIdCommitmentSha256: subjectBinding.canonicalSourceIdCommitmentSha256,
    custodianPrincipalCommitmentSha256,
    custodianPublicKeySha256: custodianPublicKeySha256(publicKey),
    custodianRole,
    principalCommitmentSha256: subjectBinding.principalCommitmentSha256,
    signatureAlgorithm: "Ed25519",
    verdict: "ATTEST_ONE_PRINCIPAL_BINDING"
  };
  const signatureBase64 = signBytes(null, custodianAttestationSigningBytes(payload), custodianPrivateKey).toString("base64");
  return {
    ...payload,
    signatureBase64,
    attestationSha256: framedHash(`${IDENTITY_DOMAIN_PREFIX}CUSTODIAN_ATTESTATION\u0000`, { ...payload, signatureBase64 })
  };
}

function identityDenial(reasonCode, evidence) {
  const record = {
    decision: "DENY",
    reasonCode,
    evidenceSha256: framedHash(`${IDENTITY_DOMAIN_PREFIX}DENIAL\u0000`, evidence)
  };
  return record;
}

export function registerPrincipalBinding(registry, { binding, attestation }) {
  const snapshot = structuredClone(registry);
  try {
    assert(registry.version === IDENTITY_BINDING_VERSION && registry.sealed === false, "IDENTITY_REGISTRY_NOT_WRITABLE");
    assert(attestation.attestationSha256 === framedHash(`${IDENTITY_DOMAIN_PREFIX}CUSTODIAN_ATTESTATION\u0000`, {
      attestationVersion: attestation.attestationVersion,
      authorityNamespace: attestation.authorityNamespace,
      canonicalPseudonyms: attestation.canonicalPseudonyms,
      canonicalSourceIdCommitmentSha256: attestation.canonicalSourceIdCommitmentSha256,
      custodianPrincipalCommitmentSha256: attestation.custodianPrincipalCommitmentSha256,
      custodianPublicKeySha256: attestation.custodianPublicKeySha256,
      custodianRole: attestation.custodianRole,
      principalCommitmentSha256: attestation.principalCommitmentSha256,
      signatureAlgorithm: attestation.signatureAlgorithm,
      signatureBase64: attestation.signatureBase64,
      verdict: attestation.verdict
    }), "IDENTITY_ATTESTATION_DIGEST");
    assert(attestation.custodianRole === "IDENTITY_BINDING_CUSTODIAN", "IDENTITY_CUSTODIAN_ROLE");
    exactKeys(binding, ["identityBindingVersion", "authorityNamespace", "canonicalSourceIdCommitmentSha256", "principalCommitmentSha256"], "IDENTITY_BINDING_FIELDS");
    assert(binding.identityBindingVersion === IDENTITY_BINDING_VERSION && canonicalizeAuthorityNamespace(binding.authorityNamespace) === binding.authorityNamespace, "IDENTITY_BINDING_VERSION_NAMESPACE");
    assert(attestation.signatureAlgorithm === "Ed25519" && typeof attestation.signatureBase64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(attestation.signatureBase64), "IDENTITY_ATTESTATION_SIGNATURE_FORMAT");
    const trustedPublicKey = registry.trustedCustodianPublicKeysByPrincipal[attestation.custodianPrincipalCommitmentSha256];
    assert(Boolean(trustedPublicKey), "IDENTITY_UNTRUSTED_CUSTODIAN");
    assert(registry.trustedCustodianKeySha256ByPrincipal[attestation.custodianPrincipalCommitmentSha256] === attestation.custodianPublicKeySha256, "IDENTITY_CUSTODIAN_KEY_FINGERPRINT");
    const signedPayload = {
      attestationVersion: attestation.attestationVersion,
      authorityNamespace: attestation.authorityNamespace,
      canonicalPseudonyms: attestation.canonicalPseudonyms,
      canonicalSourceIdCommitmentSha256: attestation.canonicalSourceIdCommitmentSha256,
      custodianPrincipalCommitmentSha256: attestation.custodianPrincipalCommitmentSha256,
      custodianPublicKeySha256: attestation.custodianPublicKeySha256,
      custodianRole: attestation.custodianRole,
      principalCommitmentSha256: attestation.principalCommitmentSha256,
      signatureAlgorithm: attestation.signatureAlgorithm,
      verdict: attestation.verdict
    };
    assert(verifyBytes(null, custodianAttestationSigningBytes(signedPayload), trustedPublicKey, Buffer.from(attestation.signatureBase64, "base64")), "IDENTITY_ATTESTATION_SIGNATURE_INVALID");
    assert(attestation.custodianPrincipalCommitmentSha256 !== binding.principalCommitmentSha256, "IDENTITY_SELF_ATTESTATION");
    assert(attestation.authorityNamespace === binding.authorityNamespace && attestation.principalCommitmentSha256 === binding.principalCommitmentSha256 && attestation.canonicalSourceIdCommitmentSha256 === binding.canonicalSourceIdCommitmentSha256, "IDENTITY_ATTESTATION_SUBJECT_MISMATCH");
    const existingForSource = registry.principalByCanonicalSourceCommitment[binding.canonicalSourceIdCommitmentSha256];
    assert(existingForSource === undefined || existingForSource === binding.principalCommitmentSha256, "IDENTITY_SOURCE_TO_MULTIPLE_PRINCIPALS");
    const existingPrincipal = registry.principalRecords[binding.principalCommitmentSha256];
    assert(existingPrincipal === undefined || existingPrincipal.canonicalSourceIdCommitmentSha256 === binding.canonicalSourceIdCommitmentSha256, "IDENTITY_PRINCIPAL_TO_MULTIPLE_SOURCES");
    for (const pseudonym of attestation.canonicalPseudonyms) {
      const canonical = canonicalizePseudonym(pseudonym);
      const owner = registry.principalByCanonicalPseudonym[canonical];
      assert(owner === undefined || owner === binding.principalCommitmentSha256, "IDENTITY_PSEUDONYM_COLLISION");
    }
    registry.principalRecords[binding.principalCommitmentSha256] = {
      authorityNamespace: binding.authorityNamespace,
      canonicalSourceIdCommitmentSha256: binding.canonicalSourceIdCommitmentSha256,
      custodianAttestationSha256: attestation.attestationSha256
    };
    registry.principalByCanonicalSourceCommitment[binding.canonicalSourceIdCommitmentSha256] = binding.principalCommitmentSha256;
    const pseudonymSet = new Set(registry.canonicalPseudonymsByPrincipal[binding.principalCommitmentSha256] ?? []);
    for (const pseudonym of attestation.canonicalPseudonyms) {
      const canonical = canonicalizePseudonym(pseudonym);
      registry.principalByCanonicalPseudonym[canonical] = binding.principalCommitmentSha256;
      pseudonymSet.add(canonical);
    }
    registry.canonicalPseudonymsByPrincipal[binding.principalCommitmentSha256] = [...pseudonymSet].sort();
    registry.custodianAttestations[attestation.attestationSha256] = attestation;
    return { decision: "REGISTER", principalCommitmentSha256: binding.principalCommitmentSha256, attestationSha256: attestation.attestationSha256 };
  } catch (error) {
    Object.keys(registry).forEach((key) => delete registry[key]);
    Object.assign(registry, snapshot);
    const denial = identityDenial(error.code ?? "IDENTITY_UNKNOWN_DENIAL", {
      canonicalSourceIdCommitmentSha256: binding?.canonicalSourceIdCommitmentSha256 ?? null,
      principalCommitmentSha256: binding?.principalCommitmentSha256 ?? null
    });
    registry.denialRecords.push(denial);
    return denial;
  }
}

export function sealIdentityRegistry(registry) {
  assert(registry.sealed === false, "IDENTITY_ALREADY_SEALED");
  const principalCommitments = Object.keys(registry.principalRecords).sort();
  assert(principalCommitments.length >= 1, "IDENTITY_EMPTY_REGISTRY");
  assert(Object.keys(registry.principalByCanonicalSourceCommitment).length === principalCommitments.length, "IDENTITY_SOURCE_CARDINALITY");
  for (const principal of principalCommitments) {
    assert((registry.canonicalPseudonymsByPrincipal[principal] ?? []).length >= 1, "IDENTITY_PRINCIPAL_WITHOUT_PSEUDONYM", principal);
    assert(HASH.test(registry.principalRecords[principal].custodianAttestationSha256), "IDENTITY_PRINCIPAL_WITHOUT_ATTESTATION", principal);
  }
  const rootPayload = {
    canonicalPseudonymsByPrincipal: registry.canonicalPseudonymsByPrincipal,
    principalByCanonicalPseudonym: registry.principalByCanonicalPseudonym,
    principalByCanonicalSourceCommitment: registry.principalByCanonicalSourceCommitment,
    principalRecords: registry.principalRecords,
    trustedCustodianKeySha256ByPrincipal: registry.trustedCustodianKeySha256ByPrincipal,
    version: registry.version
  };
  registry.registryRootSha256 = framedHash(`${IDENTITY_DOMAIN_PREFIX}REGISTRY_ROOT\u0000`, rootPayload);
  registry.ready = true;
  registry.sealed = true;
  return registry.registryRootSha256;
}

export function validateRoleAssignmentIdentity(identityRegistry, assignment) {
  assert(identityRegistry.ready === true && identityRegistry.sealed === true && HASH.test(identityRegistry.registryRootSha256), "IDENTITY_REGISTRY_UNREADY");
  assert(assignment.identityRegistryRootSha256 === identityRegistry.registryRootSha256, "IDENTITY_REGISTRY_ROOT_BINDING");
  const canonicalPseudonym = canonicalizePseudonym(assignment.actorPseudonym);
  assert(canonicalPseudonym === assignment.canonicalPseudonym, "IDENTITY_PSEUDONYM_NOT_CANONICAL");
  assert(identityRegistry.principalByCanonicalPseudonym[canonicalPseudonym] === assignment.principalCommitmentSha256, "IDENTITY_PSEUDONYM_PRINCIPAL_MISMATCH");
  const record = identityRegistry.principalRecords[assignment.principalCommitmentSha256];
  assert(Boolean(record), "IDENTITY_UNKNOWN_PRINCIPAL");
  assert(record.custodianAttestationSha256 === assignment.identityCustodianAttestationSha256, "IDENTITY_ATTESTATION_MISMATCH");
  assert(ROLES.includes(assignment.role), "IDENTITY_ROLE_UNKNOWN");
  return true;
}

export function validatePrincipalRoleSeparation(roleAssignments, incompatibilityByRole) {
  for (const assignment of roleAssignments) {
    assert(HASH.test(assignment.principalCommitmentSha256), "ROLE_PRINCIPAL_COMMITMENT");
    assert(ROLES.includes(assignment.role), "ROLE_UNKNOWN");
  }
  for (const assignment of roleAssignments) {
    const incompatible = incompatibilityByRole[assignment.role] ?? [];
    for (const other of roleAssignments) {
      if (assignment === other) continue;
      if (incompatible.includes(other.role)) assert(assignment.principalCommitmentSha256 !== other.principalCommitmentSha256, "ROLE_PRINCIPAL_COLLISION", `${assignment.role}:${other.role}`);
    }
  }
  return true;
}

export function materializationRecordRoot(materialization) {
  const fields = [
    "eventSha256", "slotId", "canonicalTypeId", "canonicalFamilyId", "phase",
    "fingerprintCompositeSha256", "fingerprintDerivationProofSha256", "eligible",
    "terminalDecisionEventSha256", "terminalDecisionSha256", "terminalDecision"
  ];
  exactKeys(materialization, fields, "COVERAGE_MATERIALIZATION_FIELDS");
  assert(fields.filter((field) => field.endsWith("Sha256")).every((field) => HASH.test(materialization[field])), "COVERAGE_MATERIALIZATION_HASH");
  assert(Object.prototype.hasOwnProperty.call(CANONICAL_FAMILY_BY_TYPE, materialization.canonicalTypeId), "COVERAGE_MATERIALIZATION_TYPE");
  assert(materialization.canonicalFamilyId === CANONICAL_FAMILY_BY_TYPE[materialization.canonicalTypeId], "COVERAGE_MATERIALIZATION_TYPE_FAMILY");
  assert(["MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"].includes(materialization.phase), "COVERAGE_MATERIALIZATION_PHASE");
  const prefix = materialization.phase === "MAIN_CERTIFICATION" ? "MC" : "AH";
  const block = materialization.canonicalTypeId === "GRAMMAR_ERROR" ? "G" : materialization.canonicalTypeId === "BLANK_INFERENCE" ? "B" : "N";
  assert(new RegExp(`^${prefix}-${block}-[0-9]{2}$`).test(materialization.slotId), "COVERAGE_MATERIALIZATION_SLOT_BINDING");
  assert(materialization.eligible === true && materialization.terminalDecision === "PASS", "COVERAGE_MATERIALIZATION_NOT_PASS_ELIGIBLE");
  return framedHash("NARA-QCAL-V4-COVERAGE-MATERIALIZATION\u0000", materialization);
}

export function validatePassedCoverageEvent(event, materializationsByEventSha256) {
  const materialization = materializationsByEventSha256[event.materializationEventSha256];
  assert(Boolean(materialization), "COVERAGE_MATERIALIZATION_NOT_FOUND");
  assert(materialization.eventSha256 === event.materializationEventSha256, "COVERAGE_MATERIALIZATION_EVENT_HASH");
  materializationRecordRoot(materialization);
  for (const field of ["slotId", "canonicalTypeId", "canonicalFamilyId", "phase", "fingerprintCompositeSha256", "fingerprintDerivationProofSha256", "terminalDecisionEventSha256", "terminalDecisionSha256"]) {
    assert(event[field] === materialization[field], "COVERAGE_MATERIALIZATION_BINDING", field);
  }
  assert(event.materializationRecordRootSha256 === materializationRecordRoot(materialization), "COVERAGE_MATERIALIZATION_ROOT");
  assert(event.materializationEligible === true, "COVERAGE_EVENT_MATERIALIZATION_INELIGIBLE");
  assert(event.uniqueAnswerCheckPassed === true && event.fatalChecksPassed === true && event.coverageVerdict === "PASS", "COVERAGE_EVENT_NOT_PASS");
  assert(["MAIN_CERTIFICATION", "ACTIVATION_HOLDOUT"].includes(event.phase), "COVERAGE_PHASE_NOT_ELIGIBLE");
  return materialization;
}

export function recomputeCoverageEvidence(evidence, passedEventsBySha256, materializationsByEventSha256, expectedTypeIds) {
  exactKeys(evidence, [
    "scopeEnum", "canonicalTypeIds", "coverageCount",
    "passedCoverageEventSha256ByCanonicalType", "materializationEventSha256ByCanonicalType",
    "coverageMapRootSha256", "coverageRecomputationRootSha256"
  ], "COVERAGE_EVIDENCE_FIELDS");
  assert(["FOCUS_ONLY", "ALL_25"].includes(evidence.scopeEnum), "COVERAGE_SCOPE");
  const exactScopeTypes = evidence.scopeEnum === "FOCUS_ONLY"
    ? ["GRAMMAR_ERROR", "BLANK_INFERENCE"]
    : Object.keys(CANONICAL_FAMILY_BY_TYPE);
  assert(JSON.stringify(expectedTypeIds) === JSON.stringify(exactScopeTypes), "COVERAGE_SCOPE_TYPES");
  assert(JSON.stringify(evidence.canonicalTypeIds) === JSON.stringify(expectedTypeIds), "COVERAGE_TYPE_LIST");
  assert(evidence.coverageCount === expectedTypeIds.length, "COVERAGE_COUNT");
  const mapKeys = Object.keys(evidence.passedCoverageEventSha256ByCanonicalType).sort();
  assert(JSON.stringify(mapKeys) === JSON.stringify([...expectedTypeIds].sort()), "COVERAGE_MAP_KEYS");
  const materializationMapKeys = Object.keys(evidence.materializationEventSha256ByCanonicalType).sort();
  assert(JSON.stringify(materializationMapKeys) === JSON.stringify([...expectedTypeIds].sort()), "COVERAGE_MATERIALIZATION_MAP_KEYS");
  const eventHashes = [];
  const materializationHashes = [];
  const slotIds = [];
  for (const typeId of expectedTypeIds) {
    const eventHash = evidence.passedCoverageEventSha256ByCanonicalType[typeId];
    assert(HASH.test(eventHash), "COVERAGE_EVENT_HASH", typeId);
    const event = passedEventsBySha256[eventHash];
    assert(Boolean(event) && event.eventSha256 === eventHash, "COVERAGE_EVENT_NOT_FOUND", typeId);
    assert(event.canonicalTypeId === typeId, "COVERAGE_EVENT_TYPE_MISMATCH", typeId);
    const materialization = validatePassedCoverageEvent(event, materializationsByEventSha256);
    assert(evidence.materializationEventSha256ByCanonicalType[typeId] === event.materializationEventSha256,
      "COVERAGE_MATERIALIZATION_MAP_BINDING", typeId);
    eventHashes.push(eventHash);
    materializationHashes.push(event.materializationEventSha256);
    slotIds.push(materialization.slotId);
  }
  assert(new Set(eventHashes).size === eventHashes.length, "COVERAGE_EVENT_REUSE");
  assert(new Set(materializationHashes).size === materializationHashes.length, "COVERAGE_MATERIALIZATION_REUSE");
  assert(new Set(slotIds).size === slotIds.length, "COVERAGE_SLOT_REUSE");
  const orderedEntries = expectedTypeIds.map((typeId) => ({
    canonicalTypeId: typeId,
    canonicalFamilyId: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].canonicalFamilyId,
    fingerprintCompositeSha256: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].fingerprintCompositeSha256,
    fingerprintDerivationProofSha256: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].fingerprintDerivationProofSha256,
    materializationEventSha256: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].materializationEventSha256,
    passedCoverageEventSha256: evidence.passedCoverageEventSha256ByCanonicalType[typeId],
    phase: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].phase,
    slotId: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].slotId,
    terminalDecisionEventSha256: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].terminalDecisionEventSha256,
    terminalDecisionSha256: passedEventsBySha256[evidence.passedCoverageEventSha256ByCanonicalType[typeId]].terminalDecisionSha256
  }));
  const coverageMapRootSha256 = framedHash("NARA-QCAL-V4-COVERAGE-MAP\u0000", {
    bindingVersion: COVERAGE_BINDING_VERSION,
    orderedEntries
  });
  assert(evidence.coverageMapRootSha256 === coverageMapRootSha256, "COVERAGE_MAP_ROOT_MISMATCH");
  const coverageRecomputationRootSha256 = framedHash("NARA-QCAL-V4-COVERAGE-RECOMPUTATION\u0000", {
    bindingVersion: COVERAGE_BINDING_VERSION,
    coverageMapRootSha256,
    orderedEntries,
    scopeEnum: evidence.scopeEnum
  });
  assert(evidence.coverageRecomputationRootSha256 === coverageRecomputationRootSha256, "COVERAGE_ROOT_MISMATCH");
  return coverageRecomputationRootSha256;
}

export function validateCertificateCandidateGrantCoverage({ certificateEvidence, candidateEvidence, grantEvidence, passedEventsBySha256, materializationsByEventSha256, expectedTypeIds }) {
  const certificateRoot = recomputeCoverageEvidence(certificateEvidence, passedEventsBySha256, materializationsByEventSha256, expectedTypeIds);
  const candidateRoot = recomputeCoverageEvidence(candidateEvidence, passedEventsBySha256, materializationsByEventSha256, expectedTypeIds);
  const grantRoot = recomputeCoverageEvidence(grantEvidence, passedEventsBySha256, materializationsByEventSha256, expectedTypeIds);
  assert(certificateRoot === candidateRoot && candidateRoot === grantRoot, "COVERAGE_CHAIN_ROOT_MISMATCH");
  return grantRoot;
}

export function buildPolicyTuples(policyRows) {
  const tuples = [];
  assert(policyRows.length === Object.keys(POLICY_STATE_BY_PHASE).length, "POLICY_ROW_COUNT");
  assert(new Set(policyRows.map((row) => row.phase)).size === policyRows.length, "POLICY_DUPLICATE_PHASE");
  for (const row of policyRows) {
    assert(POLICY_STATE_BY_PHASE[row.phase] === row.state, "POLICY_ROW_PHASE_STATE");
    nonemptyUnique(row.allowResources, RESOURCE_CLASSES, "POLICY_ALLOW_RESOURCES");
    nonemptyUnique(row.denyResources, RESOURCE_CLASSES, "POLICY_DENY_RESOURCES");
    nonemptyUnique(row.allowedRoles, ROLES, "POLICY_ALLOWED_ROLES");
    nonemptyUnique(row.deniedRoles, ROLES, "POLICY_DENIED_ROLES");
    assert(row.allowedRoles.every((role) => !row.deniedRoles.includes(role)), "POLICY_ROLE_OVERLAP");
    assert(new Set([...row.allowedRoles, ...row.deniedRoles]).size === ROLES.length, "POLICY_ROLE_PARTITION");
    assert(ROLES.every((role) => row.allowedRoles.includes(role) || row.deniedRoles.includes(role)), "POLICY_ROLE_PARTITION");
    assert(row.allowResources.every((resource) => !row.denyResources.includes(resource)), "POLICY_RESOURCE_OVERLAP");
    for (const resourceClass of RESOURCE_CLASSES) {
      const tuple = {
        allowedRoles: [...row.allowedRoles],
        deniedRoles: [...row.deniedRoles],
        phase: row.phase,
        resourceClass,
        resourceDecision: row.allowResources.includes(resourceClass) ? "ALLOW" : "DENY",
        state: row.state
      };
      const tupleCoordinates = { phase: tuple.phase, resourceClass: tuple.resourceClass, state: tuple.state };
      tuple.allowedRolesRootSha256 = root("TUPLE_ALLOWED_ROLES", { ...tupleCoordinates, allowedRoles: tuple.allowedRoles });
      tuple.deniedRolesRootSha256 = root("TUPLE_DENIED_ROLES", { ...tupleCoordinates, deniedRoles: tuple.deniedRoles });
      tuple.policyTupleSha256 = root("TUPLE", tuple);
      tuples.push(tuple);
    }
  }
  const ids = tuples.map((tuple) => `${tuple.phase}|${tuple.state}|${tuple.resourceClass}`);
  assert(new Set(ids).size === ids.length, "POLICY_DUPLICATE_TUPLE");
  return tuples.sort((left, right) => {
    const a = canonicalizeJcs(left);
    const b = canonicalizeJcs(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function root(label, value) {
  return framedHash(`NARA-QCAL-V4-POLICY:${label}\u0000`, value);
}

export function sealPolicyRegistry({ policyRows, stateDenySets, resourceProofs, stateTransitionProofs, postActivationScope }) {
  assert(policyRows.length >= 1, "POLICY_ROWS_EMPTY");
  assert(Object.keys(stateDenySets).length === STATES.length && STATES.every((state) => Array.isArray(stateDenySets[state]) && stateDenySets[state].length > 0 && new Set(stateDenySets[state]).size === stateDenySets[state].length && stateDenySets[state].every((resource) => RESOURCE_CLASSES.includes(resource))), "POLICY_STATE_DENY_INCOMPLETE");
  const expectedResourceProofKeys = policyRows.flatMap((row) => RESOURCE_CLASSES.map((resourceClass) => `${row.phase}|${row.state}|${resourceClass}`)).sort();
  assert(Array.isArray(resourceProofs) && resourceProofs.length === expectedResourceProofKeys.length && resourceProofs.every((proof) => HASH.test(proof.sha256)), "POLICY_RESOURCE_PROOFS_EMPTY");
  const resourceProofKeys = resourceProofs.map((proof) => `${proof.phase}|${proof.state}|${proof.resourceClass}`).sort();
  assert(JSON.stringify(resourceProofKeys) === JSON.stringify(expectedResourceProofKeys), "POLICY_RESOURCE_PROOFS_INCOMPLETE");
  assert(Array.isArray(stateTransitionProofs) && stateTransitionProofs.length === STATES.length - 1 && stateTransitionProofs.every((proof) => HASH.test(proof.sha256)), "POLICY_TRANSITION_PROOFS_EMPTY");
  for (let index = 0; index < stateTransitionProofs.length; index += 1) {
    assert(stateTransitionProofs[index].from === STATES[index] && stateTransitionProofs[index].to === STATES[index + 1], "POLICY_TRANSITION_PROOFS_INCOMPLETE");
  }
  assert(postActivationScope && postActivationScope.state === "ACTIVATION_GRANTED" && postActivationScope.phase === "POST_ACTIVATION_RESULT", "POLICY_POST_SCOPE");
  const tuples = buildPolicyTuples(policyRows);
  const postRow = policyRows.find((row) => row.phase === "POST_ACTIVATION_RESULT" && row.state === "ACTIVATION_GRANTED");
  assert(Boolean(postRow) && postRow.allowResources.length > 0 && postRow.denyResources.length > 0 && postRow.allowedRoles.length > 0 && postRow.deniedRoles.length > 0, "POLICY_POST_ROW_INCOMPLETE");
  const roots = {
    policyMatrixRootSha256: root("MATRIX", tuples),
    allStateAllowRootSha256: root("ALL_STATE_ALLOW", policyRows.map((row) => ({ phase: row.phase, state: row.state, allowResources: row.allowResources }))),
    allStateDenyRootSha256: root("ALL_STATE_DENY", stateDenySets),
    allTupleAllowedRolesRootSha256: root("ALL_ALLOWED_ROLES", tuples.map((tuple) => ({ phase: tuple.phase, state: tuple.state, resourceClass: tuple.resourceClass, allowedRoles: tuple.allowedRoles }))),
    allTupleDeniedRolesRootSha256: root("ALL_DENIED_ROLES", tuples.map((tuple) => ({ phase: tuple.phase, state: tuple.state, resourceClass: tuple.resourceClass, deniedRoles: tuple.deniedRoles }))),
    resourceClassProofRootSha256: root("RESOURCE_PROOFS", resourceProofs),
    stateTransitionProofRootSha256: root("TRANSITION_PROOFS", stateTransitionProofs),
    postActivationScopeProofSha256: root("POST_SCOPE", postActivationScope),
    postActivationAllowRootSha256: root("POST_ALLOW", postRow.allowResources),
    postActivationDenyRootSha256: root("POST_DENY", postRow.denyResources),
    postActivationAllowedRolesRootSha256: root("POST_ALLOWED_ROLES", postRow.allowedRoles),
    postActivationDeniedRolesRootSha256: root("POST_DENIED_ROLES", postRow.deniedRoles)
  };
  const policyDesignContractSha256 = root("DESIGN_CONTRACT", {
    bindingVersion: POLICY_BINDING_VERSION,
    policyRows,
    postActivationScope,
    stateDenySets
  });
  const sealedPolicyRegistryRootSha256 = root("SEALED_REGISTRY", {
    bindingVersion: POLICY_BINDING_VERSION,
    policyDesignContractSha256,
    roots,
    tupleCount: tuples.length
  });
  return {
    bindingVersion: POLICY_BINDING_VERSION,
    policyRows,
    stateDenySets,
    resourceProofs,
    stateTransitionProofs,
    postActivationScope,
    tuples,
    roots,
    policyDesignContractSha256,
    tupleCount: tuples.length,
    ready: true,
    sealed: true,
    sealedPolicyRegistryRootSha256
  };
}

export function validateAuthorizationAgainstPolicy({ policyRegistry, authorization, activeRoleAssignments }) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true && HASH.test(policyRegistry.sealedPolicyRegistryRootSha256), "AUTH_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "AUTH_POLICY_ROOT_MISMATCH");
  const tuple = policyRegistry.tuples.find((entry) => entry.phase === authorization.phase && entry.state === authorization.currentState && entry.resourceClass === authorization.resourceClass);
  assert(Boolean(tuple) && tuple.resourceDecision === "ALLOW", "AUTH_POLICY_TUPLE_NOT_ALLOWED");
  assert(HASH.test(authorization.actorPrincipalCommitmentSha256), "AUTH_ACTOR_PRINCIPAL");
  const assignment = activeRoleAssignments.find((entry) => entry.principalCommitmentSha256 === authorization.actorPrincipalCommitmentSha256 && entry.role === authorization.actorRole && entry.active === true);
  assert(Boolean(assignment), "AUTH_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND");
  assert(HASH.test(assignment.eventSha256) && authorization.activeRoleAssignmentEventSha256 === assignment.eventSha256, "AUTH_ROLE_ASSIGNMENT_EVENT_BINDING");
  assert(HASH.test(assignment.identityRegistryRootSha256) && authorization.identityRegistryRootSha256 === assignment.identityRegistryRootSha256, "AUTH_IDENTITY_REGISTRY_BINDING");
  assert(tuple.allowedRoles.includes(authorization.actorRole), "AUTH_ROLE_NOT_ALLOWED");
  assert(!tuple.deniedRoles.includes(authorization.actorRole), "AUTH_ROLE_EXPLICITLY_DENIED");
  assert(authorization.allowedRolesRootSha256 === tuple.allowedRolesRootSha256, "AUTH_ALLOWED_ROLES_ROOT_BINDING");
  assert(authorization.deniedRolesRootSha256 === tuple.deniedRolesRootSha256, "AUTH_DENIED_ROLES_ROOT_BINDING");
  assert(authorization.policyTupleSha256 === tuple.policyTupleSha256, "AUTH_POLICY_TUPLE_BINDING");
  const resourceProof = policyRegistry.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
  assert(Boolean(resourceProof) && authorization.resourceClassPolicyProofSha256 === resourceProof.sha256, "AUTH_RESOURCE_PROOF_BINDING");
  const stateProof = policyRegistry.stateTransitionProofs.find((proof) => proof.to === tuple.state);
  assert(Boolean(stateProof) && authorization.stateTransitionEvidenceSha256 === stateProof.sha256, "AUTH_STATE_PROOF_BINDING");
  assert(authorization.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "AUTH_POLICY_REGISTRY_BINDING");
  for (const field of ["policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256"])
    assert(authorization[field] === policyRegistry.roots[field], "AUTH_POLICY_ROOT_BINDING", field);
  return true;
}

export function validateDenialAgainstPolicy({ policyRegistry, denial }) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true && HASH.test(policyRegistry.sealedPolicyRegistryRootSha256), "DENY_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "DENY_POLICY_ROOT_MISMATCH");
  const tuple = policyRegistry.tuples.find((entry) => entry.phase === denial.phase && entry.state === denial.currentState && entry.resourceClass === denial.resourceClass);
  assert(Boolean(tuple), "DENY_POLICY_TUPLE_NOT_FOUND");
  const deniedByResource = tuple.resourceDecision === "DENY";
  const deniedByRole = !tuple.allowedRoles.includes(denial.actorRole) || tuple.deniedRoles.includes(denial.actorRole);
  assert(deniedByResource || deniedByRole, "DENY_REQUEST_WOULD_BE_ALLOWED");
  assert(HASH.test(denial.actorPrincipalCommitmentSha256) && HASH.test(denial.identityRegistryRootSha256), "DENY_ACTOR_IDENTITY");
  assert(denial.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "DENY_POLICY_REGISTRY_BINDING");
  for (const field of ["policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256"])
    assert(denial[field] === policyRegistry.roots[field], "DENY_POLICY_ROOT_BINDING", field);
  assert(denial.allowedRolesRootSha256 === tuple.allowedRolesRootSha256, "DENY_ALLOWED_ROLES_ROOT_BINDING");
  assert(denial.deniedRolesRootSha256 === tuple.deniedRolesRootSha256, "DENY_DENIED_ROLES_ROOT_BINDING");
  assert(denial.policyTupleSha256 === tuple.policyTupleSha256, "DENY_POLICY_TUPLE_BINDING");
  const resourceProof = policyRegistry.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
  assert(Boolean(resourceProof) && denial.policyDecisionProofSha256 === resourceProof.sha256, "DENY_POLICY_DECISION_PROOF_BINDING");
  assert(denial.capabilityTokenSha256 === null && denial.authorizationEventSha256 === null, "DENY_CAPABILITY_CREATED");
  assert(denial.openedAtRfc3339 === null && denial.closedAtRfc3339 === null && denial.hasOpenConsumeOrClose === false, "DENY_ACCESS_EVENT_CREATED");
  assert(denial.decision === "DENY", "DENY_DECISION");
  return true;
}

export function validateGrantAgainstSealedPolicy({ policyRegistry, grantPayload, grantCanonicalBytesSha256, grantEventOrdinal, candidatePayload, auditPayload, preexistingAuditRecord }) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true, "GRANT_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "GRANT_POLICY_RECOMPUTE");
  assert(grantPayload.policyRegistryReady === true && grantPayload.policyRegistrySealed === true, "GRANT_POLICY_FLAGS");
  assert(grantPayload.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "GRANT_POLICY_ROOT");
  for (const [field, value] of Object.entries(policyRegistry.roots)) assert(grantPayload[field] === value, "GRANT_POLICY_COMPONENT_ROOT", field);
  assert(candidatePayload.policyDesignContractSha256 === policyRegistry.policyDesignContractSha256, "GRANT_POLICY_DESIGN_CONTRACT");
  exactKeys(preexistingAuditRecord, [
    "auditReportSha256", "auditManifestSha256", "auditCanonicalBytesSha256", "verdict",
    "candidateEventSha256", "candidateCanonicalBytesSha256", "candidateEventOrdinal",
    "auditReportEventOrdinal", "auditManifestRecordedOrdinal", "recordedBeforeGrant"
  ], "GRANT_PREEXISTING_AUDIT_RECORD_FIELDS");
  assert(["auditReportSha256", "auditManifestSha256", "auditCanonicalBytesSha256", "candidateEventSha256", "candidateCanonicalBytesSha256"].every((field) => HASH.test(preexistingAuditRecord[field])), "GRANT_PREEXISTING_AUDIT_HASH");
  assert(preexistingAuditRecord.recordedBeforeGrant === true && preexistingAuditRecord.verdict === "PASS_NO_BLOCKERS", "GRANT_PREEXISTING_AUDIT_VERDICT");
  assert(Number.isInteger(grantEventOrdinal) &&
    Number.isInteger(preexistingAuditRecord.candidateEventOrdinal) &&
    Number.isInteger(preexistingAuditRecord.auditReportEventOrdinal) &&
    Number.isInteger(preexistingAuditRecord.auditManifestRecordedOrdinal) &&
    preexistingAuditRecord.candidateEventOrdinal < preexistingAuditRecord.auditReportEventOrdinal &&
    preexistingAuditRecord.auditReportEventOrdinal <= preexistingAuditRecord.auditManifestRecordedOrdinal &&
    preexistingAuditRecord.auditManifestRecordedOrdinal < grantEventOrdinal,
  "GRANT_PREEXISTING_AUDIT_ORDER");
  assert(grantPayload.candidateAuditReportSha256 === preexistingAuditRecord.auditReportSha256, "GRANT_AUDIT_REPORT_RECORD_BINDING");
  assert(grantPayload.candidateAuditManifestSha256 === preexistingAuditRecord.auditManifestSha256, "GRANT_AUDIT_MANIFEST_RECORD_BINDING");
  assert(grantPayload.candidateAuditCanonicalBytesSha256 === preexistingAuditRecord.auditCanonicalBytesSha256, "GRANT_AUDIT_CANONICAL_RECORD_BINDING");
  assert(grantPayload.candidateEventSha256 === preexistingAuditRecord.candidateEventSha256 && grantPayload.candidateCanonicalBytesSha256 === preexistingAuditRecord.candidateCanonicalBytesSha256, "GRANT_CANDIDATE_RECORD_BINDING");
  assert(candidatePayload.stateBefore === "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE" && candidatePayload.stateAfter === "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE", "GRANT_CANDIDATE_STATE");
  assert(auditPayload.stateBefore === "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE" && auditPayload.stateAfter === "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE", "GRANT_AUDIT_STATE");
  assert(grantPayload.stateBefore === "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE" && grantPayload.stateAfter === "ACTIVATION_GRANTED", "GRANT_STATE");
  assert(auditPayload.candidateEventSha256 === grantPayload.candidateEventSha256 && auditPayload.candidateCanonicalBytesSha256 === grantPayload.candidateCanonicalBytesSha256, "GRANT_AUDIT_CANDIDATE_BINDING");
  assert(auditPayload.candidateAuthorPrincipalCommitmentSha256 === candidatePayload.candidateAuthorPrincipalCommitmentSha256, "GRANT_CANDIDATE_AUTHOR_BINDING");
  assert(auditPayload.identityRegistryRootSha256 === candidatePayload.identityRegistryRootSha256, "GRANT_IDENTITY_REGISTRY_BINDING");
  assert(new Set([candidatePayload.candidateAuthorPrincipalCommitmentSha256, auditPayload.auditorPrincipalCommitmentSha256, grantPayload.grantAuthorPrincipalCommitmentSha256]).size === 3, "GRANT_PRINCIPAL_SEPARATION");
  assert(candidatePayload.authorityGranted === false && candidatePayload.resultAccessAuthorized === false, "GRANT_CANDIDATE_PREAUTHORITY");
  assert(auditPayload.authorityGranted === false && auditPayload.resultAccessAuthorized === false && auditPayload.verdict === "PASS_NO_BLOCKERS", "GRANT_AUDIT_PREAUTHORITY");
  assert(grantPayload.candidateCanonicalBytesSha256 === canonicalPayloadFrame("ACTIVATION_CANDIDATE", candidatePayload).sha256, "GRANT_CANDIDATE_CANONICAL_BINDING");
  assert(grantPayload.candidateAuditCanonicalBytesSha256 === canonicalPayloadFrame("ACTIVATION_CANDIDATE_AUDIT_REPORT", auditPayload).sha256, "GRANT_AUDIT_CANONICAL_BINDING");
  assert(grantPayload.candidateAuditVerdict === "PASS_NO_BLOCKERS", "GRANT_AUDIT_VERDICT");
  assert(grantPayload.coverageRecomputationRootSha256 === candidatePayload.coverageRecomputationRootSha256 && grantPayload.coverageRecomputationRootSha256 === auditPayload.coverageRecomputationRootSha256, "GRANT_COVERAGE_ROOT");
  assert(grantPayload.authorityGranted === true && grantPayload.resultAccessAuthorized === true, "GRANT_AUTHORITY_FLAGS");
  validateCanonicalPayloadDigest("ACTIVATION_GRANT", grantPayload, grantCanonicalBytesSha256);
  return true;
}
