# Phase-C provider and route bypass scan

Snapshot: `2026-07-15`, repository HEAD `467c6d107137a91088d3eba1620ba4036a63d709` plus the Phase-C dirty worktree. Static scan and mocked-fetch execution only; external network and application database access were zero.

## Split verdict

| Layer | Verdict | Exact scope |
|---|---|---|
| Mechanistic policy | **PASS** | Actual Atlas SDK wire emits equal `questions.minItems/maxItems` for sealed counts 1 and 3, retains `provider.require_parameters=true`, and leaves ordinary no-runtime structured/text requests unchanged. |
| Engine-entry route parity | **PASS — one registered case only** | The sealed harness calls the real `runQuestionGenerationWithEmptyRetry` path for one STANDARD `BLANK_INFERENCE` question, through the production prompt/schema/model/SDK/fetch seam. A mocked masked-400 produces one strict structured call, zero prompt-JSON calls, one terminal `no_candidate`, and a closed assignment. |
| Workbench HTTP/Trigger parity | **BLOCK / unproved** | The harness does not execute route auth, request parsing, Trigger transport, queueing, persistence, or set-member orchestration. |
| Full generator parity | **BLOCK** | Retained non-latest parents, multiple returned questions, real billing reconciliation, successful downstream repair/solver/ladder branches, all question types, and live provider acceptance remain outside this proof. |

These verdicts must not be collapsed into one PASS.

## Current transport graph

```text
/director/workbench/questions/generate
  -> fast route or Trigger task
  -> runQuestionGenerationWithEmptyRetry
  -> runQuestionGeneration
  -> generateWithRetry / candidate repair / solver / grammar ladder
  -> generateQuestionObject or direct generateObject
  -> atlasChatModel
  -> atlasCloud.chatModel
  -> atlasResearchFetch
```

The fresh scan found no direct OpenRouter REST helper or alternate provider constructor in the audited Workbench closure. `atlas-ai.ts` remains the sole `createOpenAICompatible` constructor and installs `atlasResearchFetch`.

## Phase-C opt-in seam

1. `QuestionGenerationCallsiteAdapter` derives `expectedQuestionsPerStructuredCall` from candidate contracts in its sealed registry. It rejects missing or inconsistent counts.
2. `runWithQuestionGenerationResearchRuntime` validates that count as a positive safe integer and copies it into the frozen ALS capability.
3. `buildResearchAwareQuestionResponseSchema` accepts only a question schema, never a caller count. With no runtime it returns the prior unbounded `questions[]`; with a runtime it applies `.length(sealedCount)`.
4. Both `getAiResponseSchema` and the alternate `QUESTION_SCHEMAS` wrapper use that shared builder.
5. `atlasCloud.transformRequestBody` adds `provider.require_parameters=true` only when the active research runtime and an actual `json_schema` response format are both present. It preserves any preregistered provider fields.
6. When a structured provider error is eligible for ordinary prompt-JSON fallback, the research path records an ITT no-candidate and never enters that unconstrained network branch. Ordinary no-runtime fallback remains intact.

## Negative controls

The actual-wire test proves all three controls:

- ordinary `getAiResponseSchema("BLANK_INFERENCE")` still accepts `{ questions: [] }`, and its wire has neither `minItems/maxItems` nor a `provider` field;
- a research plain-text request receives no `require_parameters` field; and
- invalid sealed counts reject before the callback or fetch runs.

The campaign runner also rejects a production plan count that differs from the adapter's sealed count before assignment admission.

## Why the route proof is narrow

The exact research request is first compiled with a zero-network capture runtime, then sealed into the controller registry before an independent replay through the actual engine entrypoint. The replay's exact body hash must match. This proves the production code route and registry enforcement for that fixture; it is not evidence that a live OpenRouter endpoint accepts the schema or that every prompt can be preregistered safely.

The test uses the controller's isolated temporary test ledger and deletes it. It never opens Prisma, the application database, or an external database.

## Remaining bypass/block conditions

1. The experimental runner lives under `experiments/`; no production HTTP/Trigger route installs it.
2. A forced prompt-JSON type is intentionally not route-equivalent in research mode because its semantic output count is not structurally attested.
3. A child derived from a retained older candidate still conflicts with the latest-physical-parent rule.
4. Multi-question success can interleave children and create the same non-latest-parent problem even though count `N` is now present on the wire.
5. `unknown_after_send` terminalizes candidate accounting but leaves assignment billing open; Phase C does not manufacture closure.
6. A single mocked masked-400 case does not prove successful parse, gate, repair, solver, ladder, salvage, or every registered type through the actual engine entrypoint.

## Reproduction scan

```powershell
$scope = @(
  'src/app/api/workbench/ai-jobs/question-generation',
  'src/trigger/workbench-question-generation.ts',
  'src/app/api/ai/generate-questions-auto',
  'src/lib/question-generation-llm.ts',
  'src/lib/korean/quality/solver-gate.ts',
  'src/lib/atlas-ai.ts'
)

rg -n 'openrouter\.ai|/chat/completions|atlas-chat-rest|postAtlasChatCompletion|createOpenAICompatible|createOpenAI|createGoogleGenerativeAI|createAnthropic|atlasChatModel|atlasResearchFetch' $scope

rg -n 'runQuestionGenerationWithEmptyRetry' `
  src/app/api/workbench/ai-jobs/question-generation `
  src/trigger/workbench-question-generation.ts `
  src/lib/question-sets/generate-set.ts `
  src/lib/korean/sets/generate.ts `
  experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts

rg -n 'buildResearchAwareQuestionResponseSchema|require_parameters|hasQuestionGenerationResearchRuntime' `
  src/lib/question-ai-schemas-mc.ts `
  src/lib/question-generation-research-schema.ts `
  src/lib/atlas-ai.ts `
  src/lib/question-generation-llm.ts `
  src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts
```
