# Campaign v5 S1 controller preflight

This package compiles all 180 frozen S1 assignments through the current production question-generation entrypoint while replacing `globalThis.fetch` with a local masked-failure interceptor. It therefore records the exact OpenRouter endpoint, serialized request-body hash, prompt hash, schema hash, byte count, model, output cap, provider routing, and reasoning-off contract without making any external request.

The row-level artifact is private and git-ignored. The public artifact contains aggregate counts and immutable commitments only. Compilation does not authorize generation: rights, privacy/retention, limited-credential hard spend, a price proof no older than 15 minutes, durable per-assignment registries/ledger, and an independent audit must all close first.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/compile-controller-preflight.mts --write
npx tsx experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/verify-controller-preflight.mts
npx tsc -p experiments/question-quality-20260715/execution/campaign-v5-s1-controller-v1/tsconfig.json --noEmit
```
