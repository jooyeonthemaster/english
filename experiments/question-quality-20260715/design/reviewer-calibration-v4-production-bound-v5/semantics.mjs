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
const ZERO_HASH = "0".repeat(64);

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

function canonicalClone(value, code = "SEM_CANONICAL_CLONE") {
  try {
    return JSON.parse(canonicalizeJcs(value));
  } catch (error) {
    fail(code, error.code ?? error.message);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function canonicalBase64Bytes(value, expectedLength, code) {
  assert(typeof value === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), code);
  const decoded = Buffer.from(value, "base64");
  assert(decoded.length === expectedLength && decoded.toString("base64") === value, code);
  return decoded;
}

function strictInstant(value, code) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), code);
  const millis = Date.parse(value);
  assert(Number.isFinite(millis) && new Date(millis).toISOString() === value, code);
  return millis;
}

export function canonicalLedgerEventSha256(event) {
  assert(event && typeof event === "object" && !Array.isArray(event), "LEDGER_EVENT_OBJECT");
  const body = canonicalClone(event, "LEDGER_EVENT_CANONICAL");
  delete body.eventSha256;
  return framedHash("NARA-QCAL-V5-AUTHORITATIVE-LEDGER-EVENT\u0000", body);
}

export function appendAuthoritativeLedgerEvent(events, eventBody) {
  assert(Array.isArray(events), "LEDGER_EVENTS_ARRAY");
  const previous = events.at(-1);
  const event = {
    ...canonicalClone(eventBody, "LEDGER_EVENT_BODY"),
    eventOrdinal: events.length === 0 ? 1 : previous.eventOrdinal + 1,
    priorEventSha256: events.length === 0 ? ZERO_HASH : previous.eventSha256
  };
  event.eventSha256 = canonicalLedgerEventSha256(event);
  return deepFreeze(event);
}

export function validateAuthoritativeAppendOnlyLedger(events, { allowedKinds = null } = {}) {
  assert(Array.isArray(events), "LEDGER_EVENTS_ARRAY");
  let previousHash = ZERO_HASH;
  let previousTime = -Infinity;
  const seenHashes = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assert(event && typeof event === "object" && !Array.isArray(event), "LEDGER_EVENT_OBJECT");
    assert(Number.isSafeInteger(event.eventOrdinal) && event.eventOrdinal === index + 1, "LEDGER_EVENT_ORDINAL");
    assert(event.priorEventSha256 === previousHash, "LEDGER_PRIOR_HASH");
    assert(HASH.test(event.eventSha256) && event.eventSha256 === canonicalLedgerEventSha256(event), "LEDGER_EVENT_HASH");
    assert(!seenHashes.has(event.eventSha256), "LEDGER_EVENT_HASH_REUSE");
    if (allowedKinds !== null) assert(allowedKinds.includes(event.eventKind), "LEDGER_EVENT_KIND");
    const time = strictInstant(event.occurredAtRfc3339, "LEDGER_EVENT_TIME");
    assert(time >= previousTime, "LEDGER_EVENT_TIME_ORDER");
    seenHashes.add(event.eventSha256);
    previousHash = event.eventSha256;
    previousTime = time;
  }
  return deepFreeze({
    eventCount: events.length,
    lastEventSha256: previousHash,
    nextEventOrdinal: events.length + 1
  });
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

export function validateIdentityCustodianAttestation({ attestation, trustedCustodianPublicKeysByPrincipal, trustedCustodianKeySha256ByPrincipal, expectedBinding = null, expectedCanonicalPseudonyms = null }) {
  exactKeys(attestation, [
    "attestationVersion", "authorityNamespace", "canonicalPseudonyms",
    "canonicalSourceIdCommitmentSha256", "custodianPrincipalCommitmentSha256",
    "custodianPublicKeySha256", "custodianRole", "principalCommitmentSha256",
    "signatureAlgorithm", "signatureBase64", "verdict", "attestationSha256"
  ], "IDENTITY_ATTESTATION_FIELDS");
  assert(attestation.attestationVersion === IDENTITY_BINDING_VERSION, "IDENTITY_ATTESTATION_VERSION");
  assert(canonicalizeAuthorityNamespace(attestation.authorityNamespace) === attestation.authorityNamespace, "IDENTITY_ATTESTATION_NAMESPACE");
  assert(HASH.test(attestation.canonicalSourceIdCommitmentSha256) &&
    HASH.test(attestation.custodianPrincipalCommitmentSha256) &&
    HASH.test(attestation.custodianPublicKeySha256) &&
    HASH.test(attestation.principalCommitmentSha256) &&
    HASH.test(attestation.attestationSha256), "IDENTITY_ATTESTATION_HASH_FIELDS");
  assert(attestation.custodianRole === "IDENTITY_BINDING_CUSTODIAN" &&
    attestation.signatureAlgorithm === "Ed25519" &&
    attestation.verdict === "ATTEST_ONE_PRINCIPAL_BINDING", "IDENTITY_ATTESTATION_SEMANTICS");
  assert(attestation.custodianPrincipalCommitmentSha256 !== attestation.principalCommitmentSha256, "IDENTITY_SELF_ATTESTATION");
  const pseudonyms = attestation.canonicalPseudonyms.map(canonicalizePseudonym);
  assert(pseudonyms.length >= 1 && new Set(pseudonyms).size === pseudonyms.length, "IDENTITY_PSEUDONYM_SET");
  assert(JSON.stringify(pseudonyms) === JSON.stringify([...pseudonyms].sort()), "IDENTITY_PSEUDONYM_ORDER");
  const signature = canonicalBase64Bytes(attestation.signatureBase64, 64, "IDENTITY_ATTESTATION_SIGNATURE_CANONICAL_BASE64");
  const trustedPublicKey = trustedCustodianPublicKeysByPrincipal?.[attestation.custodianPrincipalCommitmentSha256];
  assert(Boolean(trustedPublicKey), "IDENTITY_UNTRUSTED_CUSTODIAN");
  const trustedKeySha256 = trustedCustodianKeySha256ByPrincipal?.[attestation.custodianPrincipalCommitmentSha256];
  assert(trustedKeySha256 === attestation.custodianPublicKeySha256, "IDENTITY_CUSTODIAN_KEY_FINGERPRINT");
  const signedPayload = {
    attestationVersion: attestation.attestationVersion,
    authorityNamespace: attestation.authorityNamespace,
    canonicalPseudonyms: pseudonyms,
    canonicalSourceIdCommitmentSha256: attestation.canonicalSourceIdCommitmentSha256,
    custodianPrincipalCommitmentSha256: attestation.custodianPrincipalCommitmentSha256,
    custodianPublicKeySha256: attestation.custodianPublicKeySha256,
    custodianRole: attestation.custodianRole,
    principalCommitmentSha256: attestation.principalCommitmentSha256,
    signatureAlgorithm: attestation.signatureAlgorithm,
    verdict: attestation.verdict
  };
  const expectedDigest = framedHash(`${IDENTITY_DOMAIN_PREFIX}CUSTODIAN_ATTESTATION\u0000`, {
    ...signedPayload,
    signatureBase64: attestation.signatureBase64
  });
  assert(attestation.attestationSha256 === expectedDigest, "IDENTITY_ATTESTATION_DIGEST");
  assert(verifyBytes(null, custodianAttestationSigningBytes(signedPayload), trustedPublicKey, signature), "IDENTITY_ATTESTATION_SIGNATURE_INVALID");
  if (expectedBinding !== null) {
    assert(attestation.attestationVersion === expectedBinding.identityBindingVersion &&
      attestation.authorityNamespace === expectedBinding.authorityNamespace &&
      attestation.canonicalSourceIdCommitmentSha256 === expectedBinding.canonicalSourceIdCommitmentSha256 &&
      attestation.principalCommitmentSha256 === expectedBinding.principalCommitmentSha256,
    "IDENTITY_ATTESTATION_SUBJECT_MISMATCH");
  }
  if (expectedCanonicalPseudonyms !== null) {
    const expected = expectedCanonicalPseudonyms.map(canonicalizePseudonym).sort();
    assert(JSON.stringify(pseudonyms) === JSON.stringify(expected), "IDENTITY_ATTESTATION_PSEUDONYM_SET_MISMATCH");
  }
  return deepFreeze(canonicalClone(attestation));
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
    exactKeys(binding, ["identityBindingVersion", "authorityNamespace", "canonicalSourceIdCommitmentSha256", "principalCommitmentSha256"], "IDENTITY_BINDING_FIELDS");
    assert(binding.identityBindingVersion === IDENTITY_BINDING_VERSION && canonicalizeAuthorityNamespace(binding.authorityNamespace) === binding.authorityNamespace, "IDENTITY_BINDING_VERSION_NAMESPACE");
    const validatedAttestation = validateIdentityCustodianAttestation({
      attestation,
      trustedCustodianPublicKeysByPrincipal: registry.trustedCustodianPublicKeysByPrincipal,
      trustedCustodianKeySha256ByPrincipal: registry.trustedCustodianKeySha256ByPrincipal,
      expectedBinding: binding
    });
    const existingForSource = registry.principalByCanonicalSourceCommitment[binding.canonicalSourceIdCommitmentSha256];
    assert(existingForSource === undefined || existingForSource === binding.principalCommitmentSha256, "IDENTITY_SOURCE_TO_MULTIPLE_PRINCIPALS");
    const existingPrincipal = registry.principalRecords[binding.principalCommitmentSha256];
    assert(existingPrincipal === undefined || existingPrincipal.canonicalSourceIdCommitmentSha256 === binding.canonicalSourceIdCommitmentSha256, "IDENTITY_PRINCIPAL_TO_MULTIPLE_SOURCES");
    for (const pseudonym of validatedAttestation.canonicalPseudonyms) {
      const canonical = canonicalizePseudonym(pseudonym);
      const owner = registry.principalByCanonicalPseudonym[canonical];
      assert(owner === undefined || owner === binding.principalCommitmentSha256, "IDENTITY_PSEUDONYM_COLLISION");
    }
    registry.principalRecords[binding.principalCommitmentSha256] = {
      authorityNamespace: binding.authorityNamespace,
      canonicalSourceIdCommitmentSha256: binding.canonicalSourceIdCommitmentSha256,
      custodianAttestationSha256: validatedAttestation.attestationSha256
    };
    registry.principalByCanonicalSourceCommitment[binding.canonicalSourceIdCommitmentSha256] = binding.principalCommitmentSha256;
    const pseudonymSet = new Set(registry.canonicalPseudonymsByPrincipal[binding.principalCommitmentSha256] ?? []);
    for (const pseudonym of validatedAttestation.canonicalPseudonyms) {
      const canonical = canonicalizePseudonym(pseudonym);
      registry.principalByCanonicalPseudonym[canonical] = binding.principalCommitmentSha256;
      pseudonymSet.add(canonical);
    }
    registry.canonicalPseudonymsByPrincipal[binding.principalCommitmentSha256] = [...pseudonymSet].sort();
    registry.custodianAttestations[validatedAttestation.attestationSha256] = canonicalClone(validatedAttestation);
    return { decision: "REGISTER", principalCommitmentSha256: binding.principalCommitmentSha256, attestationSha256: validatedAttestation.attestationSha256 };
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

function validateIdentityRegistryStructure(registry) {
  assert(registry.version === IDENTITY_BINDING_VERSION, "IDENTITY_REGISTRY_VERSION");
  const principalCommitments = Object.keys(registry.principalRecords).sort();
  assert(principalCommitments.length >= 1, "IDENTITY_EMPTY_REGISTRY");
  assert(Object.keys(registry.principalByCanonicalSourceCommitment).length === principalCommitments.length, "IDENTITY_SOURCE_CARDINALITY");
  const forwardPseudonyms = [];
  for (const principal of principalCommitments) {
    assert(HASH.test(principal), "IDENTITY_PRINCIPAL_KEY", principal);
    const record = registry.principalRecords[principal];
    exactKeys(record, ["authorityNamespace", "canonicalSourceIdCommitmentSha256", "custodianAttestationSha256"], "IDENTITY_PRINCIPAL_RECORD_FIELDS");
    assert(canonicalizeAuthorityNamespace(record.authorityNamespace) === record.authorityNamespace &&
      HASH.test(record.canonicalSourceIdCommitmentSha256) &&
      HASH.test(record.custodianAttestationSha256), "IDENTITY_PRINCIPAL_RECORD");
    assert(registry.principalByCanonicalSourceCommitment[record.canonicalSourceIdCommitmentSha256] === principal, "IDENTITY_SOURCE_FORWARD_REVERSE_MISMATCH");
    const pseudonyms = registry.canonicalPseudonymsByPrincipal[principal];
    assert(Array.isArray(pseudonyms) && pseudonyms.length >= 1, "IDENTITY_PRINCIPAL_WITHOUT_PSEUDONYM", principal);
    const canonicalPseudonyms = pseudonyms.map(canonicalizePseudonym);
    assert(new Set(canonicalPseudonyms).size === canonicalPseudonyms.length &&
      JSON.stringify(canonicalPseudonyms) === JSON.stringify([...canonicalPseudonyms].sort()), "IDENTITY_PRINCIPAL_PSEUDONYM_SET", principal);
    for (const pseudonym of canonicalPseudonyms) {
      assert(registry.principalByCanonicalPseudonym[pseudonym] === principal, "IDENTITY_PSEUDONYM_FORWARD_REVERSE_MISMATCH", pseudonym);
      forwardPseudonyms.push(pseudonym);
    }
    const attestation = registry.custodianAttestations[record.custodianAttestationSha256];
    assert(Boolean(attestation), "IDENTITY_RAW_ATTESTATION_MISSING", principal);
    validateIdentityCustodianAttestation({
      attestation,
      trustedCustodianPublicKeysByPrincipal: registry.trustedCustodianPublicKeysByPrincipal,
      trustedCustodianKeySha256ByPrincipal: registry.trustedCustodianKeySha256ByPrincipal,
      expectedBinding: {
        identityBindingVersion: IDENTITY_BINDING_VERSION,
        authorityNamespace: record.authorityNamespace,
        canonicalSourceIdCommitmentSha256: record.canonicalSourceIdCommitmentSha256,
        principalCommitmentSha256: principal
      },
      expectedCanonicalPseudonyms: canonicalPseudonyms
    });
  }
  assert(Object.keys(registry.canonicalPseudonymsByPrincipal).length === principalCommitments.length, "IDENTITY_PRINCIPAL_FORWARD_CARDINALITY");
  const reversePseudonyms = Object.keys(registry.principalByCanonicalPseudonym).sort();
  assert(new Set(forwardPseudonyms).size === forwardPseudonyms.length &&
    JSON.stringify([...forwardPseudonyms].sort()) === JSON.stringify(reversePseudonyms), "IDENTITY_PSEUDONYM_BIJECTION_CARDINALITY");
  for (const [sourceCommitment, principal] of Object.entries(registry.principalByCanonicalSourceCommitment)) {
    assert(HASH.test(sourceCommitment) && HASH.test(principal), "IDENTITY_SOURCE_REVERSE_ENTRY");
    assert(registry.principalRecords[principal]?.canonicalSourceIdCommitmentSha256 === sourceCommitment, "IDENTITY_SOURCE_REVERSE_FORWARD_MISMATCH");
  }
  assert(Object.keys(registry.custodianAttestations).length === principalCommitments.length, "IDENTITY_ATTESTATION_CARDINALITY");
  const rootPayload = {
    canonicalPseudonymsByPrincipal: registry.canonicalPseudonymsByPrincipal,
    custodianAttestations: registry.custodianAttestations,
    principalByCanonicalPseudonym: registry.principalByCanonicalPseudonym,
    principalByCanonicalSourceCommitment: registry.principalByCanonicalSourceCommitment,
    principalRecords: registry.principalRecords,
    trustedCustodianKeySha256ByPrincipal: registry.trustedCustodianKeySha256ByPrincipal,
    version: registry.version
  };
  return framedHash(`${IDENTITY_DOMAIN_PREFIX}REGISTRY_ROOT\u0000`, rootPayload);
}

export function sealIdentityRegistry(registry) {
  assert(registry.sealed === false, "IDENTITY_ALREADY_SEALED");
  registry.registryRootSha256 = validateIdentityRegistryStructure(registry);
  registry.ready = true;
  registry.sealed = true;
  return registry.registryRootSha256;
}

export function validateSealedIdentityRegistry(registry) {
  assert(registry.ready === true && registry.sealed === true && HASH.test(registry.registryRootSha256), "IDENTITY_REGISTRY_UNREADY");
  assert(validateIdentityRegistryStructure(registry) === registry.registryRootSha256, "IDENTITY_REGISTRY_ROOT_MISMATCH");
  return true;
}

export function validateRoleAssignmentIdentity(identityRegistry, assignment) {
  validateSealedIdentityRegistry(identityRegistry);
  assert(assignment.identityRegistryRootSha256 === identityRegistry.registryRootSha256, "IDENTITY_REGISTRY_ROOT_BINDING");
  const canonicalPseudonym = canonicalizePseudonym(assignment.actorPseudonym);
  assert(canonicalPseudonym === assignment.canonicalPseudonym, "IDENTITY_PSEUDONYM_NOT_CANONICAL");
  assert(identityRegistry.principalByCanonicalPseudonym[canonicalPseudonym] === assignment.principalCommitmentSha256, "IDENTITY_PSEUDONYM_PRINCIPAL_MISMATCH");
  const record = identityRegistry.principalRecords[assignment.principalCommitmentSha256];
  assert(Boolean(record), "IDENTITY_UNKNOWN_PRINCIPAL");
  assert(record.custodianAttestationSha256 === assignment.identityCustodianAttestationSha256, "IDENTITY_ATTESTATION_MISMATCH");
  const attestation = identityRegistry.custodianAttestations[record.custodianAttestationSha256];
  assert(Boolean(attestation) && attestation.principalCommitmentSha256 === assignment.principalCommitmentSha256 &&
    attestation.canonicalPseudonyms.includes(canonicalPseudonym), "IDENTITY_ASSIGNMENT_RAW_ATTESTATION_BINDING");
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
  const source = canonicalClone({ policyRows, stateDenySets, resourceProofs, stateTransitionProofs, postActivationScope }, "POLICY_SOURCE_CANONICAL");
  assert(source.policyRows.length >= 1, "POLICY_ROWS_EMPTY");
  assert(Object.keys(source.stateDenySets).length === STATES.length && STATES.every((state) => Array.isArray(source.stateDenySets[state]) && source.stateDenySets[state].length > 0 && new Set(source.stateDenySets[state]).size === source.stateDenySets[state].length && source.stateDenySets[state].every((resource) => RESOURCE_CLASSES.includes(resource))), "POLICY_STATE_DENY_INCOMPLETE");
  const expectedResourceProofKeys = source.policyRows.flatMap((row) => RESOURCE_CLASSES.map((resourceClass) => `${row.phase}|${row.state}|${resourceClass}`)).sort();
  assert(Array.isArray(source.resourceProofs) && source.resourceProofs.length === expectedResourceProofKeys.length && source.resourceProofs.every((proof) => HASH.test(proof.sha256)), "POLICY_RESOURCE_PROOFS_EMPTY");
  const resourceProofKeys = source.resourceProofs.map((proof) => `${proof.phase}|${proof.state}|${proof.resourceClass}`).sort();
  assert(JSON.stringify(resourceProofKeys) === JSON.stringify(expectedResourceProofKeys), "POLICY_RESOURCE_PROOFS_INCOMPLETE");
  assert(Array.isArray(source.stateTransitionProofs) && source.stateTransitionProofs.length === STATES.length - 1 && source.stateTransitionProofs.every((proof) => HASH.test(proof.sha256)), "POLICY_TRANSITION_PROOFS_EMPTY");
  for (let index = 0; index < source.stateTransitionProofs.length; index += 1) {
    assert(source.stateTransitionProofs[index].from === STATES[index] && source.stateTransitionProofs[index].to === STATES[index + 1], "POLICY_TRANSITION_PROOFS_INCOMPLETE");
  }
  assert(source.postActivationScope && source.postActivationScope.state === "ACTIVATION_GRANTED" && source.postActivationScope.phase === "POST_ACTIVATION_RESULT", "POLICY_POST_SCOPE");
  const tuples = buildPolicyTuples(source.policyRows);
  const postRow = source.policyRows.find((row) => row.phase === "POST_ACTIVATION_RESULT" && row.state === "ACTIVATION_GRANTED");
  assert(Boolean(postRow) && postRow.allowResources.length > 0 && postRow.denyResources.length > 0 && postRow.allowedRoles.length > 0 && postRow.deniedRoles.length > 0, "POLICY_POST_ROW_INCOMPLETE");
  const roots = {
    policyMatrixRootSha256: root("MATRIX", tuples),
    allStateAllowRootSha256: root("ALL_STATE_ALLOW", source.policyRows.map((row) => ({ phase: row.phase, state: row.state, allowResources: row.allowResources }))),
    allStateDenyRootSha256: root("ALL_STATE_DENY", source.stateDenySets),
    allTupleAllowedRolesRootSha256: root("ALL_ALLOWED_ROLES", tuples.map((tuple) => ({ phase: tuple.phase, state: tuple.state, resourceClass: tuple.resourceClass, allowedRoles: tuple.allowedRoles }))),
    allTupleDeniedRolesRootSha256: root("ALL_DENIED_ROLES", tuples.map((tuple) => ({ phase: tuple.phase, state: tuple.state, resourceClass: tuple.resourceClass, deniedRoles: tuple.deniedRoles }))),
    resourceClassProofRootSha256: root("RESOURCE_PROOFS", source.resourceProofs),
    stateTransitionProofRootSha256: root("TRANSITION_PROOFS", source.stateTransitionProofs),
    postActivationScopeProofSha256: root("POST_SCOPE", source.postActivationScope),
    postActivationAllowRootSha256: root("POST_ALLOW", postRow.allowResources),
    postActivationDenyRootSha256: root("POST_DENY", postRow.denyResources),
    postActivationAllowedRolesRootSha256: root("POST_ALLOWED_ROLES", postRow.allowedRoles),
    postActivationDeniedRolesRootSha256: root("POST_DENIED_ROLES", postRow.deniedRoles)
  };
  const policyDesignContractSha256 = root("DESIGN_CONTRACT", {
    bindingVersion: POLICY_BINDING_VERSION,
    policyRows: source.policyRows,
    postActivationScope: source.postActivationScope,
    stateDenySets: source.stateDenySets
  });
  const sealedPolicyRegistryRootSha256 = root("SEALED_REGISTRY", {
    bindingVersion: POLICY_BINDING_VERSION,
    policyDesignContractSha256,
    roots,
    tupleCount: tuples.length
  });
  return deepFreeze({
    bindingVersion: POLICY_BINDING_VERSION,
    policyRows: source.policyRows,
    stateDenySets: source.stateDenySets,
    resourceProofs: source.resourceProofs,
    stateTransitionProofs: source.stateTransitionProofs,
    postActivationScope: source.postActivationScope,
    tuples,
    roots,
    policyDesignContractSha256,
    tupleCount: tuples.length,
    ready: true,
    sealed: true,
    sealedPolicyRegistryRootSha256
  });
}

export function deriveAuthoritativeCurrentState(stateEventLedger) {
  validateAuthoritativeAppendOnlyLedger(stateEventLedger, { allowedKinds: ["STATE_TRANSITION"] });
  let currentState = STATES[0];
  let currentStateEvent = null;
  for (const event of stateEventLedger) {
    exactKeys(event, [
      "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
      "fromState", "toState", "stateTransitionProofSha256"
    ], "STATE_LEDGER_EVENT_FIELDS");
    const fromIndex = STATES.indexOf(event.fromState);
    assert(fromIndex >= 0 && event.fromState === currentState && event.toState === STATES[fromIndex + 1], "STATE_LEDGER_TRANSITION");
    assert(HASH.test(event.stateTransitionProofSha256), "STATE_LEDGER_TRANSITION_PROOF");
    currentState = event.toState;
    currentStateEvent = event;
  }
  return deepFreeze({ currentState, currentStateEvent, eventCount: stateEventLedger.length });
}

export function deriveAuthoritativeIdentityState(identityRegistry, identityEventLedger) {
  validateSealedIdentityRegistry(identityRegistry);
  validateAuthoritativeAppendOnlyLedger(identityEventLedger, {
    allowedKinds: ["IDENTITY_ALIAS_ACTIVATED", "ROLE_ASSIGNMENT_ACTIVATED", "ROLE_ASSIGNMENT_REVOKED"]
  });
  const currentAliasByPrincipal = {};
  const activeRoleAssignmentByPrincipalRole = {};
  for (const event of identityEventLedger) {
    assert(event.identityRegistryRootSha256 === identityRegistry.registryRootSha256, "IDENTITY_LEDGER_REGISTRY_ROOT");
    assert(HASH.test(event.principalCommitmentSha256) && Boolean(identityRegistry.principalRecords[event.principalCommitmentSha256]), "IDENTITY_LEDGER_PRINCIPAL");
    if (event.eventKind === "IDENTITY_ALIAS_ACTIVATED") {
      exactKeys(event, [
        "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
        "principalCommitmentSha256", "canonicalPseudonym", "identityRegistryRootSha256"
      ], "IDENTITY_ALIAS_EVENT_FIELDS");
      const alias = canonicalizePseudonym(event.canonicalPseudonym);
      assert(alias === event.canonicalPseudonym &&
        identityRegistry.principalByCanonicalPseudonym[alias] === event.principalCommitmentSha256,
      "IDENTITY_LEDGER_ALIAS_BINDING");
      currentAliasByPrincipal[event.principalCommitmentSha256] = alias;
      continue;
    }
    if (event.eventKind === "ROLE_ASSIGNMENT_ACTIVATED") {
      exactKeys(event, [
        "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
        "principalCommitmentSha256", "canonicalPseudonym", "role", "identityRegistryRootSha256"
      ], "IDENTITY_ROLE_ACTIVATION_FIELDS");
      assert(ROLES.includes(event.role), "IDENTITY_LEDGER_ROLE");
      assert(currentAliasByPrincipal[event.principalCommitmentSha256] === event.canonicalPseudonym, "IDENTITY_ROLE_ALIAS_NOT_CURRENT");
      const key = `${event.principalCommitmentSha256}|${event.role}`;
      assert(activeRoleAssignmentByPrincipalRole[key] === undefined, "IDENTITY_ROLE_ALREADY_ACTIVE");
      activeRoleAssignmentByPrincipalRole[key] = event;
      continue;
    }
    exactKeys(event, [
      "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
      "principalCommitmentSha256", "canonicalPseudonym", "role", "identityRegistryRootSha256",
      "roleAssignmentEventSha256"
    ], "IDENTITY_ROLE_REVOCATION_FIELDS");
    assert(ROLES.includes(event.role), "IDENTITY_LEDGER_ROLE");
    const key = `${event.principalCommitmentSha256}|${event.role}`;
    const active = activeRoleAssignmentByPrincipalRole[key];
    assert(Boolean(active) && active.eventSha256 === event.roleAssignmentEventSha256 &&
      active.canonicalPseudonym === event.canonicalPseudonym, "IDENTITY_ROLE_REVOCATION_BINDING");
    delete activeRoleAssignmentByPrincipalRole[key];
  }
  return deepFreeze({
    currentAliasByPrincipal,
    activeRoleAssignmentByPrincipalRole,
    eventCount: identityEventLedger.length
  });
}

export function validateAuthorizationAgainstPolicy({
  policyRegistry,
  authorization,
  identityRegistry,
  stateEventLedger,
  identityEventLedger,
  activeRoleAssignments = null
}) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true && HASH.test(policyRegistry.sealedPolicyRegistryRootSha256), "AUTH_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "AUTH_POLICY_ROOT_MISMATCH");
  const authoritativeState = deriveAuthoritativeCurrentState(stateEventLedger);
  assert(authorization.currentState === authoritativeState.currentState, "AUTH_CURRENT_STATE_NOT_AUTHORITATIVE");
  const tuple = recomputed.tuples.find((entry) => entry.phase === authorization.phase && entry.state === authoritativeState.currentState && entry.resourceClass === authorization.resourceClass);
  assert(Boolean(tuple) && tuple.resourceDecision === "ALLOW", "AUTH_POLICY_TUPLE_NOT_ALLOWED");
  assert(HASH.test(authorization.actorPrincipalCommitmentSha256), "AUTH_ACTOR_PRINCIPAL");
  const authoritativeIdentity = deriveAuthoritativeIdentityState(identityRegistry, identityEventLedger);
  const assignment = authoritativeIdentity.activeRoleAssignmentByPrincipalRole[
    `${authorization.actorPrincipalCommitmentSha256}|${authorization.actorRole}`
  ];
  assert(Boolean(assignment), "AUTH_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND");
  assert(HASH.test(assignment.eventSha256) && authorization.activeRoleAssignmentEventSha256 === assignment.eventSha256, "AUTH_ROLE_ASSIGNMENT_EVENT_BINDING");
  assert(authorization.identityRegistryRootSha256 === identityRegistry.registryRootSha256 &&
    assignment.identityRegistryRootSha256 === identityRegistry.registryRootSha256, "AUTH_IDENTITY_REGISTRY_BINDING");
  const canonicalPseudonym = canonicalizePseudonym(authorization.actorPseudonym);
  assert(canonicalPseudonym === authorization.actorCanonicalPseudonym &&
    canonicalPseudonym === assignment.canonicalPseudonym &&
    canonicalPseudonym === authoritativeIdentity.currentAliasByPrincipal[authorization.actorPrincipalCommitmentSha256],
  "AUTH_CURRENT_ALIAS_NOT_AUTHORITATIVE");
  if (activeRoleAssignments !== null) {
    assert(Array.isArray(activeRoleAssignments), "AUTH_LEGACY_ASSIGNMENTS_ARRAY");
    const legacy = activeRoleAssignments.find((entry) =>
      entry.principalCommitmentSha256 === authorization.actorPrincipalCommitmentSha256 &&
      entry.role === authorization.actorRole &&
      entry.active === true
    );
    assert(Boolean(legacy) && legacy.eventSha256 === assignment.eventSha256 &&
      legacy.canonicalPseudonym === assignment.canonicalPseudonym, "AUTH_LEGACY_ASSIGNMENT_MISMATCH");
  }
  assert(tuple.allowedRoles.includes(authorization.actorRole), "AUTH_ROLE_NOT_ALLOWED");
  assert(!tuple.deniedRoles.includes(authorization.actorRole), "AUTH_ROLE_EXPLICITLY_DENIED");
  assert(authorization.allowedRolesRootSha256 === tuple.allowedRolesRootSha256, "AUTH_ALLOWED_ROLES_ROOT_BINDING");
  assert(authorization.deniedRolesRootSha256 === tuple.deniedRolesRootSha256, "AUTH_DENIED_ROLES_ROOT_BINDING");
  assert(authorization.policyTupleSha256 === tuple.policyTupleSha256, "AUTH_POLICY_TUPLE_BINDING");
  const resourceProof = recomputed.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
  assert(Boolean(resourceProof) && authorization.resourceClassPolicyProofSha256 === resourceProof.sha256, "AUTH_RESOURCE_PROOF_BINDING");
  const stateProof = recomputed.stateTransitionProofs.find((proof) => proof.to === tuple.state);
  assert(Boolean(stateProof) && authoritativeState.currentStateEvent?.stateTransitionProofSha256 === stateProof.sha256 &&
    authorization.stateTransitionEvidenceSha256 === stateProof.sha256, "AUTH_STATE_PROOF_BINDING");
  assert(authorization.sealedPolicyRegistryRootSha256 === recomputed.sealedPolicyRegistryRootSha256, "AUTH_POLICY_REGISTRY_BINDING");
  for (const field of ["policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256"])
    assert(authorization[field] === recomputed.roots[field], "AUTH_POLICY_ROOT_BINDING", field);
  return true;
}

export function validateDenialAgainstPolicy({
  policyRegistry,
  denial,
  identityRegistry,
  stateEventLedger,
  identityEventLedger
}) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true && HASH.test(policyRegistry.sealedPolicyRegistryRootSha256), "DENY_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "DENY_POLICY_ROOT_MISMATCH");
  const authoritativeState = deriveAuthoritativeCurrentState(stateEventLedger);
  assert(denial.currentState === authoritativeState.currentState, "DENY_CURRENT_STATE_NOT_AUTHORITATIVE");
  const tuple = recomputed.tuples.find((entry) => entry.phase === denial.phase && entry.state === authoritativeState.currentState && entry.resourceClass === denial.resourceClass);
  assert(Boolean(tuple), "DENY_POLICY_TUPLE_NOT_FOUND");
  const deniedByResource = tuple.resourceDecision === "DENY";
  const deniedByRole = !tuple.allowedRoles.includes(denial.actorRole) || tuple.deniedRoles.includes(denial.actorRole);
  assert(deniedByResource || deniedByRole, "DENY_REQUEST_WOULD_BE_ALLOWED");
  assert(HASH.test(denial.actorPrincipalCommitmentSha256), "DENY_ACTOR_IDENTITY");
  const authoritativeIdentity = deriveAuthoritativeIdentityState(identityRegistry, identityEventLedger);
  const assignment = authoritativeIdentity.activeRoleAssignmentByPrincipalRole[
    `${denial.actorPrincipalCommitmentSha256}|${denial.actorRole}`
  ];
  assert(Boolean(assignment), "DENY_ACTIVE_ROLE_ASSIGNMENT_NOT_FOUND");
  assert(denial.activeRoleAssignmentEventSha256 === assignment.eventSha256, "DENY_ROLE_ASSIGNMENT_EVENT_BINDING");
  assert(denial.identityRegistryRootSha256 === identityRegistry.registryRootSha256 &&
    assignment.identityRegistryRootSha256 === identityRegistry.registryRootSha256, "DENY_IDENTITY_REGISTRY_BINDING");
  const canonicalPseudonym = canonicalizePseudonym(denial.actorPseudonym);
  assert(canonicalPseudonym === denial.actorCanonicalPseudonym &&
    canonicalPseudonym === assignment.canonicalPseudonym &&
    canonicalPseudonym === authoritativeIdentity.currentAliasByPrincipal[denial.actorPrincipalCommitmentSha256],
  "DENY_CURRENT_ALIAS_NOT_AUTHORITATIVE");
  assert(denial.sealedPolicyRegistryRootSha256 === recomputed.sealedPolicyRegistryRootSha256, "DENY_POLICY_REGISTRY_BINDING");
  for (const field of ["policyMatrixRootSha256", "allStateAllowRootSha256", "allStateDenyRootSha256"])
    assert(denial[field] === recomputed.roots[field], "DENY_POLICY_ROOT_BINDING", field);
  assert(denial.allowedRolesRootSha256 === tuple.allowedRolesRootSha256, "DENY_ALLOWED_ROLES_ROOT_BINDING");
  assert(denial.deniedRolesRootSha256 === tuple.deniedRolesRootSha256, "DENY_DENIED_ROLES_ROOT_BINDING");
  assert(denial.policyTupleSha256 === tuple.policyTupleSha256, "DENY_POLICY_TUPLE_BINDING");
  const resourceProof = recomputed.resourceProofs.find((proof) => proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass);
  assert(Boolean(resourceProof) && denial.policyDecisionProofSha256 === resourceProof.sha256, "DENY_POLICY_DECISION_PROOF_BINDING");
  assert(denial.capabilityTokenSha256 === null && denial.authorizationEventSha256 === null, "DENY_CAPABILITY_CREATED");
  assert(denial.openedAtRfc3339 === null && denial.closedAtRfc3339 === null && denial.hasOpenConsumeOrClose === false, "DENY_ACCESS_EVENT_CREATED");
  assert(denial.decision === "DENY", "DENY_DECISION");
  return true;
}

const FOCUS_SCOPE_TYPES = Object.freeze(["GRAMMAR_ERROR", "BLANK_INFERENCE"]);
const ALL_SCOPE_TYPES = Object.freeze(Object.keys(CANONICAL_FAMILY_BY_TYPE));

function validateScopeEvidenceShape(evidence, code) {
  assert(evidence && typeof evidence === "object" && !Array.isArray(evidence), code);
  const expected = evidence.scopeEnum === "FOCUS_ONLY" ? FOCUS_SCOPE_TYPES :
    evidence.scopeEnum === "ALL_25" ? ALL_SCOPE_TYPES : null;
  assert(expected !== null && JSON.stringify(evidence.canonicalTypeIds) === JSON.stringify(expected) &&
    evidence.coverageCount === expected.length, code);
  return expected;
}

function assertScopeSubset(childTypes, parentTypes, code) {
  const parent = new Set(parentTypes);
  assert(childTypes.every((typeId) => parent.has(typeId)), code);
}

function validateActivationCertificateEvent(event, passedEventsBySha256, materializationsByEventSha256) {
  exactKeys(event, [
    "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
    "certificatePayload", "certificateCanonicalBytesSha256"
  ], "GRANT_CERTIFICATE_EVENT_FIELDS");
  exactKeys(event.certificatePayload, [
    "reviewerPrincipalCommitmentSha256", "scopeEvidence", "coverageRecomputationRootSha256",
    "identityRegistryRootSha256", "verdict"
  ], "GRANT_CERTIFICATE_PAYLOAD_FIELDS");
  assert(event.eventKind === "REVIEWER_CERTIFICATE" &&
    HASH.test(event.certificatePayload.reviewerPrincipalCommitmentSha256) &&
    HASH.test(event.certificatePayload.identityRegistryRootSha256) &&
    event.certificatePayload.verdict === "CERTIFY_SCOPE_ONLY", "GRANT_CERTIFICATE_PAYLOAD");
  const types = validateScopeEvidenceShape(event.certificatePayload.scopeEvidence, "GRANT_CERTIFICATE_SCOPE");
  const coverageRoot = recomputeCoverageEvidence(
    event.certificatePayload.scopeEvidence,
    passedEventsBySha256,
    materializationsByEventSha256,
    types
  );
  assert(event.certificatePayload.coverageRecomputationRootSha256 === coverageRoot, "GRANT_CERTIFICATE_COVERAGE_ROOT");
  assert(event.certificateCanonicalBytesSha256 === framedHash(
    "NARA-QCAL-V5-REVIEWER-CERTIFICATE-PAYLOAD\u0000",
    event.certificatePayload
  ), "GRANT_CERTIFICATE_CANONICAL_BYTES");
  return { event, types, coverageRoot };
}

export function validateGrantAgainstSealedPolicy({
  policyRegistry,
  grantPayload,
  grantCanonicalBytesSha256,
  grantEventOrdinal,
  candidatePayload = null,
  auditPayload = null,
  preexistingAuditRecord = null,
  authoritativeEventLedger,
  passedEventsBySha256,
  materializationsByEventSha256
}) {
  assert(policyRegistry.ready === true && policyRegistry.sealed === true, "GRANT_POLICY_UNREADY");
  const recomputed = sealPolicyRegistry(policyRegistry);
  assert(recomputed.sealedPolicyRegistryRootSha256 === policyRegistry.sealedPolicyRegistryRootSha256, "GRANT_POLICY_RECOMPUTE");
  validateAuthoritativeAppendOnlyLedger(authoritativeEventLedger, {
    allowedKinds: [
      "REVIEWER_CERTIFICATE", "ACTIVATION_CANDIDATE",
      "ACTIVATION_CANDIDATE_AUDIT_REPORT", "ACTIVATION_AUDIT_MANIFEST",
      "ACTIVATION_GRANT"
    ]
  });
  assert(passedEventsBySha256 && typeof passedEventsBySha256 === "object" &&
    materializationsByEventSha256 && typeof materializationsByEventSha256 === "object",
  "GRANT_COVERAGE_AUTHORITATIVE_MAPS");
  const grantEvents = authoritativeEventLedger.filter((event) =>
    event.eventKind === "ACTIVATION_GRANT" && event.eventOrdinal === grantEventOrdinal
  );
  assert(grantEvents.length === 1, "GRANT_EVENT_DEREFERENCE");
  const grantEvent = grantEvents[0];
  exactKeys(grantEvent, [
    "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
    "payload", "canonicalBytesSha256"
  ], "GRANT_EVENT_FIELDS");
  assert(canonicalizeJcs(grantEvent.payload) === canonicalizeJcs(grantPayload), "GRANT_EVENT_CONTENT");
  assert(grantEvent.canonicalBytesSha256 === grantCanonicalBytesSha256, "GRANT_EVENT_CANONICAL_BINDING");
  const candidateEvent = authoritativeEventLedger.find((event) =>
    event.eventSha256 === grantPayload.candidateEventSha256
  );
  assert(candidateEvent?.eventKind === "ACTIVATION_CANDIDATE", "GRANT_CANDIDATE_EVENT_DEREFERENCE");
  exactKeys(candidateEvent, [
    "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
    "payload", "canonicalBytesSha256"
  ], "GRANT_CANDIDATE_EVENT_FIELDS");
  const authoritativeCandidatePayload = candidateEvent.payload;
  assert(candidateEvent.canonicalBytesSha256 === canonicalPayloadFrame("ACTIVATION_CANDIDATE", authoritativeCandidatePayload).sha256,
    "GRANT_CANDIDATE_EVENT_CANONICAL");
  assert(candidatePayload === null || canonicalizeJcs(candidatePayload) === canonicalizeJcs(authoritativeCandidatePayload),
    "GRANT_CALLER_CANDIDATE_MISMATCH");
  const auditEvent = authoritativeEventLedger.find((event) =>
    event.eventSha256 === grantPayload.candidateAuditReportSha256
  );
  assert(auditEvent?.eventKind === "ACTIVATION_CANDIDATE_AUDIT_REPORT", "GRANT_AUDIT_EVENT_DEREFERENCE");
  exactKeys(auditEvent, [
    "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
    "payload", "canonicalBytesSha256"
  ], "GRANT_AUDIT_EVENT_FIELDS");
  const authoritativeAuditPayload = auditEvent.payload;
  assert(auditEvent.canonicalBytesSha256 === canonicalPayloadFrame("ACTIVATION_CANDIDATE_AUDIT_REPORT", authoritativeAuditPayload).sha256,
    "GRANT_AUDIT_EVENT_CANONICAL");
  assert(auditPayload === null || canonicalizeJcs(auditPayload) === canonicalizeJcs(authoritativeAuditPayload),
    "GRANT_CALLER_AUDIT_MISMATCH");
  const auditManifestEvent = authoritativeEventLedger.find((event) =>
    event.eventSha256 === grantPayload.candidateAuditManifestSha256
  );
  assert(auditManifestEvent?.eventKind === "ACTIVATION_AUDIT_MANIFEST", "GRANT_AUDIT_MANIFEST_DEREFERENCE");
  exactKeys(auditManifestEvent, [
    "eventKind", "eventOrdinal", "priorEventSha256", "eventSha256", "occurredAtRfc3339",
    "candidateEventSha256", "candidateCanonicalBytesSha256", "auditReportEventSha256",
    "auditReportCanonicalBytesSha256", "verdict"
  ], "GRANT_AUDIT_MANIFEST_FIELDS");
  assert(auditManifestEvent.candidateEventSha256 === candidateEvent.eventSha256 &&
    auditManifestEvent.candidateCanonicalBytesSha256 === candidateEvent.canonicalBytesSha256 &&
    auditManifestEvent.auditReportEventSha256 === auditEvent.eventSha256 &&
    auditManifestEvent.auditReportCanonicalBytesSha256 === auditEvent.canonicalBytesSha256 &&
    auditManifestEvent.verdict === "PASS_NO_BLOCKERS", "GRANT_AUDIT_MANIFEST_CONTENT");
  assert(candidateEvent.eventOrdinal < auditEvent.eventOrdinal &&
    auditEvent.eventOrdinal < auditManifestEvent.eventOrdinal &&
    auditManifestEvent.eventOrdinal < grantEvent.eventOrdinal, "GRANT_AUTHORITATIVE_EVENT_ORDER");
  const certificateEvents = authoritativeCandidatePayload.reviewerCertificateSha256s.map((eventSha256) => {
    const event = authoritativeEventLedger.find((candidate) => candidate.eventSha256 === eventSha256);
    assert(event?.eventKind === "REVIEWER_CERTIFICATE" && event.eventOrdinal < candidateEvent.eventOrdinal,
      "GRANT_CERTIFICATE_EVENT_DEREFERENCE");
    return validateActivationCertificateEvent(event, passedEventsBySha256, materializationsByEventSha256);
  });
  assert(certificateEvents.length === 2 &&
    new Set(certificateEvents.map(({ event }) => event.eventSha256)).size === certificateEvents.length,
  "GRANT_CERTIFICATE_EVENT_DISTINCTNESS");
  assert(JSON.stringify(authoritativeCandidatePayload.reviewerPrincipalCommitmentSha256s) === JSON.stringify(
    certificateEvents.map(({ event }) => event.certificatePayload.reviewerPrincipalCommitmentSha256)
  ), "GRANT_CERTIFICATE_PRINCIPAL_DEREFERENCE");
  assert(JSON.stringify(authoritativeCandidatePayload.reviewerCertificateScopeEnums) === JSON.stringify(
    certificateEvents.map(({ event }) => event.certificatePayload.scopeEvidence.scopeEnum)
  ), "GRANT_CERTIFICATE_SCOPE_DEREFERENCE");
  const candidateTypes = validateScopeEvidenceShape(authoritativeCandidatePayload.requestedCoverageEvidence, "GRANT_CANDIDATE_SCOPE");
  const candidateCoverageRoot = recomputeCoverageEvidence(
    authoritativeCandidatePayload.requestedCoverageEvidence,
    passedEventsBySha256,
    materializationsByEventSha256,
    candidateTypes
  );
  assert(authoritativeCandidatePayload.coverageRecomputationRootSha256 === candidateCoverageRoot,
    "GRANT_CANDIDATE_COVERAGE_ROOT");
  const grantTypes = validateScopeEvidenceShape(grantPayload.grantedCoverageEvidence, "GRANT_GRANTED_SCOPE");
  const grantCoverageRoot = recomputeCoverageEvidence(
    grantPayload.grantedCoverageEvidence,
    passedEventsBySha256,
    materializationsByEventSha256,
    grantTypes
  );
  assertScopeSubset(grantTypes, candidateTypes, "GRANT_SCOPE_EXCEEDS_CANDIDATE");
  for (const certificate of certificateEvents) {
    assertScopeSubset(grantTypes, certificate.types, "GRANT_SCOPE_EXCEEDS_CERTIFICATE");
    assert(certificate.event.certificatePayload.identityRegistryRootSha256 === authoritativeCandidatePayload.identityRegistryRootSha256,
      "GRANT_CERTIFICATE_IDENTITY_ROOT");
  }
  assert(JSON.stringify(grantTypes) === JSON.stringify(candidateTypes), "GRANT_SCOPE_DIFFERS_FROM_AUDITED_CANDIDATE");
  assert(grantPayload.policyRegistryReady === true && grantPayload.policyRegistrySealed === true, "GRANT_POLICY_FLAGS");
  assert(grantPayload.sealedPolicyRegistryRootSha256 === recomputed.sealedPolicyRegistryRootSha256, "GRANT_POLICY_ROOT");
  for (const [field, value] of Object.entries(recomputed.roots)) assert(grantPayload[field] === value, "GRANT_POLICY_COMPONENT_ROOT", field);
  assert(authoritativeCandidatePayload.policyDesignContractSha256 === recomputed.policyDesignContractSha256, "GRANT_POLICY_DESIGN_CONTRACT");
  if (preexistingAuditRecord !== null) {
    exactKeys(preexistingAuditRecord, [
      "auditReportSha256", "auditManifestSha256", "auditCanonicalBytesSha256", "verdict",
      "candidateEventSha256", "candidateCanonicalBytesSha256", "candidateEventOrdinal",
      "auditReportEventOrdinal", "auditManifestRecordedOrdinal", "recordedBeforeGrant"
    ], "GRANT_PREEXISTING_AUDIT_RECORD_FIELDS");
    assert(preexistingAuditRecord.auditReportSha256 === auditEvent.eventSha256 &&
      preexistingAuditRecord.auditManifestSha256 === auditManifestEvent.eventSha256 &&
      preexistingAuditRecord.auditCanonicalBytesSha256 === auditEvent.canonicalBytesSha256 &&
      preexistingAuditRecord.verdict === "PASS_NO_BLOCKERS" &&
      preexistingAuditRecord.candidateEventSha256 === candidateEvent.eventSha256 &&
      preexistingAuditRecord.candidateCanonicalBytesSha256 === candidateEvent.canonicalBytesSha256 &&
      preexistingAuditRecord.candidateEventOrdinal === candidateEvent.eventOrdinal &&
      preexistingAuditRecord.auditReportEventOrdinal === auditEvent.eventOrdinal &&
      preexistingAuditRecord.auditManifestRecordedOrdinal === auditManifestEvent.eventOrdinal &&
      preexistingAuditRecord.recordedBeforeGrant === true, "GRANT_PREEXISTING_AUDIT_RECORD_DERIVED_MISMATCH");
  }
  assert(authoritativeCandidatePayload.stateBefore === "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE" && authoritativeCandidatePayload.stateAfter === "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE", "GRANT_CANDIDATE_STATE");
  assert(authoritativeAuditPayload.stateBefore === "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE" && authoritativeAuditPayload.stateAfter === "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE", "GRANT_AUDIT_STATE");
  assert(grantPayload.stateBefore === "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE" && grantPayload.stateAfter === "ACTIVATION_GRANTED", "GRANT_STATE");
  assert(authoritativeAuditPayload.candidateEventSha256 === candidateEvent.eventSha256 &&
    authoritativeAuditPayload.candidateCanonicalBytesSha256 === candidateEvent.canonicalBytesSha256, "GRANT_AUDIT_CANDIDATE_BINDING");
  assert(authoritativeAuditPayload.candidateAuthorPrincipalCommitmentSha256 === authoritativeCandidatePayload.candidateAuthorPrincipalCommitmentSha256, "GRANT_CANDIDATE_AUTHOR_BINDING");
  assert(authoritativeAuditPayload.identityRegistryRootSha256 === authoritativeCandidatePayload.identityRegistryRootSha256, "GRANT_IDENTITY_REGISTRY_BINDING");
  assert(new Set([authoritativeCandidatePayload.candidateAuthorPrincipalCommitmentSha256, authoritativeAuditPayload.auditorPrincipalCommitmentSha256, grantPayload.grantAuthorPrincipalCommitmentSha256]).size === 3, "GRANT_PRINCIPAL_SEPARATION");
  assert(authoritativeCandidatePayload.authorityGranted === false && authoritativeCandidatePayload.resultAccessAuthorized === false, "GRANT_CANDIDATE_PREAUTHORITY");
  assert(authoritativeAuditPayload.authorityGranted === false && authoritativeAuditPayload.resultAccessAuthorized === false && authoritativeAuditPayload.verdict === "PASS_NO_BLOCKERS", "GRANT_AUDIT_PREAUTHORITY");
  assert(grantPayload.candidateCanonicalBytesSha256 === candidateEvent.canonicalBytesSha256, "GRANT_CANDIDATE_CANONICAL_BINDING");
  assert(grantPayload.candidateAuditCanonicalBytesSha256 === auditEvent.canonicalBytesSha256, "GRANT_AUDIT_CANONICAL_BINDING");
  assert(grantPayload.candidateAuditVerdict === "PASS_NO_BLOCKERS", "GRANT_AUDIT_VERDICT");
  assert(grantPayload.coverageRecomputationRootSha256 === grantCoverageRoot &&
    grantPayload.coverageRecomputationRootSha256 === candidateCoverageRoot &&
    grantPayload.coverageRecomputationRootSha256 === authoritativeAuditPayload.coverageRecomputationRootSha256, "GRANT_COVERAGE_ROOT");
  assert(grantPayload.authorityGranted === true && grantPayload.resultAccessAuthorized === true, "GRANT_AUTHORITY_FLAGS");
  validateCanonicalPayloadDigest("ACTIVATION_GRANT", grantPayload, grantCanonicalBytesSha256);
  return true;
}

function capabilityStateRoot(registry) {
  return framedHash("NARA-QCAL-V5-CAPABILITY-STATE\u0000", {
    completedTransactionIds: [...registry.completedTransactionIds].sort(),
    consumedCapabilityHashes: [...registry.consumedCapabilityHashes].sort(),
    issuedCapabilityHashes: [...registry.issuedCapabilityHashes].sort(),
    revokedCapabilityHashes: [...registry.revokedCapabilityHashes].sort()
  });
}

function capabilityRegistryRoot(registry) {
  return framedHash("NARA-QCAL-V5-CAPABILITY-REGISTRY\u0000", {
    capabilityStateRootSha256: capabilityStateRoot(registry),
    lastEventSha256: registry.lastEventSha256,
    nextEventOrdinal: registry.nextEventOrdinal
  });
}

export function createEmptyCapabilityRegistry() {
  const registry = {
    issuedCapabilityHashes: [],
    consumedCapabilityHashes: [],
    revokedCapabilityHashes: [],
    completedTransactionIds: [],
    nextEventOrdinal: 1,
    lastEventSha256: ZERO_HASH,
    registryRootSha256: null
  };
  registry.registryRootSha256 = capabilityRegistryRoot(registry);
  return deepFreeze(registry);
}

export function validateCapabilityRegistrySingleUse(registry) {
  exactKeys(registry, [
    "issuedCapabilityHashes", "consumedCapabilityHashes", "revokedCapabilityHashes",
    "completedTransactionIds", "nextEventOrdinal", "lastEventSha256", "registryRootSha256"
  ], "CAPABILITY_REGISTRY_FIELDS");
  const groups = [
    registry.issuedCapabilityHashes,
    registry.consumedCapabilityHashes,
    registry.revokedCapabilityHashes
  ];
  assert(groups.every((values) => Array.isArray(values) && new Set(values).size === values.length &&
    values.every((value) => HASH.test(value))), "CAPABILITY_REGISTRY_HASH_SET");
  assert(registry.consumedCapabilityHashes.every((value) => registry.issuedCapabilityHashes.includes(value)),
    "CAPABILITY_CONSUMED_WITHOUT_ISSUE");
  assert(registry.revokedCapabilityHashes.every((value) => !registry.consumedCapabilityHashes.includes(value)),
    "CAPABILITY_REVOKED_CONSUMED_OVERLAP");
  assert(Array.isArray(registry.completedTransactionIds) &&
    new Set(registry.completedTransactionIds).size === registry.completedTransactionIds.length &&
    registry.completedTransactionIds.every((value) => typeof value === "string" && value.length >= 12),
  "CAPABILITY_TRANSACTION_SET");
  assert(Number.isSafeInteger(registry.nextEventOrdinal) && registry.nextEventOrdinal >= 1 &&
    HASH.test(registry.lastEventSha256) && HASH.test(registry.registryRootSha256), "CAPABILITY_REGISTRY_CHAIN");
  assert(registry.registryRootSha256 === capabilityRegistryRoot(registry), "CAPABILITY_REGISTRY_ROOT");
  return true;
}

export function validateAccessTransactionChain({ events, capabilityRegistry }) {
  validateCapabilityRegistrySingleUse(capabilityRegistry);
  assert(Array.isArray(events) && events.length === 4, "ACCESS_CHAIN_LENGTH");
  const [authorization, open, consume, close] = events;
  assert(JSON.stringify(events.map(({ eventKind }) => eventKind)) === JSON.stringify([
    "AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"
  ]), "ACCESS_CHAIN_KINDS");
  let priorHash = capabilityRegistry.lastEventSha256;
  let previousTime = -Infinity;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assert(event.eventOrdinal === capabilityRegistry.nextEventOrdinal + index, "ACCESS_CHAIN_ORDINAL");
    assert(event.priorEventSha256 === priorHash, "ACCESS_CHAIN_PRIOR_HASH");
    assert(event.eventSha256 === canonicalLedgerEventSha256(event), "ACCESS_CHAIN_EVENT_HASH");
    const time = strictInstant(event.occurredAtRfc3339, "ACCESS_CHAIN_TIME");
    assert(time >= previousTime, "ACCESS_CHAIN_OCCURRED_TIME_ORDER");
    previousTime = time;
    priorHash = event.eventSha256;
  }
  assert(typeof authorization.transactionId === "string" && authorization.transactionId.length >= 12 &&
    events.every((event) => event.transactionId === authorization.transactionId), "ACCESS_CHAIN_TRANSACTION");
  assert(HASH.test(authorization.capabilityTokenSha256) &&
    events.every((event) => event.capabilityTokenSha256 === authorization.capabilityTokenSha256),
  "ACCESS_CHAIN_CAPABILITY");
  assert(!capabilityRegistry.issuedCapabilityHashes.includes(authorization.capabilityTokenSha256) &&
    !capabilityRegistry.consumedCapabilityHashes.includes(authorization.capabilityTokenSha256) &&
    !capabilityRegistry.revokedCapabilityHashes.includes(authorization.capabilityTokenSha256),
  "ACCESS_CAPABILITY_REPLAY");
  assert(!capabilityRegistry.completedTransactionIds.includes(authorization.transactionId),
    "ACCESS_TRANSACTION_REPLAY");
  assert(open.authorizationEventSha256 === authorization.eventSha256 &&
    open.authorizationEventOrdinal === authorization.eventOrdinal, "ACCESS_OPEN_BINDING");
  assert(consume.authorizationEventSha256 === authorization.eventSha256 &&
    consume.openEventSha256 === open.eventSha256 &&
    consume.openEventOrdinal === open.eventOrdinal, "ACCESS_CONSUME_BINDING");
  assert(close.authorizationEventSha256 === authorization.eventSha256 &&
    close.openEventSha256 === open.eventSha256 &&
    close.consumeEventSha256 === consume.eventSha256 &&
    close.consumeEventOrdinal === consume.eventOrdinal, "ACCESS_CLOSE_BINDING");
  assert(authorization.authorizedAtRfc3339 === authorization.occurredAtRfc3339 &&
    open.openedAtRfc3339 === open.occurredAtRfc3339 &&
    consume.consumedAtRfc3339 === consume.occurredAtRfc3339 &&
    close.closedAtRfc3339 === close.occurredAtRfc3339, "ACCESS_EVENT_TIME_BINDING");
  const authorizedAt = strictInstant(authorization.authorizedAtRfc3339, "ACCESS_AUTHORIZED_TIME");
  const openedAt = strictInstant(open.openedAtRfc3339, "ACCESS_OPENED_TIME");
  const consumedAt = strictInstant(consume.consumedAtRfc3339, "ACCESS_CONSUMED_TIME");
  const closedAt = strictInstant(close.closedAtRfc3339, "ACCESS_CLOSED_TIME");
  assert(authorizedAt < openedAt && openedAt <= consumedAt && consumedAt <= closedAt,
    "ACCESS_CHAIN_TIME_ORDER");
  assert(close.authorizedAtRfc3339 === authorization.authorizedAtRfc3339 &&
    close.openedAtRfc3339 === open.openedAtRfc3339 &&
    close.consumedAtRfc3339 === consume.consumedAtRfc3339, "ACCESS_CLOSE_TIME_BINDING");
  assert(open.contentBytesReleasedBeforeOpenSeal === 0 &&
    consume.contentBytesReleasedBeforeConsumeSeal === 0 &&
    consume.useOrdinal === 1, "ACCESS_PRESEAL_OR_USE_ORDINAL");
  const uniquenessProof = framedHash("NARA-QCAL-V5-CAPABILITY-UNIQUENESS\u0000", {
    capabilityRegistryBeforeSha256: capabilityRegistry.registryRootSha256,
    capabilityTokenSha256: authorization.capabilityTokenSha256,
    transactionId: authorization.transactionId
  });
  assert(authorization.capabilityUniquenessProofSha256 === uniquenessProof &&
    consume.capabilityUniquenessProofSha256 === uniquenessProof, "ACCESS_CAPABILITY_UNIQUENESS_PROOF");
  assert(consume.capabilityRegistryBeforeSha256 === capabilityRegistry.registryRootSha256,
    "ACCESS_CAPABILITY_REGISTRY_BEFORE");
  const consumedState = {
    ...canonicalClone(capabilityRegistry),
    issuedCapabilityHashes: [...capabilityRegistry.issuedCapabilityHashes, authorization.capabilityTokenSha256],
    consumedCapabilityHashes: [...capabilityRegistry.consumedCapabilityHashes, authorization.capabilityTokenSha256],
    nextEventOrdinal: consume.eventOrdinal + 1,
    lastEventSha256: consume.eventSha256
  };
  consumedState.registryRootSha256 = capabilityStateRoot(consumedState);
  assert(consume.capabilityRegistryAfterSha256 === consumedState.registryRootSha256,
    "ACCESS_CAPABILITY_REGISTRY_AFTER");
  const nextRegistry = {
    ...consumedState,
    completedTransactionIds: [...consumedState.completedTransactionIds, authorization.transactionId],
    nextEventOrdinal: close.eventOrdinal + 1,
    lastEventSha256: close.eventSha256
  };
  nextRegistry.registryRootSha256 = capabilityRegistryRoot(nextRegistry);
  validateCapabilityRegistrySingleUse(nextRegistry);
  return deepFreeze(nextRegistry);
}

export function validateAndConsumeCapabilityAtomically(args) {
  return validateAccessTransactionChain(args);
}
