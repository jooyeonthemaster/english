import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// The subject's author test programs and fixtures are intentionally never loaded.
// Only the three public implementation modules are treated as the system under test.
import {
  ROLES,
  STATES,
  RESOURCE_CLASSES,
  IDENTITY_BINDING_VERSION,
  materializationRecordRoot,
  recomputeCoverageEvidence,
  sealIdentityRegistry,
  sealPolicyRegistry,
  validateAuthorizationAgainstPolicy,
  validateGrantAgainstSealedPolicy,
  validateRoleAssignmentIdentity
} from "../../design/reviewer-calibration-v4-production-bound-v4/semantics.mjs";
import {
  canonicalizeJcs,
  canonicalPayloadFrame,
  canonicalPayloadFromStrictJson
} from "../../design/reviewer-calibration-v4-production-bound-v4/canonicalize.mjs";
import {
  FINGERPRINT_FAMILY_BY_TYPE,
  deriveFingerprintBundle,
  deriveSlotFingerprintProof,
  validateFingerprintBundle,
  validateSlotFingerprintBinding
} from "../../design/reviewer-calibration-v4-production-bound-v4/fingerprint.mjs";

const protocol = JSON.parse(await readFile(
  new URL("../../design/reviewer-calibration-v4-production-bound-v4/protocol.json", import.meta.url),
  "utf8"
));

function h(label) {
  return createHash("sha256").update(`independent-v4-audit:${label}`).digest("hex");
}

function assert(value, label) {
  if (!value) throw new Error(`PROBE_ASSERT:${label}`);
}

function expectThrow(fn, label) {
  try {
    fn();
  } catch {
    return true;
  }
  throw new Error(`PROBE_EXPECTED_REJECTION:${label}`);
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function framedHash(domain, value) {
  const payload = Buffer.from(typeof value === "string" ? value : canonicalizeJcs(value), "utf8");
  return createHash("sha256").update(Buffer.concat([
    Buffer.from(domain, "utf8"), u64(payload.length), payload
  ])).digest("hex");
}

function coverageEvidence(typeIds, scopeEnum, label) {
  const passedCoverageEventSha256ByCanonicalType = {};
  const materializationEventSha256ByCanonicalType = {};
  for (const typeId of typeIds) {
    passedCoverageEventSha256ByCanonicalType[typeId] = h(`${label}:pass:${typeId}`);
    materializationEventSha256ByCanonicalType[typeId] = h(`${label}:materialization:${typeId}`);
  }
  return {
    scopeEnum,
    canonicalTypeIds: [...typeIds],
    coverageCount: typeIds.length,
    passedCoverageEventSha256ByCanonicalType,
    materializationEventSha256ByCanonicalType,
    coverageMapRootSha256: h(`${label}:map-root`),
    coverageRecomputationRootSha256: h(`${label}:recompute-root`)
  };
}

function buildSealedPolicy() {
  const policyRows = protocol.resourceAccessPolicy.policyMatrix.map((row) => ({
    phase: row.phase,
    state: row.states[0],
    allowResources: [...row.allow],
    denyResources: [...row.deny],
    allowedRoles: [...row.allowedRoles],
    deniedRoles: [...row.deniedRoles]
  }));
  const resourceProofs = policyRows.flatMap((row) => RESOURCE_CLASSES.map((resourceClass) => ({
    phase: row.phase,
    state: row.state,
    resourceClass,
    sha256: h(`resource-proof:${row.phase}:${row.state}:${resourceClass}`)
  })));
  const stateTransitionProofs = STATES.slice(0, -1).map((from, index) => ({
    from,
    to: STATES[index + 1],
    sha256: h(`transition:${from}:${STATES[index + 1]}`)
  }));
  const postActivationScope = {
    phase: "POST_ACTIVATION_RESULT",
    state: "ACTIVATION_GRANTED",
    scope: "S1_RESULT_SCOPE_BOUND_ONLY"
  };
  return sealPolicyRegistry({
    policyRows,
    stateDenySets: protocol.resourceAccessPolicy.stateDenySets,
    resourceProofs,
    stateTransitionProofs,
    postActivationScope
  });
}

function authorizationFor(policy, tuple, role, principal, assignmentEvent, identityRoot) {
  const resourceProof = policy.resourceProofs.find((proof) =>
    proof.phase === tuple.phase && proof.state === tuple.state && proof.resourceClass === tuple.resourceClass
  );
  const stateProof = policy.stateTransitionProofs.find((proof) => proof.to === tuple.state);
  return {
    phase: tuple.phase,
    currentState: tuple.state,
    resourceClass: tuple.resourceClass,
    resourceSha256: h("resource"),
    visibleSurfaceSha256: null,
    actorPseudonym: "presented_alias_0001",
    actorCanonicalPseudonym: "presented_alias_0001",
    actorPrincipalCommitmentSha256: principal,
    actorRole: role,
    activeRoleAssignmentEventSha256: assignmentEvent,
    identityRegistryRootSha256: identityRoot,
    capabilityTokenSha256: h("capability"),
    capabilityUniquenessProofSha256: h("capability-unique"),
    sealedPolicyRegistryRootSha256: policy.sealedPolicyRegistryRootSha256,
    policyMatrixRootSha256: policy.roots.policyMatrixRootSha256,
    allStateAllowRootSha256: policy.roots.allStateAllowRootSha256,
    allStateDenyRootSha256: policy.roots.allStateDenyRootSha256,
    allowedRolesRootSha256: tuple.allowedRolesRootSha256,
    deniedRolesRootSha256: tuple.deniedRolesRootSha256,
    policyTupleSha256: tuple.policyTupleSha256,
    resourceClassPolicyProofSha256: resourceProof.sha256,
    stateTransitionEvidenceSha256: stateProof.sha256,
    authorizedAtRfc3339: "2026-07-16T00:00:00.000Z",
    decision: "ALLOW"
  };
}

// 1. Identity registry closure must independently revalidate all bidirectional maps.
// This ordinary fabricated registry contains two internally crossed pseudonym maps
// and opaque attestation digests.  No key or signature operation is performed.
const p1 = h("principal-1");
const p2 = h("principal-2");
const a1 = "canonical_alias_0001";
const a2 = "canonical_alias_0002";
const identityRegistry = {
  version: IDENTITY_BINDING_VERSION,
  trustedCustodianPublicKeysByPrincipal: {},
  trustedCustodianKeySha256ByPrincipal: {},
  principalRecords: {
    [p1]: { authorityNamespace: "authority.one", canonicalSourceIdCommitmentSha256: h("source-1"), custodianAttestationSha256: h("attestation-1") },
    [p2]: { authorityNamespace: "authority.one", canonicalSourceIdCommitmentSha256: h("source-2"), custodianAttestationSha256: h("attestation-2") }
  },
  principalByCanonicalSourceCommitment: { [h("source-1")]: p1, [h("source-2")]: p2 },
  principalByCanonicalPseudonym: { [a1]: p2, [a2]: p1 },
  canonicalPseudonymsByPrincipal: { [p1]: [a1], [p2]: [a2] },
  custodianAttestations: {},
  denialRecords: [],
  ready: false,
  sealed: false,
  registryRootSha256: null
};
const crossedIdentityRoot = sealIdentityRegistry(identityRegistry);
assert(identityRegistry.ready && identityRegistry.sealed, "crossed identity registry sealed");
const crossedAssignmentAccepted = validateRoleAssignmentIdentity(identityRegistry, {
  actorPseudonym: a1,
  canonicalPseudonym: a1,
  principalCommitmentSha256: p2,
  identityCustodianAttestationSha256: h("attestation-2"),
  identityRegistryRootSha256: crossedIdentityRoot,
  role: "S1_RESULT_VIEWER"
});
assert(crossedAssignmentAccepted, "crossed pseudonym assignment accepted");

// 2. Baseline policy closure and complete 7 x 14 tuple materialization.
const sealedPolicy = buildSealedPolicy();
assert(sealedPolicy.ready && sealedPolicy.sealed, "policy sealed");
assert(sealedPolicy.tupleCount === 7 * RESOURCE_CLASSES.length, "policy tuple count");

// 3. A validator should use the recomputed immutable tuple/root set.  The target
// recomputes the seal but subsequently reads mutable derived members instead.
const mutablePolicy = structuredClone(sealedPolicy);
const mutableTuple = mutablePolicy.tuples.find((tuple) =>
  tuple.phase === "MAIN_CERTIFICATION_PHASE1" && tuple.resourceClass === "RAW_PRIVATE_TRUSTED_GOLD"
);
assert(mutableTuple.resourceDecision === "DENY", "precondition default deny");
mutableTuple.resourceDecision = "ALLOW";
mutableTuple.allowedRoles = ["PACKET_AUTHOR"];
mutableTuple.deniedRoles = ROLES.filter((role) => role !== "PACKET_AUTHOR");
mutableTuple.allowedRolesRootSha256 = h("mutable-allowed-root");
mutableTuple.deniedRolesRootSha256 = h("mutable-denied-root");
mutableTuple.policyTupleSha256 = h("mutable-tuple-root");
mutablePolicy.roots.policyMatrixRootSha256 = h("mutable-matrix-root");
const mutablePrincipal = h("mutable-principal");
const mutableAssignmentEvent = h("mutable-assignment");
const mutableIdentityRoot = h("mutable-identity-root");
const mutableAuth = authorizationFor(
  mutablePolicy, mutableTuple, "PACKET_AUTHOR", mutablePrincipal, mutableAssignmentEvent, mutableIdentityRoot
);
const mutablePolicyAuthorizationAccepted = validateAuthorizationAgainstPolicy({
  policyRegistry: mutablePolicy,
  authorization: mutableAuth,
  activeRoleAssignments: [{
    principalCommitmentSha256: mutablePrincipal,
    role: "PACKET_AUTHOR",
    active: true,
    eventSha256: mutableAssignmentEvent,
    identityRegistryRootSha256: mutableIdentityRoot,
    canonicalPseudonym: "assignment_alias_0001"
  }]
});
assert(mutablePolicyAuthorizationAccepted, "mutated derived policy accepted");

// 4. The documented current state and canonical actor alias are not supplied as
// authoritative validator inputs.  A self-described post-activation state and a
// different presented alias therefore pass the target function.
const futurePolicy = structuredClone(sealedPolicy);
const futureTuple = futurePolicy.tuples.find((tuple) =>
  tuple.phase === "POST_ACTIVATION_RESULT" && tuple.resourceClass === "S1_RESULT_SCOPE_BOUND"
);
const futurePrincipal = h("future-principal");
const futureAssignmentEvent = h("future-assignment");
const futureIdentityRoot = h("future-identity-root");
const futureAuth = authorizationFor(
  futurePolicy, futureTuple, "S1_RESULT_VIEWER", futurePrincipal, futureAssignmentEvent, futureIdentityRoot
);
futureAuth.actorPseudonym = "different_alias_0001";
futureAuth.actorCanonicalPseudonym = "different_alias_0001";
const selfClaimedFutureStateAndAliasAccepted = validateAuthorizationAgainstPolicy({
  policyRegistry: futurePolicy,
  authorization: futureAuth,
  activeRoleAssignments: [{
    principalCommitmentSha256: futurePrincipal,
    role: "S1_RESULT_VIEWER",
    active: true,
    eventSha256: futureAssignmentEvent,
    identityRegistryRootSha256: futureIdentityRoot,
    canonicalPseudonym: "assignment_alias_0001"
  }]
});
assert(selfClaimedFutureStateAndAliasAccepted, "self-claimed future state and alias accepted");

// 5. Coverage recomputation itself correctly binds two distinct focus slots.
function makeCoveragePair() {
  const materializations = {};
  const passed = {};
  const passMap = {};
  const materializationMap = {};
  for (const [typeId, block, ordinal] of [["GRAMMAR_ERROR", "G", 1], ["BLANK_INFERENCE", "B", 2]]) {
    const materialization = {
      eventSha256: h(`coverage-materialization:${typeId}`),
      slotId: `MC-${block}-0${ordinal}`,
      canonicalTypeId: typeId,
      canonicalFamilyId: null,
      phase: "MAIN_CERTIFICATION",
      fingerprintCompositeSha256: h(`coverage-fingerprint:${typeId}`),
      fingerprintDerivationProofSha256: h(`coverage-proof:${typeId}`),
      eligible: true,
      terminalDecisionEventSha256: h(`coverage-terminal-event:${typeId}`),
      terminalDecisionSha256: h(`coverage-terminal:${typeId}`),
      terminalDecision: "PASS"
    };
    materializations[materialization.eventSha256] = materialization;
    const event = {
      eventSha256: h(`coverage-pass:${typeId}`),
      materializationEventSha256: materialization.eventSha256,
      materializationRecordRootSha256: materializationRecordRoot(materialization),
      materializationEligible: true,
      canonicalTypeId: typeId,
      canonicalFamilyId: null,
      phase: materialization.phase,
      slotId: materialization.slotId,
      fingerprintCompositeSha256: materialization.fingerprintCompositeSha256,
      fingerprintDerivationProofSha256: materialization.fingerprintDerivationProofSha256,
      terminalDecisionEventSha256: materialization.terminalDecisionEventSha256,
      terminalDecisionSha256: materialization.terminalDecisionSha256,
      decisionSealSha256: h(`coverage-decision-seal:${typeId}`),
      uniqueAnswerCheckPassed: true,
      fatalChecksPassed: true,
      coverageVerdict: "PASS"
    };
    passed[event.eventSha256] = event;
    passMap[typeId] = event.eventSha256;
    materializationMap[typeId] = materialization.eventSha256;
  }
  const types = ["GRAMMAR_ERROR", "BLANK_INFERENCE"];
  const orderedEntries = types.map((typeId) => {
    const event = passed[passMap[typeId]];
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
  const coverageMapRootSha256 = framedHash("NARA-QCAL-V4-COVERAGE-MAP\u0000", {
    bindingVersion: "NARA_QCAL_V4_MATERIALIZED_SLOT_COVERAGE_1",
    orderedEntries
  });
  const evidence = {
    scopeEnum: "FOCUS_ONLY",
    canonicalTypeIds: types,
    coverageCount: 2,
    passedCoverageEventSha256ByCanonicalType: passMap,
    materializationEventSha256ByCanonicalType: materializationMap,
    coverageMapRootSha256,
    coverageRecomputationRootSha256: framedHash("NARA-QCAL-V4-COVERAGE-RECOMPUTATION\u0000", {
      bindingVersion: "NARA_QCAL_V4_MATERIALIZED_SLOT_COVERAGE_1",
      coverageMapRootSha256,
      orderedEntries,
      scopeEnum: "FOCUS_ONLY"
    })
  };
  return { evidence, passed, materializations, types };
}
const coveragePair = makeCoveragePair();
const validCoverageRoot = recomputeCoverageEvidence(
  coveragePair.evidence, coveragePair.passed, coveragePair.materializations, coveragePair.types
);
assert(validCoverageRoot === coveragePair.evidence.coverageRecomputationRootSha256, "valid focus coverage");
const reusedCoverage = structuredClone(coveragePair.evidence);
reusedCoverage.passedCoverageEventSha256ByCanonicalType.BLANK_INFERENCE =
  reusedCoverage.passedCoverageEventSha256ByCanonicalType.GRAMMAR_ERROR;
expectThrow(() => recomputeCoverageEvidence(
  reusedCoverage, coveragePair.passed, coveragePair.materializations, coveragePair.types
), "one slot reused for focus coverage");

// 6. Grant validator conformance: the nested grant scope is deliberately ALL_25
// while candidate/certificate claims are FOCUS_ONLY.  The opaque pre-existing
// audit record contains ordinary deterministic placeholder hashes and ordinals.
const focusTypes = ["GRAMMAR_ERROR", "BLANK_INFERENCE"];
const all25Types = protocol.typeUniverse.uiTypeIdsInOrder;
const sharedCoverageScalar = h("grant-shared-coverage-scalar");
const candidatePayload = {
  profile: "NARA_QCAL_V4_ACTIVATION_CANDIDATE_PAYLOAD_1",
  stateBefore: "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE",
  stateAfter: "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
  candidateAuthorPrincipalCommitmentSha256: h("candidate-author"),
  designManifestSha256: h("design-manifest"),
  evaluationAuthorityManifestSha256: h("evaluation-authority-manifest"),
  productionTypeBindingManifestSha256: "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
  reviewerCertificateSha256s: [h("certificate-1"), h("certificate-2")],
  reviewerPrincipalCommitmentSha256s: [h("reviewer-1"), h("reviewer-2")],
  reviewerCertificateScopeEnums: ["FOCUS_ONLY", "FOCUS_ONLY"],
  requestedCoverageEvidence: coverageEvidence(focusTypes, "FOCUS_ONLY", "candidate-focus"),
  coverageRecomputationRootSha256: sharedCoverageScalar,
  freshAdjudicatorBindingSha256: h("fresh-adjudicator"),
  allPhaseSealRootSha256: h("all-phase-seal"),
  zeroPreauthorityResultAccessProofSha256: h("zero-result-access"),
  identityRegistryRootSha256: h("grant-identity-root"),
  policyDesignContractSha256: sealedPolicy.policyDesignContractSha256,
  authorityGranted: false,
  resultAccessAuthorized: false
};
const candidateCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_CANDIDATE", candidatePayload).sha256;
const auditPayload = {
  profile: "NARA_QCAL_V4_ACTIVATION_CANDIDATE_AUDIT_PAYLOAD_1",
  stateBefore: "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
  stateAfter: "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
  auditorPrincipalCommitmentSha256: h("audit-author"),
  candidateEventSha256: h("candidate-event"),
  candidateCanonicalBytesSha256,
  candidateAuthorPrincipalCommitmentSha256: candidatePayload.candidateAuthorPrincipalCommitmentSha256,
  roleRegistrySha256: h("role-registry"),
  identityRegistryRootSha256: candidatePayload.identityRegistryRootSha256,
  artifactAuthorshipRegistrySha256: h("authorship-registry"),
  auditorRoleExclusionProofSha256: h("auditor-role-exclusion"),
  auditorArtifactAuthorshipExclusionProofSha256: h("auditor-artifact-exclusion"),
  coverageRecomputationRootSha256: sharedCoverageScalar,
  auditInputRootSha256: h("audit-input-root"),
  verdict: "PASS_NO_BLOCKERS",
  authorityGranted: false,
  resultAccessAuthorized: false
};
const auditCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_CANDIDATE_AUDIT_REPORT", auditPayload).sha256;
const grantPayload = {
  profile: "NARA_QCAL_V4_ACTIVATION_GRANT_PAYLOAD_1",
  stateBefore: "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
  stateAfter: "ACTIVATION_GRANTED",
  grantAuthorPrincipalCommitmentSha256: h("grant-author"),
  candidateEventSha256: auditPayload.candidateEventSha256,
  candidateCanonicalBytesSha256,
  candidateAuditReportSha256: h("audit-report-event"),
  candidateAuditCanonicalBytesSha256: auditCanonicalBytesSha256,
  candidateAuditManifestSha256: h("audit-manifest"),
  candidateAuditVerdict: "PASS_NO_BLOCKERS",
  grantedCoverageEvidence: coverageEvidence(all25Types, "ALL_25", "grant-all25"),
  coverageRecomputationRootSha256: sharedCoverageScalar,
  sealedPolicyRegistryRootSha256: sealedPolicy.sealedPolicyRegistryRootSha256,
  ...sealedPolicy.roots,
  policyRegistryReady: true,
  policyRegistrySealed: true,
  deterministicGrantProofSha256: h("grant-proof"),
  authorityGranted: true,
  resultAccessAuthorized: true
};
const preexistingAuditRecord = {
  auditReportSha256: grantPayload.candidateAuditReportSha256,
  auditManifestSha256: grantPayload.candidateAuditManifestSha256,
  auditCanonicalBytesSha256,
  verdict: "PASS_NO_BLOCKERS",
  candidateEventSha256: auditPayload.candidateEventSha256,
  candidateCanonicalBytesSha256,
  candidateEventOrdinal: 10,
  auditReportEventOrdinal: 11,
  auditManifestRecordedOrdinal: 11,
  recordedBeforeGrant: true
};
const grantCanonicalBytesSha256 = canonicalPayloadFrame("ACTIVATION_GRANT", grantPayload).sha256;
const focusCandidateAll25GrantAccepted = validateGrantAgainstSealedPolicy({
  policyRegistry: sealedPolicy,
  grantPayload,
  grantCanonicalBytesSha256,
  grantEventOrdinal: 12,
  candidatePayload,
  auditPayload,
  preexistingAuditRecord
});
assert(focusCandidateAll25GrantAccepted, "focus candidate all25 grant accepted");

// 7. Independent canonicalization probes against the public implementation.
const canonicalKinds = [
  ["ACTIVATION_CANDIDATE", candidatePayload],
  ["ACTIVATION_CANDIDATE_AUDIT_REPORT", auditPayload],
  ["ACTIVATION_GRANT", grantPayload]
];
let canonicalPermutationChecks = 0;
for (const [kind, payload] of canonicalKinds) {
  const expected = canonicalPayloadFrame(kind, payload).sha256;
  const entries = Object.entries(payload);
  for (let seed = 0; seed < 256; seed += 1) {
    const rotated = entries.slice(seed % entries.length).concat(entries.slice(0, seed % entries.length));
    if (seed % 2 === 1) rotated.reverse();
    const reordered = Object.fromEntries(rotated);
    assert(canonicalPayloadFrame(kind, reordered).sha256 === expected, `canonical order ${kind}:${seed}`);
    canonicalPermutationChecks += 1;
  }
  const omitted = structuredClone(payload);
  delete omitted[Object.keys(omitted)[0]];
  expectThrow(() => canonicalPayloadFrame(kind, omitted), `canonical omission ${kind}`);
  const extra = { ...payload, unexpectedField: h(`unexpected:${kind}`) };
  expectThrow(() => canonicalPayloadFrame(kind, extra), `canonical addition ${kind}`);
}
expectThrow(() => canonicalPayloadFromStrictJson(
  "ACTIVATION_CANDIDATE",
  JSON.stringify(candidatePayload).replace('{"profile":', '{"profile":"duplicate","profile":')
), "strict duplicate key");
const canonicalNumberVectors = [
  [0, "0"], [-0, "0"], [1e-7, "1e-7"], [1e-6, "0.000001"],
  [1e20, "100000000000000000000"], [1e21, "1e+21"],
  [333333333.33333329, "333333333.3333333"], [4.5, "4.5"], [0.002, "0.002"]
];
for (const [value, expected] of canonicalNumberVectors) {
  assert(canonicalizeJcs(value) === expected, `canonical number ${String(value)}`);
}
assert(
  canonicalizeJcs({ "\u{10000}": 1, "\ue000": 2 }) === "{\"𐀀\":1,\"\":2}",
  "canonical UTF-16 property ordering"
);

// 8. Independent fingerprint output is emitted for a separate implementation to
// compare.  Arbitrary claimed component and slot/type/epoch swaps are rejected.
const fingerprintInput = {
  fullText: "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.",
  visibleSurface: "Alpha beta gamma delta epsilon zeta eta theta.",
  surfaceTemplate: "Alpha ____ gamma delta epsilon zeta eta theta.",
  topicTags: ["Cognition", "Memory"],
  scenarioEntities: [{ entityType: "student", entityId: "learner-01", role: "reader" }],
  authorPrincipalCommitmentSha256: h("fingerprint-author"),
  canonicalTypeId: "GRAMMAR_ERROR",
  canonicalFamilyId: null,
  rotationEpoch: 1
};
const fingerprintBundle = deriveFingerprintBundle(fingerprintInput);
assert(validateFingerprintBundle(fingerprintInput, fingerprintBundle).components.compositeFingerprintSha256 ===
  fingerprintBundle.components.compositeFingerprintSha256, "fingerprint baseline");
const badClaim = structuredClone(fingerprintBundle);
badClaim.components.compositeFingerprintSha256 = h("arbitrary-claimed-composite");
expectThrow(() => validateFingerprintBundle(fingerprintInput, badClaim), "arbitrary fingerprint claim");
const slotBinding = {
  slotId: "MC-G-01",
  phase: "MAIN_CERTIFICATION",
  itemAuthorPrincipalCommitmentSha256: fingerprintInput.authorPrincipalCommitmentSha256,
  canonicalTypeId: fingerprintInput.canonicalTypeId,
  canonicalFamilyId: fingerprintInput.canonicalFamilyId,
  rotationEpoch: fingerprintInput.rotationEpoch,
  fingerprintInputCommitmentRootSha256: fingerprintBundle.inputCommitmentRootSha256,
  fingerprintCompositeSha256: fingerprintBundle.components.compositeFingerprintSha256,
  fingerprintDerivationProofSha256: deriveSlotFingerprintProof({ slotId: "MC-G-01", phase: "MAIN_CERTIFICATION", bundle: fingerprintBundle })
};
assert(validateSlotFingerprintBinding(fingerprintInput, fingerprintBundle, slotBinding), "slot fingerprint baseline");
const swappedSlot = { ...slotBinding, rotationEpoch: 2 };
expectThrow(() => validateSlotFingerprintBinding(fingerprintInput, fingerprintBundle, swappedSlot), "slot epoch swap");

const output = {
  schemaVersion: "reviewer-calibration-v4-independent-target-conformance-probe-1",
  subjectAuthorTestsOrFixturesExecuted: false,
  identityCryptoOrKeyOperationsPerformed: false,
  checks: {
    crossedIdentityRegistrySealed: true,
    crossedPseudonymRoleAssignmentAccepted: true,
    policyTupleCount: sealedPolicy.tupleCount,
    mutableDerivedPolicyAuthorizationAccepted: true,
    selfClaimedFutureStateAndAliasAccepted: true,
    distinctFocusCoverageAccepted: true,
    reusedFocusCoverageRejected: true,
    focusCandidateAll25GrantAccepted: true,
    canonicalPermutationChecks,
    canonicalNumberChecks: canonicalNumberVectors.length,
    canonicalUtf16PropertyOrderCheck: true,
    canonicalMissingAndExtraRejected: true,
    strictDuplicateRejected: true,
    fingerprintArbitraryClaimRejected: true,
    fingerprintSlotEpochSwapRejected: true
  },
  fingerprintSample: {
    input: fingerprintInput,
    bundle: fingerprintBundle,
    slotBinding
  },
  exportSurfaceExpectedButAbsent: {
    accessTransactionValidator: true,
    capabilityRegistrySingleUseValidator: true,
    fingerprintReservationTombstoneDisjointnessValidator: true
  },
  typeFamilyCount: Object.keys(FINGERPRINT_FAMILY_BY_TYPE).length
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
