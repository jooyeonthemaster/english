# Reviewer calibration v4 production-bound v3

This directory is an immutable-design successor to `reviewer-calibration-v4-production-bound-v2`. The predecessor remains rejected by its independent `FAIL_BLOCKERS` audit. This successor contains author-side remediation evidence for B1-B8, but it has not received a fresh independent audit and therefore grants no reviewer certification, evaluator authority, scoring authority, execution permission, result access, or activation authority.

The package is deliberately empty of actors, items, answers, gold, access events, certificates, activation candidates, audit reports, grants, and result records. Every current operational counter is zero. The event schemas and registries are future evidence contracts, not issued events.

## Contents

- `protocol.json`: fail-closed role, sequence, coverage, slot, fingerprint, access, and activation contract.
- `registries.json`: empty append-only registry templates and the 60 unmaterialized slot schedule.
- `event-schemas.json`: 20 future event schemas; current instance counts are all zero.
- `hostile-fixtures.json`: required B1-B8 attack families and minimum hostile-test counts.
- `verify.mjs`: standalone public-only structural, semantic, lineage, and package verifier.
- `PROTOCOL.md`: readable closure matrix and execution boundary.
- `public-manifest.json` and `MANIFEST.sha256`: created last to seal the author-evidence package.

## Verification

From the repository root:

```powershell
node experiments/question-quality-20260715/design/reviewer-calibration-v4-production-bound-v3/verify.mjs
```

A successful process exit means only that the immutable author package is internally consistent, its accepted public upstream bytes remain pinned, and its hostile cases were rejected. It is not an independent audit verdict. The expected disposition remains `AUTHOR_EVIDENCE_COMPLETE_PENDING_FRESH_INDEPENDENT_AUDIT_NO_PASS_OR_AUTHORITY`.

The verifier does not import or execute predecessor verifiers. It rehashes public upstream bytes and safe public manifest rows independently, refuses the single forbidden `private` manifest row without opening it, and performs no network, model, API, database, secret, ledger, question-generation, item, answer, or gold operation.

## Next admissible step

Freeze this directory byte-for-byte and place a fresh independent audit in a separate immutable review directory. Any future operational execution must live in another immutable package, start from empty registries, satisfy the complete event chain, and bind the fresh audit of this design. Editing this directory after audit begins invalidates that audit subject.
