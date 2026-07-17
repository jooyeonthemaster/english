# AI SDK provider fetch-boundary probe results

Date: 2026-07-15  
Runtime: Node.js 24.7.0  
Resolved packages: `ai@6.0.99`, `@ai-sdk/openai-compatible@2.0.56`  
External API/DB/browser calls: **0**

## Reproduction result

Command:

```powershell
.\node_modules\.bin\tsx.cmd --test experiments/question-quality-20260715/probes/provider-fetch-boundary.probe.mjs
```

Observed result:

```text
tests 6
pass 6
fail 0
```

The probe uses an in-memory custom `fetch` and the reserved
`https://mock.invalid/v1` host. It does not read environment variables and
cannot fall through to a real provider.

## Proven behavior

| Case | Logical SDK call | Custom-fetch observations | Result |
|---|---:|---:|---|
| HTTP 503, HTTP 503, success; `maxRetries` omitted | 1 | 3 | all physical attempts visible |
| network error, network error, success; `maxRetries` omitted | 1 | 3 | all physical attempts visible |
| retryable HTTP 503; `maxRetries: 0` | 1 | 1 | retries disabled exactly |
| malformed 200 JSON + successful repair provider call | 1 outer call | 2 | original and repair both visible |
| same repair without an explicit child ALS scope | 1 outer call | 2 | both inherit `candidate_generation`; purpose is ambiguous |
| two concurrent logical operations | 2 | 2 | ALS operation IDs remain isolated |

The custom provider `fetch` is therefore the correct boundary for observing
every invocation made by the AI SDK retry loop. `ai` performs retries around
`model.doGenerate`; each retry calls `postJsonToApi` again, and
`@ai-sdk/openai-compatible` passes its configured `fetch` into every such
request.

Two details matter:

1. `generateObject` defaults to `maxRetries = 2`, which means **up to three
   physical provider requests**, not two total attempts.
2. malformed assistant JSON is parsed only after the successful provider call.
   It does not trigger that transport retry loop. `experimental_repairText`
   makes a distinct nested provider call if its callback uses a model.

## Response-clone result

The probe clones each `Response` before returning the untouched original to
the SDK. The clone and the SDK both parsed the body successfully. Across the
malformed-output/repair case the boundary captured both response records:

| Purpose | Response ID | Prompt tokens | Completion tokens | Cost (USD) |
|---|---|---:|---:|---:|
| candidate generation | `gen-malformed-candidate` | 13 | 2 | 0.0013 |
| JSON repair | `gen-json-repair` | 17 | 5 | 0.0027 |

This proves that non-streaming OpenRouter-shaped `id`, `usage`, and
`usage.cost` fields can be extracted from a clone without consuming the body
needed by the SDK.

It also proves an accounting gap above the boundary: the final
`generateObject` result reported only the original call's 13 input and 2
output tokens. The nested repair call's 17 input and 5 output tokens were not
aggregated into the outer result. Production's `repairPremiumJsonOutput`
similarly returns only repaired text, so its call cannot be recovered from the
outer `atlasUsageWithCost(result)` event. A fetch-boundary ledger can retain it.

## Current production call graph implications

This is a capability proof, not a claim that production already records the
physical calls. `src/lib/atlas-ai.ts` currently constructs `atlasCloud` without
the optional `fetch` setting, so no physical-call hook is installed.

### General question generation

`src/lib/question-generation-llm.ts` has two retry layers:

- `generateQuestionObject` defaults its application loop to
  `GEMINI_QUESTION_MAX_RETRIES`, currently 2, hence up to 3 outer attempts.
- Its inner `generateObject` omits `maxRetries`, so every outer attempt can
  itself make up to 3 physical requests.

Consequences, ignoring deadline termination:

- retryable transport/provider failure can make up to **9 physical requests**
  while the returned/logged `attempts` field represents at most 3 outer
  attempts;
- a successful malformed PREMIUM response followed by a repair call that
  uses all three SDK attempts can consume 4 physical calls per outer attempt,
  or up to **12** over the application loop;
- forced JSON fallback can use up to 3 generation requests plus 3 repair
  requests per outer attempt, or up to **18**;
- a masked/compiled-grammar structured-output failure followed by the full
  fallback and repair chain can reach 1 + 3 + 3 calls per outer attempt, or an
  upper bound of **21** when each outer attempt remains invalid and retries.

Those are path upper bounds, not expected averages. They show why a wrapper
around `generateQuestionObject` cannot enforce an exact physical/candidate
budget.

### Premium grammar ladder

`fireOnce` in
`src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts` also
calls `generateObject` without `maxRetries`. One `GrammarPremiumLadderCall`
record may therefore conceal up to three physical requests. On top of that,
`callLadderModel` can create a second `fireOnce` for a parse retry or a separate
reasoning fallback. The current `calls` array and `onModelUsage` callback are
logical-call telemetry, not a physical request ledger.

## AsyncLocalStorage: what works and what does not

The probe proves that ALS context survives AI SDK retry promises and remains
isolated under concurrent operations. A provider-boundary event can reliably
inherit an `operationId` and allocate an operation-local physical ordinal.

ALS cannot infer semantic lineage by itself. In the no-hook repair test, the
repair request correctly inherited the outer operation but was indistinguishable
from another candidate-generation request. The following explicit hooks are
required:

1. Enter an operation scope before the production-equivalent generation flow.
2. Enter a child purpose scope around PREMIUM JSON repair, prompt-inlined JSON
   fallback, ladder answer-only/add-decoys/repair calls, solver calls, and
   evaluator calls.
3. Pass `expectedCandidateOutputs` and a parent slot/call ID in the scope; the
   fetch boundary cannot infer how many full candidates a prompt requests.
4. Reserve candidate slots atomically **before** delegating to the real fetch.
   A network error or non-2xx response then closes the reservation as
   `no_candidate` instead of refunding an unobservable attempt.
5. Add a post-SDK parse/validation hook. HTTP status and raw JSON do not tell
   whether Zod parsing succeeded or which parsed candidates were accepted.
6. Track clone-reading promises and await them before a batch can close, or
   final cost/ID events can race ledger finalization.

## Adversarial limitations

- The hook sees every call to the configured custom `fetch`, not retries hidden
  inside a future custom delegate/proxy library. The proposed delegate should
  be native fetch with no additional internal retry layer.
- Calls through another provider instance, direct `globalThis.fetch`, or a
  different HTTP client bypass this hook. Experiment mode needs a static scan
  plus fail-closed behavior for missing scope on candidate-producing routes.
- A 200 OpenAI-compatible envelope may still contain malformed assistant JSON
  or a provider error payload. Fetch-level success is not candidate validity.
- `Response.clone()` tees the body and can double transient memory pressure.
  Question generation is non-streaming, but SSE/streaming needs a separate
  parser and must not be assumed equivalent.
- Storing raw bodies would retain passage/question content. The ledger should
  persist only a content hash and minimum billing/lineage fields after parsing.
- If an abort happens after slot reservation but before a response, it still
  needs a terminal `no_candidate` event. An abort before `fetch` is invoked has
  no physical event.
- Some responses may omit `usage.cost`; the boundary can record `cost_unknown`
  but must not silently convert that to zero.

## Integration recommendation

Keep production behavior identical during research: do not set
`maxRetries: 0` merely to make counting easier. Instead, install a narrowly
scoped fetch dispatcher in the shared Atlas/OpenRouter provider configuration:

- no active research scope: delegate unchanged;
- active design/evaluation scope: record a zero-candidate physical call;
- active candidate-producing scope: lease the declared candidate slots before
  network I/O, record response/error metadata, and attach the later parse
  disposition;
- active scope missing required lineage: fail closed before network I/O.

An alternative is a research-only provider factory, but it must reuse the exact
production transform, headers, metadata extractor, model normalization, and
reasoning configuration. Duplicating those private options would create parity
drift. Refactoring the common provider options into one factory is safer than a
global fetch monkey patch.
