# Immutability Statement

This directory is the pre-inspection, author-sealed deterministic structural holdout v10.

The sealed payload consists of:

- `cases.json`
- `ORACLE_PROTOCOL.md`
- `verify_author_seal.ps1`
- `IMMUTABILITY.md`

`PRE_INSPECTION_MANIFEST.json` records the byte length and SHA-256 digest of every sealed payload file plus a deterministic aggregate seal. After the manifest is written, none of the sealed payload files or the manifest may be edited, reformatted, reordered, line-ending-converted, or regenerated in place.

Any byte change invalidates v10. Corrections require a newly named version and a new pre-inspection seal; they must never be patched into this directory. Verification may read only the five files in this directory and must not invoke production code.

Author declaration: these cases were authored solely from the four product-facing rules frozen in `ORACLE_PROTOCOL.md`, before any production inspection for this holdout. No production source, tests, Git diff/history, prior v7/v8/v9/v10 audit or remediation artifacts, research notes, agent messages, generated question records, API, network, database, or secret was consulted.
