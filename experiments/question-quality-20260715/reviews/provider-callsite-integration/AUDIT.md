# Provider/callsite integration audit

Snapshot: `2026-07-15T05:23+09:00`, repository HEAD `467c6d107137a91088d3eba1620ba4036a63d709` plus the dirty Phase-B working tree.

## Decision

| Claim | Verdict |
|---|---|
| The current Workbench question engine has one Atlas/OpenRouter transport seam | **PASS** |
| An opt-in, exact-cardinality structured assignment can traverse the real fetch boundary, controller, runtime, and production callsite semantics | **PASS (mechanistic, zero-network)** |
| Strict-schema failure can transparently use production prompt-JSON fallback inside that assignment | **NO — fail-closed ITT failure** |
| The current unrestricted production generator is ready to run as a full-parity Phase-B campaign | **BLOCK** |

The two positive claims are intentionally narrower than production parity. No external API call, production database read/write, or model-routing change was made for this integration. Mock dispatcher invocations in tests are not external provider calls.

## Integrated surface

The opt-in path now covers the actual semantic locations where a full question may be created, replaced, judged, or discarded:

| Production location | Research behavior |
|---|---|
| `src/lib/question-generation-llm.ts` | Structured root, prompt-JSON fallback, and JSON-repair stages are distinct. |
| `src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts` | Carries the selected research stage through production retry helpers. |
| `src/app/api/ai/generate-questions-auto/_lib/question-repair.ts` | Candidate repair is a child of the actual candidate object; only the returned repaired question is correlated. |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts` | Answer-only, answer-regeneration, add-decoys, and repair calls are separately registered; raw candidate identity survives production-only copies. |
| `src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts` and `src/lib/korean/quality/solver-gate.ts` | Solver/evaluator calls derive from the exact question object being judged. |
| `src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts` | One admitted assignment spans strict/relaxed/scarce/salvage retries; production gate outcomes finalize candidates. |
| `src/lib/atlas-ai.ts` | Atlas SDK transport uses `atlasResearchFetch`; when no research scope exists, the late-bound native fetch path is preserved. |

`src/lib/question-generation-research-runtime.ts` is deliberately a narrow ALS capability. Production callers can supply a semantic parent object and stage intent, but cannot mint physical call IDs, response hashes, receipts, budget mutations, or registry entry IDs.

`experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts` maps those intents to a sealed registry. The controller, not the caller, binds a derived child to durable parent response evidence and the actual child wire request.

## Enforced invariants

1. **Whole-assignment admission.** Later outer attempts are derived repeat roots inside the same assignment; they are not silently admitted as independent roots.
2. **Actual parent binding.** Candidate repair, ladder, and solver stages may identify only an observed semantic object. Unknown objects fail before a child provider call.
3. **Wire-derived cardinality.** `n=1` means one completion, not one question. A candidate call is attestable only when the actual JSON schema has equal positive `minItems` and `maxItems` (or an attested non-wrapper root object).
4. **No `json_object` shortcut.** `Output.json()`/`response_format=json_object` proves JSON syntax only and has `structurallyFixedOutputsPerCompletion=null`.
5. **Returned-value correlation.** A production `slice`/`find` subset may be correlated in order. Parser-visible candidates that production did not return are explicitly `parsed_rejected`; substitution is rejected.
6. **Terminal candidate accounting.** Accepted/rejected gates, parser failures, provider failures, operation exceptions, salvage/replacement paths, and timeouts all consume a terminal slot outcome. `unknown_after_send` is terminal for the candidate but keeps assignment billing open for recovery.
7. **Exact opt-out.** Without an installed runtime, the operation/stage wrappers directly return `fn()`; the exported transport resolves the then-current `globalThis.fetch` and preserves promise, response, and synchronous-error identity.

## Strict-to-fallback policy

The production generator may respond to a masked provider 400 or an oversized grammar schema by switching from strict structured output to plain prompt JSON. That branch loses the pre-network semantic question bound.

For the research assignment, this is **not parity**. The zero-network callsite test sends a simulated strict 400, then attempts the prompt-JSON child. Its unstructured wire cannot match the frozen candidate registry, so it is rejected before a second dispatcher call. The assignment records the strict attempt as `no_candidate`. This is an ITT failure. A future campaign must choose one of these preregistered policies:

- fail the assignment when the strict schema is unavailable; or
- implement and prove a separate conservative candidate envelope before enabling the fallback.

Ordinary production fallback remains unchanged outside the opt-in runtime.

## Mechanistic evidence

The zero-network suite proves:

- actual AI SDK wire generated from `z.array(...).length(1)` contains `questions.minItems=1` and `questions.maxItems=1`;
- the request transform retains `provider.require_parameters=true` on that actual wire;
- caller-supplied legacy receipt material is rejected;
- root to candidate-repair lineage uses the actual producer and finalizes both old and new candidates;
- `slice`/`find` returns do not erase parser-visible overflow candidates;
- an unknown derivation object rejects before child network;
- ladder give-up can enter a registered legacy structured child with correct lineage;
- an exception after a ladder result rejects the observed candidate;
- outer retries share one assignment and use a derived repeat root;
- strict-to-prompt-JSON downgrade is blocked before its provider call;
- schema/parser failure becomes `no_candidate`; and
- timeout becomes `unknown_after_send`, with the assignment deliberately left open pending billing finality.

## Why full production parity remains blocked

1. `src/lib/question-ai-schemas-mc.ts:getAiResponseSchema()` and alternate schemas in `run-question-generation.ts` still use unbounded `questions: z.array(schema)`. They do not emit equal `minItems`/`maxItems`.
2. JSON repair uses `Output.json()` and prompt-JSON fallback uses unconstrained text. Neither proves semantic question count.
3. No sealed, corpus-specific campaign entrypoint currently constructs the adapter and wraps the actual `runQuestionGenerationWithEmptyRetry` call. Adapter construction in the harness is evidence of mechanics, not a production campaign runner.
4. The boundary intentionally accepts only the latest physical call as a derived parent. A retained older question after a failed ladder repair, or children interleaved across multiple returned questions, cannot yet be represented safely and therefore fail closed.
5. A multi-question request magnifies both the cardinality and non-latest-parent problem. The proven rehearsal is a fixed-cardinality one-question policy, not an arbitrary `questions[]` policy.
6. `unknown_after_send` requires external billing reconciliation before assignment closure. The harness preserves the recovery state; it does not fabricate zero cost or closure.

## Required production-parity sequence

1. Create a campaign-only one-question schema using `.length(1)`; for a registered `N`, use `.length(N)`. Do not globally mutate normal production fallback behavior as an incidental research change.
2. Freeze the actual root/child schemas, prompt/body hashes, parser artifact, model, endpoint, prices, maximum uses, and allowed transitions in a corpus-specific registry.
3. Decide preregistered strict-fallback handling: ITT failure or a separately proved conservative envelope.
4. Design a controller-authorized retained-parent/multi-parent mechanism, or preregister a campaign topology that forbids every affected branch.
5. Install one fresh assignment per generated question/set member from a sealed runner, then rerun the bypass scan against that exact entrypoint.
6. Only after all above gates pass may a production API campaign begin under its separate candidate/cost budget.

## Verification record

Run from the repository root:

```powershell
.\node_modules\.bin\tsx.cmd --test `
  tests/unit/atlas-research-fetch-boundary.test.ts `
  experiments/question-quality-20260715/harness/atlas-controller.test.ts `
  experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts

.\node_modules\.bin\tsx.cmd experiments/question-quality-20260715/harness/test.ts

.\node_modules\.bin\eslint.cmd `
  src/lib/atlas-research-fetch-boundary.ts `
  src/lib/question-generation-research-runtime.ts `
  src/lib/question-generation-llm.ts `
  src/lib/atlas-ai.ts `
  src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts `
  src/app/api/ai/generate-questions-auto/_lib/question-repair.ts `
  src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts `
  src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts `
  src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts `
  src/lib/korean/quality/solver-gate.ts `
  experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts `
  experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts
```

See `BYPASS-SCAN.md` for the enumerated Workbench transport graph. The sibling `verify.ps1` reruns the zero-network evidence and freezes the known production-parity blocker signals.

Recorded result for this snapshot:

- combined boundary/controller/callsite suite: **52/52 PASS**;
- budget-guard harness: **25/25 PASS**;
- targeted ESLint over the twelve files listed above: **PASS**;
- global `tsc --noEmit --pretty false`: **PASS** after the concurrent sibling review fix;
- external provider calls: **0**.
