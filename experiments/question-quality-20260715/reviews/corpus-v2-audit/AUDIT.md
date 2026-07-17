# Corpus v2 fresh-eyes adversarial audit

Audit date: 2026-07-15 KST  
Scope: `corpus/v2` selector, manifests, verifier, tests, audit packet/protocol, live SELECT-only exposure evidence  
Constraints observed: no model/API calls, no database writes, no canonical DB changes, no production-code changes

## Verdict

**Overall: FAIL. Do not start the full two-rater semantic audit from the current packet yet. Do not use any row for generation.**

The saved 502-row artifact passes its internal mechanical checks, and its 445 new candidates had zero pre-selection model/question/job exposure under the captured inputs. Those are real strengths. The study frame is nevertheless not audit-ready because queue sizing contradicts the audit protocol, the selector is not reproducible after its own blind packet is created, the official-blank condition is not a hard selector invariant, and the general panels silently abandon the preregistered DB-real stratum.

| Component | Result |
|---|---|
| Saved-manifest hashes, counts, source mapping, pairwise separation | PASS |
| Live exact DB prior-use recomputation for 445 new candidates | PASS |
| Static DB mutation risk | PASS (SELECT-only) |
| Queue sufficiency under the written audit stopping rule | **FAIL** |
| Reproducible historical-exposure snapshot | **FAIL** |
| Official-blank B hard invariant | **FAIL** |
| General 30 repo / 30 DB-real frame or explicit stratum shortfall | **FAIL** |
| Full human semantic audit launch | **HOLD** |

## Checks that passed

- `selector-v2.test.ts`: 10/10 passed.
- `verify-manifest-v2.ts`: passed; 502 rows with panel counts 143 B, 165 G, 53 general-dev replacement, 84 general-holdout replacement, 32/25 retained.
- Corpus-v2 TypeScript and ESLint: passed.
- Independent recomputation of all 502 rows found zero mismatches in content hash, comparison hash, word count/features, public/private projection, repo source text, confidence, reconstruction metadata, or deliberate-error metadata.
- An independent all-pairs comparison evaluated all 125,751 row pairs without the selector's posting-list shortcut and found zero exact, comparison-hash, range, sequential-fragment, five-gram, or long-overlap matches.
- A broader historical scan that considered **every** passage-like long English JSON string, not only whitelisted field names, plus all live prior-used DB passage texts found zero lexical exposure hits among the 445 new candidates at construction time.
- A fresh live SELECT-only DB recomputation scanned 2,734 English/null-subject passages. Nine selected candidates matched ten DB passage rows; stored evidence matched exactly, and all had `Question=0`, AI `Question=0`, and `WorkbenchAiJob=0` across all matching rows. Evidence mismatches: 0; prior-use violations: 0.
- The 445-item blind packet and sealed map are internally exact: 445 unique blind IDs, 445 unique source IDs, packet hash valid, source-manifest byte hash valid, and zero content/map mismatches.
- Static Prisma call inventory is limited to `Passage.findMany`, `Question.groupBy`, `WorkbenchAiJob.groupBy`, and `$disconnect`. Both observed selector dry-runs reported `apiCalls=0` and `databaseWrites=0`.

## Blocking defects

### C1. Reserve sizing has only about a coin-flip chance of reaching the quota

`observedQueueSize` uses `ceil(target / observedPassRate)`. That makes the **expected** number of passes approximately equal to the target; it does not make target attainment likely. Using the selector's own point pass rates and a binomial calculation:

| Queue | Candidates | Required new passes | Expected passes | P(reach quota) |
|---|---:|---:|---:|---:|
| Grammar G | 165 | 60 | 60.29 | 54.8% |
| Blank B | 143 | 60 | 60.38 | 55.7% |
| General dev replacement | 53 | 28 | 28.27 | 58.5% |
| General holdout replacement | 84 | 35 | 35.00 | 54.2% |

`AUDIT-PROTOCOL.md` is stricter: it says not to stop until the quota **plus a preregistered 10% certified reserve** exists. That means 66 G, 66 B, 34 new dev, and 41 new holdout passes. Under the same optimistic point rates, the current queues reach those counts with probabilities only **19.9%, 19.3%, 7.4%, and 11.2%**, respectively.

Even ignoring uncertainty in the estimated pass rates, nominal 95% target-attainment would require about 211 G, 181 B, 77 dev, and 119 holdout candidates for the written quota-plus-10% rule. A defensible design should use a preregistered one-sided lower pass-rate bound or another explicit assurance rule, not these point estimates.

### C2. The selector consumes its own blind audit packet as historical exposure

The saved manifests were written at 02:21:01 KST. The derived 445-item blind packet was written at 02:27:51 under `reviews/corpus-v2/`, outside the only self-output exclusion (`corpus/v2/`). The historical scanner therefore ingests every blind-packet passage on the next run.

Exact before/after dry-run evidence:

| Diagnostic | Saved-input run | After blind packet |
|---|---:|---:|
| historical unique texts | 1,869 | 2,314 |
| forbidden text references | 3,951 | 4,396 |
| historical exact/near exclusions | 59 | 506 |
| eligible after hard gates | 1,650 | 1,203 |

The saved verifier still reports PASS because it checks saved claims; it does not rescan current artifacts or bind the manifest to a historical-index hash, DB as-of time, repo-data hash, selector-code hash, or Git SHA. This is not evidence of pre-selection leakage—the packet is causally downstream—but it makes the zero-exposure claim non-self-describing and makes a nominally identical dry-run select a different corpus.

Derived audit artifacts need explicit lineage. A rerun should recognize an exact packet derived from the frozen manifest rather than treat it as pre-existing experimental exposure, while any unrelated historical artifact must remain blocking. The manifest and verifier also need frozen input fingerprints/as-of metadata.

### C3. “Official blank B” is an observed accident, not a hard invariant

The saved B panel correctly contains 143/143 `originalType=빈칸추론`, high-confidence `reconstructionKind=blank` repo passages. However, `blankFocusSuitable` checks only central-span heuristics, discourse pivot, sentence count, and word count. Original blank type/reconstruction is merely favored in `deterministicOrder`; it is not required.

After C2 removed the saved candidates from the eligible pool, a fresh dry-run still declared the B queue full at 143 but selected only **59 actual 빈칸추론 passages and 84 passages from other original types**. `verify-manifest-v2.ts` would reject that eventual output, but the selector itself reports success and has no negative unit test for a central-span nonblank candidate entering B.

If B means official reconstructed blank passages, enforce that in the pool predicate and test the negative case. If B instead means any central-span passage, rename the panel and remove the contradictory verifier/protocol claim.

### C4. General replacements silently abandon the preregistered origin frame

The v1 general frame targeted 30 repo-official and 30 DB-real passages per split. Retained adjudicated passes are:

- dev: 22 repo + 10 DB;
- holdout: 21 repo + 4 DB.

All 137 v2 replacements are repo-official. A separate reconstruction of the strict DB gates found **0 eligible DB candidates**: 27/230 failed automatic source gates and the remaining 203 lacked `reviewedAt`. Thus a 60-passage final panel can contain at most 10 DB passages in dev and 4 in holdout, rather than 30 each. Yet diagnostics report every general shortfall as zero because only total row count is checked.

This must be an explicit stratum shortfall (20 DB dev, 26 DB holdout), or the study must preregister a changed official-only estimand and state that generalization to real DB passages is unavailable. It must not be hidden by surplus repo candidates.

### M1. The sampling frame is heavily concentrated and has no balancing constraint

Seeded hash ordering is deterministic but not stratified sampling. Among the nominal primary 60:

- G: 60/60 repo, 56/60 in the 120–169 word band, mean 144.9 words;
- B: 60/60 repo, 46/60 in the 120–169 band, 49/60 expository, no practical passage, mean 163.1 words.

Plan assignment can balance arms within this frame, but it cannot recover absent origins or discourse/length cells. The final “first adjudicated passes in queue order” rule also preserves this uncontrolled frame. Add preregistered minimum/maximum stratum constraints or explicitly narrow the inference claim.

### M2. Saved verification is too trusting, although the present bytes happened to pass independent checks

The verifier trusts stored content/comparison hashes, word counts/features, source provenance, and DB/historical zero fields. It does not map repo IDs back to `passages.json`, recompute these fields, or perform a live/snapshotted exposure check. The current artifact passed all of those independent recomputations, but the verifier would not detect future tampering or staleness such as C2.

It also cannot verify the repo hard gates from the manifest alone because confidence, reconstruction kind, deliberate-error flag, and source-review evidence are omitted from public/private rows.

### M3. “Private/sealed” files are not protected from Git staging

`corpus/v2/private/manifest-private.json` is untracked but not ignored and contains full text, including 14 retained DB-real passages. The blind packet and sealed map are also not ignored. A broad `git add` can commit them despite the manifest's “Keep private” label. Add explicit ignore/access rules and commit only redacted public logistics unless deliberate publication is approved.

## Boundary/sample inspection

The source audit is genuinely necessary; automatic `CLEAN_CANDIDATE` is not semantic certification.

- G primary sequence 1, `repo:2008_SN_3000991-q38`, contains “things that can be **brought** by wealth” and “people **craze for** beauty.” At minimum this is disputed/nonstandard source wording and cannot supply five uncontroversial KILLER grammar sites without manual rejection or close review.
- General-dev replacement sequence 53, `repo:ebsi_go3_20181016-q29`, contains the clear punctuation/OCR collision “enjoying **a.400** batting average.” It must be excluded by the written audit rubric.
- Inspected B boundaries (sequences 1, 60, 61, 143), shortest/longest cases, and several topic/discourse representatives were coherent on a fresh read, but this was a boundary sample, not the required two-rater audit. All 143 B rows are restored-blank sources, so their restored prose still requires independent semantic review.

## Required exit criteria before human audit

1. Reconcile the queue-size formula with the quota-plus-10% stopping rule using a preregistered attainment probability and uncertainty-aware pass-rate bound.
2. Make the official-blank requirement a hard selector invariant and add an adversarial nonblank-central-span test.
3. Resolve the general DB-real stratum: obtain reviewed clean DB candidates, or record the exact origin shortfalls and change the estimand/protocol explicitly.
4. Add historical/DB/repo/code input fingerprints and derived-artifact lineage; make the verifier detect current-state drift without treating its own exact audit packet as antecedent exposure.
5. Add deterministic stratum constraints or narrow the population claim.
6. Protect private/sealed artifacts from Git staging.
7. Rebuild the manifest and blind packet under new hashes, rerun the independent verifier/tests, then launch two isolated raters and fresh adjudication.

Until those are done, the current packet may be used only to test audit tooling/rubric mechanics on a sacrificial calibration subset. It should not be the production two-rater corpus audit and must not unlock API generation.
