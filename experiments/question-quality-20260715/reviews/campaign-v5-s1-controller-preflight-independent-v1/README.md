# Campaign v5 S1 controller preflight — independent audit v1

This is an offline, privacy-safe audit of the frozen 180-assignment S1 wire
preflight. The verifier does **not** import the preflight compiler. It rebuilds
the assignment matrix from the private frozen queue, invokes the current
production generation core under an independent fail-closed `fetch`
interceptor twice, validates every serialized request, and compares the result
to the sealed private/public preflight artifacts only after the independent
checks pass.

The audit makes no provider, model, database, or other network call. It installs
dummy provider credentials inside its own process before dynamically importing
the production generation core, never reads request headers, and never writes
row identities, source identifiers, passages, prompts, schemas, or row-level
digests into the public review directory.

## Verdict

`PASS_OFFLINE_WIRE_PREFLIGHT_ONLY_EXECUTION_BLOCKED`

All 180 assignments independently produced exactly one intercepted OpenRouter
request per replay. Model, plan, type, difficulty binding, profile effect,
single-question JSON schema, output ceiling, the exact
`google-vertex/global`-only route (`order` and `only`), fallback disabled,
`require_parameters`, `data_collection=deny`, `zdr=true`, reasoning-off,
one-completion, and deterministic wire bytes passed. The public preflight did
not expose a value from the private row/source surface tested by this audit.

This is **not** a durable execution controller and is not production-topology
parity. The preflight calls `runQuestionGeneration` directly; it does not enter
the fast or Trigger route, `runQuestionGenerationWithEmptyRetry`, the durable
assignment-budget scope, or a durable per-assignment state/lease/outcome
ledger. Its source closure is a hand-picked list rather than a complete
transitive build/dependency closure. It also attaches no current price proof,
provider-side spend ceiling, source-rights decision, privacy/retention decision,
or account-level privacy/retention attestation. The request-level provider route
is now pinned, but local exact wire bytes cannot prove endpoint availability,
provider compliance, account settings, or deployment environment overrides.
Live execution therefore remains blocked.

## Reproduce

```powershell
npx tsx experiments/question-quality-20260715/reviews/campaign-v5-s1-controller-preflight-independent-v1/verify.mts
npx tsc -p experiments/question-quality-20260715/reviews/campaign-v5-s1-controller-preflight-independent-v1/tsconfig.json --noEmit
```

`--write` is used only to seal `results.json` and `MANIFEST.sha256` after the
same offline audit has completed.
