# Provider Phase B fresh-eyes adversarial audit

- Audit date: 2026-07-15 KST
- Decision: **BLOCK — no real provider/model campaign and no production-parity claim**
- Safety constraint observed: no model/API/browser calls, no canonical budget-store initialization, and no database writes outside disposable OS-temp test stores.

## 1. Executive verdict

The new boundary and controller establish several valuable primitives: exact wire matching, a self-hashed in-memory registry, atomic SQLite authorization before network I/O, permanent candidate-slot consumption per candidate-capable physical attempt, and capture of AI SDK hidden retries at the custom-fetch boundary. Those primitives pass their current zero-network tests.

They do **not** yet constitute an executable production-parity research controller. The blocking reasons are:

1. No production generation call site installs the controller, enters a research scope, declares child-stage lineage, or reports parser dispositions. The production provider therefore still takes the intentional no-scope passthrough.
2. There is no whole-assignment reservation. The controller reserves one physical call at a time, so a cap can stop an assignment midway through the production retry/repair policy and censor the estimand.
3. The frozen registry requires exact hashes of every request body and prompt. Model-dependent continuation, repair, solver, and ladder prompts cannot be known before their parent responses, so the current registry cannot represent the audited production graph without either mutating the registry or weakening exactness.
4. Controller lease, response, clone, parser, and parent state is memory-only. A process exit in any response/clone/parser gap leaves durable rows, but the controller cannot hydrate or reconcile them on restart.
5. Parser output is caller-asserted and is not cryptographically bound to the captured response body or to an executable parser artifact. Overproduction can therefore exceed the semantic 1,000-candidate ceiling even though the ledger breaches and halts afterward.
6. The ledger does not durably retain the controller-registry hash/entry, exact wire hashes, full provenance, response-body hash, served model, upstream provider, or raw/upstream cost evidence for each call.
7. The callgraph verifier is currently stale against the live worktree, so its 648/675/432 assignment envelopes cannot presently serve as a pinned admission contract.

Passing unit tests therefore mean “the tested primitives fail closed,” not “Phase B is ready.”

## 2. Requirement matrix

| Requirement | Result | Evidence / reason |
|---|---:|---|
| Registry content self-hash | PASS (primitive) | `sealAtlasControllerRegistry` hashes the canonical draft and `verifyAtlasControllerRegistry` recomputes it (`atlas-controller.ts:244-262`). Exact wire/provenance matching fails closed (`314-345`). |
| Exact endpoint/model/body/prompt/schema/output contract | PASS (static request) | Matching includes purpose, provenance, endpoint/body/prompt/schema hashes, shape, `n`, output cap, and effective model (`322-335`). |
| Candidate-purpose spoof resistance | BLOCK (system) | A caller cannot relabel a request unless a matching registry entry exists, but registry validation defines candidate capability solely as `purpose === "candidate"` (`190-225`). It has no independently hashed parser/call-site semantic manifest and can legally contain a non-candidate entry for a candidate-capable wire contract. |
| Conservative token/cost reservation | BLOCK (hard guarantee) | Body bytes × `n` and max output × `n` are conservative for the serialized request (`357-374`), but fixed overhead may be zero, prices may be zero/stale, `basis` is unhashed free text, and no allowed-provider price snapshot is verified. An underestimate is detected only after spend. |
| Atomic pre-fetch authorization | PASS | `beginCall(..., {apply:true})` runs under `BEGIN IMMEDIATE`, checks call/USD/candidate caps, inserts call/slots/audit, and marks in-flight before returning (`ledger.ts:1369-1393, 1915-2087`). Delegate I/O occurs only after the lease (`atlas-research-fetch-boundary.ts:997-1013`). |
| Hidden SDK retry capture | PASS (primitive) | Boundary test observes the SDK default `maxRetries=2` as exactly three physical fetch leases. Each delegate invocation crosses the same dispatcher. |
| Physical/global identity | PARTIAL | Live-process ordinals and global SQLite `call_id` uniqueness are sound. Memory-only controller maps cannot reconstruct a leased identity after restart; replay is rejected rather than recovered. |
| Response/clone ordering | BLOCK (crash durability) | Clone-first and response-first both work without process loss. Clone evidence is not persisted until after terminal settlement (`atlas-controller.ts:493-515`), and response settlement initially stores zero/unfinished usage (`470-490`). Either crash window loses evidence needed for automatic reconciliation. |
| Candidate parser disposition/count/hash | BLOCK | `recordOperationParseResult` trusts caller-provided producer ID and normalized bytes (`605-669`); no response-body or parser-artifact binding exists. Overflow is detected after generation, not precluded or fully counted. |
| Multi-stage/parent lineage | BLOCK | Parent lookup is memory-only and persists at most the first parsed parent candidate slot (`393-415`). There is no durable parent physical-call ID, allowed stage-transition graph, per-entry use limit, or operation envelope. |
| Batch finalization | PARTIAL | Ledger correctly refuses unresolved calls, open/pending candidates, and unfinished billing (`ledger.ts:2617-2699`). The controller has no integrated recovery/finalize transaction, and `awaitTrackedCloneObservations` is not part of the controller interface or production runner. |
| Preserve production behavior without mid-assignment censoring | BLOCK | Only per-physical-call leases exist. The production graph audit explicitly requires whole-assignment admission, while current worst-case policies can require hundreds of physical calls. |
| Production wiring/bypass closure | BLOCK | Repository search finds scope installation/use and parser recording only in tests and the Phase A boundary documentation. Production generation paths do not invoke them. |

## 3. Blocking findings

### B1 — No executable production integration

`src/lib/atlas-ai.ts` supplies `atlasResearchFetch`, but no production question-generation route/runner invokes `installAtlasResearchFetchController`, `runWithAtlasResearchScope`, `runWithAtlasResearchChildScope`, `recordOperationParseResult`, or `recordOperationNoCandidate`. The boundary deliberately forwards the exact native delegate promise when no scope exists (`atlas-research-fetch-boundary.ts:1099-1108`).

Consequences:

- hidden retries in production are not leased;
- candidate slots/costs are not recorded;
- repair/solver/ladder lineage is absent;
- parser dispositions are absent;
- a successful controller unit test cannot authorize a provider campaign.

Required remediation: wire one independent root operation per production assignment; explicitly wrap structured generation, prompt-JSON fallback, JSON continuation, ladder answer-only/add-decoys/soft repair/hard regeneration, candidate repair, and solver stages; call the parser recorder immediately at each full-candidate parse boundary; add a static bypass scan and an integration test that fails when any OpenRouter fetch occurs outside an installed scope.

### B2 — No whole-assignment capacity lease; mid-policy censoring remains possible

`preFetchLease` calls `BudgetStore.beginCall` for only the next physical HTTP call (`atlas-controller.ts:376-441`). It does not reserve the assignment's remaining physical-call and USD envelope or stage sequence. A sibling assignment can consume the remaining batch capacity after the first call, causing the audited production retry/repair policy to stop halfway.

The production callgraph audit reports repository-default worst cases of 648 fetches for STANDARD KILLER blank, 675 for extended STANDARD grammar, and 432 for PREMIUM ladder grammar. Its own admission requirement is to reserve the complete worst-case envelope before starting an assignment.

Required remediation: add a durable assignment table/lease that atomically reserves worst-case physical-call capacity, candidate-capable-attempt capacity, and conservative USD before the root scope opens. Each physical lease must consume from that assignment lease. Unused capacity may be released only after every child stage, clone, parser disposition, gate decision, and billing reconciliation is terminal. A refusal before assignment start is uncensored; a cap refusal after start is not production parity.

### B3 — The exact-body registry cannot predeclare model-dependent downstream requests

Every entry freezes `wireBodyHash`, `wirePromptHash`, provenance prompt hash, and other exact facts (`atlas-controller.ts:37-65, 322-335`). That is feasible for root prompts assembled entirely from a frozen corpus. It is not feasible for:

- JSON continuation prompts containing a prior partial model response;
- full-candidate repair prompts containing the generated candidate and gate errors;
- solver prompts containing a generated candidate;
- premium ladder stages whose next prompt incorporates answer/decoy output;
- any fallback body derived from a provider error or generated text.

Those hashes do not exist until after the parent response, while the registry is sealed once in the constructor. Generating a new registry after each response would sever one immutable batch contract; preregistering all possible child bodies is impossible.

Required remediation: retain exact endpoint/model/schema/cap matching, but preregister a hashed **transition/derivation contract** for dynamic stages. At runtime, persist the parent response hash, parser/deriver artifact hash, canonical derived-input hash, resulting exact child body hash, and transition ID atomically before the child fetch. The transition state machine and maximum multiplicity must remain frozen even though the derived bytes are not knowable ex ante.

### B4 — Crash/restart safety is fail-stop, not recoverable evidence durability

The controller's leases, operation calls, clone evidence, response evidence, parser state, and parsed candidates live only in maps/sets (`atlas-controller.ts:293-298, 423-440`). On restart:

- replaying the same call reaches durable `beginCall`, receives `shouldExecute=false`, and is rejected (`419-420`);
- a new controller cannot resolve the old lease in `stateFor` (`444-449`);
- no API hydrates an in-flight/settled call from SQLite;
- no API records an operator disposition while proving no network replay occurred.

The most damaging windows are:

1. lease committed → process exits before delegate;
2. delegate returns → clone extracted → process exits before `settleCall` (clone evidence never became durable);
3. response settled → process exits before clone reconciliation;
4. usage reconciled → process exits before parser classification;
5. candidate parsed → process exits before gate finalization.

The ledger correctly blocks finalization, but permanent blocking is not a complete research protocol.

Required remediation: persist terminal HTTP evidence and clone evidence in separate append-only/idempotent rows, each independently writable in either order; hydrate lease/call state on restart; provide explicit `never_sent`, `unknown_after_send`, `http_terminal`, `clone_terminal`, `parser_terminal`, and gate-terminal recovery transitions; never automatically replay an ambiguous call.

### B5 — Parser attestation is nominal and outputs are not bound to the response

The candidate contract accepts any syntactically valid `attestationHash`; the controller never recomputes it from a parser binary/source/schema manifest (`atlas-controller.ts:214-224`). `recordOperationParseResult` then accepts arbitrary normalized strings/bytes from its caller and hashes them (`605-669`). The clone's `responseBodyHash` is ignored by the controller's durable ledger path.

This permits accidental or malicious divergence among:

- the HTTP response actually billed;
- the bytes production parsed;
- the normalized question recorded as the candidate;
- the parser version claimed by the registry.

It also cannot enforce the semantic cap. If one reserved slot yields two full parsed questions, the ledger marks overflow/breach but stores only the reserved identities. The extra full candidate was still generated, so “at most 1,000 generated full-question candidates” is no longer proved.

Required remediation: hash and load a frozen parser/normalizer artifact; parse a preserved response-body artifact or prove a content-addressed link to it; persist parser disposition (`non_json`, `schema_invalid`, `zero_full_candidate`, `parsed_full_candidate`, `overflow`, etc.), count, and every observed full-candidate hash. Only structurally/semantically fixed-cardinality contracts should be admitted near the hard ceiling; otherwise reserve the proven maximum rather than the expected value.

### B6 — Candidate-purpose classification still trusts registry authorship without semantic proof

Exact registry matching prevents an ordinary caller from changing `purpose` and keeping the same entry. However, validation merely requires `candidateProducing === (purpose === "candidate")`. It does not establish that a design/evaluation entry cannot run a full-question parser or return an assembled full question. The `attestationId`/hash is also not a self-verifying parser manifest.

Required remediation: freeze a unique call-site semantic ID, parser/assembler ID, output role, and candidate-capability flag in a separately reviewed manifest; reject duplicate exact wire/transition contracts with conflicting candidate capability; count a deterministic assembly that creates a new full question even if no single upstream response contained the final object.

### B7 — Cost reservation is plausible but not a proved upper bound

The formula charges each request-body UTF-8 byte as an input token, adds fixed overhead, multiplies by `n`, and reserves max output tokens × `n`. For the serialized body, this is intentionally conservative. But registry validation allows:

- zero input/output rates;
- zero fixed overhead;
- arbitrary unhashed `basis` text;
- a safety multiplier of exactly 1;
- no proof that the rate is the maximum across allowed OpenRouter providers/routing outcomes;
- no bound for provider/server-injected tokens beyond the manually selected overhead.

If the estimate is low, `reconcileCallUsage` records a breach only after the external spend has occurred. That is evidence, not a hard USD guard.

Required remediation: freeze and hash a dated price/provider snapshot; use the maximum permitted routing price; justify and test the server-format/token overhead; reject zero prices for paid models; include explicit currency/discount/BYOK rules; combine the local lease with a provider-side project/key spending ceiling. Keep conservative reservation until final billing, and define a polling/reconciliation protocol for responses without final usage.

### B8 — Durable call records omit essential provenance and provider evidence

`preFetchLease` passes the ledger only call kind, stage, model, reserved cost, logical operation/ordinal, optional parent candidate, and candidate count (`atlas-controller.ts:402-416`). It does not persist:

- controller registry hash and entry ID;
- endpoint/body/prompt/schema/canonical request hashes;
- complete prompt/gate/ladder/policy/corpus/git/runner provenance;
- parent physical-call ID;
- response status/body hash;
- served model and upstream provider;
- raw usage cost and upstream inference cost;
- candidate attestation/parser artifact hash.

`reconcileCloneIfReady` retains only token totals, combined cost, and optional generation ID (`493-515`). Thus the ledger alone cannot reproduce which frozen contract governed a candidate or prove that served-model/provider behavior matched the planned stratum.

Required remediation: extend the durable schema with immutable controller-registry/entry and wire/provenance foreign keys plus append-only terminal HTTP, clone/billing, parser, and transition evidence. Include these fields in the audit hash chain and exported manifest.

### B9 — Parent lineage and stage policy are neither complete nor durable

A child parent must exist in the current controller and share the operation, but the ledger receives only `parent.parsedCandidates[0]?.candidateSlotId` (`atlas-controller.ts:393-415`). This loses lineage when the parent is a design/evaluation call, a failed/malformed candidate attempt, or a multi-output call; choosing index zero is ambiguous. There is no frozen transition graph or per-entry/per-stage multiplicity. A registered entry can be repeated until the aggregate batch cap.

Required remediation: persist `parent_physical_call_id` for every child, use an explicit parent candidate output index only when semantically required, freeze allowed `(parent stage, child stage, purpose, model, parser, ordinal range)` transitions, and enforce operation-level maximum counts derived from the current callgraph audit.

### B10 — Batch closure is correctly strict but not controller-owned

The ledger properly refuses to finalize a batch with unresolved calls, unclassified candidates, pending gate decisions, or unfinished usage. This is a strong fail-closed property. However, clone draining is a controller-specific method not present in `AtlasResearchFetchController`, and no orchestration wrapper atomically proves all operation scopes are closed, all tracked clone promises settled, all parser/gate decisions recorded, and then finalizes the batch.

Required remediation: expose one audited controller-owned batch-close protocol. It must stop new root admission, drain all operations/clones, reconcile or explicitly quarantine unknown billing, verify zero unclassified calls/candidates, export evidence, and only then call `finalizeBatch`.

### B11 — The production callgraph artifact no longer verifies the live source tree

Running the pinned verifier failed before arithmetic verification because `question-repair.ts` drifted:

- verifier expected SHA-256: `4cafdb312a4b868c139e04a760006db4db806dec87129ffeb7760490d49bd17c`
- live SHA-256 at audit time: `eaddb8677bafa842314227c9504acc6d65a7fa6981cbf8500c50b6a138d13044`

Therefore the documented `H=3`, `G=27`, `L=81` and assignment envelopes remain important prior evidence, but they are not currently a verified admission bound for this worktree.

Required remediation: finish concurrent source edits, regenerate/re-audit the callgraph from a pinned source snapshot, and make the controller registry/assignment envelope depend on that exact audit hash. Any later source or lockfile drift must fail before controller installation.

## 4. Validated strengths

The following properties are worth preserving:

1. Active-scope requests are snapshotted before asynchronous controller work, preventing request mutation after attestation (`atlas-research-fetch-boundary.ts:581-627`).
2. Endpoint, model, streaming, cardinality, and token-cap mismatches fail before delegate I/O (`629-806`).
3. AI SDK hidden retries cross the same physical-fetch lease boundary.
4. Controller-originated failures are converted to non-provider boundary errors, preventing an SQLite/controller fault from masquerading as a retryable network failure (`237-247`).
5. Same-operation concurrent fetches fail closed rather than corrupting latest-parent lineage (`1099-1145`).
6. Root/child scopes drain started fetches and reject escaped/unawaited fetches (`1180-1314`).
7. SQLite `BEGIN IMMEDIATE` protects cross-process candidate, physical-call, and USD admission.
8. Candidate slots are consumed before network I/O and remain consumed for failed attempts.
9. Parsed candidates require a second accepted/rejected terminal decision.
10. Batch finalization refuses unresolved billing and candidate state.

## 5. Verification performed

### Passed

- `tsx --test experiments/question-quality-20260715/harness/atlas-controller.test.ts tests/unit/atlas-research-fetch-boundary.test.ts`
  - **26/26 passed** (3 controller + 23 boundary tests)
- `tsx experiments/question-quality-20260715/harness/test.ts`
  - **25/25 budget-guard v3 adversarial tests passed**
- `tsc --noEmit`
  - passed
- targeted ESLint on controller, controller test, boundary, and boundary test
  - passed

All SQLite stores used by these tests were created under the OS temp directory and removed by the fixtures.

### Failed as expected for this audit

- `tsx experiments/question-quality-20260715/reviews/production-callgraph-bound-audit/verify-callgraph-bound.mjs`
  - failed on pinned source-hash drift for `question-repair.ts` before it could certify the callgraph.

## 6. Audited artifact hashes

SHA-256 values at the end of the source-inspection/test pass:

| Artifact | SHA-256 |
|---|---|
| `experiments/question-quality-20260715/harness/atlas-controller.ts` | `647519c8df7c692122d2ddfb784e122f89d3e5797740bc80c88a9420fc215884` |
| `experiments/question-quality-20260715/harness/atlas-controller.test.ts` | `57944f3b80eaf996f88e633a80de03eb7d9c90b04e349b3fe47547bb94c1fd99` |
| `experiments/question-quality-20260715/harness/ledger.ts` | `d3a7027cb32026b5e0b38bd0c96eb6e59a7784b93c082a162a2c5ff1f583bda1` |
| `src/lib/atlas-research-fetch-boundary.ts` | `3547805ba2c29d8527ba988482483a13a246c88cfd71b97a7a5ef0aae16188f4` |
| `reviews/production-callgraph-bound-audit/AUDIT.md` | `7b2e7f9d59f311b1e031cc370476364b772c588a794c519b7b8d1be32cff563d` |
| `reviews/production-callgraph-bound-audit/callgraph-bound.json` | `6d4bc14eed634574b77bd27e33fd668d0450714a5535eed6ab2600ed2cd15066` |
| `reviews/production-callgraph-bound-audit/verify-callgraph-bound.mjs` | `49fb58323ef2255ec3c6f52fa3121372b5515f9f4994d550408b3d7b04fc66b9` |
| live `question-repair.ts` that caused verifier drift | `eaddb8677bafa842314227c9504acc6d65a7fa6981cbf8500c50b6a138d13044` |

## 7. Minimum gate to move from BLOCK to a fresh audit

Do not make a provider call until all items below are implemented and pass zero-network adversarial tests:

1. Re-pin the production callgraph and environment; obtain independently reviewed per-assignment physical/candidate/USD envelopes.
2. Add durable whole-assignment admission and stage-transition accounting.
3. Replace impossible predeclared dynamic body hashes with frozen, hashed derivation contracts plus durable exact runtime child hashes.
4. Persist controller registry/entry, full wire/provenance, parent physical lineage, HTTP/clone/billing, parser, and gate evidence.
5. Add restart hydration and explicit no-replay recovery for every crash window.
6. Bind parser/normalizer artifacts and candidate hashes to captured response bytes; prove overflow cannot violate the semantic 1,000 ceiling.
7. Freeze and validate provider pricing evidence and server-token overhead; pair local reservations with a provider-side hard spend ceiling.
8. Wire every production stage and parser boundary; enforce independent root operations for production `Promise.all` assignments.
9. Add controller-owned batch closure and evidence export.
10. Re-run controller/boundary/ledger/callgraph tests plus kill-point, overflow, registry-purpose conflict, dynamic-child, multi-process restart, and mid-envelope refusal tests; then obtain a second fresh-eyes PASS.

Until then, the safe API counter remains **0/1,000**.
