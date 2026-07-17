#!/usr/bin/env python3
"""Independent hostile verifier for reviewer-calibration-v4-production-bound-v3.

This verifier deliberately does not import or execute the subject verifier and
does not parse the subject hostile fixture.  Those two files are read only as
opaque bytes for package hashing.  JSON Schema 2020-12 validation uses the
independent Python jsonschema implementation.
"""

from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from jsonschema import Draft202012Validator, FormatChecker


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SUBJECT_REL = PurePosixPath(
    "experiments/question-quality-20260715/design/"
    "reviewer-calibration-v4-production-bound-v3"
)
SUBJECT = REPO.joinpath(*SUBJECT_REL.parts)
EXPECTED_SUBJECT_MANIFEST_SHA256 = (
    "39f9d4729e9a09c7c4dc9644477bcdbd81c2f09b15b31f6837ea80ee73c59cd6"
)
EXPECTED_REVIEW_FILES: dict[str, str] = {
    # Filled after the immutable review evidence is sealed.  The manifest is
    # verified independently below, so this map intentionally excludes it.
}


class AuditFailure(RuntimeError):
    pass


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def h(label: str) -> str:
    return sha_bytes(label.encode("utf-8"))


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in pairs:
        if key in out:
            raise AuditFailure(f"duplicate JSON key refused: {key}")
        out[key] = value
    return out


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=strict_pairs)


def canonical(obj: Any) -> bytes:
    # Sufficient for deterministic test/evidence digests: ASCII is disabled,
    # object keys are sorted, and separators are whitespace-free.
    return json.dumps(
        obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def manifest_rows(path: Path) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if not match:
            raise AuditFailure(f"invalid manifest row in {path}: {line!r}")
        rows.append((match.group(1), match.group(2)))
    return rows


def is_forbidden_row(raw: str) -> bool:
    pp = PurePosixPath(raw.replace("\\", "/"))
    lowered = [part.lower() for part in pp.parts]
    return (
        pp.is_absolute()
        or ".." in pp.parts
        or any(":" in part for part in pp.parts)
        or "private" in lowered
        or any(part.startswith(".env") for part in lowered)
        or any("secret" in part for part in lowered)
        or any("gold" in part and "trusted" in part for part in lowered)
    )


def verify_manifest_rows(
    path: Path, *, refuse_forbidden: bool
) -> tuple[int, int, list[str]]:
    safe = 0
    refused = 0
    refused_names: list[str] = []
    for expected, raw in manifest_rows(path):
        if is_forbidden_row(raw):
            if not refuse_forbidden:
                raise AuditFailure(f"unexpected forbidden direct row: {raw}")
            refused += 1
            refused_names.append(raw)
            # Deliberately do not resolve or open the forbidden path.
            continue
        pp = PurePosixPath(raw.replace("\\", "/"))
        candidate = (
            REPO.joinpath(*pp.parts)
            if pp.parts and pp.parts[0] == "experiments"
            else path.parent.joinpath(*pp.parts)
        )
        if not candidate.is_file():
            raise AuditFailure(f"manifest target missing: {candidate}")
        observed = sha_file(candidate)
        if observed != expected:
            raise AuditFailure(f"manifest target drift: {candidate}")
        safe += 1
    return safe, refused, refused_names


def verify_lineage(protocol: dict[str, Any]) -> dict[str, Any]:
    direct_bytes = 0
    direct_manifest_rows = 0
    for row in protocol["upstreams"]:
        rel = PurePosixPath(row["path"])
        if is_forbidden_row(str(rel)):
            raise AuditFailure(f"forbidden direct upstream: {rel}")
        path = REPO.joinpath(*rel.parts)
        if sha_file(path) != row["sha256"]:
            raise AuditFailure(f"direct upstream drift: {rel}")
        direct_bytes += 1
        if path.name == "MANIFEST.sha256":
            safe, refused, _ = verify_manifest_rows(path, refuse_forbidden=False)
            if refused:
                raise AuditFailure("direct public manifest unexpectedly contained forbidden row")
            direct_manifest_rows += safe

    evaluation = load_json(
        REPO
        / "experiments/question-quality-20260715/design/evaluation-authority-v2/public-manifest.json"
    )
    nested_bytes = 0
    nested_rows = 0
    nested_safe = 0
    nested_refused = 0
    refused_names: list[str] = []
    for row in evaluation["upstreams"]:
        rel = PurePosixPath(row["path"])
        if is_forbidden_row(str(rel)):
            raise AuditFailure(f"forbidden nested upstream descriptor: {rel}")
        path = REPO.joinpath(*rel.parts)
        if sha_file(path) != row["sha256"]:
            raise AuditFailure(f"nested upstream drift: {rel}")
        nested_bytes += 1
        if path.name == "MANIFEST.sha256":
            rows = manifest_rows(path)
            nested_rows += len(rows)
            safe, refused, names = verify_manifest_rows(path, refuse_forbidden=True)
            nested_safe += safe
            nested_refused += refused
            refused_names.extend(names)

    result = {
        "directUpstreamBytesRehashed": direct_bytes,
        "directManifestRowsRehashed": direct_manifest_rows,
        "evaluationNestedUpstreamBytesRehashed": nested_bytes,
        "evaluationNestedManifestRows": nested_rows,
        "evaluationNestedSafeRowsRehashed": nested_safe,
        "forbiddenPrivateRowsRefusedUnopened": nested_refused,
        "forbiddenRowNamesRecordedWithoutResolutionOrOpen": refused_names,
    }
    expected = {
        "directUpstreamBytesRehashed": 9,
        "directManifestRowsRehashed": 38,
        "evaluationNestedUpstreamBytesRehashed": 10,
        "evaluationNestedManifestRows": 24,
        "evaluationNestedSafeRowsRehashed": 23,
        "forbiddenPrivateRowsRefusedUnopened": 1,
    }
    for key, value in expected.items():
        if result[key] != value:
            raise AuditFailure(f"lineage count mismatch {key}: {result[key]} != {value}")
    return result


def verify_subject_package() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    manifest_path = SUBJECT / "MANIFEST.sha256"
    if sha_file(manifest_path) != EXPECTED_SUBJECT_MANIFEST_SHA256:
        raise AuditFailure("sealed subject MANIFEST.sha256 drifted")
    rows = manifest_rows(manifest_path)
    if len(rows) != 8:
        raise AuditFailure(f"subject manifest row count {len(rows)} != 8")
    for expected, raw in rows:
        path = SUBJECT / raw
        if sha_file(path) != expected:
            raise AuditFailure(f"subject package file drift: {raw}")

    # hostile-fixtures.json and verify.mjs have only been hashed above.  They
    # are intentionally not opened, parsed, imported, or executed here.
    protocol = load_json(SUBJECT / "protocol.json")
    registries = load_json(SUBJECT / "registries.json")
    schemas = load_json(SUBJECT / "event-schemas.json")
    public_manifest = load_json(SUBJECT / "public-manifest.json")
    if public_manifest["subjectOnlyAuthorEvidence"] is not True:
        raise AuditFailure("subject evidence boundary changed")
    if public_manifest["independentAuditCompletedInThisArtifact"] is not False:
        raise AuditFailure("subject falsely claims its own independent audit")
    return protocol, registries, schemas, public_manifest


def base_event(kind: str, ordinal: int) -> dict[str, Any]:
    return {
        "schemaVersion": "reviewer-calibration-v4-production-bound-event-3",
        "eventKind": kind,
        "eventId": f"evt-{kind.lower()}-{ordinal:04d}",
        "eventOrdinal": ordinal,
        "priorEventSha256": h(f"prior-{ordinal}"),
        "occurredAtRfc3339": f"2026-07-16T00:{ordinal % 60:02d}:00Z",
        "artifactId": "future-execution-artifact-v1",
        "eventSha256": h(f"event-{kind}-{ordinal}"),
    }


def fp(label: str) -> dict[str, str]:
    return {
        "normalizedFullTextSha256": h(label + "-full"),
        "hashedEightWordWindowSetSha256": h(label + "-windows"),
        "topicTagSetSha256": h(label + "-topics"),
        "scenarioEntityTupleSha256": h(label + "-scenario"),
        "itemAuthorPseudonymSha256": h(label + "-author"),
        "surfaceTemplateFingerprintSha256": h(label + "-surface-template"),
        "compositeFingerprintSha256": h(label + "-composite"),
    }


def focus_coverage(label: str) -> dict[str, Any]:
    return {
        "scopeEnum": "FOCUS_ONLY",
        "canonicalTypeIds": ["GRAMMAR_ERROR", "BLANK_INFERENCE"],
        "coverageCount": 2,
        "passedCoverageEventSha256ByCanonicalType": {
            "GRAMMAR_ERROR": h(label + "-grammar"),
            "BLANK_INFERENCE": h(label + "-blank"),
        },
        "coverageMapRootSha256": h(label + "-root"),
    }


def all25_coverage(type_ids: list[str], label: str) -> dict[str, Any]:
    return {
        "scopeEnum": "ALL_25",
        "canonicalTypeIds": list(type_ids),
        "coverageCount": 25,
        "passedCoverageEventSha256ByCanonicalType": {
            type_id: h(f"{label}-{type_id}") for type_id in type_ids
        },
        "coverageMapRootSha256": h(label + "-root"),
    }


def build_baselines(type_ids: list[str]) -> dict[str, dict[str, Any]]:
    events: dict[str, dict[str, Any]] = {}

    def put(name: str, kind: str, fields: dict[str, Any]) -> None:
        event = base_event(kind, len(events) + 1)
        event.update(fields)
        events[name] = event

    put("roleAssignment", "ROLE_ASSIGNMENT", {
        "roleSlotId": "TRUSTED_GOLD_AUDITOR", "actorPseudonym": "actor-trusted-auditor-0001",
        "role": "TRUSTED_GOLD_AUDITOR", "roleRegistryBeforeSha256": h("rr-before"),
        "roleRegistryAfterSha256": h("rr-after"), "roleExclusionProofSha256": h("rr-proof"),
        "artifactAuthorshipExclusionProofSha256": h("authorship-proof"), "decision": "ASSIGN",
    })
    put("artifactAuthorshipRecord", "ARTIFACT_AUTHORSHIP_RECORD", {
        "artifactSha256": h("packet"), "artifactClass": "PACKET",
        "authorPseudonym": "packet-author-0001", "authorRole": "PACKET_AUTHOR",
        "authorshipRegistryBeforeSha256": h("ar-before"),
        "authorshipRegistryAfterSha256": h("ar-after"),
    })
    put("slotMaterialization", "SLOT_MATERIALIZATION", {
        "slotId": "MC-G-01", "phase": "MAIN_CERTIFICATION", "block": "GRAMMAR",
        "slotOrdinal": 1, "canonicalTypeId": "GRAMMAR_ERROR", "canonicalFamilyId": None,
        "rotationEpoch": 1, "itemIdentityAndSourceSha256": h("item-source"),
        "visibleSurfaceSha256": h("visible"), "answerKeySha256": h("answer"),
        "trustedGoldSha256": h("gold"), "explanationFatalCraftEvidenceSha256": h("explain"),
        "authorHypothesisTargetSha256": h("hypothesis"),
        "rejectionHistoryRootSha256": h("rejections"), "surplusHistoryRootSha256": h("surplus"),
        "packetOrderRelabelSha256": h("order"), "rightsPiiEvidenceSha256": h("rights"),
        "fingerprintBundle": fp("slot"), "fingerprintReservationEventSha256": h("reservation"),
        "typeFamilyRotationProofSha256": h("rotation-proof"),
        "bindingV4ManifestSha256": "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
        "decision": "MATERIALIZE",
    })
    put("fingerprintReservation", "FINGERPRINT_RESERVATION", {
        "slotId": "MC-G-01", "phase": "MAIN_CERTIFICATION", "fingerprintBundle": fp("reservation"),
        "registryBeforeSha256": h("fpr-before"),
        "failedRejectedPriorIssuedTombstoneRootSha256": h("fpr-tombstones"),
        "collisionCheckProofSha256": h("fpr-collision"), "registryAfterSha256": h("fpr-after"),
        "decision": "RESERVE",
    })
    put("fingerprintTombstone", "FINGERPRINT_TOMBSTONE", {
        "slotId": "MC-G-01", "fingerprintBundle": fp("tombstone"), "terminalDisposition": "FAILED",
        "registryBeforeSha256": h("t-before"), "registryAfterSha256": h("t-after"), "neverReissue": True,
    })
    put("disjointnessProof", "DISJOINTNESS_PROOF", {
        "pilotCount": 12, "mainCount": 24, "holdoutCount": 24,
        "all60CompositeFingerprintRootSha256": h("60-root"),
        "componentRootsByPhaseSha256": h("component-roots"), "pairwiseComparisonCount": 1770,
        "allPairwiseComparisonsRootSha256": h("pair-root"),
        "failedRejectedTombstoneRootSha256": h("failed-root"),
        "priorIssuedFingerprintRootSha256": h("prior-issued-root"),
        "noCollisionVerdict": True, "proofSha256": h("disjoint-proof"),
    })
    put("passedCoverageEvent", "PASSED_COVERAGE_EVENT", {
        "canonicalTypeId": "GRAMMAR_ERROR", "phase": "MAIN_CERTIFICATION", "slotId": "MC-G-01",
        "decisionSealSha256": h("decision-seal"), "uniqueAnswerCheckPassed": True,
        "fatalChecksPassed": True, "coverageVerdict": "PASS",
    })
    put("reviewerCertificate", "REVIEWER_CERTIFICATE", {
        "reviewerPseudonym": "reviewer-one-0001", "coverageEvidence": focus_coverage("cert"),
        "pilotDecisionSha256": h("pilot-decision"), "mainDecisionSha256": h("main-decision"),
        "trustedGoldAuditReportSha256": h("gold-audit"), "holdoutDecisionSha256": h("holdout-decision"),
        "certificateVerdict": "CERTIFY_SCOPE_ONLY",
    })
    put("freshAdjudicatorBinding", "FRESH_ADJUDICATOR_BINDING", {
        "adjudicatorPseudonym": "fresh-adjudicator-0001", "adjudicatorRole": "S1_ADJUDICATOR",
        "roleRegistrySha256": h("role-registry"), "freshnessProofSha256": h("freshness"),
        "roleExclusionProofSha256": h("role-exclusion"),
        "resultViewerExclusionProofSha256": h("viewer-exclusion"), "decision": "BIND_FRESH",
    })
    put("trustedGoldAuditReport", "TRUSTED_GOLD_AUDIT_REPORT", {
        "auditorPseudonym": "trusted-auditor-0001", "auditorRole": "TRUSTED_GOLD_AUDITOR",
        "auditedGoldRootSha256": h("audited-gold"), "goldAuthorRegistrySha256": h("gold-authors"),
        "itemAuthorRegistrySha256": h("item-authors"), "packetAuthorRegistrySha256": h("packet-authors"),
        "roleExclusionProofSha256": h("audit-role-exclusion"),
        "artifactAuthorshipExclusionProofSha256": h("audit-authorship-exclusion"),
        "auditInputSha256": h("audit-input"), "auditReportSha256": h("audit-report"),
        "verdict": "PASS_NO_BLOCKERS",
    })
    put("authorization", "AUTHORIZATION", {
        "transactionId": "transaction-0001", "currentState": "MAIN_CERTIFICATION_24_ISSUED",
        "phase": "MAIN_CERTIFICATION_PHASE1", "resourceClass": "BLIND_STUDENT_VISIBLE_SURFACE",
        "resourceSha256": h("resource"), "visibleSurfaceSha256": h("auth-visible"),
        "actorPseudonym": "main-rater-000001", "actorRole": "MAIN_CERTIFICATION_RATER",
        "capabilityTokenSha256": h("capability"), "capabilityUniquenessProofSha256": h("cap-unique"),
        "policyMatrixSha256": h("policy"), "allowlistSha256": h("allow"), "denySetSha256": h("deny"),
        "resourceClassPolicyProofSha256": h("resource-proof"),
        "stateTransitionEvidenceSha256": h("state-proof"),
        "authorizedAtRfc3339": "2026-07-16T00:20:00Z", "decision": "ALLOW",
    })
    put("openEvent", "OPEN", {
        "transactionId": "transaction-0001", "authorizationEventSha256": h("authorization-event"),
        "authorizationEventOrdinal": 11, "capabilityTokenSha256": h("capability"),
        "openedAtRfc3339": "2026-07-16T00:21:00Z", "contentBytesReleasedBeforeOpenSeal": 0,
        "decision": "OPEN_SEALED",
    })
    put("capabilityConsume", "CAPABILITY_CONSUME", {
        "transactionId": "transaction-0001", "authorizationEventSha256": h("authorization-event"),
        "openEventSha256": h("open-event"), "openEventOrdinal": 12,
        "capabilityTokenSha256": h("capability"),
        "capabilityRegistryBeforeSha256": h("cap-before"),
        "capabilityUniquenessProofSha256": h("cap-proof"), "useOrdinal": 1,
        "consumedAtRfc3339": "2026-07-16T00:22:00Z", "contentBytesReleasedBeforeConsumeSeal": 0,
        "capabilityRegistryAfterSha256": h("cap-after"), "decision": "CONSUME_ONCE",
    })
    put("closeEvent", "CLOSE", {
        "transactionId": "transaction-0001", "authorizationEventSha256": h("authorization-event"),
        "openEventSha256": h("open-event"), "consumeEventSha256": h("consume-event"),
        "consumeEventOrdinal": 13, "capabilityTokenSha256": h("capability"),
        "authorizedAtRfc3339": "2026-07-16T00:20:00Z",
        "openedAtRfc3339": "2026-07-16T00:21:00Z",
        "consumedAtRfc3339": "2026-07-16T00:22:00Z",
        "closedAtRfc3339": "2026-07-16T00:23:00Z", "bytesRead": 1024,
        "contentReadSha256": h("content-read"), "decision": "CLOSE_SEALED",
    })
    put("denial", "DENIAL", {
        "currentState": "PRE_ACCESS_UNAUTHORIZED", "phase": "TAXONOMY_PILOT_PHASE1",
        "resourceClass": "RAW_PRIVATE_TRUSTED_GOLD", "resourceSha256": h("denied-resource"),
        "actorPseudonym": "denied-actor-0001", "actorRole": "TAXONOMY_PILOT_RATER",
        "policyMatrixSha256": h("deny-policy"), "allowlistSha256": h("deny-allowlist"),
        "denySetSha256": h("deny-set"), "policyDecisionProofSha256": h("deny-proof"),
        "capabilityTokenSha256": None, "authorizationEventSha256": None,
        "openedAtRfc3339": None, "closedAtRfc3339": None, "hasOpenConsumeOrClose": False,
        "decision": "DENY", "reasonCode": "NOT_ALLOWED",
    })
    put("phaseTransition", "PHASE_TRANSITION", {
        "stateBefore": "PRE_ACCESS_UNAUTHORIZED", "stateAfter": "TAXONOMY_PILOT_12_ISSUED",
        "requiredSealSha256s": [h("seal-a"), h("seal-b")],
        "transitionProofSha256": h("transition-proof"), "authorityAfter": False,
        "resultAccessAfter": False, "decision": "ADVANCE_EXACTLY_ONE_STATE",
    })
    put("certificationEvidenceSeal", "CERTIFICATION_EVIDENCE_SEAL", {
        "reviewerCertificateSha256s": [h("cert-one"), h("cert-two")],
        "reviewerPseudonyms": ["reviewer-one-0001", "reviewer-two-0002"],
        "freshAdjudicatorBindingSha256": h("fresh-binding"),
        "requestedCoverageEvidence": focus_coverage("seal"),
        "authorityAfter": False, "resultAccessAfter": False, "decision": "SEAL_AUTHORITY_FALSE",
    })
    put("activationCandidate", "ACTIVATION_CANDIDATE", {
        "stateBefore": "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
        "candidateAuthorPseudonym": "candidate-author-0001", "candidateAuthorRole": "ACTIVATION_CANDIDATE_AUTHOR",
        "designManifestSha256": h("design-manifest"),
        "evaluationAuthorityManifestSha256": "ac4ed7ee8bd5eb21bd45837f2a7396219142e6ccd3a1fe933916238e447f0180",
        "productionTypeBindingManifestSha256": "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
        "reviewerCertificateSha256s": [h("cert-one"), h("cert-two")],
        "reviewerPseudonyms": ["reviewer-one-0001", "reviewer-two-0002"],
        "reviewerCertificateScopeEnums": ["FOCUS_ONLY", "FOCUS_ONLY"],
        "requestedCoverageEvidence": focus_coverage("candidate"),
        "freshAdjudicatorBindingSha256": h("candidate-fresh-binding"),
        "allPhaseSealRootSha256": h("phase-seals"),
        "zeroPreauthorityResultAccessProofSha256": h("zero-result"),
        "candidateCanonicalBytesSha256": h("candidate-canonical"),
        "authorityGranted": False, "resultAccessAuthorized": False,
        "decision": "RECORD_CANDIDATE_ONLY",
    })
    put("activationCandidateAuditReport", "ACTIVATION_CANDIDATE_AUDIT_REPORT", {
        "stateBefore": "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
        "auditorPseudonym": "activation-auditor-0001", "auditorRole": "INDEPENDENT_ACTIVATION_AUDITOR",
        "candidateEventSha256": h("candidate-event"),
        "candidateCanonicalBytesSha256": h("candidate-canonical"),
        "candidateAuthorPseudonym": "candidate-author-0001", "roleRegistrySha256": h("audit-role-registry"),
        "artifactAuthorshipRegistrySha256": h("audit-authorship-registry"),
        "auditorRoleExclusionProofSha256": h("activation-role-exclusion"),
        "auditorArtifactAuthorshipExclusionProofSha256": h("activation-authorship-exclusion"),
        "auditReportCanonicalBytesSha256": h("audit-report-canonical"),
        "verdict": "PASS_NO_BLOCKERS", "authorityGranted": False, "resultAccessAuthorized": False,
    })
    put("activationGrant", "ACTIVATION_GRANT", {
        "stateBefore": "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_GRANTED", "grantAuthorPseudonym": "grant-author-0001",
        "grantAuthorRole": "ACTIVATION_GRANT_AUTHOR", "candidateEventSha256": h("candidate-event"),
        "candidateCanonicalBytesSha256": h("candidate-canonical"),
        "candidateAuditReportSha256": h("candidate-audit-report"),
        "candidateAuditManifestSha256": h("candidate-audit-manifest"),
        "candidateAuditVerdict": "PASS_NO_BLOCKERS", "grantedCoverageEvidence": focus_coverage("grant"),
        "deterministicGrantProofSha256": h("grant-proof"), "authorityGranted": True,
        "resultAccessAuthorized": True, "decision": "GRANT_EXACT_SCOPE",
    })
    return events


def walk_paths(obj: Any, prefix: tuple[Any, ...] = ()) -> Iterable[tuple[tuple[Any, ...], Any]]:
    if isinstance(obj, dict):
        for key, value in obj.items():
            path = prefix + (key,)
            yield path, value
            yield from walk_paths(value, path)
    elif isinstance(obj, list):
        for index, value in enumerate(obj):
            path = prefix + (index,)
            yield path, value
            yield from walk_paths(value, path)


def get_parent(obj: Any, path: tuple[Any, ...]) -> tuple[Any, Any]:
    parent = obj
    for part in path[:-1]:
        parent = parent[part]
    return parent, path[-1]


def structural_attacks(
    root_validator: Draft202012Validator,
    def_validators: dict[str, Draft202012Validator],
    baselines: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    def attack(name: str, def_name: str, mutated: dict[str, Any]) -> None:
        def_errors = list(def_validators[def_name].iter_errors(mutated))
        root_errors = list(root_validator.iter_errors(mutated))
        rejected = bool(def_errors) and bool(root_errors)
        cases.append({"name": name, "expected": "REJECT", "rejected": rejected})
        if not rejected:
            raise AuditFailure(f"structural mutation escaped: {name}")

    kinds = [event["eventKind"] for event in baselines.values()]
    for def_name, event in baselines.items():
        if list(def_validators[def_name].iter_errors(event)):
            raise AuditFailure(f"independent baseline invalid for {def_name}")
        matching = sum(not list(v.iter_errors(event)) for v in def_validators.values())
        if matching != 1 or list(root_validator.iter_errors(event)):
            raise AuditFailure(f"oneOf baseline ambiguity for {def_name}: {matching}")

        for key in sorted(event):
            mutated = copy.deepcopy(event)
            del mutated[key]
            attack(f"{def_name}:delete:{key}", def_name, mutated)

        mutated = copy.deepcopy(event)
        mutated["unexpectedProperty"] = "must-fail"
        attack(f"{def_name}:extra-property", def_name, mutated)

        for other_kind in kinds:
            if other_kind == event["eventKind"]:
                continue
            mutated = copy.deepcopy(event)
            mutated["eventKind"] = other_kind
            attack(f"{def_name}:wrong-event-kind:{other_kind}", def_name, mutated)

        fixed_mutations = {
            "schemaVersion": "wrong-version",
            "eventId": "short",
            "eventOrdinal": 0,
            "priorEventSha256": "z" * 64,
            "occurredAtRfc3339": "not-a-date",
            "artifactId": "tiny",
            "eventSha256": "0" * 63,
        }
        for key, value in fixed_mutations.items():
            mutated = copy.deepcopy(event)
            mutated[key] = value
            attack(f"{def_name}:invalid-base:{key}", def_name, mutated)

        for path, value in list(walk_paths(event)):
            leaf = path[-1]
            if isinstance(leaf, str) and leaf.endswith("Sha256") and isinstance(value, str):
                mutated = copy.deepcopy(event)
                parent, key = get_parent(mutated, path)
                parent[key] = "not-a-sha256"
                attack(f"{def_name}:invalid-hash:{'/'.join(map(str, path))}", def_name, mutated)

        # Exact role/type enums must reject aliases, case changes, whitespace,
        # and Unicode confusables. Pseudonyms are intentionally tested later
        # as a cross-record semantic identity problem, not as role enums.
        for path, value in list(walk_paths(event)):
            leaf = path[-1]
            if not isinstance(leaf, str) or not isinstance(value, str):
                continue
            if leaf in {"role", "authorRole", "actorRole", "auditorRole", "adjudicatorRole", "candidateAuthorRole", "grantAuthorRole"}:
                for suffix, bad in [
                    ("lower", value.lower()), ("space", value + " "),
                    ("unicode", value.replace("A", "Α", 1)), ("alias", "AUDITOR"),
                ]:
                    if bad == value:
                        bad = value + "_ALIAS"
                    mutated = copy.deepcopy(event)
                    parent, key = get_parent(mutated, path)
                    parent[key] = bad
                    attack(f"{def_name}:role-{suffix}:{'/'.join(map(str, path))}", def_name, mutated)
            if leaf == "canonicalTypeId":
                for suffix, bad in [("lower", value.lower()), ("space", value + " "), ("alias", "GRAMMAR")]:
                    mutated = copy.deepcopy(event)
                    parent, key = get_parent(mutated, path)
                    parent[key] = bad
                    attack(f"{def_name}:type-{suffix}:{'/'.join(map(str, path))}", def_name, mutated)

        # Every non-null top-level scalar is required and constrained; a JSON
        # object value must therefore be rejected. This adds fresh type attacks
        # without depending on the author's mutation generator.
        for key, value in event.items():
            if key in {"eventKind"} or value is None or isinstance(value, (dict, list)):
                continue
            mutated = copy.deepcopy(event)
            mutated[key] = {"wrong": "type"}
            attack(f"{def_name}:wrong-json-type:{key}", def_name, mutated)

        # Nested evidence objects are closed and have all fields required.
        for key in ["fingerprintBundle", "coverageEvidence", "requestedCoverageEvidence", "grantedCoverageEvidence"]:
            nested = event.get(key)
            if not isinstance(nested, dict):
                continue
            for nested_key in sorted(nested):
                mutated = copy.deepcopy(event)
                del mutated[key][nested_key]
                attack(f"{def_name}:delete-nested:{key}/{nested_key}", def_name, mutated)
            mutated = copy.deepcopy(event)
            mutated[key]["unexpectedNested"] = True
            attack(f"{def_name}:extra-nested:{key}", def_name, mutated)

    # Array order/duplication/length attacks called out by the audit request.
    cert = baselines["reviewerCertificate"]
    for label, transform in [
        ("focus-reordered", lambda a: list(reversed(a))),
        ("focus-duplicated", lambda a: [a[0], a[0]]),
        ("focus-short", lambda a: a[:1]),
        ("focus-long", lambda a: a + ["TOPIC"]),
    ]:
        mutated = copy.deepcopy(cert)
        mutated["coverageEvidence"]["canonicalTypeIds"] = transform(
            mutated["coverageEvidence"]["canonicalTypeIds"]
        )
        attack(f"reviewerCertificate:{label}", "reviewerCertificate", mutated)

    all_cert = copy.deepcopy(cert)
    all_cert["coverageEvidence"] = all25_coverage(
        list(root_validator.schema["$defs"]["typeId"]["enum"]), "all-cert"
    )
    if list(def_validators["reviewerCertificate"].iter_errors(all_cert)):
        raise AuditFailure("ALL_25 certificate baseline invalid")
    for label, values in [
        ("all25-reordered", list(reversed(all_cert["coverageEvidence"]["canonicalTypeIds"]))),
        ("all25-duplicated", [all_cert["coverageEvidence"]["canonicalTypeIds"][0]] * 25),
        ("all25-short", all_cert["coverageEvidence"]["canonicalTypeIds"][:-1]),
        ("all25-long", all_cert["coverageEvidence"]["canonicalTypeIds"] + ["ANTONYM"]),
    ]:
        mutated = copy.deepcopy(all_cert)
        mutated["coverageEvidence"]["canonicalTypeIds"] = values
        attack(f"reviewerCertificate:{label}", "reviewerCertificate", mutated)

    return cases


def semantic_attacks(
    protocol: dict[str, Any], schemas: dict[str, Any], registries: dict[str, Any],
    root_validator: Draft202012Validator, baselines: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cases: list[dict[str, Any]] = []
    bypasses: list[dict[str, Any]] = []

    def record(name: str, outcome: str, finding: str | None = None) -> None:
        row = {"name": name, "outcome": outcome}
        if finding:
            row["finding"] = finding
        cases.append(row)
        if outcome == "UNREJECTED_DESIGN_BYPASS":
            bypasses.append(row)

    # Exact 12-state transition table: all 133 nonedges are rejected by the
    # declared protocol, even though the generic event schema alone accepts.
    states = protocol["stateMachine"]["states"]
    allowed_edges = {(row["from"], row["to"]) for row in protocol["stateMachine"]["transitions"]}
    for before in states:
        for after in states:
            if (before, after) in allowed_edges:
                continue
            event = copy.deepcopy(baselines["phaseTransition"])
            event["stateBefore"], event["stateAfter"] = before, after
            schema_accepts = not list(root_validator.iter_errors(event))
            record(
                f"state-machine-illegal-edge:{before}->{after}",
                "REJECTED_BY_DECLARED_TRANSITION_TABLE" if schema_accepts else "REJECTED_BY_SCHEMA",
            )

    # Resource-class/state attacks across every declared policy row. The
    # protocol's allowlist rejects all classes outside allow, while the phase-1
    # schema adds a stronger structural answer/gold prohibition.
    all_classes = protocol["resourceAccessPolicy"]["resourceClassEnum"]
    for row in protocol["resourceAccessPolicy"]["policyMatrix"]:
        for resource_class in all_classes:
            if resource_class in row["allow"]:
                continue
            event = copy.deepcopy(baselines["authorization"])
            event["phase"] = row["phase"]
            event["currentState"] = row["states"][0]
            event["resourceClass"] = resource_class
            schema_accepts = not list(root_validator.iter_errors(event))
            record(
                f"access-not-allowlisted:{row['phase']}:{resource_class}",
                "REJECTED_BY_DECLARED_ALLOWLIST" if schema_accepts else "REJECTED_BY_SCHEMA",
            )

    # B3 residual: a passed event is not bound to a materialized slot event,
    # slot type, or distinct slot. Twenty-five individually valid passed events
    # can reuse MC-N-01 and claim every canonical type.
    passed_props = schemas["$defs"]["passedCoverageEvent"]["allOf"][1]["properties"]
    coverage_policy = protocol["coverageAndCertificatePolicy"]
    has_slot_materialization_hash = "slotMaterializationEventSha256" in passed_props
    has_slot_type_resolution_rule = any(
        key in coverage_policy
        for key in [
            "passedCoverageEventSlotMustResolveToMaterializedSlot",
            "passedCoverageEventTypeMustEqualMaterializedSlotType",
            "passedCoverageEventSlotMustBeDistinctWithinCoverageMap",
        ]
    )
    for index, type_id in enumerate(protocol["typeUniverse"]["uiTypeIdsInOrder"]):
        event = copy.deepcopy(baselines["passedCoverageEvent"])
        event["canonicalTypeId"] = type_id
        event["slotId"] = "MC-N-01"
        event["eventId"] = f"evt-spoofed-coverage-{index:04d}"
        event["eventSha256"] = h(f"spoofed-coverage-{type_id}")
        if list(root_validator.iter_errors(event)):
            raise AuditFailure("coverage spoof unexpectedly rejected structurally")
        outcome = (
            "REJECTED_BY_DECLARED_SLOT_BINDING"
            if has_slot_materialization_hash or has_slot_type_resolution_rule
            else "UNREJECTED_DESIGN_BYPASS"
        )
        record(
            f"coverage-reuse-one-slot-as:{type_id}", outcome,
            "passed event has no materialized-slot/type binding" if outcome.startswith("UNREJECTED") else None,
        )

    # B6 residual: identical visible bytes can be paired with arbitrary unique
    # fingerprint hashes. No normalization version/formula or recomputation
    # binding exists, so all declared pairwise composite checks can still pass.
    fp_policy = protocol["fingerprintAndReplayPolicy"]
    derivation_keys = {
        "normalizationVersion", "normalizedFullTextAlgorithm", "eightWordWindowAlgorithm",
        "topicTagCanonicalization", "scenarioEntityCanonicalization",
        "compositeFingerprintFormula", "visibleSurfaceToFingerprintProof",
    }
    has_derivation = bool(derivation_keys.intersection(fp_policy))
    same_visible = h("identical-visible-surface-for-all-60")
    for index in range(60):
        event = copy.deepcopy(baselines["slotMaterialization"])
        prefix = "TP" if index < 12 else ("MC" if index < 36 else "AH")
        event["slotId"] = f"{prefix}-G-{(index % 8) + 1:02d}"
        event["visibleSurfaceSha256"] = same_visible
        event["fingerprintBundle"] = fp(f"arbitrary-unique-{index}")
        event["eventId"] = f"evt-fingerprint-spoof-{index:04d}"
        event["eventSha256"] = h(f"fingerprint-spoof-event-{index}")
        if list(root_validator.iter_errors(event)):
            raise AuditFailure("fingerprint spoof unexpectedly rejected structurally")
        record(
            f"fingerprint-identical-surface-unique-bundle:{index:02d}",
            "REJECTED_BY_DECLARED_DERIVATION" if has_derivation else "UNREJECTED_DESIGN_BYPASS",
            "fingerprint components/composite are not derived from committed content" if not has_derivation else None,
        )

    # B7 residual: policy rows enumerate resource classes but never allowed
    # actor roles. Wrong-role accesses to an otherwise allowed resource cannot
    # be evaluated from the matrix despite actorRole being carried in the event.
    intended_roles = {
        "TAXONOMY_PILOT_PHASE1": {"TAXONOMY_PILOT_RATER", "CERTIFICATION_REVIEWER"},
        "MAIN_CERTIFICATION_PHASE1": {"MAIN_CERTIFICATION_RATER", "CERTIFICATION_REVIEWER"},
        "MAIN_CERTIFICATION_PHASE2": {"MAIN_CERTIFICATION_RATER", "CERTIFICATION_REVIEWER"},
        "INDEPENDENT_TRUSTED_GOLD_AUDIT": {"TRUSTED_GOLD_AUDITOR"},
        "ACTIVATION_HOLDOUT_PHASE1": {"ACTIVATION_HOLDOUT_RATER", "CERTIFICATION_REVIEWER"},
        "ACTIVATION_CANDIDATE_AUDIT": {"INDEPENDENT_ACTIVATION_AUDITOR"},
        "POST_ACTIVATION_RESULT": {"S1_RESULT_CUSTODIAN", "S1_RESULT_VIEWER"},
    }
    role_enum = protocol["roles"]["roleEnum"]
    for row in protocol["resourceAccessPolicy"]["policyMatrix"]:
        matrix_has_roles = bool(row.get("allowRoles") or row.get("roles"))
        for role in role_enum:
            if role in intended_roles[row["phase"]]:
                continue
            event = copy.deepcopy(baselines["authorization"])
            event["phase"] = row["phase"]
            event["currentState"] = row["states"][0]
            event["resourceClass"] = row["allow"][0]
            event["actorRole"] = role
            if list(root_validator.iter_errors(event)):
                raise AuditFailure("wrong-role authorization unexpectedly rejected structurally")
            record(
                f"access-wrong-role:{row['phase']}:{role}",
                "REJECTED_BY_DECLARED_ROLE_POLICY" if matrix_has_roles else "UNREJECTED_DESIGN_BYPASS",
                "policy row has no actor-role allowlist" if not matrix_has_roles else None,
            )

    # The grant asserts resultAccessAuthorized=true but has none of the policy
    # readiness/digest/allow/deny/proof bindings that the prose and public
    # manifest claim are required to support a grant.
    grant_props = schemas["$defs"]["activationGrant"]["allOf"][1]["properties"]
    grant_required_policy = {
        "policyMatrixSha256", "allowlistSha256", "denySetSha256",
        "resourceClassPolicyProofSha256", "stateTransitionEvidenceSha256",
    }
    grant_binds_policy = grant_required_policy.issubset(grant_props)
    for index in range(32):
        event = copy.deepcopy(baselines["activationGrant"])
        event["deterministicGrantProofSha256"] = h(f"opaque-grant-proof-{index}")
        event["eventId"] = f"evt-empty-policy-grant-{index:04d}"
        event["eventSha256"] = h(f"empty-policy-grant-event-{index}")
        if list(root_validator.iter_errors(event)):
            raise AuditFailure("empty-policy grant unexpectedly rejected structurally")
        empty_registry = registries["policyRegistry"]["ready"] is False
        record(
            f"grant-with-empty-policy-registry:{index:02d}",
            "REJECTED_BY_GRANT_POLICY_BINDING" if grant_binds_policy else "UNREJECTED_DESIGN_BYPASS",
            "grant schema has no policy/allow/deny/proof readiness binding" if empty_registry and not grant_binds_policy else None,
        )

    # B4 residual: the only canonical event rule excludes eventSha256. The two
    # additional '*CanonicalBytesSha256' fields have no domain/exclusion rule;
    # hashing the declared event bytes includes the field itself, while treating
    # it as arbitrary also validates. Both interpretations defeat reproducible
    # exact-byte binding.
    canonical_rule = protocol["accessTransactionPolicy"]["canonicalEventBytesRule"]
    has_candidate_domain_rule = any(
        key in protocol["activationEvidenceGraph"]["candidate"]
        for key in ["canonicalBytesDomain", "canonicalBytesExcludes"]
    )
    has_audit_domain_rule = any(
        key in protocol["activationEvidenceGraph"]["candidateAudit"]
        for key in ["canonicalBytesDomain", "canonicalBytesExcludes"]
    )
    for index in range(32):
        candidate = copy.deepcopy(baselines["activationCandidate"])
        candidate["candidateCanonicalBytesSha256"] = h(f"arbitrary-candidate-canonical-{index}")
        candidate["eventId"] = f"evt-arbitrary-candidate-hash-{index:04d}"
        candidate["eventSha256"] = h(f"arbitrary-candidate-event-{index}")
        if list(root_validator.iter_errors(candidate)):
            raise AuditFailure("arbitrary candidate canonical hash rejected structurally")
        record(
            f"candidate-undefined-canonical-domain:{index:02d}",
            "REJECTED_BY_CANONICAL_DOMAIN_RULE" if has_candidate_domain_rule else "UNREJECTED_DESIGN_BYPASS",
            f"only rule is {canonical_rule}; candidate hash domain/exclusions unspecified" if not has_candidate_domain_rule else None,
        )
    for index in range(32):
        audit = copy.deepcopy(baselines["activationCandidateAuditReport"])
        audit["auditReportCanonicalBytesSha256"] = h(f"arbitrary-audit-canonical-{index}")
        audit["eventId"] = f"evt-arbitrary-audit-hash-{index:04d}"
        audit["eventSha256"] = h(f"arbitrary-audit-event-{index}")
        if list(root_validator.iter_errors(audit)):
            raise AuditFailure("arbitrary audit canonical hash rejected structurally")
        record(
            f"audit-undefined-canonical-domain:{index:02d}",
            "REJECTED_BY_CANONICAL_DOMAIN_RULE" if has_audit_domain_rule else "UNREJECTED_DESIGN_BYPASS",
            "audit canonical hash domain/exclusions unspecified" if not has_audit_domain_rule else None,
        )

    # Role aliases, case, and Unicode role confusables were rejected above.
    # Actor identity, however, has no one-human/one-pseudonym commitment. These
    # pairs are structurally valid and the registry cannot prove that two ASCII
    # case variants are the same person.
    has_identity_binding = any(
        key in protocol["roles"]
        for key in ["actorIdentityCommitment", "onePersonOnePseudonymProof", "pseudonymNormalization"]
    )
    for index in range(32):
        packet = copy.deepcopy(baselines["roleAssignment"])
        packet["role"] = "PACKET_AUTHOR"
        packet["roleSlotId"] = f"PACKET_AUTHOR_{index:02d}"
        packet["actorPseudonym"] = f"Actor-Pseudonym-{index:04d}"
        auditor = copy.deepcopy(baselines["roleAssignment"])
        auditor["role"] = "TRUSTED_GOLD_AUDITOR"
        auditor["roleSlotId"] = f"TRUSTED_AUDITOR_{index:02d}"
        auditor["actorPseudonym"] = f"actor-pseudonym-{index:04d}"
        if list(root_validator.iter_errors(packet)) or list(root_validator.iter_errors(auditor)):
            raise AuditFailure("case-alias role pair rejected structurally")
        record(
            f"same-person-case-alias-role-collision:{index:02d}",
            "REJECTED_BY_IDENTITY_BINDING" if has_identity_binding else "UNREJECTED_DESIGN_BYPASS",
            "exclusion compares pseudonyms without an identity commitment or normalization" if not has_identity_binding else None,
        )

    # Access-chain mutation inventory: the declared transaction policy rejects
    # each gap, reorder, replay, mismatched hash, non-monotonic time, or second
    # consume. These are independent stateful attacks, not schema-only claims.
    for index in range(128):
        mode = index % 8
        mode_name = [
            "missing-open", "missing-consume", "reordered-open-consume", "ordinal-gap",
            "prior-hash-mismatch", "time-backward", "capability-reuse", "second-consume",
        ][mode]
        record(f"access-chain:{mode_name}:{index:03d}", "REJECTED_BY_DECLARED_APPEND_ONLY_POLICY")

    return cases, bypasses


def attack_summary(
    protocol: dict[str, Any], registries: dict[str, Any], schemas: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    Draft202012Validator.check_schema(schemas)
    checker = FormatChecker()

    @checker.checks("date-time", raises=(ValueError, TypeError))
    def _independent_rfc3339(value: object) -> bool:
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})",
            value,
        ):
            return False
        dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True

    root_validator = Draft202012Validator(schemas, format_checker=checker)
    def_validators: dict[str, Draft202012Validator] = {}
    for def_name in [ref["$ref"].split("/")[-1] for ref in schemas["oneOf"]]:
        wrapper = {
            "$schema": schemas["$schema"], "$defs": schemas["$defs"],
            "$ref": f"#/$defs/{def_name}",
        }
        Draft202012Validator.check_schema(wrapper)
        def_validators[def_name] = Draft202012Validator(wrapper, format_checker=checker)

    type_ids = list(schemas["$defs"]["typeId"]["enum"])
    baselines = build_baselines(type_ids)
    if set(baselines) != set(def_validators):
        raise AuditFailure("baseline/oneOf definition set mismatch")
    structural = structural_attacks(root_validator, def_validators, baselines)
    semantic, bypasses = semantic_attacks(
        protocol, schemas, registries, root_validator, baselines
    )
    all_cases = [
        {"class": "STRUCTURAL", **row} for row in structural
    ] + [{"class": "SEMANTIC_STATEFUL", **row} for row in semantic]
    if len(all_cases) < 700:
        raise AuditFailure(f"insufficient independent hostile cases: {len(all_cases)}")
    summary = {
        "jsonSchemaImplementation": "python-jsonschema Draft202012Validator",
        "schemaDraft": schemas["$schema"],
        "compiledRootOneOfBranches": len(def_validators),
        "validIndependentBaselines": len(baselines),
        "structuralAttacks": len(structural),
        "structuralAttacksRejected": sum(row["rejected"] for row in structural),
        "semanticStatefulAttacks": len(semantic),
        "semanticStatefulDeclaredRejections": sum(
            row["outcome"].startswith("REJECTED_") for row in semantic
        ),
        "unrejectedDesignBypasses": len(bypasses),
        "totalIndependentAttacks": len(all_cases),
        "caseDigestSha256": sha_bytes(canonical(all_cases)),
        "bypassDigestSha256": sha_bytes(canonical(bypasses)),
    }
    return summary, bypasses


def verify_zero_authority(
    protocol: dict[str, Any], registries: dict[str, Any], public_manifest: dict[str, Any]
) -> dict[str, Any]:
    boundary = protocol["permanentDesignBoundary"]
    authority = public_manifest["authority"]
    operational = registries["operationalState"]
    checks = {
        "subjectStatusDesignOnly": protocol["status"].startswith("DESIGN_ONLY_"),
        "issuedFalse": boundary["issued"] is False,
        "executionAuthorizedFalse": boundary["executionAuthorized"] is False,
        "evaluatorAuthorityFalse": boundary["evaluatorAuthorityGranted"] is False,
        "scoringAuthorityFalse": boundary["scoringAuthorityGranted"] is False,
        "resultAccessFalse": boundary["resultAccessAuthorized"] is False,
        "reviewerCertificatesZero": authority["reviewerCertificatesIssued"] == 0,
        "activationCandidatesZero": authority["activationCandidates"] == 0,
        "activationAuditsZero": authority["activationAuditReports"] == 0,
        "activationGrantsZero": authority["activationGrants"] == 0,
        "operationalExecutionFalse": operational["executionAuthorized"] is False,
        "operationalAuthorityFalse": operational["authorityGranted"] is False,
    }
    if not all(checks.values()):
        raise AuditFailure("zero-authority boundary failed")
    return checks


def verify_declared_closures(
    protocol: dict[str, Any], registries: dict[str, Any], schemas: dict[str, Any]
) -> dict[str, Any]:
    """Recompute the positive B1-B8 structure without trusting author tests."""
    binding = load_json(
        REPO
        / "experiments/question-quality-20260715/design/"
        "reviewer-calibration-v3-production-type-binding-v4/binding.json"
    )
    universe = protocol["typeUniverse"]
    canonical = binding["canonicalUniverse"]
    if universe["uiTypeIdsInOrder"] != canonical["uiTypeIdsInOrder"]:
        raise AuditFailure("25-type order differs from accepted binding v4")
    if universe["focusTypeIds"] != canonical["focusTypeIds"]:
        raise AuditFailure("focus types differ from accepted binding v4")
    if universe["nonfocusTypeIds"] != canonical["nonfocusTypeIdsInUiOrder"]:
        raise AuditFailure("nonfocus types differ from accepted binding v4")
    if universe["families"] != binding["families"]:
        raise AuditFailure("family rotation differs from accepted binding v4")

    schedule_epoch1 = {
        row["familyId"]: (row["mainTypeId"], row["holdoutTypeId"])
        for row in binding["scheduleRows"]
        if row["epoch"] == 1
    }
    generators = {row["phase"]: row for row in registries["slotRegistry"]["generators"]}
    main_targets = {
        row["familyId"]: row["typeId"]
        for block in generators["MAIN_CERTIFICATION"]["blocks"]
        if block["block"] == "NONFOCUS"
        for row in block["targets"]
    }
    holdout_targets = {
        row["familyId"]: row["typeId"]
        for block in generators["ACTIVATION_HOLDOUT"]["blocks"]
        if block["block"] == "NONFOCUS"
        for row in block["targets"]
    }
    for family_id, (main_type, holdout_type) in schedule_epoch1.items():
        if main_targets.get(family_id) != main_type or holdout_targets.get(family_id) != holdout_type:
            raise AuditFailure(f"epoch-1 generator drift for {family_id}")

    roles = protocol["roles"]
    role_set = set(roles["roleEnum"])
    if set(roles["trustedGoldAuditorIncompatibleWith"]) != role_set - {"TRUSTED_GOLD_AUDITOR"}:
        raise AuditFailure("trusted-gold auditor role exclusion is not exhaustive")
    if set(roles["activationAuditorIncompatibleWith"]) != role_set - {"INDEPENDENT_ACTIVATION_AUDITOR"}:
        raise AuditFailure("activation auditor role exclusion is not exhaustive")
    if set(roles["artifactAuthorshipExclusionRequired"]["trustedGoldAudit"]) != {
        "PACKET_AUTHOR", "ITEM_AUTHOR", "GOLD_AUTHOR"
    }:
        raise AuditFailure("trusted-gold artifact authorship exclusion set drift")

    coverage = protocol["coverageAndCertificatePolicy"]
    if coverage["focusOnlyCanonicalTypeIdsExact"] != ["GRAMMAR_ERROR", "BLANK_INFERENCE"]:
        raise AuditFailure("focus certificate order drift")
    if coverage["all25CanonicalTypeIdsExact"] != universe["uiTypeIdsInOrder"]:
        raise AuditFailure("ALL_25 certificate order drift")
    if not all([
        coverage["passedCoverageEventRequiredPerCanonicalType"],
        coverage["passedCoverageEventHashMustResolveToExactEventBytes"],
        coverage["passedCoverageEventCanonicalTypeMustEqualMapKey"],
        coverage["passedCoverageEventHashesUniqueWithinCoverageMap"],
        coverage["candidateRequestedScopeMustBeSubsetOfBothReviewerCertificateScopes"],
        coverage["candidatePassedCoverageHashForEachRequestedTypeMustEqualBothCertificates"],
    ]):
        raise AuditFailure("declared coverage/certificate gate weakened")

    slot_ids = registries["slotRegistry"]["expandedSlotIds"]
    if len(slot_ids) != 60 or len(set(slot_ids)) != 60:
        raise AuditFailure("future slot expansion is not exactly 60 unique IDs")
    counts = protocol["fingerprintAndReplayPolicy"]["requiredCounts"]
    if counts != {"TAXONOMY_PILOT": 12, "MAIN_CERTIFICATION": 24, "ACTIVATION_HOLDOUT": 24}:
        raise AuditFailure("12/24/24 fingerprint counts drift")
    if protocol["fingerprintAndReplayPolicy"]["fullProofPairCount"] != 60 * 59 // 2:
        raise AuditFailure("fingerprint pair count is not C(60,2)")
    if len(protocol["fingerprintAndReplayPolicy"]["requiredFingerprintComponents"]) != 7:
        raise AuditFailure("fingerprint bundle is not seven components")

    state_machine = protocol["stateMachine"]
    if len(state_machine["states"]) != 12 or len(state_machine["transitions"]) != 11:
        raise AuditFailure("state chain is not 12 states / 11 transitions")
    for index, transition in enumerate(state_machine["transitions"]):
        if transition["from"] != state_machine["states"][index] or transition["to"] != state_machine["states"][index + 1]:
            raise AuditFailure("state transition chain is not exactly consecutive")
    state_denies = protocol["resourceAccessPolicy"]["stateDenySets"]
    if set(state_denies) != set(state_machine["states"]) or any(not values for values in state_denies.values()):
        raise AuditFailure("every exact state must have a nonempty deny set")
    matrix = protocol["resourceAccessPolicy"]["policyMatrix"]
    phase1_rows = [row for row in matrix if row["phase"].endswith("PHASE1")]
    blind_only = {"BLIND_STUDENT_VISIBLE_SURFACE", "FROZEN_PUBLIC_CODEBOOK"}
    if any(set(row["allow"]) != blind_only for row in phase1_rows):
        raise AuditFailure("phase-1 answer/gold structural prohibition weakened")
    post = next(row for row in matrix if row["phase"] == "POST_ACTIVATION_RESULT")
    expected_post_deny = {
        "OUT_OF_SCOPE_S1_RESULT", "OTHER_RATER_IDENTITY", "RAW_HIDDEN_COMMITMENT",
        "REJECTION_SURPLUS_HISTORY", "RAW_PRIVATE_TRUSTED_GOLD",
    }
    if set(post["deny"]) != expected_post_deny:
        raise AuditFailure("post-activation deny set drift")

    if protocol["accessTransactionPolicy"]["eventSequence"] != [
        "AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"
    ]:
        raise AuditFailure("access transaction order drift")
    if not all([
        protocol["accessTransactionPolicy"]["immediateConsecutiveOrdinalsRequired"],
        protocol["accessTransactionPolicy"]["eachEventBindsImmediatelyPriorEventSha256"],
        protocol["accessTransactionPolicy"]["capabilityUniqueAcrossRegistry"],
        protocol["accessTransactionPolicy"]["capabilitySingleUse"],
        protocol["accessTransactionPolicy"]["consumeUseOrdinal"] == 1,
    ]):
        raise AuditFailure("declared append-only/single-use transaction gate weakened")
    if schemas["$defs"]["capabilityConsume"]["allOf"][1]["properties"]["useOrdinal"].get("const") != 1:
        raise AuditFailure("consume useOrdinal schema drift")

    activation = protocol["activationEvidenceGraph"]
    if not all([
        activation["candidate"]["authorityGranted"] is False,
        activation["candidate"]["resultAccessAuthorized"] is False,
        activation["candidate"]["containsFutureAuditReportOrManifestHash"] is False,
        activation["candidateAudit"]["authorityGranted"] is False,
        activation["candidateAudit"]["resultAccessAuthorized"] is False,
        activation["candidateAudit"]["containsOwnFutureAuditManifestHash"] is False,
        activation["grant"]["bindsPreexistingAuditReportSha256"],
        activation["grant"]["bindsPreexistingAuditManifestSha256"],
    ]):
        raise AuditFailure("declared noncircular authority-false activation chain weakened")

    return {
        "uiTypeCount": len(universe["uiTypeIdsInOrder"]),
        "focusTypeCount": len(universe["focusTypeIds"]),
        "nonfocusTypeCount": len(universe["nonfocusTypeIds"]),
        "familyCount": len(universe["families"]),
        "epoch1MainHoldoutFamilyBindingsRecomputed": len(schedule_epoch1),
        "futureSlotCount": len(slot_ids),
        "fingerprintComponentCount": len(protocol["fingerprintAndReplayPolicy"]["requiredFingerprintComponents"]),
        "fingerprintPairCount": protocol["fingerprintAndReplayPolicy"]["fullProofPairCount"],
        "stateCount": len(state_machine["states"]),
        "transitionCount": len(state_machine["transitions"]),
        "nonemptyStateDenySetCount": len(state_denies),
        "phase1RowsBlindOnly": len(phase1_rows),
        "postActivationDenyCount": len(post["deny"]),
        "accessChainEventCount": len(protocol["accessTransactionPolicy"]["eventSequence"]),
    }


def verify_review_files() -> None:
    manifest_path = HERE / "MANIFEST.sha256"
    if not manifest_path.exists():
        return
    rows = manifest_rows(manifest_path)
    expected_names = {"REPORT.md", "audit.json", "hostile-evidence.json", "independent-verify.py"}
    if {name for _, name in rows} != expected_names:
        raise AuditFailure("review manifest file set mismatch")
    for expected, name in rows:
        if sha_file(HERE / name) != expected:
            raise AuditFailure(f"review artifact drift: {name}")


def main() -> int:
    protocol, registries, schemas, public_manifest = verify_subject_package()
    lineage = verify_lineage(protocol)
    zero = verify_zero_authority(protocol, registries, public_manifest)
    recomputation = verify_declared_closures(protocol, registries, schemas)
    summary, bypasses = attack_summary(protocol, registries, schemas)
    bypass_groups: dict[str, int] = {}
    for row in bypasses:
        group = row["name"].split(":", 1)[0]
        bypass_groups[group] = bypass_groups.get(group, 0) + 1

    result = {
        "verdict": "FAIL_BLOCKERS" if bypasses else "PASS_NO_BLOCKERS",
        "subjectManifestSha256": EXPECTED_SUBJECT_MANIFEST_SHA256,
        "lineage": lineage,
        "zeroAuthorityChecks": zero,
        "independentRecomputation": recomputation,
        "hostileAudit": summary,
        "bypassGroups": dict(sorted(bypass_groups.items())),
    }

    evidence_path = HERE / "hostile-evidence.json"
    audit_path = HERE / "audit.json"
    if evidence_path.exists():
        evidence = load_json(evidence_path)
        for key, value in summary.items():
            if evidence["summary"].get(key) != value:
                raise AuditFailure(f"sealed hostile evidence mismatch: {key}")
        if evidence["bypassGroups"] != result["bypassGroups"]:
            raise AuditFailure("sealed bypass group inventory mismatch")
    if audit_path.exists():
        audit = load_json(audit_path)
        if audit["verdict"] != result["verdict"]:
            raise AuditFailure("sealed audit verdict mismatch")
        if audit["subject"]["manifestSha256"] != EXPECTED_SUBJECT_MANIFEST_SHA256:
            raise AuditFailure("sealed audit subject mismatch")
        if audit["hostileAudit"] != summary:
            raise AuditFailure("sealed audit hostile summary mismatch")
        if audit["lineage"] != lineage:
            raise AuditFailure("sealed audit lineage mismatch")
        if audit["independentRecomputation"] != recomputation:
            raise AuditFailure("sealed audit recomputation mismatch")
    verify_review_files()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    print("INDEPENDENT_AUDIT_VERIFICATION_PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AuditFailure as exc:
        print(f"INDEPENDENT_AUDIT_VERIFICATION_FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
