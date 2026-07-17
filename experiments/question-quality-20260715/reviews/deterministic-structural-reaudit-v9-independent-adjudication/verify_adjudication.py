#!/usr/bin/env python3
"""Verify the independent v9 disagreement adjudication without production access."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


HERE = Path(__file__).resolve().parent
REVIEWS = HERE.parent
SEALED = REVIEWS / "deterministic-structural-reaudit-v9"
SOURCE_AUDIT = REVIEWS / "deterministic-structural-reaudit-v9-source-aware-audit"

PRIVATE_PATH = HERE / "adjudications.private.json"
PUBLIC_PATH = HERE / "PUBLIC_SUMMARY.md"
MANIFEST_PATH = HERE / "MANIFEST.json"
MANIFEST_SEAL_PATH = HERE / "MANIFEST.sha256"

EXPECTED_OUTPUT_FILES = {
    "MANIFEST.json",
    "MANIFEST.sha256",
    "PUBLIC_SUMMARY.md",
    "adjudications.private.json",
    "verify_adjudication.py",
}

EXPECTED_INPUTS = {
    "sealed/PROTOCOL.md": (
        SEALED / "PROTOCOL.md",
        "6323f8d10846fd51592fa1c2ac9d8f15e1e86c9f12b2ef2d842ac6d75c40dccc",
        4144,
    ),
    "sealed/cases.json": (
        SEALED / "cases.json",
        "64c8f3bdf16eafef1c8c6f11ad2a54799f2f9bcb1c1bd095800a7cebb6cd01ea",
        238983,
    ),
    "sealed/IMMUTABILITY.md": (
        SEALED / "IMMUTABILITY.md",
        "fe5cf12047ca815e8c486a2dcbfb3052981a2c34688f27074a1c5b442f12e258",
        1450,
    ),
    "sealed/PRE_INSPECTION_MANIFEST.json": (
        SEALED / "PRE_INSPECTION_MANIFEST.json",
        "2f8e98078388d74b1e3f2d84e6bab25ff337e63898cb4802e265049146aae1dc",
        1819,
    ),
    "sealed/PRE_INSPECTION_SEAL.sha256": (
        SEALED / "PRE_INSPECTION_SEAL.sha256",
        "f2ab695a99cbeee3e9e99fa52751cf4e5e5bf30fba0c9bd0d5efea2f7fa7487c",
        95,
    ),
    "source_audit/results.json": (
        SOURCE_AUDIT / "results.json",
        "917156746a6f4434452c29bc79284c41051a70cbf3b394ec3a43b021d724b707",
        236234,
    ),
    "source_audit/AUDIT_SUMMARY.md": (
        SOURCE_AUDIT / "AUDIT_SUMMARY.md",
        "e65fc8d654fcb3427c3b7a3f3f0ff5d61d62e074bd1b303fab08b16420c9ddce",
        6708,
    ),
}

ALLOWED_ADJUDICATIONS = {
    "CONFIRMED_ORACLE",
    "PRODUCT_CONTRACT_SCOPE_MISMATCH",
    "REDUNDANT_WRAPPER_EXPECTED",
    "AMBIGUOUS",
}

EXPECTED_OVERALL = {
    "CONFIRMED_ORACLE": 46,
    "PRODUCT_CONTRACT_SCOPE_MISMATCH": 13,
    "REDUNDANT_WRAPPER_EXPECTED": 1,
    "AMBIGUOUS": 0,
}

EXPECTED_FAMILY = {
    "F1_SUMMARY_KEY_OPTION_COHESION": {
        "disagreements": 14,
        "CONFIRMED_ORACLE": 14,
        "PRODUCT_CONTRACT_SCOPE_MISMATCH": 0,
        "REDUNDANT_WRAPPER_EXPECTED": 0,
        "AMBIGUOUS": 0,
    },
    "F2_GRAMMAR_RENDERED_LABEL_REFERENCE": {
        "disagreements": 18,
        "CONFIRMED_ORACLE": 18,
        "PRODUCT_CONTRACT_SCOPE_MISMATCH": 0,
        "REDUNDANT_WRAPPER_EXPECTED": 0,
        "AMBIGUOUS": 0,
    },
    "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION": {
        "disagreements": 13,
        "CONFIRMED_ORACLE": 0,
        "PRODUCT_CONTRACT_SCOPE_MISMATCH": 13,
        "REDUNDANT_WRAPPER_EXPECTED": 0,
        "AMBIGUOUS": 0,
    },
    "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY": {
        "disagreements": 15,
        "CONFIRMED_ORACLE": 14,
        "PRODUCT_CONTRACT_SCOPE_MISMATCH": 0,
        "REDUNDANT_WRAPPER_EXPECTED": 1,
        "AMBIGUOUS": 0,
    },
}


def fail(message: str) -> None:
    raise AssertionError(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_surface_sha256(surface: dict[str, Any]) -> str:
    payload = json.dumps(
        surface,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def normalized_position_codes(result: dict[str, Any]) -> dict[str, set[str]]:
    finding = result.get("production_finding") or {}
    positions = finding.get("position_results") or []
    return {
        item["position"]: set(item.get("non_target_issue_codes") or [])
        for item in positions
    }


def payload_strings(case: dict[str, Any]) -> Iterable[str]:
    surface = case["surface"]
    family = case["family_id"]
    if family == "F1_SUMMARY_KEY_OPTION_COHESION":
        yield case["oracle_detail"]["evidence"]["selected_full_surface"]
        yield surface["stem"]
        yield surface["explanation"]
    elif family == "F2_GRAMMAR_RENDERED_LABEL_REFERENCE":
        yield surface["raw_markup"]
        yield surface["rendered_text"]
        yield surface["grammar_key_point"]
    elif family == "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION":
        yield surface["rendered_body"]
    elif family == "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY":
        yield surface["candidate"]


def verify_input_hashes() -> None:
    for label, (path, expected_hash, expected_size) in EXPECTED_INPUTS.items():
        require(path.is_file(), f"missing allowed input: {label}")
        require(path.stat().st_size == expected_size, f"size mismatch: {label}")
        require(sha256_path(path) == expected_hash, f"SHA-256 mismatch: {label}")

    pre_manifest = load_json(SEALED / "PRE_INSPECTION_MANIFEST.json")
    require(
        pre_manifest["files"]["cases.json"]["sha256"]
        == EXPECTED_INPUTS["sealed/cases.json"][1],
        "pre-inspection manifest no longer binds the expected cases digest",
    )
    seal_tokens = (SEALED / "PRE_INSPECTION_SEAL.sha256").read_text(
        encoding="utf-8"
    ).strip().split()
    require(len(seal_tokens) == 2, "malformed pre-inspection seal")
    require(
        seal_tokens[0] == EXPECTED_INPUTS["sealed/PRE_INSPECTION_MANIFEST.json"][1]
        and seal_tokens[1] == "PRE_INSPECTION_MANIFEST.json",
        "pre-inspection seal does not bind the expected manifest",
    )


def verify_manifest() -> None:
    require(MANIFEST_PATH.is_file(), "missing MANIFEST.json")
    require(MANIFEST_SEAL_PATH.is_file(), "missing MANIFEST.sha256")
    manifest = load_json(MANIFEST_PATH)
    require(manifest["audit_id"] == "deterministic-structural-reaudit-v9-independent-adjudication", "wrong manifest audit id")

    for label, (path, expected_hash, expected_size) in EXPECTED_INPUTS.items():
        recorded = manifest["inputs"].get(label)
        require(recorded is not None, f"manifest omits input: {label}")
        require(recorded["sha256"] == expected_hash, f"manifest input digest mismatch: {label}")
        require(recorded["bytes"] == expected_size, f"manifest input size mismatch: {label}")
        require(recorded["path"] == str(path).replace("\\", "/"), f"manifest input path mismatch: {label}")

    artifact_names = {
        "adjudications.private.json",
        "PUBLIC_SUMMARY.md",
        "verify_adjudication.py",
    }
    require(set(manifest["artifacts"]) == artifact_names, "manifest artifact allowlist mismatch")
    for name in artifact_names:
        path = HERE / name
        recorded = manifest["artifacts"][name]
        require(path.is_file(), f"missing artifact: {name}")
        require(recorded["bytes"] == path.stat().st_size, f"artifact size mismatch: {name}")
        require(recorded["sha256"] == sha256_path(path), f"artifact digest mismatch: {name}")

    seal_tokens = MANIFEST_SEAL_PATH.read_text(encoding="utf-8").strip().split()
    require(len(seal_tokens) == 2, "malformed adjudication manifest seal")
    require(seal_tokens[1] == "MANIFEST.json", "manifest seal names the wrong file")
    require(seal_tokens[0] == sha256_path(MANIFEST_PATH), "manifest seal digest mismatch")

    observed_files = {path.name for path in HERE.iterdir() if path.is_file()}
    require(observed_files == EXPECTED_OUTPUT_FILES, "unexpected or missing output file")


def verify_rows() -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    private = load_json(PRIVATE_PATH)
    corpus = load_json(SEALED / "cases.json")
    audit = load_json(SOURCE_AUDIT / "results.json")

    cases = corpus["cases"]
    results = audit["case_results"]
    require(len(cases) == 160, "sealed corpus must contain 160 cases")
    require(len(results) == 160, "source-aware results must contain 160 rows")
    require(all(item["status"] == "executed" for item in results), "a source result is not executed")
    require(all(item["block_reason"] is None for item in results), "a source result is blocked")

    case_by_id = {item["case_id"]: item for item in cases}
    result_by_id = {item["case_id"]: item for item in results}
    require(len(case_by_id) == 160, "duplicate sealed case id")
    require(len(result_by_id) == 160, "duplicate result case id")
    require(set(case_by_id) == set(result_by_id), "case/result id sets differ")

    for case_id, case in case_by_id.items():
        result = result_by_id[case_id]
        require(result["pair_id"] == case["pair_id"], f"pair mismatch: {case_id}")
        require(result["family_id"] == case["family_id"], f"family mismatch: {case_id}")
        require(result["oracle"] == case["oracle"], f"oracle mismatch: {case_id}")
        require(
            result["surface_sha256"] == canonical_surface_sha256(case["surface"]),
            f"surface hash mismatch: {case_id}",
        )

    disagreements = [item for item in results if item["classification"] in {"FN", "FP"}]
    require(len(disagreements) == 60, "expected exactly 60 source disagreements")

    rows = private["rows"]
    require(len(rows) == 60, "private adjudication must contain 60 rows")
    row_ids = [item["case_id"] for item in rows]
    require(len(set(row_ids)) == 60, "duplicate adjudication row")
    require(
        set(row_ids) == {item["case_id"] for item in disagreements},
        "adjudication rows are not the exact source disagreement set",
    )

    controls_seen: list[str] = []
    overall_counter: Counter[str] = Counter()
    family_counter: dict[str, Counter[str]] = defaultdict(Counter)

    for row in rows:
        case_id = row["case_id"]
        result = result_by_id[case_id]
        case = case_by_id[case_id]
        control_id = row["paired_control_case_id"]
        require(control_id in case_by_id, f"missing paired control: {case_id}")
        control_case = case_by_id[control_id]
        control_result = result_by_id[control_id]

        require(row["source_classification"] == result["classification"], f"source class mismatch: {case_id}")
        require(row["family_id"] == case["family_id"], f"row family mismatch: {case_id}")
        require(row["adjudication"] in ALLOWED_ADJUDICATIONS, f"unknown adjudication: {case_id}")
        require(case["pair_id"] == control_case["pair_id"], f"wrong paired control: {case_id}")
        require(case["oracle"] != control_case["oracle"], f"control oracle not opposite: {case_id}")
        require(control_result["classification"] in {"TN", "TP"}, f"paired control is not correctly classified: {case_id}")
        require(str(row.get("reason", "")).strip(), f"missing reason: {case_id}")
        require(str(row.get("paired_control_check", "")).strip(), f"missing control check: {case_id}")
        require(str(row.get("recommended_fix_boundary", "")).strip(), f"missing fix boundary: {case_id}")

        controls_seen.append(control_id)
        overall_counter[row["adjudication"]] += 1
        family_counter[row["family_id"]][row["adjudication"]] += 1

        family = row["family_id"]
        evidence = row["evidence"]
        if family == "F1_SUMMARY_KEY_OPTION_COHESION":
            require(result["classification"] == "FN" and case["oracle"] == "defect", f"F1 shape mismatch: {case_id}")
            require(row["adjudication"] == "CONFIRMED_ORACLE", f"F1 must be confirmed: {case_id}")
            sealed_evidence = case["oracle_detail"]["evidence"]
            require(evidence["selected_full_surface"] == sealed_evidence["selected_full_surface"], f"F1 selected surface mismatch: {case_id}")
            require(evidence["selected_label"] == sealed_evidence["selected_option_label"], f"F1 selected label mismatch: {case_id}")
            require(evidence["defect_key"] == case["surface"]["keyed_option"], f"F1 defect key mismatch: {case_id}")
            require(evidence["control_key"] == control_case["surface"]["keyed_option"], f"F1 control key mismatch: {case_id}")
            require(evidence["authoritative_channel"] == case["surface"]["authoritative_selection_channel"], f"F1 channel mismatch: {case_id}")
            require(sealed_evidence["key_matches_selected_option"] is False, f"F1 defect oracle malformed: {case_id}")
            require(control_case["oracle_detail"]["evidence"]["key_matches_selected_option"] is True, f"F1 control oracle malformed: {case_id}")
        elif family == "F2_GRAMMAR_RENDERED_LABEL_REFERENCE":
            require(result["classification"] == "FN" and case["oracle"] == "defect", f"F2 shape mismatch: {case_id}")
            require(row["adjudication"] == "CONFIRMED_ORACLE", f"F2 must be confirmed: {case_id}")
            reference = case["surface"]["referenced_label"]
            defect_inventory = case["surface"]["rendered_label_inventory"]
            control_inventory = control_case["surface"]["rendered_label_inventory"]
            require(evidence["reference"] == reference, f"F2 reference mismatch: {case_id}")
            require(evidence["defect_rendered_inventory"] == defect_inventory, f"F2 defect inventory mismatch: {case_id}")
            require(evidence["control_rendered_inventory"] == control_inventory, f"F2 control inventory mismatch: {case_id}")
            require(reference not in defect_inventory, f"F2 defect unexpectedly renders reference: {case_id}")
            require(reference in control_inventory, f"F2 control omits reference: {case_id}")
        elif family == "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION":
            require(result["classification"] == "FP" and case["oracle"] == "normal", f"F3 shape mismatch: {case_id}")
            require(row["adjudication"] == "PRODUCT_CONTRACT_SCOPE_MISMATCH", f"F3 must be scope mismatch: {case_id}")
            generic_labels = case["oracle_detail"]["evidence"]["expected_labels"]
            require(evidence["generic_labels"] == generic_labels, f"F3 label evidence mismatch: {case_id}")
            require(case["oracle_detail"]["evidence"]["observed_leading_labels"] == generic_labels, f"F3 normal is not structurally complete: {case_id}")
            require(evidence["paired_control_missing_label"] == control_case["oracle_detail"]["evidence"]["missing_leading_label"], f"F3 control missing-label mismatch: {case_id}")
            require(control_result["classification"] == "TP", f"F3 defect control is not TP: {case_id}")
            target_issues = (result.get("production_finding") or {}).get("target_issues") or []
            require(target_issues, f"F3 lacks target production findings: {case_id}")
            require(all(item["code"] == "sentence-order-paragraph-labels" for item in target_issues), f"F3 finding is not exact-label enforcement: {case_id}")
            require(any("must be (A), (B), (C)" in item["message"] for item in target_issues), f"F3 finding lacks product label contract: {case_id}")
        elif family == "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY":
            require(result["classification"] == "FN" and case["oracle"] == "defect", f"F4 shape mismatch: {case_id}")
            require(evidence["defect_candidate"] == case["surface"]["candidate"], f"F4 defect candidate mismatch: {case_id}")
            require(evidence["control_candidate"] == control_case["surface"]["candidate"], f"F4 control candidate mismatch: {case_id}")
            require(case["oracle_detail"]["evidence"]["has_independent_finite_clause_spine"] is False, f"F4 defect oracle malformed: {case_id}")
            require(control_case["oracle_detail"]["evidence"]["has_independent_finite_clause_spine"] is True, f"F4 control oracle malformed: {case_id}")
            require(control_result["classification"] == "TN", f"F4 control is not TN: {case_id}")

            defect_codes = normalized_position_codes(result)
            control_codes = normalized_position_codes(control_result)
            require(set(defect_codes) == {"(A)", "(B)", "(C)"}, f"F4 defect positions incomplete: {case_id}")
            require(set(control_codes) == {"(A)", "(B)", "(C)"}, f"F4 control positions incomplete: {case_id}")
            if row["adjudication"] == "REDUNDANT_WRAPPER_EXPECTED":
                require(case_id == "v9-f4-p12-defect", "unexpected redundant-wrapper row")
                require(all("sentence-order-paragraph-too-short" in codes for codes in defect_codes.values()), "redundant row lacks position-invariant wrapper code")
                require(all("sentence-order-paragraph-too-short" not in codes for codes in control_codes.values()), "redundant row wrapper code also hits control")
            else:
                require(row["adjudication"] == "CONFIRMED_ORACLE", f"unexpected F4 adjudication: {case_id}")
                for position in ("(A)", "(B)", "(C)"):
                    require(defect_codes[position] == control_codes[position], f"unproven F4 wrapper differential: {case_id} {position}")
        else:
            fail(f"unexpected family: {family}")

    require(len(controls_seen) == 60 and len(set(controls_seen)) == 60, "paired controls are not one-to-one")
    require(dict(overall_counter) == {key: value for key, value in EXPECTED_OVERALL.items() if value}, "overall adjudication counts mismatch")

    for family, expected in EXPECTED_FAMILY.items():
        observed = family_counter[family]
        require(sum(observed.values()) == expected["disagreements"], f"family disagreement count mismatch: {family}")
        for classification in ALLOWED_ADJUDICATIONS:
            require(observed[classification] == expected[classification], f"family adjudication count mismatch: {family} {classification}")

    require(private["summary"]["total"] == 60, "private summary total mismatch")
    require(private["summary"]["by_adjudication"] == EXPECTED_OVERALL, "private overall summary mismatch")
    require(private["summary"]["by_family"] == EXPECTED_FAMILY, "private family summary mismatch")
    require(private["method"]["disagreement_rows_reviewed"] == 60, "reviewed-row declaration mismatch")
    require(private["method"]["paired_controls_reviewed"] == 60, "control-review declaration mismatch")
    require(private["method"]["skipped_rows"] == 0, "a row was declared skipped")

    return private, cases, results


def verify_public_summary(cases: list[dict[str, Any]]) -> None:
    text = PUBLIC_PATH.read_text(encoding="utf-8")
    require(not re.search(r"v9-f[1-4]-p\d{2}-(?:normal|defect)", text), "public summary exposes a case id")
    require("**46**" in text and "**13**" in text and "**1**" in text, "public summary omits aggregate counts")
    require("zero confirmed broadening cases" in text, "public summary omits F3 broadening boundary")
    require("No disagreement was skipped or blocked" in text, "public summary omits completion statement")

    for case in cases:
        for payload in payload_strings(case):
            if len(payload) >= 16:
                require(payload not in text, "public summary exposes a sealed surface payload")


def main() -> int:
    verify_input_hashes()
    verify_manifest()
    _, cases, _ = verify_rows()
    verify_public_summary(cases)
    print(
        "PASS: 60/60 disagreements and 60/60 controls verified; "
        "46 confirmed, 13 product-scope mismatches, 1 redundant wrapper, "
        "0 ambiguous, 0 skipped."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, TypeError, ValueError, OSError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
