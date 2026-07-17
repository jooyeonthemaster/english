# Deterministic structural remediation v9

## Scope

This is a source-aware, post-adjudication remediation record. It implements only
the 46 v9 disagreements classified `CONFIRMED_ORACLE` by the sealed independent
adjudication:

- F1 summary full-option/key cohesion: 14 defects and 14 paired controls.
- F2 grammar exact rendered-label membership: 18 defects and 18 paired controls.
- F4 complete sentence/dependent-fragment boundary: 14 defects and 14 paired controls.

The 13 F3 alternate sentence-order label rows are intentionally unchanged because
they were classified `PRODUCT_CONTRACT_SCOPE_MISMATCH`. F4 p12 is intentionally
unchanged because it was classified `REDUNDANT_WRAPPER_EXPECTED`.

## Implementation boundary

- F1 retains unique full-option matching, rejection-context filtering, and a
  decisive carrier cue. It adds bounded Korean assertion forms observed in the
  confirmed rows; it does not add semantic or fuzzy option matching.
- F2 compares an explicit leading reference with the literal rendered label.
  It does not NFKC-fold, case-fold, decode, or interchange glyph/bracket styles.
  Decorative list prefixes remain supported, and prose remains outside the rule.
- F4 adds paired-control-bounded structural certificates for the adjudicated
  participial, infinitival, relative/fused-relative, embedded-interrogative,
  subordinator-plus-colon/quotation, semicolon, dash-parenthetical, and reporting
  phrase shapes. It does not change structural paragraph label acceptance.

## Qualification

`replay.mts` executes the 46 confirmed defects and their 46 paired controls
against the remediated source. Passing is explicitly
`PASS_POST_FIT_CONFIRMED_ONLY_REPLAY`; it is not an independent holdout result.
A new blind holdout is still required for an independent generalization claim.

No API, network, database, secret, or question-generation candidate was used.
