# Corpus v4 supply-remediation inventory

This is a research-only, read-only inventory prompted by the immutable v3
supply failure. It does not revise v3, create a generation corpus, initialize a
budget, or call any model/API/browser. Database access is SELECT-only.

## Temporal contract

This artifact is a **current-state capture**, not a historical `asOf` snapshot.
The database schema and queries cannot reconstruct all row/status/use-count
state at an arbitrary past instant. The builder therefore:

- accepts no caller-supplied timestamp;
- rejects `--as-of` and `--captured-at` explicitly;
- records the actual read window and uses its completion as `capturedAt`;
- binds both the database extract hash and the serialized DB-record-set hash;
- labels `historicalAsOfSupported: false` in private and public outputs.

`capturedAt` does not claim transaction-level simultaneity. `captureWindow`
honestly records that the read-only queries completed over an interval.

## Dependency-closed provenance

The private snapshot stores a 150-file dependency manifest. It recursively
hashes the local static-import closure from the builder, plus:

- all dynamically discovered `src/data/grammar-drill/**/*.json` inputs;
- the surveyed passage catalogs and `exam-passages/facets.json`;
- `prisma/schema.prisma`, `package.json`, and `package-lock.json`;
- the pinned private v3 input snapshot.

Every required file must exist or the build fails. Each entry records exact
SHA-256, byte length, role, and whether it was tracked-clean, tracked-dirty, or
untracked. Repository and dependency dirty/untracked state is explicit. The
legacy `codeHash` field is retained for compatibility but now equals the
dependency-manifest hash.

## Scope and evidence labels

The inventory separately measures:

- current committed, all-academy, normalized-content DB groups with zero prior
  Question/AI Question/Workbench use;
- `ExtractionItem`, legacy `ExtractionResult`, M1, and M2 passage drafts;
- every known English local catalog under `src/data` and `scripts/data`;
- exact/near overlap with the immutable v3 universe;
- earlier-family overlap and earlier-within-family overlap separately;
- type tags, source-reference/original-file-locator presence, review state, exact
  save/promotion/confirmation lineage, and recorded rights status.

`officialTypeTagged` means only that DB metadata says EXAM/MOCK/SUNEUNG with an
English/null subject. It is not source traceability, identity proof, or rights
clearance. `lineageState` distinguishes canonical committed passages,
extraction promotion, saved-passage linkage, confirmed drafts, and no recorded
lineage. `savedOrPromoted` remains only as a private compatibility aggregate.

Raw text, DB identifiers, source references, and academy identifiers live only
in `private/inventory-snapshot.json`, which is git-ignored. Public output is
aggregate-only.

## Non-equivalence rules

- A DRAFT extraction is not a committed DB passage.
- A linked blank-looking source stem is not equivalent to v3's official,
  high-confidence, central-span blank population.
- A URL, uploaded PDF, publisher label, or official-looking title is not a
  license or permission record.
- A saved/promoted flag is lineage, not rights clearance or v3 eligibility.
- Project tests, grammar curriculum, and generic textbook labels are not
  independent official benchmark supply.
- Pilot and validation rows must be disjoint; separate populations must never
  be pooled under the old v3 estimand.

## Commands

```powershell
npx tsx experiments/question-quality-20260715/corpus/v4-supply/build-inventory-v4.ts
npx tsx experiments/question-quality-20260715/corpus/v4-supply/build-inventory-v4.ts --write
npx tsx experiments/question-quality-20260715/corpus/v4-supply/verify-inventory-v4.ts
npx tsx --test experiments/question-quality-20260715/corpus/v4-supply/*.test.ts
```

Writes are exclusive. `inventory-public.json` is not an operational manifest.

## Legacy migration limitation

The first v4 contract serialized an unused `asOf` label and an incomplete code
hash. It cannot be upgraded into a truthful historical snapshot: the missing
past DB state and missing historical dependency manifest cannot be recovered
afterward. Its exact files are preserved, unmodified, under
`private/legacy-*-asof.json` for raw compatibility only. They must not be used
as point-in-time evidence. The remediated capture is a new semantic snapshot,
not a hash-preserving migration.
