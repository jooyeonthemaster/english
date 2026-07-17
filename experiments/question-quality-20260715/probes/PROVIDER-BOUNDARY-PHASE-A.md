# Provider boundary Phase A

Status: implemented, fresh-eyes corrected, and zero-network verified on
2026-07-15. Phase B implementation may start; real provider calls remain
blocked by the checklist below.

Phase A installs a production-safe HTTP dispatcher in the shared
Atlas/OpenRouter provider. It does **not** install a research controller, open
an experiment phase, create a canonical ledger, or change any generation
prompt/schema/retry/reasoning behavior.

## Files

- `src/lib/atlas-research-fetch-boundary.ts`: trusted ALS scope, controller
  lifecycle, wire-contract validation, lease/observation boundary, and minimal
  clone extraction.
- `src/lib/atlas-ai.ts`: passes `atlasResearchFetch` to
  `createOpenAICompatible`.
- `tests/unit/atlas-research-fetch-boundary.test.ts`: in-memory adversarial and
  real-AI-SDK retry tests.

## Production behavior now

`atlasResearchFetch` captures the native fetch once. When no research scope is
active it returns the delegate promise directly. The fast path does not inspect
the controller, parse the request, clone the response, or alter arguments.
This remains true even if a controller is installed for a concurrent research
operation.

When a research scope is active, the dispatcher fails before network I/O unless
all of the following are true:

1. exactly one trusted controller is installed;
2. operation/provenance/hash/corpus lineage is structurally valid;
3. actual endpoint and wire model match the scoped values;
4. streaming is off;
5. candidate cardinality is attested by the controller and
   `wire n × attested candidates/completion` equals the scoped total;
6. the trusted controller accepts the actual endpoint/model/plan combination
   and returns a pre-fetch lease.

Design and evaluation scopes always lease zero candidate slots. Candidate
scopes cannot use zero or omit an attestation contract.

## Public Phase A API

The core exports:

- `installAtlasResearchFetchController(controller)`: single-owner install;
  returns an ownership-checked uninstall function. There is no environment or
  force-reset bypass, and uninstall is rejected while an operation is active.
- `runWithAtlasResearchScope(scope, fn)`: root ALS operation. Concurrent reuse
  of an operation ID is rejected. Root admission closes before return and the
  operation remains active until already-started fetches and clone observations
  settle.
- `runWithAtlasResearchChildScope(scope, fn)`: explicit repair/fallback/ladder
  child stage sharing the root physical ordinal. It requires the latest parent
  physical call ID. Each child store is closed on return, so an escaped async
  task cannot later reuse stale stage provenance.
- `getCurrentAtlasResearchLineage()`: returns only operation ID and last
  physical call ID for constructing an explicit child scope.
- `createAtlasResearchFetchDispatcher(delegate)`: the same enforcing dispatcher
  used by production, allowing deterministic in-memory transport tests.

The scope provenance envelope contains no prompt or passage text. It represents
requested/effective model, plan, stage, prompt/schema/gate/ladder/policy hashes,
corpus row plus passage hash, runner version, and Git version.

## What is parsed from the wire

The dispatcher derives these facts from the actual request body and URL rather
than trusting call-site telemetry:

- normalized endpoint and endpoint hash;
- transformed wire model;
- `n` (default one);
- `max_tokens`, `max_completion_tokens`, and `max_output_tokens`;
- stream flag;
- response-format/root-schema shape and schema hash;
- wire prompt hash;
- exact inline wire-body hash (preserves evidence of whitespace/order/duplicate
  keys without retaining the body);
- canonical hash of method + endpoint + full canonicalized request body.

Only hashes and non-sensitive request facts reach the controller. The request
body, messages, passage, schema body, and headers are not retained.

Active-scope transport arguments are snapshotted before the first trusted
controller await. This closes a time-of-check/time-of-use gap in which a mutable
`URL`, `Headers`, or `RequestInit.body` could otherwise differ from the facts
used for the committed lease. This copy occurs only in research scope; the
no-scope path still forwards the original objects exactly.

The trusted controller must maintain its own phase registry for endpoint,
effective model per plan, purpose/stage, and attestation ID/hash. It must reject
a candidate-producing stage that self-labels as zero-slot design/evaluation.
Cross-checking caller scope against the wire prevents accidental mismatch; the
controller registry prevents a caller from making both sides agree on an
unauthorized endpoint/model/purpose.

## Response and terminal evidence

A successful pre-fetch lease is created exactly once for every invocation of
the SDK's configured fetch, including SDK retries. The dispatcher then records:

- every HTTP response, including non-2xx, as terminal transport evidence;
- network errors and aborts as terminal error evidence with a message hash,
  never raw error content (name and code are also narrow allow-listed
  classifications, not arbitrary transport strings);
- a tracked clone promise for response ID, served model, upstream provider,
  prompt/completion/total tokens, and billing cost.

Missing cost is recorded as `costState: "unknown"`; it is never changed to
zero. For BYOK responses, total observed cost uses the same rule as the existing
`atlas-ai.ts` metadata extractor: `usage.cost + upstream_inference_cost`.
The clone does not modify the original response, so the existing provider
schema parser and metadata extractor continue to consume it normally. Phase A
does not inject cost back into SDK results and therefore cannot double-count by
itself.

The controller receives every clone-observation promise and must await all of
them before closing a batch. The boundary independently keeps the root
operation active until clone observations settle and rejects the operation if
clone persistence fails. Clone extraction is registered before terminal
response observation, so one observer failure cannot suppress all billing
evidence.

## Fresh-eyes corrections

The first implementation passed its original tests but the independent audit
found seven untested defects. They were fixed before authorizing Phase B work:

1. **Critical — escaped root/child async work:** ALS descendants could survive
   `run()` return, fetch after controller uninstall, or reuse a closed child's
   provenance. Root and child admission is now explicitly closed; in-flight
   fetches are drained; unawaited fetches are an error; late descendants fail
   with `SCOPE_CLOSED`.
2. **High — same-operation lineage race:** two simultaneous fetches shared one
   mutable `lastPhysicalCallId`, making repair/fallback parentage ambiguous.
   They now fail closed with `CONCURRENT_OPERATION_FETCH`; truly parallel
   attempts must use distinct root operation IDs.
3. **High — mutable-request TOCTOU:** the request could change while attestation
   or durable lease I/O was awaited. Research arguments are now snapshotted
   before parsing and the snapshot is what reaches the delegate.
4. **High — endpoint normalization bypass:** trailing slashes and query order
   were normalized for the lease while the original URL was sent, so facts
   could describe a different path. Path/query semantics are now preserved,
   and the controller test allow-list pins the full endpoint hash rather than
   trusting only origin plus path.
5. **High — instrumentation error misclassified as network failure:** an
   arbitrary controller `TypeError("fetch failed")` could be wrapped by the AI
   SDK as retryable and spend additional attempts. Non-boundary controller
   failures are now converted to safe, non-retryable boundary errors; genuine
   delegate network failures retain the SDK's normal retry behavior.
6. **Medium — forged root parent:** a root scope could carry an arbitrary
   `parentPhysicalCallId`. Roots now require null lineage.
7. **Medium — evidence leakage/suppression:** arbitrary `Error.name`/`code`
   strings could be persisted, and a clone-tracking or response-observer error
   could prevent other evidence. Error classifications are allow-listed and
   terminal/clone observations are independently attempted and drained.

## Cardinality decision

HTTP `n=1` means one completion, not necessarily one full question. Likewise,
a root JSON object may contain one question or an array of many questions.
Phase A therefore does not equate structural JSON shape with semantic candidate
count by itself.

Each candidate scope supplies an attestation ID/hash and expected candidates
per completion. The trusted controller checks that contract against an
allow-listed schema/parser contract and returns its attested count. The core
then multiplies it by the wire `n` and rejects any total mismatch before a
lease or network call.

Unstructured/text output whose parser contract is not allow-listed is
fail-closed. Phase B must add explicit parser attestations for prompt-inlined
JSON fallback and any batch/container schema; it must not infer their candidate
count from prompt wording.

## Test result

Command:

```powershell
.\node_modules\.bin\tsx.cmd --test tests/unit/atlas-research-fetch-boundary.test.ts
```

Result: **23/23 passed**.

Covered cases:

- exact no-scope promise/response/argument parity, including while a controller
  is installed;
- missing controller fail-close;
- controller persistence failures cannot masquerade as retryable network
  errors;
- double install/double uninstall rejection and active-operation uninstall lock;
- AI SDK default `maxRetries=2` producing three distinct leases/observations;
- `maxRetries=0` producing one lease;
- malformed JSON with an explicit child repair scope and separate candidate
  lease/cost observation;
- root/child unawaited-fetch draining, closed-child escape rejection, and
  delayed-clone ownership retention;
- concurrent ALS operation isolation plus same-operation concurrency
  fail-close;
- non-2xx, network error, abort, and unknown billing evidence;
- raw error-name/code redaction and mutable URL/header/body snapshotting;
- response clone extraction while the original response remains readable;
- clone preservation when either response observation or clone-tracking
  registration fails;
- BYOK cost parity with the existing metadata extractor;
- model, endpoint, cardinality, streaming, and un-attested text mismatch
  rejection before fetch;
- malicious caller values that match their own wire URL/model but violate the
  trusted controller allow-list.

Targeted TypeScript, ESLint, and `git diff --check` also pass.

## Phase B blockers

No experiment calls are authorized yet. The following work remains before any
real provider request:

1. Implement the harness controller adapter that atomically leases the existing
   capped candidate slots and durably stores terminal/clone evidence. It must
   enforce process-independent, historical uniqueness of operation/physical
   call IDs; the in-process Set only prevents concurrent reuse.
2. Build and freeze endpoint/model/plan plus schema/parser attestation
   allow-lists. The registry must also pin purpose/stage, so candidate-producing
   calls cannot claim zero-slot design/evaluation. The Phase A test controller
   is not a production harness.
3. Add semantic scopes to every production-equivalent call path: ordinary
   structured generation, JSON fallback, PREMIUM JSON repair, premium grammar
   answer/add-decoys/repair/parse-retry/reasoning-fallback, solver, design, and
   evaluator calls.
   Parallel high-level attempts must receive distinct root operation IDs; do
   not put simultaneous fetches under one root merely to share provenance.
4. Add parser disposition hooks above the SDK. Fetch evidence cannot know
   whether Zod parsing/gates accepted a question or map a multi-candidate body
   to individual candidate hashes.
5. Attest prompt-inlined JSON fallback and other non-schema cardinality. Until
   then those candidate paths intentionally fail closed in research scope.
6. Drain clone promises and unresolved leases before phase/batch closure; test
   crash recovery and replay semantics.
7. Add a static/runtime bypass audit for alternate provider instances, direct
   native fetch, REST clients, and any future transport with its own hidden
   retry loop.
8. Keep streaming disabled for research, or implement separately attested SSE
   usage/cost observation.
9. Only after all of the above, run route/browser parity and then deliberately
   open the first registered API experiment phase.
