# Production assignment call budget v1

Status: **DESIGN COMPLETE / IMPLEMENTATION NOT YET ENABLED**

This design closes a cost-control gap in Workbench question generation without
changing the Standard/Premium model split or choosing a cap from inadequate
samples.

## 1. Finding

The current retry topology has more than one layer:

1. outer quality attempts in `runQuestionGenerationWithEmptyRetry`;
2. application retries in `generateQuestionObject`;
3. AI SDK retries;
4. structured-output fallback and repair;
5. grammar Premium ladder and solver calls;
6. a Trigger.dev retry of the whole Workbench task. The ordinary caught-error
   path marks the job `FAILED`, so the next attempt normally skips; a timeout,
   worker loss, or process crash before that terminal write can still reopen a
   `PROCESSING` job after provider work, which is the duplication threat.

`usageEvents` is not a physical-call ledger. It records successful top-level
generation results, while an SDK retry, a failed response, a repair before an
exception, or a retried Trigger run can be absent. A process-local counter is
also insufficient because a Trigger retry starts a new execution context.

Therefore the safety invariant must be defined at the network boundary and
persisted by `WorkbenchAiJob.id`:

> No Atlas/OpenRouter request may be sent for a protected Workbench assignment
> unless that assignment has first obtained one durable, atomic call lease.

## 2. Non-goals

- Do not add a ladder to Standard generation. Existing experiments rejected
  that topology on cost/quality grounds.
- Do not set a universal cap from the post-deployment Grammar/Blank sample. The
  relevant cells are still too small, including cells with only one job.
- Do not treat reported `attempts`, successful usage rows, or average cost as a
  physical-call upper bound.
- Do not silently lower quality by cutting off calls and shipping an invalid
  candidate. Exhaustion is a typed failure unless a candidate that already
  passed all fatal gates exists.
- Do not claim coverage for non-Workbench or direct REST call paths until each
  path is explicitly enrolled and tested.

## 3. Durable state

The implementation should add a dedicated assignment row, not mutate arbitrary
JSON inside `WorkbenchAiJob.config`:

```text
QuestionGenerationCallBudget
  jobId                 primary key / WorkbenchAiJob foreign key
  policyVersion         immutable string
  mode                  AUDIT | ENFORCE
  maxPhysicalCalls      nullable only in AUDIT
  leasedCalls           monotonic integer
  maxReservedCostMicros nullable only in AUDIT
  reservedCostMicros    monotonic safety reservation
  observedCostMicros    lower bound from provider-reported usage
  priceSnapshotId       immutable, required in enforcing modes
  createdAt / updatedAt

QuestionGenerationCallLease
  id                    primary key
  jobId
  ordinal               1..N, unique with jobId
  requestedModel        parsed from the exact wire body
  endpointHash          no URL credentials or request body
  reservedCostMicros    conservative pre-send upper-bound reservation
  observedCostMicros    nullable provider-reported charge
  state                 LEASED | HTTP_RESPONSE | NETWORK_ERROR
  httpStatus            nullable
  createdAt / settledAt
```

The budget row and lease row are created in one database transaction. In
ENFORCE mode the transaction uses one conditional increment equivalent to:

```sql
UPDATE question_generation_call_budgets
SET leased_calls = leased_calls + 1
WHERE job_id = $1 AND leased_calls < max_physical_calls
RETURNING leased_calls;
```

The conditional admission checks both call capacity and the assignment's
remaining conservative cost reservation. The reservation is derived from the
exact wire model, exact output ceiling, bounded input/request size, and a
hash-pinned price snapshot. If an upper bound cannot be proved, ENFORCE rejects
before send. The provider account/key also retains its independent campaign or
production spending cap; the application ledger is not a substitute for it.

No returned row means exhausted. A lease may conservatively remain consumed if
the process dies after the transaction and before the HTTP send. Safety takes
priority over reclaiming an ambiguous lease.

When a response contains a trustworthy provider charge, settlement records it
but must not make an already consumed physical-call ordinal reusable. A later
version may release only the unused *cost* reservation in one atomic settlement
transaction. Unknown, malformed, network-error, or crash outcomes retain their
full reservation. v1 may intentionally keep all worst-case reservations if the
release proof is not yet audited.

## 4. Placement

The physical boundary wraps the fetch supplied to the Atlas/OpenRouter SDK.
It runs before the existing research boundary's delegate and before the native
network call. This makes SDK retries, JSON repair, solver calls, ladder calls,
and provider fallbacks consume separate leases automatically.

The Workbench fast route and Trigger task install the assignment scope using
the same `WorkbenchAiJob.id`. A Trigger retry therefore reopens the same durable
budget instead of receiving a fresh counter.

The exact no-scope path remains a direct delegate call. Research campaign calls
continue to use their separately sealed campaign controller; production budget
enrollment must not weaken or replace the 1,000-candidate campaign ledger.
Installing both a research-campaign scope and a production-assignment scope for
one request is rejected before network I/O. This prevents one physical response
from receiving two incompatible identities or being reported in the wrong
estimand.

## 5. Error semantics

Budget exhaustion raises a stable typed error:

```text
QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED
```

It is non-retryable at all application layers. The fetch boundary can still be
invoked again by an SDK that has already decided to retry, but it must reject
without network I/O. The outer generator, Trigger task, and user-facing mapper
must recognize the stable code rather than rely only on localized text.

Observation writes after the HTTP request are best effort and must never cause
the SDK to resend a response that was already received. The pre-send lease is
the authoritative safety record.

## 6. Rollout states

1. `OFF`: exact current behavior and no budget-table dependency.
2. `AUDIT`: durable leases and response states, no cap. Used to measure the true
   physical-call distribution by plan, type, difficulty, success, and failure,
   plus reported cost coverage and the gap between reservation and settlement.
3. `SHADOW`: a candidate cap is evaluated and logged but not enforced.
4. `CANARY_ENFORCE`: fail-closed for a small, deterministic job cohort.
5. `ENFORCE`: only after the pre-registered canary criteria pass.

Malformed or contradictory configuration is fail-closed before the first
provider call in any enforcing state. A policy version and cap are immutable
for a job; a retry cannot silently raise them.

## 7. Cap-selection protocol

Caps are selected per production topology, not by one global average. At
minimum stratify:

- Standard versus Premium;
- Grammar, Blank, and other types;
- Intermediate versus Killer;
- fast route versus Trigger;
- completed, failed, and refunded jobs.

Use true lease counts from AUDIT, not `usageEvents`. Pre-register the candidate
cap before looking at canary outcomes. Report success/fatal-validity/beauty and
cost jointly. A cap is ineligible if it creates a new fatal-invalid shipment,
raises user-visible failure beyond its declared margin, or makes cost
unbounded through another unenrolled path.

Select a call cap and a USD cap together. The call cap controls retry topology;
the USD cap protects against an unusually long prompt/output or a model-price
change. A stale or mismatched price snapshot blocks ENFORCE rather than silently
falling back to an average historical price.

No numeric cap is selected in this document. The July post-deployment cells in
the current ledger are evidence of topology and under-observation, not enough
evidence for a safe production threshold.

## 8. Acceptance tests

The implementation is not eligible for canary until all of these pass:

1. 100 concurrent lease attempts against cap 7 produce exactly seven durable
   leases and at most seven delegate invocations.
2. SDK retry simulation consumes a new ordinal for every actual delegate call.
3. JSON repair, grammar solver, and every Premium ladder stage consume leases.
4. Trigger retry with the same job ID continues from the previous ordinal.
5. A process crash after lease commit never makes the ordinal reusable.
6. Exhaustion is non-retryable and produces zero additional delegate calls.
7. Observation failure after an HTTP response does not trigger a resend.
8. OFF mode is byte/identity-equivalent at the fetch delegate seam.
9. Research mode still enforces its own registered campaign budget and cannot
   be converted into a production-budget-only call.
10. Static coverage rejects a new Workbench question-generation provider path
    that bypasses the enrolled Atlas fetch boundary.
11. No secret, prompt, passage, response body, or student/academy identifier is
    written to public research artifacts.
12. Migration rollback disables enrollment without deleting historical leases.
13. A request whose worst-case reservation exceeds remaining USD capacity is
    rejected before delegate invocation even when call slots remain.
14. Unknown/malformed usage cost never releases a reservation; a valid settled
    cost cannot release a physical-call ordinal.
15. Price-snapshot hash/model/rate drift is fail-closed in enforcing modes.
16. Simultaneous research and production budget scopes are rejected before a
    lease or delegate invocation.

## 9. Evidence still required

- Independent audit of the current production usage ledger, including daily
  and model-specific totals.
- Exact physical-call AUDIT data after this boundary is deployed.
- A price snapshot taken immediately before any paid campaign/canary.
- S1 research results and confirmatory holds. S1 remains at 0/1000 until its
  registry, key restrictions, provider rights, and hard caps all pass.
