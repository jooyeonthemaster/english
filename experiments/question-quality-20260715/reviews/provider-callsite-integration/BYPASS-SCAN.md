# Atlas/OpenRouter bypass scan

Snapshot: `2026-07-15T05:21+09:00`, repository HEAD `467c6d107137a91088d3eba1620ba4036a63d709`, including the then-current dirty Phase-B working tree. This was a static plus mocked-transport, zero-external-network audit. No API or canonical database was used.

## Verdict

| Claim | Result | Reason |
|---|---|---|
| Every Atlas/OpenRouter HTTP call in the current Workbench single-question engine crosses `atlasResearchFetch` | **PASS** | All reachable SDK calls use `atlasChatModel`; `atlasChatModel` is `atlasCloud.chatModel`; `atlasCloud` installs `fetch: atlasResearchFetch`. No direct OpenRouter URL, REST helper, alternate provider constructor, or global provider `fetch` was found in the enumerated closure. |
| The opt-in callsite hooks cover the engine's structured call, prompt-JSON fallback, JSON repair, candidate repair, KO/grammar solver, and premium grammar ladder variants | **PASS (static routing)** | Each call either goes through `generateQuestionObject`'s stage wrapper or the ladder's explicit stage wrapper. KO and grammar solvers are explicit evaluation children; forced candidate-repair JSON remains in the repair-specific stage. |
| The fixed-cardinality structured policy is executable through the real boundary/runtime/adapter stack | **PASS (mechanistic only)** | The zero-network callsite tests instantiate `QuestionGenerationCallsiteAdapter` with a sealed exact/derived registry and prove root/repair, retry-root, ladder fallback, correlation, terminalization, timeout recovery, and strict-to-prompt-JSON fail-closed behavior. |
| A full production-parity Phase-B assignment is presently runnable from an exact concrete registry/campaign entrypoint | **BLOCK** | Production `questions[]` schemas remain unbounded; `json_object`/plain-text fallback does not prove semantic cardinality; no sealed campaign runner installs a corpus-specific registry around the actual engine; and retained non-latest-parent/multi-candidate branches are not representable by the present latest-parent boundary. |
| Every other question-related API in the repository is Phase-B callsite-enabled | **BLOCK / out of this closure** | Legacy `/api/ai/generate-question` has a local direct wrapper branch, and `/api/ai/generate-questions` calls the SDK directly. They still cross the transport boundary through the Atlas model, but do not prove the production callsite/candidate-finalization contract. |

Overall: **PASS for transport closure and fixed-cardinality structured mechanistic enforcement; BLOCK for full production-parity Phase-B execution.** These are deliberately separate verdicts.

## Actual Workbench graph

```text
/director/workbench/questions/generate
  -> GeneratePageClient
     -> POST .../question-generation/fast
        -> runQuestionGenerationWithEmptyRetry
     -> POST .../question-generation
        -> Trigger task -> runQuestionGenerationWithEmptyRetry
     -> POST .../question-set or .../korean-question-set
        -> per-member runQuestionGenerationWithEmptyRetry

runQuestionGenerationWithEmptyRetry
  -> runQuestionGenerationResearchOperation
     -> generateWithRetry -> generateQuestionObject
        -> structured generateObject
        -> prompt-JSON generateText
        -> JSON-repair generateText
     -> repairQuestionCandidate -> generateWithRetry
     -> KO solver / grammar solver -> generateQuestionObject
     -> premium grammar ladder -> direct generateObject

every provider leaf above
  -> atlasChatModel(modelId)
  -> atlasCloud.chatModel(...)
  -> createOpenAICompatible({ fetch: atlasResearchFetch })
```

## Callsite inventory

| Leaf / entry | Evidence | Boundary route | Finding |
|---|---|---|---|
| Fast Workbench request | `use-generation-handlers.ts:199`; `fast/route.ts:509` | common engine | Covered |
| Trigger-backed Workbench request | `use-generation-handlers.ts:150`; `workbench-question-generation.ts:268` | common engine | Covered |
| English/Korean set member | `generate-set.ts:451`; `korean/sets/generate.ts:192` | common engine per member | Transport covered; campaign must install one frozen assignment per member |
| Structured question call | `question-generation-llm.ts:352-353` | `atlasChatModel` | Covered |
| Prompt-JSON fallback | `question-generation-llm.ts:679-680` | `atlasChatModel` | Covered |
| JSON repair | `question-generation-llm.ts:822-823` | `atlasChatModel` | Covered |
| Text helper | `question-generation-llm.ts:887-888` | `atlasChatModel` | Transport covered; not reachable from the audited Workbench question engine |
| Premium grammar ladder | `grammar-premium-ladder.ts:536-537` | `atlasChatModel` | Covered by explicit ladder stages |
| KO solver | `korean/quality/solver-gate.ts:109-113` | `generateQuestionObject` -> `atlasChatModel` | Explicit `question.solver` evaluation child |
| Grammar solver | `grammar-solver-gate.ts:98-102` | `generateQuestionObject` -> `atlasChatModel` | Explicit `grammar.solver` evaluation child |
| Provider construction | `atlas-ai.ts:433-440,461-462` | `atlasResearchFetch` | Single transport seam |

The whole-assignment wrapper encloses repeated strict/relaxed/scarce/salvage operations, and later root attempts require a derived repeat entry (`question-generation-callsite-adapter.ts:130-183,222-298`). The adapter test instantiates a sealed registry and proves this behavior with a mocked transport. It does not claim the still-unbounded production schemas are admissible.

## Uncovered or deliberately excluded paths

1. Concrete adapter construction exists only in the zero-network test fixture. There is still no corpus-specific, sealed production campaign runner that installs it around an actual `runQuestionGenerationWithEmptyRetry` invocation.
2. The Workbench page also exposes set generation. The common provider closure is safe, but a set request contains multiple independently scored questions; it must not be wrapped as one one-question assignment. The campaign entrypoint must install a fresh frozen assignment around each member call.
3. Sibling/legacy question APIs are transport-safe because their models ultimately use Atlas, but they are not part of the exact current Workbench fast-path Phase-B contract. They must fail closed or receive separate adapters if admitted to a campaign.
4. Production `getAiResponseSchema()` and alternate response schemas use `questions: z.array(...)` without equal `minItems`/`maxItems`; `Output.json()` is only `json_object`; prompt-JSON fallback is plain text. None establishes semantic candidate cardinality.
5. In an admitted research assignment, a strict-schema failure may not silently downgrade to prompt JSON. The mocked-transport test proves the fallback request is rejected before a second provider call. This is an ITT failure, not production fallback parity and not a conservative-envelope implementation.
6. The controller currently requires a child's parent to be the latest physical call. A retained older candidate after a failed ladder repair, or interleaved children for multiple returned questions, therefore remains fail-closed until a safe non-latest/multi-parent lineage design exists.
7. Pricing freshness and provider billing reconciliation remain independent gates. In particular, `unknown_after_send` terminalizes the candidate slot but intentionally leaves the assignment open until billing becomes final.

## Reproduction commands

Run from the repository root:

```powershell
rg -n 'question-generation/fast|question-generation|question-set|korean-question-set' 'src/app/(director)/director/workbench/generate'

rg -n 'runQuestionGenerationWithEmptyRetry' `
  src/app/api/workbench/ai-jobs/question-generation/fast/route.ts `
  src/trigger/workbench-question-generation.ts `
  src/lib/question-sets/generate-set.ts `
  src/lib/korean/sets/generate.ts

$scope = @(
  'src/app/api/workbench/ai-jobs/question-generation',
  'src/trigger/workbench-question-generation.ts',
  'src/app/api/ai/generate-questions-auto',
  'src/lib/question-generation-llm.ts',
  'src/lib/korean/quality/solver-gate.ts',
  'src/lib/atlas-ai.ts'
)
rg -n 'fetch\(|generateObject\(|generateText\(|streamText\(|createOpenAICompatible|createOpenAI|createGoogleGenerativeAI|createAnthropic|atlasChatModel|atlasResearchFetch|postAtlasChatCompletion' $scope

rg -n 'openrouter\.ai|/chat/completions|atlas-chat-rest|postAtlasChatCompletion' `
  src/app/api/workbench/ai-jobs/question-generation `
  src/trigger/workbench-question-generation.ts `
  src/app/api/ai/generate-questions-auto `
  src/lib/question-generation-llm.ts `
  src/lib/korean/quality/solver-gate.ts

rg -n 'new QuestionGenerationCallsiteAdapter|runWithQuestionGenerationResearchRuntime' `
  src experiments/question-quality-20260715
```

The fifth command should find adapter construction only in the zero-network harness test, not in a production campaign runner. Any future direct provider result in the fourth command, or any provider leaf not using `atlasChatModel`, changes the transport verdict to **BLOCK**. A production runner appearing without exact fixed cardinality and a sealed registry does not change the production-parity verdict to PASS.
