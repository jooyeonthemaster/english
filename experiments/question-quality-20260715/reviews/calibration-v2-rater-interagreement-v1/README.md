# Calibration v2 inter-rater audit v1

This offline audit aligns rater A and rater B through each private relabel map,
checks every phase-1/reveal/review binding, and compares canonical blind answers,
fatal judgments, grades, grammar/blank diagnostics, and block-level agreement.

The audit found that rater A wrote per-item reveal hashes where the scorer
requires the reveal-bundle hash, while rater B wrote the map-bundle hash where
the scorer requires each item-map hash. Original records remain untouched. The
builder emits private score-bound derivatives that change only those binding
fields and records both source and derived hashes.

It intentionally reads no author hypothesis, author self-audit, adjudicator
record, pending gold, or final gold. Its output is disagreement evidence only;
it cannot create an oracle or certify a reviewer.

```powershell
node experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/build.mjs --write
node experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/build.mjs --check
node experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/verify.mjs
npx.cmd tsx experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/verify-score-bindings.mts
node experiments/question-quality-20260715/reviews/calibration-v2-rater-interagreement-v1/finalize-manifest.mjs
```
