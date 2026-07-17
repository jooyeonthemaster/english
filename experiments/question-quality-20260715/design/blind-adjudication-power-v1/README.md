# Blind adjudication and sequential power design v1

Status: **DESIGN-ONLY / API CANDIDATES 0 / NO EXECUTION AUTHORIZATION**

This artifact turns “beautiful questions” into a reviewable outcome without
pretending that aesthetics can rescue an invalid item. It also states exactly
what can and cannot be learned under the global limit of 1,000 newly generated
full-question candidates.

## Main decision

The review has two non-compensatory layers:

1. **Validity/fatal layer.** A defensible answer set, grammatical surface,
   source/surface/scoring synchronization, factual explanation, usable render,
   and absence of answer leakage are mandatory. One confirmed fatal defect is
   an `F`; craft scores are then descriptive only.
2. **Craft/aesthetic layer.** Only fatal-free items are scored for pedagogical
   point value, evidence-path economy, purposeful visible elements, distractor
   competitiveness, shortcut resistance, difficulty calibration, naturalness,
   and explanation economy. `A` means “beautiful,” not merely clean.

Grammar and blank inference have additional operational modules. Grammar
requires a marked-site diagnosis for every underline, a bounded governing rule,
an exact correction/source round-trip, point-worthiness, and an accurate concise
explanation. Blank inference requires all five full-sentence seam insertions to
be grammatical, a unique answer proposition, passage-grounded semantic near
misses, and non-duplicated primary distractor intents.

## Candidate budget and claim boundary

The maximum schedule is fixed at 998 candidate opportunities:

| Stage                             | Candidate opportunities | Interpretation                                                                |
| --------------------------------- | ----------------------: | ----------------------------------------------------------------------------- |
| S0 connectivity run-in            |                       2 | one Standard and one Premium wire check; excluded from every quality analysis |
| S0 focus BASIC sentinels          |                       4 | grammar/blank x Standard/Premium; defect discovery only                       |
| S1 mechanism screen               |                     180 | 8 frozen focus profiles; safety/binding screen only                           |
| S2 focus confirmation, first look |                     480 | 60 paired passage clusters per type x plan                                    |
| S3 all-type sentinels             |                      92 | 23 non-focus types x 4; defect discovery only                                 |
| S4 focus extension                |                     240 | +30 paired clusters per type x plan, only under frozen continuation rules     |
| Locked unused                     |                       2 | not a post-hoc top-up pool                                                    |

The two connectivity candidates use the disposable original run-in source
`corpus/original-connectivity-pilot-v1` (`OCVP-B01`) and are an operational run-in. Their model outputs,
passage clusters, latency, and success/failure cannot be reused in S1 arm
selection, any quality estimate, calibration, or confirmation. Reuse would turn
an unblinded connectivity check into a post-hoc analytic observation.

The four focus BASIC sentinels and the 23-type sentinel block ensure that BASIC
is not silently omitted. Each focus type gets one BASIC row per plan; each
non-focus type gets `STANDARD/PREMIUM x BASIC/KILLER`. These rows can reveal a
defect but cannot estimate a difficulty effect or certify BASIC quality.

The 180-row screen reproduces the source-aware profile arithmetic: grammar
`4 x 2 plans x 2 difficulties x 6 = 96`; blank Standard contributes 48 and
Premium 36 because `B1` is byte-identical to control on Premium. Six clusters
per cell cannot rank arms statistically.

Its exact-wire evidence reaches only the production core request-construction
root under a direct, single-dispatch, single-candidate topology. It is not
full-production-policy parity and does not reproduce the Premium grammar
ladder or production retry, repair, fallback, solver, and other
candidate-producing branches. A separate versioned topology audit must bind
those branches and their worst-case candidate/cost multiplier before any parity
claim or budget-preserving quality inference is allowed.

For confirmation, control and the frozen challenger are paired on the same
passage. Passages are not reused across plans or focus types. The first look has
60 independent clusters in each of the four type-by-plan cells; the maximum is 90. Each plan cell is balanced 1:1 between INTERMEDIATE and KILLER.

The primary craft endpoint is difficulty-aware: `B-or-A` for INTERMEDIATE and
`A` for KILLER. It is tested across both plans within each focus type. Plan-level
effects remain mandatory harm diagnostics but are not separately powered
superiority claims. At the final look, the pooled sample is 180 independent
passage pairs per focus type.

This allocation assumes exactly one full-question candidate opportunity per
assignment. If the admitted production topology can create retries, repair
candidates, ladder candidates, or fallback candidates, its worst-case candidate
multiplier must be reserved before execution. A multiplier above one makes this
992-row schedule infeasible. The study must then narrow its claim; it must not
call a reduced sample “fully powered production parity.”

## Power and sequential rule

The two focus-type craft hypotheses form one family. Union-bound alpha spending
is intentionally simple and auditable: per type, one-sided alpha is `0.005` at
the 120-pair interim look and `0.020` at the 180-pair final look. Across two
types and both looks, total familywise alpha is at most `0.05`.

Under paired discordance probabilities `(challenger-only success,
control-only success) = (0.25, 0.10)`, final exact McNemar power is about 0.906;
for `(0.30, 0.10)` it is about 0.988. The interim look has about 0.544 and 0.809
power respectively. These are explicit design alternatives, not assumed future
results.

At the interim look there is no early release. A type continues only when:

- no challenger fatal has been confirmed;
- every plan cell can still reach at least 86 evaluable items within its fixed
  remaining 30 assignments;
- the preregistered conditional power is at least 0.20 or interim efficacy has
  crossed alpha 0.005; and
- the economic margin is not already mathematically unattainable.

Unused extension rows are not transferred to another type or plan. At the final
look, each type-by-plan cell needs at least 86 evaluable candidates and zero
confirmed challenger fatals. With four Bonferroni cells, zero failures among 86
gives a simultaneous one-sided 95% upper fatal-rate bound of about 4.968%; 90
gives about 4.752%. This does **not** prove a true error probability of zero; it
records zero observed errors and states the remaining uncertainty honestly.

## Review flow

Each candidate is evaluated independently by two calibrated reviewers:

1. solve the exact student surface while model, plan, profile, key, explanation,
   cost, validator result, and generator metadata are hidden;
2. record answer set, `NO_ANSWER`/`MULTIPLE`, confidence, and shortcut route;
3. reveal the source binding, proposed key, explanation, and scoring contract;
4. complete fatal, craft, explanation, and type-specific evidence fields;
5. send every material disagreement to a fresh adjudicator, who first solves
   without seeing either rationale.

Fatal votes are never averaged. An unresolved material disagreement is `F` for
release analysis. Grade averaging is also prohibited; the adjudicated record is
the analysis record, while both original records remain immutable.

Reviewer certification uses a separate 24-item packet: 8 grammar, 8 blank, and
8 non-focus-family items. Every block contains exactly two F, C, B, and A gold
grades, so the global oracle has 6 fatal and 18 nonfatal items. Calibration rows
use `plan=CALIBRATION_NOT_APPLICABLE` and `status=UNASSESSED`; requiring
`certifiedAtReview=true` would be circular. Gold remains
`GOLD_ADJUDICATION_PENDING` until two independent review hashes and a fresh
adjudicator's pre-rationale solve and final-label hashes are bound.

Certification is computed separately for each reviewer against private gold,
never from pair consensus. Every metric carries raw counts and an exact integer
numerator/denominator. Thresholds use cross multiplication on unrounded values;
the four-decimal display is non-operative. Missing, duplicate, malformed, or
internally incoherent records cause `FAIL_INCOMPLETE` with `metrics=null`, and a
zero denominator makes that metric null and fails certification. In addition to
global agreement, AC1, sensitivity, specificity, and F/C/B/A QWK, each block has
its own gates. Grammar-site judgments, all five blank-option diagnostics, and
all seven blank proposition axes—including stance and time—are gold-scored.

The sealed phase-one solve is also a certificate gate, not a decorative audit:
exact agreement with at least one pre-adjudicated `acceptedAnswerSets` entry
must reach `9/10` globally and `7/8` in every block. This allows a genuinely
defensible alternative without allowing hindsight-only fatal/grade evidence to
certify a reviewer who could not solve the student surface. Each private gold
row also binds the expected type, surface hash, relabel-map hash, and sealed
phase-one record hash; cross-item reuse is `FAIL_INCOMPLETE`.

A certificate is per reviewer and family-scoped. Its grammar authority is only
the exact five-marker/one-invalid surface; its non-focus block does not certify
all 23 non-focus types. Ten percent of production review rows remain hidden
duplicates for drift detection. A failed threshold pauses that reviewer and
requires recertification; rows since the last passing checkpoint are re-reviewed.

`RECORD_INVALID` and `ITEM_FINDING` are deliberately distinct. A coherent F
record describing a defective gold item is valid calibration evidence; a
missing field, impossible aggregate, premature certificate, or phase-order
breach invalidates the record itself. Blind answers support labels, inline text,
or a private text reference plus content hash, so constructed responses are not
truncated to an MC-only answer representation.

## Economics and Pareto decision

Every assigned row remains in intention-to-treat denominators. Parse failure,
timeout, budget refusal after randomization, or no candidate is not silently
discarded; it has `shipReady=false`. Every physical call, retry, repair, solver,
fallback, and unknown-after-send reservation belongs to the assignment cost.

Report raw settled USD/assignment, candidate and physical-call counts, parsed
yield, fatal-free yield, ship-ready yield, beautiful yield, and USD per each
yield. An unknown started-call cost is conservatively valued at its reservation
cap. Zero ship-ready output means infinite cost per ship-ready item.

A focus type can advance only if its validity, craft, plan-harm, beauty, and
economic gates all pass. The pooled challenger/control cost-per-primary-success
ratio must have a simultaneous one-sided 97.5% upper bound below 1.25; both plan
point ratios must be finite and at most 1.25; and the challenger must not be
Pareto-dominated on ship-ready yield and cost. More calls are not accepted as a
quality solution merely because the surviving item is good.

## All-type interpretation

The 23 non-focus types each receive four sentinel assignments, one per
plan-by-extreme-difficulty cell (BASIC/KILLER). They use the same common fatal/craft contract plus the
type-specific evidence contract already source-bound in
`all-types-evaluation-rubric-v1`. Four rows can discover a defect; four clean
rows cannot estimate a type rate, compare models, or authorize release.

## Files

- `design.json`: machine-readable estimands, rubric, allocation, alpha, stopping,
  calibration, cost rules, and limitations.
- `review-record.schema.json`: strict JSON Schema for immutable blind-review records.
- `calibration-certificate.schema.json`: per-reviewer family-scoped certificate.
- `calibration-scoring.mjs`: exact rational metrics and global/block gates.
- `strict-json-schema.mjs`: fail-closed evaluator for every schema keyword used here.
- `power-analysis.mjs` / `power-results.json`: deterministic exact calculations.
- `synthetic-fixtures.json`: text-free base records.
- `mutation-fixtures.json`: structural, semantic, and item-finding mutations.
- `AMENDMENT.md`: defect log, decisions, and non-claims for this repair.
- `verify.mjs`: offline verifier and synthetic fixture runner.
- `source-closure.json`: hashes observed for the production and research sources
  used to derive this independent design.
- `MANIFEST.sha256`: artifact seal.

No actual passage, question, option, database identifier, credential, provider
request, model output, or private corpus text is present. All verification is
local. API candidate usage remains **0/1,000**.
