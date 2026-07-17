# Current question-generation call-graph envelope audit

Snapshot: 2026-07-15 KST. Current dirty worktree at Git HEAD `467c6d107137a91088d3eba1620ba4036a63d709`.

## Outcome

The ordinary production runtime has **no finite, source-provable absolute per-assignment upper bound**. Both application retry controls accept arbitrary positive integers, and no deployment values were read in this audit. The numeric table below is therefore a conservative **repository-default diagnostic**, not a deployed-configuration attestation.

The research exact-structured runtime has a sound fixed-cardinality wire mechanism, but the requested four-cell operational envelope is **BLOCKED**. The current Phase-C executable evidence covers only one `STANDARD / BLANK_INFERENCE / masked-400` fixture. There is no sealed operational registry for all `STANDARD|PREMIUM × BLANK_INFERENCE|GRAMMAR_ERROR` roots, repeats, ladder children, candidate repairs, scarce/salvage passes, and solvers.

Under repository defaults (`R=2` application retries, `E=2` empty-result input, AI SDK hidden retries `=2`), one subtype and `count=1`, the current source-derived diagnostics are:

| Runtime/policy | Plan / type | Candidate-capable logical responses | Evaluation-only logical responses | Design-only logical responses | Physical provider fetches |
|---|---|---:|---:|---:|---:|
| Ordinary production | STANDARD / BLANK_INFERENCE | 216 | 0 | 0 | **648** |
| Ordinary production | PREMIUM / BLANK_INFERENCE | 54 | 0 | 0 | **162** |
| Ordinary production | STANDARD / GRAMMAR_ERROR | 162 | 63 | 0 | **675** |
| Ordinary production | PREMIUM / GRAMMAR_ERROR | 96 | 18 | 12 | **378** |
| Research exact, hypothetical complete registry | STANDARD / BLANK_INFERENCE | 72 | 0 | 0 | **216** |
| Research exact, hypothetical complete registry | PREMIUM / BLANK_INFERENCE | 18 | 0 | 0 | **54** |
| Research exact, hypothetical complete registry | STANDARD / GRAMMAR_ERROR | 54 | 21 | 0 | **225** |
| Research exact, hypothetical complete registry | PREMIUM / GRAMMAR_ERROR | 48 | 6 | 12 | **198** |

The research rows are arithmetic for the current source policy if every exact stage were preregistered; they are **not authorization and not a currently executable campaign registry**.

No external network/API call, database call, browser call, or secret/environment-value read was performed. Only the audit artifact directory was written.

## Counting convention

- A **logical candidate response** is one explicit AI-SDK `generateObject`/`generateText` invocation whose wire can emit a complete student-facing question object. AI-SDK internal retries are not new logical responses.
- A **logical evaluation response** is an explicit solver invocation (including its ordinary fallback/repair responses) that only judges a question.
- A **logical design response** is the premium grammar answer-only stage.
- A **physical fetch** is one request observed at the Atlas custom-fetch boundary. Every SDK retry is distinct.
- Local JSON parsing, Zod validation, post-processing, deterministic gating, pool ranking, and candidate decisions make zero provider calls.

This audit counts response opportunities, not parsed questions. That distinction is material: outside research scope, the response wrapper is `questions: z.array(...)` with no maximum (`src/lib/question-generation-research-schema.ts:12-16`). A single ordinary response therefore has an **unbounded-from-schema semantic candidate cardinality**, even though production later slices the accepted array to the requested count (`run-question-generation.ts:1241-1246`). Research uses `.length(sealedCount)` (`question-generation-research-schema.ts:18-26`).

## Why there is no ordinary absolute bound

`readPositiveIntegerEnv` floors any finite positive value and applies no maximum (`src/lib/concurrency-config.ts:1-9`). It feeds both:

- `GEMINI_QUESTION_MAX_RETRIES`, default 2 (`concurrency-config.ts:133-136`); and
- `GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS`, default 2 (`concurrency-config.ts:137-138`).

The inner wrapper loops `attempt=0..maxRetries` (`src/lib/question-generation-llm.ts:286-286`). STANDARD non-KILLER strict passes use `max(base, requestedMaxAttempts)` with no cap; only PREMIUM strict passes cap at five and STANDARD KILLER grammar caps at four (`run-question-generation.ts:1619-1648`). PREMIUM is still unbounded through the uncapped inner `R`.

A 270/540-second deadline cannot prove a call count: immediately failing/retryable requests can consume calls before the clock expires, and several engine callsites do not supply a deadline. No environment value was inspected to replace this source-level `UNKNOWN` with a configured number.

## Atomic call graph

### Installed SDK retry

The lock resolves `ai@6.0.99`. Its installed runtime defaults `maxRetries` to 2 (`node_modules/ai/dist/index.js:2581-2588,2648-2675`), so one explicit SDK invocation can make three physical fetches. `generateObject` wraps `model.doGenerate` in that retry function (`index.js:9995-9998,10059-10151`); object parsing/repair starts afterward (`index.js:10165-10174`). Thus parse/schema failure does not itself cause an SDK retry, although two earlier retryable provider failures can precede the final parse-invalid response.

The provider package defaults retryable statuses to 408, 409, 429, and 5xx (`node_modules/@ai-sdk/provider/dist/index.js:95-98`). A final 400/masked-400 is not itself retried, but a conservative operation can have earlier retryable failures and then end in that 400 on physical attempt three.

### Ordinary full-schema wrapper

In one application attempt, the longest compatible ordinary route is:

```text
structured generateObject             <= 3 physical fetches
  final masked/compiled 400
prompt-inlined JSON generateText       <= 3 physical fetches
  final non-empty invalid JSON
JSON continuation repair generateText <= 3 physical fetches
                                      ----------------------
                                       <= 9 physical fetches
```

The strict call is at `question-generation-llm.ts:353-382`; masked/compiled fallback is at `407-444`; fallback text generation and client parse are at `640-775`; JSON repair is at `777-864`. With default `A=R+1=3`, one generation, candidate-repair, or solver wrapper has at most:

- 9 explicit logical responses: three structured, three prompt-JSON, three JSON-repair; and
- 27 physical fetches.

PREMIUM `experimental_repairText` (`question-generation-llm.ts:361-372`) does not add on top of that nine-fetch per-application-attempt route: it follows a successfully returned but parse-invalid structured response, while masked provider failure follows the prompt-JSON branch. The latter is the larger compatible route.

### Research exact wrapper

The research runtime seals one positive expected count (`question-generation-research-runtime.ts:89-114`), verifies the plan count before generation (`run-question-generation.ts:417-435`), and uses exact `.length(N)` schemas. Atlas adds `provider.require_parameters=true` only to structured research requests (`src/lib/atlas-ai.ts:463-476`).

At the exact controller boundary, candidate entries must have `structurallyFixedOutputsPerCompletion === candidatesPerCompletion` (`experiments/.../harness/atlas-controller.ts:495-522`). The boundary recognizes equal `minItems/maxItems` as fixed but deliberately treats `json_object` as cardinality-unknown (`src/lib/atlas-research-fetch-boundary.ts:571-620`). Consequently:

- strict structured generation can be an exact candidate stage;
- prompt-JSON text cannot be an exact candidate stage; and
- the `Output.json()` continuation repair cannot be an exact candidate stage.

The current exact arithmetic therefore allows only the strict structured SDK invocation in each application attempt: default 3 logical responses and 9 physical fetches per full-schema wrapper. A repair stage may be attempted after a PREMIUM parse failure, but a valid exact registry must deny it before provider dispatch.

### Current PREMIUM grammar ladder

`fireOnce` directly calls `generateObject` without overriding SDK retries (`grammar-premium-ladder.ts:498-533`). `callLadderModel` allows at most two explicit fires, and the second is only an application-level parse retry (`:561-610`). There is **no current reasoning-fallback fire**.

The maximum ladder is:

- three split cycles: initial plus two hard regenerations;
- three answer-only design stages;
- three add-decoys candidate stages;
- one candidate repair in each cycle; and
- at most two explicit SDK invocations per stage.

That is 6 design responses + 12 full-candidate responses = 18 explicit SDK invocations, or **54 physical fetches**. The loop and reset that permit one repair in each regeneration cycle are at `grammar-premium-ladder.ts:631-635,688-827`.

If the ladder gives up, the same strict pass proceeds through legacy PREMIUM generation (`run-question-generation.ts:1208-1235`), then can use candidate repair and the STANDARD grammar solver. The ladder and legacy path are therefore additive in the worst pass.

## Pass graph and default arithmetic

Let:

- `A=R+1`; repository default `A=3`;
- `H=3` physical fetches per explicit SDK invocation;
- `O=3A=9` ordinary logical responses per full-schema wrapper; and
- `X=A=3` exact-structured logical responses per full-schema wrapper.

Candidate repair is attempted at most once per returned candidate (`run-question-generation.ts:1315-1428`; `question-repair.ts:319-342`). The English grammar solver runs after deterministic acceptance in strict or relaxed mode and always uses the STANDARD plan (`run-question-generation.ts:1520-1570`); scarce/salvage mode skips it.

The outer engine can add:

- STANDARD BLANK: one relaxed pass and one universal salvage generation pass;
- PREMIUM BLANK: one universal salvage generation pass;
- STANDARD GRAMMAR: one relaxed/rescue-class pass, one grammar-scarce pass, and one universal salvage pass; and
- PREMIUM GRAMMAR: one grammar-scarce pass and one universal salvage pass.

Pool admission is local and costs zero. The conservative path uses an empty or non-relaxable pool so the generation passes remain reachable (`run-question-generation.ts:1699-1792,1874-1991`).

Default formulas and substitutions are in `envelope.json`. The important substitutions are:

- STANDARD BLANK: 10 strict + relaxed + salvage = 12 passes; two candidate wrappers per pass: `12 × 2 × O × H = 648`.
- PREMIUM BLANK: 2 strict + salvage = 3 passes: `3 × 2 × O × H = 162`.
- STANDARD GRAMMAR valid-settings worst: 6 strict + relaxed + scarce + salvage = 9 candidate passes, solver on 7 strict/relaxed passes: `(9 × 2O + 7O) × H = 675`. The ordinary five-marker default variant is 513.
- PREMIUM GRAMMAR: two strict passes each contain ladder (54) + legacy generation/repair/solver (81), followed by scarce and salvage (54 each): `2 × 135 + 2 × 54 = 378`.

The corresponding exact-structured hypothetical replaces `O=9` with `X=3` and denies fallback/JSON-repair dispatch, while retaining the exact ladder. It yields 216, 54, 225, and 198 physical fetches respectively.

## Success, failure, empty, and masked-400 checks

The table distinguishes a minimal first success from the maximum rejected-candidate chain. The maximum envelope also covers an eventual final-pass success: the terminal rejected candidate can be replaced by an accepted final candidate without adding a call.

| Runtime | Cell | Minimal first success | Empty-response path | Masked-400, no candidate | Maximum rejected/eventual-success chain |
|---|---|---:|---:|---:|---:|
| Ordinary | STANDARD BLANK | 1 | 12 | 324 | 648 |
| Ordinary | PREMIUM BLANK | 1 | 3 | 81 | 162 |
| Ordinary | STANDARD GRAMMAR | 2 | 9 | 243 | 675 |
| Ordinary | PREMIUM GRAMMAR, ladder eligible | 3 | 8 | 114 | 378 |
| Exact hypothetical | STANDARD BLANK | 1 | 36 | 108 | 216 |
| Exact hypothetical | PREMIUM BLANK | 1 | 9 | 27 | 54 |
| Exact hypothetical | STANDARD GRAMMAR | 2 | 27 | 81 | 225 |
| Exact hypothetical | PREMIUM GRAMMAR, ladder eligible | 3 | 16 | 42 | 198 |

All values are physical fetches under repository defaults and no deadline.

- **Ordinary empty:** `{questions:[]}` is schema-valid, so each top-level pass consumes one fetch and advances without application retry, candidate repair, or solver.
- **Exact empty:** `{questions:[]}` violates `.length(1)`. Each application attempt consumes another strict structured response; PREMIUM's cardinality-unknown JSON repair is denied before dispatch. These are schema failures, not accepted empty results.
- **Ordinary masked 400:** each top-level wrapper can exhaust structured → prompt JSON → JSON repair across all three application attempts. With no parsed candidate, candidate repair and solver never run.
- **Exact masked 400:** `question-generation-llm.ts:411-417` logs an ITT no-candidate and continues/throws only within strict structured attempts. The prompt-JSON callsite at `:418-444` is unreachable while research runtime is active.
- **PREMIUM ladder masked 400:** a non-parse ladder error gives up after the first answer-only fire, then legacy generation runs. This is why the masked ladder row has one design operation per strict pass rather than the ladder's two parse fires per stage.

Exact logical-response breakdowns for every row are serialized in `envelope.json`.

## Phase-C status

The concrete Phase-C runner requires one subtype and a plan count equal to the sealed adapter count, then invokes the real `runQuestionGenerationWithEmptyRetry` (`experiments/.../question-generation-phase-c-runner.ts:22-48`). It does **not** accept or pass an inner `maxRetries` override.

The adapter requires a derived repeat-root entry for outer passes and derived registered entries for every child; an unregistered child throws (`question-generation-callsite-adapter.ts:110-125,245-343`). This is correct fail-closed behavior, but it means a numeric four-cell execution envelope exists only after the complete registry and assignment contracts are sealed.

The current actual-entrypoint fixture sets a test-local application retry value, uses `maxAttempts=1` plus an already-expired deadline, and returns a non-retryable masked 400. It proves exactly:

- STANDARD / BLANK_INFERENCE only;
- one structured physical dispatch;
- zero prompt-JSON dispatches;
- one consumed candidate slot; and
- terminal `no_candidate`.

It does not prove successful parsing, candidate repair, solver, ladder, scarce/salvage, the other plan/type cells, or retryable SDK failures.

The campaign-v4 reduced registry is also not an executable substitute. Its file says `DESIGN_COMPLETE_EXECUTION_BLOCKED`, `modelApiCalls: 0`, and `operationalAuthorization: 0`. It describes SDK `maxRetries=0`, but the actual runner preserves production retry behavior and `readPositiveIntegerEnv` does not permit zero. A one-call controller contract could stop a second SDK fetch, but that is a controller denial after a retry is attempted, not proof that the SDK retry policy was set to zero.

Accordingly:

- the one-cell mechanistic fixture is **PASS within its narrow scenario**;
- all four operational exact cells are **BLOCK**; and
- the hypothetical exact table must not be called an authorized Phase-C registry.

## Current versus prior experiment conclusions

The production, research, test, and installed-package closure was traced before reading prior experiment conclusions. The comparison found a material stale value in the earlier production callgraph audit: it counted a third reasoning-fallback fire in each ladder stage, giving ladder 81 and PREMIUM grammar 432. Current source allows only the two parse fires, so the current ladder is 54 and the default ordinary PREMIUM grammar envelope is **378**. `campaign-v4.json` independently labels the historical 81/432 values stale; that note was confirmation, not the basis of this calculation.

## Type-count separation

The active English UI groups contain **25** types (`src/lib/question-type-ui.ts:308-349`). `TOPIC_MAIN_IDEA` exists in metadata/schema only as a legacy compatibility type (`question-type-ui.ts:110-117`; `question-schemas.ts:24-49,98-105`), so registered English is **26**, not active English 26. The Korean registry contains **38** modules (`src/lib/korean/registry/index.ts:9-74`). Combined registered runtime schemas are 64, but that number must not be described as the English UI surface.

## Shared route overhead excluded from the four cells

The active workbench fast route enforces `count.max(1)` (`src/app/api/workbench/ai-jobs/question-generation/fast/route.ts:69`) and the client emits `count:1` units (`use-generation-handlers.ts:187,411,757`), matching this audit's assignment unit.

The legacy auto route first makes a separate planning `generateQuestionObject` call, then invokes the engine (`src/app/api/ai/generate-questions-auto/route.ts:152-208`). That planner is one shared route-level wrapper and is deliberately excluded from the four per-question assignment cells. Legacy/direct routes with larger or unbounded counts are also outside the count=1 table and reinforce, rather than repair, the absence of a global production cap.

## Reproduction

Zero-network verification completed:

- audit verifier: 1/1 PASS;
- `atlas-ai`, premium-reasoning-off, and fallback-parser unit tests: 7/7 PASS;
- Atlas research fetch-boundary tests: 29/29 PASS, including the installed SDK's three leased physical retries and rejection of `json_object`/unbounded arrays; and
- Phase-C structured-cardinality wire tests: 4/4 PASS.

The DB-using actual-entrypoint Phase-C fixture was inspected and hash-bound but deliberately not re-run, because this audit's execution constraint prohibited database access, including a temporary test ledger. Its narrow prior result is not promoted beyond mechanistic evidence.

Run the zero-network verifier from the repository root:

```powershell
node experiments/question-quality-20260715/reviews/current-callgraph-envelope-audit/verify.mjs
```

It checks source hashes, installed SDK anchors, current call-graph anchors, arithmetic, active/registered type counts, the Phase-C fixture/design status, and `MANIFEST.sha256`. It does not open a database or invoke `fetch`.

Authoritative machine-readable details are in `envelope.json`; the audited closure is in `source-files.json`.
