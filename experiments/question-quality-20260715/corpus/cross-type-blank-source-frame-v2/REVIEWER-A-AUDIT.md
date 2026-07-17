# Reviewer A audit — source integrity and inference-target feasibility

Status: **FROZEN FULL CENSUS — NOT CAMPAIGN AUTHORIZATION**

## Outcome

Reviewer A manually read all 157 of 157 frozen rows in queue order. The fixed verdict distribution is 134 `PASS`, 23 `EXCLUDE`, and 0 `DOMAIN_REVIEW`. Campaign-eligible rows remain 0. Rights/licensing was not reviewed by this lens and remains a separate campaign-level requirement.

## Method

The frozen review protocol was read in full before opening passage text. Each public frame row was joined locally through the git-ignored private map to the pinned v3 snapshot, then the complete raw passage was read and rated against all seven fixed Reviewer A criteria. The frozen order was preserved. There was no sampling, delegation, replacement, top-up, reconciliation, problem generation, or inspection of another reviewer's artifacts.

History collision feasibility used the supplied frozen-history exclusion embodied by the pinned v3 selector and a row-by-row exact-hash check against strict-blank-v1. Text, boundary, context, target centrality, distributed evidence, and prohibited target-form judgments were made from the raw passage. A deterministic local verifier checks coverage, bindings, verdict derivation, aggregates, privacy separation, and the frozen manifest.

## Criterion distribution

| Fixed criterion | PASS | FAIL |
|---|---:|---:|
| completeBoundaries | 148 | 9 |
| textIntegrity | 146 | 11 |
| contextCoherence | 150 | 7 |
| centralBlankableUnit | 157 | 0 |
| distributedEvidence | 157 | 0 |
| targetFormEligibility | 154 | 3 |
| historyDisjointness | 157 | 0 |

## Reason-code distribution

| Private reason code | Count |
|---|---:|
| A0_ALL_CRITERIA_PASS | 134 |
| A1_INCOMPLETE_OPENING | 4 |
| A1_INCOMPLETE_ENDING | 2 |
| A1_EXISTING_OMISSION | 1 |
| A1_SENTENCE_BOUNDARY_DEFECT | 3 |
| A2_CASE_BOUNDARY_DEFECT | 1 |
| A2_MISSING_TOKEN | 1 |
| A2_NUMERIC_MARKER_ARTIFACT | 2 |
| A2_PUNCTUATION_SPACING_DEFECT | 5 |
| A2_STRAY_CHARACTER_ARTIFACT | 1 |
| A2_WORD_SEGMENTATION_DEFECT | 1 |
| A3_DANGLING_CONNECTIVE | 2 |
| A3_PROGRESSIVE_GAP | 1 |
| A3_UNRESOLVED_EXTERNAL_REFERENCE | 2 |
| A3_INTERNAL_SEMANTIC_CONTRADICTION | 2 |
| A6_MULTI_QUESTION_CONTAINER | 3 |

Reason-code counts can exceed excluded-row counts because one row may fail more than one fixed criterion. No row identifiers, source identifiers, content hashes, passages, target spans, row decisions, or private notes appear in this audit.

## Limits and authorization

This review establishes only source integrity and inference-target feasibility. It does not establish paired item quality, answer uniqueness, distractor quality, difficulty, factual correctness outside the supplied text, rights clearance, split balance, current-history freshness, provider controls, or campaign authorization. No external evidence was consulted; therefore the review does not independently validate factual premises. Reviewer reconciliation has not occurred. Campaign authorization and campaign-eligible row counts remain zero.

## Safety record

Model/API calls: 0. Network calls: 0. Database calls: 0. Secret accesses: 0. Full-question candidates generated: 0.
