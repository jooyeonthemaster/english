# API budget guard v4

This directory contains the campaign-wide guard for `question-quality-20260715`.
The old JSON ledger is legacy evidence only: v4 never reads, migrates, or modifies
`../budget-ledger.json`.

Runtime requirement: Node.js 24 with the built-in `node:sqlite` module.

## Candidate/call lineage

The unit of the 1,000 cap is a physical call's opportunity to emit a full question,
not a top-level request. A candidate-output call therefore declares
`expectedCandidateOutputs` before network I/O. `beginCall` atomically:

1. checks the registry, batch call cap, conservative USD cap, batch slot allocation,
   and campaign-wide 1,000 cap;
2. permanently creates that many `awaiting_result` candidate slots;
3. links every slot to the physical call and records `authorized -> in_flight`.

Transport failure, timeout, schema failure, SDK retry, full-candidate repair, and
hard regeneration do not recover those slots. Every later physical call that can
emit a full candidate reserves fresh slots. `design` and `evaluation` calls reserve
zero candidate slots but still consume physical-call and USD capacity and record
usage, cost, latency, and provider identity.

Every call also records `logicalOperationId` plus a zero-based
`physicalAttemptOrdinal`; the pair is unique inside a batch. This makes physical
retry order auditable without guessing from timestamps. Candidate repair/regeneration
may additionally record `parentCandidateSlotId`; the guard requires that parent to
be a parsed candidate in the same batch.

Candidate terminal paths are deliberately asymmetric:

```text
awaiting_result -> no_candidate
awaiting_result -> parsed_pending -> parsed_accepted | parsed_rejected
```

- `no_candidate` records only a linked `terminalCallId` and bounded failure reason.
  It has no synthetic producer, output index, or output hash.
- A parsed candidate records the actual producing physical call, its output index,
  and a normalized-output SHA-256. It stays `parsed_pending` until deterministic
  gates/solver produce one accepted/rejected decision.
- `(producingCallId, outputIndex)` and normalized output hashes are unique across
  the campaign as soon as a candidate becomes pending, not only after acceptance.
- One physical call may reserve/classify multiple outputs. Classification is atomic
  and must cover every linked slot. Missing outputs become `no_candidate`. If the
  parsed output count exceeds the pre-network reservation, the excess is never
  admitted, the batch is breached, and all subsequent campaign reservation/call
  authorization is halted.
- Batch finalization separately refuses unresolved calls, calls without final
  billing usage, unclassified `awaiting_result` slots, and `parsed_pending`
  decisions.

## Phase-B durable controller

`DurableAtlasResearchController` adds a second, stricter layer for production-parity
research. Its three candidate-capacity measures are intentionally different:

1. `maxCandidateOutputs` is the temporary worst-case whole-assignment envelope
   admitted before the assignment starts. A sibling assignment cannot take that
   capacity while the assignment is open.
2. `usedCandidateOutputs` counts permanently consumed pre-fetch ITT opportunities.
   A proved `never-sent` call records zero observed output, but its already-issued
   opportunity is not recycled into queue top-up. `unknown-after-send` also consumes
   the opportunity and keeps billing non-final.
3. `observedSemanticCandidates` counts every full question found by the frozen,
   response-bound semantic parser. This includes a semantically complete question
   inside schema-invalid raw output. Overflow hashes are retained, the assignment
   is quarantined, and the campaign is breached.

The controller protocol is:

- seal a self-hashed registry containing entries, a stage-transition graph,
  per-entry multiplicities, assignment envelopes, parser artifacts, and pricing
  proofs;
- construct the controller, which idempotently registers that registry in SQLite;
- call `admitAssignment` once per independent root before any provider fetch;
- lease every physical fetch through the active research boundary;
- the current dynamic-child verification primitive accepts a self-hashed
  derivation receipt binding the frozen derivation artifact, exact parent response
  hash, parent physical call, and exact child body/prompt hashes;
- let the trusted research response-capture seam hand exact bounded response
  bytes directly to the controller; it automatically runs the frozen parser once
  for every successful candidate-capable physical response (including multiple
  SDK successes), then record the later gate decision;
- call `closeAssignment` only after terminal, clone/billing, parser, and candidate
  evidence is complete.

Registry, call-contract, terminal, clone, private raw-body, parser, and
semantic-candidate evidence is durable and append-only. Raw bodies are capped at
16 MiB and omitted from the JSON export; the SQLite evidence backup is private.
Inside an active research scope the boundary consumes the original response
stream under that cap and reconstructs the SDK-facing `Response` from the exact
captured bytes. This avoids the unbounded unread branch created by
`Response.clone()` teeing. An over-limit/read-failed response is not forwarded;
its `body-too-large`/`clone-error` evidence is drained fail-closed. The production
no-scope path still returns the exact native fetch promise and response unchanged.
On restart the controller hydrates existing assignments,
settles independently persisted terminal evidence, reconciles independently
persisted clone evidence, and never replays an ambiguous lease. Operators must
classify such a lease as `never_sent` only with proof that delegate I/O did not
begin; otherwise it is `unknown_after_send` and closure remains blocked until final
billing reconciliation.

Pricing contracts self-hash positive maximum-provider USD rates, a provider
allow-list snapshot, server-token overhead, and a canonical validity window no
longer than 24 hours. Controller construction also re-hashes the archived raw
OpenRouter snapshot, derives the model's maximum prompt/completion rate across
every endpoint and tier override, and recomputes its provider-endpoint allow-list
hash; an underpriced or altered proof fails closed. New assignment/call admission
fails outside the validity window.
Every entry also freezes a maximum serialized request-body byte count. Registry
sealing computes the sum of all entry multiplicities and refuses any assignment
contract whose physical-call, candidate-output, or conservative USD envelope is
smaller than that complete graph worst case. Runtime derived bodies above their
frozen byte bound fail before lease/network.
This is not yet an executable production handoff: the public caller can read the
latest parent physical-call ID, but cannot obtain the trusted parent response hash
or precompute the AI SDK's exact serialized wire body without reconstructing
trusted evidence. Production call sites must remain blocked until the boundary,
after parsing the actual child wire request, asks the controller to mint/authorize
the receipt from its durable parent body and transition. Caller-minted receipts
are a verification fixture only, not an integration API.
This local conservative reservation still needs a provider-side hard spending
ceiling before a real campaign.

## Safe runner API

Use a `BudgetSession` at the actual provider boundary:

- `runProviderCall` is type- and runtime-scoped to `design`/`evaluation` calls.
- `runCandidateOutputCall` is the only session runner for physical calls capable of
  returning full candidates. It reserves slots before invoking the callback and
  returns their IDs. Provider/usage-observation failures settle the call and close
  all its slots as hashless `no_candidate` automatically.
- `classifyCandidateCall` atomically identifies the actual parsed producer(s) or
  records no-candidate reasons for every reserved slot.
- `finalizeParsedCandidates` records the later gate/solver decisions, once.

For SDK retries, retain each physical-call handle. Classify failed/unused responses
as `no_candidate`; classify only the response whose schema-valid output actually
contributed the parsed candidate as `parsed`. A repair that emits a new full
candidate is another candidate-output call and therefore another slot.

`beginCall`, `settleCall`, classification, and finalization remain public for crash
recovery and audit tooling. They are not permission to place network I/O outside the
session/provider boundary.

## Campaign safety model

- The campaign has one fixed SQLite store and a permanent cap of 1,000 candidate
  attempt slots. The production CLI cannot select another store. By default the DB
  lives at `%LOCALAPPDATA%/Codex/research-ledgers/question-quality-20260715.sqlite`
  on Windows and `~/.codex/research-ledgers/question-quality-20260715.sqlite`
  elsewhere. Only explicit `init --apply` may create it; status, verification,
  previews, exports, and runner opens fail closed when it is absent or lacks the v4
  campaign schema. Tests inject isolated paths through the test-only library entry
  point.
- A batch opens only for a registry phase with positive candidate, physical-call,
  and USD caps. Null/missing call or USD caps fail closed. The registry is re-read
  before every new authorization; reservation-time registry hash/caps are pinned.
- Concurrent batches cannot reserve more phase or global capacity. Finalized
  batches retain used slots, actual calls, and conservative effective cost while
  releasing only unused allocation.
- Call authorization is persisted before the callback. Idempotent replay returns
  `shouldExecute=false`; session runners throw `CallReplayPreventedError` without
  invoking the physical callback again.
- Actual cost overruns are retained and breach the batch. Unresolved crash leases
  retain their reservations. A batch cannot finalize until every call has a final
  billing observation. Delayed absolute usage/cost reconciliation is append-only,
  cannot downgrade final usage to non-final, and cannot replace an already-bound
  provider request ID.
- An open batch's phase-level cost commitment is the greater of its allocated USD
  cap and its effective observed cost, so an overrun blocks sibling batches instead
  of being hidden by the original allocation.
- Every mutation emits typed, transactionally linked SHA-256 audit events. Export
  backs up SQLite first, derives JSON from the backup, and writes a hash manifest.
- SQLite uses WAL, `synchronous=FULL`, foreign keys, `BEGIN IMMEDIATE`, and a busy
  timeout. Timestamps are strict UTC ISO-8601; strict `+09:00` is accepted only for
  validated imported metadata.

The store schema is version 4. Opening a v3 store fails with
`SCHEMA_MIGRATION_REQUIRED`; there is intentionally no implicit migration. Do not
initialize the canonical store until phase/call/USD preregistration and provider
wiring are reviewed.

## CLI

All mutations are previews unless `--apply` is supplied. `--store`, `--ledger`, and
environment store overrides are unsupported. Run `--help` for full contracts.

```powershell
npx tsx experiments/question-quality-20260715/harness/cli.ts init --dry-run
npx tsx experiments/question-quality-20260715/harness/cli.ts registry-status
npx tsx experiments/question-quality-20260715/harness/cli.ts reserve-batch `
  --experiment-id G-PAIR-001 --phase-id pilot --batch-id pilot-01 `
  --idempotency-key G-PAIR-001:pilot:pilot-01:reserve `
  --candidate-slots 8 --max-provider-calls 24 --max-cost-usd 2.00 --apply
```

The CLI exposes recovery/audit mutations, including `begin-call`, `settle-call`,
`classify-call`, and `finalize-parsed`. Do not construct a generation workflow by
manually sequencing CLI calls.

## Verification

```powershell
npx tsx experiments/question-quality-20260715/harness/test.ts
npx tsx --test experiments/question-quality-20260715/harness/atlas-controller.test.ts `
  tests/unit/atlas-research-fetch-boundary.test.ts
npx tsc --noEmit --pretty false
npx eslint experiments/question-quality-20260715/harness
```

The 25 ledger tests cover the original invariants plus physical retry
lineage, broken/no-output attempts, distinct repair slots, pending gate decisions,
multi-output shortage/overflow, no-candidate identity absence, concurrent candidate
operations, permanent failed slots, schema-version refusal, and physical replay
prevention. They also cover the final-billing barrier, reconciliation identity,
cross-process pre-network reservation, cross-batch propagation of cost/output
overruns, and the prohibition on implicit canonical-store creation.

The controller/boundary suites additionally cover whole-assignment refusal,
permanent no-top-up semantics, exact dynamic-child receipt verification, parent/stage
lineage, semantic overflow quarantine, schema-invalid full-question counting,
clone-first and response-first restart recovery, ambiguous-call no-replay,
append-only evidence, pricing proof expiry, hidden SDK retries, scope escape, and
bounded source-stream cancellation for oversized responses.

## Remaining enforcement boundary

SQLite cannot stop an unrelated script from calling OpenRouter directly. Before any
API phase, production-parity provider wiring must route every physical OpenRouter
request through the session boundary, block direct native `fetch`, and statically
reject alternate provider/ledger paths. Production must supply reviewed parser
implementations for the raw OpenRouter response wrapper. AsyncLocalStorage isolation
and trusted raw-body handoff exist in the boundary, but production
retry/repair/solver/ladder call sites are not wired by this harness-only change.
In particular, dynamic repair/ladder integration is blocked until a trusted
wire-time receipt mint/authorize path replaces caller-supplied receipts.
