# Corpus v4 supply-remediation fresh-eyes audit

Date: 2026-07-15 KST  
Scope: immutable snapshot/input integrity, exact/near leakage, v3 overlap,
committed/rights state, target arithmetic, live drift, provenance, and the
estimands implied by V4-A/B/C  
Safety: model/API/browser calls 0; database writes 0; production edits 0

## Verdict

**Overall acceptance: FAIL / BLOCKED as an immutable, point-in-time research
snapshot.** Two provenance defects are material: `asOf` is not applied to any
database query, and the advertised code/input hash does not close over several
imported, untracked selector dependencies.

**Substantive supply conclusion: CONFIRMED.** A separate implementation
reproduced the important counts, exact/near decisions, queue sizes, and gaps.
The present evidence still says that the exact v3 campaign is infeasible and
generation budget should remain off. The two integrity defects do not create
hidden supply; they prevent the artifact from being accepted as a fully pinned
historical snapshot.

## Reproduction and hash results

| Artifact/check | Independently observed |
|---|---|
| v3 semantic snapshot | `c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13` — matches |
| v4 semantic inventory snapshot | `49d8846262445ba1c5d218668b6164ec37e091cd9b2964868f676433974ea31e` — matches |
| v4 private file SHA-256 | `54d12652e982806b262412f764b2e4b121bef0df6591db9260575efcefd49a30` |
| v4 public file SHA-256 | `ae392980be08735b2f0bea318d98c5fca9270eb2977073c175b44085854dba33` |
| public report self-hash | `9addfc52f4aa726b19a05ffe03e8d19dd1efaa921231c17af1e8724a43f54ab5` — matches |
| official v4 pinned rebuild | PASS, zero findings |
| official v4 live drift | PASS at audit time; DB extract `713250e8ed014333c6eff10a4df373fc56719862d8f36f36d0ae572177736a87` |
| v4 unit tests | 6/6 PASS |
| fresh verifier | ESLint clean; standalone TypeScript check PASS |

The fresh verifier is `verify-fresh-audit.ts`. It does not import the v4
analyzer or its `NearDuplicateIndex`. It independently implements stable
hashing, duplicate features, the 200-posting query policy, an uncapped
sensitivity index, binomial tails, queue search, and aggregate-only rights and
lineage checks. It reads only the frozen private snapshots and emits no raw
passage, academy identifier, or database identifier.

## Confirmed numerical findings

| Quantity | v4 claim | Fresh result | Verdict |
|---|---:|---:|---|
| Strict central-long blank pool | 59 | 59 | confirmed |
| Current committed pool after automatic/history gates | 154 | 154 | confirmed |
| Current committed core English groups | 290 | 290 | confirmed |
| Current committed automatic-clean groups | 248 | 248 | confirmed |
| Those 248 with exact/near v3 overlap | 248 | 248 | confirmed; net new 0 |
| Net M1 rows | 86 | 86 | confirmed |
| Net ExtractionItem rows | 19 | 19 | confirmed |
| Net official-type-tagged linked-blank ExtractionItem rows | 3 | 3 | confirmed under the code's weak provenance definition |
| Blank queue gap | 203 | `262 - 59 = 203` | confirmed |
| Optimistic disjoint DB queue gap | 819 | `158 + 815 - 154 = 819` | confirmed |

The separate blank strata also partition exactly: 402 source/history-clean
rows = 59 central-long + 300 short (120–149 words) + 43 long but local/no-pivot.
The raw blank PASS target of 66 is therefore impossible from the 59-row strict
frame even under a hypothetical 100% pass rate.

The queue math was rebuilt from the frozen conservative rates rather than read
back from the report:

- blank: target 66 at `p=0.2969581120673508` gives minimum queue 262;
- DB dev: target 23 at `p=0.19330842112059338` gives minimum queue 158;
- DB holdout: target 29 at `p=0.04685482691460076` gives minimum queue 815;
- with only 154 DB rows, the minimum rate needed to reach 29 with 95%
  assurance is `0.24067893214673702`, consistent with the reported
  `0.24067893214673655`.

The 819 figure is correctly labeled **optimistic**. It is the shortage before
cross-panel/document attrition, not the sum of the v3 selector's realized
per-panel shortfalls (73 + 815). Gross acquisition must exceed 819 whenever
near duplicates or source-document separation remove rows.

## Exact/near leakage audit

The independent 200-posting implementation exactly reproduced every family
total and overlap code aggregate. An uncapped index was then applied to every
row that the capped index considered non-overlapping.

- hidden v3 matches caused by the `posting.size > 200` optimization: **0**;
- hidden earlier/intra-family matches caused by that optimization: **0**;
- hidden blank-history matches among the 402 retained rows: **0**;
- hidden committed-history matches among the 154 retained rows: **0**.

Thus there is no observed cap-induced leakage in this snapshot.

One reporting label is inaccurate. The M1 `crossSourceExactOrNearOverlap=4`
bucket consists of **four within-M1 near duplicates**, not overlaps with a
higher-priority family. ExtractionItem's 10 and ExtractionResult's 26 are
genuine earlier-family overlaps. The net M1 count of 86 is still correct, but
the report table column should say “higher-priority or earlier within-family
near overlap,” or expose those two components separately.

## Finding F1 — `asOf` is a label, not a temporal database boundary

Severity: **major / blocking for point-in-time reproducibility**

`buildPinnedInventoryV4(asOf)` validates and serializes the timestamp, but
`databaseRecords()` issues unrestricted current-state queries. There is no
`createdAt <= asOf` predicate, temporal database snapshot, transaction snapshot
identifier, or archived database export. The verifier rebuilds against current
state while passing the same unused timestamp.

An adversarial read-only dry run made this observable:

```powershell
npx tsx experiments/question-quality-20260715/corpus/v4-supply/build-inventory-v4.ts `
  --as-of 2000-01-01T00:00:00Z
```

It still returned current-data results 59, 154, 203, and 819. Only the semantic
snapshot/report hashes changed because the supplied timestamp itself is hashed.
Consequently:

- the official live-drift PASS proves equality to the database **now**;
- it does not prove that the rows existed, had the same statuses, or had the
  same prior-use counts at the claimed `asOf` instant;
- updates/deletions cannot be reconstructed from these queries.

Required repair: either rename the field to an honest `capturedAt` and bind it
to a database export/transaction-snapshot hash, or query a genuinely temporal
source that can apply the cutoff to passages, drafts, questions, jobs, source
materials, and deletions consistently. A simple cutoff on only one table is not
sufficient.

## Finding F2 — advertised input hash is not dependency-closed

Severity: **major / blocking for archival code provenance**

`computeV4CodeHash()` hashes only the five `.ts` files directly inside
`corpus/v4-supply`. The analyzer/builder imports selector, comparison, queue,
and DB-extraction logic from outside that directory. At audit time the
following dependencies were untracked, so the recorded Git SHA cannot anchor
their contents either:

| Unpinned dependency | Current SHA-256 |
|---|---|
| `corpus/selector-core.ts` | `a58a86533a06f17946e6abbbb985e9cc51caddcecfd83c5b810251c0f2104c35` |
| `corpus/v2/history-index.ts` | `1ce5b579a58b5b15ca7cc4dbc82594b5f9a65fabc238f7acde4400d9b21d273b` |
| `corpus/v2/selector-core-v2.ts` | `fb6cc4408645b1b963f0c143408b3e0766501b466d958c1ed449c977c67b1d84` |
| `corpus/v3/queue-sizing.ts` | `248b14a923157d55bd77f12a6a91d470bbc2a12df87f9043078fc339d25430c7` |
| `corpus/v3/snapshot-v3.ts` | `4d3e37ed3a9fd4227801c39dc9670e9a291dc16682924464da94076c120441a9` |

The private semantic snapshot still protects the serialized rows against
tampering, and the fresh implementation reproduced the present aggregates.
The defect is narrower but important: future researchers cannot prove which
complete algorithm produced the snapshot from the advertised `codeHash` plus
Git SHA.

Required repair: generate a dependency manifest that hashes every transitive
research-code input (including the Prisma schema and local-catalog discovery
manifest), fail if any imported file is absent, and record dirty/untracked state
explicitly. The immutable v3 semantic snapshot hash should remain an input,
but it is not a substitute for pinning the v4 algorithm that interprets it.

## Finding F3 — provenance is weaker than “official-traceable”

Severity: **moderate wording/provenance defect; it strengthens the no-supply
conclusion**

The implementation sets `officialTraceable=true` solely when `SourceMaterial`
has type `EXAM`, `MOCK`, or `SUNEUNG` and English/null subject. It does not
require `sourceRef`, archived original file, publisher/exam identity, or a
rights record.

Fresh aggregate checks found:

| Net family | Net | Code-level `officialTraceable` | `sourceRef` or original file present |
|---|---:|---:|---:|
| M1 | 86 | 1 | 0 |
| ExtractionItem | 19 | 16 | 0 |
| ExtractionResult | 2 | 2 | 0 |
| Linked-blank ExtractionItem subset | 3 | 3 | 0 |

All 19 ExtractionItem rows are DRAFT. The three linked-blank rows are therefore
better described as **official-type-tagged DRAFT rows with linked blank-looking
stems**, not official-traceable passages. Zero of the three has a recorded
source reference, archived original file, or rights clearance in the frozen
inventory.

The rights conclusion itself is correct. `SourceMaterial` has metadata such as
publisher, `sourceRef`, and `originalFileUrl`, but no license/permission/rights
clearance field. The incremental rights aggregates reproduce exactly:

- M1: 86 `CUSTOMER_UPLOAD_RIGHTS_NOT_RECORDED`;
- ExtractionItem: 14 customer-upload rights not recorded, 5 official-exam
  provenance with license not recorded;
- ExtractionResult: 2 customer-upload rights not recorded.

Additional lineage context should be exposed: 73/86 net M1 rows carry a
saved/promoted flag (71 COMMITTED, 1 REVIEWED, 1 DRAFT). This does not make them
eligible—saved state is neither rights clearance nor membership in the current
zero-prior canonical Passage frame—but it prevents readers from mistakenly
interpreting all 86 as merely unsaved raw drafts.

## DB committed-state interpretation

The official read-only verifier observed 345 normalized zero-prior committed
groups, of which 290 are core English and 248 pass automatic cleanliness.
Every one of those 248 is exact/near antecedent to the immutable v3 universe,
so current committed net-new supply is zero. Separately, applying the v3
history gates to the current committed frame yields 154 eligible groups, the
same number frozen by v3.

These two facts are not contradictory:

- `248 -> 0 net new` asks whether v4 discovered committed supply that v3 did
  not already know;
- `154 current eligible` asks how much of the already-known committed frame
  survives automatic and antecedent-history gates for queue sizing.

The v4 helper does not independently preserve the v3 historical-ID alias gate;
it uses text exact/near history. That omission has no observed numerical effect
here because the result is still 154, but a future inventory should carry the
canonical passage IDs privately and reapply both ID and text exposure gates.

## Estimand audit of alternatives A/B/C

### V4-A — conditional preservation, not an unconditional guarantee

V4-A is the only alternative that preserves the nominal v3 source gates,
targets, and DB/repo separation. The 203 and 819 figures are valid net minima.
However, transfer of the frozen 19/45, 10/30, and 4/30 pass-rate evidence also
requires the acquired sources to be exchangeable with the old strata. A new
publisher, year mix, acquisition channel, restoration method, or rights screen
can shift pass rates even when the textual gate name is unchanged.

Therefore “preserves the v3 estimand” is conditional on a preregistered source
frame and calibration argument. Acquisition must record document-level rights
and provenance before deduplication, report gross-to-net attrition, and include
rate sensitivity or new non-overlapping pilot evidence if the source mechanism
changes.

### V4-B — finite-frame census, not v3 certification

V4-B changes the question from “with 95% assurance, can the queue deliver the
preregistered PASS targets?” to “what is the adjudicated yield/prevalence in
the current finite 59-row and 154-row frames?” It cannot certify 66 strict
blank PASS rows because only 59 candidates exist.

For a complete census, the PASS count/proportion is exact for that frozen
finite frame; a binomial Clopper–Pearson interval is not sampling uncertainty
for the frame itself. If an interval is reported, the report must explicitly
define a superpopulation/generalization model. Rater/adjudication uncertainty
is a separate measurement-error problem and should not be mislabeled as
binomial sampling error.

### V4-C — a new selected extraction population

V4-C changes both the source population and the selection mechanism. It can be
defensible only after rights clearance, provenance review, a frozen definition
of `DB_EXTRACT_REVIEWED`, and disjoint discovery/validation sets. Current usable
count is zero—not three—because the three linked-blank rows are DRAFT,
rights-unverified, and lack the recorded source evidence needed for audit.
Selection into review/rights clearance must also be described, or the pilot
rate will estimate a curator-selected subset rather than the extraction frame.

## Required disposition

1. Do not initialize a generation manifest or spend model/API budget from this
   v4 artifact.
2. Keep the numerical conclusion: exact v3 supply is unavailable locally.
3. Repair temporal semantics and dependency-closed hashing before calling a
   future inventory immutable.
4. Rename the provenance and cross-overlap fields so their evidence strength
   is not overstated.
5. Choose V4-A if the original certification claim is mandatory. V4-B may be
   executed immediately only as a separately named census-yield study. V4-C is
   a corpus-development program, not a shortcut into the v3 campaign.

