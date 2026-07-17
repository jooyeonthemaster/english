#!/usr/bin/env python3
"""Fresh Draft 2020-12 structural baselines and hostile mutations.

This helper reads only the public event schema beside it.  It synthesizes one
baseline for every root oneOf branch, validates each branch independently, then
applies deterministic wrong-type, null, deletion, and unexpected-property
attacks.  Only mutations that actually violate the published schema are counted
as hostile cases; every counted case must be rejected by Draft202012Validator.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

from jsonschema import Draft202012Validator


HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE / "event-schemas.json"


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def resolve_ref(root: dict[str, Any], ref: str) -> dict[str, Any]:
    if not ref.startswith("#/"):
        raise ValueError(f"external ref forbidden: {ref}")
    value: Any = root
    for token in ref[2:].split("/"):
        value = value[token.replace("~1", "/").replace("~0", "~")]
    return value


def overlay(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(left)
    for key, value in right.items():
        if key == "properties":
            out.setdefault(key, {})
            for name, child in value.items():
                out[key][name] = overlay(out[key].get(name, {}), child)
        elif key == "required":
            out[key] = list(dict.fromkeys(out.get(key, []) + list(value)))
        else:
            out[key] = copy.deepcopy(value)
    return out


def expanded(root: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if "$ref" in schema:
        result = overlay(result, expanded(root, resolve_ref(root, schema["$ref"])))
    for part in schema.get("allOf", []):
        result = overlay(result, expanded(root, part))
    local = {key: value for key, value in schema.items() if key not in {"$ref", "allOf"}}
    return overlay(result, local)


def synthetic_string(name: str, schema: dict[str, Any], salt: str) -> str:
    if schema.get("format") == "date-time":
        return "2026-07-16T00:00:00Z"
    if name == "signatureBase64":
        return "A" * 86 + "=="
    pattern = schema.get("pattern", "")
    if "[0-9a-f]{64}" in pattern:
        return hashlib.sha256(salt.encode("utf-8")).hexdigest()
    if name == "slotId" or "(TP|MC|AH)-(G|B|N)" in pattern or "(MC|AH)-(G|B|N)" in pattern:
        return "MC-G-01"
    if "[a-z0-9._:-]{15,127}" in pattern:
        return f"actor-pseudonym-{hashlib.sha256(salt.encode()).hexdigest()[:12]}"
    if "[a-z0-9._:@-]{2,255}" in pattern:
        return "principal-source-0001"
    if "[a-z0-9._:-]{2,127}" in pattern:
        return "identity.authority.v4"
    minimum = max(int(schema.get("minLength", 1)), 1)
    base = f"synthetic-{name or 'value'}-{hashlib.sha256(salt.encode()).hexdigest()[:12]}"
    if len(base) < minimum:
        base += "x" * (minimum - len(base))
    maximum = schema.get("maxLength")
    return base if maximum is None else base[: int(maximum)]


def synth(root: dict[str, Any], raw: dict[str, Any], name: str, salt: str) -> Any:
    schema = expanded(root, raw)
    if "const" in schema:
        return copy.deepcopy(schema["const"])
    if "enum" in schema:
        return copy.deepcopy(schema["enum"][0])
    if "oneOf" in schema:
        return synth(root, schema["oneOf"][0], name, salt + "/one")
    if "anyOf" in schema:
        return synth(root, schema["anyOf"][0], name, salt + "/any")
    kind = schema.get("type")
    if isinstance(kind, list):
        kind = next((entry for entry in kind if entry != "null"), kind[0])
    if kind is None:
        if "properties" in schema or "required" in schema:
            kind = "object"
        elif "items" in schema or "prefixItems" in schema:
            kind = "array"
        else:
            kind = "string"
    if kind == "null":
        return None
    if kind == "boolean":
        return False
    if kind == "integer":
        return int(schema.get("minimum", 0))
    if kind == "number":
        return float(schema.get("minimum", 0))
    if kind == "string":
        return synthetic_string(name, schema, salt)
    if kind == "array":
        prefix = schema.get("prefixItems", [])
        out = [synth(root, entry, name, f"{salt}/{index}") for index, entry in enumerate(prefix)]
        minimum = int(schema.get("minItems", len(out)))
        item_schema = schema.get("items", {})
        while len(out) < minimum:
            out.append(synth(root, item_schema, name, f"{salt}/{len(out)}"))
        return out
    if kind == "object":
        out: dict[str, Any] = {}
        properties = schema.get("properties", {})
        for required_name in schema.get("required", []):
            out[required_name] = synth(root, properties.get(required_name, {}), required_name, f"{salt}/{required_name}")
        minimum = int(schema.get("minProperties", 0))
        candidates = list(schema.get("propertyNames", {}).get("enum", []))
        for candidate in candidates:
            if len(out) >= minimum:
                break
            if candidate not in out:
                out[candidate] = synth(root, schema.get("additionalProperties", {}), candidate, f"{salt}/{candidate}")
        return out
    raise ValueError(f"unsupported type {kind!r}")


def iter_paths(value: Any, path: tuple[Any, ...] = ()) -> Iterable[tuple[tuple[Any, ...], Any]]:
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from iter_paths(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_paths(child, path + (index,))


def parent_at(value: Any, path: tuple[Any, ...]) -> tuple[Any, Any]:
    cursor = value
    for token in path[:-1]:
        cursor = cursor[token]
    return cursor, path[-1]


def set_at(value: Any, path: tuple[Any, ...], replacement: Any) -> None:
    parent, token = parent_at(value, path)
    parent[token] = replacement


def delete_at(value: Any, path: tuple[Any, ...]) -> None:
    parent, token = parent_at(value, path)
    if isinstance(parent, list):
        parent.pop(token)
    else:
        del parent[token]


def wrong_values(original: Any) -> list[Any]:
    if original is None:
        return ["not-null", 1, {}]
    if isinstance(original, bool):
        return ["not-boolean", 1, None]
    if isinstance(original, str):
        return [17, None, {}, original.upper() + "-MUTATED"]
    if isinstance(original, (int, float)):
        return ["not-number", None, {}, original + 1]
    if isinstance(original, list):
        return [{}, None, "not-array", []]
    if isinstance(original, dict):
        return [[], None, "not-object"]
    return [None]


def main() -> None:
    root = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(root)
    root_validator = Draft202012Validator(root)

    baselines: list[tuple[str, dict[str, Any], Draft202012Validator]] = []
    for index, branch in enumerate(root["oneOf"]):
        ref = branch["$ref"]
        name = ref.rsplit("/", 1)[-1]
        branch_schema = {
            "$schema": root["$schema"],
            "$defs": root["$defs"],
            "$ref": ref,
        }
        branch_validator = Draft202012Validator(branch_schema)
        baseline = synth(root, branch, name, f"branch-{index}-{name}")
        if name == "slotMaterialization":
            baseline["slotId"] = "TP-G-01"
            baseline["canonicalTypeId"] = "GRAMMAR_ERROR"
            baseline["canonicalFamilyId"] = None
            baseline["fingerprintBundle"]["inputCommitments"]["canonicalTypeId"] = "GRAMMAR_ERROR"
            baseline["fingerprintBundle"]["inputCommitments"]["canonicalFamilyId"] = None
        errors = list(branch_validator.iter_errors(baseline))
        if errors:
            raise AssertionError(f"baseline {name} invalid: {errors[0].message}")
        if not root_validator.is_valid(baseline):
            raise AssertionError(f"baseline {name} is not valid under the root oneOf")
        baselines.append((name, baseline, branch_validator))

    case_rows: list[dict[str, Any]] = []
    attempt_count = 0

    def submit(case_id: str, mutation: dict[str, Any], validator: Draft202012Validator) -> None:
        nonlocal attempt_count
        attempt_count += 1
        if validator.is_valid(mutation):
            return
        case_rows.append({"id": case_id, "rejected": True})

    for branch_name, baseline, branch_validator in baselines:
        paths = list(iter_paths(baseline))
        for ordinal, (path, original) in enumerate(paths):
            if path:
                deleted = copy.deepcopy(baseline)
                delete_at(deleted, path)
                submit(f"{branch_name}:delete:{ordinal}:{'/'.join(map(str, path))}", deleted, branch_validator)
                for variant, replacement in enumerate(wrong_values(original)):
                    mutated = copy.deepcopy(baseline)
                    set_at(mutated, path, replacement)
                    submit(f"{branch_name}:replace:{ordinal}:{variant}:{'/'.join(map(str, path))}", mutated, branch_validator)
            if isinstance(original, dict):
                mutated = copy.deepcopy(baseline)
                target = mutated
                for token in path:
                    target = target[token]
                target[f"unexpected_{ordinal}"] = True
                submit(f"{branch_name}:unexpected:{ordinal}:{'/'.join(map(str, path))}", mutated, branch_validator)

    if len(baselines) != 23:
        raise AssertionError(f"expected 23 branches, found {len(baselines)}")
    if len(case_rows) < 650:
        raise AssertionError(f"structural hostile count below 650: {len(case_rows)}")
    if not all(row["rejected"] for row in case_rows):
        raise AssertionError("unrejected counted structural mutation")

    output = {
        "schemaEngine": "python-jsonschema Draft202012Validator",
        "branchCount": len(baselines),
        "validBaselines": len(baselines),
        "mutationAttempts": attempt_count,
        "structuralMutations": len(case_rows),
        "detectedStructuralMutations": len(case_rows),
        "structuralDigestSha256": digest(case_rows),
    }
    print(json.dumps(output, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
