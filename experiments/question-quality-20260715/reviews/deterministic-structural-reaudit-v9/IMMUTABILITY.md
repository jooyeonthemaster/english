# Immutability and Chain-of-Custody Rules

`cases.json` is immutable once `PRE_INSPECTION_MANIFEST.json` and `PRE_INSPECTION_SEAL.sha256` exist.

1. Audit consumers must treat all six allowlisted files in this directory as read-only.
2. Before any inspection or execution against a system under test, run `python author_v9_corpus.py --verify-only`. A failure voids the corpus for blind evaluation.
3. Never repair, relabel, delete, reorder, or append a case in place. A justified corpus change requires a new versioned directory, new corpus identifier, new manifest, and new seal.
4. Never replace only the manifest or seal after a content change. The manifest is evidence of the original pre-inspection state, not a mutable checksum cache.
5. Do not add production outputs, source-aware notes, detector results, passage/DB identifiers, credentials, or external-data artifacts to this directory.
6. Preserve the paired case identifiers when reporting results, but keep results outside this directory.
7. The manifest hashes the author script, protocol, immutable corpus, and this document. The seal hashes the manifest. Verification must succeed before and after copying the directory.

Allowed files are:

- `author_v9_corpus.py`
- `PROTOCOL.md`
- `cases.json`
- `PRE_INSPECTION_MANIFEST.json`
- `PRE_INSPECTION_SEAL.sha256`
- `IMMUTABILITY.md`

Any additional file is outside the sealed corpus and must not be treated as authored holdout material.
