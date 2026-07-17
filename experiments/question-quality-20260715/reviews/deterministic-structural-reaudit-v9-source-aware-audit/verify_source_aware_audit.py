#!/usr/bin/env python3
"""Independently verify the v9 chain of custody, results, and post-audit seal."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


AUDIT_DIR = Path(__file__).resolve().parent
REPO_ROOT = AUDIT_DIR.parents[3]
SEALED_DIR = AUDIT_DIR.parent / "deterministic-structural-reaudit-v9"
CASES_PATH = SEALED_DIR / "cases.json"
PRE_MANIFEST_PATH = SEALED_DIR / "PRE_INSPECTION_MANIFEST.json"
PRE_SEAL_PATH = SEALED_DIR / "PRE_INSPECTION_SEAL.sha256"
ACCEPTANCE_PATH = AUDIT_DIR / "PRE_SOURCE_INSPECTION_ACCEPTANCE.json"
RESULTS_PATH = AUDIT_DIR / "results.json"
SUMMARY_PATH = AUDIT_DIR / "AUDIT_SUMMARY.md"
POST_MANIFEST_PATH = AUDIT_DIR / "POST_AUDIT_MANIFEST.json"
POST_SEAL_PATH = AUDIT_DIR / "POST_AUDIT_MANIFEST.sha256"
RUNNER_PATH = AUDIT_DIR / "run_source_aware_audit.ts"

SEALED_FILES = {
    "author_v9_corpus.py",
    "cases.json",
    "IMMUTABILITY.md",
    "PRE_INSPECTION_MANIFEST.json",
    "PRE_INSPECTION_SEAL.sha256",
    "PROTOCOL.md",
}
PRE_HASHED_FILES = {
    "author_v9_corpus.py",
    "cases.json",
    "IMMUTABILITY.md",
    "PROTOCOL.md",
}
AUDIT_ARTIFACTS = {
    "PRE_SOURCE_INSPECTION_ACCEPTANCE.json": "pre-source chronology and seal acceptance",
    "run_source_aware_audit.ts": "source-aware production runner",
    "verify_source_aware_audit.py": "independent artifact and reexecution verifier",
    "results.json": "machine-readable per-case results",
    "AUDIT_SUMMARY.md": "public audit summary",
}
FAMILIES = (
    "F1_SUMMARY_KEY_OPTION_COHESION",
    "F2_GRAMMAR_RENDERED_LABEL_REFERENCE",
    "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION",
    "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY",
)


def require(condition: Any, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def verify_family_oracle_contract(case: dict[str, Any]) -> None:
    surface = case["surface"]
    evidence = case["oracle_detail"]["evidence"]
    normal = case["oracle"] == "normal"
    family = case["family_id"]
    require(
        case["oracle_detail"]["is_structural_defect"] == (not normal),
        f"oracle defect boolean changed: {case['case_id']}",
    )

    if family == FAMILIES[0]:
        options = surface["options"]
        selected = [
            option
            for option in options
            if option["text"] == evidence["selected_full_surface"]
        ]
        require(len(selected) == 1, f"F1 selected surface is not unique: {case['case_id']}")
        require(
            selected[0]["label"] == evidence["selected_option_label"],
            f"F1 selected label evidence changed: {case['case_id']}",
        )
        channel = surface["authoritative_selection_channel"]
        require(
            evidence["selected_full_surface"] in surface[channel],
            f"F1 full surface is not verbatim: {case['case_id']}",
        )
        derived = surface["keyed_option"] == selected[0]["label"]
        require(derived == normal, f"F1 oracle changed: {case['case_id']}")
    elif family == FAMILIES[1]:
        reference = surface["referenced_label"]
        inventory = surface["rendered_label_inventory"]
        require(
            surface["grammar_key_point"].startswith(reference),
            f"F2 reference is not leading: {case['case_id']}",
        )
        derived = reference in inventory
        require(
            (reference in surface["rendered_text"]) == derived,
            f"F2 rendered inventory disagrees with rendered text: {case['case_id']}",
        )
        require(derived == normal, f"F2 oracle changed: {case['case_id']}")
    elif family == FAMILIES[2]:
        expected = surface["expected_structural_labels"]
        found: list[str] = []
        for line in surface["rendered_body"].splitlines():
            stripped = line.lstrip()
            matches = [
                label
                for label in expected
                if stripped == label or stripped.startswith(label + " ")
            ]
            require(len(matches) <= 1, f"F3 ambiguous leading label: {case['case_id']}")
            found.extend(matches)
        require(
            found == surface["observed_leading_block_labels"],
            f"F3 observed label evidence changed: {case['case_id']}",
        )
        derived = found == expected and all(found.count(label) == 1 for label in expected)
        require(derived == normal, f"F3 oracle changed: {case['case_id']}")
        if not normal:
            missing = [label for label in expected if label not in found]
            require(len(missing) == 1, f"F3 defect does not miss one label: {case['case_id']}")
            require(
                missing[0] == evidence["missing_leading_label"] == evidence["phantom_label"],
                f"F3 phantom evidence changed: {case['case_id']}",
            )
            require(
                evidence["phantom_surface"] in surface["rendered_body"],
                f"F3 phantom surface disappeared: {case['case_id']}",
            )
    elif family == FAMILIES[3]:
        complete = evidence["has_independent_finite_clause_spine"]
        require(isinstance(complete, bool), f"F4 clause-spine evidence is not boolean: {case['case_id']}")
        require(complete == normal, f"F4 oracle changed: {case['case_id']}")
        require(
            bool(evidence["boundary_kind"]) and bool(evidence["clause_analysis"]),
            f"F4 analysis evidence missing: {case['case_id']}",
        )
    else:
        raise ValueError(f"unknown family: {family}")


def verify_pre_inspection_bundle() -> tuple[dict[str, Any], dict[str, Any]]:
    actual_files = {path.name for path in SEALED_DIR.iterdir() if path.is_file()}
    require(actual_files == SEALED_FILES, "sealed directory file set changed")

    pre_manifest = load_json(PRE_MANIFEST_PATH)
    expected_pre_seal = (
        f"{sha256_file(PRE_MANIFEST_PATH)}  PRE_INSPECTION_MANIFEST.json\n"
    )
    require(
        PRE_SEAL_PATH.read_text(encoding="ascii") == expected_pre_seal,
        "pre-inspection seal mismatch",
    )
    require(
        set(pre_manifest["files"]) == PRE_HASHED_FILES,
        "pre-inspection manifest file set changed",
    )
    for name, record in pre_manifest["files"].items():
        path = SEALED_DIR / name
        require(record["sha256"] == sha256_file(path), f"sealed hash mismatch: {name}")
        require(record["bytes"] == path.stat().st_size, f"sealed size mismatch: {name}")

    corpus = load_json(CASES_PATH)
    cases = corpus["cases"]
    require(len(cases) == 160, "corpus no longer has 160 cases")
    require(
        sha256_bytes(canonical_bytes(cases)) == pre_manifest["aggregate_case_digest"],
        "aggregate case digest mismatch",
    )
    require(len({case["case_id"] for case in cases}) == 160, "case ids are not unique")
    require(
        len({sha256_bytes(canonical_bytes(case["surface"])) for case in cases}) == 160,
        "canonical surfaces are not unique",
    )

    by_pair: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for case in cases:
        verify_family_oracle_contract(case)
        by_pair[case["pair_id"]].append(case)
        by_family[case["family_id"]].append(case)
    require(len(by_pair) == 80, "pair count changed")
    for pair_id, pair in by_pair.items():
        require(len(pair) == 2, f"pair size changed: {pair_id}")
        require({case["oracle"] for case in pair} == {"normal", "defect"}, f"pair oracle symmetry changed: {pair_id}")
        require(len({case["family_id"] for case in pair}) == 1, f"pair crossed families: {pair_id}")
    require(set(by_family) == set(FAMILIES), "family set changed")
    for family, family_cases in by_family.items():
        require(len(family_cases) == 40, f"family case count changed: {family}")
        require(len({case["pair_id"] for case in family_cases}) == 20, f"family pair count changed: {family}")
        require(
            Counter(case["oracle"] for case in family_cases)
            == Counter({"normal": 20, "defect": 20}),
            f"family oracle counts changed: {family}",
        )
    return corpus, pre_manifest


def expected_metrics(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for family in (*FAMILIES, "OVERALL"):
        selected = (
            case_results
            if family == "OVERALL"
            else [result for result in case_results if result["family_id"] == family]
        )
        counts = Counter(result["classification"] for result in selected)
        tp, fn, fp, tn = (counts["TP"], counts["FN"], counts["FP"], counts["TN"])
        blocked = counts["BLOCK"]
        executed = tp + fn + fp + tn
        metrics[family] = {
            "total": len(selected),
            "oracle_normal": sum(result["oracle"] == "normal" for result in selected),
            "oracle_defect": sum(result["oracle"] == "defect" for result in selected),
            "executed": executed,
            "blocked": blocked,
            "confusion_matrix": {"tp": tp, "fn": fn, "fp": fp, "tn": tn},
            "accuracy_excluding_blocks": (tp + tn) / executed if executed else None,
            "defect_recall_excluding_blocks": tp / (tp + fn) if tp + fn else None,
            "normal_specificity_excluding_blocks": tn / (tn + fp) if tn + fp else None,
        }
    return metrics


def verify_results(corpus: dict[str, Any], pre_manifest: dict[str, Any]) -> dict[str, Any]:
    acceptance = load_json(ACCEPTANCE_PATH)
    require(
        acceptance["production_source_inspection_had_begun"] is False,
        "acceptance record does not preserve the pre-source chronology",
    )
    require(
        acceptance["chronology_finding"]["seal_existed_and_was_independently_verified_before_this_auditor_inspected_production_source"] is True,
        "acceptance record does not assert this audit's verified chronology",
    )
    for name, expected_hash in acceptance["file_sha256"].items():
        require(sha256_file(SEALED_DIR / name) == expected_hash, f"relocated hash changed: {name}")

    results = load_json(RESULTS_PATH)
    require(results["schema_version"] == "1.0.0", "results schema changed")
    require(results["corpus"]["corpus_id"] == corpus["corpus_id"], "results corpus id mismatch")
    require(results["corpus"]["cases_sha256"] == sha256_file(CASES_PATH), "results cases hash mismatch")
    require(
        results["corpus"]["aggregate_case_digest"] == pre_manifest["aggregate_case_digest"],
        "results aggregate digest mismatch",
    )
    require(results["chain_of_custody"]["oracle_labels_redefined"] is False, "results claim relabeling")
    require(
        results["execution_guardrails"]["ambiguous_projection_policy"] == "BLOCK",
        "ambiguous projections are not configured to BLOCK",
    )
    for field in (
        "api_used",
        "network_used",
        "database_used",
        "secrets_read",
        "production_writes",
        "production_code_changed_by_audit",
    ):
        require(results["execution_guardrails"][field] is False, f"forbidden execution guardrail true: {field}")

    cases = corpus["cases"]
    case_results = results["case_results"]
    require(len(case_results) == 160, "results do not contain 160 cases")
    require(
        [result["case_id"] for result in case_results]
        == [case["case_id"] for case in cases],
        "result order or case ids differ from sealed corpus",
    )
    for case, result in zip(cases, case_results, strict=True):
        for field in ("case_id", "pair_id", "family_id", "question_type", "oracle"):
            require(result[field] == case[field], f"result changed sealed {field}: {case['case_id']}")
        require(
            result["surface_sha256"] == sha256_bytes(canonical_bytes(case["surface"])),
            f"surface projection hash mismatch: {case['case_id']}",
        )
        if result["status"] == "blocked":
            require(result["classification"] == "BLOCK", f"blocked classification mismatch: {case['case_id']}")
            require(result["detected_defect"] is None, f"blocked case has a verdict: {case['case_id']}")
            require(bool(result["block_reason"]), f"blocked case has no explicit reason: {case['case_id']}")
        else:
            require(result["status"] == "executed", f"unknown result status: {case['case_id']}")
            require(isinstance(result["detected_defect"], bool), f"executed case has no boolean verdict: {case['case_id']}")
            expected_class = (
                "TP"
                if case["oracle"] == "defect" and result["detected_defect"]
                else "FN"
                if case["oracle"] == "defect"
                else "FP"
                if result["detected_defect"]
                else "TN"
            )
            require(result["classification"] == expected_class, f"classification mismatch: {case['case_id']}")
            require(result["block_reason"] is None, f"executed case has a block reason: {case['case_id']}")

        if case["family_id"] == FAMILIES[2] and result["status"] == "executed":
            require(
                result["projection"]["round_trip_equal_to_sealed_rendered_body"] is True,
                f"F3 projection is not lossless: {case['case_id']}",
            )
        if case["family_id"] == FAMILIES[3] and result["status"] == "executed":
            positions = result["production_finding"]["position_results"]
            require(len(positions) == 3, f"F4 did not probe three positions: {case['case_id']}")
            require(
                len({position["detected"] for position in positions}) == 1,
                f"F4 position ambiguity was not blocked: {case['case_id']}",
            )

    recomputed_metrics = expected_metrics(case_results)
    require(results["metrics"] == recomputed_metrics, "reported confusion matrices do not recompute")
    expected_failures = [
        {
            "case_id": result["case_id"],
            "pair_id": result["pair_id"],
            "family_id": result["family_id"],
            "oracle": result["oracle"],
            "classification": result["classification"],
            "detected_defect": result["detected_defect"],
            "block_reason": result["block_reason"],
            "production_finding": result["production_finding"],
        }
        for result in case_results
        if result["classification"] not in {"TP", "TN"}
    ]
    require(results["failures"] == expected_failures, "failure list is incomplete or reordered")
    require(results["failure_count"] == len(expected_failures), "failure count mismatch")

    actual_head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    require(results["production_snapshot"]["git_head"] == actual_head, "git HEAD changed since execution")
    for relative_path, record in results["production_snapshot"]["source_files"].items():
        path = REPO_ROOT / relative_path
        require(sha256_file(path) == record["sha256"], f"production source changed: {relative_path}")
        status = subprocess.run(
            ["git", "status", "--short", "--", relative_path],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip() or "clean"
        require(status == record["git_status"], f"production git status changed: {relative_path}")
    return results


def build_post_manifest(results: dict[str, Any]) -> dict[str, Any]:
    for name in AUDIT_ARTIFACTS:
        require((AUDIT_DIR / name).is_file(), f"missing audit artifact: {name}")
    artifacts = {
        name: {
            "sha256": sha256_file(AUDIT_DIR / name),
            "bytes": (AUDIT_DIR / name).stat().st_size,
            "role": role,
        }
        for name, role in sorted(AUDIT_ARTIFACTS.items())
    }
    relocated_bundle = {
        name: {
            "sha256": sha256_file(SEALED_DIR / name),
            "bytes": (SEALED_DIR / name).stat().st_size,
        }
        for name in sorted(SEALED_FILES)
    }
    return {
        "manifest_version": "1.0.0",
        "audit_id": results["audit_id"],
        "created_at": datetime.now().astimezone().isoformat(),
        "hash_algorithm": "SHA-256",
        "post_audit_stage": "source_aware_execution_complete",
        "relocated_sealed_bundle": {
            "relative_path": "../deterministic-structural-reaudit-v9",
            "files": relocated_bundle,
            "aggregate_case_digest": results["corpus"]["aggregate_case_digest"],
        },
        "production_snapshot": results["production_snapshot"],
        "artifacts": artifacts,
        "result_totals": results["metrics"],
        "verification": {
            "default": "python verify_source_aware_audit.py",
            "with_fresh_production_reexecution": "python verify_source_aware_audit.py --rerun",
        },
    }


def write_post_manifest(results: dict[str, Any]) -> None:
    manifest = build_post_manifest(results)
    POST_MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    POST_SEAL_PATH.write_text(
        f"{sha256_file(POST_MANIFEST_PATH)}  POST_AUDIT_MANIFEST.json\n",
        encoding="ascii",
        newline="\n",
    )


def verify_post_manifest(results: dict[str, Any]) -> None:
    manifest = load_json(POST_MANIFEST_PATH)
    require(manifest["manifest_version"] == "1.0.0", "post manifest version mismatch")
    require(manifest["audit_id"] == results["audit_id"], "post manifest audit id mismatch")
    require(manifest["hash_algorithm"] == "SHA-256", "post manifest hash algorithm mismatch")
    require(set(manifest["artifacts"]) == set(AUDIT_ARTIFACTS), "post manifest artifact set mismatch")
    for name, record in manifest["artifacts"].items():
        path = AUDIT_DIR / name
        require(record["sha256"] == sha256_file(path), f"post artifact hash mismatch: {name}")
        require(record["bytes"] == path.stat().st_size, f"post artifact size mismatch: {name}")
    require(manifest["result_totals"] == results["metrics"], "post manifest result totals mismatch")
    for name, record in manifest["relocated_sealed_bundle"]["files"].items():
        path = SEALED_DIR / name
        require(record["sha256"] == sha256_file(path), f"post bundle hash mismatch: {name}")
        require(record["bytes"] == path.stat().st_size, f"post bundle size mismatch: {name}")
    expected_seal = f"{sha256_file(POST_MANIFEST_PATH)}  POST_AUDIT_MANIFEST.json\n"
    require(POST_SEAL_PATH.read_text(encoding="ascii") == expected_seal, "post-audit seal mismatch")


def rerun_production() -> None:
    executable = REPO_ROOT / "node_modules" / ".bin" / (
        "tsx.cmd" if sys.platform.startswith("win") else "tsx"
    )
    require(executable.is_file(), f"local tsx executable missing: {executable}")
    completed = subprocess.run(
        [str(executable), str(RUNNER_PATH), "--verify-existing"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    require("reexecution-match" in completed.stdout, "runner did not confirm reexecution match")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--rerun", action="store_true")
    args = parser.parse_args()

    corpus, pre_manifest = verify_pre_inspection_bundle()
    author_check = subprocess.run(
        [sys.executable, str(SEALED_DIR / "author_v9_corpus.py"), "--verify-only"],
        cwd=SEALED_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    require('"status": "verified"' in author_check.stdout, "author verifier did not report verified")
    results = verify_results(corpus, pre_manifest)
    if args.rerun:
        rerun_production()
    if args.write_manifest:
        write_post_manifest(results)
    verify_post_manifest(results)

    print(
        json.dumps(
            {
                "status": "verified",
                "cases": len(results["case_results"]),
                "failures": results["failure_count"],
                "blocked": results["metrics"]["OVERALL"]["blocked"],
                "fresh_production_reexecution": args.rerun,
                "post_manifest_sha256": sha256_file(POST_MANIFEST_PATH),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
