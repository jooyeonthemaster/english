import { createHash } from "node:crypto";

export const CANONICALIZATION_VERSION = "NARA_QCAL_V4_JCS_RFC8785_DOMAIN_FRAMED_1";
export const CANONICAL_DOMAIN_PREFIX = "NARA-QCAL-V4-CANONICAL\u0000";

export const CANONICAL_PROFILES = Object.freeze({
  ACTIVATION_CANDIDATE: Object.freeze({
    profile: "NARA_QCAL_V4_ACTIVATION_CANDIDATE_PAYLOAD_1",
    fields: Object.freeze([
      "profile",
      "stateBefore",
      "stateAfter",
      "candidateAuthorPrincipalCommitmentSha256",
      "designManifestSha256",
      "evaluationAuthorityManifestSha256",
      "productionTypeBindingManifestSha256",
      "reviewerCertificateSha256s",
      "reviewerPrincipalCommitmentSha256s",
      "reviewerCertificateScopeEnums",
      "requestedCoverageEvidence",
      "coverageRecomputationRootSha256",
      "freshAdjudicatorBindingSha256",
      "allPhaseSealRootSha256",
      "zeroPreauthorityResultAccessProofSha256",
      "identityRegistryRootSha256",
      "policyDesignContractSha256",
      "authorityGranted",
      "resultAccessAuthorized"
    ])
  }),
  ACTIVATION_CANDIDATE_AUDIT_REPORT: Object.freeze({
    profile: "NARA_QCAL_V4_ACTIVATION_CANDIDATE_AUDIT_PAYLOAD_1",
    fields: Object.freeze([
      "profile",
      "stateBefore",
      "stateAfter",
      "auditorPrincipalCommitmentSha256",
      "candidateEventSha256",
      "candidateCanonicalBytesSha256",
      "candidateAuthorPrincipalCommitmentSha256",
      "roleRegistrySha256",
      "identityRegistryRootSha256",
      "artifactAuthorshipRegistrySha256",
      "auditorRoleExclusionProofSha256",
      "auditorArtifactAuthorshipExclusionProofSha256",
      "coverageRecomputationRootSha256",
      "auditInputRootSha256",
      "verdict",
      "authorityGranted",
      "resultAccessAuthorized"
    ])
  }),
  ACTIVATION_GRANT: Object.freeze({
    profile: "NARA_QCAL_V4_ACTIVATION_GRANT_PAYLOAD_1",
    fields: Object.freeze([
      "profile",
      "stateBefore",
      "stateAfter",
      "grantAuthorPrincipalCommitmentSha256",
      "candidateEventSha256",
      "candidateCanonicalBytesSha256",
      "candidateAuditReportSha256",
      "candidateAuditCanonicalBytesSha256",
      "candidateAuditManifestSha256",
      "candidateAuditVerdict",
      "grantedCoverageEvidence",
      "coverageRecomputationRootSha256",
      "sealedPolicyRegistryRootSha256",
      "policyMatrixRootSha256",
      "allStateAllowRootSha256",
      "allStateDenyRootSha256",
      "allTupleAllowedRolesRootSha256",
      "allTupleDeniedRolesRootSha256",
      "resourceClassProofRootSha256",
      "stateTransitionProofRootSha256",
      "postActivationScopeProofSha256",
      "postActivationAllowRootSha256",
      "postActivationDenyRootSha256",
      "postActivationAllowedRolesRootSha256",
      "postActivationDeniedRolesRootSha256",
      "policyRegistryReady",
      "policyRegistrySealed",
      "deterministicGrantProofSha256",
      "authorityGranted",
      "resultAccessAuthorized"
    ])
  })
});

const FORBIDDEN_SELF_REFERENCE_KEYS_BY_KIND = Object.freeze({
  ACTIVATION_CANDIDATE: new Set(["eventSha256", "candidateCanonicalBytesSha256", "canonicalPayloadSha256"]),
  ACTIVATION_CANDIDATE_AUDIT_REPORT: new Set(["eventSha256", "auditReportCanonicalBytesSha256", "canonicalPayloadSha256"]),
  ACTIVATION_GRANT: new Set(["eventSha256", "grantCanonicalBytesSha256", "canonicalPayloadSha256"])
});

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

function assertUnicodeScalarString(value, path) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      assert(next >= 0xdc00 && next <= 0xdfff, "JCS_LONE_HIGH_SURROGATE", path);
      index += 1;
    } else {
      assert(!(code >= 0xdc00 && code <= 0xdfff), "JCS_LONE_LOW_SURROGATE", path);
    }
  }
}

function canonicalizeValue(value, path, seen) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    assertUnicodeScalarString(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "JCS_NONFINITE_NUMBER", path);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  assert(typeof value === "object", "JCS_UNSUPPORTED_TYPE", `${path}:${typeof value}`);
  assert(!seen.has(value), "JCS_CYCLE", path);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        assert(Object.prototype.hasOwnProperty.call(value, index), "JCS_SPARSE_ARRAY", `${path}[${index}]`);
      }
      return `[${value.map((entry, index) => canonicalizeValue(entry, `${path}[${index}]`, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    assert(prototype === Object.prototype || prototype === null, "JCS_NONPLAIN_OBJECT", path);
    const keys = Object.keys(value);
    for (const key of keys) {
      assertUnicodeScalarString(key, `${path}.[key]`);
      assert(value[key] !== undefined && typeof value[key] !== "function" && typeof value[key] !== "symbol" && typeof value[key] !== "bigint", "JCS_UNSUPPORTED_MEMBER", `${path}.${key}`);
    }
    keys.sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(value[key], `${path}.${key}`, seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeJcs(value) {
  return canonicalizeValue(value, "$", new Set());
}

function duplicateKeyScan(text) {
  let index = 0;
  const duplicates = [];

  function ws() {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  }

  function stringToken() {
    assert(text[index] === '"', "STRICT_JSON_EXPECTED_STRING", `${index}`);
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") index += 2;
      else if (text[index] === '"') {
        index += 1;
        return JSON.parse(text.slice(start, index));
      } else index += 1;
    }
    fail("STRICT_JSON_UNTERMINATED_STRING", `${start}`);
  }

  function value(path) {
    ws();
    if (text[index] === "{") return object(path);
    if (text[index] === "[") return array(path);
    if (text[index] === '"') {
      stringToken();
      return;
    }
    const token = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(index));
    assert(Boolean(token), "STRICT_JSON_BAD_TOKEN", `${index}`);
    index += token[0].length;
  }

  function object(path) {
    index += 1;
    ws();
    const seen = new Set();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      ws();
      const key = stringToken();
      if (seen.has(key)) duplicates.push(`${path}.${key}`);
      seen.add(key);
      ws();
      assert(text[index] === ":", "STRICT_JSON_EXPECTED_COLON", `${index}`);
      index += 1;
      value(`${path}.${key}`);
      ws();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      assert(text[index] === ",", "STRICT_JSON_EXPECTED_COMMA", `${index}`);
      index += 1;
    }
    fail("STRICT_JSON_UNTERMINATED_OBJECT", path);
  }

  function array(path) {
    index += 1;
    ws();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    let ordinal = 0;
    while (index < text.length) {
      value(`${path}[${ordinal}]`);
      ordinal += 1;
      ws();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      assert(text[index] === ",", "STRICT_JSON_EXPECTED_COMMA", `${index}`);
      index += 1;
    }
    fail("STRICT_JSON_UNTERMINATED_ARRAY", path);
  }

  value("$");
  ws();
  assert(index === text.length, "STRICT_JSON_TRAILING_BYTES", `${index}`);
  return duplicates;
}

export function parseStrictJson(text) {
  assert(typeof text === "string", "STRICT_JSON_INPUT_TYPE");
  const duplicates = duplicateKeyScan(text);
  assert(duplicates.length === 0, "STRICT_JSON_DUPLICATE_KEY", duplicates.join(","));
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail("STRICT_JSON_PARSE", error.message);
  }
  canonicalizeJcs(parsed);
  return parsed;
}

function uint16(value) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff, "CANON_LENGTH_U16", `${value}`);
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function uint64(value) {
  assert(Number.isSafeInteger(value) && value >= 0, "CANON_LENGTH_U64", `${value}`);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

function exactProfile(kind, payload) {
  const profile = CANONICAL_PROFILES[kind];
  assert(Boolean(profile), "CANON_UNKNOWN_KIND", kind);
  assert(payload && typeof payload === "object" && !Array.isArray(payload), "CANON_PAYLOAD_OBJECT", kind);
  assert(payload.profile === profile.profile, "CANON_PROFILE", kind);
  const actualKeys = Object.keys(payload).sort();
  const expectedKeys = [...profile.fields].sort();
  assert(JSON.stringify(actualKeys) === JSON.stringify(expectedKeys), "CANON_FIELD_SET", `${kind}:${actualKeys.join(",")}`);
  for (const key of actualKeys) assert(!FORBIDDEN_SELF_REFERENCE_KEYS_BY_KIND[kind].has(key), "CANON_SELF_REFERENCE_FIELD", `${kind}:${key}`);
  return profile;
}

export function canonicalPayloadFrame(kind, payload) {
  const profile = exactProfile(kind, payload);
  const canonicalJson = canonicalizeJcs(payload);
  const prefix = Buffer.from(CANONICAL_DOMAIN_PREFIX, "utf8");
  const versionBytes = Buffer.from(CANONICALIZATION_VERSION, "utf8");
  const kindBytes = Buffer.from(kind, "utf8");
  const profileBytes = Buffer.from(profile.profile, "utf8");
  const payloadBytes = Buffer.from(canonicalJson, "utf8");
  const framedBytes = Buffer.concat([
    prefix,
    uint16(versionBytes.length), versionBytes,
    uint16(kindBytes.length), kindBytes,
    uint16(profileBytes.length), profileBytes,
    uint64(payloadBytes.length), payloadBytes
  ]);
  return { canonicalJson, payloadBytes, framedBytes, sha256: sha256(framedBytes) };
}

export function validateCanonicalPayloadDigest(kind, payload, expectedSha256) {
  assert(/^[0-9a-f]{64}$/.test(expectedSha256), "CANON_EXPECTED_DIGEST_FORMAT", kind);
  const result = canonicalPayloadFrame(kind, payload);
  assert(result.sha256 === expectedSha256, "CANON_DIGEST_MISMATCH", kind);
  return result;
}

export function canonicalPayloadFromStrictJson(kind, text) {
  const payload = parseStrictJson(text);
  return { payload, ...canonicalPayloadFrame(kind, payload) };
}
