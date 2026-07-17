# Corpus v4 supply-remediation investigation

Date: 2026-07-15 KST  
Disposition: **The exact v3 estimand remains infeasible from current local and DB supply.**  
Operational manifest: **not created**

## Remediated capture contract

The fresh audit correctly found that the old `asOf` value was merely a hashed
label: no DB query applied it. The replacement artifact makes no historical
claim.

| Field | Remediated value |
|---|---|
| Temporal semantics | `CURRENT_STATE_READ_ONLY_CAPTURE_NOT_HISTORICAL_AS_OF` |
| Historical `asOf` supported | `false` |
| Actual read window | `2026-07-14T18:41:36.168Z` to `2026-07-14T18:41:44.157Z` |
| `capturedAt` | `2026-07-14T18:41:44.157Z` |
| DB extract SHA-256 | `aa692b32fa8aa381d682b7980e5530bb5ec2962e88dac1e50b3d88fc9dc0b86b` |
| DB record-set SHA-256 | `32649133ce7cf2f850bed598175922c527cb5f7eaebde97175eabba236a459d1` |

The CLI rejects caller-supplied `--as-of` and `--captured-at`. The timestamps
are measured around the actual current-state read. This is not a temporal DB
export or a transaction snapshot; the capture window states that limitation.

## Reproducibility and safety

- Immutable v3 anchor:
  `c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13`
- Remediated v4 semantic snapshot:
  `5346734a689d67aaa425daff3b17c3a7b910b741f25e7f8a2e1c79cfac0d01f6`
- Private snapshot file SHA-256:
  `e8d1f510ff96539ebe33fe9c778e03082d1c27c92c7b4333aafc20028180854d`
- Public inventory file SHA-256:
  `e989e508c508ab7c11dc10f1693defab3d4145617a023737f588364e5e3864f7`
- Public report self-hash:
  `0253c1600c5e4b29891a0b296fb901700414490c9e491fd54ba4e2e6192278af`
- Pinned rebuild: PASS; live code/input/DB drift: PASS
- Unit tests: 9/9 PASS; dedicated TypeScript check: PASS
- Model/API/browser calls: 0; DB writes: 0; production edits: 0

The private snapshot contains raw passages and provenance identifiers and is
git-ignored. The public inventory contains aggregates only.

## Dependency-closed provenance

The new dependency-manifest hash is
`ddb235f236839f95bd8cd09fbfe624216ebb348ecdcc83a4d061ab68b507e0a8`.
It covers 150 files:

| Role | Files |
|---|---:|
| Recursive static local-import closure | 16 |
| Dynamically discovered grammar-drill JSON inputs | 126 |
| Declared surveyed catalogs/manifests | 4 |
| Prisma schema | 1 |
| Package resolution (`package.json`, lockfile) | 2 |
| Pinned private v3 input | 1 |

The closure includes the selector, v2 comparison/index, v3 history,
queue-sizing, snapshot/types, Prisma client wrapper, imported script catalogs,
and restoration type dependency. Missing imports, schema, lockfile, v3 anchor,
survey inputs, or dynamically discovered catalog files fail the build.

Dirty state is not hidden. At capture, HEAD was
`467c6d107137a91088d3eba1620ba4036a63d709`; the repository had 1,938 dirty
porcelain records and 1,874 untracked paths. Among dependencies, 87 were dirty
and 86 untracked. Exact dependency paths and per-file status are frozen in the
private manifest. Thus the Git SHA alone is expressly insufficient; exact file
hashes are the content authority for this capture.

## Search scope

The inventory covered every identified local English passage catalog and these
all-academy DB populations:

- committed `Passage` normalized-content groups with Question, AI Question,
  and Workbench counts all zero;
- legacy `ExtractionResult` rows;
- `ExtractionItem` passage bodies joined to original question stems by
  job/group;
- M1 and M2 passage drafts and their source-material/source-match lineage;
- the official English exam repository;
- high-/middle-school script catalogs, restoration/report test corpora, and
  long English leaves in grammar-drill curriculum data.

Korean catalogs are out of English selection scope but their surveyed-file
hashes are retained. Earlier experiment/script JSON/JSONL is already blocking
antecedent history in v3 and was not relabeled as new supply.

## Leakage and lineage after label repair

The old `crossSourceExactOrNearOverlap` label conflated two mechanisms. They
are now separated as `earlierFamilyExactOrNearOverlap` and
`earlierWithinFamilyExactOrNearOverlap`.

| Family | Automatic clean | v3 overlap | Earlier family | Earlier within family | Net incremental |
|---|---:|---:|---:|---:|---:|
| Current committed zero-prior DB | 248 | 248 | 0 | 0 | **0** |
| M1 drafts | 1,908 | 1,818 | 0 | 4 | **86** |
| M2 drafts | 1 | 1 | 0 | 0 | **0** |
| ExtractionItem passages | 582 | 553 | 10 | 0 | **19** |
| Legacy ExtractionResult | 548 | 520 | 26 | 0 | **2** |
| HS/MS script catalogs | 19 | 19 | 0 | 0 | **0** |
| Restoration/report tests | 1 | 0 | 0 | 0 | **1** |
| Grammar-drill long leaves | 5 | 0 | 0 | 0 | **5** |

The previous M1 value of four was within-M1 near duplication, not overlap with
a higher-priority source. Net counts are unchanged.

`officialTraceable` was also too strong. The replacement
`officialTypeTagged` means only EXAM/MOCK/SUNEUNG type plus English/null
subject. Among net rows:

| Family | Net | Official-type-tagged | Tagged with sourceRef or archived original |
|---|---:|---:|---:|
| M1 | 86 | 1 | 0 |
| ExtractionItem | 19 | 16 | 0 |
| ExtractionResult | 2 | 2 | 0 |

All 19 net ExtractionItem rows are DRAFT. Three are both official-type-tagged
and linked to blank-looking stems, but none has a source reference, archived
original, or rights clearance in the frozen record.

Saved/promoted lineage is now explicit rather than implied. Of the 86 net M1
rows, 73 have `SAVED_PASSAGE_LINKED` and 13 have `NONE`; review states remain
71 COMMITTED, 1 REVIEWED, and 14 DRAFT. Saved linkage is neither rights
clearance nor membership in v3's current zero-prior canonical Passage frame.

## Mathematical feasibility

### Exact central-long blank estimand

- Strict current pool: 59
- Raw PASS target: 66, impossible even at hypothetical 100% yield
- Preregistered 95%/95% queue: 262
- Net-new independent candidates required: **203**

The repository has separate strata: 300 passages at 120-149 words and 43 at
150+ words without the central-span/pivot suitability required by v3. Pooling
them changes the estimand and invalidates transfer of the 19/45 rate.

### Exact committed-DB estimand

- Current zero-prior core groups before history gates: 290
- Current eligible groups after automatic and historical gates: 154
- Required disjoint dev+holdout queues: 158 + 815 = 973
- Optimistic net-new committed groups required: **819**

Even holdout alone would require a conservative rate of at least `0.24068` for
154 candidates to yield 29 PASS rows with 95% probability. Frozen holdout-DB
evidence is 4/30 with a one-sided lower bound of `0.04685`.

## Alternatives

### V4-A: acquire new supply and preserve the v3 estimand

Acquire at least 203 net-new, leakage-clean, central-long official blank
passages and, optimistically, 819 net-new committed zero-prior DB groups.
Freeze source authority and rights evidence before selection, then rerun the
same 95%/95% sizing. Transfer of old rates additionally requires a
preregistered exchangeability argument or a new disjoint pilot.

### V4-B: separately named finite-frame census

Audit the full 59-row central-long blank frame and 154-row current committed-DB
frame. This estimates adjudicated yield in those finite frames; it cannot
certify 66 strict blank PASS rows. Sampling intervals require an explicit
superpopulation model; rater uncertainty is a separate measurement problem.

### V4-C: rights-cleared extraction population

After rights and source review, freeze a new `DB_EXTRACT_REVIEWED` population.
Use disjoint discovery and validation sets and size validation from that
population's own lower-bound rate. Current usable count is zero, not three,
because the three linked blank rows are DRAFT and lack the required source and
rights evidence.

## Migration limitation and recommendation

The legacy semantic snapshot
`49d8846262445ba1c5d218668b6164ec37e091cd9b2964868f676433974ea31e`
cannot be converted into a truthful historical snapshot. Past DB state and the
then-complete dependency closure were never captured. The exact old files are
preserved unmodified under ignored `private/legacy-*-asof.json`:

- legacy private file SHA-256:
  `54d12652e982806b262412f764b2e4b121bef0df6591db9260575efcefd49a30`;
- legacy public file SHA-256:
  `ae392980be08735b2f0bea318d98c5fca9270eb2977073c175b44085854dba33`.

They are compatibility evidence only, not historical point-in-time evidence.

If the original v3 diversity claim is mandatory, choose V4-A and keep
generation-budget use paused. V4-B is immediately executable only as a
separately named census-yield study. V4-C is a corpus-development program, not
a shortcut into v3. No generation manifest should be initialized from this
artifact.
