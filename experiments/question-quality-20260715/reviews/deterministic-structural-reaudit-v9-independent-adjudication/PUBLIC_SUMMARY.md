# Deterministic Structural Reaudit v9 — Independent Adjudication

## Result

All 60 production/oracle disagreements and all 60 paired controls were manually reviewed. No disagreement was skipped or blocked.

| Adjudication | Count |
|---|---:|
| `CONFIRMED_ORACLE` | 46 |
| `PRODUCT_CONTRACT_SCOPE_MISMATCH` | 13 |
| `REDUNDANT_WRAPPER_EXPECTED` | 1 |
| `AMBIGUOUS` | 0 |
| **Total** | **60** |

`CONFIRMED_ORACLE` means the target production verdict is substantively wrong under the sealed student-surface contract. It does not by itself authorize an unbounded production rule expansion.

## Family-level adjudication

| Sealed family | Disagreements | Confirmed oracle | Product-scope mismatch | Redundant wrapper | Ambiguous |
|---|---:|---:|---:|---:|---:|
| Summary full-option/key cohesion | 14 | 14 | 0 | 0 | 0 |
| Grammar rendered-label reference | 18 | 18 | 0 | 0 | 0 |
| Sentence-order structural labels | 13 | 0 | 13 | 0 | 0 |
| Complete sentence vs dependent fragment | 15 | 14 | 0 | 1 | 0 |
| **Overall** | **60** | **46** | **13** | **1** | **0** |

### Summary option/key cohesion

All 14 false negatives are confirmed. In every row, the declared authoritative carrier contains one complete option surface verbatim, the defect key names a different option, and the paired control changes the key to the quoted option and is a true negative. The appropriate fix boundary is unique exact full-option binding in the declared carrier followed by a literal label comparison. Semantic or topical similarity should remain out of scope.

### Grammar rendered-label reference

All 18 false negatives are confirmed. Each key point begins with an exact label absent from the rendered-label inventory, while its paired control renders that exact label and is a true negative. Raw attributes, comments, element names, metadata, alternate brackets, compatibility forms, confusables, and other lookalikes cannot satisfy an exact student-visible reference. The fix belongs at exact leading-reference recognition and exact rendered-inventory membership; raw markup must not substitute for rendered evidence. The allowed results contain no wrapper evidence supporting a redundancy downgrade for these rows.

### Sentence-order structural labels

All 13 false positives are product-contract scope mismatches, not confirmed production defects. The alternate label systems satisfy the sealed generic rule because each expected label leads its own block. However, the production findings explicitly enforce the narrower `(A)/(B)/(C)` sequence. A product-specific sentence-order format may legitimately reject generic alternate label systems.

This family therefore supplies **zero confirmed broadening cases**. Production should not be changed to accept arbitrary label systems merely to improve generic-oracle specificity. First settle the product contract. If alternate systems are intended, add only explicitly configured formats and their controls; otherwise align the evaluation scope with the exact product schema.

### Complete sentence vs dependent fragment

Fourteen false negatives are confirmed after clause-level comparison with their paired complete-sentence controls. The missed surfaces cover participial phrases, infinitival phrases, noun phrases whose finite verb is confined to a relative clause, embedded interrogatives, outer subordination across quotations or colon material, fused-relative nominals, and punctuation that does not supply a finite matrix predicate. Remediation should be pattern-bounded and paired with the existing complete controls, not a general punctuation or short-text heuristic.

One row is `REDUNDANT_WRAPPER_EXPECTED`: the target fragment helper misses, but the results emit the separate `sentence-order-paragraph-too-short` wrapper issue in all three probed positions for the defect and in none of the three positions for its paired control. That is the only row whose allowed evidence proves a position-invariant, control-differential wrapper catch. It remains a helper-specific diagnostic gap if callers require the fragment code itself, but it does not establish a missing wrapper-level rejection.

For every other fragment disagreement, non-target short/thin/imbalance diagnostics are shared with the paired normal control, so they were not treated as reliable redundancy evidence.

## Scope and custody

The adjudication used only the sealed protocol, immutable cases, pre-inspection immutability records, and the source-aware audit's `results.json` and public summary. It did not read production source, tests, v7/v8 artifacts, research-note conclusions, or author messages. It used no API, network, database, secrets, or candidates and made no code or oracle changes.

The private row-level file contains the complete 60-row reasoning, paired-control checks, structural evidence, and recommended fix boundary. This public summary intentionally contains no case identifiers or sealed case payloads.
