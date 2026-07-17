# Production assignment budget v1 — independent architecture re-audit

Audit snapshot: 2026-07-15 KST  
Repository HEAD: `467c6d107137a91088d3eba1620ba4036a63d709`  
Working tree: intentionally dirty; `source-manifest.json` binds the exact reviewed files.  
Safety boundary: no provider/API call, network request, database connection, or secret access was used. This review changed no production source.

## Verdict

**BLOCK `CANARY_ENFORCE` / `ENFORCE`; PASS the default `OFF` path; conditionally ready for a schema-smoked `AUDIT` rollout.**

The implementation now has the right source-level architecture. A protected physical Atlas call is preceded by one durable lease transaction keyed by `WorkbenchAiJob.id`; the transaction locks the live Workbench row, increments the budget, and inserts the ordinal before the fetch delegate can run. The latest fixes also close the previously reported policy-drift fail-open, terminal-state resurrection, stale-price dispatch, unknown wire-cost surface, and Trigger retry defects.

The enforcing rollout is still blocked because its most important claim has not been demonstrated against PostgreSQL. The test named “100 concurrent assignments at cap 7” uses one process-local fake controller and 100 different job IDs. It does not execute `question-generation-assignment-budget.ts`, PostgreSQL row locks, the guarded budget update, or the unique ordinal constraint. No authoritative current price snapshot, provider/key hard-spend backstop, or statistically selected production cap was available to this audit either.

This is an evidence gate, not a recommendation to redesign the model split. Keep Standard on Gemini 3.5 Flash and Premium on Gemini 3.1 Pro unless separate quality/cost experiments reject that topology.

## What is now correct

### Physical-call placement and exact opt-out

- `atlas-ai.ts` supplies the composite `atlasProductionAssignmentFetch` to the shared provider.
- With no production scope, the production dispatcher directly returns its delegate call. With no research scope, the research dispatcher directly returns late-bound `globalThis.fetch`.
- `runWithQuestionGenerationAssignmentBudget` is non-`async`; `OFF` returns the callback value or promise unchanged and performs no Prisma/ALS work.
- Fast and Trigger wrap only `runQuestionGenerationWithEmptyRetry`, so SDK retries, repair calls, solver calls, and Premium ladder calls re-enter the physical fetch boundary while persistence and cost reporting remain outside it.
- A shared scope-kind coordinator prevents simultaneous research and production assignment identities.

### Durable admission and terminal fencing

- Enrollment persists policy version/hash, descriptor hash, selected caps, a canonical policy snapshot, and price snapshot identity.
- Admission first selects the `QUESTION_GENERATION` Workbench job in `PROCESSING` with `FOR UPDATE` (`question-generation-assignment-budget.ts:267-276`). This linearizes admission against terminal Workbench updates.
- The guarded budget update and lease insert occur in one Prisma transaction. A failed insert rolls back the counter; a committed but unsent lease remains conservatively consumed.
- Enforcing modes require both physical-call and reserved-cost capacity. Observed cost never reopens an ordinal or releases the conservative reservation.
- Semantic durable-state errors, including policy drift and closed/inactive jobs, are rethrown in both enrollment and pre-fetch paths; only genuine observational storage outages may fail open in `AUDIT`/`SHADOW` (`question-generation-assignment-budget.ts:395-405,455-484`).
- Trigger claims a job with a terminal-state compare-and-set and run ownership instead of unconditionally restoring `PROCESSING` (`workbench-question-generation.ts:227-257`).
- Known budget errors are terminalized, refunded, closed, and returned as a handled Trigger result rather than pointlessly retried (`workbench-question-generation.ts:497-506`).

### Price and wire proof

- The exact wire model, endpoint, request bytes, completion count, output ceiling, provider-routing hash, route-pinned fact, and Gemini reasoning-off fact are parsed before leasing.
- The full body is scanned for non-text/external-billing surfaces. An exact top-level priced-text allow-list additionally marks arbitrary provider options such as unknown model-routing fields as unpriced (`atlas-production-assignment-fetch-boundary.ts:260-341,446-468`).
- Enforcing policy rejects non-text requests, unknown cost shapes, missing output caps, route/model/endpoint drift, reasoning, oversized bodies, and unproved cost.
- The reservation rounds upward using integer micro-USD arithmetic, includes a positive fixed hidden-input overhead and fixed request fee, and supports either a pinned provider-set maximum or an attested maximum across every permitted router upstream.
- The production controller returns the snapshot’s last dispatch millisecond. The boundary checks it after the durable transaction and immediately before invoking fetch, so lock wait cannot turn a fresh pre-check into a stale send (`question-generation-assignment-budget.ts:381-393`; `atlas-production-assignment-fetch-boundary.ts:709-716`).

### Observation and error behavior

- Response observation uses a clone, a 16 MiB bound, a five-second read timeout, and cancellation.
- Observation is detached from the assignment scope. Observer failure cannot replace an SDK response/error, delay job completion, or cause a resend.
- Broad JSON fallback, structured repair, grammar solver, Premium ladder, outer generator, and Trigger surfaces recognize the stable non-retryable budget family.
- Malformed `SHADOW` policy becomes a durable `AUDIT` warning. Non-selected canary jobs remain observational; selected jobs fail closed.

### Migration shape

- The additive migration and Prisma schema agree on `TIMESTAMPTZ(3)`.
- Monetary counters use `BIGINT`; legal modes/states, non-negative values, hashes, positive caps, and unique ordinals have database constraints.
- Lease history uses `ON DELETE RESTRICT`; rollback is mode `OFF`, not destructive table removal.
- `npx prisma validate` passes.

## Remaining release blockers

### Gate 1 — real PostgreSQL concurrency and liveness proof

The source SQL is credible, but acceptance test 1 is not satisfied. `atlas-production-assignment-fetch-boundary.test.ts:173-205` increments a JavaScript variable in a fake controller and creates scopes for `job-0` through `job-99`. It proves only that the dispatcher does not call its delegate after the fake controller denies admission.

Before any enforcing cohort, run an isolated PostgreSQL integration test through the real wrapper/controller with a mocked native fetch:

1. Seed one `PROCESSING` Workbench job and one cap-7 policy.
2. Start 100 concurrent protected fetches for that same job.
3. Assert exactly seven committed lease rows, ordinals `1..7`, `leased_calls = 7`, and at most seven delegate calls.
4. Repeat with a high call cap and a cost cap equal to seven reservations.
5. Race admission against `FAILED`, `CANCELLED`, and stale-cleanup updates with barriers. The row-lock winner defines the order; no lease may linearize after a terminal transition.
6. Force a worker loss after lease commit and prove the ordinal is never reused by the same job on continuation.
7. Execute the migration in a disposable database and prove its negative-counter, invalid-state, duplicate-ordinal, and FK constraints.

The existing test should be renamed so it cannot be cited as database concurrency evidence.

### Gate 2 — authoritative price and independent spend evidence

The parser proves internal consistency of the supplied JSON and hash; it cannot prove that the rates are current or authoritative. Before a paid canary, seal:

- a fresh provider-authoritative rate snapshot for both production models and every permitted upstream;
- the exact provider-routing object/hash emitted in production;
- the fixed hidden-input overhead and any router/request fee;
- an independent provider/key hard-spend limit below the experiment risk ceiling;
- an alert on observed cost above reservation, served-model drift, unknown settlement cost, and unpersisted observational leases.

No numeric call/USD cap should be chosen from the current small July cells. First collect true physical leases in `AUDIT`, stratified by route, plan, type, difficulty, success/failure, and repair topology; pre-register candidate caps before inspecting canary outcomes.

## Residual P1 hardening

These do not justify an unbounded redesign, but they should be closed or explicitly accepted before broad enforcement.

1. **Production-specific SDK retry proof.** Research tests show default `maxRetries=2` produces three physical leases, but the production boundary’s real-SDK test uses `maxRetries=0`. Add a production test proving three committed ordinals for three delegate attempts and zero delegate calls after exhaustion.
2. **Composite and nesting matrix.** Add an exported double-composite no-scope test for exact promise/argument/synchronous-error identity and the reverse nesting direction (production outer, research inner).
3. **Terminal ledger reconciliation.** Normal Fast/Trigger paths close the budget, but generic stale cleanup does not. Liveness prevents further admission, yet stale rows can remain `ACTIVE`. Close them in the terminal transition or add a reconciler. Terminal completion/failure writes should also avoid overwriting a concurrent `CANCELLED` state.
4. **Observer cancellation.** The five-second wrapper stops tracking an observer but cannot cancel a Prisma query already in progress. Add a database statement/transaction timeout for settlement writes so a telemetry outage cannot retain connections indefinitely.
5. **Boundary-owned expiry invariant.** `dispatchNotAfterEpochMs` is optional in the controller interface. The production controller supplies it, but the boundary should require it whenever the active scope is enforcing so a future controller cannot accidentally omit the final freshness fence.
6. **Policy/cohort continuity.** Canary selection uses the full policy hash, which includes the frequently refreshed price snapshot and basis points. Refreshing prices reshuffles new canary membership and makes an interrupted in-flight job fail closed on retry. Prefer a stable rollout salt/cohort key separate from price content and persist the selected bucket.
7. **Schema hardening.** Couple `ACTIVE/CLOSED` to `closed_at`, constrain enforcing counters not to exceed caps, couple lease states to their terminal fields, and either map call counters to `BIGINT` or reject values above PostgreSQL `INTEGER`. A Workbench-job FK is absent; document that deliberate history-preservation tradeoff or add an audited archival relation.

## Verification performed

All checks below were offline and used mocked fetches only.

```text
PASS 62/62 focused tests
PASS npx tsc --noEmit --pretty false
PASS npx prisma validate
PASS focused ESLint
PASS git diff --check (line-ending warnings only)
```

The 62 tests cover the production/research boundaries, real SDK wire shape, policy parsing and cost reservation, OFF identity, static Workbench coverage, and retry envelope. They do not include a real PostgreSQL controller/migration test.

## Rollout decision

1. Keep production at `OFF` until the additive migration has passed a disposable/staging database smoke test.
2. Enable `AUDIT` only, verify lease completeness against provider-side request/cost totals, and monitor unpersisted observations.
3. Add `SHADOW` with pre-registered candidate caps and a sealed current rate snapshot.
4. Do not enable `CANARY_ENFORCE` until both release gates above pass and the remaining P1 items are either fixed or explicitly risk-accepted.
5. Keep rollback as an explicit environment change to `OFF` in both Next and Trigger. Preserve all budget and lease rows.

`source-manifest.json` is the authoritative snapshot boundary for this re-audit. Any source change must invalidate `verify.mjs` and receive a new review artifact.
