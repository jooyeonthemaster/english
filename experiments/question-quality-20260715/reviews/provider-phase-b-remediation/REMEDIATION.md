# Provider Phase B core-harness remediation

- Date: 2026-07-15 KST
- Harness decision: **PASS for the remediated zero-network primitives**
- Campaign decision: **BLOCK — no provider/model campaign and no production-parity claim**
- API counter during this remediation: **0 / 1,000**
- Safety: no provider, model, browser, route, canonical database, or canonical budget-store call. All writable tests used disposable OS-temp SQLite stores and removed them.

## 1. Outcome

The core Phase-B blockers that can be solved inside the harness are now implemented:

1. immutable, self-consistent controller registry and entry records;
2. complete whole-assignment physical-call/candidate/USD admission before root work;
3. frozen parent/stage transitions and per-entry multiplicity;
4. exact static requests plus parent-bound dynamic derivation-receipt verification primitives;
5. durable restart hydration with no replay of ambiguous physical calls;
6. append-only terminal, clone/billing, private raw-body, parser, and semantic-candidate evidence;
7. trusted boundary-to-controller exact response-byte handoff and automatic parser execution for every successful candidate-capable physical response;
8. archived OpenRouter pricing-snapshot verification, maximum endpoint/tier rates, bounded snapshot validity, and conservative request/output cost reservation;
9. adversarial tests for envelope refusal, crash ordering, overflow, schema-invalid semantic candidates, multiple successes, price tampering, and evidence immutability.

This does not make the production generation system ready to spend. The remaining production and external-control blockers are listed in section 8.

## 2. Candidate-cap semantics

Three quantities are deliberately kept separate.

| Quantity | Definition | Reuse rule |
|---|---|---|
| assignment `maxCandidateOutputs` | temporary whole-assignment worst-case ITT opportunity envelope | unavailable to siblings while open; never becomes queue top-up capacity |
| `usedCandidateOutputs` | pre-fetch candidate opportunities actually issued | permanent after issue, including `never_sent` and `unknown_after_send` |
| `observedSemanticCandidates` | every semantic full question found in captured provider bytes | includes full questions inside schema-invalid containers; every hash is retained |

A proved `never_sent` disposition records zero observed semantic candidates and can make physical-call/USD usage final, but does not create a replacement sampling opportunity. An `unknown_after_send` disposition consumes the preregistered maximum opportunity, forbids replay, and keeps billing non-final until reconciled.

Semantic overflow is retained rather than hidden: the parser stores every observed output hash, the batch is breached, the assignment is quarantined, and later campaign authorization halts. A provider can still violate its requested structural schema after the external call; this cannot be physically prevented by a local harness, so the campaign must not run at a boundary where one unexpected response could cross the global semantic ceiling.

## 3. Whole-assignment admission and call contracts

The registry freezes for each entry:

- purpose and candidate capability;
- exact endpoint/model/schema/output shape/cardinality;
- exact request body/prompt hash, or a dynamic derivation contract;
- maximum serialized request-body bytes and maximum output tokens;
- parser artifact and candidate attestation;
- full prompt/gate/ladder/policy/corpus/git/runner provenance;
- per-assignment maximum uses;
- maximum-rate pricing proof.

Registry sealing sums every entry's maximum uses, candidate cardinality, bounded request/input cost, and output cost. Every assignment contract must cover that complete registered graph's worst-case physical-call, candidate-output, and USD totals. A smaller contract is rejected before it can be registered. Runtime request bytes above the frozen bound are rejected before lease/network.

`admitAssignment` then atomically reserves the selected contract against its batch before the first root fetch. Each `beginCall` transaction revalidates the assignment, durable registry/entry hash, transition, parent physical call, entry use count, request/provenance JSON, candidate cardinality, and conservative cost.

The SQLite layer independently rechecks these contracts; it does not rely only on the in-memory controller. Registry content must exactly contain the separately stored self-hashed entries and assignment envelopes. Registry, entry, call-contract, and evidence rows are protected by append-only triggers where mutation is not part of their state machine.

## 4. Dynamic child and parent/stage proof

Static roots retain exact predeclared body and prompt hashes. A model-dependent child does not pretend that future bytes were known in advance. It instead requires a frozen derivation contract containing an artifact hash and allowed parent entries.

The runtime receipt self-hashes:

- derivation contract and artifact;
- parent physical call ID;
- captured parent response-body hash;
- exact derived child body hash;
- exact derived child prompt hash.

Both controller and ledger validate this receipt. The ledger also validates the durable `fromEntryId -> toEntryId` transition and persists `parent_physical_call_id`, transition ID, derivation contract ID, receipt hash, and exact child wire hashes.

Residual execution blocker: the current API validates a content-addressed receipt but has no safe public path that can mint one for a real AI SDK child call. `getCurrentAtlasResearchLineage()` exposes only the latest parent physical-call ID, not the trusted parent response-body hash. The caller also cannot know the SDK's exact serialized child wire body before the fetch boundary parses it. The zero-network receipt test therefore proves the verifier with fixture-known bytes; it does **not** prove call-site execution. Reconstructing parent JSON or guessing SDK serialization would violate response binding.

Dynamic repair/ladder integration must remain blocked until caller-supplied receipts are removed and the trusted boundary, after parsing actual child wire facts, asks the controller to mint/authorize a receipt from the durable parent body, frozen transition, and derivation artifact. That path needs its own zero-network integration test.

## 5. Trusted raw response and parser path

The earlier caller-supplied `responseBody` API was removed. A `generateObject` caller cannot safely reconstruct the original HTTP JSON, and doing so would break response binding.

Inside an active research scope, the fetch boundary now consumes the original response stream with a 16 MiB accumulator cap, hashes the exact bytes, and passes a copied `Uint8Array` directly to the installed controller. It reconstructs the SDK-facing `Response` from those same bytes, avoiding the unbounded unread tee branch that `Response.clone()` can create. An over-limit or read-failed response is canceled, recorded as `body-too-large`/`clone-error`, and never forwarded to the SDK. The no-scope production fast path still returns the exact native promise and response unchanged. The controller:

1. recomputes the body hash;
2. stores the bounded bytes in a private append-only SQLite BLOB row;
3. writes only body hash and byte length to the JSON evidence export;
4. persists terminal and clone/billing evidence in either order;
5. automatically runs the exact registered parser artifact once terminal success and captured bytes both exist;
6. records a parser disposition and every semantic full-question hash atomically with slot classification.

This happens independently for every successful candidate-capable physical response, including multiple successful SDK responses in one logical operation. A successful response cannot be labeled `no_candidate` without its trusted parser disposition. Schema-invalid raw output still counts when the semantic parser identifies a complete question.

If a successful candidate response cannot supply bounded trusted bytes, every reserved slot becomes `unknown_after_send`, the assignment is quarantined, replay remains forbidden, and restart hydration preserves that disposition. Billing still requires explicit reconciliation before closure.

The consistent SQLite backup contains the private BLOB and must be handled as a private research artifact; the JSON snapshot is redacted to hash/length metadata. A retention/encryption policy is still required before external sharing.

## 6. Crash and restart behavior

Open assignments and calls hydrate from SQLite. Terminal and clone evidence are independently durable and can arrive in either order:

```text
clone first -> wait for terminal -> restart -> settle + reconcile + parse
terminal first -> settle on restart -> wait for clone -> restart -> reconcile + parse
lease only -> explicit never_sent or unknown_after_send; never automatic replay
```

HTTP assignment closure requires terminal evidence, clone/body evidence, final usage, terminal candidate classification, and final gate decisions. `unknown_after_send` cannot close while billing is unknown. Completed parser failures remain visible to controller closure rather than disappearing when their observation promise leaves the pending set.

## 7. Pricing proof

Controller construction re-hashes the archived raw OpenRouter snapshot using its capture format, extracts every endpoint and pricing-tier override, and derives the maximum prompt/completion USD rate for the exact model. It also hashes the sorted provider/endpoint/context allow-list. A registry rate below the archived maximum, a changed snapshot, a mismatched allow-list, or a wrong model fails closed.

Pricing contracts additionally require:

- positive input/output USD rates;
- positive server-token overhead;
- safety multiplier greater than 1;
- canonical `validAt` and `validThrough` timestamps;
- a positive validity window no longer than 24 hours;
- admission time inside that window.

The archived snapshot test proves the following all-endpoint maxima:

- `google/gemini-3.5-flash`: input 2.7 USD/1M, output 16.2 USD/1M;
- `google/gemini-3.1-pro-preview`: input 7.2 USD/1M, output 32.4 USD/1M.

These are offline evidence from the archived 2026-07-14 snapshot, not permission to use a stale price in a future run.

## 8. Remaining blockers before any API call

1. **Production wiring is absent.** Root assignments, SDK retries, continuation, candidate repair, solver, and PREMIUM ladder stages still need their real scopes, registry entries, transitions, and reviewed raw-wrapper parser implementations.
2. **The production callgraph proof is stale.** The verifier currently fails on `grammar-premium-ladder.ts` because the live thinking-off change removed the pinned `reasoning-fallback` pattern. Do not reuse the old 648/675/432 envelopes. Recompute and independently review the current graph, then freeze its artifact hash into the real registry.
3. **No direct-provider bypass closure has been demonstrated.** Static scan and route-level integration tests must prove every OpenRouter call crosses the installed boundary and that no native-fetch/alternate-ledger path remains.
4. **No provider-side hard spend ceiling is installed.** Local reservation detects and contains evidence but cannot undo external spend. A project/key ceiling aligned to the phase cap is mandatory.
5. **Pricing must be refreshed at execution time.** The saved snapshot is useful regression evidence but its 24-hour window must not be extended. Refresh, archive, review, and bind the new proof before admission.
6. **No executable dynamic receipt handoff exists.** Remove caller-supplied receipts and add a controller-owned, actual-wire-time mint/authorize path bound to the durable parent body and transition, plus a zero-network integration test. Until then dynamic repair/ladder call sites are BLOCKED.
7. **No route/browser/canonical-DB parity run exists.** Deployment/environment/corpus identity and independent-root behavior still require a zero-network integration rehearsal before a provider pilot.
8. **Provider structural noncompliance remains ex post detectable.** Leave enough global headroom that one maximum admitted response cannot make the semantic total exceed 1,000.
9. **Schema migration is intentionally absent.** The store is v4; older stores fail closed. Do not initialize or migrate the canonical store until the complete production registry and external controls pass a second fresh audit.

Therefore the safe campaign counter remains **0 / 1,000**.

## 9. Verification evidence

Passed on the final source state:

- `npx tsx experiments/question-quality-20260715/harness/test.ts`
  - **25 / 25** ledger v4 tests.
- `npx tsx --test experiments/question-quality-20260715/harness/atlas-controller.test.ts tests/unit/atlas-research-fetch-boundary.test.ts`
  - **36 / 36** tests: 12 controller and 24 fetch-boundary.
- `npx tsc --noEmit`
  - passed.
- targeted ESLint over ledger, controller, controller test, boundary, and boundary test
  - passed with zero errors and zero warnings.
- replacement-character and trailing-whitespace scans over the same implementation/docs
  - no matches.

Expected BLOCK signal:

- `npx tsx experiments/question-quality-20260715/reviews/production-callgraph-bound-audit/verify-callgraph-bound.mjs`
  - failed at the pinned `ladder retries` assertion because current `grammar-premium-ladder.ts` no longer matches the former `reasoning-fallback` pattern.

## 10. Audited SHA-256 values

| Artifact | SHA-256 |
|---|---|
| `harness/ledger.ts` | `39aaf5a3efec66129de0c8cfe557a6cac41c67ab7da9284cbb5687aa2f00cc81` |
| `harness/atlas-controller.ts` | `59c461d77416cd6b42f2f71d6255d6b618c0eb62a3722c279924d528e95d0190` |
| `harness/atlas-controller.test.ts` | `5c32308c8b31c12a946a3242eefbf9602fba2081396203c740f7cba99844fd71` |
| `src/lib/atlas-research-fetch-boundary.ts` | `1c6b2bdcc52e1b70e946c92445b93d48948feb7be3cb23c1620d2408f455e268` |
| `tests/unit/atlas-research-fetch-boundary.test.ts` | `911559cd4a9c0e6515dc9a3b1ba9aaf8c03a5d8238e53b72e9b93dba79e47160` |
| `harness/README.md` | `5a99ec6130bd43c16ea1e4b1512c23157d8b1b36368a76a60b6ecc8b94998786` |
| `harness/CALL-LINEAGE-DESIGN.md` | `7c62c08d2f8813d23c72ceb1ae945f2761dc8432f4d2e29fdad989bb6934f830` |
| raw pricing snapshot file | `4b8c0cf36d3bca226e6ce824fa566ef96e496c384cb37256a987247332cc73e3` |
| archived snapshot's canonical content hash | `9e5557f0fa0c69105ade2668a1c84468b1ab8644b8adab167a8507cdb2a17869` |
| original fresh audit (unchanged) | `56508ddcf924dfb98028c135698a8e87c88fbd7aad62568ebfc1c17fc37009ef` |
