# Deterministic structural remediation v10

## Authorized scope

This remediation implements only the 34 v10 false negatives independently
classified as `CONFIRMED_PRODUCT_CONTRACT`:

- 13 English `SUMMARY_COMPLETE_MC` authoritative full-option/key bindings.
- 10 English `SENTENCE_ORDER` units without an independent finite matrix clause.
- 11 literal standalone `(A)/(B)/(C)` structural-label violations.

The 41 `ORACLE_SCOPE_MISMATCH` rows remain deliberate non-targets: 12 Korean
summary-option rows, 19 grammar inventories outside production's canonical
`(A)` through `(J)` rendering, and 10 Korean sentence-unit rows outside the
English `SENTENCE_ORDER` lane. There were no ambiguous or redundant rows.

## Structural changes

- Summary binding retains unique exact whole-option matching. It now recognizes
  affirmative final/required/completed summary carriers when no decisive
  choose/select cue bound the option. Draft, comparison, contrast, rejection,
  negation, duplicate surfaces, and fuzzy/semantic matching remain excluded.
- Sentence-unit validation adds bounded English certificates for perfect and
  passive participial remnants, standalone prepositional gerunds, quoted
  subordinate clauses/questions, nominal-plus-infinitive/nominal-dash shapes,
  paired non-clausal semicolon halves, and short determiner-led nominal phrases.
  Explicit matrix-clause and direct-question controls remain accepted.
- Structural paragraph labels are compared as trimmed literal display strings.
  The permissive normalizer remains available only for downstream answer
  reconstruction; it no longer determines whether the displayed labels satisfy
  the product contract.

## Evidence qualification

`replay.mts` is a post-fit replay because the confirmed v10 rows informed the
implementation. `novel-regressions.mts` supplies separately authored paired and
semantic-truth controls, but it is not a fresh blind holdout. A separately
authored v11 is still required for a new independent generalization claim.

No API, network, database, secret, or question-generation candidate was used.
