# S1 exact-wire size stratification v1

This zero-network diagnostic reads the sealed 180-row private S1 preflight and
publishes aggregate request-body byte and illustrative cost strata only. It
does not persist passage text, prompt text, assignment membership, or exact
wire hashes.

The comparison is exactly matched on passage token, plan, and difficulty.
Prompt size is deliberately treated as a mediator and cost diagnostic—not as
quality evidence. G2/B2 are positive compact procedures; G3/B3 also change the
structured planning schema. Their outcomes cannot be attributed to length
alone.

Reproduce from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/s1-wire-size-stratification-v1/build.mts --write
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/s1-wire-size-stratification-v1/build.mts --check
node node_modules/tsx/dist/cli.mjs experiments/question-quality-20260715/reviews/s1-wire-size-stratification-v1/verify.mts
```

No network, provider, model, API-candidate, database, or secret activity is
performed.
