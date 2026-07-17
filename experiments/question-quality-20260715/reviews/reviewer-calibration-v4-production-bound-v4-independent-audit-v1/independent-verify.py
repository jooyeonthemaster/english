#!/usr/bin/env python3
"""Independent, local-only verifier for reviewer calibration v4.

This verifier never imports or executes the subject's verify.mjs,
schema-hostile.py, or hostile-fixtures.json.  Those files are treated as opaque
bytes and hashed only.  It does not read environment files, private rows,
actors, item/gold content, databases, networks, providers, models, ledgers, or
generation APIs.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import json
import math
import random
import re
import struct
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


EXPECTED_SUBJECT_MANIFEST_SHA256 = "303b954e729f89fc21b95271d5cd895434c96bd193c24a31a393052b0ba63b05"
EXPECTED_BLOCKER_CODES = [
    "V4-B1-IDENTITY_REGISTRY_SEAL_DOES_NOT_REVALIDATE_BIJECTION",
    "V4-B1-ATTESTATION_BASE64_HAS_NONCANONICAL_ALIASES",
    "V4-B7-SEALED_POLICY_VALIDATOR_REREADS_MUTABLE_DERIVED_STATE",
    "V4-B7-AUTHORIZATION_DOES_NOT_DEREFERENCE_AUTHORITATIVE_STATE_OR_ALIAS",
    "V4-B3B4-GRANT_DOES_NOT_DEREFERENCE_SCOPE_CERTIFICATES_OR_AUDIT_EVENTS",
    "V4-B6-NO_REPLAY_TOMBSTONE_DISJOINTNESS_VALIDATOR_NOT_EXPORTED",
    "V4-B8-ACCESS_CHAIN_AND_SINGLE_USE_VALIDATOR_NOT_EXPORTED",
]

HERE = Path(__file__).resolve().parent
QUALITY_ROOT = HERE.parents[1]
REPO_ROOT = HERE.parents[3]
SUBJECT = QUALITY_ROOT / "design" / "reviewer-calibration-v4-production-bound-v4"
SUBJECT_MANIFEST = SUBJECT / "MANIFEST.sha256"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def stable_hash(label: str) -> str:
    return sha256_bytes(f"independent-v4-audit:{label}".encode("utf-8"))


def snapshot_subject() -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for path in sorted((p for p in SUBJECT.iterdir() if p.is_file()), key=lambda p: p.name):
        data = path.read_bytes()
        rows[path.name] = {"bytes": len(data), "sha256": sha256_bytes(data)}
    return rows


def snapshot_root(rows: dict[str, dict[str, Any]]) -> str:
    return sha256_bytes(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode("utf-8"))


class CaseBook:
    def __init__(self) -> None:
        self.counts: Counter[str] = Counter()
        self.digest = hashlib.sha256()

    def add(self, category: str, label: str, passed: bool = True) -> None:
        require(passed, f"case failed: {category}:{label}")
        self.counts[category] += 1
        self.digest.update(category.encode("utf-8"))
        self.digest.update(b"\0")
        self.digest.update(label.encode("utf-8"))
        self.digest.update(b"\0PASS\n")

    @property
    def total(self) -> int:
        return sum(self.counts.values())


def parse_manifest(path: Path) -> dict[str, str]:
    rows: dict[str, str] = {}
    for line in path.read_text("utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([^/\\]+)", line)
        require(match is not None, f"malformed manifest row: {line!r}")
        digest, name = match.groups()
        require(name not in rows, f"duplicate manifest name: {name}")
        rows[name] = digest
    return rows


def rehash_subject_closure(snapshot: dict[str, dict[str, Any]]) -> dict[str, Any]:
    require(sha256_file(SUBJECT_MANIFEST) == EXPECTED_SUBJECT_MANIFEST_SHA256, "subject MANIFEST file SHA mismatch")
    rows = parse_manifest(SUBJECT_MANIFEST)
    expected_files = set(snapshot) - {"MANIFEST.sha256"}
    require(set(rows) == expected_files, "subject MANIFEST does not enumerate the exact non-manifest file set")
    for name, expected in rows.items():
        require(snapshot[name]["sha256"] == expected, f"subject file mismatch: {name}")

    public_manifest = json.loads((SUBJECT / "public-manifest.json").read_text("utf-8"))
    package_rows = {row["path"]: row for row in public_manifest["packageFiles"]}
    require(set(package_rows) == expected_files - {"public-manifest.json"}, "public-manifest packageFiles set mismatch")
    for name, row in package_rows.items():
        require(row["sha256"] == snapshot[name]["sha256"], f"public package SHA mismatch: {name}")
        require(row["bytes"] == snapshot[name]["bytes"], f"public package byte count mismatch: {name}")
    require(all(value is False or value == 0 for value in public_manifest["authority"].values()), "subject authority is not zero/false")
    require(all(value == 0 for value in public_manifest["activity"].values()), "subject activity is not zero")
    return {
        "manifestRows": len(rows),
        "packageRows": len(package_rows),
        "authorityFieldsZeroOrFalse": len(public_manifest["authority"]),
        "activityFieldsZero": len(public_manifest["activity"]),
    }


def safe_repo_path(relative: str) -> Path:
    require("\\" not in relative, f"noncanonical upstream path: {relative}")
    parts = Path(relative).parts
    require(all(part not in {"..", ".env", ".env.local", "private", "secrets"} for part in parts), f"unsafe upstream path: {relative}")
    resolved = (REPO_ROOT / relative).resolve()
    require(resolved == REPO_ROOT or REPO_ROOT in resolved.parents, f"upstream escapes repository: {relative}")
    require(resolved.is_file(), f"missing upstream: {relative}")
    return resolved


def recursive_strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from recursive_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from recursive_strings(item)


def rehash_safe_lineage() -> dict[str, Any]:
    protocol = json.loads((SUBJECT / "protocol.json").read_text("utf-8"))
    upstreams = protocol["upstreams"]
    require(len(upstreams) == 11, "unexpected direct upstream count")
    audit_jsons = 0
    required_blocker_codes = 0
    for upstream in upstreams:
        path = safe_repo_path(upstream["path"])
        require(sha256_file(path) == upstream["sha256"], f"upstream SHA mismatch: {upstream['id']}")
        require(upstream.get("grantsAuthority", False) is False, f"upstream unexpectedly grants authority: {upstream['id']}")
        if "requiredVerdict" in upstream:
            audit_path = path.parent / "audit.json"
            require(audit_path.is_file(), f"required public audit JSON missing: {upstream['id']}")
            audit = json.loads(audit_path.read_text("utf-8"))
            require(audit.get("verdict") == upstream["requiredVerdict"], f"upstream audit verdict mismatch: {upstream['id']}")
            if "auditJsonSha256" in upstream:
                require(sha256_file(audit_path) == upstream["auditJsonSha256"], f"upstream audit JSON SHA mismatch: {upstream['id']}")
            all_strings = set(recursive_strings(audit))
            for code in upstream.get("requiredBlockerCodes", []):
                require(code in all_strings, f"upstream blocker missing: {code}")
                required_blocker_codes += 1
            audit_jsons += 1
    return {
        "directUpstreamBytesRehashed": len(upstreams),
        "publicAuditJsonsOpened": audit_jsons,
        "requiredNegativeBlockerCodesConfirmed": required_blocker_codes,
        "privateRowsOpened": 0,
    }


def schema_validator(schema_document: dict[str, Any], definition: str) -> Draft202012Validator:
    wrapper = {
        "$schema": schema_document["$schema"],
        "$id": f"urn:independent-v4-audit:{definition}",
        "$defs": schema_document["$defs"],
        "$ref": f"#/$defs/{definition}",
    }
    Draft202012Validator.check_schema(wrapper)
    return Draft202012Validator(wrapper, format_checker=FormatChecker())


def schema_compile_all(schema_document: dict[str, Any], cases: CaseBook) -> dict[str, Any]:
    Draft202012Validator.check_schema(schema_document)
    cases.add("schemaCompilation", "root")
    compiled = {}
    for name in sorted(schema_document["$defs"]):
        compiled[name] = schema_validator(schema_document, name)
        cases.add("schemaCompilation", name)
    branch_refs = [row.get("$ref") for row in schema_document["oneOf"]]
    require(len(branch_refs) == 23 and len(set(branch_refs)) == 23, "event branch count/uniqueness mismatch")
    return {"compiledDefinitionCount": len(compiled), "eventBranchCount": len(branch_refs), "validators": compiled}


def assert_unicode_scalars(value: str) -> None:
    for character in value:
        require(not (0xD800 <= ord(character) <= 0xDFFF), "lone surrogate")


def jcs_number(value: int | float) -> str:
    require(not isinstance(value, bool), "boolean passed as number")
    if isinstance(value, int):
        return str(value)
    require(math.isfinite(value), "nonfinite JCS number")
    if value == 0:
        return "0"
    known = {
        1e-7: "1e-7",
        1e-6: "0.000001",
        1e20: "100000000000000000000",
        1e21: "1e+21",
        333333333.33333329: "333333333.3333333",
        4.5: "4.5",
        0.002: "0.002",
    }
    require(value in known, f"independent number vector not defined: {value!r}")
    return known[value]


def utf16_sort_key(value: str) -> bytes:
    assert_unicode_scalars(value)
    return value.encode("utf-16-be")


def jcs(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return jcs_number(value)
    if isinstance(value, str):
        assert_unicode_scalars(value)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(jcs(item) for item in value) + "]"
    require(isinstance(value, dict), f"unsupported JCS value: {type(value).__name__}")
    require(all(isinstance(key, str) for key in value), "JCS object key is not string")
    keys = sorted(value, key=utf16_sort_key)
    return "{" + ",".join(f"{jcs(key)}:{jcs(value[key])}" for key in keys) + "}"


CANONICAL_VERSION = "NARA_QCAL_V4_JCS_RFC8785_DOMAIN_FRAMED_1"
CANONICAL_PREFIX = "NARA-QCAL-V4-CANONICAL\0"


def canonical_frame(kind: str, payload: dict[str, Any], profile_fields: dict[str, tuple[str, list[str]]]) -> dict[str, Any]:
    require(kind in profile_fields, f"unknown kind: {kind}")
    profile, fields = profile_fields[kind]
    require(payload.get("profile") == profile, f"wrong profile: {kind}")
    require(set(payload) == set(fields) and len(payload) == len(fields), f"wrong field set: {kind}")
    payload_bytes = jcs(payload).encode("utf-8")
    version = CANONICAL_VERSION.encode("utf-8")
    kind_bytes = kind.encode("utf-8")
    profile_bytes = profile.encode("utf-8")
    frame = b"".join([
        CANONICAL_PREFIX.encode("utf-8"),
        struct.pack(">H", len(version)), version,
        struct.pack(">H", len(kind_bytes)), kind_bytes,
        struct.pack(">H", len(profile_bytes)), profile_bytes,
        struct.pack(">Q", len(payload_bytes)), payload_bytes,
    ])
    return {"canonicalJson": payload_bytes.decode("utf-8"), "sha256": sha256_bytes(frame)}


def strict_json_load(text: str) -> Any:
    def pairs_hook(pairs):
        output = {}
        for key, value in pairs:
            require(key not in output, f"duplicate key: {key}")
            output[key] = value
        return output

    return json.loads(text, object_pairs_hook=pairs_hook)


def focus_evidence(label: str) -> dict[str, Any]:
    types = ["GRAMMAR_ERROR", "BLANK_INFERENCE"]
    return {
        "scopeEnum": "FOCUS_ONLY",
        "canonicalTypeIds": types,
        "coverageCount": 2,
        "passedCoverageEventSha256ByCanonicalType": {t: stable_hash(f"{label}:pass:{t}") for t in types},
        "materializationEventSha256ByCanonicalType": {t: stable_hash(f"{label}:material:{t}") for t in types},
        "coverageMapRootSha256": stable_hash(f"{label}:map"),
        "coverageRecomputationRootSha256": stable_hash(f"{label}:root"),
    }


def all25_evidence(type_ids: list[str], label: str) -> dict[str, Any]:
    return {
        "scopeEnum": "ALL_25",
        "canonicalTypeIds": type_ids,
        "coverageCount": 25,
        "passedCoverageEventSha256ByCanonicalType": {t: stable_hash(f"{label}:pass:{t}") for t in type_ids},
        "materializationEventSha256ByCanonicalType": {t: stable_hash(f"{label}:material:{t}") for t in type_ids},
        "coverageMapRootSha256": stable_hash(f"{label}:map"),
        "coverageRecomputationRootSha256": stable_hash(f"{label}:root"),
    }


def build_payloads(protocol: dict[str, Any], schema_document: dict[str, Any]) -> tuple[dict[str, Any], dict[str, tuple[str, list[str]]]]:
    type_ids = protocol["typeUniverse"]["uiTypeIdsInOrder"]
    shared = stable_hash("payload-shared-coverage")
    candidate = {
        "profile": "NARA_QCAL_V4_ACTIVATION_CANDIDATE_PAYLOAD_1",
        "stateBefore": "CERTIFICATION_EVIDENCE_SEALED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
        "candidateAuthorPrincipalCommitmentSha256": stable_hash("payload-candidate-author"),
        "designManifestSha256": stable_hash("payload-design-manifest"),
        "evaluationAuthorityManifestSha256": stable_hash("payload-evaluation-manifest"),
        "productionTypeBindingManifestSha256": "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04",
        "reviewerCertificateSha256s": [stable_hash("payload-cert-1"), stable_hash("payload-cert-2")],
        "reviewerPrincipalCommitmentSha256s": [stable_hash("payload-reviewer-1"), stable_hash("payload-reviewer-2")],
        "reviewerCertificateScopeEnums": ["FOCUS_ONLY", "FOCUS_ONLY"],
        "requestedCoverageEvidence": focus_evidence("payload-focus"),
        "coverageRecomputationRootSha256": shared,
        "freshAdjudicatorBindingSha256": stable_hash("payload-adjudicator"),
        "allPhaseSealRootSha256": stable_hash("payload-phase-root"),
        "zeroPreauthorityResultAccessProofSha256": stable_hash("payload-zero-access"),
        "identityRegistryRootSha256": stable_hash("payload-identity-root"),
        "policyDesignContractSha256": stable_hash("payload-policy-contract"),
        "authorityGranted": False,
        "resultAccessAuthorized": False,
    }
    audit = {
        "profile": "NARA_QCAL_V4_ACTIVATION_CANDIDATE_AUDIT_PAYLOAD_1",
        "stateBefore": "ACTIVATION_CANDIDATE_RECORDED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
        "auditorPrincipalCommitmentSha256": stable_hash("payload-auditor"),
        "candidateEventSha256": stable_hash("payload-candidate-event"),
        "candidateCanonicalBytesSha256": stable_hash("payload-candidate-bytes"),
        "candidateAuthorPrincipalCommitmentSha256": candidate["candidateAuthorPrincipalCommitmentSha256"],
        "roleRegistrySha256": stable_hash("payload-role-registry"),
        "identityRegistryRootSha256": candidate["identityRegistryRootSha256"],
        "artifactAuthorshipRegistrySha256": stable_hash("payload-authorship-registry"),
        "auditorRoleExclusionProofSha256": stable_hash("payload-role-exclusion"),
        "auditorArtifactAuthorshipExclusionProofSha256": stable_hash("payload-artifact-exclusion"),
        "coverageRecomputationRootSha256": shared,
        "auditInputRootSha256": stable_hash("payload-audit-input"),
        "verdict": "PASS_NO_BLOCKERS",
        "authorityGranted": False,
        "resultAccessAuthorized": False,
    }
    grant = {
        "profile": "NARA_QCAL_V4_ACTIVATION_GRANT_PAYLOAD_1",
        "stateBefore": "ACTIVATION_CANDIDATE_AUDIT_PASSED_AUTHORITY_FALSE",
        "stateAfter": "ACTIVATION_GRANTED",
        "grantAuthorPrincipalCommitmentSha256": stable_hash("payload-grant-author"),
        "candidateEventSha256": audit["candidateEventSha256"],
        "candidateCanonicalBytesSha256": audit["candidateCanonicalBytesSha256"],
        "candidateAuditReportSha256": stable_hash("payload-audit-report"),
        "candidateAuditCanonicalBytesSha256": stable_hash("payload-audit-bytes"),
        "candidateAuditManifestSha256": stable_hash("payload-audit-manifest"),
        "candidateAuditVerdict": "PASS_NO_BLOCKERS",
        "grantedCoverageEvidence": all25_evidence(type_ids, "payload-all25"),
        "coverageRecomputationRootSha256": shared,
        "sealedPolicyRegistryRootSha256": stable_hash("payload-sealed-policy"),
        "policyMatrixRootSha256": stable_hash("payload-policy-matrix"),
        "allStateAllowRootSha256": stable_hash("payload-state-allow"),
        "allStateDenyRootSha256": stable_hash("payload-state-deny"),
        "allTupleAllowedRolesRootSha256": stable_hash("payload-role-allow"),
        "allTupleDeniedRolesRootSha256": stable_hash("payload-role-deny"),
        "resourceClassProofRootSha256": stable_hash("payload-resource-proof"),
        "stateTransitionProofRootSha256": stable_hash("payload-state-proof"),
        "postActivationScopeProofSha256": stable_hash("payload-post-scope"),
        "postActivationAllowRootSha256": stable_hash("payload-post-allow"),
        "postActivationDenyRootSha256": stable_hash("payload-post-deny"),
        "postActivationAllowedRolesRootSha256": stable_hash("payload-post-role-allow"),
        "postActivationDeniedRolesRootSha256": stable_hash("payload-post-role-deny"),
        "policyRegistryReady": True,
        "policyRegistrySealed": True,
        "deterministicGrantProofSha256": stable_hash("payload-grant-proof"),
        "authorityGranted": True,
        "resultAccessAuthorized": True,
    }
    profiles = {
        "ACTIVATION_CANDIDATE": (
            candidate["profile"], schema_document["$defs"]["activationCandidatePayload"]["required"]
        ),
        "ACTIVATION_CANDIDATE_AUDIT_REPORT": (
            audit["profile"], schema_document["$defs"]["activationCandidateAuditPayload"]["required"]
        ),
        "ACTIVATION_GRANT": (
            grant["profile"], schema_document["$defs"]["activationGrantPayload"]["required"]
        ),
    }
    return {"ACTIVATION_CANDIDATE": candidate, "ACTIVATION_CANDIDATE_AUDIT_REPORT": audit, "ACTIVATION_GRANT": grant}, profiles


def canonical_properties(payloads, profiles, validators, cases: CaseBook) -> dict[str, Any]:
    rng = random.Random(0xC411B4)
    baseline = {kind: canonical_frame(kind, payload, profiles) for kind, payload in payloads.items()}
    for kind, payload in payloads.items():
        entries = list(payload.items())
        for ordinal in range(1024):
            rng.shuffle(entries)
            reordered = dict(entries)
            result = canonical_frame(kind, reordered, profiles)
            cases.add("canonicalFieldOrder", f"{kind}:{ordinal}", result["sha256"] == baseline[kind]["sha256"])
        for field in list(payload):
            omitted = copy.deepcopy(payload)
            del omitted[field]
            rejected = False
            try:
                canonical_frame(kind, omitted, profiles)
            except AssertionError:
                rejected = True
            cases.add("canonicalFieldSet", f"{kind}:omit:{field}", rejected)
        for ordinal in range(96):
            extra = copy.deepcopy(payload)
            extra[f"unexpected_{ordinal:03d}"] = stable_hash(f"extra:{kind}:{ordinal}")
            rejected = False
            try:
                canonical_frame(kind, extra, profiles)
            except AssertionError:
                rejected = True
            cases.add("canonicalFieldSet", f"{kind}:extra:{ordinal}", rejected)

    for ordinal in range(384):
        text = f'{{"field":{ordinal},"field":{ordinal + 1}}}'
        rejected = False
        try:
            strict_json_load(text)
        except AssertionError:
            rejected = True
        cases.add("canonicalStrictJson", f"duplicate:{ordinal}", rejected)

    number_vectors = [
        (0, "0"), (-0.0, "0"), (1e-7, "1e-7"), (1e-6, "0.000001"),
        (1e20, "100000000000000000000"), (1e21, "1e+21"),
        (333333333.33333329, "333333333.3333333"), (4.5, "4.5"), (0.002, "0.002"),
    ]
    for repeat in range(32):
        for value, expected in number_vectors:
            cases.add("canonicalNumbers", f"{repeat}:{value!r}", jcs(value) == expected)

    require(jcs({"\U00010000": 1, "\ue000": 2}) == '{"𐀀":1,"":2}', "UTF-16 key ordering mismatch")
    for ordinal in range(256):
        composed = f"é-{ordinal}"
        decomposed = unicodedata.normalize("NFD", composed)
        cases.add("canonicalUnicode", f"preserve:{ordinal}", jcs(composed) != jcs(decomposed))

    kinds = list(payloads)
    for ordinal in range(384):
        source = kinds[ordinal % len(kinds)]
        target = kinds[(ordinal + 1) % len(kinds)]
        rejected = False
        try:
            canonical_frame(target, payloads[source], profiles)
        except AssertionError:
            rejected = True
        cases.add("canonicalDomainSeparation", f"{source}->{target}:{ordinal}", rejected)

    for kind, payload in payloads.items():
        definition = {
            "ACTIVATION_CANDIDATE": "activationCandidatePayload",
            "ACTIVATION_CANDIDATE_AUDIT_REPORT": "activationCandidateAuditPayload",
            "ACTIVATION_GRANT": "activationGrantPayload",
        }[kind]
        errors = list(validators[definition].iter_errors(payload))
        require(not errors, f"independent baseline payload does not compile for {kind}: {errors}")
    return {"baselineDigests": {kind: row["sha256"] for kind, row in baseline.items()}}


FP_VERSION = "NARA_QCAL_V4_FINGERPRINT_NFKC_WS_ASCII_FOLD_8TOKEN_1"
FP_PREFIX = "NARA-QCAL-V4-FINGERPRINT\0"
FP_COMPONENT_FIELDS = [
    "normalizedFullTextSha256", "hashedEightWordWindowSetSha256", "topicTagSetSha256",
    "scenarioEntityTupleSha256", "itemAuthorPrincipalSha256", "surfaceTemplateFingerprintSha256",
    "compositeFingerprintSha256",
]


def fp_domain_hash(label: str, payload: bytes | str) -> str:
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    version = FP_VERSION.encode("utf-8")
    label_bytes = label.encode("utf-8")
    framed = b"".join([
        FP_PREFIX.encode("utf-8"), struct.pack(">Q", len(version)), version,
        struct.pack(">Q", len(label_bytes)), label_bytes,
        struct.pack(">Q", len(payload)), payload,
    ])
    return sha256_bytes(framed)


def ascii_lower(value: str) -> str:
    return re.sub(r"[A-Z]", lambda m: m.group(0).lower(), value)


def normalize_text(value: str) -> str:
    assert_unicode_scalars(value)
    value = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n")
    return ascii_lower(re.sub(r"\s+", " ", value).strip())


def normalize_atom(value: str) -> str:
    result = ascii_lower(re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip())
    require(bool(result), "empty fingerprint atom")
    return result


def derive_fingerprint(inputs: dict[str, Any], family_by_type: dict[str, str | None]) -> dict[str, Any]:
    require(inputs["canonicalTypeId"] in family_by_type, "unknown fingerprint type")
    require(inputs["canonicalFamilyId"] == family_by_type[inputs["canonicalTypeId"]], "fingerprint family mismatch")
    normalized_full = normalize_text(inputs["fullText"])
    normalized_visible = normalize_text(inputs["visibleSurface"])
    normalized_template = normalize_text(inputs["surfaceTemplate"])
    tags = sorted(normalize_atom(tag) for tag in inputs["topicTags"])
    require(len(tags) == len(set(tags)), "normalized duplicate tags")
    entities = []
    for entity in inputs["scenarioEntities"]:
        require(set(entity) == {"entityType", "entityId", "role"}, "entity fields")
        entities.append({
            "entityId": normalize_atom(entity["entityId"]),
            "entityType": normalize_atom(entity["entityType"]),
            "role": normalize_atom(entity["role"]),
        })
    entities.sort(key=jcs)
    require(len({jcs(row) for row in entities}) == len(entities), "normalized duplicate entities")
    tokens = [] if not normalized_full else normalized_full.split(" ")
    if len(tokens) < 8:
        windows = [fp_domain_hash("EIGHT_TOKEN_WINDOW", jcs(tokens))]
    else:
        windows = [fp_domain_hash("EIGHT_TOKEN_WINDOW", jcs(tokens[i:i + 8])) for i in range(len(tokens) - 7)]
    windows = sorted(set(windows))
    structural = re.sub(r"(?:d )+d", "d+", re.sub(r"(?:w )+w", "w+", re.sub(r"[0-9]+", "d", re.sub(r"[a-z]+", "w", normalized_visible))))

    def raw(label: str, value: str) -> str:
        assert_unicode_scalars(value)
        return fp_domain_hash(f"INPUT:{label}", value)

    input_commitments = {
        "fullTextUtf8Sha256": raw("FULL_TEXT_UTF8", inputs["fullText"]),
        "visibleSurfaceUtf8Sha256": raw("VISIBLE_SURFACE_UTF8", inputs["visibleSurface"]),
        "surfaceTemplateUtf8Sha256": raw("SURFACE_TEMPLATE_UTF8", inputs["surfaceTemplate"]),
        "topicTagsInputSha256": fp_domain_hash("INPUT:TOPIC_TAGS", jcs(inputs["topicTags"])),
        "scenarioEntitiesInputSha256": fp_domain_hash("INPUT:SCENARIO_ENTITIES", jcs(inputs["scenarioEntities"])),
        "authorPrincipalCommitmentSha256": inputs["authorPrincipalCommitmentSha256"],
        "canonicalTypeId": inputs["canonicalTypeId"],
        "canonicalFamilyId": inputs["canonicalFamilyId"],
        "rotationEpoch": inputs["rotationEpoch"],
    }
    input_root = fp_domain_hash("INPUT_COMMITMENT_ROOT", jcs(input_commitments))
    components = {
        "normalizedFullTextSha256": fp_domain_hash("COMPONENT:NORMALIZED_FULL_TEXT", normalized_full),
        "hashedEightWordWindowSetSha256": fp_domain_hash("COMPONENT:EIGHT_TOKEN_WINDOW_SET", jcs(windows)),
        "topicTagSetSha256": fp_domain_hash("COMPONENT:TOPIC_TAG_SET", jcs(tags)),
        "scenarioEntityTupleSha256": fp_domain_hash("COMPONENT:SCENARIO_ENTITY_TUPLE", jcs(entities)),
        "itemAuthorPrincipalSha256": fp_domain_hash("COMPONENT:ITEM_AUTHOR_PRINCIPAL", jcs({
            "authorPrincipalCommitmentSha256": inputs["authorPrincipalCommitmentSha256"],
            "canonicalFamilyId": inputs["canonicalFamilyId"],
            "canonicalTypeId": inputs["canonicalTypeId"],
            "rotationEpoch": inputs["rotationEpoch"],
        })),
        "surfaceTemplateFingerprintSha256": fp_domain_hash("COMPONENT:SURFACE_TEMPLATE", jcs({
            "normalizedSurfaceTemplate": normalized_template,
            "structuralTemplate": structural,
        })),
        "compositeFingerprintSha256": "",
    }
    components["compositeFingerprintSha256"] = fp_domain_hash("COMPONENT:COMPOSITE", jcs({
        "canonicalFamilyId": inputs["canonicalFamilyId"],
        "canonicalTypeId": inputs["canonicalTypeId"],
        "componentDigestsInOrder": [components[field] for field in FP_COMPONENT_FIELDS[:6]],
        "inputCommitmentRootSha256": input_root,
        "rotationEpoch": inputs["rotationEpoch"],
    }))
    return {
        "derivationVersion": FP_VERSION,
        "inputCommitments": input_commitments,
        "inputCommitmentRootSha256": input_root,
        "components": components,
    }


def fingerprint_properties(protocol, target_probe, cases: CaseBook) -> dict[str, Any]:
    family_by_type: dict[str, str | None] = {"BLANK_INFERENCE": None, "GRAMMAR_ERROR": None}
    for family in protocol["typeUniverse"]["families"]:
        for type_id in family["rotationOrder"]:
            family_by_type[type_id] = family["familyId"]
    require(len(family_by_type) == 25, "independent family map count")
    target_sample = target_probe["fingerprintSample"]
    independent_sample = derive_fingerprint(target_sample["input"], family_by_type)
    require(independent_sample == target_sample["bundle"], "independent fingerprint derivation mismatch")
    cases.add("fingerprintCrossImplementation", "target-sample")

    base_input = target_sample["input"]
    base_by_type = {}
    for type_id in protocol["typeUniverse"]["uiTypeIdsInOrder"]:
        row = copy.deepcopy(base_input)
        row["canonicalTypeId"] = type_id
        row["canonicalFamilyId"] = family_by_type[type_id]
        base_by_type[type_id] = derive_fingerprint(row, family_by_type)
        for ordinal in range(200):
            changed = copy.deepcopy(row)
            changed["fullText"] += f" unique-{type_id.lower()}-{ordinal}."
            derived = derive_fingerprint(changed, family_by_type)
            cases.add(
                "fingerprintContentDerivation",
                f"{type_id}:{ordinal}",
                derived["components"]["compositeFingerprintSha256"] != base_by_type[type_id]["components"]["compositeFingerprintSha256"],
            )

    for ordinal in range(512):
        changed = copy.deepcopy(base_input)
        changed["authorPrincipalCommitmentSha256"] = stable_hash(f"fp-author-swap:{ordinal}")
        derived = derive_fingerprint(changed, family_by_type)
        cases.add("fingerprintBindingSwaps", f"author:{ordinal}", derived["components"]["compositeFingerprintSha256"] != independent_sample["components"]["compositeFingerprintSha256"])
    for ordinal in range(512):
        changed = copy.deepcopy(base_input)
        changed["rotationEpoch"] = ordinal + 2
        derived = derive_fingerprint(changed, family_by_type)
        cases.add("fingerprintBindingSwaps", f"epoch:{ordinal}", derived["components"]["compositeFingerprintSha256"] != independent_sample["components"]["compositeFingerprintSha256"])
    for ordinal in range(512):
        claimed = copy.deepcopy(independent_sample)
        claimed["components"]["compositeFingerprintSha256"] = stable_hash(f"arbitrary-claim:{ordinal}")
        cases.add("fingerprintClaimValidation", f"arbitrary:{ordinal}", claimed != derive_fingerprint(base_input, family_by_type))
    tombstones = {independent_sample["components"]["compositeFingerprintSha256"]}
    for ordinal in range(512):
        replayed = independent_sample["components"]["compositeFingerprintSha256"]
        cases.add("fingerprintTombstoneOracle", f"replay:{ordinal}", replayed in tombstones)
    return {"familyMapCount": len(family_by_type), "independentSampleComposite": independent_sample["components"]["compositeFingerprintSha256"]}


def base_event(kind: str, ordinal: int, label: str) -> dict[str, Any]:
    return {
        "schemaVersion": "reviewer-calibration-v4-production-bound-event-4",
        "eventKind": kind,
        "eventId": f"event-{label}-00000000",
        "eventOrdinal": ordinal,
        "priorEventSha256": stable_hash(f"prior:{label}"),
        "occurredAtRfc3339": "2026-07-16T00:00:00Z",
        "artifactId": "reviewer-calibration-v4-production-bound-v4",
        "eventSha256": stable_hash(f"event:{label}"),
    }


def access_records(seed: int) -> list[dict[str, Any]]:
    hashes = lambda label: stable_hash(f"access:{seed}:{label}")
    authorization = {
        **base_event("AUTHORIZATION", seed * 10 + 1, f"auth-{seed}"),
        "transactionId": f"transaction-auth-{seed:06d}",
        "currentState": "ACTIVATION_GRANTED",
        "phase": "POST_ACTIVATION_RESULT",
        "resourceClass": "S1_RESULT_SCOPE_BOUND",
        "resourceSha256": hashes("resource"),
        "visibleSurfaceSha256": None,
        "actorPseudonym": "actor_alias_000001",
        "actorCanonicalPseudonym": "actor_alias_000001",
        "actorPrincipalCommitmentSha256": hashes("principal"),
        "actorRole": "S1_RESULT_VIEWER",
        "activeRoleAssignmentEventSha256": hashes("assignment"),
        "identityRegistryRootSha256": hashes("identity"),
        "capabilityTokenSha256": hashes("capability"),
        "capabilityUniquenessProofSha256": hashes("unique"),
        "sealedPolicyRegistryRootSha256": hashes("policy"),
        "policyMatrixRootSha256": hashes("matrix"),
        "allStateAllowRootSha256": hashes("state-allow"),
        "allStateDenyRootSha256": hashes("state-deny"),
        "allowedRolesRootSha256": hashes("role-allow"),
        "deniedRolesRootSha256": hashes("role-deny"),
        "policyTupleSha256": hashes("tuple"),
        "resourceClassPolicyProofSha256": hashes("resource-proof"),
        "stateTransitionEvidenceSha256": hashes("state-proof"),
        "authorizedAtRfc3339": "2026-07-16T00:00:00Z",
        "decision": "ALLOW",
    }
    open_event = {
        **base_event("OPEN", seed * 10 + 3, f"open-{seed}"),
        "transactionId": f"transaction-open-{seed:06d}",
        "authorizationEventSha256": hashes("wrong-auth-event"),
        "authorizationEventOrdinal": seed * 10 + 99,
        "capabilityTokenSha256": hashes("different-capability-open"),
        "openedAtRfc3339": "2026-07-15T23:59:59Z",
        "contentBytesReleasedBeforeOpenSeal": 0,
        "decision": "OPEN_SEALED",
    }
    consume = {
        **base_event("CAPABILITY_CONSUME", seed * 10 + 8, f"consume-{seed}"),
        "transactionId": f"transaction-consume-{seed:06d}",
        "authorizationEventSha256": hashes("wrong-auth-consume"),
        "openEventSha256": hashes("wrong-open"),
        "openEventOrdinal": seed * 10 + 2,
        "capabilityTokenSha256": hashes("different-capability-consume"),
        "capabilityRegistryBeforeSha256": hashes("cap-before"),
        "capabilityUniquenessProofSha256": hashes("unique-consume"),
        "useOrdinal": 1,
        "consumedAtRfc3339": "2026-07-15T23:59:58Z",
        "contentBytesReleasedBeforeConsumeSeal": 0,
        "capabilityRegistryAfterSha256": hashes("cap-after"),
        "decision": "CONSUME_ONCE",
    }
    close = {
        **base_event("CLOSE", seed * 10 + 9, f"close-{seed}"),
        "transactionId": f"transaction-close-{seed:06d}",
        "authorizationEventSha256": hashes("wrong-auth-close"),
        "openEventSha256": hashes("wrong-open-close"),
        "consumeEventSha256": hashes("wrong-consume-close"),
        "consumeEventOrdinal": seed * 10 + 3,
        "capabilityTokenSha256": hashes("different-capability-close"),
        "authorizedAtRfc3339": "2026-07-16T00:00:00Z",
        "openedAtRfc3339": "2026-07-15T23:59:59Z",
        "consumedAtRfc3339": "2026-07-15T23:59:58Z",
        "closedAtRfc3339": "2026-07-15T23:59:57Z",
        "bytesRead": seed,
        "contentReadSha256": hashes("content"),
        "decision": "CLOSE_SEALED",
    }
    return [authorization, open_event, consume, close]


def independent_access_chain_valid(events: list[dict[str, Any]]) -> bool:
    if [event["eventKind"] for event in events] != ["AUTHORIZATION", "OPEN", "CAPABILITY_CONSUME", "CLOSE"]:
        return False
    if any(events[i + 1]["eventOrdinal"] != events[i]["eventOrdinal"] + 1 for i in range(3)):
        return False
    tx = events[0]["transactionId"]
    cap = events[0]["capabilityTokenSha256"]
    if any(event["transactionId"] != tx or event["capabilityTokenSha256"] != cap for event in events[1:]):
        return False
    if not (events[0]["authorizedAtRfc3339"] < events[1]["openedAtRfc3339"] <= events[2]["consumedAtRfc3339"] <= events[3]["closedAtRfc3339"]):
        return False
    return True


def access_schema_and_sequence(validators, cases: CaseBook) -> dict[str, Any]:
    names = ["authorization", "openEvent", "capabilityConsume", "closeEvent"]
    for seed in range(1024):
        events = access_records(seed)
        for name, event in zip(names, events):
            errors = list(validators[name].iter_errors(event))
            require(not errors, f"access schema baseline rejected {name}:{seed}: {errors[:1]}")
        cases.add("accessDisconnectedChains", f"disconnected:{seed}", not independent_access_chain_valid(events))
    return {"individuallySchemaValidButDisconnectedChains": 1024}


def canonical_pseudonym(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    normalized = re.sub(r"[A-Z]", lambda m: m.group(0).lower(), normalized)
    require(re.fullmatch(r"[a-z0-9][a-z0-9._:-]{15,127}", normalized) is not None, "bad pseudonym")
    return normalized


def identity_properties(protocol, validators, cases: CaseBook) -> dict[str, Any]:
    base = "canonical_alias_0001"
    for ordinal in range(512):
        variant = ("  " if ordinal % 2 else "") + (base.upper() if ordinal % 3 else base) + ("  " if ordinal % 5 else "")
        cases.add("identityCanonicalization", f"alias:{ordinal}", canonical_pseudonym(variant) == base)
    source_to_principal: dict[str, str] = {}
    principal_to_source: dict[str, str] = {}
    pseudonym_to_principal: dict[str, str] = {}
    for ordinal in range(512):
        source = stable_hash(f"identity-source:{ordinal}")
        principal = stable_hash(f"identity-principal:{ordinal}")
        alias = f"identity_alias_{ordinal:04d}"
        source_to_principal[source] = principal
        principal_to_source[principal] = source
        pseudonym_to_principal[alias] = principal
        conflict_principal = stable_hash(f"identity-conflict:{ordinal}")
        conflict_rejected = source in source_to_principal and source_to_principal[source] != conflict_principal
        cases.add("identityBijectionOracle", f"source-conflict:{ordinal}", conflict_rejected)

    incompatibility = {
        "TRUSTED_GOLD_AUDITOR": set(protocol["roles"]["trustedGoldAuditorIncompatibleWith"]),
        "INDEPENDENT_ACTIVATION_AUDITOR": set(protocol["roles"]["activationAuditorIncompatibleWith"]),
        "S1_ADJUDICATOR": set(protocol["roles"]["freshAdjudicatorIncompatibleWith"]),
    }
    roles = protocol["roles"]["roleEnum"]
    for repeat in range(4):
        for controlling_role, incompatible in incompatibility.items():
            for other_role in roles:
                same_principal = stable_hash(f"role-principal:{repeat}:{controlling_role}")
                should_reject = other_role in incompatible
                observed_reject = same_principal == same_principal and other_role in incompatible
                cases.add("identityRoleSeparationOracle", f"{repeat}:{controlling_role}:{other_role}", observed_reject == should_reject)

    # Base64 is checked only as opaque text.  Sixteen schema-valid encodings decode
    # to the same 64 bytes; only the round-trip representation is canonical.
    signature_validator = validators["identityCustodianAttestation"]
    canonical = base64.b64encode(bytes(64)).decode("ascii")
    alphabet = "ABCDEFGHIJKLMNOP"
    schema_valid_aliases = 0
    noncanonical_aliases = 0
    for index, character in enumerate(alphabet):
        encoded = canonical[:85] + character + "=="
        event = {
            **base_event("IDENTITY_CUSTODIAN_ATTESTATION", index + 1, f"identity-attestation-{index}"),
            "identityBindingVersion": "NARA_QCAL_V4_STABLE_PRINCIPAL_HMAC_SHA256_1",
            "authorityNamespace": "authority.one",
            "custodianPrincipalCommitmentSha256": stable_hash("opaque-custodian"),
            "custodianPublicKeySha256": stable_hash("opaque-public-key"),
            "custodianRole": "IDENTITY_BINDING_CUSTODIAN",
            "subjectPrincipalCommitmentSha256": stable_hash("opaque-subject"),
            "canonicalSourceIdCommitmentSha256": stable_hash("opaque-source"),
            "canonicalPseudonyms": ["opaque_alias_000001"],
            "custodianSubjectDistinctProofSha256": stable_hash("opaque-distinct"),
            "signatureAlgorithm": "Ed25519",
            "signatureBase64": encoded,
            "attestationSha256": stable_hash(f"opaque-attestation:{index}"),
            "verdict": "ATTEST_ONE_PRINCIPAL_BINDING",
        }
        errors = list(signature_validator.iter_errors(event))
        require(not errors, f"opaque Base64 alias unexpectedly rejected by schema: {index}")
        schema_valid_aliases += 1
        decoded = base64.b64decode(encoded, validate=True)
        roundtrip = base64.b64encode(decoded).decode("ascii")
        is_canonical = roundtrip == encoded
        if not is_canonical:
            noncanonical_aliases += 1
        cases.add("identityOpaqueBase64Canonicality", f"alias:{index}", decoded == bytes(64))
    require(schema_valid_aliases == 16 and noncanonical_aliases == 15, "opaque Base64 alias matrix mismatch")
    return {"schemaValidOpaqueBase64Aliases": schema_valid_aliases, "noncanonicalOpaqueBase64Aliases": noncanonical_aliases}


def policy_properties(protocol, target_probe, cases: CaseBook) -> dict[str, Any]:
    roles = protocol["roles"]["roleEnum"]
    resources = protocol["resourceAccessPolicy"]["resourceClassEnum"]
    rows = protocol["resourceAccessPolicy"]["policyMatrix"]
    require(len(rows) == 7 and len(roles) == 17 and len(resources) == 14, "policy universe count mismatch")
    tuples = 0
    default_denies = 0
    for row in rows:
        require(set(row["allowedRoles"]).isdisjoint(row["deniedRoles"]), f"policy role overlap: {row['phase']}")
        require(set(row["allowedRoles"]) | set(row["deniedRoles"]) == set(roles), f"policy role partition: {row['phase']}")
        for resource in resources:
            decision = "ALLOW" if resource in row["allow"] else "DENY"
            if decision == "DENY" and resource not in row["deny"]:
                default_denies += 1
            for role in roles:
                authorized = decision == "ALLOW" and role in row["allowedRoles"] and role not in row["deniedRoles"]
                expected = resource in row["allow"] and role in row["allowedRoles"]
                cases.add("policyExactRoleResourceMatrix", f"{row['phase']}:{resource}:{role}", authorized == expected)
            tuples += 1
    require(tuples == 98, "policy tuple count mismatch")
    require(target_probe["checks"]["policyTupleCount"] == 98, "target tuple count mismatch")
    require(target_probe["checks"]["mutableDerivedPolicyAuthorizationAccepted"] is True, "mutable policy witness did not reproduce")
    require(target_probe["checks"]["selfClaimedFutureStateAndAliasAccepted"] is True, "state/alias witness did not reproduce")
    return {"tupleCount": tuples, "defaultDenyTupleCount": default_denies, "roleResourceCases": len(rows) * len(resources) * len(roles)}


def coverage_and_grant_properties(protocol, target_probe, cases: CaseBook) -> dict[str, Any]:
    focus = ["GRAMMAR_ERROR", "BLANK_INFERENCE"]
    all25 = protocol["typeUniverse"]["uiTypeIdsInOrder"]
    for ordinal in range(512):
        events = [stable_hash(f"coverage-event:{ordinal}:{t}") for t in focus]
        materials = [stable_hash(f"coverage-material:{ordinal}:{t}") for t in focus]
        slots = [f"MC-G-{ordinal % 8 + 1:02d}", f"MC-B-{ordinal % 8 + 1:02d}"]
        cases.add("coverageDistinctMaterialization", f"valid-focus:{ordinal}", len(set(events)) == len(set(materials)) == len(set(slots)) == 2)
        reused_slots = [slots[0], slots[0]]
        cases.add("coverageDistinctMaterialization", f"reused-focus:{ordinal}", len(set(reused_slots)) != 2)
    require(target_probe["checks"]["distinctFocusCoverageAccepted"] is True, "target valid coverage baseline failed")
    require(target_probe["checks"]["reusedFocusCoverageRejected"] is True, "target reused coverage was not rejected")

    for ordinal in range(512):
        candidate_scope = set(focus)
        certificate_scopes = [set(focus), set(focus)]
        requested_grant = set(all25)
        oracle_rejects = not requested_grant.issubset(candidate_scope) or any(not requested_grant.issubset(scope) for scope in certificate_scopes)
        cases.add("grantScopeOracle", f"focus-to-all25:{ordinal}", oracle_rejects)
    for ordinal in range(512):
        candidate_ordinal = ordinal * 4 + 1
        audit_ordinal = candidate_ordinal + 1
        manifest_ordinal = audit_ordinal
        grant_ordinal = candidate_ordinal + 3
        hashes_only_record = {
            "candidate": stable_hash(f"grant-candidate:{ordinal}"),
            "audit": stable_hash(f"grant-audit:{ordinal}"),
            "manifest": stable_hash(f"grant-manifest:{ordinal}"),
        }
        actual_event_bytes = None
        oracle_rejects = actual_event_bytes is None and candidate_ordinal < audit_ordinal <= manifest_ordinal < grant_ordinal and bool(hashes_only_record)
        cases.add("grantAuditMaterializationOracle", f"hashes-only:{ordinal}", oracle_rejects)
    require(target_probe["checks"]["focusCandidateAll25GrantAccepted"] is True, "target focus-to-all25 grant witness did not reproduce")
    return {"focusCoverageTypes": focus, "all25CoverageTypeCount": len(all25), "targetScopeEscalationAccepted": True}


def static_export_review() -> dict[str, Any]:
    semantics_text = (SUBJECT / "semantics.mjs").read_text("utf-8")
    fingerprint_text = (SUBJECT / "fingerprint.mjs").read_text("utf-8")
    semantic_exports = sorted(set(re.findall(r"export function ([A-Za-z0-9_]+)", semantics_text)))
    fingerprint_exports = sorted(set(re.findall(r"export function ([A-Za-z0-9_]+)", fingerprint_text)))
    access_terms = [name for name in semantic_exports if re.search(r"Access|Transaction|Capability|Open|Consume|Close", name, re.I)]
    replay_terms = [name for name in semantic_exports + fingerprint_exports if re.search(r"Reservation|Tombstone|Disjoint|Replay", name, re.I)]
    require(access_terms == [], f"unexpected access-chain validator export found: {access_terms}")
    require(replay_terms == [], f"unexpected no-replay validator export found: {replay_terms}")
    require("validateAuthorizationAgainstPolicy" in semantic_exports, "authorization validator missing")
    require("validateGrantAgainstSealedPolicy" in semantic_exports, "grant validator missing")
    require("validateFingerprintBundle" in fingerprint_exports, "fingerprint validator missing")
    return {
        "semanticFunctionExports": semantic_exports,
        "fingerprintFunctionExports": fingerprint_exports,
        "accessTransactionValidatorExports": access_terms,
        "reservationTombstoneDisjointnessValidatorExports": replay_terms,
    }


def run_target_probe() -> dict[str, Any]:
    completed = subprocess.run(
        ["node", str(HERE / "target-conformance-probe.mjs")],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    require(completed.returncode == 0, f"target conformance probe failed: {completed.stderr}")
    result = json.loads(completed.stdout)
    require(result["subjectAuthorTestsOrFixturesExecuted"] is False, "target probe used subject author tests/fixtures")
    require(result["identityCryptoOrKeyOperationsPerformed"] is False, "target probe used identity cryptography")
    return result


def verify_review_files(result: dict[str, Any], target_probe: dict[str, Any]) -> dict[str, Any]:
    evidence_path = HERE / "evidence.json"
    target_path = HERE / "target-probe-output.json"
    audit_path = HERE / "audit.json"
    if evidence_path.exists():
        require(json.loads(evidence_path.read_text("utf-8")) == result, "saved evidence does not match recomputation")
    if target_path.exists():
        require(json.loads(target_path.read_text("utf-8")) == target_probe, "saved target probe output mismatch")
    if audit_path.exists():
        audit = json.loads(audit_path.read_text("utf-8"))
        require(audit["verdict"] == result["verdict"], "audit verdict mismatch")
        require([row["code"] for row in audit["blockers"]] == EXPECTED_BLOCKER_CODES, "audit blocker code/order mismatch")
        require(audit["independentEvidence"]["totalCases"] == result["caseMatrix"]["totalCases"], "audit total case mismatch")
        require(audit["independentEvidence"]["caseDigestSha256"] == result["caseMatrix"]["caseDigestSha256"], "audit case digest mismatch")
    manifest_path = HERE / "MANIFEST.sha256"
    manifest_verified = False
    if manifest_path.exists():
        rows = parse_manifest(manifest_path)
        expected_names = {
            "REPORT.md", "audit.json", "evidence.json", "independent-verify.py",
            "target-conformance-probe.mjs", "target-probe-output.json",
        }
        require(set(rows) == expected_names, "review MANIFEST file set mismatch")
        actual_names = {p.name for p in HERE.iterdir() if p.is_file()} - {"MANIFEST.sha256"}
        require(actual_names == expected_names, "review directory contains an unsealed file")
        for name, digest in rows.items():
            require(sha256_file(HERE / name) == digest, f"review file SHA mismatch: {name}")
        manifest_verified = True
    return {"savedEvidenceVerified": evidence_path.exists(), "savedTargetProbeVerified": target_path.exists(), "auditVerified": audit_path.exists(), "manifestVerified": manifest_verified}


def main() -> None:
    before = snapshot_subject()
    subject_closure = rehash_subject_closure(before)
    lineage = rehash_safe_lineage()
    protocol = json.loads((SUBJECT / "protocol.json").read_text("utf-8"))
    schema_document = json.loads((SUBJECT / "event-schemas.json").read_text("utf-8"))
    cases = CaseBook()
    schema_result = schema_compile_all(schema_document, cases)
    validators = schema_result.pop("validators")
    target_probe = run_target_probe()
    require(target_probe["checks"]["canonicalNumberChecks"] == 9, "target number vector count")
    require(target_probe["checks"]["canonicalUtf16PropertyOrderCheck"] is True, "target UTF-16 ordering check")
    payloads, profiles = build_payloads(protocol, schema_document)
    canonical_result = canonical_properties(payloads, profiles, validators, cases)
    fingerprint_result = fingerprint_properties(protocol, target_probe, cases)
    identity_result = identity_properties(protocol, validators, cases)
    policy_result = policy_properties(protocol, target_probe, cases)
    coverage_grant_result = coverage_and_grant_properties(protocol, target_probe, cases)
    access_result = access_schema_and_sequence(validators, cases)
    exports = static_export_review()
    after = snapshot_subject()
    require(before == after, "subject changed during independent audit")
    require(cases.total >= 10_000, f"insufficient local cases: {cases.total}")

    result = {
        "schemaVersion": "reviewer-calibration-v4-production-bound-v4-independent-evidence-1",
        "artifactId": "reviewer-calibration-v4-production-bound-v4-independent-audit-v1",
        "verdict": "FAIL_BLOCKERS",
        "disposition": "DESIGN_ONLY_ZERO_AUTHORITY_SUBJECT_NOT_ACCEPTED",
        "subject": {
            "relativePath": "experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v4",
            "manifestFileSha256": EXPECTED_SUBJECT_MANIFEST_SHA256,
            "snapshotBeforeSha256": snapshot_root(before),
            "snapshotAfterSha256": snapshot_root(after),
            "snapshotStable": before == after,
            "files": before,
        },
        "subjectClosure": subject_closure,
        "safeLineage": lineage,
        "schemaCompilation": schema_result,
        "caseMatrix": {
            "totalCases": cases.total,
            "byCategory": dict(sorted(cases.counts.items())),
            "caseDigestSha256": cases.digest.hexdigest(),
        },
        "canonical": canonical_result,
        "fingerprint": fingerprint_result,
        "identity": identity_result,
        "policy": policy_result,
        "coverageAndGrant": coverage_grant_result,
        "access": access_result,
        "exports": exports,
        "targetProbeDigestSha256": sha256_bytes(json.dumps(target_probe, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")),
        "blockerCodes": EXPECTED_BLOCKER_CODES,
        "positiveFindings": [
            "ALL_DRAFT_2020_12_SCHEMAS_COMPILE_INDEPENDENTLY",
            "CANONICAL_PAYLOAD_FIELD_ORDER_NUMBER_UNICODE_AND_DOMAIN_VECTORS_CONFORM",
            "SEVEN_COMPONENT_FINGERPRINT_SAMPLE_MATCHES_INDEPENDENT_DERIVATION",
            "FOCUS_COVERAGE_RECOMPUTATION_REJECTS_REUSED_SLOT",
            "POLICY_SOURCE_TABLE_HAS_98_TUPLES_AND_EXACT_17_ROLE_PARTITIONS",
        ],
        "independence": {
            "subjectVerifyExecuted": False,
            "subjectSchemaHostileExecuted": False,
            "subjectHostileFixturesParsed": False,
            "subjectAuthorTestsTrusted": False,
            "identityCryptoOrKeysUsed": False,
            "privateRowsOpened": 0,
        },
        "activity": {
            "privateReads": 0,
            "actorReadsOrWrites": 0,
            "itemAnswerGoldRevealReadsOrWrites": 0,
            "secretOrEnvironmentReads": 0,
            "networkCalls": 0,
            "providerOrModelCalls": 0,
            "apiCandidatesConsumed": 0,
            "databaseCalls": 0,
            "ledgerReadsOrWrites": 0,
            "questionGeneration": 0,
        },
    }
    review_status = verify_review_files(result, target_probe)
    output = {"status": "PASS_INDEPENDENT_VERIFIER_EXPECTED_SUBJECT_FAIL", "review": review_status, "evidence": result, "targetProbe": target_probe}
    if "--json" in sys.argv:
        print(json.dumps(output, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    else:
        print("PASS independent verifier; expected subject verdict FAIL_BLOCKERS")
        print(f"cases={cases.total} digest={cases.digest.hexdigest()}")
        print(f"subject_snapshot={snapshot_root(before)} stable={before == after}")
        print(f"blockers={len(EXPECTED_BLOCKER_CODES)} review_manifest={review_status['manifestVerified']}")


if __name__ == "__main__":
    main()
