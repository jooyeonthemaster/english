# Harness v3 fresh-eyes adversarial audit

Audit date: 2026-07-15 KST  
Scope: `experiments/question-quality-20260715/harness` only  
Model/API calls made: **0**  
Canonical campaign DB writes: **0**

## Verdict

- **Harness-local accounting invariants after audit fixes: PASS.** The isolated
  SQLite guard passes 25/25 adversarial tests, isolated strict TypeScript checking,
  and ESLint.
- **Opening an API phase: FAIL / BLOCKED.** The production provider boundary and
  immutable generation provenance required by `OBS-001` do not exist yet. The
  canonical registry has zero operational phases and the canonical SQLite file is
  absent, which is the correct fail-closed state.

Passing the harness-local suite is not evidence that a production generation run is
counted. At present, a caller can still bypass or misdescribe the ledger at the
unimplemented provider/wiring boundary.

## Defects independently reproduced and fixed

1. **Unreconciled billing could be finalized.** A call settled as `unknown` with
   `usageFinal=false` could close its batch. This contradicted
   `CALL-LINEAGE-DESIGN.md`, and the old delayed-reconciliation test accidentally
   approved the bad behavior.
   - Fix: batch finalization now rejects any call without final billing usage.
   - Fix: reconciliation cannot downgrade final usage or replace an already-bound
     provider request ID.
2. **Read-only/preview CLI could create the canonical DB.** With `LOCALAPPDATA`
   redirected to an isolated temp directory, `cli.ts status` returned success and
   created `question-quality-20260715.sqlite`.
   - Fix: only explicit `init --apply` may create the canonical store.
   - Fix: normal opens reject a missing, empty, or partial v3 schema.
3. **A phase USD overrun was hidden from sibling batches.** For an open batch, the
   phase commitment used only `batch.max_cost_usd`; it ignored an effective observed
   cost already above that allocation. A sibling batch could therefore start more
   calls after the phase had crossed its cap.
   - Fix: an open batch contributes `max(allocated USD, effective observed USD)` to
     phase commitment. The overrun now blocks sibling batches.
4. **Multi-output overflow stopped only one batch.** An unreserved extra full
   candidate breached its batch, but another already-reserved batch could start new
   calls, allowing campaign-wide actual outputs to exceed recorded attempt slots.
   - Fix: any detected candidate-output overflow permanently halts all subsequent
     campaign reservations and call authorizations. Closure/reconciliation of
     existing work remains possible.
5. **Cross-process call-time slot atomicity was untested.** Existing tests covered
   cross-process batch allocation but not two provider calls racing for the final
   pre-network candidate slot.
   - Fix: a dedicated test worker now races two processes; exactly one call becomes
     `in_flight`, exactly one slot is consumed, and the loser fails before provider
     execution.

## Verified properties after fixes

- Candidate-output slots are committed in the same `BEGIN IMMEDIATE` transaction
  that authorizes a physical call, before the callback can run.
- Failed, timed-out, schema-invalid, repaired, regenerated, and multi-output calls
  cannot reuse a consumed candidate slot through the public session path.
- `no_candidate` has no producer, output index, or synthetic output hash.
- Parsed candidates remain `parsed_pending` until one accepted/rejected decision;
  unresolved calls, unclassified slots, pending decisions, and unfinalized billing
  all block batch finalization.
- `(producingCallId, outputIndex)` and submitted output hashes are campaign-unique.
- Open/finalized batch allocation, physical-call, phase USD, and global 1,000-slot
  checks are transactionally serialized in the tested store.
- Idempotent replay does not invoke the physical callback a second time.
- Registry revocation blocks new work but does not prevent idempotent replay or the
  safe closure of already-authorized work.
- The canonical store is still absent and the canonical registry reports
  `operationalPhases=0`, `allPhasesBlocked=true`.

## Exact remaining blockers before any API call

### B1 — Physical provider enforcement is missing (critical)

There is no production AsyncLocalStorage/custom-fetch boundary around every
OpenRouter HTTP request, and no static/runtime block on direct `fetch`, direct AI SDK
use, alternate providers, or a callback that internally performs several SDK
retries. `BudgetSession` can account for one declared callback; it cannot prove that
the callback corresponds one-to-one with one physical request. Until the provider
boundary is wired and tested with mocked retry/JSON-repair/ladder flows, the 1,000
cap is not enforceable in production.

### B2 — Candidate identity/cardinality is caller-asserted (critical)

`expectedCandidateOutputs`, `observedParsedOutputCount`, `callKind`, `outputIndex`,
and `outputHash` are supplied by the caller. The guard does not receive the parsed
output and therefore cannot compute the normalized hash or observed cardinality
itself. A caller can under-report an overflow, label a full-question call as
`design`, or submit arbitrary distinct hashes for duplicate questions. The provider
and schema-parser boundary must derive these values, and recovery CLI input must be
cross-checked against immutable response evidence.

### B3 — Conservative USD authorization is caller-asserted (critical)

`reservedCostUsd` may be zero and is not derived from an allowlisted requested
model, token ceiling, retry policy, or frozen price table. The guard can retain and
halt after an actual overrun, but it cannot prevent the money from being spent if
the pre-network reservation was understated. Provider wiring must calculate the
reservation, record its price-table version, and reject unknown models/token caps.

### B4 — `OBS-001` provenance requirements are not represented (critical)

The registry itself requires requested plan, effective plan, and served model to be
distinct, plus immutable prompt/schema/gate/ladder provenance. The v3 schema records
only one `model` string, a stage, and a provider request ID. It has no served model,
provider, requested/effective plan, prompt hash, schema hash, gate-policy hash,
ladder-policy hash, runner version, corpus row, or generation-policy identifier.
`OBS-001` therefore remains incomplete even though slot accounting passes.

### B5 — The audit hash chain is not a state commitment (high)

`verifyAuditChain()` verifies only `audit_events`. Mutable rows in `batches`,
`provider_calls`, `candidate_slots`, and `call_candidate_slots` are not replayed or
hashed against that chain. A direct SQLite edit to those tables can change accounting
while the audit chain still verifies. Before calling this ledger tamper-evident,
either add event-to-state replay/digests and schema-integrity checks or explicitly
limit the threat model and enforce filesystem/process access controls.

### B6 — Alternate-ledger/process-environment bypass remains (high)

The CLI has no `--store`, and normal canonical opens now fail closed, but the
canonical path still depends on per-process `LOCALAPPDATA`/home and the test-only
store API is runtime-gated by an environment variable. A separate process can use a
different environment or intentionally enable test mode. The dedicated runner and
static checks must pin/attest the expected absolute canonical path and reject test
imports/environment in API-capable code.

### B7 — An output overflow can only be detected after it occurs (high)

The new campaign halt prevents subsequent work, but it cannot undo an extra full
candidate already emitted by a misconfigured multi-output request—especially if
other calls were already in flight. Exact adherence to the user's maximum of 1,000
therefore additionally requires the provider request/schema to enforce the declared
output cardinality and the global plan to retain a reviewed safety margin.

## Verification evidence

```text
PASS 25/25 budget-guard v3 tests
eslint experiments/question-quality-20260715/harness: exit 0
isolated strict TypeScript check for all harness files: exit 0
canonical DB exists: false
registry operational phases: 0
registry all phases blocked: true
```

The repository-wide `tsc --noEmit` was also run. It currently fails on two
pre-existing, non-harness errors:

- `src/app/g/unit/[unitId]/page.tsx:68` (`number | null` assigned to `number`)
- `src/lib/grammar-drill/home.ts:188` (`part` includes `0` and `frequency` includes
  `null` outside the target card type)

No harness TypeScript error was reported, and the isolated harness check passes.

## Required gate to change API readiness to PASS

1. Implement and adversarially test the physical provider boundary, including SDK
   retries, JSON repair, premium ladder, candidate repair, solver rejection, crash
   recovery, and concurrent AsyncLocalStorage isolation.
2. Derive candidate cardinality/hash and cost reservations at that trusted boundary;
   do not accept them as arbitrary runner input.
3. Add the immutable provenance fields required by `OBS-001` and prove they survive
   export/restart/reconciliation.
4. Bind mutable accounting state to verifiable audit evidence or formally narrow and
   enforce the ledger threat model.
5. Freeze operational registry phase/call/USD caps, review their sum against the
   998-candidate protocol plus safety policy, then explicitly initialize the
   canonical store. Only after all prior items pass may an API phase be opened.
