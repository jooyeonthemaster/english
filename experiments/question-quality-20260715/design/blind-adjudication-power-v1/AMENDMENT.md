# Blind-design amendment research note — 2026-07-15

Status: **DESIGN-ONLY / EXECUTION BLOCKED / API, NETWORK, DB, SECRET USE = 0**

## Why this amendment exists

The prior artifact had a circular calibration condition: every `CALIBRATION` review was required to say the reviewer was already certified. Its hand-written verifier checked only selected fields rather than the complete JSON Schema. It also treated a correctly documented fatal gold item as if the review record itself were malformed. Formula denominators, rounding, missingness, answer-text capacity, certificate scope, and block diagnostics were under-specified. The bound all-types rubric still said 12 non-focus rows per type although the frozen allocation is 4 per type, 92 total.

## Decisions sealed here

1. `CALIBRATION` uses `plan=CALIBRATION_NOT_APPLICABLE` and `calibrationStatus.status=UNASSESSED`. Production stages require a family-scoped certificate.
2. `RECORD_INVALID` is reserved for malformed or internally incoherent evidence. `ITEM_FINDING` is a coherent record of an actual item defect. A gold F item is therefore representable and scoreable.
3. Review records bind the surface, relabel map, phase-one record, reveal payload, and phase order by hashes/timestamps. Answers may be labels, inline text up to the registered capacity, or a private text reference with a content hash.
4. The JSON Schema is executed in full by a dependency-free 2020-12 subset evaluator. The evaluator fails closed on any unsupported or malformed keyword. Meta-fixtures exercise `$ref` siblings, inherited properties, malformed keyword values, and unknown keywords.
5. Gold is fixed at 24 items: 8 each for GRAMMAR, BLANK, and NONFOCUS; every block has two F/C/B/A items, giving 6 fatal and 18 nonfatal globally. Gold remains pending until two independent record hashes and a fresh adjudicator's pre-rationale solve/final-label hashes are bound.
6. Certification is computed independently for each reviewer against private gold. Pair consensus cannot substitute for gold agreement.
7. Every metric reports raw counts and an exact integer fraction. Thresholds use integer cross multiplication. `display4` is round-half-up presentation only. Missing/duplicate/invalid evidence causes `FAIL_INCOMPLETE` with `metrics=null`; a zero denominator is null and fails.
8. Global and block gates cover blind-solve exact agreement, fatal agreement, sensitivity, specificity, grade QWK, and focus completeness. Global AC1 is also mandatory. Blind solve must reach 9/10 globally and 7/8 in every block against sealed adjudicated `acceptedAnswerSets`; grammar-site, blank-option, and all-seven-axis diagnostic agreements are separately gated.
9. Grammar certification is limited to the exact five-marker/one-invalid surface. Blank certification requires actor/target, polarity, condition/modality, causal relation/direction, scope/quantifier, stance, and temporal relation. NONFOCUS certifies only represented evidence families, never all 23 types by implication.
10. The non-focus sentinel allocation is 23 types × 4 rows = 92, with Standard/Premium × Basic/Killer extremes. It is defect discovery only.
11. S1 exact-wire evidence is limited to an offline replay of the production core request-construction root under one direct dispatch and one candidate. It does not certify Premium grammar ladder or retry/repair/fallback policy parity. Any parity claim requires a separate versioned topology audit and an updated candidate/cost envelope.
12. Timestamp order uses canonical, finite RFC3339 instants at microsecond precision; pattern-shaped invalid calendar values cannot bypass phase order through `NaN`. Generic scoring cross-checks every gold row's expected type, surface, relabel map, and sealed phase-one hash before computing any metric.

## Formula audit

- Exact fatal agreement: `(TP+TN)/N`.
- Blind-solve exact agreement: gold-accepted phase-one answer sets divided by required items.
- Sensitivity: `TP/(TP+FN)`.
- Specificity: `TN/(TN+FP)`.
- Binary Gwet AC1: with `A=TP+TN`, `S=2TP+FP+FN`, `[2AN-S(2N-S)]/[2N²-S(2N-S)]`.
- Quadratic weighted kappa: grades `F=0,C=1,B=2,A=3`; with `O=Σ(i-j)²nᵢⱼ` and `E=Σ(i-j)²rowᵢcolⱼ`, `(E-ON)/E`.
- Completeness and diagnostic agreement: exact correct/completed atomic units divided by registered required units; NONFOCUS contributes zero focus units.

All comparisons use these unreduced integer relationships, not displayed decimals.

## Adversarial evidence

The mutation suite covers root omissions/additions, conditional-plan and premature-certificate violations, bad hashes, answer-text/hash mismatch, missing nested grammar data, missing seventh blank axis, focus audit leakage into non-focus records, phase reversal, cardinality and explanation aggregate contradictions, grammar/blank aggregate contradictions, grade inflation, unacknowledged fatal findings, valid fatal gold records, weak-but-valid C records, and distractor/type-check findings. Calibration mutations additionally cover missing rows, forged validity/completeness flags, non-focus focus-count inflation, missed fatal items, grammar-site disagreement, blank-option disagreement, and stance/temporal-axis disagreement.

## Non-claims

This amendment proves deterministic contract behavior only. It contains no real passage, question, model output, database identifier, credential, or production certificate. Synthetic fixtures are not gold reviews. The S1 mechanism screen is not full production-policy parity. It authorizes no provider call and does not relax any rights, privacy, pricing, supply, credential, topology, or durable-ledger execution hold.
