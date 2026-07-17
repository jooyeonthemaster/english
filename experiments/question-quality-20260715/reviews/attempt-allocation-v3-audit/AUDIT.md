# Attempt allocation v3 fresh-eyes adversarial audit

Audit date: 2026-07-15 KST

Scope: `attempt-allocation-v3.draft.json`, `ATTEMPT-ALLOCATION-V3.md`, `PROTOCOL.md`, `RUBRIC.md`, `TYPE-AUDIT-MATRIX.md`, provider probe/Phase A evidence, and harness v3 audit

External API/model/browser calls: **0**

Database reads/writes and canonical ledger creation: **0**

Production edits by this audit: **0**

## Verdict

- **Arithmetic envelope after corrections: PASS.** The five proposed phase envelopes total 990 candidate slots, the safety allocation is 10, logical assignments total 426, and A3 contains 60 matched passages per type with 30 per type-plan.
- **Statistical preregistration: FAIL / BLOCKED.** The primary estimand, alpha direction/allocation, multiplicity family, winner threshold, MDE and paired risk-difference decision rule are absent. `n=60` is arithmetically true but not generically “adequately powered.”
- **Production parity: FAIL / BLOCKED.** The proposed per-assignment 1/2/3 candidate ceilings truncate the current STANDARD, PREMIUM and PREMIUM-grammar-ladder policies.
- **1,000-cap enforcement: FAIL / BLOCKED.** Phase A can see SDK retries and attest intended cardinality, but the harness adapter, parser disposition, semantic child scopes, bypass audit, in-flight overflow bound, and canonical registry do not exist. The 10-slot margin by itself is not a proof.
- **API readiness: FAIL / ZERO CALLS AUTHORIZED.** `attempt-allocation-v3.draft.json` now records operational authorization `0` and verifies only as a fail-closed draft.

## Findings

| ID | Severity | Finding | Audit action |
|---|---|---|---|
| C1 | critical | 1/2/3 candidate ceilings are incompatible with the current production call graph, so A1/A3/A4 cannot claim current-policy parity | parity claims corrected; ceilings marked invalid placeholders |
| C2 | critical | 990+10 arithmetic does not bound unexpected multi-output or concurrent in-flight overflow | safety limitation made explicit; execution remains blocked |
| C3 | critical | no per-stage physical-call/token/USD caps or campaign USD cap; candidate slots omit answer-only/solver/evaluator cost | unresolved values made hard preregistration holds |
| C4 | critical | provider Phase A is not connected to the harness/parser and alternate-call bypass is not closed | readiness remains FAIL despite Phase A tests |
| H1 | high | A2’s claimed balanced-incomplete design was mathematically impossible | changed to complete blocks with identical 80-assignment arithmetic |
| H2 | high | A2 winner rule and A3 multiplicity/primary decision rule are qualitative and outcome-flexible | winner and confirmatory status marked unresolved |
| H3 | high | A3 `n=60` language lacked exact power/MDE and fatal-zero sensitivity | dependency-free exact calculations added |
| H4 | high | A1/A4 touched all 25 types but could be read as broad quality/route parity evidence; A4’s three-way “balanced Latin” label was impossible over 50 cells | limited to smoke/sentinel; A4 corrected to 17/17/16 near-balance |
| H5 | high | phase queues, policy order, corpus disjointness, model/provider drift and incomplete-pair behavior were not frozen | fixed-queue/drift/no-top-up contracts added as blockers |
| M1 | medium | RUBRIC content is strong but allocation endpoints have no frozen derivation from reviewer JSON and no agreement/adjudication analysis contract | retain rubric; require versioned endpoint derivation before A2/A3 |

## C1 — Physical slot and logical assignment are not interchangeable

The declared unit—one pre-network physical opportunity to emit one full question—is sound. The proposed ceiling is not.

Evidence from the current source and zero-network probe:

- `question-generation-llm.ts` defaults its application retry loop to `GEMINI_QUESTION_MAX_RETRIES=2`, hence up to three outer attempts. Its `generateObject` call omits AI SDK `maxRetries`.
- The provider probe reproduces three distinct custom-fetch invocations for one SDK call when `maxRetries` is omitted. It also proves that malformed JSON repair is a separate physical request and that ALS needs explicit child-purpose scopes.
- The ordinary structured path can therefore make up to nine physical candidate-capable requests before considering PREMIUM JSON repair/fallback. The probe’s path analysis bounds malformed/fallback variants at 12, 18 or 21 physical calls over the outer loop depending on the branch.
- `runQuestionGenerationWithEmptyRetry` can run four STANDARD strict passes for ordinary types, four for STANDARD KILLER grammar, and ten for single KILLER blank inference, followed by rescue/relaxed/salvage branches. Candidate repair is another full-candidate operation.
- PREMIUM grammar `fireOnce` omits SDK `maxRetries`; one logical ladder call can hide three HTTP attempts. `callLadderModel` can invoke up to three `fireOnce` calls on parse-then-reasoning fallback paths. The ladder can perform initial split generation, two hard regenerations, per-cycle full-candidate repairs, and then a legacy fallback.
- The grammar solver is zero candidate slots but a separately retried, billable evaluation call.

Consequently:

- STANDARD ceiling 1 or 2, and PREMIUM ceiling 2 or 3, are not high-tail production ceilings.
- Applying the same ceiling to CURRENT and WINNER makes a fair comparison of two **capped policies** inside a plan, but it does not restore production parity.
- Calling the same top-level production function is insufficient if the research controller denies calls that production would make.
- A3 ITT can validly include cap exhaustion as `no_output`, but the estimand must then be “quality under this candidate-attempt budget,” not current production quality.

No phase should be opened until the team chooses one of two honest designs:

1. preserve the full current call graph and allocate a proven worst-case envelope, likely with fewer assignments; or
2. freeze a capped production-core policy and remove all uncapped production-parity claims.

Expected/average calls per final cannot replace a pre-network maximum. A micro-pilot may estimate yield and cost, but its own slots/cost and decision rule must be preregistered; it cannot retroactively justify already viewed cells.

## C2 — 990 + 10 is necessary arithmetic, not an overflow proof

The draft now verifies:

```text
A1 100 + A2 200 + A3 600 + A4 75 + A5 15 = 990
990 + permanent safety 10 = 1,000
operational authorization = 0
```

The harness audit independently found that an unexpected output overflow is detected only after the response exists. Halting later calls does not undo an extra emitted candidate. Multiple already in-flight calls can compound this.

Provider Phase A improves the boundary: it checks wire `n`, requires a trusted semantic-cardinality attestation, and leases before fetch. It explicitly says that `n=1` and a root JSON object do not prove one semantic question, and that Phase B must add allow-listed parser contracts and post-SDK disposition hooks.

The safety margin becomes a real cap argument only if all of the following are proven before network:

- every experiment candidate scope has exactly-one semantic output cardinality or a finite, reserved maximum;
- extra questions cannot be hidden in a container/fallback parser contract;
- every SDK retry/repair/fallback child request crosses the same lease boundary;
- concurrent in-flight excess is structurally impossible or bounded by at most the retained margin;
- the canonical registry has no phase that can allocate the ten safety slots.

No finite margin of ten protects against an unbounded/misdeclared container. The correct current state is authorization zero, not “990 safe calls.”

## H1/H2 — A2 design and winner selection

The original schedule said that in each type-plan block there were ten passages, two of four profiles per passage, and five appearances per profile. If interpreted as a balanced incomplete block design, its parameters were:

```text
v=4, b=10, k=2, r=5
lambda = r(k-1)/(v-1) = 5/3
```

Because lambda is not an integer, pair concurrence cannot be balanced. Profile effects would be partially confounded with which passages happened to receive each profile.

The corrected draft uses five plan-specific passages per type and runs all four profiles in each passage-plan block:

```text
2 types x 2 plans x 5 passages x 4 profiles = 80 assignments
```

This is a complete-block screening design with direct within-passage profile comparisons and unchanged slot arithmetic. It still has only five blocks per type-plan and ten per type-profile, so winner’s curse is substantial. Independent A3 is essential.

The remaining winner ambiguity is execution-blocking:

- fatal exclusion threshold and fatal family;
- primary screening outcome and lexicographic order;
- minimum quality improvement and ship-ready noninferiority margin;
- cost/latency Pareto threshold;
- multiplicity handling across four profiles and two focus types;
- tie/inconclusive rule;
- whether WINNER is one conceptual profile per type or a four-cell type-plan mapping.

The corrected draft deliberately leaves that unit null. A conceptual type winner uses less selection freedom but can conceal plan reversal; a type-plan mapping can honor model interactions but needs a larger multiplicity family and makes A3's pooled effect an effect of a composite map. The choice must be made before results, and the numeric rule remains null, so A2 is not executable.

## H3 — A3 sample count is correct; its power claim was not

For each focus type, 60 holdout passages each receive CURRENT and WINNER. Thus there are 60 matched pairs per type and 30 matched pairs per type-plan. There are not 120 independent observations per policy effect. The pooled estimand, if retained, is the average effect in a deliberately fixed 50/50 STANDARD/PREMIUM mixture; it is not automatically the effect for either plan or the production traffic mix.

The exact McNemar power calculation enumerates total discordances and the conditional exact binomial test. Reproduction:

```powershell
node experiments/question-quality-20260715/reviews/attempt-allocation-v3-audit/power-sensitivity.mjs
```

Selected results for two-sided tests:

| n pairs | discordant probability | 80% power MDE at α=.05 | MDE at α=.025 | power for 10%p at α=.05 |
|---:|---:|---:|---:|---:|
| 60 | 20% | 16.2%p | 17.2%p | 30.8% |
| 60 | 30% | 20.1%p | 21.7%p | 22.1% |
| 60 | 40% | 23.5%p | 25.3%p | 16.9% |
| 30 | 30% | 27.4%p | 29.3%p | 9.2% |
| 30 | 40% | 32.1%p | 34.1%p | 8.1% |

At α=.025, n=60 power for a 10%p improvement is only 22.4%, 14.2%, or 11.0% at discordance 20%, 30%, or 40%. Plan-specific n=30 is plainly exploratory. If `beautiful` is rare and both policies usually fail it, many concordant failures further reduce information.

Fatal sensitivity is also limited:

| n | zero-event one-sided exact 95% upper bound | detect ≥1 if true rate 1% | 2% | 5% |
|---:|---:|---:|---:|---:|
| 30 | 9.5% | 26.0% | 45.5% | 78.5% |
| 60 | 4.9% | 45.3% | 70.2% | 95.4% |

Zero observed fatal items is an appropriate hard launch gate, but it does not prove a zero population rate. Any confirmatory claim must specify the smallest effect worth detecting, the expected discordance, and what “inconclusive” means. If the scientific target is a 10%p improvement, 60 pairs is underpowered under these conventional exact tests.

The draft also names three “primary” binary outcomes for two types. That is six related hypotheses before plan interactions. McNemar p-values alone do not define a winner or noninferiority; paired risk-difference estimates and confidence intervals are needed. The primary estimand, fixed-sequence/closed-testing or alpha allocation, one- vs two-sided direction, and fatal/ship-ready joint gate must be frozen before A3.

## Attrition and no-output

The corrected contract distinguishes outcomes from missing research data:

- after an authorized candidate attempt, timeout, parse failure, cap exhaustion and policy no-output are assignment-level ITT failures for ship-ready/beautiful;
- no-output is not a fatal shipment, so fatal-shipment must always be interpreted jointly with ship-ready to prevent a silent policy from appearing safe;
- a missing corpus row, missing reviewer/adjudication, missing immutable provenance, or a pair never started after a safety stop is not an observed failure—it makes the phase incomplete;
- incomplete cells are not replaced or topped up, and a partly drifted phase is not combined with a later model version.

## A1/A4 all-type and route claims

The active audit matrix does enumerate 25 English types and provides materially useful type-specific validity/craft contracts. The allocation does not provide 25 type-specific quality samples:

- A1 gives one KILLER assignment per type-plan. It is a defect-discovery sentinel.
- A4 gives one route assignment per type-plan. Across 50 cells, three difficulties can only be near-balanced 17/17/16; each type has two cells and cannot cover all three difficulties.
- One successful route cell can reveal auth/billing/persistence/render/scoring breakage but cannot establish parity, quality rate, or difficulty effect.
- Candidate ceiling intervention further prevents uncapped production-policy parity.

The old “balanced Latin” language was removed. A4 is now a route smoke test after winner implementation and deployment freeze.

## Cost cap and phase ordering

Candidate slots do not cap spending. Answer-only design, grammar solver, JSON repair, fallback, evaluator calls and billing reconciliation can all be candidate-slot zero while consuming calls and tokens. Environment-configurable retry values also make an unfrozen call bound unstable.

Before any phase, the registry must freeze:

- requested/effective/served model and provider allow-list;
- prompt/schema/gate/ladder/policy and runner hashes;
- input/output token ceiling per stage;
- physical provider-call cap per batch and phase;
- conservative cost reservation based on a frozen endpoint-price snapshot;
- batch, phase and campaign USD caps;
- deadline and unknown-cost reconciliation behavior.

The corrected order is prerequisites → A1 → A2 → winner-or-stop → A5 → A3 → implementation freeze → A4. A5 is deliberately before A3; if it causes a policy change, the same A3 holdout cannot be opened for the amended policy.

## Fixed queues, leakage and drift

Every phase still lacks a queue hash and is therefore blocked. A valid manifest must freeze corpus row, normalized/source hash, near-duplicate cluster, stratum, total execution order and within-block profile/policy order. A2/A3/A5 and historical experiment content must be mutually disjoint under exact and near-duplicate checks.

A3 should balance CURRENT/WINNER order 15/15 within each 30-pair type-plan stratum and execute each pair adjacently. Requested, effective and served model plus actual upstream provider must match the frozen allow-list. Alias/provider drift invalidates the unfinished phase; remaining rows may not be continued later and pooled as if exchangeable.

## RUBRIC v0.2 audit

The rubric and 25-type matrix correctly separate non-negotiable validity from craft, address selection/closed/open/correction families, and add necessary type-specific evidence. They are suitable source documents, not yet an executable endpoint contract.

Before A2/A3, freeze a derivation version that maps two blind reviews plus adjudication to:

- `fatal_shipment_per_assignment`;
- `ship_ready_per_assignment`;
- `beautiful_per_assignment`;
- missing-review/incomplete status;
- output-conditional auxiliary metrics.

The review packet must carry rubric/type-matrix hashes, reviewer role, blind packet/order hash, independent answer set, type-specific fields, and adjudication provenance. Report raw agreement and adjudication rate for V gates and beautiful status; a single adjudicated label without disagreement telemetry hides rubric instability. These are measurement prerequisites, not reasons to weaken V1–V5.

## Files changed by this audit

- `attempt-allocation-v3.draft.json`: schema v2 fail-closed state, zero authorization, corrected A2 blocks, corrected coverage language, explicit unresolved caps/estimands/hashes.
- `ATTEMPT-ALLOCATION-V3.md`: call-graph contradiction, power/sensitivity, queue/drift/cost/order/safety corrections.
- `verify-attempt-allocation-v3.mjs`: verifies arithmetic **and** that the draft remains non-executable; it prints `EXECUTION_READINESS=FAIL_BLOCKED`.
- `reviews/attempt-allocation-v3-audit/power-sensitivity.mjs`: dependency-free exact sensitivity reproduction.

No production source, PROTOCOL, RUBRIC, database or canonical ledger was changed by this audit.

## Verification

```text
node verify-attempt-allocation-v3.mjs
PASS non-executable draft arithmetic/fail-closed invariants; EXECUTION_READINESS=FAIL_BLOCKED

node --check reviews/attempt-allocation-v3-audit/power-sensitivity.mjs
PASS (exit 0)

node reviews/attempt-allocation-v3-audit/power-sensitivity.mjs
PASS (deterministic tables emitted; no I/O)

independent Python stdlib binomial enumeration cross-check
n=60, delta=.10, q=.20/.30/.40, alpha=.05:
0.307534418857 / 0.220846435888 / 0.169005597491
zero-fatal one-sided 95% upper bound: 0.04870291331009746

ESLint for both .mjs files: exit 0
git diff --no-index --check for all five audit-owned files: PASS
```

## Exact remaining gates for a readiness PASS

1. Decide uncapped production parity vs an explicitly capped policy, then replace every invalid placeholder ceiling with a call-graph-compatible value and estimand.
2. Complete provider Phase B: harness adapter, immutable provenance, all child scopes, parser/cardinality/hash disposition, clone drain/crash recovery, and bypass audit.
3. Certify corpus v3 and freeze disjoint phase queues, strata, execution order and hashes.
4. Freeze A2 numeric winner/stop rule and prohibit post-outcome profile synthesis.
5. Freeze A3 primary estimand, paired effect/CI, alpha direction, multiplicity, MDE, power assumption, noninferiority/Pareto thresholds and inconclusive rule.
6. Freeze endpoint prices, token ceilings, physical-call caps and batch/phase/campaign USD caps.
7. Prove that semantic output cardinality and concurrent in-flight behavior make the permanent ten-slot margin sufficient—or retain a larger mathematically justified margin and recompute the allocation.
8. Obtain a new independent audit PASS, then and only then initialize the canonical registry and explicitly authorize the first phase.

Until all eight gates pass, the correct usage counter remains **0/1000**.
