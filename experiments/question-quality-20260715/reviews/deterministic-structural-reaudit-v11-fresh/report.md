# Deterministic structural re-audit v11 (fresh)

Verdict: **PARTIAL** — All seeded defects and exact target contracts were detected, but one or more source-aware controls received unrelated blocking errors.

## Sealed holdout

- Cases: 288 (144 valid / 144 defective)
- Families: 48
- Corpus SHA-256: 8c4c6a5d41488b433bccde5b08acbdff198a089273a6e4c0b5e6ce45607777ab
- Oracle SHA-256: 30961d05f6020bc87cf8528f72abd19cf8f70055b5ce515ef1e0b13bd5595f9f

## Confusion matrices

| Evaluation | TP | TN | FP | FN | Sensitivity | Specificity |
|---|---:|---:|---:|---:|---:|---:|
| Production blocking | 144 | 132 | 12 | 0 | 1 | 0.916667 |
| Exact pre-sealed target | 144 | 144 | 0 | 0 | 1 | 1 |

## Miss taxonomy

- Blocking false negatives: none
- Blocking false positives: EN-WORD-ORDER-RECONSTRUCT-v1-a, EN-WORD-ORDER-UNSOLVED-v1-a, EN-ORDER-PARAGRAPH-COUNT-v1-a, EN-ORDER-SOURCE-BACKING-v1-a, EN-WORD-ORDER-RECONSTRUCT-v2-a, EN-WORD-ORDER-UNSOLVED-v2-a, EN-ORDER-PARAGRAPH-COUNT-v2-a, EN-ORDER-SOURCE-BACKING-v2-a, EN-WORD-ORDER-RECONSTRUCT-v3-a, EN-WORD-ORDER-UNSOLVED-v3-a, EN-ORDER-PARAGRAPH-COUNT-v3-a, EN-ORDER-SOURCE-BACKING-v3-a
- Exact target misses: none
- Exact target control leaks: none

## Top emitted blocking codes

- writing-answer-verbatim-copy: 15
- ko-evidence-missing: 9
- sentence-order-paragraph-too-thin: 9
- type-foreign-field: 9
- blank-paraphrase-answer-not-transformed: 6
- combo-option-value-mismatch: 6
- correct-answer-mismatch: 6
- grammar-correct-answer-labels: 6
- ko-correct-answer-invalid: 6
- ko-direction-grammar: 6
- ko-option-count: 6
- option-count: 6
- antonym-marker-count: 3
- blank-answer-residual-visible: 3
- blank-missing-answer: 3
- combo-slot-count: 3
- combo-slot-not-mutated: 3
- content-match-direction-polarity: 3
- duplicate-option-label: 3
- duplicate-option-text: 3

The complete per-case and per-family taxonomy is in results.json.
