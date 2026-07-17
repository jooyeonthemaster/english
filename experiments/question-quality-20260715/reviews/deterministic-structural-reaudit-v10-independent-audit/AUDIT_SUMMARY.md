# Deterministic Structural Reaudit v10 — Independent Source-Aware Audit

## Outcome

The current production snapshot scored **125/200 (62.5%)** against the sealed v10 oracle. Defect is the positive class: **TP 25 / FN 75 / FP 0 / TN 100**. Defect recall is 25%; normal specificity is 100%.

This is a **BLOCK candidate**, not an authorization to patch production. This audit changed no production source and no production tests.

| Family | TP | FN | FP | TN | Accuracy |
|---|---:|---:|---:|---:|---:|
| `SUMMARY_COMPLETE_MC` | 0 | 25 | 0 | 25 | 50% |
| `GRAMMAR_ERROR_LEADING_LABEL` | 6 | 19 | 0 | 25 | 62% |
| `SENTENCE_ORDER_COMPLETE_UNITS` | 5 | 20 | 0 | 25 | 60% |
| `SENTENCE_ORDER_STANDALONE_LABELS` | 14 | 11 | 0 | 25 | 78% |
| **Overall** | **25** | **75** | **0** | **100** | **62.5%** |

## Source-aware disposition of all 75 false negatives

Every false negative and its one-to-one paired normal control were reviewed. All 75 controls were production true negatives.

| Family | Confirmed product contract | Oracle scope mismatch | Ambiguous | Redundant upstream |
|---|---:|---:|---:|---:|
| `SUMMARY_COMPLETE_MC` | 13 | 12 | 0 | 0 |
| `GRAMMAR_ERROR_LEADING_LABEL` | 0 | 19 | 0 | 0 |
| `SENTENCE_ORDER_COMPLETE_UNITS` | 10 | 10 | 0 | 0 |
| `SENTENCE_ORDER_STANDALONE_LABELS` | 11 | 0 | 0 | 0 |
| **Total** | **34** | **41** | **0** | **0** |

The 34 confirmed product-contract misses are bounded:

- 13 English summary carriers uniquely quote a full option but the cue-based binder abstains.
- 10 English sentence-order units lack an independent matrix clause outside the current bounded fragment certificates.
- 11 sentence-order label sets violate the exact `(A)/(B)/(C)` product contract but are accepted because the normalizer extracts any embedded ASCII A/B/C and uppercases it.

The 41 scope mismatches must not drive remediation:

- 12 summary rows use Korean option sentences outside the current English-only paired-expression schema.
- 19 grammar rows use plain-word/entity/confusable label inventories that cannot survive production's `(A)`–`(J)` canonicalizing postprocess.
- 10 sentence-order unit rows are Korean, outside the current English `SENTENCE_ORDER` lane and its Latin-token craft machinery.

Full row evidence, exact fixture deltas, matched-control review, source hashes/lines, and recommended boundaries are in `source-aware-adjudication.json`.

## Blind prediction seal

- Author payload seal: `2ddce4ecbebdcbb5d411a812185f2613d3639a727ab4ded3e8aa594c231fbc03`
- Sealed `cases.json`: `002ed425202c28f3dc7476d9381a6b65bce8e66f0616ebbeddb000d56221a222`
- Blinded projection: `6cffb121e362dd40fe19fdb71890824cee8851b7aab4a2f2b02795aae164a171`
- Executed pre-adjudication runner: `9586c15b3ac1eeb1eb36ea83ff1c7de89b15203982692196c286cb1b18ba9e79`
- Pre-adjudication predictions: `fc5a1dfe5fbc198eaf9488daf07f9c4c8745f2344a4cd29bdc142c06f37657f6`
- Production runtime source closure: 56 files, aggregate `c77ed3b68eaf67da61ef157a182c84d4366833d6a5c0373bec318440517427f7`

The fresh prediction process invoked the actual exported production functions `findSummaryMcAnswerObjectMismatch`, `findGrammarKeypointNonexistentLabel`, and `validateSentenceOrderQuestion`. It emitted and hashed all 200 predictions before adjudication.

## Process-integrity limitation

The supervising shell was not perfectly blind. Before prediction, a PowerShell UTF-8 parse failure echoed portions of raw `cases.json`, including oracle fields. This is disclosed in `PROCESS_INTEGRITY.md` and prevents an unqualified claim of supervisor-level blindness.

The prediction computation itself was isolated in a fresh process that accepted only the shuffled neutral-ID blind projection, rejected oracle-bearing keys, imported current production source, inherited no credential-named environment variables, blocked network primitives, and atomically wrote the prediction file and seal. Its exact executed source is preserved as `run_blind_predictions.pre-adjudication-sealed.txt`. There was no OS-level file-access sandbox or kernel trace, so the no-oracle-read statement is a code-derived attestation, not an independently enforced filesystem fact.

## Costs and external systems

API calls: 0. Network attempts: 0. Database calls: 0. Secrets read by the prediction process: 0. Estimated cost: **$0.00**.

## Verification performed

- Author seal verifier: pass before source/case inspection and pass again before oracle reveal.
- 42 relevant unit tests: pass.
- Scoped TypeScript check for the audit runner: pass.
- ESLint for the runner and three production validators: pass with zero warnings.
- Global TypeScript check: pass on the final rerun. A prior run was temporarily blocked by unrelated concurrent worktree errors; their owner fixed them before this artifact was sealed.

Run `node verify_audit.mjs` after the manifest is generated to verify all hashes, joins, confusion matrices, row adjudications, source closure, and manifest contents.
