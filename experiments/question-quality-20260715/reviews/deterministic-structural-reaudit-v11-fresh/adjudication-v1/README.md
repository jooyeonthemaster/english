# v11 fresh blocking-FP source adjudication

Verdict: **the 12 reported production-blocking false positives are 0 true validator false positives and 12 invalid oracle controls.** No production remediation is justified by these 12 rows.

This review is intentionally narrower than the v11 target-code score. It asks whether each control that the sealed oracle labelled globally valid actually satisfies the current production question contract. It reads only the sealed `corpus.json` / `oracle.json`, the immutable v11 `results.json`, and the current validator, prompt, schema-adjacent rendering policy, and renderer contracts. It performs no API, database, or network operation and changes no production code or fixture.

## Classification result

| Classification | Count |
|---|---:|
| `TRUE_VALIDATOR_FP` | 0 |
| `ORACLE_CONTROL_INVALID` | 12 |
| `AMBIGUOUS` | 0 |
| `REDUNDANT_UPSTREAM` | 0 |

The six `WORD_ORDER` controls contain their nine-word `modelAnswer` as an exact sentence in the source passage. Production displays the source passage for `WORD_ORDER`; the type prompt requires a real syntactic/paraphrase transformation and forbids a continuous six-word source run; and the dispatcher deliberately blocks a six-token / 80%-coverage whole-copy answer as `writing-answer-verbatim-copy`. The named reconstruction and shuffle dimensions are clean, but the controls are not globally valid.

The six `SENTENCE_ORDER` controls contain three source-backed two-sentence paragraphs, but paragraph `(C)` is only 22 words. The current literal contract is at least 24 words per paragraph, enforced as an error by `validateSentenceOrderQuestion`. Thus `sentence-order-paragraph-too-thin` is correct. Again, the named paragraph-count or source-backing dimension is clean while the supposed globally valid control is not.

The duplicate controls across the two target families do not qualify as `REDUNDANT_UPSTREAM`: the unrelated blocking invariant does not distinguish the paired control and defect; it invalidates both. This is a holdout-control construction error, not evidence that a missed target is safely covered upstream.

## Consequence

Keep the production validators unchanged on this evidence. Preserve v11 as sealed evidence and build a new holdout version instead of editing it:

- make every `WORD_ORDER` control answer a genuine source-grounded transformation with no continuous six-token source copy, then apply only the intended reconstruction/shuffle mutation;
- extend the synthetic `SENTENCE_ORDER` source and `(C)` paragraph to at least 24 words while preserving two sentences, source backing, balance, and the intended one-field mutation.

`adjudication.json` contains the 12 case-level decisions and exact source closure. `verify.mjs` independently checks the sealed parents, false-positive inventory, facts behind every decision, source hashes, classifications, summary arithmetic, public-data hygiene, and artifact hashes recorded in `manifest.json`.

