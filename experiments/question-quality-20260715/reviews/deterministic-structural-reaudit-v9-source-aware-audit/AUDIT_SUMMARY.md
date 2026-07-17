# Deterministic Structural Reaudit v9 — Source-Aware Audit

## Result

The current production snapshot detected 33 of 80 sealed defects and rejected 13 of 80 sealed normal controls. All 160 cases executed, with no projection blocks. Overall confusion counts are **TP 33 / FN 47 / FP 13 / TN 67** (62.5% accuracy, 41.25% defect recall, and 83.75% normal specificity on executed cases).

These are holdout results against the sealed oracle. No oracle was repaired, relabeled, removed, reordered, or supplemented after production-source inspection.

## Chain of custody

Before any production-source content was opened, the auditor independently verified the six-file source bundle in `C:/Users/jooye/Desktop/2026project/nara`, including the manifest seal, every declared file hash and size, the aggregate case digest, exact file allowlist, 160-case/80-pair cardinality, pair symmetry, family balance, unique case ids, unique canonical surfaces, and each family oracle contract. The author verifier also passed.

The six immutable files were then copied byte-for-byte to `../deterministic-structural-reaudit-v9` under the real repository at `D:/Desktop/2026project/nara`. All source and destination SHA-256 values matched, and the relocated author verifier passed again. The acceptance record is `PRE_SOURCE_INSPECTION_ACCEPTANCE.json`.

The chronology conclusion is deliberately narrow: the sealed bytes provably existed before this auditor inspected production source. The manifest declares that the author had not inspected source, tests, v7/v8 material, research notes, or prior results, but the seal is an integrity record rather than an independently trusted timestamp or external attestation of that declaration.

Key immutable digests:

- `cases.json`: `64c8f3bdf16eafef1c8c6f11ad2a54799f2f9bcb1c1bd095800a7cebb6cd01ea`
- aggregate canonical case digest: `ffb88b27b00e632805bba8d0963d1074b7f0a65321a8c10eec2c7ceaff36fff8`
- `PRE_INSPECTION_MANIFEST.json`: `2f8e98078388d74b1e3f2d84e6bab25ff337e63898cb4802e265049146aae1dc`
- `PRE_INSPECTION_SEAL.sha256`: `f2ab695a99cbeee3e9e99fa52751cf4e5e5bf30fba0c9bd0d5efea2f7fa7487c`

No API, network, database, secret, production write, production-code edit, or test-fixture edit was used by this audit. No v7/v8 results, research-note conclusions, or prior post-fit metrics were read.

## Production snapshot and mappings

The audit ran against Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709` plus the exact dirty-worktree source hashes recorded in `results.json` and `POST_AUDIT_MANIFEST.json`.

- F1 called `findSummaryMcAnswerObjectMismatch` from `src/lib/question-quality/validators/summary/mc.ts` directly. The sealed authoritative carrier, options, and key were passed verbatim.
- F2 called `findGrammarKeypointNonexistentLabel` from `src/lib/question-quality/validators/grammar/shared.ts`. The sealed key point was passed verbatim and the explicit rendered-label inventory was mapped one-to-one to `markedExpressions[].label`.
- F3 called `validateSentenceOrderQuestion` from `src/lib/question-quality/validators/sentence-order.ts`. Each rendered line was split only at its unique declared leading label, and every projection was required to round-trip byte-for-byte to the sealed rendered body. No missing line or label was synthesized.
- F4 reached `isHighConfidenceSentenceOrderDependentFragment` through the exported `validateSentenceOrderQuestion`. Each candidate was preserved verbatim and probed in paragraph positions A, B, and C. A position-dependent verdict would have been BLOCK; all 40 cases were unanimous.

Any malformed, non-round-tripping, multi-match, or position-dependent projection is a BLOCK in the runner. None occurred.

## Per-family confusion matrices

Defect is the positive class.

| Family | TP | FN | FP | TN | BLOCK | Accuracy | Defect recall | Normal specificity |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| F1 summary option/key cohesion | 6 | 14 | 0 | 20 | 0 | 65.0% | 30.0% | 100.0% |
| F2 grammar rendered-label reference | 2 | 18 | 0 | 20 | 0 | 55.0% | 10.0% | 100.0% |
| F3 sentence-order structural label position | 20 | 0 | 13 | 7 | 0 | 67.5% | 100.0% | 35.0% |
| F4 complete sentence vs dependent fragment | 5 | 15 | 0 | 20 | 0 | 62.5% | 25.0% | 100.0% |
| Overall | 33 | 47 | 13 | 67 | 0 | 62.5% | 41.25% | 83.75% |

## Failure inventory

F1 false negatives (14): `v9-f1-p01-defect`–`p04-defect`, `p09-defect`, `p10-defect`, `p12-defect`–`p16-defect`, and `p18-defect`–`p20-defect`. The helper retained perfect specificity but its high-confidence selection-cue/proximity binding abstained on 14 authoritative full-option selections.

F2 false negatives (18): every defect except `v9-f2-p02-defect` and `v9-f2-p09-defect`. Empty rendered inventories cause an early abstention, many sealed leading-label grammars are outside the helper's recognizer, and several distinct exact rendered labels collapse under production canonicalization. The helper produced no false positives, but defect recall was 10%.

F3 false positives (13): `v9-f3-p03-normal`, `p04-normal`, `p05-normal`, `p07-normal`, `p10-normal`–`p14-normal`, and `p17-normal`–`p20-normal`. Production correctly caught all 20 missing-leading-block defects, primarily through the paragraph-count contract. It also enforces the narrower production `(A)/(B)/(C)` label system, so 13 oracle-normal alternate rendered-label systems were rejected. They remain false positives under the sealed generic leading-label oracle; the audit does not relabel them to fit production.

F4 false negatives (15): `v9-f4-p02-defect`–`p06-defect`, `p08-defect`–`p10-defect`, and `p12-defect`–`p18-defect`. The bounded production certificate detected five overt short subordinate-clause fragments (`p01`, `p07`, `p11`, `p19`, and `p20`) and no normal controls. It did not cover participial phrases, noun phrases without matrix predicates, embedded interrogatives, punctuated infinitival fragments, quoted dependent material, or several other fragment shapes in the sealed contract.

The complete per-case findings, target issue codes, non-target wrapper diagnostics, projection evidence, source hashes, and failure objects are in `results.json`.

## Verification

From this directory:

```powershell
python .\verify_source_aware_audit.py --rerun
```

The verifier independently rechecks the pre-inspection seal and corpus invariants, compares every result to the immutable case id/oracle/surface hash, recomputes all confusion matrices and the failure list, verifies current production-source hashes and Git status, verifies every post-audit artifact hash, verifies the post-audit seal, and reruns all 160 cases through the current production snapshot.
