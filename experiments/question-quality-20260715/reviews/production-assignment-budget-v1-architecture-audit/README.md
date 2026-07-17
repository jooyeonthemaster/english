# Production assignment budget v1 — independent architecture audit

Audit snapshot: 2026-07-15 15:22 KST  
Repository HEAD: `467c6d107137a91088d3eba1620ba4036a63d709`  
Scope: design documents, Atlas research/production fetch seams, Atlas provider
construction, Workbench fast and Trigger paths, retry/error surfaces, stale-job
cleanup, and Prisma schema. No API, network, database, or secret access was used.
No production source was modified by this audit.

## Verdict

**BLOCK CANARY / IMPLEMENTATION DIRECTIONALLY SOUND BUT NOT YET SAFE.**

The central invariant is correct: one durable, atomic pre-send lease per
physical provider fetch, keyed by `WorkbenchAiJob.id`. The proposed fetch-level
placement is also the only placement that automatically counts AI SDK retries,
JSON repair, solver calls, and Premium ladder calls.

The design is not implementation-ready without the P0 closures below. The most
important defects are not cap-selection questions; they are retry, concurrency,
and rollout-semantics defects that can either resend after a response or block
ordinary traffic in a non-enforcing mode.

## Implementation state at the sealed snapshot

- production boundary, policy parser, shared ALS coordinator, schema, and
  additive migration are draft files;
- the production boundary exports a composite dispatcher, but `atlas-ai.ts`
  still supplies `atlasResearchFetch` directly to the provider;
- neither Workbench execution path installs a production assignment scope;
- no durable Prisma controller/admission CTE is wired;
- therefore production coverage is **zero** at this snapshot, which is correct
  for an unfinished OFF-mode implementation but not eligible for AUDIT/canary;
- no provider/API call was made by this audit.

## P0 findings

### P0-1 — response observation must never hold open or fail the assignment

The first draft production boundary started response observation after the
delegate returned and swallowed observer errors, but its scope finally block
waited for every observation with no deadline. This was reported during the
audit and the live draft removed that drain before this artifact was sealed.
That correction prevents the observer from directly delaying the assignment.

One closure remains: a never-settling clone/database observer is still retained
in the internal observation set forever, and clone `arrayBuffer()` has no read
deadline or streaming byte bound before allocation. This can leak memory in a
long-lived worker. Observation therefore still needs bounded cancellation even
though it must remain detached from the SDK result.

Required rule:

- once the delegate resolves to a `Response`, return that original response to
  the SDK without awaiting any telemetry;
- clone/cost/state observation is bounded, detached, and best effort;
- observer failure, timeout, process death, malformed cost, or oversized body
  leaves the full reservation consumed and never changes the SDK result;
- on delegate rejection, schedule error observation but rethrow the original
  error identity immediately;
- scope closure must not await or throw from observation work.

The pre-send lease, not post-response telemetry, is the safety authority.

### P0-2 — budget errors are currently swallowable by application fallbacks

`generateObjectViaJsonFallbackImpl` and `repairPremiumJsonOutputImpl` catch all
errors and convert them to `null`. A budget-exhaustion/configuration error can
therefore become an application retry, repair, or later outer attempt. The
general provider retry classifier is currently message-pattern based and does
not intrinsically recognize the new typed budget family.

Required rule:

- one cause-chain predicate recognizes the boundary and policy error classes,
  `retryable === false`, and the stable code;
- every broad fallback/repair catch rethrows that family before returning
  `null`;
- object/text application loops stop immediately;
- the outer quality loop must not turn it into salvage/relaxed work;
- the Trigger task marks the job terminal/refunds and does **not** rethrow a
  known non-retryable budget error;
- AI SDK default-retry behavior is covered by a real SDK test, not assumed.

### P0-3 — lease admission must atomically fence job liveness as well as caps

A cap-only conditional update is insufficient. `cleanupStaleWorkbenchAiJobs`
or another terminal transition can mark a job `FAILED` while a late async
continuation still owns its ALS scope. If admission does not check job state in
the same PostgreSQL statement, that continuation can lease and send after the
job was refunded/closed.

The enforcing admission statement must atomically require all of:

- matching `jobId`, immutable policy hash/version, descriptor hash, and mode;
- budget state `ACTIVE`;
- `WorkbenchAiJob.domain = 'QUESTION_GENERATION'`;
- job status `PROCESSING` and `deletedAt IS NULL`;
- remaining physical-call capacity;
- remaining conservative USD reservation capacity.

The counter increment and lease insert must be one transaction, preferably one
data-modifying CTE. A read-then-write Prisma sequence is not safe under
concurrency. At PostgreSQL `READ COMMITTED`, the guarded `UPDATE ... RETURNING`
on one budget row serializes contenders; `(jobId, ordinal)` remains a database
unique constraint. The 100-way/cap-7 test must produce exactly seven committed
leases and at most seven delegate calls.

### P0-4 — SHADOW/AUDIT must not become accidental enforcement

The design lists five rollout states, while its initial durable-row sketch has
only `AUDIT | ENFORCE`. During this audit, the live draft stopped enforcing
price **freshness** in `SHADOW`, but it still parses the full policy/snapshot on
the provider path. Missing/malformed/hash-mismatched snapshot or cell data can
therefore still throw and block ordinary shadow traffic.

Required semantics:

| Mode | Durable lease | Evaluate candidate caps | Block send |
|---|---:|---:|---:|
| OFF | no | no | never |
| AUDIT | yes | no | never |
| SHADOW | yes | yes, including config-invalid/would-block reasons | never |
| CANARY_ENFORCE | yes | yes | only deterministic canary cohort |
| ENFORCE | yes | yes | yes |

Malformed/stale/missing pricing is a recorded hypothetical block in SHADOW,
but a pre-send typed failure in enforcing cohorts. OFF must not query the new
tables at all.

### P0-5 — the current price proof is incomplete for routed provider work

For a text-only request, request UTF-8 bytes can be a conservative bound on the
caller-supplied tokenized bytes. It does **not by itself** prove the billed input
upper bound when a router/upstream may add hidden formatting/system overhead,
change route, apply a model alias, bill cache/reasoning modalities, or add a
request fee.

During the audit the draft first added a provider-routing hash and fixed
input-token overhead, then tightened it to require a non-empty pinned provider
order with fallbacks disabled and exact Gemini reasoning-off wire facts. Those
changes close the identified automatic-routing/reasoning hole in principle;
the final wire shapes and price registry still require zero-network tests and
an authoritative rate snapshot before enforcement.

An enforcing price snapshot must bind:

- exact wire model and endpoint;
- a pinned upstream/provider route, or the maximum rate/fee across every route
  the request permits;
- explicit fixed hidden-input overhead (or an authoritative proof it is zero);
- exact reasoning-off wire facts for this product, or a separate proved bound
  for reasoning tokens;
- input and output rates, request fee, cache/reasoning/modal rates where
  applicable, completion-count semantics, and output-token ceiling;
- a maximum request-body byte count and an allow-list of the known text-only
  body shape; unknown modalities/attachments fail closed;
- capture/expiry timestamps, canonical content hash, policy hash, and immutable
  snapshot identity.

Use integer arithmetic and round upward. Persist monetary counters as
PostgreSQL/Prisma `BIGINT` micro-USD values, not `Int` and not floating-point.
Unknown/malformed observed cost never releases reservation. A served-model or
route mismatch also retains the full reservation. The provider/key hard spend
limit remains an independent final backstop.

## Required minimum architecture

### 1. Composite fetch seam with exact opt-out identity

The provider should receive one composite fetch:

```text
AI SDK
  -> production-assignment dispatcher
       no production scope: return research dispatcher(input, init) directly
       production scope: snapshot -> parse exact wire -> durable lease -> delegate
  -> research dispatcher
       no research scope: return native delegate(input, init) directly
       research scope: existing sealed research instrumentation
  -> late-bound globalThis.fetch
```

Neither dispatcher may be declared `async` at its outer no-scope seam. With no
scope, it must return the exact delegate promise/response, forward the exact
argument identities, and preserve synchronous thrown-error identity. Tests
must prove this through the **double-composed** dispatcher, not only each seam
in isolation.

Every AI SDK retry re-enters this composite fetch and therefore requests a new
durable lease immediately before its actual delegate call. Application retries,
repairs, solver calls, and ladder calls naturally do the same.

### 2. One shared ALS scope-kind coordinator

The initial two independent private ALS stores made nesting detection
asymmetric. A shared scope-kind coordinator was added to the live draft during
this audit. Keep that structure, add both-direction zero-network tests, and
retain the defensive fetch-time assertion.

Use a tiny shared coordinator with the active kind `research | production`.
Both root scope entry functions claim it; claiming a different kind rejects
before the callback, lease, or delegate. Research child scopes retain the
existing research claim. Keep a defensive fetch-time conflict assertion as a
second line of defense. Do not solve this with mutually importing boundary
modules and a circular initialization dependency.

### 3. Durable enrollment and continuation

For active modes, create the budget row in the same database transaction as
the `WorkbenchAiJob` row. Persist immutable policy/descriptor facts; do not
recompute or silently raise a cap on Trigger retry. The Trigger task loads and
validates the existing row by the payload's same `jobId`. It must never create
a fresh budget merely because `ctx.run.id` changed.

Pre-deployment/missing-budget jobs need an explicit grandfather policy. In an
enforcing deployment, a missing row must not be silently auto-enrolled after
provider work may already have happened.

Recommended minimal budget row:

```text
jobId PK/FK(RESTRICT), policyVersion, policyHash, descriptorHash,
mode, state(ACTIVE|CLOSED), maxPhysicalCalls?, leasedCalls BIGINT,
maxReservedCostMicros?, reservedCostMicros BIGINT,
observedCostMicros BIGINT, priceSnapshotId?, priceSnapshotHash?,
createdAt, updatedAt, closedAt?
```

Recommended lease row:

```text
id PK, jobId FK(RESTRICT), ordinal BIGINT, requestedModel,
endpointHash, reservedCostMicros BIGINT, observedCostMicros?,
state(LEASED|HTTP_RESPONSE|NETWORK_ERROR), httpStatus?,
createdAt, settledAt?, UNIQUE(jobId, ordinal)
```

The price snapshot needs immutable private storage (relational row or canonical
payload plus hash), not only an ID that cannot reconstruct the old policy.
Database checks should enforce non-negative monotonic counters, cap/nullability
rules by mode, legal states, and unique ordinals.

### 4. Admission SQL shape

Enforcing admission is one guarded mutation plus insert:

```sql
WITH admitted AS (
  UPDATE question_generation_call_budgets b
     SET leased_calls = b.leased_calls + 1,
         reserved_cost_micros = b.reserved_cost_micros + $reservation
    FROM workbench_ai_jobs j
   WHERE b.job_id = $job_id
     AND j.id = b.job_id
     AND b.state = 'ACTIVE'
     AND j.domain = 'QUESTION_GENERATION'
     AND j.status = 'PROCESSING'
     AND j."deletedAt" IS NULL
     AND b.policy_hash = $policy_hash
     AND b.descriptor_hash = $descriptor_hash
     AND b.leased_calls < b.max_physical_calls
     AND b.reserved_cost_micros + $reservation
           <= b.max_reserved_cost_micros
  RETURNING b.leased_calls
)
INSERT INTO question_generation_call_leases (..., ordinal, ...)
SELECT ..., leased_calls, ... FROM admitted
RETURNING id, ordinal;
```

Zero returned rows maps to a stable reason without a send. AUDIT/SHADOW use an
unconditional atomic ordinal increment and record hypothetical cap/config
results; they do not reuse an ordinal and do not block.

### 5. Fast and Trigger placement

- Both route job-creation paths enroll the immutable budget next to job
  creation when mode is active.
- Both execution paths construct the controller from the persisted row and
  wrap **only** `runQuestionGenerationWithEmptyRetry` in the production ALS
  scope. This includes every relevant English Workbench provider call while
  excluding persistence/cost-dashboard work.
- Job terminal transitions close the budget. Lease admission still joins the
  live job status so a missed close cannot authorize late sends.
- `cleanupStaleWorkbenchAiJobs` must close/fence the budget consistently with
  its terminal/refund transition.
- Fast and Trigger use `WorkbenchAiJob.id`; Trigger `ctx.run.id` is telemetry,
  never budget identity.
- Other callers of the shared generator remain unenrolled/no-scope and preserve
  exact current behavior until separately designed.

## Prisma migration and rollback

1. A timestamped additive migration draft now exists. Before use, align its
   `TIMESTAMPTZ` columns with explicit Prisma native types (or change SQL to the
   schema's timestamp type), use history-preserving FK behavior, add legal-mode,
   mode/cap-nullability, state, and hash checks, and add immutable
   price-snapshot storage. Generate the client and validate the actual SQL.
2. Deploy the schema first with application and Trigger worker mode `OFF`.
3. Deploy code in `OFF`; prove byte/promise/error identity and zero table
   dependency.
4. Enable `AUDIT`, then `SHADOW`, then deterministic canary only after physical
   lease data and pricing proof are sealed.
5. Rollback order is environment mode `OFF` in both Next and Trigger, then code
   rollback. Do **not** drop the tables or historical leases. Prisma has no
   automatic down migration here; historical retention is the rollback.
6. A Next/Trigger policy-version mismatch fails closed only in enforcing
   cohorts and is surfaced operationally; it must never mint a replacement row.

Use `ON DELETE RESTRICT` for job-to-budget/lease history unless a separately
audited archival strategy exists. Current code appears to soft-delete jobs, so
preserving the cost-control ledger is the safer default.

## Acceptance test delta

The design's existing tests remain required. Add these cases before canary:

1. double-composed no-scope exact promise, response, arguments, and synchronous
   error identity;
2. research-only and production-only dispatch, plus both nesting directions
   rejected before callback/lease/delegate;
3. real AI SDK `maxRetries=2` produces exactly three leases for three delegate
   calls, while pre-send exhaustion produces zero further calls;
4. budget error survives every object/text/fallback/repair/ladder/outer/Trigger
   catch surface without retry;
5. never-resolving response observer does not delay SDK result, job completion,
   or cause a second delegate call;
6. 100 concurrent admissions at cap 7, plus a mixed call/USD race;
7. stale cleanup/terminal transition racing admission authorizes no post-terminal
   lease;
8. Trigger retry with a new run ID resumes ordinal N+1 on the same job row;
9. SHADOW with stale/malformed pricing records would-block but still delegates;
10. enforcing requests with missing output cap, unknown model/route, non-text or
    unknown body shape, stale/hash-mismatched snapshot, or unproved overhead all
    fail before lease/send;
11. migration constraints reject negative counters, duplicate ordinals,
    invalid state/mode, and cap-nullability contradictions;
12. a static call-site test proves enrolled Workbench paths use the composite
    fetch and do not import a direct Atlas/OpenRouter REST helper/global fetch.

## Nine requested checks

| Check | Finding |
|---|---|
| exact no-scope identity | Correct dispatcher pattern exists; prove the final double composition. |
| research/production ALS nesting | Shared coordinator was added during audit; both-direction tests still required. |
| SDK retry physical lease | Fetch-boundary placement is correct; each SDK delegate attempt must lease. |
| Trigger durable continuation | Use persisted job-keyed row; never key/reset by Trigger run ID. |
| PostgreSQL atomic concurrency | Guarded update + insert, BIGINT, liveness join, unique ordinal required. |
| observation failure/no resend | Blocking drain was removed; detached observer still needs bounded cancellation/memory behavior. |
| price snapshot/worst cost | Hash/freshness work is promising, but routed/hidden overhead proof is incomplete. |
| Prisma migration/rollback | Additive draft exists but has timestamp drift, CASCADE history loss, and missing constraints/snapshot storage. |
| fast + Trigger placement | Enroll beside job creation; scope only the provider-generation call in both paths. |

## Final gate

Do not select a numeric production cap from the current small post-deployment
cells. First ship OFF/AUDIT instrumentation with the P0 invariants above, collect
true physical-call distributions, pre-register cap candidates, then evaluate
quality, failure, and cost jointly. The independent provider/key spend cap is
mandatory before any enforcing canary.
