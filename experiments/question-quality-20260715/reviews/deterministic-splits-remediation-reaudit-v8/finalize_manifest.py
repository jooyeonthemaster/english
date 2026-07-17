#!/usr/bin/env python3
"""Write the non-circular SHA-256 payload manifest for the frozen v8 audit."""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PAYLOADS = [
    "AUDIT.md",
    "BLIND_PROTOCOL.md",
    "IMMUTABILITY.md",
    "audit.mts",
    "blind-seal.json",
    "blind_corpus_author.py",
    "case-results.json",
    "cases.json",
    "finalize_manifest.py",
    "legacy-tests.log",
    "novelty.json",
    "results.json",
    "source-hashes.json",
    "verify.mjs",
]


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> None:
    missing = [name for name in PAYLOADS if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit(f"missing payloads: {missing}")
    unexpected = sorted(
        path.name
        for path in ROOT.iterdir()
        if path.is_file() and path.name not in {*PAYLOADS, "MANIFEST.sha256"}
    )
    if unexpected:
        raise SystemExit(f"unexpected unmanifested files: {unexpected}")
    lines = [f"{digest(ROOT / name)}  {name}" for name in PAYLOADS]
    (ROOT / "MANIFEST.sha256").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"manifested {len(PAYLOADS)} payload files")


if __name__ == "__main__":
    main()

