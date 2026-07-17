# Deterministic Structural Reaudit v12 — Blind Holdout

Verdict: **PARTIAL**

## Sealed design

- 64 independently authored validation families
- 384 cases (192 defect/control pairs; three lexical variants per family)
- corpus SHA-256: `8695bc1b7c0539594ec08e57c6b107e52a943c85c13b460879c845e22f90ca52`
- oracle SHA-256: `8096ca7e386b7fc146eb4837e2d6d06b284e36efcde15481d983a1900ecf7573`
- No API, network, database, or production-source mutation was used.
- Earlier v9/v10/v11 corpus, oracle, case payload, and builder artifacts were excluded from authoring.

## Results

- Target exactness: TP 192, TN 192, FP 0, FN 0; sensitivity 1, specificity 1.
- Production blocking: TP 138, TN 195, FP 0, FN 51; sensitivity 0.7301587301587301, specificity 1.
- Source-aware control audit: 192/192 valid controls.
- Structural error targets missing from the production relaxed-blocking policy: generic-answer-count, generic-multi-answer-direction, type-foreign-field, scrambled-near-answer-order, summary-complete-missing-blank-answer, sentence-order-paragraph-body-label, sentence-order-dependent-fragment, multi-blank-count, multi-blank-label, multi-blank-missing-expression, multi-blank-expression-not-in-passage, multi-blank-missing-passage, multi-blank-marker-count, multi-blank-option-values, multi-blank-duplicate-option, multi-blank-correct-option-mismatch, sentence-insert-missing-given.
- Preclassified craft-warning targets correctly left nonblocking: blank-target-list-like.

## Scope safeguards

WORD_ORDER controls use reconstructable but strongly shuffled chunks and their model answers do not appear as six-token verbatim runs in the source passage. SENTENCE_ORDER controls use exactly three source-backed blocks, each with at least two sentences and 24 words, and their keyed order reconstructs the source without using visible (A)-(B)-(C) order. Every control also receives a family-specific source/answer synchronization audit in addition to the production validator.

## Family matrix

| Family | Surface | Target | Target exact | Production exact | Controls source-valid |
|---|---|---|---:|---:|---:|
| generic-option-count | generic-mc | `option-count` | yes | yes | yes |
| generic-duplicate-label | generic-mc | `duplicate-option-label` | yes | yes | yes |
| generic-duplicate-text | generic-mc | `duplicate-option-text` | yes | yes | yes |
| generic-empty-text | generic-mc | `empty-option-text` | yes | yes | yes |
| generic-answer-mismatch | generic-mc | `correct-answer-mismatch` | yes | yes | yes |
| generic-answer-count | generic-mc | `generic-answer-count` | yes | no | yes |
| generic-multi-direction | generic-mc | `generic-multi-answer-direction` | yes | no | yes |
| generic-foreign-field | generic-mc | `type-foreign-field` | yes | no | yes |
| word-punctuation-chip | word-order | `punctuation-only-chunk` | yes | yes | yes |
| word-already-solved | word-order | `scrambled-already-solved` | yes | yes | yes |
| word-near-order | word-order | `scrambled-near-answer-order` | yes | no | yes |
| word-unreconstructable | word-order | `word-order-unreconstructable` | yes | yes | yes |
| word-source-copy | word-order | `writing-answer-verbatim-copy` | yes | yes | yes |
| fbk-missing-marker | fill-blank-key | `fbk-missing-blank-marker` | yes | yes | yes |
| fbk-multiple | fill-blank-key | `fbk-multiple-blanks` | yes | yes | yes |
| fbk-residual | fill-blank-key | `fbk-answer-residual-leak` | yes | yes | yes |
| fbk-frame | fill-blank-key | `fbk-frame-altered` | yes | yes | yes |
| summary-missing | summary-complete | `summary-complete-missing-summary` | yes | yes | yes |
| summary-marker | summary-complete | `summary-complete-blank-marker-count` | yes | yes | yes |
| summary-answer | summary-complete | `summary-complete-missing-blank-answer` | yes | no | yes |
| summary-language | summary-complete | `summary-complete-answer-language` | yes | yes | yes |
| summary-leak | summary-complete | `summary-complete-answer-leaks-in-summary` | yes | yes | yes |
| order-missing-given | sentence-order | `sentence-order-missing-given` | yes | yes | yes |
| order-given-label | sentence-order | `sentence-order-given-contains-paragraph-label` | yes | yes | yes |
| order-paragraph-count | sentence-order | `sentence-order-paragraph-count` | yes | yes | yes |
| order-empty | sentence-order | `sentence-order-empty-paragraph` | yes | yes | yes |
| order-body-label | sentence-order | `sentence-order-paragraph-body-label` | yes | no | yes |
| order-dependent-fragment | sentence-order | `sentence-order-dependent-fragment` | yes | no | yes |
| order-labels | sentence-order | `sentence-order-paragraph-labels` | yes | yes | yes |
| order-too-short | sentence-order | `sentence-order-paragraph-too-short` | yes | yes | yes |
| order-too-thin | sentence-order | `sentence-order-paragraph-too-thin` | yes | yes | yes |
| order-option-shape | sentence-order | `sentence-order-option-permutation` | yes | yes | yes |
| order-option-duplicate | sentence-order | `sentence-order-option-duplicates` | yes | yes | yes |
| order-unscrambled | sentence-order | `sentence-order-unscrambled-answer` | yes | yes | yes |
| order-answer-key | sentence-order | `sentence-order-answer-key-mismatch` | yes | yes | yes |
| order-source-backed | sentence-order | `sentence-order-paragraph-not-source-backed` | yes | yes | yes |
| multi-count | multi-blank | `multi-blank-count` | yes | no | yes |
| multi-label | multi-blank | `multi-blank-label` | yes | no | yes |
| multi-expression | multi-blank | `multi-blank-missing-expression` | yes | no | yes |
| multi-source | multi-blank | `multi-blank-expression-not-in-passage` | yes | no | yes |
| multi-passage | multi-blank | `multi-blank-missing-passage` | yes | no | yes |
| multi-marker | multi-blank | `multi-blank-marker-count` | yes | no | yes |
| multi-visible | multi-blank | `multi-blank-answer-visible` | yes | yes | yes |
| multi-option-values | multi-blank | `multi-blank-option-values` | yes | no | yes |
| multi-duplicate | multi-blank | `multi-blank-duplicate-option` | yes | no | yes |
| multi-correct-mismatch | multi-blank | `multi-blank-correct-option-mismatch` | yes | no | yes |
| blank-missing-answer | blank-single | `blank-missing-answer` | yes | yes | yes |
| blank-residual | blank-single | `blank-answer-residual-visible` | yes | yes | yes |
| blank-list | blank-single | `blank-target-list-like` | yes | yes | yes |
| blank-explanation-numbering | blank-single | `blank-explanation-narrative-circled-numbering` | yes | yes | yes |
| grammar-marker-count | grammar-error | `grammar-marker-count` | yes | yes | yes |
| grammar-error-count | grammar-error | `grammar-error-count` | yes | yes | yes |
| grammar-answer-label | grammar-error | `grammar-correct-answer-labels` | yes | yes | yes |
| grammar-not-mutated | grammar-error | `grammar-error-not-mutated` | yes | yes | yes |
| correction-segments | grammar-correction | `grammar-correction-missing-underlined-segments` | yes | yes | yes |
| correction-error-count | grammar-correction | `grammar-correction-error-count` | yes | yes | yes |
| correction-part | grammar-correction | `grammar-correction-missing-corrected-part` | yes | yes | yes |
| correction-answer | grammar-correction | `grammar-correction-answer-mismatch` | yes | yes | yes |
| insert-given | sentence-insert | `sentence-insert-missing-given` | yes | no | yes |
| insert-passage | sentence-insert | `sentence-insert-missing-passage` | yes | yes | yes |
| insert-markers | sentence-insert | `sentence-insert-gap-marker-count` | yes | yes | yes |
| insert-source | sentence-insert | `sentence-insert-omitted-source-not-backed` | yes | yes | yes |
| insert-visible | sentence-insert | `sentence-insert-omitted-source-visible` | yes | yes | yes |
| insert-answer | sentence-insert | `sentence-insert-answer-desync` | yes | yes | yes |

## Failure ids

- Target FP: none
- Target FN: none
- Production FP: none
- Production FN: generic-answer-count-v1-defect, generic-answer-count-v2-defect, generic-answer-count-v3-defect, generic-multi-direction-v1-defect, generic-multi-direction-v2-defect, generic-multi-direction-v3-defect, generic-foreign-field-v1-defect, generic-foreign-field-v2-defect, generic-foreign-field-v3-defect, word-near-order-v1-defect, word-near-order-v2-defect, word-near-order-v3-defect, summary-answer-v1-defect, summary-answer-v2-defect, summary-answer-v3-defect, order-body-label-v1-defect, order-body-label-v2-defect, order-body-label-v3-defect, order-dependent-fragment-v1-defect, order-dependent-fragment-v2-defect, order-dependent-fragment-v3-defect, multi-count-v1-defect, multi-count-v2-defect, multi-count-v3-defect, multi-label-v1-defect, multi-label-v2-defect, multi-label-v3-defect, multi-expression-v1-defect, multi-expression-v2-defect, multi-expression-v3-defect, multi-source-v1-defect, multi-source-v2-defect, multi-source-v3-defect, multi-passage-v1-defect, multi-passage-v2-defect, multi-passage-v3-defect, multi-marker-v1-defect, multi-marker-v2-defect, multi-marker-v3-defect, multi-option-values-v1-defect, multi-option-values-v2-defect, multi-option-values-v3-defect, multi-duplicate-v1-defect, multi-duplicate-v2-defect, multi-duplicate-v3-defect, multi-correct-mismatch-v1-defect, multi-correct-mismatch-v2-defect, multi-correct-mismatch-v3-defect, insert-given-v1-defect, insert-given-v2-defect, insert-given-v3-defect
- Source-invalid controls: none

