# Independent audit: selected-source history v1

## Verdict

**PASS**, limited to the artifact's declared metric: exact NFKC/whitespace-normalized
content matches and directly linked `Question`, `Question(aiGenerated=true)`, and
`WorkbenchAiJob` rows across every academy. This is not a universal proof that
the source has never appeared in a deleted record, a near-duplicate, or every
alternate lineage store, and it does not authorize generation.

The sealed baseline was captured at `2026-07-15T04:47:32.668Z`. The independent
read-only recapture was completed on 2026-07-15 after the baseline and did not
overwrite or rewrite any baseline byte. No model or generation API was called;
the full-question-candidate counter remains 0.

## Evidence that passed

1. **Frozen set and pinned history.** Both reconciliations contribute exactly 38
   unique rows, for 76 unique frame IDs and 76 unique content hashes. Each type
   has development/confirmatory/reserve counts `6/20/12`. The sealed focus pool
   contains all 76 rows. Their pinned evidence is zero for all three measures:
   `Question=0`, `Question(aiGenerated=true)=0`, and `WorkbenchAiJob=0`.
   Origins are 20 `db-global` and 56 `repo-official`.
2. **Baseline rows.** The private baseline has exactly 76 unique rows and reports
   76 clean / 0 exposed. Exactly 20 rows have a current database content match,
   one passage row each, which agrees with the 20 database-origin sources.
3. **Independent current database read.** The audit hashed all 2,736 current
   `Passage` rows without an academy or subject prefilter. It found 20 exact
   selected-content matches; all 20 also satisfy the v3 loader's language/subject
   filter and no selected match was excluded by subject metadata. All 20 pinned
   database passage IDs still exist and all 20 still have their frozen content
   hash. Direct counts are again `Question=0`, `aiQuestion=0`, and
   `WorkbenchAiJob=0`.
4. **Deletion, domain, and status semantics.** The loader's three group queries
   have no `academyId`, `domain`, `status`, or `deletedAt` predicate. Therefore
   soft-deleted questions/jobs and every Workbench job domain/status are counted,
   rather than silently treated as clean. `aiQuestionCount` is the
   `aiGenerated=true` subset of the unfiltered Question count.
5. **Supplemental exact-ID probes.** Selected IDs occur in zero
   `NaeshinQuestion` rows, zero Similar Question job `passageIds`, zero Custom
   Question job `passageIds`, and zero detached Workbench job config/result
   payloads. These are supplemental probes, not a claim that every possible
   text-bearing table was exhaustively searched.
6. **Integrity and privacy.** All six baseline manifest entries match current
   bytes. The manifest file itself is
   `8239f106e6164419c06e572a2e12065bf43baae32e80ccd37553529e2b403632`.
   Public/private internal seals and the public-to-private binding verify. No
   frame ID, row content hash, passage/database/academy ID, or passage text from
   the private evidence occurs verbatim in the public artifact. The public file
   does intentionally contain opaque aggregate/artifact cryptographic bindings;
   those are not row content hashes.
7. **Read-only behavior and immutability.** The production loader uses only
   `findMany` and `groupBy`; the independent supplement adds only `count`. Static
   inspection finds no Prisma create/update/upsert/delete method. Run outputs use
   exclusive-create (`wx`) and the audit left baseline bytes untouched.

Machine-readable evidence is in `audit-result.json`; `verify.mts` reproduces the
integrity, privacy, source-set, pinned-history, current-DB, and supplemental
lineage checks.

## Residual false-clean risks

These risks do not contradict this capture's scoped PASS, but any broader claim
must fail closed:

- **Exact-content boundary.** A near-duplicate is not a match. If a passage was
  edited after generation, content-hash matching alone could miss its old
  exposure. For this capture the risk is closed for the 20 database-origin rows
  because every pinned ID remains present with identical content; it is not
  closed as a general future property of the v1 script.
- **Deleted historical passage boundary.** `Passage` has no soft-delete field.
  A physical deletion can detach a nullable Workbench job and can make old
  content unrecoverable from the current passage table. A future refresh cannot
  prove absence from data it can no longer address.
- **Alternate lineage boundary.** The canonical v1 metric does not inspect every
  JSON payload, draft table, or unrelated question-bank table by source text.
  The four obvious exact-ID probes are clean, but this is still not a universal
  lineage census.
- **Incomplete executable pin.** The baseline manifest pins `refresh.mts` and
  its three input artifacts, but not the imported `snapshot-v3.ts`,
  `selector-core-v3.ts`, or `selector-core.ts` bytes. The sealed result is
  intact and independently recaptured, but the original executable closure is
  not fully reproducible from that manifest alone.
- **Non-atomic triplet creation.** Each output uses exclusive-create, but the
  public/private/manifest triplet is written sequentially. A collision on the
  second or third path can leave a partial new run. The complete baseline is not
  affected: all three files exist and bind correctly.
- **Separate v3 supply status.** Rebuilding the complete frozen v3 selector now
  reports `HARD_FAIL_SUPPLY_SHORTAGE` for its global multi-panel target, even
  though the focus pool contains and validates all 76 reconciled rows. The
  history PASS must not be misrepresented as whole-corpus readiness.
- **Mutable database.** The baseline saw 2,734 queried passages; the independent
  recapture saw 2,736 total passages. The selected-source result remained zero,
  but the baseline is a point-in-time fact. A new immutable label is required
  immediately before dispatch.

## Campaign implication

The baseline may be bound as `DIRECT_EXACT_LINEAGE_HISTORY_CLEAN` evidence for
these 76 frozen rows. It must not be labelled “no prior exposure” without the
scope qualifier above. Before any API dispatch, use a fresh immutable refresh
label and require all 20 pinned database IDs to remain present and content-
identical; block on any direct count, missing/mutated pinned ID, subject-excluded
exact match, or supplemental exact-ID lineage hit. A hardened successor should
also pin transitive helper bytes and preflight all three output paths before
writing.
