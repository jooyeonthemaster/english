# Campaign v6 S1 production-core exact-wire preflight

This package replays all 180 frozen S1 assignments through the same
`runQuestionGeneration` core used by production. Before that module is loaded,
the compiler discards every inherited environment variable except an explicit
non-secret OS/process allowlist, installs a non-secret dummy credential, and
installs fail-closed guards over `fetch`, HTTP(S), TCP, and TLS transports.
Only a per-assignment local `fetch` capture window is accepted. Each intercepted
request receives a synthetic strict failure response, so no byte reaches
OpenRouter, Google Vertex, a model, or any other network service.

This is deliberately a **production-core wire-root replay**, not full
production-policy parity. Its topology is one direct dispatch and one candidate
opportunity per assignment. It does not reproduce or certify the Premium
grammar ladder, production retry/repair/fallback candidate topology, or their
cost and quality effects. Those claims remain prohibited until a separate,
versioned production-topology audit binds the admitted live policy. The public
and private reports carry this negative claim explicitly, and the verifier
fails if it is removed or promoted to parity.

The private, gitignored artifact binds every row to its exact request-envelope,
wire-body, prompt, schema, model, profile, difficulty, token cap, route,
reasoning policy, corpus rights record, and production source closure. It also
contains an assignment array statically checked as the durable controller's
`S1ExactWireRow[]`. Materializer input v1.2 also carries an eight-entry
`profileArtifactManifest`: every profile has one hash, all eight hashes are
distinct, aliases are forbidden, and every row hash must equal its manifest
entry. The unpriced adapter deliberately omits `pricing`,
`preflightSemanticSha256`, and `preflightArtifactSha256`; those may be attached
only with a fresh schema-v2 route-tag proof, replacement authorization, and the
sealed artifact hashes. The exact 180 rows are also passed through the durable
materializer with its sealed offline synthetic pricing fixture. This proves the
full matrix, rights-hash, controller, and pricing-envelope semantics without
granting execution authority or attaching live pricing.

The synthetic schema-v2 price path is structural evidence only. It requires the
exact canonical model slugs, derives `exactRouteProvider=Google` from the single
active `google-vertex/global` endpoint, hashes the code-point-sorted served-model
allowlist `[model.id, canonicalSlug]`, and rejects unmodeled charge dimensions.
Those bindings are preserved in the semantic-dry proof; the unpriced production
binding still cannot execute until a fresh external snapshot supplies the same
contract.

The public artifact contains aggregates only. It proves 180 unique request
bodies and envelopes, 180 strict one-item JSON schemas, current model/profile/
difficulty bindings, the grammar 6,000 and blank 4,000 output-token ceilings,
reasoning off, and exact `google-vertex/global`-only routing with fallbacks off,
parameter support required, data collection denied, and ZDR requested. It does
not publish passages, row membership, assignment identifiers, or per-row wire
digests.
Every per-profile artifact hash includes the current sealed G3/B3
negative-evidence audit (results, findings, report, source closure, and
manifest). The older integration audit is labeled historical baseline only;
neither offline audit is represented as live quality improvement.

Cost remains a hold. The offline exact-body byte total is checked against the
9,000,000-byte design envelope and the non-authorizing $100 planning ceiling.
The arithmetic is model-stratified: Standard uses the Flash emergency fixture
rates and Premium uses the higher Pro emergency fixture rates.
The stale v5 flat caps are never used. Live materialization still requires a
fresh tag-bound pricing schema v2 snapshot, emergency all-active-endpoint
reservation, dedicated zero-usage `OPENROUTER_S1_API_KEY`, matching provider
hard limit, current provider privacy review, independent pre-dispatch audit,
and explicit authorization.

Reproduce offline:

```powershell
npx.cmd tsx experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/compile-exact-wire-preflight.mts --write
npx.cmd tsx experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/compile-exact-wire-preflight.mts
npx.cmd tsx experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/verify.mts
npx.cmd tsc -p experiments/question-quality-20260715/execution/campaign-v6-s1-exact-wire-preflight-v1/tsconfig.json --noEmit
```

The result remains `OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED`. External
network calls, provider/model calls, database calls, real secret reads, and API
candidate consumption are all zero.
